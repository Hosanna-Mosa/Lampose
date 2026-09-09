import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';

/**
 * The student's own bookings.
 *
 * ## Why this is separate from the stay request
 *
 * A stay request is a question and it stops changing the moment it is answered
 * — `confirmed` is terminal. A BOOKING is the stay itself, and it keeps moving
 * long after that: the owner assigns a room, marks the student in on move-in
 * day, marks them out at the end, or cancels.
 *
 * Until this existed the app only had the request, so every one of those owner
 * actions was invisible here. A student whose owner had cancelled a confirmed
 * booking would still have been looking at a screen that said "Confirmed", and
 * the Bookings tab was reading local fixtures rather than anything real.
 *
 * The two are linked both ways: a request carries `bookingId` once it is
 * accepted, and a booking carries `requestId` back.
 */

/**
 * The owner's operational state for the stay.
 *
 * Deliberately the owner's vocabulary rather than a second one invented here:
 * both apps read the same row, and a status the two sides name differently is
 * a status they will eventually disagree about.
 */
export type BookingStatus =
  | 'upcoming'
  | 'arriving'
  | 'in_house'
  | 'departing'
  | 'completed'
  | 'cancelled';

/** The account a refund goes to, as the app is allowed to see it. */
export type RefundBank = {
  accountName: string;
  /** Four digits. The full number never comes back to the phone. */
  accountLast4: string;
  ifsc: string;
};

/**
 * Money owed back to the guest after a paid stay was cancelled.
 *
 *   awaiting_details   cancelled and owed, but no account to send it to yet
 *   pending            account given; a person at Lampose is transferring it
 *   paid               sent, with the bank reference
 *   rejected           refused, with a reason
 *
 * The amount is what was PAID — the rule is full refund, so there is never a
 * "kept" line and nothing here to subtract.
 */
export type CustomerRefund = {
  id: string;
  bookingId: string;
  status: 'awaiting_details' | 'pending' | 'paid' | 'rejected';
  /** Rupees, for display. */
  amount: number;
  amountPaise: number;
  cancelledBy: 'student' | 'owner';
  bank: RefundBank | null;
  reference: string | null;
  paidAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
};

export type BankDetailsInput = {
  accountName: string;
  accountNumber: string;
  ifsc: string;
};

export type CustomerBooking = {
  id: string;
  /** The request this came from. Null for a booking an owner keyed in by hand. */
  requestId: string | null;
  propertyId: string;
  propertyName: string;
  /** Null until the owner assigns one — which is usually at check-in. */
  roomNumber: string | null;
  shareType: string | null;
  /** `YYYY-MM-DD`. A calendar day, never an instant. */
  checkInDate: string | null;
  /** Empty on an open-ended stay, which is most of them. */
  checkOutDate: string | null;
  status: BookingStatus;
  totalAmount: number;
  paidAmount: number;
  /** The gate code. Survives the request being cleaned up. */
  entryPin: string | null;
  /**
   * Moving in takes two confirmations, and this is why they are separate
   * fields rather than one flag: the owner marks the student in, the student
   * confirms it from their side, and the app can say which half is missing
   * instead of an unexplained "not yet".
   */
  movedInByOwnerAt: string | null;
  movedInByStudentAt: string | null;
  address: string | null;
  /** Always false unless `status` is `completed` — see `bookingReview` below. */
  reviewed: boolean;
  /** Set only when `status` is `cancelled` — who ended it. */
  cancelledBy: 'student' | 'owner' | null;
  /**
   * Would cancelling this owe the guest money? True only for a paid hotel
   * stay. The cancel form asks for a bank account when it is.
   */
  refundable: boolean;
  /** The refund, once cancelled. Null on a free booking. */
  refund: CustomerRefund | null;
  createdAt: string;
};

export async function fetchBookings(signal?: AbortSignal): Promise<CustomerBooking[]> {
  const res = await api.get<ApiEnvelope<CustomerBooking[]>>(endpoints.bookings, { signal });
  return unwrap(res) ?? [];
}

