/**
 * The mode the app is running in *right now*, which is not always the mode it
 * was built in.
 *
 * ## Why a runtime mode exists at all
 *
 * `constants/env.ts` decides what the build is: development under Metro,
 * preview for an internal APK, production for the one students install. That
 * is the right answer for a shipped app and a poor one for testing, because
 * checking what a student sees meant making a second build and installing it.
 * This lets one internal build answer both questions.
 *
 * ## The ceiling, which is the whole point
 *
 * A production build cannot be switched out of production. Not "should not" —
 * `CAN_OVERRIDE_ENV` is a build-time constant, so in a production bundle
 * `setAppEnv` is a function that does nothing and `getAppEnv` cannot return
 * anything but `'production'`. The toggle is not hidden in that build; it has
 * nothing to switch.
 *
 * That direction matters. Without it this file would be a way to undo every
 * gate in the app from inside the app — preview controls back on a student's
 * phone, the request log printing their data again — reachable by whatever
 * can write one key into AsyncStorage. The override is a privilege a build
 * either has from the start or never has.
 *
 * ## Why it is not React
 *
 * `services/api/client.ts` and `lib/log.ts` ask whether to log, and neither is
 * a component. So the state lives here as a plain store and React subscribes
 * to it through `hooks/useAppEnv.ts`, rather than the other way round.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  APP_ENV as BUILD_APP_ENV,
  FOOD_MODE_CONFIGURED,
  IS_PRODUCTION_BUILD,
  type AppEnv,
  type FoodMode,
} from '@/constants/env';

export type { AppEnv };

/** Where the override is kept. Namespaced so it is obvious in a storage dump. */
const STORAGE_KEY = 'lampose.dev.appEnv';

/**
 * Whether this build may be switched at all — fixed when the bundle is made.
 *
 * Read this, never the current mode, to decide whether to SHOW the toggle.
 * A toggle gated on the current mode disappears the moment somebody selects
 * production, and there is then no way back short of reinstalling.
 */
export const CAN_OVERRIDE_ENV = !IS_PRODUCTION_BUILD;

/** What the build was, whatever the override says. Shown beside the toggle. */
export const BUILT_AS: AppEnv = BUILD_APP_ENV;

let override: AppEnv | null = null;
const listeners = new Set<() => void>();

const notify = () => { listeners.forEach((fn) => fn()); };

/** The mode in force. Never anything but `production` in a production build. */
export const getAppEnv = (): AppEnv =>
  (CAN_OVERRIDE_ENV && override) ? override : BUILD_APP_ENV;

/** True when controls that reach otherwise-unreachable states may render. */
export const previewControls = (): boolean => getAppEnv() !== 'production';

/** True when the app may narrate itself to the console. */
export const debugLogs = (): boolean => getAppEnv() !== 'production';

/**
 * Which Food module the tab opens.
 *
 * Two conditions, both required: the mode in force is not production, and the
 * build was configured to want the dev module. Switching to development does
 * not conjure a Food build that was never asked for.
 */
export const foodMode = (): FoodMode =>
  getAppEnv() === 'production' ? 'production' : FOOD_MODE_CONFIGURED;

/**
 * Switch modes, and remember it across restarts.
 *
 * A no-op in a production build. Deliberately silent rather than throwing:
 * the caller is a toggle that is not rendered there, so a throw would only
 * ever fire if something had already gone wrong, and crashing a student's app
 * is a worse outcome than ignoring an impossible tap.
 */
export const setAppEnv = (next: AppEnv): void => {
  if (!CAN_OVERRIDE_ENV) return;
  if (next === override) return;

  override = next;
  notify();
  /* Fire and forget. A write that fails costs the preference on next launch,
     which is a build that behaves as it was built to — the safe direction. */
  AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
};

/** Drop the override and go back to what the build says. */
export const resetAppEnv = (): void => {
  if (!CAN_OVERRIDE_ENV) return;
  override = null;
  notify();
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
};

export const subscribeAppEnv = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

/**
 * Restore the saved override, once, at module load.
 *
 * Asynchronous, so the first frame renders as the build intends and flips a
 * moment later if an override was saved. That ordering is on purpose: the
 * gap shows the built-in behaviour, never more than it.
 *
 * Not attempted at all in a production build — there is nothing a stored
 * value could be allowed to do, so it is not read.
 */
if (CAN_OVERRIDE_ENV) {
  AsyncStorage.getItem(STORAGE_KEY)
    .then((stored) => {
      if (stored === 'development' || stored === 'preview' || stored === 'production') {
        override = stored;
        notify();
      }
    })
    .catch(() => {});
}
