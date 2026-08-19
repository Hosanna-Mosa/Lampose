/**
 * Console output that disappears in a production build.
 *
 * ## Why these calls are not just left as `console.warn`
 *
 * The screens log the *error object* when a fetch fails — `console.warn('Failed
 * to load bookings:', err)`. That object carries the response it came from, so
 * what reaches the log is an owner's bookings, payout methods and staff list.
 * On a handset nobody is reading that console, but it is still a copy of one
 * person's data written somewhere they did not ask for, and on Android it is
 * readable by anything holding the log permission.
 *
 * Nothing here changes what the user sees. Every one of these calls sits
 * beside a state update that renders a real error message; the log is the
 * developer's copy, and only the developer's copy is removed.
 *
 * ## Why a module rather than `if (debugLogs())` at each site
 *
 * There were twenty of them, and the next screen will add another. A helper
 * makes the safe form the shortest one to write.
 */
import { debugLogs } from '@/services/runtimeEnv';

/** A failure the app already handled and showed. Silent in production. */
export const logWarn = (...args: unknown[]): void => {
  if (debugLogs()) console.warn(...args);
};

/** Narration while building. Silent in production. */
export const logInfo = (...args: unknown[]): void => {
  if (debugLogs()) console.log(...args);
};
