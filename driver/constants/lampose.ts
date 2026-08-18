/**
 * Content tables transcribed from the Lampose Driver design artifact.
 *
 * These are the exact strings, figures and status tones the design specifies.
 * Screens read from here rather than inlining copy, so the wording stays in one
 * place when it's swapped for live API data.
 */
import type { IconName } from "@/components/ui";
import type { ToneName } from "@/theme";

// ─── Delivery flow ────────────────────────────────────────────────────────────

export const STAGES = [
  "Accepted",
  "Going to restaurant",
  "Arrived at restaurant",
  "Picked up",
  "Going to customer",
  "Delivered",
] as const;

export const STAGE_HINTS = [
  "Head to Paradise Biryani. Navigation is ready.",
  "1.2 km to the restaurant. Follow the route.",
  "Show token 24 at the counter and check the items.",
  "Order in the bag. Drop address is now unlocked.",
  "3.6 km to Sneha at Morampudi Junction.",
  "Hand over the order and mark it delivered.",
] as const;

export const STAGE_CTAS = [
  "Start navigation",
  "Arrived at restaurant",
  "Order picked up",
  "Start delivery",
  "Arrived at customer",
  "Mark as delivered",
] as const;

export const ORDER_ITEMS = [
  { name: "Hyderabadi Chicken Biryani (Family)", qty: "× 1" },
  { name: "Mutton Keema Samosa", qty: "× 2" },
  { name: "Mirchi ka Salan", qty: "× 1" },
] as const;

// ─── Duty status copy ─────────────────────────────────────────────────────────

export type Phase =
  | "idle"
  | "connecting"
  | "searching"
  | "noorders"
  | "request"
  | "expired"
  | "active"
  | "done";

export const STATUS: Record<Phase, { tone: ToneName; head: string; sub: string }> = {
  idle: {
    tone: "muted",
    head: "You're offline",
    sub: "Go online to start receiving delivery requests.",
  },
  connecting: {
    tone: "success",
    head: "You're now online",
    sub: "Connecting you to the Rajahmundry dispatch…",
  },
  searching: {
    tone: "success",
    head: "You're online",
    sub: "Looking for delivery requests near you…",
  },
  noorders: {
    tone: "warning",
    head: "No orders right now",
    sub: "Demand is low in Morampudi. Try Danavaipeta — 8 partners are getting orders there.",
  },
  request: { tone: "success", head: "You're online", sub: "A delivery request is on screen." },
  expired: {
    tone: "success",
    head: "You're online",
    sub: "Looking for delivery requests near you…",
  },
  active: { tone: "success", head: "You're online", sub: "One delivery in progress." },
  done: { tone: "success", head: "You're online", sub: "Looking for delivery requests near you…" },
};

/** The online status when idle differs from the offline copy above. */
export const STATUS_ONLINE_IDLE: { tone: ToneName; head: string; sub: string } = {
  tone: "success",
  head: "You're online",
  sub: "Stay in a busy zone to get more orders.",
};

// ─── Orders ───────────────────────────────────────────────────────────────────

export type OrderRow = {
  rest: string;
  when: string;
  id: string;
  dist: string;
  earn: string;
  status: string;
  tone: ToneName;
};

export const ORDERS_TABS = ["Active", "Completed", "Cancelled"] as const;
export type OrdersTab = (typeof ORDERS_TABS)[number];

