/* ══════════════════════════════════════════════════════════════════════════
   Dine-in, from the kitchen's side: the floor it describes, and the table
   requests diners send it.

   `/api/v2/food-partners/me/dine-in` and `/me/table-bookings`, behind the same
   session as `/me/orders`. The rules — thirty-minute slots, the fifteen
   minutes a request has to be answered in, when "arrived" and "no-show" open —
   live in the backend's `modules/dineIn/`, and nothing here re-derives them.
   Every booking arrives carrying an `actions` block that says which buttons
   the server would accept RIGHT NOW, and that block is what a screen draws.

   ## Seating Capacity and Number of Tables are never sent

   The server works both out from the table types (`4 seats × 6 tables`). A
   form that let somebody type them beside a list that already implies them
   would be three answers to one question, so the form shows them read-only
   and the save carries only the table types.

   ## The socket is the order socket

   `table_booking_requested` and `table_booking_updated` arrive in the same
   `restaurant:<id>` room as `order_placed`, on the one connection
   `orderSocket.ts` holds. `tablePump.ts` is what listens for them.
   ══════════════════════════════════════════════════════════════════════════ */
import { ApiError, api } from "./api";
import { onSocketEvent } from "./orderSocket";

const BASE = "/api/v2/food-partners";

/* ------------------------------------------------------------------ *
 * Shapes — the server's, unchanged
 * ------------------------------------------------------------------ */

/**
 * One table type: seats per table, how many, the type's letter and each
 * table's number ("A1" … "A10", any of them renamed). The server fills in a
 * missing letter or number and refuses a number used twice.
 */
export type TableType = { seats: number; count: number; prefix: string; numbers: string[] };
export type AcSeating = "ac" | "non_ac" | "both";
export type Smoking = "non_smoking" | "smoking_area";

export type DineInSettings = {
  enabled: boolean;
  paused: boolean;
  tableTypes: TableType[];
  /** Derived from `tableTypes` by the server. Shown, never sent. */
  tableCount: number;
  seatingCapacity: number;
  acSeating: AcSeating | null;
  /** `null` is "not answered yet" — required before dine-in can go on. */
  indoorSeating: boolean | null;
  outdoorSeating: boolean;
  familySeating: boolean;
  coupleSeating: boolean;
  smoking: Smoking | null;
  wheelchairAccessible: boolean;
  parkingAvailable: boolean | null;
  valetParking: boolean;
  kidsFriendly: boolean;
  petFriendly: boolean;
  /** Upcoming only — the server drops days that have passed. */
  blockedDates: string[];
  blockedSlots: { date: string; time: string }[];
  limits: {
    maxPartySize: number;
    daysAhead: number;
    slotMinutes: number;
    sittingMinutes: number;
    respondMinutes: number;
  };
  updatedAt: string | null;
};

/** What the settings form saves. `paused` has its own switch and its own route. */
export type DineInForm = Pick<
  DineInSettings,
  | "enabled"
  | "tableTypes"
  | "acSeating"
  | "indoorSeating"
  | "outdoorSeating"
  | "familySeating"
  | "coupleSeating"
  | "smoking"
  | "wheelchairAccessible"
  | "parkingAvailable"
  | "valetParking"
  | "kidsFriendly"
  | "petFriendly"
>;

export type TableBookingStatus =
  | "requested"
  | "confirmed"
  | "arrived"
  | "no_show"
  | "declined"
  | "expired"
  | "cancelled";

export type TableBooking = {
  reference: string;
  partySize: number;
  /** The table's size — the one the diner picked, or the smallest free one that seats them. */
  tableSeats: number;
  /** "A3" — null on a booking made before tables had numbers. */
  tableNumber: string | null;
  /** The diner picked this table themselves. */
  tableChosen: boolean;
  date: string;
  time: string;
  /** "Today", "Tomorrow" or "Thu 8 Oct" — written by the server, in India's calendar. */
  dayLabel: string;
  /** "7:30 pm". */
  timeLabel: string;
  startsAt: string;
  endsAt: string;
  guestName: string;
  guestPhone: string;
  forSomeoneElse: boolean;
  /** A wish, not a promise — the diner was told it is "on request". */
  preference: { seating: "ac" | "non_ac" | null; area: "indoor" | "outdoor" | null };
  note: string;
  status: TableBookingStatus;
  respondBy: string;
  reason: string;
  cancelledBy: "customer" | "restaurant" | "system" | null;
  createdAt: string;
  arrivedAt: string | null;
  noShowAt: string | null;
  /** Which buttons the server would accept now. The screen draws exactly these. */
  actions: { accept: boolean; decline: boolean; cancel: boolean; arrived: boolean; noShow: boolean };
};

export type TableBookingsPage = {
  /** Sorted by `respondBy`, soonest first. */
  requests: TableBooking[];
  upcoming: TableBooking[];
  past: TableBooking[];
  counts: { requests: number; upcoming: number };
};

export type TableAction = "accept" | "decline" | "cancel" | "arrived" | "no-show";

type Envelope<T> = { success: boolean; data: T; message?: string };

/* ------------------------------------------------------------------ *
 * Words — the counter's
 * ------------------------------------------------------------------ */

export const BOOKING_STATUS: Record<
  TableBookingStatus,
  { label: string; tone: "warning" | "brand" | "success" | "danger" | "muted" }
