/**
 * A table booking and a day's slot grid, as the Food module renders them.
 *
 * Same rule as `food.adapter.ts`: it converts, it does not invent. The server
 * already speaks in the app's words — "Tomorrow", "7:30 pm", a status that has
 * already been read against the clock — so most of this is making sure a
 * missing field arrives as an honest empty rather than as `undefined` in the
 * middle of a sentence.
 *
 * What it deliberately does NOT do is work anything out. Whether a booking can
 * still be cancelled, whether a request has expired, which slots are free:
 * each of those is the server's answer and is carried across untouched.
 */
import {
  type AreaPreference,
  type SeatingPreference,
  type TableBooking,
  type TableBookingStatus,
  type TableSlots,
  type TableSlotsReason,
} from '@/types/food';
import { toDineInFloor, type BackendDineIn } from './food.adapter';

/* ------------------------------------------------------------------ *
 * What the server sends
 * ------------------------------------------------------------------ */

export type BackendTableBooking = {
  reference?: string;
  restaurantId?: string;
  restaurantName?: string;
  restaurantPhone?: string;
  restaurantAddress?: string;
  partySize?: number;
  tableSeats?: number | null;
  tableNumber?: string | null;
  tableChosen?: boolean;
  date?: string;
  time?: string;
  dayLabel?: string;
  timeLabel?: string;
  startsAt?: string;
  endsAt?: string;
  guestName?: string;
  guestPhone?: string;
  forSomeoneElse?: boolean;
  preference?: { seating?: string | null; area?: string | null } | null;
  note?: string;
  status?: string;
  respondBy?: string;
  reason?: string;
  cancelledBy?: string | null;
  createdAt?: string;
  canCancel?: boolean;
};

export type BackendTableSlots = {
  restaurantId?: string;
  restaurantName?: string;
  contactNumber?: string;
  dineIn?: BackendDineIn | null;
  dates?: { date?: string; label?: string }[];
  date?: string;
  guests?: number;
  slots?: { time?: string; label?: string; available?: boolean }[];
  reason?: string | null;
  time?: string | null;
  tables?: { number?: string; seats?: number; available?: boolean }[];
};

/* ------------------------------------------------------------------ *
 * Conversions
 * ------------------------------------------------------------------ */

const STATUSES: readonly TableBookingStatus[] = [
  'requested', 'confirmed', 'declined', 'expired', 'cancelled', 'arrived', 'no_show',
];
const REASONS: readonly TableSlotsReason[] = [
  'NOT_OFFERED', 'PAUSED', 'OUT_OF_RANGE', 'BAD_PARTY', 'PARTY_TOO_LARGE', 'CLOSED_THAT_DAY', 'NO_SLOTS', 'FULL',
];
const SEATING: readonly SeatingPreference[] = ['ac', 'non_ac'];
const AREA: readonly AreaPreference[] = ['indoor', 'outdoor'];
const CANCELLED_BY: readonly NonNullable<TableBooking['cancelledBy']>[] = ['customer', 'restaurant', 'system'];

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const count = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * One booking. Null for a row with no reference, which nothing could open.
 *
 * An unknown status is read as `expired` rather than dropped: a booking the
 * app cannot name is one it must not offer to cancel or show as confirmed,
 * and the quietest finished state is the honest fallback.
 */
export function toTableBooking(raw: BackendTableBooking | null | undefined): TableBooking | null {
  const reference = text(raw?.reference);
  if (!raw || !reference) return null;

  const seats = Number(raw.tableSeats);

  return {
    reference,
    restaurantId: text(raw.restaurantId),
    restaurantName: text(raw.restaurantName) || 'The restaurant',
    restaurantPhone: text(raw.restaurantPhone),
    restaurantAddress: text(raw.restaurantAddress),
    partySize: count(raw.partySize),
    tableSeats: Number.isFinite(seats) && seats > 0 ? seats : null,
    tableNumber: text(raw.tableNumber) || null,
    tableChosen: raw.tableChosen === true,
    date: text(raw.date),
    time: text(raw.time),
    dayLabel: text(raw.dayLabel) || text(raw.date),
    timeLabel: text(raw.timeLabel) || text(raw.time),
    startsAt: text(raw.startsAt),
    endsAt: text(raw.endsAt),
    guestName: text(raw.guestName),
    guestPhone: text(raw.guestPhone),
    forSomeoneElse: raw.forSomeoneElse === true,
    preference: {
      seating: SEATING.find((value) => value === raw.preference?.seating) ?? null,
      area: AREA.find((value) => value === raw.preference?.area) ?? null,
    },
    note: text(raw.note),
    status: STATUSES.find((value) => value === raw.status) ?? 'expired',
    respondBy: text(raw.respondBy),
    reason: text(raw.reason),
    cancelledBy: CANCELLED_BY.find((value) => value === raw.cancelledBy) ?? null,
    createdAt: text(raw.createdAt),
    canCancel: raw.canCancel === true,
  };
}

/** One day's grid. Null only for a reply that is not one. */
export function toTableSlots(raw: BackendTableSlots | null | undefined): TableSlots | null {
  if (!raw || typeof raw !== 'object') return null;

  return {
    restaurantId: text(raw.restaurantId),
    restaurantName: text(raw.restaurantName),
    contactNumber: text(raw.contactNumber),
    dineIn: toDineInFloor(raw.dineIn),
    dates: (raw.dates ?? [])
      .filter((entry) => text(entry?.date))
      .map((entry) => ({ date: text(entry.date), label: text(entry.label) || text(entry.date) })),
    date: text(raw.date),
    guests: count(raw.guests),
    slots: (raw.slots ?? [])
      .filter((slot) => text(slot?.time))
      .map((slot) => ({
        time: text(slot.time),
        label: text(slot.label) || text(slot.time),
        available: slot.available === true,
      })),
    reason: REASONS.find((value) => value === raw.reason) ?? null,
    time: text(raw.time) || null,
    tables: (raw.tables ?? [])
      .filter((table) => text(table?.number) && count(table?.seats) > 0)
      .map((table) => ({ number: text(table.number), seats: count(table.seats), available: table.available === true })),
  };
}