export const ORDERS: Record<OrdersTab, OrderRow[]> = {
  Active: [
    {
      rest: "Paradise Biryani",
      when: "Now · 7:42 pm",
      id: "#LP48291",
      dist: "4.8 km",
      earn: "₹86",
      status: "Picked up",
      tone: "brand",
    },
  ],
  Completed: [
    { rest: "KFC · Devi Chowk", when: "Today 6:58 pm", id: "#LP48277", dist: "3.1 km", earn: "₹64", status: "Delivered", tone: "success" },
    { rest: "Domino's · Morampudi", when: "Today 6:12 pm", id: "#LP48260", dist: "5.4 km", earn: "₹92", status: "Delivered", tone: "success" },
    { rest: "Sri Sai Tiffins", when: "Today 5:20 pm", id: "#LP48241", dist: "2.2 km", earn: "₹55", status: "Delivered", tone: "success" },
    { rest: "Paradise Biryani", when: "Today 3:04 pm", id: "#LP48198", dist: "6.0 km", earn: "₹104", status: "Delivered", tone: "success" },
    { rest: "Ohri's Tandoor", when: "Yesterday 9:10 pm", id: "#LP48102", dist: "4.0 km", earn: "₹78", status: "Delivered", tone: "success" },
  ],
  Cancelled: [
    { rest: "KFC · Devi Chowk", when: "Yesterday 8:30 pm", id: "#LP48090", dist: "1.4 km", earn: "₹25", status: "Restaurant closed", tone: "danger" },
    { rest: "Cream Stone", when: "14 Aug 7:15 pm", id: "#LP47980", dist: "0.0 km", earn: "₹0", status: "Customer cancelled", tone: "danger" },
  ],
};

export const TIMELINE = [
  { t: "Request accepted", at: "7:42 pm" },
  { t: "Reached Paradise Biryani", at: "7:47 pm" },
  { t: "Order picked up · token 24", at: "7:53 pm" },
  { t: "Left for Morampudi Junction", at: "7:54 pm" },
  { t: "Reached customer", at: "8:03 pm" },
  { t: "Delivered to Sneha Reddy", at: "8:05 pm" },
] as const;

export const ORDER_EARNINGS = [
  { l: "Delivery fee", v: "₹64", tone: "info" },
  { l: "Distance pay · 4.8 km", v: "₹12", tone: "info" },
  { l: "Customer tip", v: "₹10", tone: "success" },
  { l: "Adjustments", v: "₹0", tone: "muted" },
] as const;

// ─── Earnings ─────────────────────────────────────────────────────────────────

export const PERIODS_LIST = ["Today", "Week", "Month"] as const;
export type Period = (typeof PERIODS_LIST)[number];

export type PeriodData = {
  label: string;
  total: string;
  delta: string;
  orders: string;
  hours: string;
  /** [label, 0–1 height, isHighlighted] */
  bars: [string, number, number][];
  rows: { l: string; v: string; tone?: ToneName }[];
};

export const PERIODS: Record<Period, PeriodData> = {
  Today: {
    label: "Today · 16 August",
    total: "₹842",
    delta: "₹118 more than your daily average",
    orders: "12",
    hours: "6h 24m",
    bars: [["10a", 0.2, 0], ["12p", 0.55, 0], ["2p", 0.35, 0], ["4p", 0.28, 0], ["6p", 0.82, 0], ["8p", 1, 1], ["10p", 0.1, 0]],
    rows: [
      { l: "Delivery earnings", v: "₹648" },
      { l: "Distance pay", v: "₹86" },
      { l: "Incentives", v: "₹60", tone: "success" },
      { l: "Tips", v: "₹48", tone: "success" },
      { l: "Adjustments", v: "₹0", tone: "muted" },
    ],
  },
  Week: {
    label: "This week · 10–16 August",
    total: "₹5,940",
    delta: "₹640 more than last week",
    orders: "78",
    hours: "41h 10m",
    bars: [["Mon", 0.5, 0], ["Tue", 0.62, 0], ["Wed", 0.44, 0], ["Thu", 0.7, 0], ["Fri", 0.86, 0], ["Sat", 1, 0], ["Sun", 0.72, 1]],
    rows: [
      { l: "Delivery earnings", v: "₹4,510" },
      { l: "Distance pay", v: "₹620" },
      { l: "Incentives", v: "₹500", tone: "success" },
      { l: "Tips", v: "₹320", tone: "success" },
      { l: "Adjustments", v: "− ₹10", tone: "danger" },
    ],
  },
  Month: {
    label: "This month · August",
    total: "₹21,480",
    delta: "On track for your best month yet",
    orders: "286",
    hours: "162h 45m",
    bars: [["W1", 0.72, 0], ["W2", 0.88, 0], ["W3", 1, 1], ["W4", 0.2, 0]],
    rows: [
      { l: "Delivery earnings", v: "₹16,900" },
      { l: "Distance pay", v: "₹2,180" },
      { l: "Incentives", v: "₹1,600", tone: "success" },
      { l: "Tips", v: "₹840", tone: "success" },
      { l: "Adjustments", v: "− ₹40", tone: "danger" },
    ],
  },
};

