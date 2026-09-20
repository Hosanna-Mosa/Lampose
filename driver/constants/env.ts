/**
 * Which build this is, and therefore whether it may narrate itself to the
 * console.
 *
 * Ported from `Stay Partner/constants/env.ts` (itself kept in step with
 * `User App/constants/env.ts`). This app has no preview controls and no
 * dev-bypass buttons to gate, so it takes only the slice of that pattern it
 * needs: a build-time answer to "is this production", not a runtime toggle a
 * rider's phone could ever switch out of.
 *
 * ## The one rule that shapes this file
 *
 * Expo does not hand a phone an environment. It **inlines** each
 * `EXPO_PUBLIC_*` variable into the bundle at build time by finding the
 * literal text `process.env.EXPO_PUBLIC_SOMETHING` and replacing it with the
 * value. Dynamic access (`process.env[name]`) does not work on a device —
 * there is no object to index — which is why the read below is written out
 * in full rather than the loop it looks like it wants to be.
 *
 * ## Nothing secret goes in an EXPO_PUBLIC_ variable
 *
 * They are inlined into the bundle, so anybody with the APK has them. That is
 * fine for a feature flag and never acceptable for a key — the Google Maps
 * key is the one already read this way, and a map key is meant to be public
 * and restricted by platform/package at the Google Cloud console, not kept
 * secret.
 */

const read = (raw: string | undefined): string | undefined => {
  const value = (raw ?? "").trim();
  return value.length ? value : undefined;
};

/**
 * Which build this is.
 *
 * The fallbacks are chosen so the dangerous answer is never the accidental
 * one: unset in a release build reads as production, unset under Metro as
 * development, and a misspelling as neither.
 */
export type AppEnv = "development" | "preview" | "production";

const rawAppEnv = read(process.env.EXPO_PUBLIC_APP_ENV);

export const APP_ENV: AppEnv =
  rawAppEnv === "development" || rawAppEnv === "preview" || rawAppEnv === "production"
    ? rawAppEnv
    : __DEV__
      ? "development"
      : "production";

/** The one thing the rest of the app should branch on. */
export const IS_PRODUCTION_BUILD = APP_ENV === "production";

/**
 * Whether the app narrates itself to the console. Never in production — a
 * failed fetch, socket drop or location fix is logged with the error it came
 * from, and that error can carry a rider's own job, address and earnings
 * details. `services/log.ts` gates every call site on this.
 */
export const DEBUG_LOGS = !IS_PRODUCTION_BUILD;

/** Names of the variables this app understands. For `.env.example` and docs. */
export const ENV_KEYS = [
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_APP_ENV",
  "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY",
  "EXPO_PUBLIC_ALLOW_DUMMY_DATA",
] as const;
