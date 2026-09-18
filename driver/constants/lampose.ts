/**
 * The app's fixed COPY — and nothing that pretends to be a rider's data.
 *
 * This began as the whole design artifact transcribed: every string, every
 * figure, every status tone, so screens could be built before the backend
 * existed. Almost all of it has since been deleted rather than left lying
 * about, and the notes below say which table went and why, because the pattern
 * is the same every time. A table of plausible values does not stay inert. A
 * screen reaches for it on the day the real list comes back empty, and then a
 * rider is reading somebody's example week as their own — eight deliveries
 * they did not make, ₹6,480 paid to an account they never opened, a licence
 * they hold being called expired.
 *
 * What belongs here now is wording that is true for every rider whatever their
 * account says: stage names, tab labels, the sentence under a duty state. What
 * does not belong here is any number, name, date or status about a particular
 * rider. Those have exactly one source each, and it is the server.
 */
import type { IconName } from "@/components/ui";
import type { ToneName } from "@/theme";

// ─── Delivery flow ────────────────────────────────────────────────────────────

/*
 * FIVE stages, every one of which an order actually reaches.
 *
 * There used to be six, with "Picked up" between "Arrived at restaurant" and
 * "Going to customer". `selectStage` could never return it — the moment the
 * kitchen code is accepted the order is `picked_up`, which IS "going to the
 * customer" — so the rail skipped from stage 3 to stage 5 and filled five of
 * six bars the instant the food went in the bag. A rider who had just
 * collected saw a progress bar that said they were nearly finished, and a
 * diner watching the same journey saw the step after theirs already marked.
 *
 * A stage nothing can occupy is a stage that only ever miscounts the ones
 * around it.
 */
export const STAGES = [
  "Accepted",
  "Going to restaurant",
  "Arrived at restaurant",
  "Going to customer",
  "Delivered",
] as const;

/*
 * One line of guidance per stage, indexed by `selectStage`.
 *
 * Deliberately free of names, distances and codes. Those are on the cards
 * around this line and come from the ORDER — a hint that named a restaurant
 * would be naming the wrong one on every job but the fixture it was written
 * for, and a rider reading "1.2 km to the restaurant" over a 4km trip stops
 * reading the hints at all.
 */
export const STAGE_HINTS = [
  "Job accepted. The pickup is on the card below.",
  "Head to the restaurant. The address is on the card below.",
  "Ask at the counter for the 4-digit code, and check the items against the list.",
  "Order in the bag and the drop address unlocked. Take the customer's PIN at the door.",
  "Delivered. Nothing further to do.",
] as const;

export const STAGE_CTAS = [
  "Start navigation",
  "Arrived at restaurant",
  "Order picked up",
  "Mark as delivered",
  "Delivered",
] as const;

/*
 * `ORDER_ITEMS` is gone. Three named dishes with quantities, which no screen
 * has read since the active screen started rendering `currentJob.lines` — the
 * real contents of the real order, from the server.
 */

// ─── Duty status copy ─────────────────────────────────────────────────────────

/**
 * The three duty states the home screen can actually be in.
 *
 * There used to be eight. `connecting` announced "Connecting you to the
 * Rajahmundry dispatch…", `noorders` read "Demand is low in Morampudi. Try
 * Danavaipeta — 8 partners are getting orders there." — a claim about live
 * demand in two named neighbourhoods, computed by nothing, that would have
 * sent a rider across a city on it. Neither could ever be reached: the screen
 * derives its phase from whether a job is held and whether duty is on, and
 * that has exactly three answers. A phase nothing can occupy is copy nobody
 * has to keep true.
 */
export type Phase = "idle" | "searching" | "active";

export const STATUS: Record<Phase, { tone: ToneName; head: string; sub: string }> = {
  idle: {
    tone: "muted",
    head: "You're offline",
    sub: "Go online to start receiving delivery requests.",
  },
  searching: {
    tone: "success",
    head: "You're online",
    sub: "Looking for delivery requests near you…",
  },
  active: { tone: "success", head: "You're online", sub: "One delivery in progress." },
};

/** The online status when idle differs from the offline copy above. */
export const STATUS_ONLINE_IDLE: { tone: ToneName; head: string; sub: string } = {
  tone: "success",
  head: "You're online",
  sub: "Stay in a busy zone to get more orders.",
};

// ─── Orders ───────────────────────────────────────────────────────────────────

/*
 * `OrderRow`, `ORDERS`, `TIMELINE` and `ORDER_EARNINGS` are gone.
 *
 * Eight example deliveries from Paradise Biryani and KFC Devi Chowk, a
 * six-step timeline ending "Delivered to Sneha Reddy", and an earnings
 * breakdown with a ₹10 customer tip in it. The Orders tab renders
 * `GET /me/orders` and the detail screen renders the order behind the row; a
 * table of plausible deliveries sitting beside them is what a screen reaches
 * for on the day the real list comes back empty.
 */

export const ORDERS_TABS = ["Active", "Completed", "Cancelled"] as const;
export type OrdersTab = (typeof ORDERS_TABS)[number];

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

/*
 * The `PERIODS` table is gone: three periods of invented totals — "₹842",
 * "₹5,940", "₹21,480" — with hour-by-hour bars, a "₹118 more than your daily
 * average" comparison and rows for tips and incentives this product does not
 * have. The Earnings tab builds a `PeriodData` from `GET /me/earnings` and
 * shows a loading state before it, which is what the shape below is for.
 */