export const PAYOUTS = [
  { amt: "₹3,240", date: "Scheduled 17 Aug", txn: "Pending", status: "Pending", tone: "warning" },
  { amt: "₹6,480", date: "11 Aug 2026", txn: "LPPAY-77401", status: "Completed", tone: "success" },
  { amt: "₹5,910", date: "4 Aug 2026", txn: "LPPAY-76812", status: "Completed", tone: "success" },
  { amt: "₹4,200", date: "28 Jul 2026", txn: "LPPAY-75990", status: "Failed · IFSC", tone: "danger" },
] as const;

export const PAYOUT_ROWS = [
  { l: "Deliveries included", v: "74" },
  { l: "Delivery earnings", v: "₹5,180" },
  { l: "Incentives", v: "₹900" },
  { l: "Tips", v: "₹405" },
  { l: "Adjustments", v: "− ₹5" },
  { l: "Bank account", v: "HDFC ••••8841" },
  { l: "Transaction ID", v: "LPPAY-77401" },
] as const;

export const INCENTIVES = [
  { tag: "Active today", tone: "brand", title: "Complete 10 deliveries today", sub: "Earn ₹300 extra on top of your trip earnings.", pct: 80, progress: "8 of 10 done", reward: "₹300", expiry: "Ends 11:59 pm" },
  { tag: "Peak hour", tone: "success", title: "Stay online 7–10 pm", sub: "₹40 bonus for every delivery in the dinner peak.", pct: 45, progress: "1h 21m of 3h", reward: "₹40 / order", expiry: "2h 39m left" },
  { tag: "Weekly", tone: "brand", title: "75 deliveries this week", sub: "Unlock a ₹1,000 weekly bonus.", pct: 64, progress: "48 of 75 done", reward: "₹1,000", expiry: "Ends Sunday" },
  { tag: "Locked", tone: "muted", title: "Refer a partner", sub: "Your friend must complete 30 deliveries in 14 days.", pct: 0, progress: "No referrals yet", reward: "₹1,500", expiry: "Always on" },
] as const;

// ─── Profile & account ────────────────────────────────────────────────────────

export type ProfileRow = {
  route: string;
  t: string;
  meta: string;
  tone?: ToneName;
  /** Name from the icon set. Every row carries one so the list is scannable. */
  icon: IconName;
};

export const PROFILE_ROWS: ProfileRow[] = [
  { route: "/profile-details", t: "Personal information", meta: "Arjun Kumar", icon: "profile" },
  { route: "/vehicle", t: "Vehicle", meta: "AP 05 CJ 4471", icon: "vehicle" },
  { route: "/documents", t: "Documents", meta: "1 needs attention", tone: "danger", icon: "documents" },
  { route: "/payouts", t: "Bank details", meta: "HDFC ••••8841", icon: "bank" },
  { route: "/earnings", t: "Performance", meta: "94% acceptance", icon: "trendingUp" },
  { route: "/orders", t: "Ratings & reviews", meta: "4.8 ★", icon: "star" },
  { route: "/incentives", t: "Incentives", meta: "3 active", icon: "rupee" },
  { route: "/support", t: "Help & support", meta: "", icon: "support" },
  { route: "/settings", t: "Settings", meta: "", icon: "settings" },
];

