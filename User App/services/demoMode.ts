/* ══════════════════════════════════════════════════════════════════════════
   DEMO MODE — one hard-coded sign-in, served entirely from this file.

   ## Read this before shipping anything that imports it

   The credentials below are IN THE BUNDLE. Anyone who unzips the APK or AAB
   can read them, because a string in JavaScript is a string on disk. That is
   not something obfuscation fixes; it is what hard-coding a credential means.

   What makes it survivable is that they reach NOTHING. `apiRequest` answers
   the sign-in itself and never sends it, `DEMO_TOKEN` is not a JWT so
   `requireCustomer` would refuse it on sight, and every later request is
   answered from this file too. The worst somebody who extracts these strings
   can do is see the same invented account you see.

   The pair is deliberately the SAME one the Stay Partner, Driver and
   Food-Partner builds use, so Play Console holds one set of review
   credentials across all four listings. Because it is shared, a rule follows:
   it must never be set as the real password of any real account in any of the
   four identity systems. A string in a published bundle that also opens a
   live account is not a demo credential; it is a published password.

   ## Why it exists

   Play Console needs a working sign-in for review. The real sign-in sends an
   SMS code to an Indian mobile number, which a reviewer cannot receive.

   ## What it does NOT do

   No database, no network, no writes. The account below is invented, and so
   is every listing, booking and order behind it.
   ══════════════════════════════════════════════════════════════════════════ */

import type { BackendCustomer, BackendListingMeta } from '@/services/api/types';

const DEMO_EMAIL = 'sunandvemavarapu@gmail.com';
const DEMO_PASSWORD = 'sunand@1234';

export function isDemoCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
}

/*
 * Process-lifetime only, deliberately.
 *
 * Never persisted, so it cannot survive a relaunch and cannot be the state
 * somebody finds the app in without having just typed the credentials. The
 * real session IS persisted; this one is not, which is why a relaunch returns
 * to the entry screen.
 */
let active = false;
export const isDemoActive = (): boolean => active;
export const enterDemo = (): void => { active = true; };
export const exitDemo = (): void => { active = false; };

/* Not a JWT. `requireCustomer` refuses it instantly. */
export const DEMO_TOKEN = 'demo.not-a-real-token.do-not-send';

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();

export const demoCustomer: BackendCustomer = {
  id: 'dmo_customer',
  phone: '+919704726252',
  name: 'Sunand',
  email: DEMO_EMAIL,
  category: null,
  phoneVerifiedAt: iso(90),
  createdAt: iso(90),
};

/*
 * Listings, so the home screen has something to show.
 *
 * Kept short and plainly fictional. Prices and localities are invented; they
 * are not any real property Lampose lists, and nothing here should be mistaken
 * for one by somebody screenshotting the app.
 */
const demoListings = [
  {
    id: 'dmo_listing_1',
    listingId: 'dmo_listing_1',
    name: 'Green Meadows Residency',
    title: 'Green Meadows Residency',
    city: 'Visakhapatnam',
    locality: 'MVP Colony',
    address: 'MVP Colony, Visakhapatnam, Andhra Pradesh',
    rent: 6500,
    price: 6500,
    rentMin: 6500,
    rentMax: 9500,
    gender: 'any',
    roomTypes: ['single', 'double'],
    amenities: ['wifi', 'laundry', 'meals'],
    images: [] as string[],
    photos: [] as string[],
    ratingAvg: 0,
    ratingCount: 0,
    isAvailable: true,
    available: true,
  },
  {
    id: 'dmo_listing_2',
    listingId: 'dmo_listing_2',
    name: 'Sunrise Gents PG',
    title: 'Sunrise Gents PG',
    city: 'Visakhapatnam',
    locality: 'Gajuwaka',
    address: 'Gajuwaka, Visakhapatnam, Andhra Pradesh',
    rent: 5000,
    price: 5000,
    rentMin: 5000,
    rentMax: 7000,
    gender: 'male',
    roomTypes: ['triple'],
    amenities: ['wifi', 'meals'],
    images: [] as string[],
    photos: [] as string[],
    ratingAvg: 0,
    ratingCount: 0,
    isAvailable: true,
    available: true,
  },
];

