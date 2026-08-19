const fs = require('fs');
const path = require('path');

/**
 * The parts of the config that depend on the environment or the filesystem.
 *
 * ## Why this sits ALONGSIDE app.json rather than replacing it
 *
 * Expo reads `app.json` first and passes it here as `config`, so this file
 * layers on top rather than restating everything. That split is deliberate:
 * `eas init` and friends write to `app.json`, and they cannot write to a
 * JavaScript config — a dynamic-only setup means every project id and
 * credential has to be pasted in by hand, and the CLI tells you so with an
 * error rather than doing it.
 *
 * So: anything static, and anything a tool needs to write, stays in
 * `app.json`. Anything that has to be COMPUTED lives here.
 *
 * ## What "computed" means here
 *
 * This file runs in Node at build and bundler start, which is a different
 * world from the app. It can read the filesystem and the whole environment —
 * not only `EXPO_PUBLIC_*` — where the app itself only ever sees values that
 * were inlined into the bundle. See `constants/env.ts`.
 *
 * Values put on `extra` reach the app through `Constants.expoConfig.extra`,
 * which is how a setting gets to the device WITHOUT being an `EXPO_PUBLIC_`
 * variable.
 */

/** Optional files. Naming one that does not exist fails the native build. */
const optional = (relative) => (
  fs.existsSync(path.join(__dirname, relative)) ? `./${relative}` : undefined
);

/**
 * Firebase, per installation and never committed.
 *
 * Referenced only when the file is actually present. Without this guard a
 * fresh clone — which has no `google-services.json`, because it is
 * git-ignored — fails the Android build with a Gradle error about a missing
 * file rather than the honest "you have not set up Firebase yet".
 */
const googleServicesFile = optional('google-services.json');

/**
 * The Android adaptive icon.
 *
 * Also optional, and for the same reason: Android crops the outer third of a
 * foreground image on round-mask launchers, so it needs its own padded
 * artwork rather than the square icon. Until that file exists, Android falls
 * back to `icon` — which is worse-looking and still works, where a dangling
 * reference does not build at all.
 */
const adaptiveIcon = optional('assets/images/adaptive-icon.jpeg');

/** Brand colours. Keep in step with the theme tokens. */
const BRAND = {
  background: '#0b1724',
};

module.exports = ({ config }) => ({
  ...config,

  android: {
    ...config.android,
    ...(googleServicesFile ? { googleServicesFile } : {}),
    ...(adaptiveIcon
      ? { adaptiveIcon: { foregroundImage: adaptiveIcon, backgroundColor: BRAND.background } }
      : {}),
  },

  extra: {
    ...config.extra,

    /*
     * The backend origin, carried through the config.
     *
     * Duplicated with the `EXPO_PUBLIC_API_URL` the app reads directly, and
     * that is the point: this is the fallback `services/api/config.ts`
     * consults when the inlined value is absent. A build made without the
     * variable but WITH it in the config still knows where to call.
     */
    apiUrl: process.env.EXPO_PUBLIC_API_URL,

    /*
     * Which build this is.
     *
     * Carried here as well as inlined because this file runs in Node during
     * the build and can read the whole environment, including a value set by
     * an EAS profile rather than a `.env` file. `constants/env.ts` treats an
     * absent value as production, so a build that sets it in neither place
     * is the safe one, not the exposed one.
     */
    appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  },
});