/*
 * `PAYOUTS`, `PAYOUT_ROWS` and `INCENTIVES` are gone with the four screens
 * that displayed them.
 *
 * A ledger of four settlements with transaction ids, the breakdown of one of
 * them naming HDFC ••••8841, and four bonus schemes with progress bars.
 * Nothing in the backend pays out, records a settlement or defines an
 * incentive: there is no route and no model for any of it, so every figure in
 * those three tables was a number about a rider's money that no rider could
 * ever have earned or been owed.
 *
 * The distinction that matters, and that the last pass lost: a rider's BANK
 * DESTINATION is a real stored field — `drivers.payout`, written by
 * `PATCH /me` — and it is the only part of any of this the product actually
 * has. Deleting the ledger was right. Deleting the row that let a rider edit
 * where their money goes was not, and `/bank-details` is that row's screen.
 */

// ─── Profile & account ────────────────────────────────────────────────────────

export type ProfileRow = {
  route: string;
  t: string;
  meta: string;
  tone?: ToneName;
  /** Name from the icon set. Every row carries one so the list is scannable. */
  icon: IconName;
};

/*
 * The account list on the Profile tab.
 *
 * `meta` is EMPTY on every row: the screen fills these from `profile`, and a
 * placeholder left in this table is a value that looks live and is not.
 * `tone` is likewise absent — a red Documents row means a document was
 * actually refused, and only the profile knows that.
 *
 * "Incentives" has gone: the screen behind it was deleted with the four bonus
 * schemes that were its only content, and a list row that navigates to a route
 * with no file behind it is a crash rather than a dead end.
 *
 * "Bank details" went with it and should not have. The row pointed at
 * `/payouts`, which was deleted for its invented balance and its Withdraw
 * button — but that screen was also the only way a rider could change where
 * their money is sent after sign-up, and THAT half is real: `PATCH /me`
 * validates and stores a `payout` object, and always has. Removing the row
 * left a rider whose bank account closes with no way to say so and a
 * settlement heading for an account that no longer exists. It now points at
 * `/bank-details`, which is that half and nothing else — no balance, no
 * withdrawal, no history.
 */
export const PROFILE_ROWS: ProfileRow[] = [
  { route: "/profile-details", t: "Personal information", meta: "", icon: "profile" },
  { route: "/vehicle", t: "Vehicle", meta: "", icon: "vehicle" },
  { route: "/documents", t: "Documents", meta: "", icon: "documents" },
  { route: "/bank-details", t: "Bank details", meta: "", icon: "bank" },
  { route: "/earnings", t: "Earnings", meta: "", icon: "trendingUp" },
  { route: "/orders", t: "Delivery history", meta: "", icon: "orders" },
  { route: "/support", t: "Help & support", meta: "", icon: "support" },
  { route: "/settings", t: "Settings", meta: "", icon: "settings" },
];

/*
 * `DOCS` and `VEHICLE_ROWS` are gone. The Documents screen renders
 * `profile.documents` — the five-row checklist the server builds, each row
 * carrying the approver's verdict and, when refused, the sentence saying what
 * to photograph again. The Vehicle screen reads and writes `profile.vehicle`.
 */

/*
 * `NOTIFS`, `SWITCHES` and `SETTING_ROWS` are gone.
 *
 * NOTIFS was seven fixed alerts, and the first of them read "Your driving
 * licence expired. Upload a renewed copy to keep receiving orders." Shown to
 * every rider who opened the bell, on every launch, whatever the approver had
 * actually said about their licence — and a rider who believes it goes home
 * rather than working a shift they were entitled to work. Beneath it, "₹86
 * credited for order #LP48291" and "₹6,480 paid to HDFC ••••8841": money
 * movements presented as this rider's own. There is no notification model and
 * no endpoint that could ever have made any of it true, so the screen went
 * with the table.
 *
 * SWITCHES was four notification toggles writing to in-memory flow state that
 * reset on launch and was read by nothing. SETTING_ROWS was ten rows of
 * `meta` asserted about the handset in front of the rider — "Security · PIN
 * on", "Location · Always allowed" — beside a partner id, "LPD-11742", that
 * belonged to nobody. `app/settings.tsx` now shows the rider's own id and
 * standing from `profile`, and its rows do the thing they name.
 */

/*
 * `SUPPORT_TILES`, `TICKETS` and `CHAT` are gone.
 *
 * Support is real: `app/support.tsx` lists the rider's own threads from
 * `/api/v2/drivers/support/tickets`, `app/ticket.tsx` is the thread behind a
 * reference, and the topics come from `GET …/support/categories` because the
 * server owns that enum. The tiles were the worst of the three — six topic
 * words sitting beside the seven the server accepts, which is exactly the
 * drift `services/support.ts` exists to prevent.
 */

// ─── Onboarding ───────────────────────────────────────────────────────────────

/*
 * The ONB table used to live here: ten screens of example values — a name, a
 * plate, four "Uploaded" documents — that `app/onboarding.tsx` rendered as
 * read-only text. It has been deleted rather than left unused.
 *
 * Sign-up is now a real form against `/api/v2/drivers`: every field is a
 * control the rider types into, each step PATCHes before it advances, and the
 * document checklist is `profile.documents` from the server, with the
 * approver's verdict and reason on each row. A leftover table of plausible
 * values is exactly what a future screen reaches for when the real data is one
 * request away, so there is no longer one to reach for.
 */

// ─── Demo identity ────────────────────────────────────────────────────────────

/*
 * `DRIVER` and `CURRENT_ORDER` are gone for the same reason as ONB above. The
 * rider's own name, partner id, vehicle and bank now come from
 * `useDriverStore().profile`, and the job in hand from `currentJob` — both of
 * which are the account, not a stand-in for one.
 */
