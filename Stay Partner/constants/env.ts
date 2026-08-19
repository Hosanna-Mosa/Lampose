/**
 * Every environment value this app reads, in one place.
 *
 * ## The one rule that shapes this file
 *
 * Expo does not hand a phone an environment. It **inlines** each
 * `EXPO_PUBLIC_*` variable into the bundle at build time by finding the
 * literal text `process.env.EXPO_PUBLIC_SOMETHING` and replacing it with the
 * value. That has two consequences, and both are easy to be caught by:
 *
 *   · Dynamic access does not work. `process.env[name]` is `undefined` on a
 *     device, always — there is no object to index. So every read below is
 *     written out in full, which is why this file is a list of literals
 *     rather than the loop it looks like it wants to be.
 *
 *   · Changing `.env` needs the bundler restarted with the cache cleared
 *     (`npm start -c`), not a reload. A value that "will not update" is
 *     almost always this.
 *
 * ## Nothing secret goes in an EXPO_PUBLIC_ variable
 *
 * They are inlined into the bundle, so anybody with the APK has them. That is
 * fine for an API origin and never acceptable for a key. The owner's session
 * token is not here for exactly that reason — it is issued at sign-in and
 * held in `services/session.ts`.
 */

import Constants from 'expo-constants';

/**
 * What `app.config.js` put on `extra` at build time.
 *
 * A second route for the same values, and a genuinely useful one: that file
 * runs in Node and can read the WHOLE environment, not only the
 * `EXPO_PUBLIC_*` names Expo inlines. A build configured through the config
 * rather than through an inlined variable still knows where to call.
 */
const fromConfig = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; appEnv?: string };

const read = (raw: string | undefined): string | undefined => {
  const value = (raw ?? '').trim();
  return value.length ? value : undefined;
};

/* ------------------------------------------------------------------ *
 * The values
 * ------------------------------------------------------------------ */

/**
 * The backend origin — no trailing slash, no `/api` suffix.
 *
 * Unlike the student's app, this one has NO development fallback and never
 * guesses. An owner's app that quietly pointed at the wrong host would show
 * somebody else's properties, or none, and call it an empty account. Unset
 * means every request refuses with a message naming this variable — see
 * `services/api/config.ts`.
 */
export const API_URL = read(process.env.EXPO_PUBLIC_API_URL) ?? read(fromConfig.apiUrl);

/**
 * Which build this is, and therefore what the app is allowed to show and say.
 *
 * The owner's app has no preview controls — an owner's states are all
 * reachable, because a real student produces them. What it does have is a
 * console that narrates every request, and screens that log the body of any
 * failure. Both are wanted while building and neither belongs in a release:
 * the logs carry an owner's own bookings and payout details.
 *
 * The fallbacks are chosen so the dangerous answer is never the accidental
 * one — unset in a release build reads as production, unset under Metro as
 * development, and a misspelling as neither. See the student app's copy of
 * this file for the longer argument; the two are kept in step deliberately.
 */
export type AppEnv = 'development' | 'preview' | 'production';

const rawAppEnv = read(process.env.EXPO_PUBLIC_APP_ENV) ?? read(fromConfig.appEnv);

export const APP_ENV: AppEnv =
  rawAppEnv === 'development' || rawAppEnv === 'preview' || rawAppEnv === 'production'
    ? rawAppEnv
    : __DEV__
      ? 'development'
      : 'production';

/** The one thing the rest of the app should branch on. */
export const IS_PRODUCTION_BUILD = APP_ENV === 'production';

/** Whether the app narrates itself to the console. Never in production. */
export const DEBUG_LOGS = !IS_PRODUCTION_BUILD;

/** Whether controls that reach otherwise-unreachable states may render. */
export const PREVIEW_CONTROLS = !IS_PRODUCTION_BUILD;

/* ------------------------------------------------------------------ *
 * What is set, for a dev banner or a bug report
 * ------------------------------------------------------------------ */

export const ENV_SUMMARY = [
  `env=${APP_ENV}`,
  `api=${API_URL ?? '(unset)'}`,
  `logs=${DEBUG_LOGS ? 'on' : 'off'}`,
].join('  ');

/** Names of the variables this app understands. For `.env.example` and docs. */
export const ENV_KEYS = ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_APP_ENV'] as const;
