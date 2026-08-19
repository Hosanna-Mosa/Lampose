/**
 * React's view of `services/runtimeEnv.ts`.
 *
 * `useSyncExternalStore` rather than a context, because the store already
 * exists and has non-React readers — the API client and the logger both ask
 * it whether to log. A provider would mean two sources of the same truth and
 * an ordering problem between them.
 *
 * The getters are stable module functions returning primitives, which is what
 * `useSyncExternalStore` needs: a fresh object each call would re-render on
 * every check.
 */
import { useSyncExternalStore } from 'react';

import {
  debugLogs,
  foodMode,
  getAppEnv,
  previewControls,
  subscribeAppEnv,
  type AppEnv,
} from '@/services/runtimeEnv';
import type { FoodMode } from '@/constants/env';

/** The mode in force, re-rendering the caller when it changes. */
export const useAppEnv = (): AppEnv => useSyncExternalStore(subscribeAppEnv, getAppEnv, getAppEnv);

/**
 * Whether preview controls may render.
 *
 * The replacement for the `PREVIEW_CONTROLS` constant at every call site that
 * is a component. The constant still exists and is still correct — it is the
 * build's answer — but a screen that read it would not re-render when the
 * mode was switched, so the controls would appear or vanish only on remount.
 */
export const usePreviewControls = (): boolean =>
  useSyncExternalStore(subscribeAppEnv, previewControls, previewControls);

export const useDebugLogs = (): boolean =>
  useSyncExternalStore(subscribeAppEnv, debugLogs, debugLogs);

export const useFoodMode = (): FoodMode =>
  useSyncExternalStore(subscribeAppEnv, foodMode, foodMode);
