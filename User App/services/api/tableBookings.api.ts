import type { AreaPreference, SeatingPreference, TableBooking, TableSlots } from '@/types/food';
import {
  toTableBooking,
  toTableSlots,
  type BackendTableBooking,
  type BackendTableSlots,
} from '@/services/adapters/tableBooking.adapter';
import { api } from './client';
import { endpoints } from './endpoints';

/**
 * Booking a table, and watching the restaurant answer.
 *
 * ## The request says WHEN and HOW MANY, and WHICH TABLE only if asked
 *
 * The app sends a date, a half-hour and a party size. A diner MAY name a table
 * from the list the server gave for that time (`tables`); the server still
 * decides, inside a compare-and-set on that day's ledger, and refuses one
 * taken since (`TABLE_TAKEN`). With no table named it gives the smallest free
 * one for the whole sitting.
 *
 * ## Refusals are sentences
 *
 * Every refusal arrives as an `ApiError` with a `code` to branch on and a
 * `message` written to be shown as it is. The booking screen branches on the
 * code (a full slot re-reads the grid; a missing name opens the name field)
 * and shows the message; it never rewrites one.
 */

export type BookTableRequest = {
  restaurantId: string;
  /** India's calendar date, `YYYY-MM-DD`, from the grid's own `dates`. */
  date: string;
  /** `HH:MM`, from the grid's own `slots`. */
  time: string;
  guests: number;
  /** A table number from `TableSlots.tables` — omitted for "any table". */
  table?: string;
  /** A wish, and only sent where the restaurant offers both options. */
  preference?: { seating?: SeatingPreference; area?: AreaPreference };
  note?: string;
  /** Someone else's table: their name and their 10-digit mobile go too. */
  forSomeoneElse?: boolean;
  /** Optional for the diner's own table — the account's name is used. */
  guestName?: string;
  guestPhone?: string;
};

type Envelope<T> = { success?: boolean; data?: T; message?: string };

/**
 * One day's slot grid for one party size.
 *
 * `date` may be omitted: the server answers with today, and its `dates` list
 * is what the screen offers from then on.
 */
export async function fetchTableSlots(
  query: { restaurantId: string; date?: string | null; guests: number; time?: string | null },
  signal?: AbortSignal,
): Promise<TableSlots> {
  const res = await api.get<Envelope<BackendTableSlots>>(endpoints.foodTableSlots(query.restaurantId), {
    query: { date: query.date || undefined, guests: String(query.guests), time: query.time || undefined },
    signal,
  });
  const slots = toTableSlots(res?.data);
  if (!slots) throw new Error(res?.message || 'We could not read the tables.');
  return slots;
}

/** Ask for a table. Answers the booking, at `requested`. */
export async function bookTable(request: BookTableRequest): Promise<TableBooking> {
  const res = await api.post<Envelope<BackendTableBooking>>(endpoints.foodTableBookings, request);
  const booking = toTableBooking(res?.data);
  if (!booking) throw new Error(res?.message || 'The booking did not go through.');
  return booking;
}

/** The diner's own bookings, newest sitting first — fifty at most. */
export async function fetchMyTableBookings(signal?: AbortSignal): Promise<TableBooking[]> {
  const res = await api.get<Envelope<BackendTableBooking[]>>(endpoints.foodTableBookings, { signal });
  const rows = Array.isArray(res?.data) ? res.data : [];
  return rows.map(toTableBooking).filter((booking): booking is TableBooking => !!booking);
}

/** One booking, by its reference. */
export async function fetchTableBooking(reference: string, signal?: AbortSignal): Promise<TableBooking | null> {
  const res = await api.get<Envelope<BackendTableBooking>>(endpoints.foodTableBooking(reference), { signal });
  return toTableBooking(res?.data);
}

/**
 * Cancel. The server refuses (`NOT_ALLOWED`) once it is too late — a
 * confirmed table closes half an hour before its time — and its refusal says
 * to call the restaurant instead.
 */
export async function cancelTableBooking(reference: string, reason?: string): Promise<TableBooking> {
  const res = await api.post<Envelope<BackendTableBooking>>(
    endpoints.foodTableBookingCancel(reference),
    reason ? { reason } : {},
  );
  const booking = toTableBooking(res?.data);
  if (!booking) throw new Error(res?.message || 'We could not cancel that booking.');
  return booking;
}