export const DOCS = [
  { t: "Driving licence", meta: "AP0320190004471 · expired 2 Aug 2026", status: "Expired", tone: "danger", act: "Upload new", reason: "Expired document. Upload a renewed licence within 3 days to keep receiving orders." },
  { t: "Vehicle registration", meta: "AP 05 CJ 4471 · valid till Mar 2027", status: "Verified", tone: "success", act: "Replace" },
  { t: "Aadhaar (ID proof)", meta: "•••• •••• 4412", status: "Verified", tone: "success", act: "Replace" },
  { t: "Vehicle insurance", meta: "Uploaded 14 Aug · under review", status: "Pending", tone: "warning", act: "Replace" },
  { t: "PAN card", meta: "Photo was blurred", status: "Rejected", tone: "danger", act: "Resubmit", reason: "Rejected: the number was not readable. Take the photo in good light, without flash glare." },
] as const;

export const VEHICLE_ROWS = [
  { l: "Vehicle type", v: "Two-wheeler", tone: "info" },
  { l: "Registration", v: "AP 05 CJ 4471", tone: "info" },
  { l: "Model", v: "Honda Activa 6G", tone: "info" },
  { l: "RC status", v: "Verified", tone: "success" },
  { l: "Insurance", v: "Under review", tone: "warning" },
  { l: "Delivery bag", v: "Issued 12 Mar 2024", tone: "info" },
] as const;

export const NOTIFS = [
  { cat: "Account", tone: "danger", t: "Your driving licence expired. Upload a renewed copy to keep receiving orders.", at: "9:02 pm", unread: true },
  { cat: "Earnings", tone: "success", t: "₹86 credited for order #LP48291.", at: "8:06 pm", unread: true },
  { cat: "Incentives", tone: "brand", t: "2 more deliveries to unlock your ₹300 daily bonus.", at: "7:30 pm", unread: true },
  { cat: "New order", tone: "info", t: "Delivery request from KFC Devi Chowk was declined.", at: "6:44 pm", unread: false },
  { cat: "Payouts", tone: "success", t: "₹6,480 paid to HDFC ••••8841.", at: "11 Aug", unread: false },
  { cat: "Support", tone: "info", t: "Support replied to ticket TCK-3391.", at: "15 Aug", unread: false },
  { cat: "System", tone: "muted", t: "App updated to 4.2.1 — faster order acceptance.", at: "12 Aug", unread: false },
] as const;

export const SWITCHES = [
  { k: "orders", t: "New order requests", sub: "Sound and vibration, even on silent" },
  { k: "earnings", t: "Earnings and payouts", sub: "Credits, withdrawals and failures" },
  { k: "incentives", t: "Incentives and bonuses", sub: "Progress reminders and new offers" },
  { k: "news", t: "Lampose updates", sub: "Product news and partner offers" },
] as const;

export const SETTING_ROWS = [
  { t: "Account", meta: "LPD-11742", toast: "Account details opened." },
  { t: "Language", meta: "English", toast: "Language options: English, తెలుగు, हिन्दी." },
  { t: "Privacy", meta: "", toast: "Privacy controls opened." },
  { t: "Security", meta: "PIN on", toast: "Security settings opened." },
  { t: "Location", meta: "Always allowed", toast: "Location permission is set to always allow." },
  { t: "Appearance", meta: "Light", toast: "Dark mode arrives in the next release." },
  { t: "Help & support", meta: "", toast: "Opening support." },
  { t: "Terms of service", meta: "", toast: "Terms opened." },
  { t: "Privacy policy", meta: "", toast: "Policy opened." },
  { t: "About Lampose", meta: "v4.2.1", toast: "Lampose Technologies, Hyderabad." },
] as const;

