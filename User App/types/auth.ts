import type { StayCategory } from '@/constants/tokens';

/**
 * Entry and auth shapes.
 *
 * The governing rule: nothing here asks for anything the product does not
 * need. One phone number and one name — that is the whole of it. Browsing
 * requires none of it.
 */

/* ------------------------------------------------------------------ *
 * Places
 * ------------------------------------------------------------------ */

export type Locality = {
  id: string;
  name: string;
  city: string;
  /** From the server. A locality with none is shown greyed, never hidden. */
  listingCount: number;
  /** The number that answers "which area can I afford?" on this screen. */
  medianRent: number | null;
  nearestLandmark?: string;
  /**
   * Colleges, coaching centres, metro stations and common misspellings.
   * A student from Warangal knows "near IIIT", not "Gachibowli".
   */
  aliases?: readonly string[];
};

/**
 * Matches a query against a name and its aliases.
 *
 * Autocorrect is off on these fields, so the misspellings have to be carried
 * in the data instead — "gachibowly", "kukat pally".
 */
export function matchesQuery(query: string, name: string, aliases: readonly string[] = []): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [name, ...aliases].some((candidate) => candidate.toLowerCase().includes(needle));
}

/* ------------------------------------------------------------------ *
 * Phone and code
 * ------------------------------------------------------------------ */

/** Indian mobile numbers start with 6, 7, 8 or 9. */
export function isValidIndianMobile(digits: string): boolean {
  return /^[6-9]\d{9}$/.test(digits);
}

export function phoneError(digits: string): string | undefined {
  if (digits.length === 0) return undefined;
  if (digits.length < 10) return undefined;
  if (!/^[6-9]/.test(digits)) {
    return 'Indian mobile numbers start with 6, 7, 8 or 9. Check the first digit.';
  }
  return undefined;
}

/**
 * The ways sending a code can fail.
 *
 * Every one of them names whose fault it is. A student on patchy 4G who is
 * told "invalid request" assumes their data pack died and stops trying.
 */
export type SendFailure = 'smsProvider' | 'offline' | 'rateLimited';

export type SendFailureCopy = {
  headline: string;
  body: string;
  action?: string;
};

export function sendFailureCopy(
  failure: SendFailure,
  params: { retryAfterLabel?: string } = {},
): SendFailureCopy {
  switch (failure) {
    case 'smsProvider':
      return {
        headline: "The SMS didn't send",
        body: 'Our SMS provider rejected it, not your number. Try again, or use WhatsApp instead.',
        action: 'Get the code on WhatsApp',
      };
    case 'offline':
      return {
        headline: 'No internet',
        body: 'You can keep browsing places offline. Signing in needs a connection.',
      };
    case 'rateLimited':
      return {
        headline: 'Too many tries',
        body: `Wait ${params.retryAfterLabel ?? 'a few minutes'} before asking for another code. This protects your number from being spammed.`,
      };
  }
}

/* ------------------------------------------------------------------ *
 * The user
 * ------------------------------------------------------------------ */

/**
 * What is stored about a person, and nothing more.
 *
 * Deliberately absent: gender (asked as a filter when it first matters, never
 * as an identity field — storing it here would silently hide half the
 * inventory forever), budget (lives in filters, where it can be changed in one
 * tap while comparing), move-in date (belongs to a booking, not a person), and
 * photo, date of birth or ID before a booking exists.
 */
export type AuthUser = {
  id: string;
  /** Owners see this when a bed is requested. Nothing else is shared. */
  name: string;
  phone: string;
  /** Optional. Receipts and the agreement PDF. */
  email?: string;
  /**
   * The category the feed is showing, synced from device state once an account
   * is attached — so a student who reinstalls or signs in on a second phone
   * does not have to answer the required entry question again.
   *
   * The device copy in `AppStateContext` is still what the feed reads. This is
   * a backup, never the source: a guest has no account and must still browse.
   */
  category?: StayCategory;
};

export type AuthStatus = 'hydrating' | 'guest' | 'awaitingCode' | 'signedIn';

/* ------------------------------------------------------------------ *
 * Blocking config
 * ------------------------------------------------------------------ */

/**
 * Delivered by the same config call that carries `serverTimeOffset`, so a
 * blocked client already knows the truth about the clock.
 */
export type AppConfig = {
  /** Set when the running build can no longer be trusted with money. */
  forceUpdate?: { currentVersion: string; requiredVersion: string; downloadSizeMb: number };
  /** `returnsAt` is a real timestamp — the screen shows a clock time, never "shortly". */
  maintenance?: { returnsAtLabel: string; pausedDeadlineNote?: string };
  serverTimeOffsetMs: number;
  otpLength: 4 | 6;
};
