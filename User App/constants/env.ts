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
 * ## Why they are gathered here
 *
 * They were spread across `services/api/config.ts` and `constants/food.ts`,
 * so "what does this app read from the environment" could only be answered by
 * grepping. Each module still owns what it DOES with its value — the URL
 * fallback chain is real logic and belongs beside the client — but the
 * reading, trimming and defaulting happen once, here.
 *
 * ## Nothing secret goes in an EXPO_PUBLIC_ variable
 *
 * They are inlined into the bundle, so anybody with the APK has them. That is
 * fine for an API origin and a feature flag, and never acceptable for a key.
 * If something secret is ever needed, it belongs behind the backend.
 */

import Constants from 'expo-constants';

/** Trimmed, and empty-as-undefined so a blank line in `.env` is not a value. */
/**
 * What `app.config.js` put on `extra` at build time.
 *
 * A second route for the same values, and a genuinely useful one: that file
 * runs in Node and can read the WHOLE environment, not only the
 * `EXPO_PUBLIC_*` names Expo inlines. A build configured through the config
 * rather than through an inlined variable still knows where to call.
 */
const fromConfig = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };

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
 * Undefined is a legitimate state in development: `services/api/config.ts`
 * falls back to the machine hosting the Metro bundler, which is right far
 * more often than a hardcoded localhost. A production build must set it.
 */
export const API_URL = read(process.env.EXPO_PUBLIC_API_URL) ?? read(fromConfig.apiUrl);

/**
 * Which Food module the tab opens.
 *
 * Anything other than the exact string `dev` means production, including a
 * typo — a misspelt env value must never leak an unfinished module to real
 * users, so the safe answer is the fallback rather than an error.
 */
export type FoodMode = 'dev' | 'production';
export const FOOD_MODE: FoodMode =
  process.env.EXPO_PUBLIC_FOOD_MODE === 'dev' ? 'dev' : 'production';

/* ------------------------------------------------------------------ *
 * What is set, for a dev banner or a bug report
 * ------------------------------------------------------------------ */

/**
 * A one-line summary of how this build was configured.
 *
 * Worth printing when something behaves oddly: "the API URL was guessed" and
 * "the API URL is wrong" fail identically from the outside, and this is the
 * difference between the two.
 */
export const ENV_SUMMARY = [
  `api=${API_URL ?? '(unset — will be guessed)'}`,
  `food=${FOOD_MODE}`,
].join('  ');

/** Names of the variables this app understands. For `.env.example` and docs. */
export const ENV_KEYS = ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_FOOD_MODE'] as const;
