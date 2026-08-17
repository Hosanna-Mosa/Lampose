import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the backend is, and which half of it we are talking to.
 *
 * ## One base URL, resolved once
 *
 * Every call in the app goes through `services/api/client.ts`, and the client
 * reads the base URL from here. Nothing else in the app is allowed to know a
 * hostname — that is the whole point of the layer, and it is what makes
 * pointing a build at staging a one-line change rather than a search for
 * every `fetch` in the tree.
 *
 * ## Why the fallback is not just "localhost"
 *
 * `localhost` on a phone is the phone. A physical device running the Expo dev
 * build that asks `http://localhost:5001` for listings is asking *itself*, and
 * gets a connection refused that reads exactly like a backend that is down —
 * which is the single most common wasted afternoon in React Native.
 *
 * So the dev fallback is derived from the address the JavaScript bundle
 * itself arrived from. Metro tells us that in `hostUri` ("192.168.1.5:8081"),
 * and the machine serving the bundle is the machine running the backend in
 * every development setup this repo has. The Android emulator is the one case
 * where that is still wrong — its loopback is the emulator, and the host is
 * reachable only through 10.0.2.2 — so it is special-cased.
 *
 * A production build must not rely on any of this: set EXPO_PUBLIC_API_URL.
 */

/* ------------------------------------------------------------------ *
 * The API surface
 * ------------------------------------------------------------------ */

/**
 * The two versions this backend serves, and which one belongs to whom.
 *
 * The backend merged two services that disagreed about what the same path
 * means, and versioning is what keeps the disagreement harmless — see
 * `Backend/routes/index.js`, which is the authority for this table:
 *
 *   v1   the onboarding app and the admin console. `POST /properties` starts
 *        a WhatsApp verification; writes need an administrator's grant.
 *   v2   the public site and the leads panel. Read-only listings, the visit
 *        request flow, auth, users, the scraper.
 *
 * **This app is a v2 client, on every route.** It is the consumer-facing
 * surface, the same one lampose.com reads. It has no business on v1: those
 * routes onboard properties on behalf of a Lampose employee, and a student's
 * phone must not be able to reach them. The constant exists so that decision
 * is written down rather than implied by the strings in `endpoints.ts`.
 *
 * The unversioned aliases (`/api/listings`) also work and are deliberately
 * not used. They resolve to whichever version answered them historically, so
 * a call through one is a call whose version is decided somewhere else.
 */
export const API_VERSION = {
  v1: '/api/v1',
  v2: '/api/v2',
} as const;

export type ApiVersion = keyof typeof API_VERSION;

/** The version every call from this app goes to, unless a route says otherwise. */
export const APP_API_VERSION: ApiVersion = 'v2';

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

/**
 * What this app calls itself in the backend console.
 *
 * A React Native app sends no Origin header — there is no browser and no
 * document — so the server's request log can only report an IP address for
 * it. On a laptop running the backend, the leads panel and this app at once,
 * every line then says `::1` and none of them says who called. These two
 * headers are what make the log readable.
 */
export const CLIENT_NAME = 'lampose-user-app';
export const CLIENT_VERSION = String(Constants.expoConfig?.version ?? '1.0.0');

/* ------------------------------------------------------------------ *
 * Base URL
 * ------------------------------------------------------------------ */

const DEFAULT_PORT = 5001;

/**
 * Trailing slashes and a trailing `/api` both come off.
 *
 * Every path in `endpoints.ts` starts `/api/v2/...`, because that is how the
 * backend's own route map is written and matching it means a route can be
 * read off one file and found in the other. A deployment whose env var was
 * copied from the web frontend carries `/api` on the end — that variable is
 * correct for a client that appends bare `/listings`, and pasting it here
 * would produce `/api/api/v2/listings` and a 404 that names nothing.
 */
function normalizeBase(value: string): string {
  return value.trim().replace(/\/+$/, '').replace(/\/api$/i, '');
}

/** The host the JS bundle was served from, if Metro told us. */
function metroHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    // Older Expo Go payloads put it here instead.
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost ??
    null;
  if (!hostUri) return null;
  const host = String(hostUri).split('/')[0].split(':')[0];
  return host || null;
}

function devFallback(): string {
  const host = metroHost();

  /* The emulator's own loopback is the emulator. 10.0.2.2 is the alias its
     network stack maps to the host machine, and it is the only address that
     reaches a backend running on the developer's laptop. */
  const isLoopback = !host || host === 'localhost' || host === '127.0.0.1';
  if (isLoopback && Platform.OS === 'android') return `http://10.0.2.2:${DEFAULT_PORT}`;
  if (isLoopback) return `http://localhost:${DEFAULT_PORT}`;

  return `http://${host}:${DEFAULT_PORT}`;
}

function resolveBaseUrl(): string {
  /* Expo inlines any EXPO_PUBLIC_* variable at build time, so this is a
     literal by the time it runs on a device — there is no runtime env to
     read on a phone. */
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return normalizeBase(fromEnv);

  const fromConfig = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (fromConfig) return normalizeBase(fromConfig);

  return devFallback();
}

/** The backend origin, with no trailing slash and no `/api` suffix. */
export const API_BASE_URL = resolveBaseUrl();

/**
 * True when the URL was guessed rather than configured.
 *
 * Worth surfacing in a dev banner: a guessed URL that happens to be wrong
 * fails exactly like a backend that is down, and knowing which of the two you
 * are looking at saves the afternoon described at the top of this file.
 */
export const API_BASE_URL_IS_GUESSED =
  !process.env.EXPO_PUBLIC_API_URL &&
  !(Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;

/* ------------------------------------------------------------------ *
 * Timings
 * ------------------------------------------------------------------ */

export const API_TIMEOUT_MS = 15000;

/**
 * Only network failures are retried, and only on GET.
 *
 * A POST that timed out may well have been received — the visit-request
 * endpoint sends an SMS and messages a property owner on WhatsApp — so
 * retrying one risks doing that twice. Reads are safe to repeat and are the
 * ones that meet a dropped mobile signal on a bus.
 */
export const API_GET_RETRIES = 2;
export const API_RETRY_DELAY_MS = 600;
