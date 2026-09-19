/* ══════════════════════════════════════════════════════════════════════════
   DEMO MODE — one hard-coded sign-in, served entirely from this file.

   ## Read this before shipping anything that imports it

   The credentials below are IN THE BUNDLE. Anyone who unzips the APK or AAB
   can read them, because a string in JavaScript is a string on disk. That is
   not a bug to be fixed with obfuscation; it is what hard-coding a credential
   means. So:

     · This build must NOT go to Google Play, or to anybody outside the team.
     · The account it imitates is real, but NOTHING here can reach it. There is
       no token, no network call and no session the backend would accept — see
       `demoRespond` below. The worst somebody who extracts these strings can
       do is see the same invented data you see.

   ## Why it exists

   `POST /api/v2/partners/auth/login` is written, tested and committed, but the
   deployed API does not have it yet and returns 404. This lets the login form
   be used and demonstrated in the meantime. It is a stopgap with an expiry
   date: DELETE THIS DIRECTORY once the backend is deployed, and the real route
   takes over with no other change — `AuthContext` already calls it first and
   only falls through to here when the credentials match exactly.

   ## What it does NOT do

   It does not touch the database, and it does not write anything anywhere. The
   data below is invented. It is not this owner's 25 real properties, and no
   number on any screen means anything while demo mode is on.
   ══════════════════════════════════════════════════════════════════════════ */

import type { BackendPartner } from '@/services/api/types';

/* The one pair that opens it. Compared case-insensitively on the address, as
   every other email comparison in this app and in the backend is. */
const DEMO_EMAIL = 'sunandvemavarapu@gmail.com';
const DEMO_PASSWORD = 'sunand@1234';

export function isDemoCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
}

/*
 * Process-lifetime only, deliberately.
 *
 * Demo mode is NOT written to storage, so it cannot survive a restart and
 * cannot be the state somebody finds the app in without having just typed the
 * credentials. `AuthContext` persists a real session; it does not persist this
 * one, which is why a relaunch lands back on the login screen.
 */
let active = false;

export const isDemoActive = (): boolean => active;
export const enterDemo = (): void => { active = true; };
export const exitDemo = (): void => { active = false; };

/** Stable, obviously-not-real identifiers. `dmo_` so nothing mistakes it for
 *  a `prt_` id in a log. */
const DEMO_PARTNER_ID = 'dmo_demo_owner';
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();

export const demoPartner: BackendPartner = {
  id: DEMO_PARTNER_ID,
  phone: '+919704726252',
  name: 'Sunand',
  email: DEMO_EMAIL,
  businessName: 'Lampose Demo Stays',
  address: null,
  phoneVerifiedAt: iso(120),
  profileCompletedAt: iso(120),
  /* True, so sign-in lands on the dashboard rather than profile setup — the
     screen somebody opening a demo wants to see. */
  profileComplete: true,
  createdAt: iso(120),
};

/* A token-shaped string so anything that stores or logs one has something of
   the right type. It is NOT a JWT and the backend would reject it instantly,
   which is the point: demo mode must not be able to reach production. */
export const DEMO_TOKEN = 'demo.not-a-real-token.do-not-send';

/* ──────────────────────────────────────────────────────────────────────────
   The canned data
   ────────────────────────────────────────────────────────────────────────── */

const demoProperties = [
  {
    id: 'dmo_prop_1',
    propertyId: 'dmo_prop_1',
    name: 'Green Meadows Residency',
    title: 'Green Meadows Residency',
    city: 'Visakhapatnam',
    locality: 'MVP Colony',
    address: 'MVP Colony, Visakhapatnam, Andhra Pradesh',
    status: 'active',
    isAvailable: true,
    available: true,
    rooms: 12,
    occupiedRooms: 9,
    rentMin: 6500,
    rentMax: 9500,
    price: 6500,
    images: [] as string[],
    photos: [] as string[],
    ratingAvg: 0,
    ratingCount: 0,
    createdAt: iso(90),
  },
  {
    id: 'dmo_prop_2',
    propertyId: 'dmo_prop_2',
    name: 'Sunrise Gents PG',
    title: 'Sunrise Gents PG',
    city: 'Visakhapatnam',
    locality: 'Gajuwaka',
    address: 'Gajuwaka, Visakhapatnam, Andhra Pradesh',
    status: 'active',
    isAvailable: true,
    available: true,
    rooms: 8,
    occupiedRooms: 5,
    rentMin: 5000,
    rentMax: 7000,
    price: 5000,
    images: [] as string[],
    photos: [] as string[],
    ratingAvg: 0,
    ratingCount: 0,
    createdAt: iso(60),
  },
];

