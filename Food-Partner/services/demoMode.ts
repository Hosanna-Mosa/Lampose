/* ══════════════════════════════════════════════════════════════════════════
   DEMO MODE — one hard-coded sign-in, served entirely from this file.

   ## Read this before shipping anything that imports it

   The credentials below are IN THE BUNDLE. Anyone who unzips the APK or AAB
   can read them, because a string in JavaScript is a string on disk. That is
   not something obfuscation fixes; it is what hard-coding a credential means.

   What makes that survivable here is that they reach NOTHING. `api()` answers
   the sign-in itself and never sends it, `DEMO_TOKEN` is not a JWT so the
   server would refuse it on sight, and every later request is answered from
   this file too. The worst somebody who extracts these strings can do is see
   the same invented kitchen you see.

   That property is load-bearing and easy to destroy: this app's real login,
   `POST /api/v2/food-partners/auth/login`, IS deployed and working. If a real
   restaurant account is ever given this password, the string in the bundle
   stops being harmless and becomes that kitchen's account — its orders, its
   customers' addresses and its payout details. Do not create one.

   ## Why it exists

   Play Console needs a working sign-in for review. This provides one without
   handing reviewers a real restaurant's account.

   ## What it does NOT do

   No database, no network, no writes. The kitchen below is invented — every
   order, every number, every rupee.
   ══════════════════════════════════════════════════════════════════════════ */

/* The one pair that opens it. Shared with the Stay Partner and Driver apps so
   Play Console holds a single set of review credentials. */
const DEMO_EMAIL = "sunandvemavarapu@gmail.com";
const DEMO_PASSWORD = "sunand@1234";

/** The sign-in form has ONE box that takes an email OR a phone number, so the
 *  identifier is compared the way the server compares it: trimmed, lowercased. */
export function isDemoCredentials(identifier: string, password: string): boolean {
  return identifier.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
}

/*
 * Process-lifetime only, deliberately.
 *
 * Demo mode is never persisted, so it cannot survive a relaunch and cannot be
 * the state somebody finds the app in without having just typed the
 * credentials. The store persists its session; this flag is not part of it.
 */
let active = false;
export const isDemoActive = (): boolean => active;
export const enterDemo = (): void => { active = true; };
export const exitDemo = (): void => { active = false; };

/* Not a JWT. `requireFoodPartner` would refuse it immediately, which is the
   point: nothing in demo mode can reach production. */
export const DEMO_TOKEN = "demo.not-a-real-token.do-not-send";

const DEMO_RESTAURANT_ID = "dmo_kitchen";

export const demoRestaurant = {
  restaurantId: DEMO_RESTAURANT_ID,
  restaurantName: "Lampose Demo Kitchen",
  ownerName: "Sunand",
  ownerEmail: DEMO_EMAIL,
  ownerPhone: "+919704726252",
  description: "A sample kitchen for demonstrating the partner app.",
  cuisineTypes: ["South Indian", "Tiffins"],
  address: {
    line1: "12-3-45, Danavaipeta",
    city: "Rajahmundry",
    state: "Andhra Pradesh",
    pincode: "533103",
  },
  contactNumber: "+919704726252",
  openingHours: [
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  ].map((day) => ({ day, openTime: "07:00", closeTime: "22:00" })),
  openState: "open" as const,
  isCurrentlyOpen: true,
  avgPreparationTime: 20,
  deliveryRadiusKm: 5,
  minOrderValue: 99,
  packagingCharge: 10,
  deliveryFee: { type: "flat", amount: 25 },
  acceptsOnlinePayment: true,
  acceptsCod: true,
  /* Approved, so the app opens on the order queue rather than on the
     "your application is being reviewed" screen — which is the screen a
     reviewer would otherwise be stuck on, with nothing to assess. */
  verificationStatus: "approved" as const,
  verificationNote: "",
  isActive: true,
  /* Zero, and left that way. A rating is derived from diners who ordered;
     inventing a 4.3 would put a fabricated number where a real one goes. */
  ratingAvg: 0,
  ratingCount: 0,
  menuItemCount: 3,
};