export const SUPPORT_TILES = [
  { t: "Order issue", sub: "Wrong or missing items, delays" },
  { t: "Payment issue", sub: "Missing earnings, payout failed" },
  { t: "Restaurant issue", sub: "Closed, order not ready" },
  { t: "Customer issue", sub: "Unreachable, refused order" },
  { t: "Account issue", sub: "Documents, suspension, ID" },
  { t: "Technical issue", sub: "App, GPS, notifications" },
] as const;

export const TICKETS = [
  { t: "Payment missing for #LP48102", id: "TCK-3391", at: "15 Aug, 9:24 pm", status: "Open", tone: "warning" },
  { t: "Restaurant was closed · #LP48090", id: "TCK-3350", at: "14 Aug", status: "Resolved", tone: "success" },
  { t: "GPS not updating during delivery", id: "TCK-3288", at: "9 Aug", status: "Resolved", tone: "success" },
] as const;

export const CHAT = [
  { me: true, t: "I completed order #LP48102 yesterday but ₹78 is not showing in my earnings.", at: "9:24 pm" },
  { me: false, t: "Thanks Arjun. I can see the delivery was marked complete at 9:10 pm. Checking the payment ledger now.", at: "9:27 pm" },
  { me: false, t: "The credit was held by a bank reference error. I have released it — it will reflect within 2 hours.", at: "9:31 pm" },
  { me: true, t: "Thank you.", at: "9:32 pm" },
] as const;

// ─── Onboarding ───────────────────────────────────────────────────────────────

export const ONB_STEPS = [
  "welcome",
  "phone",
  "otp",
  "personal",
  "vehicle",
  "docs",
  "bank",
  "pending",
  "rejected",
  "approved",
] as const;

export type OnbStep = (typeof ONB_STEPS)[number];

export type OnbField = { l: string; v: string; hint?: string; tone?: ToneName };
export type OnbListItem = { t: string; sub: string; status: string; tone: ToneName };

export type OnbSpec = {
  step?: number;
  logo?: boolean;
  centered?: boolean;
  title: string;
  body: string;
  cta: string;
  next: OnbStep | null;
  alt?: string;
  altStep?: OnbStep;
  altRoute?: string;
  fine?: string;
  fields?: OnbField[];
  list?: OnbListItem[];
  otp?: boolean;
  badge?: string;
  badgeTone?: ToneName;
  badgeSize?: number;
};