> = {
  requested: { label: "Waiting", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "brand" },
  arrived: { label: "Arrived", tone: "success" },
  no_show: { label: "No-show", tone: "danger" },
  declined: { label: "Declined", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

/** "Prefers AC · outdoor", or empty when the diner asked for nothing. */
export const preferenceWords = (preference: TableBooking["preference"] | undefined): string => {
  const wants = [
    preference?.seating === "ac" ? "AC" : preference?.seating === "non_ac" ? "Non-AC" : "",
    preference?.area === "indoor" ? "indoor" : preference?.area === "outdoor" ? "outdoor" : "",
  ].filter(Boolean);
  return wants.length ? `Prefers ${wants.join(" · ")}` : "";
};

/* ------------------------------------------------------------------ *
 * Refusals
 * ------------------------------------------------------------------ */

/**
 * A refusal, read for its code as well as its sentence.
 *
 * `api()` already puts the server's `message` on the error, and that sentence
 * is written to be shown as it is. The settings form needs two more things off
 * the same body: the `code`, to tell `NO_HOURS` (go and set your hours) from
 * `INVALID_SETTINGS` (fix this form), and `problems`, the list the second one
 * carries so each fix can be its own line.
 */
export type DineInProblem = { code: string; message: string; problems: string[] };

export function readDineInError(err: unknown, fallback: string): DineInProblem {
  const payload =
    err instanceof ApiError ? (err.payload as { code?: unknown; problems?: unknown } | null) : null;
  return {
    code: typeof payload?.code === "string" ? payload.code : "",
    message: (err as Error)?.message || fallback,
    problems: Array.isArray(payload?.problems)
      ? payload.problems.filter((p): p is string => typeof p === "string" && !!p)
      : [],
  };
}

/* ------------------------------------------------------------------ *
 * Calls — settings
 * ------------------------------------------------------------------ */

export const getDineInSettings = async (token: string): Promise<DineInSettings> => {
  const res = await api<Envelope<DineInSettings>>(`${BASE}/me/dine-in`, { token });
  return res.data;
};

export const saveDineInSettings = async (token: string, form: DineInForm): Promise<DineInSettings> => {
  const res = await api<Envelope<DineInSettings>>(`${BASE}/me/dine-in`, { method: "PUT", token, body: form });
  return res.data;
};

/** Stop or restart new bookings. Delivery is not touched by this. */
export const setDineInPaused = async (token: string, paused: boolean): Promise<DineInSettings> => {
  const res = await api<Envelope<DineInSettings>>(`${BASE}/me/dine-in/paused`, {
    method: "PATCH",
    token,
    body: { paused },
  });
  return res.data;
};

/**
 * Close a whole day (no `time`) or mark one half-hour full (with `time`).
 *
 * Closing a day cancels that day's bookings and tells each diner; `cancelled`
 * is how many. Marking a slot full only stops NEW bookings — the guests
 * already booked at that time are still coming.
 */
export const blockDineIn = async (
  token: string,
  block: { date: string; time?: string },
): Promise<{ settings: DineInSettings; cancelled: number }> => {
  const res = await api<Envelope<DineInSettings> & { cancelled?: number }>(`${BASE}/me/dine-in/blocks`, {
    method: "POST",
    token,
    body: block,
  });
  return { settings: res.data, cancelled: Number(res.cancelled) || 0 };
};

export const unblockDineIn = async (
  token: string,
  block: { date: string; time?: string },
): Promise<DineInSettings> => {
  const res = await api<Envelope<DineInSettings>>(`${BASE}/me/dine-in/blocks/remove`, {
    method: "POST",
    token,
    body: block,
  });
  return res.data;
};

/* ------------------------------------------------------------------ *
 * Calls — bookings
 * ------------------------------------------------------------------ */

const rows = (value: unknown): TableBooking[] => (Array.isArray(value) ? (value as TableBooking[]) : []);

export const listTableBookings = async (token: string): Promise<TableBookingsPage> => {
  const res = await api<Envelope<Partial<TableBookingsPage> | null>>(`${BASE}/me/table-bookings`, { token });
  const data = res.data ?? {};
  return {
    requests: rows(data.requests),
    upcoming: rows(data.upcoming),
    past: rows(data.past),
    counts: {
      requests: Number(data.counts?.requests) || 0,
      upcoming: Number(data.counts?.upcoming) || 0,
    },
  };
};

/**
 * One of the counter's buttons. `reason` is required for `cancel` (the server
 * answers `REASON_REQUIRED` without one) and optional for `decline`.
 */
export const actOnTableBooking = async (
  token: string,
  reference: string,
  action: TableAction,
  reason?: string,
): Promise<TableBooking> => {
  const res = await api<Envelope<TableBooking>>(
    `${BASE}/me/table-bookings/${encodeURIComponent(reference)}/${action}`,
    { method: "POST", token, body: reason ? { reason } : {} },
  );
  return res.data;
};

/* ------------------------------------------------------------------ *
 * Live
 * ------------------------------------------------------------------ */

/** The slim payload both events carry — enough to ring and refresh, not to draw. */
export type TableBookingEvent = {
  reference: string;
  status: TableBookingStatus;
  date: string;
  time: string;
  partySize: number;
  guestName: string;
  respondBy: string;
};

/** A diner has asked for a table. */
export function onTableBookingRequested(handler: (event: TableBookingEvent) => void): () => void {
  return onSocketEvent("table_booking_requested", handler);
}

/** Something about a booking changed elsewhere — usually the diner cancelling. */
export function onTableBookingUpdated(handler: (event: TableBookingEvent) => void): () => void {
  return onSocketEvent("table_booking_updated", handler);
}
