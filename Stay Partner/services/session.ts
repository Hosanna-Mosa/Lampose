import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BackendPartner } from './api/types';

/**
 * The session on disk.
 *
 * Two keys rather than one blob, because they have different lifetimes and
 * different failure modes. The token is the only thing that must survive; the
 * cached partner is a convenience so the app can paint a name on the first
 * frame instead of after a round trip.
 *
 * ## The cached profile is never trusted
 *
 * It is what the UI shows while `GET /me` is in flight, and `/me` overwrites
 * it. A profile read from disk and believed would keep showing a name that was
 * changed on another device, and — worse — would keep an account looking
 * signed-in after the server had blocked it. The token is what says a session
 * exists; the server is what says it is still good.
 *
 * ## Why AsyncStorage and not SecureStore
 *
 * This matches the User App, which stores its customer token the same way.
 * Moving both to `expo-secure-store` is a real improvement and a separate
 * change: it is a new native dependency in two apps, and doing it in one but
 * not the other would leave the codebase looking like a decision had been made
 * when it had not.
 */

const TOKEN_KEY = 'lampose.partner.token';
const PARTNER_KEY = 'lampose.partner.profile';

export async function loadSession(): Promise<{
  token: string | null;
  partner: BackendPartner | null;
}> {
  try {
    const [[, token], [, raw]] = await AsyncStorage.multiGet([TOKEN_KEY, PARTNER_KEY]);
    let partner: BackendPartner | null = null;
    if (raw) {
      try {
        partner = JSON.parse(raw) as BackendPartner;
      } catch {
        /* A half-written or stale-shaped blob. The token is what matters, and
           `/me` is about to replace this anyway — so it is dropped rather than
           allowed to take the whole boot down. */
        partner = null;
      }
    }
    return { token: token ?? null, partner };
  } catch {
    /* Storage unavailable. Signed out is the safe reading: it costs a sign-in,
       whereas assuming a session exists produces 401s on every screen. */
    return { token: null, partner: null };
  }
}

export async function saveSession(token: string, partner: BackendPartner): Promise<void> {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [PARTNER_KEY, JSON.stringify(partner)],
  ]);
}

/** Refreshes only the cached profile — used after `/me` and after an edit. */
export async function savePartner(partner: BackendPartner): Promise<void> {
  await AsyncStorage.setItem(PARTNER_KEY, JSON.stringify(partner));
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, PARTNER_KEY]);
}
