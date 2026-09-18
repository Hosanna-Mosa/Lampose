/* ══════════════════════════════════════════════════════════════════════════
   DEMO MODE — one hard-coded sign-in, served entirely from this file.

   ## Read this before shipping anything that imports it

   The credentials below are IN THE BUNDLE. Anyone who unzips the APK or AAB
   can read them, because a string in JavaScript is a string on disk. That is
   not something obfuscation fixes; it is what hard-coding a credential means.

   What makes it survivable is that they reach NOTHING. `api()` answers the
   sign-in itself and never sends it, `DEMO_TOKEN` is not a JWT so
   `requireDriver` would refuse it on sight, and every later request is
   answered from this file too. The worst somebody who extracts these strings
   can do is see the same invented rider you see.

   ## It is a departure from a decision this app already made

   `app/auth.tsx` says a rider signs in with a number and a six-digit code and
   that there is no password and is not going to be one — because a forgotten
   password reset over an email we may not have is a shift a rider does not
   work. That reasoning still stands for riders. This is not a password for
   riders: it is one account, for Play Console's reviewers, who cannot receive
   an Indian SMS. Riders never see it unless they type this exact pair.

   ## What it does NOT do

   No database, no network, no writes. The rider below is invented, and so is
   every job, every rupee and every distance on the screens behind it.
   ══════════════════════════════════════════════════════════════════════════ */

/* The one pair that opens it. Shared with the Stay Partner and Food-Partner
   apps so Play Console holds a single set of review credentials. */
const DEMO_EMAIL = "sunandvemavarapu@gmail.com";
const DEMO_PASSWORD = "sunand@1234";

export function isDemoCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
}

/*
 * Process-lifetime only, deliberately.
 *
 * Never persisted, so it cannot survive a relaunch and cannot be the state
 * somebody finds the app in without having just typed the credentials.
 */
let active = false;
export const isDemoActive = (): boolean => active;
export const enterDemo = (): void => { active = true; };
export const exitDemo = (): void => { active = false; };

/* Not a JWT. `requireDriver` refuses it instantly — nothing in demo mode can
   reach production. */
export const DEMO_TOKEN = "demo.not-a-real-token.do-not-send";

/**
 * The demo rider.
 *
 * APPROVED and onboarding-complete, because those two booleans are what the
 * app routes on: a pending rider lands on the onboarding stack, which is a
 * form, not a demonstration of the app. A reviewer needs to reach the tabs.
 *
 * `isOnline` is false — duty is the first thing a rider does, and leaving the
 * switch to be flipped shows the reviewer the actual control rather than a
 * screen that is already on.
 */
export const demoDriver = {
  driverId: "dmo_rider",
  name: "Sunand",
  phone: "+919704726252",
  email: DEMO_EMAIL,
  city: "Rajahmundry",
  status: "approved" as const,
  statusReason: "",
  vehicle: {
    type: "bike" as const,
    make: "Honda",
    model: "Activa",
    registrationNumber: "AP05AB1234",
  },
  address: null,
  /* Every document approved, so the profile screen shows a finished account
     rather than five "awaiting review" rows a reviewer cannot action. */
  documents: ["licence", "rc", "aadhaar", "pan", "insurance"].map((kind) => ({
    kind,
    status: "approved",
    url: "https://placehold.co/600x400/0F5F52/FFFFFF/png?text=Document",
    reason: "",
  })),
  payout: { accountLast4: "4321", ifscCode: "HDFC0000123", accountHolderName: "Sunand" },
  onboarding: { step: "done", complete: true, missing: [] as string[] },
  hasCompletedOnboarding: true,
  canGoOnline: true,
  blockedReason: "",
  locationFresh: true,
  isOnline: false,
  isAvailable: false,
  currentOrderNumber: null,
};

/*
 * No active job, and no earnings history.
 *
 * A delivery job is a live thing: it has a rider track, a kitchen track, a
 * fifteen-second offer timer and buttons that advance real state against the
 * server. An invented one would put controls on screen that go nowhere, which
 * reads as a broken app rather than a demo. "No active job" is a real,
 * ordinary state every one of these screens is already built to draw — it is
 * what a rider sees for most of a shift.
 */
const demoActiveJob = null;
const demoEarnings = {
  today: 0, week: 0, month: 0, total: 0,
  currency: "INR",
  trips: 0,
  items: [] as unknown[],
};

const ROUTES: Array<[RegExp, unknown]> = [
  [/\/drivers\/me$/, demoDriver],
  [/\/drivers\/active-job$/, demoActiveJob],
  [/\/drivers\/jobs\/active$/, demoActiveJob],
  [/\/drivers\/earnings/, demoEarnings],
  [/\/drivers\/orders/, []],
  [/\/drivers\/jobs/, []],
  [/\/drivers\/notifications/, []],
  [/\/drivers\/support\/categories$/, []],
  [/\/drivers\/support/, []],
  [/\/health/, { status: "ok", demo: true }],
];

/**
 * What demo mode answers a request with.
 *
 * Returns `{ handled: false }` when demo mode is off, so the real path pays
 * one boolean and nothing else.
 *
 * ## Why an unmatched route still answers
 *
 * Letting one through would defeat the point: it would 401, because
 * `DEMO_TOKEN` is not a JWT. An unmatched GET answers with an empty list and
 * an unmatched write with a bare success — both shapes these screens already
 * handle, because both are what a rider with nothing on right now receives.
 */
export function demoRespond(
  method: string,
  path: string,
): { handled: false } | { handled: true; payload: unknown } {
  if (!active) return { handled: false };

  const found = ROUTES.find(([pattern]) => pattern.test(path));
  if (found) return { handled: true, payload: { success: true, data: found[1] } };

  if (method === "GET") return { handled: true, payload: { success: true, data: [] } };

  /* A write in demo mode is accepted and dropped. Nothing is stored, so the
     next read returns the canned data again. */
  return { handled: true, payload: { success: true, data: null } };
}
