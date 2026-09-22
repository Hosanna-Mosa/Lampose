/* ══════════════════════════════════════════════════════════════════════════
   Secrets in the Keychain (iOS) and the Keystore-backed store (Android).

   A session token used to live in `AsyncStorage`, which is a plain SQLite file
   in the app's sandbox. On a device nobody has tampered with that is private
   to this app — but it is readable from an ADB backup, from a rooted handset,
   and from a forensic pull of a stolen phone, and the token it held was good
   for seven days. `expo-secure-store` hands the value to the platform instead:
   the iOS Keychain, and on Android an AES key held in the Keystore, which is
   hardware-backed on devices that have a TEE.

   ## Only secrets go here

   `SecureStore` caps a value at 2048 bytes on Android, and it is slower than
   AsyncStorage because every read crosses into the platform keystore. A token
   is ~300 characters and read once per launch; a rider's cached job, profile
   and earnings are neither small nor secret. So this module moves the TOKEN
   and nothing else, and everything else stays exactly where it was.

   ## Nobody is signed out by this arriving

   `getSecret` falls back to the old AsyncStorage key, and promotes what it
   finds: the value is written to the secure store and the plaintext copy is
   deleted. A user who updates mid-session keeps their session and quietly ends
   up with it stored properly. That migration is the whole reason this is a
   module rather than three calls to `SecureStore` at the call sites.

   ## Web

   `SecureStore` is native-only and throws in a browser. Expo Router builds
   these apps for web during development, so every entry point falls back to
   AsyncStorage there. A browser has no keystore to use; pretending otherwise
   would take the web build down for a guarantee it cannot make either way.
   ══════════════════════════════════════════════════════════════════════════ */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

/*
 * SecureStore keys may only contain letters, digits, `.`, `-` and `_`.
 * The keys these apps already use carry `@` and `/` (`@lampose/session`), so
 * they are mapped rather than passed through — and the mapping is stable, so
 * it resolves to the same entry on every launch.
 */
const secureKey = (key: string) => `secure_${key.replace(/[^A-Za-z0-9.\-_]/g, '_')}`;

/**
 * Read a secret, promoting it out of AsyncStorage the first time.
 *
 * Returns null when there is nothing stored anywhere. Every failure path
 * returns null rather than throwing: a keystore that will not open is a user
 * who has to sign in again, which is survivable — an exception here happens
 * during boot and takes the whole app down with it.
 */
export async function getSecret(key: string): Promise<string | null> {
  if (!NATIVE) {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  }

  try {
    const stored = await SecureStore.getItemAsync(secureKey(key));
    if (stored !== null) return stored;
  } catch {
    /* A corrupt or unreadable entry. Fall through to the legacy read — the
       plaintext copy may still be there, and a signed-in user is better than
       a failed launch. */
  }

  /* ── The one-time migration ──────────────────────────────────────────── */
  try {
    const legacy = await AsyncStorage.getItem(key);
    if (legacy === null) return null;

    /* Written BEFORE the plaintext is removed. The reverse order loses the
       session entirely if the process dies between the two. */
    await SecureStore.setItemAsync(secureKey(key), legacy);
    await AsyncStorage.removeItem(key);
    return legacy;
  } catch {
    return null;
  }
}

/** Store a secret. Also clears any legacy plaintext copy of the same key. */
export async function setSecret(key: string, value: string): Promise<void> {
  if (!NATIVE) {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      /* Storage full or unavailable. The session still works for this run. */
    }
    return;
  }

  try {
    await SecureStore.setItemAsync(secureKey(key), value);
    /* Belt and braces: if a legacy copy survived a half-finished migration,
       this is the moment it stops being the newest thing on disk. */
    await AsyncStorage.removeItem(key);
  } catch {
    /* Nothing to do but carry on — see `getSecret` on why this cannot throw. */
  }
}

/** Remove a secret from BOTH stores. Signing out must not leave a copy. */
export async function deleteSecret(key: string): Promise<void> {
  const jobs: Promise<unknown>[] = [AsyncStorage.removeItem(key).catch(() => {})];
  if (NATIVE) {
    jobs.push(SecureStore.deleteItemAsync(secureKey(key)).catch(() => {}));
  }
  await Promise.all(jobs);
}

/* ══════════════════════════════════════════════════════════════════════════
   A zustand storage that keeps the TOKEN in the keystore and the rest in
   AsyncStorage.
   ══════════════════════════════════════════════════════════════════════════

   This store persists a rider's cached job, profile and earnings alongside the
   token. That blob is well over SecureStore's 2048-byte Android ceiling, so
   moving the whole thing is not an option — and most of it is not secret
   anyway. This splits the one field that is.

   `persist` hands this a JSON STRING and expects one back, so the split
   happens on the serialised form: parse, lift the secret fields out to the
   keystore, keep the remainder in AsyncStorage, and put them back together on
   read. `partialize`, `onRehydrateStorage` and every selector stay exactly as
   they were — the store cannot tell the difference.

   ## The migration is a side effect of the first read

   An existing install has the token INSIDE the AsyncStorage blob. `getItem`
   reassembles with `keystore ?? whatever was inline`, so that first read still
   finds it and the rider stays signed in. The next `setItem` — which zustand
   makes on the next state change — writes it to the keystore and strips it
   from the blob. Nobody is signed out; the copy simply stops being plaintext.

   Unparseable JSON returns null rather than throwing: to `persist` that reads
   as "nothing stored", which is a cold start rather than a crash loop.
*/
export const secureFields = (fields: string[]) => ({
  getItem: async (name: string): Promise<string | null> => {
    const raw = await AsyncStorage.getItem(name);
    if (raw === null) return null;

    let parsed: { state?: Record<string, unknown> } | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.state) return raw;

    for (const field of fields) {
      const stored = await getSecret(`${name}.${field}`);
      /* `??` not `||`: a stored empty string is a real value, and falling back
         to the inline copy on one would resurrect a token just signed out. */
      if (stored !== null) parsed.state[field] = JSON.parse(stored);
    }

    return JSON.stringify(parsed);
  },

  setItem: async (name: string, value: string): Promise<void> => {
    let parsed: { state?: Record<string, unknown> } | null = null;
    try {
      parsed = JSON.parse(value);
    } catch {
      await AsyncStorage.setItem(name, value);
      return;
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.state) {
      await AsyncStorage.setItem(name, value);
      return;
    }

    for (const field of fields) {
      const held = parsed.state[field];
      if (held === undefined || held === null) {
        await deleteSecret(`${name}.${field}`);
      } else {
        await setSecret(`${name}.${field}`, JSON.stringify(held));
      }
      /* Removed from the blob, which is the point: what lands in AsyncStorage
         from here on carries no token at all. */
      delete parsed.state[field];
    }

    await AsyncStorage.setItem(name, JSON.stringify(parsed));
  },

  removeItem: async (name: string): Promise<void> => {
    await Promise.all([
      AsyncStorage.removeItem(name),
      ...fields.map((field) => deleteSecret(`${name}.${field}`)),
    ]);
  },
});
