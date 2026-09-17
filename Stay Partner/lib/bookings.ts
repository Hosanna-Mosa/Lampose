import type { BookingStatus, PaymentStatus } from '@/components/common';
import { netOn } from './fees';

/**
 * Static booking content, shared by the list, detail, check-in, active stay,
 * checkout, cancel, and history screens.
 *
 * Dates are anchored to today rather than to fixed calendar days, so "Today –
 * Aug 15" stays true and the in-house stay is genuinely in progress whenever
 * this is opened.
 */

function at(dayOffset: number, hour = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export type Booking = {
  id: string;
  guest: string;
  /**
   * How to reach the guest, and where they live.
   *
   * All four are on the booking the owner is shown because all four are what
   * a landlord holds about a tenant: the walk-in form asks an owner to type
   * every one of them, so the app has always treated them as theirs to see.
   * A request-made booking simply never carried the address — see
   * `guestAddressesFor` on the server.
   *
   * Empty string, never a placeholder: a detail nobody recorded gets no row
   * rather than a row saying "not set".
   */
  guestPhone?: string;
  guestEmail?: string;
  guestAddress?: string;
  /**
   * The property's category at the time this booking was made. '' on a row
   * written before this field existed, or if the property lookup failed at
   * creation — treated as "unknown", never as bachelor.
   *
   * The one thing this drives today: a bachelor tenancy is a direct
   * arrangement with the guest from the moment it is confirmed, so the
   * owner-messaging and cancel-via-app actions this screen would otherwise
   * offer are hidden for it — see `app/booking/[id].tsx`.
   */
  category?: string;
  /**
   * The request this booking came from, or null on a walk-in.
   *
   * Carried so a screen can ask the REQUEST what state the guest's side of
   * the flow is in — whether the fee is paid, whether a visit has been
   * scheduled. The booking row knows none of that, and on a bachelor room its
   * own `checkInDate` is not a date anybody chose (see `arrivingToday` on the
   * Today screen).
   */
  requestId?: string | null;
  roomType: string;
  checkIn: Date;
  /**
   * `null` on an OPEN-ENDED tenancy — which is most of them.
   *
   * A bachelor room is never asked for a length: that request has no
   * move-out field at all, so the server stores `checkOutDate: ''` and means
   * it. This used to be a required `Date`, so the mapper invented "the day
   * after move-in" to satisfy the type, and every screen printed that
   * invented day as the tenant's move-out date — a fact about a TypeScript
   * annotation, rendered as a fact about somebody's tenancy.
   *
   * Nullable is the honest shape. A screen with nothing to show hides the
   * row rather than being handed a date to display.
   */
  checkOut: Date | null;
  /**
   * How many people, as the owner described them — "2 adults", "family of 4".
   *
   * `null` on a booking that came from a REQUEST, which is every booking the
   * app makes: nothing on a visit request ever asks how many people are
   * coming, so the schema's `guestsLabel` is empty and there is no headcount
   * to show. Only the Add Customer walk-in form fills it in.
   */
  guests: string | null;
  /** Nights, where the stay has two ends. `null` when it is open-ended. */
  nights: number | null;
  status: BookingStatus;
  payment: PaymentStatus;
  /** What the guest pays, before commission. */
  gross: number;
  /**
   * The entry PIN the guest presents at arrival — `LV-548005`.
   *
   * Issued by the server when the owner accepted the request, and held by
   * both sides. Not four digits and not generated here: it is COMPARED with
   * what the student shows, so a locally invented one is worse than none.
   */
  /** Design-fixture field. The server never sends a PIN to the owner. */
  checkInCode?: string;
  /**
   * Whether check-in asks for the guest's code. True for a booking that came
   * through a request (a PIN was issued to the guest); false for a walk-in
   * the owner keyed in by hand. The code itself is verified by the server.
   */
  requiresCode?: boolean;
  /** Set once the stay is under way. */
  checkedInAt?: Date;

  /**
   * The two halves of moving in.
   *
   * This owner goes first; the student confirms from their own app. A booking
   * with only the first is not an arrival — it is an owner who opened a door
   * and is waiting to be told somebody walked through it.
   */
  movedInByOwnerAt?: Date;
  movedInByStudentAt?: Date;
  checkOutBy?: string;
};

export const BOOKINGS: Booking[] = [
  {
    id: 'LB-1182',
    guest: 'Arjun Kapoor',
    roomType: 'Deluxe Double',
    checkIn: at(0, 14),
    checkOut: at(1, 11),
    guests: '2 adults',
    nights: 1,
    status: 'inHouse',
    payment: 'paid',
    gross: 6_400,
    checkInCode: '4829',
    requiresCode: true,
    checkedInAt: at(0, 14),
    checkOutBy: '11:00 AM',
  },
  {
    // Departs today, so the checkout sheet is reachable and the active stay has
    // a case where its button is live rather than waiting.
    id: 'LB-1176',
    guest: 'Divya Menon',
    roomType: 'Deluxe Double',
    checkIn: at(-2, 14),
    checkOut: at(0, 11),
    guests: '2 adults',
    nights: 2,
    status: 'inHouse',
    payment: 'paid',
    gross: 7_200,
    checkInCode: '6035',
    requiresCode: true,
    checkedInAt: at(-2, 14),
    checkOutBy: '11:00 AM',
  },
  {
    // Arrives today and not yet checked in, so the check-in flow is reachable.
    // Without this every booking is either already in-house or days away.
    id: 'LB-1189',
    guest: 'Nikhil Rao',
    roomType: 'Family Suite',
    checkIn: at(0, 15),
    checkOut: at(3, 11),
    guests: '3 adults',
    nights: 3,
    status: 'confirmed',
    payment: 'paid',
    gross: 14_400,
    checkInCode: '2947',
    requiresCode: true,
    checkOutBy: '11:00 AM',
  },
  {
    id: 'LB-1194',
    guest: 'Meera Joseph',
    roomType: 'Family Suite',
    checkIn: at(6, 14),
    checkOut: at(8, 11),
    guests: '4 adults',
    nights: 2,
    status: 'confirmed',
    payment: 'pending',
    gross: 11_000,
    checkInCode: '7314',
    requiresCode: true,
    checkOutBy: '11:00 AM',
  },
  {
    id: 'LB-1207',
    guest: 'Karan Desai',
    roomType: 'Deluxe Double',
    checkIn: at(11, 14),
    checkOut: at(13, 11),
    guests: '2 adults',
    nights: 2,
    status: 'confirmed',
    payment: 'paid',
    gross: 8_000,
    checkInCode: '5106',
    requiresCode: true,
    checkOutBy: '11:00 AM',
  },
];

/** Past stays. Offsets keep them recent rather than drifting further away each day. */
export const PAST: Booking[] = [
  {
    id: 'LB-1103',
    guest: 'Rohan Verma',
    roomType: 'Deluxe Double',
    checkIn: at(-12, 14),
    checkOut: at(-10, 11),
    guests: '2 adults',
    nights: 2,
    status: 'completed',
    payment: 'paid',
    gross: 6_400,
  },
  {
    id: 'LB-1088',
    guest: 'Nisha Patil',
    roomType: 'Family Suite',
    checkIn: at(-17, 14),
    checkOut: at(-15, 11),
    guests: '4 adults',
    nights: 2,
    status: 'cancelled',
    payment: 'refunded',
    gross: 11_000,
  },
  {
    id: 'LB-1054',
    guest: 'Farhan Ali',
    roomType: 'Deluxe Double',
    checkIn: at(-25, 14),
    checkOut: at(-22, 11),
    guests: '2 adults',
    nights: 3,
    status: 'completed',
    payment: 'paid',
    gross: 9_600,
  },
];

const ALL = [...BOOKINGS, ...PAST];

export const UPCOMING = BOOKINGS;
export const HISTORY = PAST;
/** Current and past together — for anywhere a ticket or dispute needs to link any stay. */
export const ALL_BOOKINGS = ALL;

/**
 * Whether the guest's money moved through Lampose on this booking.
 *
 * The one question that makes a payout figure and a payment badge mean
 * anything, and it has exactly one answer per category:
 *
 *   HOTEL       a stay is prepaid through us, so there is a real gross, a
 *               real commission and a real payout. The only one.
 *   BACHELOR    charges, but the ₹199 is Lampose's assisted-visit fee — ₹100
 *               to the representative who goes, ₹99 our own. Never the
 *               owner's money. Rent and deposit are settled with the owner
 *               directly, which is what the student's own app tells them.
 *   PG_HOSTEL   nothing is taken at all; the rent is a direct arrangement and
 *   COLIVE      Lampose's cut is collected by a phone call, not a payout.
 *
 * So `totalAmount`/`paidAmount` are 0/0 on three of the four, and everything
 * derived from them was reporting a fact about the SCHEMA as though it were a
 * fact about the stay: "Total payout ₹0" on a room we never handled money
 * for, and a `Pending` badge that survived moving in — an in-house tenant
 * permanently flagged as though they owed something.
 *
 * Bachelor was the one this missed. It sat outside the PG/Co-living guard on
 * the detail screen and the bookings list while three other screens already
 * grouped it with them, so the same booking said "settled directly with the
 * owner" in the student's app and "Pending ₹0" in the owner's.
 *
 * A row with no category — written before the field existed, or whose
 * property could not be read at the time — is answered by the figure itself
 * rather than by a guess about which kind of place it was.
 */
export function hasPlatformMoney(b: Booking): boolean {
  return b.category ? b.category === 'HOTEL' : b.gross > 0;
}

/** Owner payout — always derived, never stored, so it can't drift from the fee. */
export function payoutOf(b: Booking): number {
  return netOn(b.gross);
}

export function getBooking(id: string | undefined): Booking | undefined {
  return ALL.find((b) => b.id === id);
}

/**
 * The server's vocabulary, in the app's spelling.
 *
 * `arriving` and `departing` used to map onto `confirmed` and `inHouse`,
 * which threw away the only two states an owner runs their morning on.
 */
const STATUS_MAP: Record<string, Booking['status']> = {
  in_house: 'inHouse',
  arriving: 'arriving',
  /* Split out from `arriving` — see `bookingStage.util.js`. A guest expected
     weeks ago and never checked in is not "today"'s arrival. */
  overdue_arrival: 'overdueArrival',
  departing: 'departing',
  overdue_departure: 'overdueDeparture',
  upcoming: 'confirmed',
  completed: 'completed',
  cancelled: 'cancelled',
};

/**
 * Which field to believe.
 *
 * `stage` is what the server DERIVED from the dates a moment ago; `status` is
 * what a person last set. Stage wins where it exists, because it is the only
 * one that can say "arriving today" — read defensively, so an older build of
 * the API that sends no `stage` still renders every booking.
 */
function statusOf(raw: any): Booking['status'] {
  return STATUS_MAP[raw?.stage] ?? STATUS_MAP[raw?.status] ?? 'confirmed';
}

/**
 * One `partner_bookings` row, as the screens want it.
 *
 * ## Why this is here and not inlined
 *
 * There were three of these: one in the bookings tab, one in the booking
 * detail screen, and — for the check-in, active-stay, checkout and cancel
 * screens — no mapper at all, because those four called `getBooking()` above
 * and read the FIXTURES. A real booking id matches nothing in that array, so
 * every one of them rendered "Booking not found": the cancel button appeared
 * to do nothing, and check-in had no screen after it.
 *
 * So the fixtures are no longer the source for anything with an id from the
 * server, and this is the single mapping every screen shares. The two that
 * already had their own were not identical — only the detail screen carried
 * `entryPin` and the move-in stamps — which is exactly the drift one mapper
 * prevents.
 *
 * ## Nothing is invented
 *
 * A field the schema does not carry is left undefined rather than defaulted.
 * `payment` is DERIVED from the two amounts because that is arithmetic, not a
 * guess; `gross` is `0` when nothing is recorded, because ₹0 is the honest
 * figure for a booking nobody has charged for.
 */
export function toBooking(raw: any, fallbackId?: string): Booking {
  const checkIn = new Date(raw?.checkInDate ?? NaN);
  const checkOut = new Date(raw?.checkOutDate ?? NaN);

  /* Dates are stored as strings and may be unparseable on an old row, and
     `checkOutDate` is legitimately '' on a stay with no agreed end. One
     millisecond of guarding beats "Invalid Date" on every screen.

     No end date means NO END DATE. It used to mean "start + one day", which
     is where the invented move-out on every bachelor booking came from. */
  const validIn = !Number.isNaN(checkIn.getTime());
  const validOut = !Number.isNaN(checkOut.getTime());
  const startsAt = validIn ? checkIn : new Date();
  const endsAt = validOut ? checkOut : null;

  const total = Number(raw?.totalAmount ?? 0);
  const paid = Number(raw?.paidAmount ?? 0);

  return {
    id: String(raw?.id ?? raw?._id ?? fallbackId ?? ''),
    guest: raw?.guestName || 'Guest',
    guestPhone: raw?.guestPhone || '',
    guestEmail: raw?.guestEmail || '',
    guestAddress: raw?.guestAddress || '',
    category: String(raw?.category || ''),
    requestId: raw?.requestId ?? null,
    roomType: raw?.shareType || raw?.roomNumber || '',
    checkIn: startsAt,
    checkOut: endsAt,
    /*
     * The owner's own words, or nothing at all.
     *
     * This used to fall back to `Room ${raw.roomNumber}` — which put a ROOM
     * NUMBER in a field labelled Guests, and `acceptAndBook` writes that
     * field as the literal string 'Unassigned' (the owner picks a numbered
     * room at check-in, not at acceptance). So every booking made through
     * the app read "Guests: Room Unassigned": the wrong field, showing a
     * placeholder as though it were data.
     *
     * The room is already on its own row directly above, off `shareType`, so
     * nothing is lost by dropping that fallback. A booking with no recorded
     * headcount now says so by having no row, rather than by printing a
     * sentence about something else.
     */
    guests: raw?.guestsLabel ? String(raw.guestsLabel) : null,
    /* Only where there are two ends to count between. */
    nights: endsAt ? Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 86_400_000)) : null,
    status: statusOf(raw),
    /*
     * `PaymentStatus` has no `partial` member, so a part-paid booking reads as
     * `pending` — the honest side to err on: money is still owed. A card
     * saying "paid" with a balance outstanding is how an owner stops chasing.
     */
    payment: total > 0 && paid >= total ? 'paid' : 'pending',
    gross: total,
    /* The server's PIN — `LV-548005`. Absent on a manual walk-in, which has no
       request behind it and therefore no code. Never generated here: it is
       COMPARED with what the student shows, so an invented one is worse than
       none. */
    /* `hasEntryPin`, not the PIN. The API stopped sending `entryPin` to the
       owner's app when the check moved server-side — see `checkInBooking`. */
    requiresCode: Boolean(raw?.hasEntryPin),
    movedInByOwnerAt: raw?.movedInByOwnerAt ? new Date(raw.movedInByOwnerAt) : undefined,
    movedInByStudentAt: raw?.movedInByStudentAt ? new Date(raw.movedInByStudentAt) : undefined,
    checkOutBy: '11:00 AM',
  };
}
