import Constants from 'expo-constants';
import { API_URL } from '@/constants/env';

/**
 * Where the backend is, and how this app is allowed to find out.
 *
 * ## The base URL comes from the environment, and from nowhere else
 *
 * `EXPO_PUBLIC_API_URL` is the only source. There is no localhost default, no
 * derivation from the Metro host, no hardcoded staging URL — and that is a
 * deliberate difference from the User App, which does guess in development.
 *
 * The reason is what this app is. It is the owner's console: it will read
 * their bookings and move their money. A build that silently falls back to a
 * developer's laptop, or to a URL somebody typed into a source file once, is a
 * build that can be pointed at the wrong environment without anybody noticing
 * until a payout lands in the wrong ledger. Requiring the variable makes the
 * target of every build an explicit, reviewable fact.
 *
 * So a missing variable is not papered over. It is reported:
 *
 *   `API_BASE_URL`            empty string when unset
 *   `API_BASE_URL_CONFIGURED` false when unset
 *   every request              fails immediately with `API_NOT_CONFIGURED`
 *
 * ## Why it does not throw at import time
 *
 * Throwing here would take the whole app down before a single frame renders,
 * and the crash would name a module rather than the problem. A build with no
 * API URL should start, show its UI, and say plainly that it has nowhere to
 * call — which is a diagnosable state rather than a white screen.
 *
 * ## Setting it
 *
 * Copy `.env.example` to `.env` and fill it in. Expo inlines every
 * `EXPO_PUBLIC_*` variable at BUILD time, so this is a string literal by the
 * time it runs on a handset — there is no runtime environment to read on a
 * phone, and changing `.env` means restarting the bundler.
 */

/* ------------------------------------------------------------------ *
 * The API surface
 * ------------------------------------------------------------------ */

/**
 * The two versions the backend serves. `Backend/routes/index.js` is the
 * authority for this table.
 *
 *   v1   the onboarding app and the admin console. Writes need an
 *        administrator's grant.
 *   v2   the public site, the leads panel, and the mobile apps.
 *
 * This app is a v2 client on every route it has. The constant exists so that
 * decision is written down rather than implied by the strings in
 * `endpoints.ts`.
 */
export const API_VERSION = {
  v1: '/api/v1',
  v2: '/api/v2',
} as const;

export type ApiVersion = keyof typeof API_VERSION;

export const APP_API_VERSION: ApiVersion = 'v2';

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

/**
 * What this app calls itself in the backend console.
 *
 * A React Native app sends no Origin header, so the server's request log can
 * only report an IP for it. With three mobile clients and two web frontends
 * pointed at one backend, these headers are the only thing that makes a log
 * line attributable.
 */
export const CLIENT_NAME = 'lampose-stay-partner';
export const CLIENT_VERSION = String(Constants.expoConfig?.version ?? '1.0.0');

/* ------------------------------------------------------------------ *
 * Base URL
 * ------------------------------------------------------------------ */

/**
 * Trailing slashes and a trailing `/api` both come off.
 *
 * Every path in `endpoints.ts` starts `/api/v2/…`, matching how the backend's
 * own route map is written, so a route can be read off one file and found in
 * the other. A value copied from a web frontend's config carries `/api` on the
 * end — correct there, and here it would produce `/api/api/v2/listings` and a
 * 404 that names nothing.
 */
function normalizeBase(value: string): string {
  return value.trim().replace(/\/+$/, '').replace(/\/api$/i, '');
}

/* Read in `constants/env.ts`, which is where every environment value in this
   app is gathered — and which explains why they are written out as literals
   rather than looked up by name. */
const RAW_BASE_URL = API_URL ?? '';

/** The backend origin: no trailing slash, no `/api` suffix, or `''` if unset. */
export const API_BASE_URL = RAW_BASE_URL ? normalizeBase(RAW_BASE_URL) : '';