export async function fetchBooking(id: string, signal?: AbortSignal): Promise<CustomerBooking> {
  const res = await api.get<ApiEnvelope<CustomerBooking>>(endpoints.booking(id), { signal });
  return unwrap(res);
}

/**
 * Pull out of a booking before it starts.
 *
 * Refused by the server once the owner has checked the student in
 * (`NOT_CANCELLABLE`) — cancelling a stay somebody is already living in is a
 * different, harder conversation (a refund, a partial night) than this
 * button. Idempotent: cancelling an already-cancelled booking comes back
 * `success: true` with the same row rather than an error.
 */
export async function cancelBooking(
  id: string,
  input: { reason?: string; note?: string; bank?: BankDetailsInput } = {},
  signal?: AbortSignal,
): Promise<CustomerBooking> {
  const res = await api.post<ApiEnvelope<CustomerBooking>>(
    endpoints.bookingCancel(id),
    /* `bank` rides with the cancel so a paid stay's refund opens with
       somewhere to go. Validated by the server BEFORE it cancels — a bad
       account number is a 400 with the booking untouched. */
    { reason: input.reason, note: input.note, bank: input.bank },
    { signal },
  );
  return unwrap(res);
}

/**
 * Tell Lampose where a refund should go.
 *
 * The other half of `cancelBooking`'s `bank`: reached when the OWNER
 * cancelled (the guest was not at a form to be asked) or the guest skipped
 * it. Moves the refund from `awaiting_details` to `pending`.
 */
export async function submitRefundDetails(
  id: string,
  bank: BankDetailsInput,
  signal?: AbortSignal,
): Promise<CustomerBooking> {
  const res = await api.post<ApiEnvelope<CustomerBooking>>(
    endpoints.bookingRefundDetails(id),
    { bank },
    { signal },
  );
  return unwrap(res);
}

export type BookingReview = {
  id: string;
  rating: number;
  comment: string;
  bookingId: string;
};

/**
 * "Rate your stay" — refused with `NOT_COMPLETED` before checkout, and
 * `ALREADY_REVIEWED` on a second attempt. One review per booking, enforced by
 * the server's own unique index, not just by this app's own memory of having
 * shown the prompt.
 */
export async function createBookingReview(
  id: string,
  input: { rating: number; comment: string },
  signal?: AbortSignal,
): Promise<BookingReview> {
  const res = await api.post<ApiEnvelope<BookingReview>>(
    endpoints.bookingReview(id),
    { rating: input.rating, comment: input.comment },
    { signal },
  );
  return unwrap(res);
}

/**
 * DEVELOPMENT ONLY — force both halves of a move-in.
 *
 * Checking in is gated by a real calendar day and by an order: the owner marks
 * the guest in, then the guest confirms. Both are right, and together they
 * make the hotel settlement chain impossible to test before the date arrives —
 * a settlement stays `held` until check-in, so Withdraw in the admin Monitor
 * is unreachable.
 *
 * The SERVER decides whether this is available (`DEV_ALLOW_FORCE_CHECKIN`,
 * refused under NODE_ENV=production), and it is scoped to the caller's own
 * booking exactly like every other route here. Delete this, its endpoint and
 * the button that calls it once the flow no longer needs walking by hand.
 */
export async function devForceCheckIn(
  id: string,
  signal?: AbortSignal,
): Promise<CustomerBooking> {
  const res = await api.post<ApiEnvelope<CustomerBooking>>(
    endpoints.bookingDevForceCheckIn(id), undefined, { signal },
  );
  return unwrap(res);
}

/** True once BOTH sides have confirmed the move-in. */
export function isMovedIn(booking: CustomerBooking): boolean {
  return Boolean(booking.movedInByOwnerAt && booking.movedInByStudentAt);
}

/**
 * Whether the stay is over, one way or another.
 *
 * `cancelled` is in here with `completed` on purpose — for the question this
 * answers ("is there anything left to do on this booking") they are the same,
 * and the screens that need to tell a finished stay from a cancelled one read
 * `status` directly.
 */
export function isClosed(booking: CustomerBooking): boolean {
  return booking.status === 'completed' || booking.status === 'cancelled';
}