export const ONB: Record<OnbStep, OnbSpec> = {
  welcome: {
    logo: true,
    centered: true,
    title: "Earn on your own schedule",
    body: "Deliver for Rajahmundry's best restaurants. Get paid weekly, with instant withdrawals whenever you need them.",
    cta: "Create partner account",
    next: "phone",
    alt: "I already have an account",
    altStep: "phone",
    fine: "By continuing you agree to the Lampose partner terms.",
  },
  phone: {
    step: 1,
    title: "What's your mobile number?",
    body: "We send delivery requests and OTPs to this number. Use the number linked to your bank account.",
    cta: "Send OTP",
    next: "otp",
    fields: [{ l: "Mobile number", v: "+91 98490 41172", hint: "Change" }],
  },
  otp: {
    step: 1,
    title: "Enter the 6-digit code",
    body: "Sent to +91 98490 41172 by SMS.",
    cta: "Verify and continue",
    next: "personal",
    otp: true,
    alt: "Change number",
    altStep: "phone",
  },
  personal: {
    step: 2,
    title: "Your details",
    body: "This must match your government ID exactly, or verification will fail.",
    cta: "Continue",
    next: "vehicle",
    fields: [
      { l: "Full name", v: "Arjun Kumar", hint: "Edit" },
      { l: "Date of birth", v: "14 Jun 1996", hint: "Edit" },
      { l: "City", v: "Rajahmundry", hint: "Edit" },
      { l: "Profile photo", v: "arjun-photo.jpg", hint: "Retake", tone: "success" },
    ],
  },
  vehicle: {
    step: 3,
    title: "Vehicle information",
    body: "You can change your vehicle later from your profile.",
    cta: "Continue",
    next: "docs",
    fields: [
      { l: "Vehicle type", v: "Two-wheeler", hint: "Change" },
      { l: "Registration number", v: "AP 05 CJ 4471", hint: "Edit" },
      { l: "Model", v: "Honda Activa 6G", hint: "Edit" },
    ],
  },
  docs: {
    step: 4,
    title: "Upload your documents",
    body: "Photograph each document in good light. Verification usually takes under 24 hours.",
    cta: "Submit documents",
    next: "bank",
    list: [
      { t: "Driving licence", sub: "Front and back", status: "Uploaded", tone: "success" },
      { t: "Vehicle registration", sub: "RC book", status: "Uploaded", tone: "success" },
      { t: "Aadhaar card", sub: "ID proof", status: "Uploaded", tone: "success" },
      { t: "PAN card", sub: "Required for payouts", status: "Add", tone: "brand" },
    ],
  },
  bank: {
    step: 5,
    title: "Where should we pay you?",
    body: "Earnings are paid every Monday. Instant withdrawal is available any day for ₹5.",
    cta: "Save bank details",
    next: "pending",
    fields: [
      { l: "Account holder", v: "Arjun Kumar", hint: "Edit" },
      { l: "Account number", v: "•••• •••• 8841", hint: "Edit" },
      { l: "IFSC", v: "HDFC0001432", hint: "Edit" },
      { l: "UPI (optional)", v: "arjun@okhdfcbank", hint: "Edit" },
    ],
  },
  pending: {
    step: 6,
    centered: true,
    title: "Documents under review",
    body: "Our team is verifying your licence, RC and ID. You will get a notification the moment you are approved — usually within 24 hours.",
    cta: "Check status",
    next: "rejected",
    badge: "⌛",
    badgeTone: "warning",
    badgeSize: 64,
    alt: "Talk to support",
    altRoute: "/support",
    fine: "Submitted 16 Aug, 9:04 pm · reference LPD-11742",
  },
  rejected: {
    step: 6,
    title: "One document needs a fix",
    body: "Everything else is verified. Retake this photo and we will review it within an hour.",
    cta: "Resubmit PAN card",
    next: "approved",
    list: [
      { t: "PAN card", sub: "Rejected: number not readable, glare on the card", status: "Redo", tone: "danger" },
      { t: "Driving licence", sub: "Verified 16 Aug", status: "Verified", tone: "success" },
      { t: "Vehicle registration", sub: "Verified 16 Aug", status: "Verified", tone: "success" },
      { t: "Aadhaar card", sub: "Verified 16 Aug", status: "Verified", tone: "success" },
    ],
  },
  approved: {
    step: 7,
    centered: true,
    title: "You're approved, Arjun",
    body: "Your partner account is live. Go online and take your first delivery — first-week bonus of ₹500 on 20 deliveries.",
    cta: "Start driving",
    next: null,
    badge: "✓",
    badgeTone: "success",
    badgeSize: 72,
    fine: "Partner ID LPD-11742",
  },
};

export const ONB_TOTAL_STEPS = 7;

// ─── Driver identity (demo) ───────────────────────────────────────────────────

export const DRIVER = {
  name: "Arjun Kumar",
  initials: "AK",
  rating: "4.8 ★ · Rajahmundry zone",
  partnerId: "LPD-11742",
  phone: "+91 98490 41172",
  vehicle: "AP 05 CJ 4471",
  bank: "HDFC ••••8841",
} as const;

export const CURRENT_ORDER = {
  id: "#LP48291",
  restaurant: "Paradise Biryani",
  restaurantArea: "Danavaipeta",
  customer: "Sneha Reddy",
  dropArea: "Morampudi Junction",
  dropAddress: "Flat 302, Sai Enclave, Morampudi Junction",
  earn: "₹86",
  distance: "4.8 km",
  token: "24",
} as const;