/**
 * Whether this build actually has somewhere to call.
 *
 * `client.ts` refuses every request when this is false, with a message that
 * names the variable. Surfacing it in a dev banner is worth doing: an
 * unconfigured build and a backend that is down fail at the same moment and
 * look identical from a screen, and telling them apart is the difference
 * between a one-line fix and an afternoon.
 */
export const API_BASE_URL_CONFIGURED = API_BASE_URL.length > 0;

/**
 * What to tell a developer looking at a failing build. Not shown to owners —
 * `ApiError.displayMessage` handles that.
 */
export const API_CONFIG_HINT =
  'EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env, set it to the backend origin (no /api suffix), and restart the bundler — Expo inlines EXPO_PUBLIC_* at build time.';

/**
 * Whether the configured URL points at the device itself.
 *
 * This is worth its own flag rather than a comment, because it is the single
 * most expensive mistake available here and it fails in the most misleading
 * way possible. `localhost` and `127.0.0.1` on a handset are THE HANDSET —
 * a phone asking `http://localhost:5001` is asking itself, gets a connection
 * refused, and the app reports "we could not reach Lampose", which is
 * indistinguishable from a backend that is genuinely down.
 *
 * It is not an error, because it is correct when the app runs in a web browser
 * on the same machine. It is a loud warning everywhere else.
 */
export const API_BASE_URL_IS_LOOPBACK =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(API_BASE_URL);

/**
 * The one-line answer to "where is this app actually calling?".
 *
 * Exported so a debug screen can render it, and printed to the console at
 * startup by the banner below.
 */
export function describeApiTarget(): string {
  if (!API_BASE_URL_CONFIGURED) return 'not configured';
  return `${API_BASE_URL} (from EXPO_PUBLIC_API_URL)`;
}

/*
 * The startup banner.
 *
 * Printed once, at module load, before any screen has had a chance to call
 * anything — so the first thing in the Metro console is where this build is
 * pointed. Per-request lines in `client.ts` carry the full URL too, but they
 * only appear once something has already gone wrong, and by then the console
 * is full of other noise.
 *
 * At module scope deliberately: this file is where the URL is resolved, and
 * resolving it in one place is the whole point of the layer. Printing from a
 * screen instead would mean the banner appears or not depending on which
 * screen mounted first.
 */
if (__DEV__) {
  const lines = [
    '',
    '📡 ─── Lampose Stay Partner → backend ─────────────────────',
    `   base URL   ${API_BASE_URL_CONFIGURED ? API_BASE_URL : '(none)'}`,
    `   source     ${API_BASE_URL_CONFIGURED ? 'EXPO_PUBLIC_API_URL — Stay Partner/.env' : 'UNSET'}`,
    `   API        ${API_VERSION.v2}`,
  ];

  if (API_BASE_URL_CONFIGURED) {
    lines.push(`   health     ${API_BASE_URL}${API_VERSION.v2}/health`);
  }

  if (!API_BASE_URL_CONFIGURED) {
    lines.push('', `   ⚠  ${API_CONFIG_HINT}`);
  } else if (API_BASE_URL_IS_LOOPBACK) {
    lines.push(
      '',
      '   ⚠  This points at the DEVICE, not at your computer.',
      '      On a phone or an emulator, localhost is the phone. Use the',
      '      machine\'s LAN address instead (ipconfig → IPv4 under Wi-Fi),',
      '      or 10.0.2.2 on the Android emulator. Then RESTART the bundler —',
      '      Expo inlines EXPO_PUBLIC_* at build time, so editing .env alone',
      '      changes nothing.',
    );
  }

  lines.push('───────────────────────────────────────────────────────────', '');
  console.log(lines.join('\n'));
}

/* ------------------------------------------------------------------ *
 * Timings
 * ------------------------------------------------------------------ */

export const API_TIMEOUT_MS = 15000;

/**
 * Only network failures are retried, and only on GET.
 *
 * This app moves money. A POST that timed out may well have been received, so
 * repeating one risks a second payout request against the same balance. Reads
 * are safe to repeat and are the ones that meet a dropped signal.
 */
export const API_GET_RETRIES = 2;
export const API_RETRY_DELAY_MS = 600;