const demoMenu = [
  {
    id: "dmo_item_1", productId: "dmo_item_1", name: "Idli (2 pcs)",
    description: "Steamed rice cakes with chutney and sambar.",
    price: 40, isVeg: true, isAvailable: true, section: "Tiffins", category: "Tiffins",
    images: [] as unknown[],
  },
  {
    id: "dmo_item_2", productId: "dmo_item_2", name: "Masala Dosa",
    description: "Crisp dosa with a spiced potato filling.",
    price: 70, isVeg: true, isAvailable: true, section: "Tiffins", category: "Tiffins",
    images: [] as unknown[],
  },
  {
    id: "dmo_item_3", productId: "dmo_item_3", name: "Chicken Biryani",
    description: "Hyderabadi-style dum biryani with raita.",
    price: 180, isVeg: false, isAvailable: true, section: "Mains", category: "Mains",
    images: [] as unknown[],
  },
];

/*
 * The order queue is EMPTY on purpose.
 *
 * A live order carries a kitchen track (`status`) and a rider track
 * (`dispatch.state`) that advance against a real backend, and the screen is
 * built to drive them — accept, start preparing, mark ready. An invented order
 * would offer buttons that go nowhere, which reads as a broken app rather than
 * a demo. An empty queue is a real, ordinary state with copy already written
 * for it: a kitchen with nothing cooking right now.
 */
const demoOrders: unknown[] = [];

const ROUTES: Array<[RegExp, unknown]> = [
  [/\/food-partners\/me$/, { ...demoRestaurant, restaurant: demoRestaurant, isCurrentlyOpen: true }],
  [/\/food-partners\/menu\/[^/]+$/, demoMenu[0]],
  [/\/food-partners\/menu/, demoMenu],
  [/\/food-partners\/products\/[^/]+$/, demoMenu[0]],
  [/\/food-partners\/products/, demoMenu],
  [/\/food-partners\/orders\/[^/]+$/, null],
  [/\/food-partners\/orders/, demoOrders],
  [/\/food-partners\/support\/categories$/, []],
  [/\/food-partners\/support/, []],
  [/\/health/, { status: "ok", demo: true }],
];

/**
 * What demo mode answers a request with.
 *
 * Returns `{ handled: false }` when demo mode is off, so the real path pays
 * one boolean for it and nothing else.
 *
 * ## The sign-in is answered here too
 *
 * `/auth/login` is matched BEFORE demo mode is active, because it is the call
 * that turns it on. Only the exact credential pair is claimed — anything else
 * falls through to the real, deployed route, so a genuine restaurant signing
 * in on this build is completely unaffected.
 *
 * ## Why an unmatched route still answers
 *
 * Letting one through would defeat the point: it would 401, because
 * `DEMO_TOKEN` is not a JWT. An unmatched GET answers with an empty list and
 * an unmatched write with a bare success — both shapes these screens already
 * handle, because both are what a kitchen with nothing yet receives.
 */
export function demoRespond(
  method: string,
  path: string,
  body?: unknown,
): { handled: false } | { handled: true; payload: unknown } {
  if (/\/auth\/login$/.test(path) && method === "POST") {
    const b = (body || {}) as { identifier?: string; email?: string; password?: string };
    const id = String(b.identifier ?? b.email ?? "");
    if (isDemoCredentials(id, String(b.password ?? ""))) {
      enterDemo();
      return {
        handled: true,
        payload: { success: true, data: { token: DEMO_TOKEN, restaurant: demoRestaurant } },
      };
    }
    /* Not the demo pair — the real route handles it. */
    return { handled: false };
  }

  if (!active) return { handled: false };

  const found = ROUTES.find(([pattern]) => pattern.test(path));
  if (found) return { handled: true, payload: { success: true, data: found[1] } };

  if (method === "GET") return { handled: true, payload: { success: true, data: [] } };

  /* A write in demo mode is accepted and dropped. Nothing is stored, so the
     next read returns the canned data again. */
  return { handled: true, payload: { success: true, data: null } };
}
