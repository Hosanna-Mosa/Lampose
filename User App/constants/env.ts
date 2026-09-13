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
 * Undefined is a legitimate state in development: `services/api/config.ts`
 * falls back to the machine hosting the Metro bundler, which is right far
 * more often than a hardcoded localhost. A production build must set it.
 */
export const API_URL = read(process.env.EXPO_PUBLIC_API_URL) ?? read(fromConfig.apiUrl);

/**
 * Which build this is, and therefore what the app is allowed to show.
 *
 * ## Why this exists rather than just `__DEV__`
 *
 * Several screens carry preview controls — rows of buttons that jump a
 * booking between its thirteen statuses, or force a request to accepted,
 * rejected or expired. They exist because the other side of those flows is a
 * real owner on a real phone, so the states are otherwise unreachable while
 * building. They must never be in front of a student.
 *
 * `__DEV__` alone does not decide that. It is false in every standalone
 * build, including the internal APKs shared for push-notification testing —
 * exactly the builds where the controls are still wanted. Gating on `__DEV__`
 * means either losing them in internal builds or shipping them to everyone.
 *
 * So the build states its own identity, and the fallbacks are chosen so the
 * dangerous answer is never the accidental one:
 *
 *   · unset in a release build → production. A build made without a `.env`,
 *     on a fresh machine or a misconfigured CI job, hides the controls.
 *   · unset under Metro         → development. Local work keeps them without
 *     anybody having to set anything up.
 *   · misspelt                  → the same as unset. A typo must not be the
 *     difference between an internal tool and a public one.
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

/**
 * Whether the preview controls render.
 *
 * Read this instead of `__DEV__` anywhere a control exists to reach a state
 * that the product itself cannot reach yet.
 */
export const PREVIEW_CONTROLS = !IS_PRODUCTION_BUILD;

/**
 * Whether the ACTION bypasses render — the DEV-labelled buttons.
 *
 * A separate variable from `PREVIEW_CONTROLS`, and it has to be. Preview
 * controls reach a state the product cannot reach yet and change nothing that
 * outlives the screen: an outcome switcher on a mock screen, an escape from a
 * blocking screen, the error stack. The bypasses are a different kind of
 * thing — they settle the visit token with no payment and stamp both halves
 * of a move-in, which is what makes a hotel settlement releasable. They write
 * to real rows in the real database.
 *
 * They used to share `PREVIEW_CONTROLS`, so an internal APK built on the EAS
 * `preview` profile drew them while pointed at the production API, and the
 * only thing left between a student and "mark payment as done" was the
 * server's `DEV_ALLOW_MARK_PAID` — which `env.js` refuses under
 * `NODE_ENV=production`, on a host that was found running
 * `NODE_ENV=development`. Two gates that fail together are one gate.
 *
 * So this one is OPT-IN, and it is the only value in this file that is:
 * everything else here has a sensible default and this has none. Unset,
 * misspelt, `1`, `yes`, `TRUE` — all of them mean off. Only the exact string
 * `true` turns it on, and never in a production build whatever it says.
 */
export const DEV_BYPASS =
  !IS_PRODUCTION_BUILD && process.env.EXPO_PUBLIC_DEV_BYPASS === 'true';

/**
 * Whether the app narrates itself to the console.
 *
 * Off in production for two reasons. The request log prints URLs and a
 * preview of each body, which is a student's own data going somewhere they
 * did not choose; and a release build that logs on every request pays for it
 * in a way nobody sees, because there is no console attached to notice.
 */
export const DEBUG_LOGS = !IS_PRODUCTION_BUILD;

/**
 * Which Food module the tab opens.
 *
 * Anything other than the exact string `dev` means production, including a
 * typo — a misspelt env value must never leak an unfinished module to real
 * users, so the safe answer is the fallback rather than an error.
 */
export type FoodMode = 'dev' | 'production';

/**
 * What the variable asked for, before the build has its say.
 *
 * `services/runtimeEnv.ts` combines this with the mode in force to decide
 * what the Food tab actually opens. Kept separate because the runtime toggle
 * needs to know what to go back TO when it is switched out of production —
 * which the resolved value below has already forgotten.
 */
export const FOOD_MODE_CONFIGURED: FoodMode =
  process.env.EXPO_PUBLIC_FOOD_MODE === 'dev' ? 'dev' : 'production';

/** The build-time answer. Most code should read `useFoodMode()` instead. */
export const FOOD_MODE: FoodMode = IS_PRODUCTION_BUILD ? 'production' : FOOD_MODE_CONFIGURED;

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
  `env=${APP_ENV}`,
  `api=${API_URL ?? '(unset — will be guessed)'}`,
  `food=${FOOD_MODE}`,
  `preview=${PREVIEW_CONTROLS ? 'on' : 'off'}`,
  `bypass=${DEV_BYPASS ? 'ON' : 'off'}`,
].join('  ');

/** Names of the variables this app understands. For `.env.example` and docs. */
export const ENV_KEYS = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_APP_ENV',
  'EXPO_PUBLIC_FOOD_MODE',
  'EXPO_PUBLIC_DEV_BYPASS',
] as const;