const demoBookings = [
  {
    id: 'dmo_bkg_1',
    bookingId: 'dmo_bkg_1',
    reference: 'LMP-DEMO-01',
    status: 'checked_in',
    guestName: 'Ravi Kumar',
    guestPhone: '+919000000001',
    propertyId: 'dmo_prop_1',
    propertyName: 'Green Meadows Residency',
    checkInAt: iso(14),
    checkOutAt: null as string | null,
    amount: 6500,
    createdAt: iso(15),
  },
];

/* Empty on purpose. A stay request has a three-minute deadline and a live
   countdown; inventing one would put a timer on screen that expires into a
   state nothing here can answer. An empty queue is a real, ordinary state the
   screen is already built to draw. */
const demoRequests: unknown[] = [];

const demoSummary = {
  properties: demoProperties.length,
  activeProperties: demoProperties.length,
  totalRooms: 20,
  occupiedRooms: 14,
  vacantRooms: 6,
  occupancyRate: 70,
  pendingRequests: 0,
  activeBookings: demoBookings.length,
  earningsThisMonth: 0,
  totalEarnings: 0,
  unreadNotifications: 0,
};

const demoEarnings = {
  total: 0,
  pending: 0,
  paid: 0,
  currency: 'INR',
  items: [] as unknown[],
  transactions: [] as unknown[],
};

/* ──────────────────────────────────────────────────────────────────────────
   The responder
   ────────────────────────────────────────────────────────────────────────── */

/*
 * Matched on the tail of the path so a version prefix cannot miss. Order
 * matters: the longest, most specific patterns are tested first, because
 * `/properties` is a prefix of `/properties/:id`.
 */
const ROUTES: Array<[RegExp, unknown]> = [
  [/\/partners\/me$/, demoPartner],
  [/\/partners\/summary$/, demoSummary],
  [/\/partners\/properties\/[^/]+$/, demoProperties[0]],
  [/\/partners\/properties$/, demoProperties],
  [/\/partners\/requests$/, demoRequests],
  [/\/partners\/bookings\/[^/]+$/, demoBookings[0]],
  [/\/partners\/bookings$/, demoBookings],
  [/\/partners\/earnings$/, demoEarnings],
  [/\/partners\/notifications$/, []],
  [/\/partners\/reviews$/, []],
  [/\/partners\/staff$/, []],
  [/\/partners\/payouts$/, []],
  [/\/partners\/payment-methods$/, []],
  [/\/partners\/complaints$/, []],
  [/\/partners\/invites$/, []],
  [/\/partners\/share-types$/, []],
  [/\/support\/categories$/, []],
  [/\/support\/tickets$/, []],
  [/\/health/, { status: 'ok', demo: true }],
];

/**
 * What demo mode answers a request with.
 *
 * Returns `{ handled: false }` when demo mode is off, so this costs one
 * boolean on the real path and nothing else.
 *
 * ## Why an unmatched route still answers
 *
 * Fifty-eight endpoints are defined in `endpoints.ts` and this file mocks
 * about twenty. Letting the rest through to the network would defeat the
 * point — they would 401, because `DEMO_TOKEN` is not a JWT — so an unmatched
 * GET answers with an empty list and an unmatched write answers with a bare
 * success. Both are shapes the screens already handle, because both are what
 * an owner with nothing yet genuinely receives.
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
     next read returns the canned data again — a "saved" toast followed by an
     unchanged screen is the honest outcome of a mode with no database. */
  return { handled: true, payload: { success: true, data: null } };
}