/*
 * The entry screens' facets, built from the two listings above rather than
 * invented separately — a reviewer who reaches "Where are you looking?" from
 * the PG/Hostel tab has to see the same two areas the feed itself will show,
 * or the demo contradicts itself one screen later.
 *
 * This used to have no entry at all, and `/listings/meta` fell through to the
 * generic `/\/listings\/[^/]+$/` pattern below — matched because "meta" looks
 * exactly like a listing id to a regex that cannot tell the difference — and
 * came back shaped like ONE LISTING instead of `BackendListingMeta`. Reading
 * `.localities` off that wrong shape is `undefined`, which is why a reviewer
 * signed in with these exact credentials saw "No areas listed yet" on a build
 * whose real backend has areas in it: the request never reached the backend
 * at all, demo mode answered it, and it answered with the wrong fixture.
 */
const demoListingMeta: BackendListingMeta = {
  total: demoListings.length,
  cities: [
    { name: 'Visakhapatnam', count: 2, medianRent: 5750, categories: { PG_HOSTEL: 2 } },
  ],
  localities: [
    {
      id: 'dmo_locality_mvp_colony',
      name: 'MVP Colony',
      city: 'Visakhapatnam',
      listingCount: 1,
      medianRent: 6500,
      categories: { PG_HOSTEL: 1 },
    },
    {
      id: 'dmo_locality_gajuwaka',
      name: 'Gajuwaka',
      city: 'Visakhapatnam',
      listingCount: 1,
      medianRent: 5000,
      categories: { PG_HOSTEL: 1 },
    },
  ],
  categories: [{ name: 'PG_HOSTEL', slug: 'pg-hostel', count: 2 }],
  monthlyRent: { min: 5000, max: 6500, median: 5750 },
};

/*
 * Bookings, orders and requests are EMPTY on purpose.
 *
 * Each of those is a live thing with a state machine behind it — a stay
 * request has a three-minute deadline and a countdown, a food order has a
 * kitchen track and a rider track that advance against the server. An invented
 * one would put controls on screen that go nowhere, which reads as a broken
 * app rather than a demo. Empty is a real, ordinary state that every one of
 * these screens already has copy for: a student who has not booked yet.
 */
const ROUTES: Array<[RegExp, unknown]> = [
  [/\/customers\/me$/, demoCustomer],
  [/\/customers\/addresses/, []],
  /* Ahead of the two patterns below on purpose — `.find()` takes the first
     match, and `/\/listings\/[^/]+$/` (meant for "one listing by id") would
     otherwise claim "/listings/meta" first, since "meta" satisfies `[^/]+`
     exactly as well as a real id would. */
  [/\/listings\/meta$/, demoListingMeta],
  [/\/listings\/[^/]+$/, demoListings[0]],
  [/\/listings/, demoListings],
  [/\/properties\/[^/]+$/, demoListings[0]],
  [/\/properties/, demoListings],
  [/\/bookings/, []],
  [/\/stay-requests/, []],
  [/\/food\/orders/, []],
  [/\/food\/restaurants/, []],
  [/\/food/, []],
  [/\/saved/, []],
  [/\/notifications/, []],
  [/\/support\/categories$/, []],
  [/\/support/, []],
  [/\/health/, { status: 'ok', demo: true }],
];

/**
 * What demo mode answers a request with.
 *
 * Returns `{ handled: false }` when demo mode is off, so the real path pays
 * one boolean for it and nothing else.
 *
 * ## Why an unmatched route still answers
 *
 * This app defines far more endpoints than this file mocks. Letting one
 * through would defeat the point — it would 401, because `DEMO_TOKEN` is not a
 * JWT — so an unmatched GET answers with an empty list and an unmatched write
 * with a bare success. Both are shapes these screens already handle, because
 * both are what a new student with nothing yet receives.
 */
export function demoRespond(
  method: string,
  path: string,
): { handled: false } | { handled: true; payload: unknown } {
  if (!active) return { handled: false };

  const found = ROUTES.find(([pattern]) => pattern.test(path));
  if (found) return { handled: true, payload: { success: true, data: found[1] } };

  if (method === 'GET') return { handled: true, payload: { success: true, data: [] } };

  /* A write in demo mode is accepted and dropped. Nothing is stored, so the
     next read returns the canned data again. */
  return { handled: true, payload: { success: true, data: null } };
}
