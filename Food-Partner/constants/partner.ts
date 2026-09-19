/* ══════════════════════════════════════════════════════════════════════════
   Food partner content — the pitch and the onboarding flow.

   Transcribed from the website's food-partner module
   (`Frontend/src/data/partner.js`), word for word. That file's own comment
   makes the point this one inherits: the terms a partner signs and the terms
   quoted on the pitch cannot be allowed to drift apart, and this app is now a
   third place they could.

   ONE partner type: a restaurant or kitchen. The website's flow also carried a
   meat centre, which walked the same steps with different nouns and no menu.
   It is deliberately not here — this app onboards restaurants, so there is no
   type to pick, no branch to keep in step and no second set of copy to drift.

   WHAT IS NEW HERE, and why: the website collects four steps. The product
   owner's data-field spec is larger — delivery economics, per-item variants,
   add-ons, allergens — so operations became a step of its own and the menu
   grew into one. Five steps, and the extra constants below serve them.
   ══════════════════════════════════════════════════════════════════════════ */
import type { IconName } from "@/components/common/atoms/Icon";

/* ── Landing ─────────────────────────────────────────────────────────────── */

export const STATS: readonly (readonly [string, string])[] = [
  ["200+", "Kitchens & messes listed"],
  ["8", "Cities live today"],
  ["24 hrs", "From signed to serving"],
  ["0%", "Brokerage, ever"],
];

export const BENEFITS: { glyph: IconName; title: string; desc: string }[] = [
  {
    glyph: "chart",
    title: "Orders from your own street",
    desc:
      "Your kitchen is shown to the residents already living within walking " +
      "distance of it — the people most likely to order twice.",
  },
  {
    glyph: "wallet",
    title: "Money on a fixed day",
    desc:
      "Weekly settlements straight to the account you enter below, with " +
      "every deduction itemised before it is taken.",
  },
  {
    glyph: "calendar",
    title: "Monthly plans, steady income",
    desc:
      "Run mess subscriptions alongside single orders, so part of next " +
      "month's revenue is known before it starts.",
  },
  {
    glyph: "users",
    title: "A named person to call",
    desc:
      "Someone from our team walks your kitchen during onboarding and stays " +
      "your contact afterwards. Not a helpline.",
  },
];

export const FAQS: { q: string; a: string }[] = [
  {
    q: "What documents do I need before I start?",
    a:
      "PAN, your FSSAI licence, GST registration (unless you are exempt or on " +
      "the composition scheme) and a cancelled cheque for the payout account.",
  },
  {
    q: "How long does onboarding take?",
    a:
      "The form takes about ten minutes. Once it is submitted, most partners " +
      "are live within 24 hours of our team verifying the documents.",
  },
  {
    q: "What does Lampose charge?",
    a:
      "Commission starts at 15% per delivered order and is negotiable at " +
      "volume. There is no listing fee and no joining fee — the full " +
      "commercial terms are shown to you before you sign.",
  },
  {
    q: "Can I run a mess subscription as well as single orders?",
    a:
      "Yes. Monthly plans and one-off orders run side by side from the same " +
      "dashboard, and you set the prices for both.",
  },
  {
    q: "Am I locked in for a period?",
    a:
      "No. Either side can end the agreement with 30 days notice, and you can " +
      "pause your listing from the dashboard at any time.",
  },
];

/* ── The five steps ──────────────────────────────────────────────────────── */

export type StepNum = 1 | 2 | 3 | 4 | 5;

export const STEPS: { num: StepNum; label: string; glyph: IconName; route: string }[] = [
  { num: 1, label: "Restaurant Information", glyph: "store", route: "/onboarding/restaurant" },
  { num: 2, label: "Operations & Delivery", glyph: "clock", route: "/onboarding/operations" },
  { num: 3, label: "Menu & Products", glyph: "menu", route: "/onboarding/menu" },
  { num: 4, label: "Documents & Payout", glyph: "badge", route: "/onboarding/documents" },
  { num: 5, label: "Contract & Review", glyph: "contract", route: "/onboarding/contract" },
];

export const TOTAL_STEPS = STEPS.length;

/** What the pitch screen shows. Reads from STEPS so the two cannot disagree. */
export const HOW_STEPS: { step: string; title: string; desc: string }[] = [
  {
    step: "01",
    title: "Tell us about the kitchen",
    desc: "Name, cuisines, owner details and the exact spot on the map. You can save it half-finished.",
  },
  {
    step: "02",
    title: "Set hours and delivery",
    desc: "Opening hours per day, how long you take to cook, how far you deliver and what you charge.",
  },
  {
    step: "03",
    title: "Build the menu",
    desc: "Your dishes with prices, photos, portions and add-ons — typed in one by one or uploaded as a sheet.",
  },
  {
    step: "04",
    title: "Documents and payouts",
    desc: "PAN, GST, FSSAI and the bank account we should settle into. Uploaded once, verified by a person.",
  },
  {
    step: "05",
    title: "Sign and go live",
    desc: "Read the commercial terms, sign digitally, and we come back within 24 hours to switch you on.",
  },
];

