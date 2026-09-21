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
  /**
   * Present only on the "near me" sentinel below — a radius around a fix,
   * standing in for a named area. `id`/`name`/`city` still carry a label a
   * screen can render without knowing this field exists; this is what the
   * feed reads instead of `name`/`city` when it is set.
   */
  near?: { lat: number; lng: number; radiusKm: number };
};

/**
 * "All locations" — the answer that is not an area.
 *
 * A real `Locality` rather than `null`, and that is the whole design of it.
 * `app/index.tsx` treats a null locality as "has not answered yet" and
 * redirects straight back to the picker, so a student who chose to search
 * everywhere would have been bounced into being asked again, forever. A
 * sentinel is an ANSWER, and it survives the same round trip every other
 * answer does.
 *
 * `city` is empty on purpose: it is what the feed reads to scope a query, and
 * an empty one means "do not scope it".
 *
 * `listingCount` and `medianRent` are deliberately not filled in. Both are
 * facts about one area and there is no honest figure for "everywhere" that
 * this type could carry — the row that offers it says so in words instead.
 */
export const ALL_LOCALITIES: Locality = {
  id: 'all',
  name: 'All locations',
  city: '',
  listingCount: 0,
  medianRent: null,
};

/** Whether this is the sentinel above rather than a real area. */
export function isAllLocalities(locality: Locality | null | undefined): boolean {
  return locality?.id === ALL_LOCALITIES.id;
}

/**
 * A radius around a fix, built the moment "Use my current location" and a
 * distance are both answered — see `NearbyRadiusDialog`.
 *
 * Shaped as a `Locality` rather than a parallel piece of app state so it
 * flows through exactly the machinery a real area already does:
 * `setLocality` persists it, a relaunch restores it, and `app/home.tsx`
 * only has to branch on `.near` being present rather than carry a second
 * kind of "where" alongside the first.
 *
 * `listingCount` and `medianRent` are unknown until the feed itself answers,
 * same reasoning as `ALL_LOCALITIES`.
 */
export function nearbyLocality(params: {
  lat: number;
  lng: number;
  radiusKm: number;
  /** What the geocoder could name at the fix, for the label only. */
  label?: string;
}): Locality {
  return {
    id: `near-${params.radiusKm}km-${params.lat.toFixed(3)}-${params.lng.toFixed(3)}`,
    /* Reads naturally inside "No hotels in {name} yet" and "places listed in
       {name}" — the sentences every other `Locality.name` already drops
       into — which is why this is "your N km radius" rather than "Within N
       km of you": the latter reads fine as a screen title and badly as a
       sentence's object. */
    name: params.label ? `your radius near ${params.label}` : `your ${params.radiusKm} km radius`,
    city: '',
    listingCount: 0,
    medianRent: null,
    near: { lat: params.lat, lng: params.lng, radiusKm: params.radiusKm },
  };
}

/** Whether this is a radius search rather than a named area. */
export function isNearbySearch(locality: Locality | null | undefined): boolean {
  return Boolean(locality?.near);
}

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
        /* The WhatsApp offer that used to be here is gone: codes go over the
           DLT-registered SMS gateway, and the Twilio number in this system
           messages property owners on templates approved for something else.
           There was nothing behind the button. */
        body: 'Our SMS provider rejected it, not your number. Please try again in a moment.',
        action: 'Try again',
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
