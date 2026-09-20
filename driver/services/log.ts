/**
 * Console output that disappears in a production build.
 *
 * Ported from `Stay Partner/lib/log.ts` / `User App/lib/log.ts`, placed in
 * `services/` rather than a `lib/` folder — this app has no `lib/`, and the
 * other small single-purpose helpers it already has (`secureStore.ts`,
 * `alertSound.ts`) live here.
 *
 * ## Why these calls are not just left as `console.warn`
 *
 * Several of them log the *error object* a fetch, socket drop or location fix
 * failed with. On a handset nobody is reading that console, but it is still a
 * copy of this rider's own job, address and earnings data written somewhere
 * it did not ask to go, and on Android it is readable by anything holding the
 * log permission.
 *
 * Nothing here changes what the rider sees. Every call site this replaces
 * sits beside a state update or a UI fallback that already handles the
 * failure; the console line is only the developer's copy, and only the
 * developer's copy is removed.
 *
 * ## `redact`
 *
 * Mirrors the regex `User App/services/api/client.ts` runs before previewing
 * a request body (`/pass(word)?|token|secret|otp/i`). Nothing in this app
 * currently logs a request body or a server payload, but a call site that
 * starts doing so gets the same scrub for free rather than having to
 * remember to add it.
 */
import { DEBUG_LOGS } from "@/constants/env";

/** A failure the app already handled and showed. Silent in production. */
export const logWarn = (...args: unknown[]): void => {
  if (DEBUG_LOGS) console.warn(...args);
};

/** Narration while building. Silent in production. */
export const logInfo = (...args: unknown[]): void => {
  if (DEBUG_LOGS) console.log(...args);
};

/** A short, safe rendering of a value for the dev console — scrubs anything
 *  keyed like a credential before it is stringified. */
export const redact = (value: unknown): string => {
  try {
    const json = JSON.stringify(value, (key, v) =>
      /pass(word)?|token|secret|otp/i.test(key) ? "***" : v,
    );
    return json.length > 200 ? `${json.slice(0, 200)}…` : json;
  } catch {
    return "<unserialisable>";
  }
};