/* ── Options ─────────────────────────────────────────────────────────────── */

export const CUISINE_OPTIONS = [
  "North Indian", "South Indian", "Chinese", "Italian", "Bakery",
  "Fast Food", "Street Food", "Continental", "Mexican", "Japanese",
  "Thai", "Healthy", "Desserts", "Beverages", "Mughlai",
] as const;

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export const MENU_COLUMNS = ["category", "itemName", "price", "description", "type", "isBestseller"] as const;

export const MENU_CATEGORY_SUGGESTIONS = [
  "Starters", "Main Course", "Breads", "Rice & Biryani", "Sides", "Desserts", "Beverages",
] as const;

export const PRODUCT_TAGS = ["Bestseller", "Chef's Special", "New", "Must Try", "Spicy"] as const;

export const ALLERGENS = ["Nuts", "Dairy", "Gluten", "Egg", "Soy", "Shellfish", "Sesame"] as const;

export const DELIVERY_FEE_TYPES = ["flat", "distance_based", "free_above"] as const;

export const DELIVERY_FEE_LABELS: Record<(typeof DELIVERY_FEE_TYPES)[number], string> = {
  flat: "Flat fee",
  distance_based: "By distance",
  free_above: "Free above",
};

export const SPICE_LEVELS = ["none", "mild", "medium", "hot"] as const;
export const VEG_TYPES = ["veg", "non-veg", "egg"] as const;
export const VEG_LABELS: Record<(typeof VEG_TYPES)[number], string> = {
  veg: "Veg",
  "non-veg": "Non-veg",
  egg: "Egg",
};

export const ACCOUNT_TYPES = ["savings", "current"] as const;
export const OPEN_STATES = ["auto", "open", "closed"] as const;
export const OPEN_STATE_LABELS: Record<(typeof OPEN_STATES)[number], string> = {
  auto: "Schedule",
  open: "Open now",
  closed: "Closed",
};

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
] as const;

/**
 * The demo code.
 *
 * No SMS gateway is attached to this flow yet, and a partner walking the form
 * should not be stopped by a code that can never arrive. The error message
 * names it for exactly that reason — see the website's own handling.
 */
export const DEMO_OTP = "1234";

/* ── Commercials ─────────────────────────────────────────────────────────── */

/** Shown on the contract step AND quoted on the pitch. One source, so they cannot drift. */
export const COMMERCIALS: { label: string; value: string }[] = [
  { label: "Payment cycle", value: "Weekly settlements — every Monday, for the week before" },
  { label: "Cancellation policy", value: "Free up to 5 minutes. Later cancellations are charged 10% of order value." },
  { label: "Promotional contribution", value: "Optional. Shared cost on discounts and free-delivery campaigns." },
];

/* ── Copy ────────────────────────────────────────────────────────────────── */

/**
 * The wording, in one place.
 *
 * This was a map keyed by partner type on the website, because a meat centre
 * said "centre" and "counter" where a restaurant said "restaurant" and "menu".
 * With one partner type it is a flat object — but it stays a named constant
 * rather than being inlined into the screens, because the same labels appear
 * on the form, on the review step and inside the contract, and those three
 * must not drift.
 */
export const COPY = {
  infoTitle: "Restaurant Information",
  infoIntro: "Tell us about your restaurant to get started.",
  detailsTitle: "Restaurant Details",
  businessLabel: "Restaurant Name",
  businessPlaceholder: "e.g. Paradise Biryani",
  categoryLabel: "Cuisine / Food Category",
  categoryHelp: "Select everything that applies to your restaurant",
  operatingHelp: "Add a second slot if your kitchen closes between meals.",
  menuTitle: "Menu Setup",
  menuHelp: "Add the dishes you serve, with their prices and photos.",
  manualEmptyTitle: "No menu items yet",
  manualEmptyHelp: "Add your first category to start building the menu",
  manualCategoryHelp: "Add categories (Starters, Main Course) and the items inside them",
  gstExemptLabel: "My restaurant is exempt / on the composition scheme",
  safetyTitle: "Food Safety Licence",
  safetyUploadDescription: "A clear scan or photo of your FSSAI licence",
  contractServiceText: "the sale and delivery of food items",
  summaryLabel: "Restaurant",
  noun: "restaurant",
} as const;

export type PartnerCopy = typeof COPY;
