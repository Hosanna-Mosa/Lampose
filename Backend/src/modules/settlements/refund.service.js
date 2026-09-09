/* ══════════════════════════════════════════════════════════════════════════
   Refunding a guest whose paid hotel stay was cancelled.

   The rule, decided 9 September 2026: full refund, whoever cancelled.
   Lampose keeps nothing. Everything in this file follows from that — there
   is one amount, the one the guest paid, and no arithmetic on it.

   ## Two moments, one record

   `openForCancelledBooking` runs inside BOTH cancel paths — the student's in
   `customerBooking.controller.js`, the owner's in `partnerDomains.controller`
   — because the guest is owed the money regardless of who pressed Cancel.
   It reverses the settlement so the owner's held figure stops showing a stay
   that will never happen, and opens the refund row.

   Bank details arrive either with the cancel (the student's form asks for
   them) or later (`attachBankDetails`, after an owner cancelled and the
   student was told to add them). Until they arrive the refund is
   `awaiting_details` and no administrator can pay it.

   ## Paid by a person

   Like every payout while `PAYOUTS_MANUAL` is on: somebody makes the
   transfer in a banking app and records the reference. `markPaid` is that
   record. It is the only path to `paid`.

   ## What is deliberately not here

   No Razorpay gateway refund. The guest is asked for an account instead,
   because the payments this deployment has actually taken so far went through
   the dev bypass and have nothing at Razorpay to refund against — and because
   a bank transfer is what the person doing it has in front of them. Adding
   `razorpay.refundPayment` for real gateway payments is a one-branch change
   inside `markPaid` when it is wanted.
   ══════════════════════════════════════════════════════════════════════════ */
const { HotelRefund } = require('./hotelRefund.model');
const { HotelSettlement } = require('./hotelSettlement.model');
const settlements = require('./settlement.service');

class RefundError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'RefundError';
    this.code = code;
    this.status = status;
  }
}

/* The same shapes `partnerDomains.controller.js` and the payout onboarding
   apply to an OWNER'S account. One rule for a bank account, wherever it is
   typed. */
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_PATTERN = /^\d{6,20}$/;

/**
 * Validate and normalise bank details, or throw a `RefundError` the app can
 * show. Returns null when nothing was sent at all — which is allowed; it
 * just leaves the refund waiting.
 */
const normaliseBank = (input) => {
  if (!input || typeof input !== 'object') return null;
  const accountName = String(input.accountName || '').trim();
  const accountNumber = String(input.accountNumber || '').replace(/\s/g, '');
  const ifsc = String(input.ifsc || '').trim().toUpperCase();

  if (!accountName && !accountNumber && !ifsc) return null;

  if (!accountName) throw new RefundError('NO_NAME', 'We need the account holder’s name, exactly as the bank has it.');
  if (!ACCOUNT_PATTERN.test(accountNumber)) throw new RefundError('BAD_ACCOUNT', 'That does not look like an account number.');
  if (!IFSC_PATTERN.test(ifsc)) throw new RefundError('BAD_IFSC', 'That does not look like an IFSC — it should be like HDFC0001234.');

  return { accountName, accountNumber, ifsc, providedAt: new Date() };
};

/**
 * A booking was cancelled. If the guest had paid, owe them the money.
 *
 * Returns the refund row, or null when there was nothing to refund — a PG,
 * hostel or co-living booking has no settlement because the guest paid us
 * nothing, and that is the common case.
 *
 * Idempotent on `bookingId`: a cancel that reaches here twice returns the
 * refund the first one opened.
 */
const openForCancelledBooking = async ({ booking, cancelledBy, bank = null, reason = null }) => {
  if (!booking) return null;
  const bookingId = String(booking._id);

  const existing = await HotelRefund.findOne({ bookingId });
  if (existing) return existing;

  const settlement = await HotelSettlement.findOne({ bookingId });
  if (!settlement || !(settlement.grossAmountPaise > 0)) return null;

  /*
   * Reverse the hold, where there is one.
   *
   * `held` and `releasable` mean the owner has not been paid. Reversing
   * takes the stay out of their held/available figures immediately, so the
   * Earnings screen stops promising money for a guest who is not coming.
   *
   * `withdrawing` and `paid_out` mean the owner HAS their share. The guest
   * is still owed the full amount — the rule is full refund — but that row
   * is left alone and the fact is recorded on the refund for the admin queue.
   */
  const statusAtCancel = settlement.status;
  if (statusAtCancel === 'held' || statusAtCancel === 'releasable') {
    await settlements.reverseForRefund(settlement._id).catch((error) => {
      console.error(`[refund] could not reverse settlement ${settlement._id}:`, error.message);
    });
  }

  const bankDetails = normaliseBank(bank);

  try {
    return await HotelRefund.create({
      bookingId,
      settlementId: String(settlement._id),
      requestId: settlement.requestId || booking.requestId || null,
      customerId: booking.customerId || settlement.customerId || null,
      propertyId: booking.propertyId || settlement.propertyId || null,
      propertyName: booking.propertyName || settlement.propertyName || '',
      ownerPhoneDigits: booking.partnerPhoneDigits || settlement.ownerPhoneDigits || null,
      guestName: booking.guestName || settlement.guestName || '',
      guestPhone: booking.guestPhone || settlement.guestPhone || '',
      checkInDate: booking.checkInDate || settlement.checkInDate || null,
      amountPaise: settlement.grossAmountPaise,
      cancelledBy,
      cancelReason: reason || booking.cancelReason || null,
      /* The owner's free-text note, when they wrote one. The student's cancel
         form has no note field, so this is null on a guest cancellation. */
      cancelNote: booking.cancelNote || null,
      settlementStatusAtCancel: statusAtCancel,
      status: bankDetails ? 'pending' : 'awaiting_details',
      bank: bankDetails || undefined,
    });
  } catch (error) {
    /* Two cancels racing to create the same refund — the unique index wins
       for one of them; the other reads what it made. */
    if (error && error.code === 11000) return HotelRefund.findOne({ bookingId });
    throw error;
  }
};

/**
 * The guest says where to send it — after an owner cancelled, or if they
 * skipped the field when cancelling themselves.
 *
 * Scoped to the guest's OWN booking by the caller passing a query it has
 * already matched against `req.customer`; this never trusts a bare id.
 */
const attachBankDetails = async (bookingId, bank) => {
  const refund = await HotelRefund.findOne({ bookingId: String(bookingId) });
  if (!refund) throw new RefundError('NO_REFUND', 'There is no refund open on this booking.', 404);
  if (refund.status === 'paid') throw new RefundError('ALREADY_PAID', 'This refund has already been sent.', 409);
  if (refund.status === 'rejected') throw new RefundError('REJECTED', 'This refund was refused. Contact support.', 409);

  const details = normaliseBank(bank);
  if (!details) throw new RefundError('NO_BANK', 'Enter the account the refund should go to.');

  refund.bank = details;
  refund.status = 'pending';
  await refund.save();
  return refund;
};

/** Record that a person made the transfer. The only path to `paid`. */
const markPaid = async (refundId, { reference = '', admin } = {}) => {
  const refund = await HotelRefund.findById(refundId);
  if (!refund) throw new RefundError('NOT_FOUND', 'No refund with that id.', 404);
  if (refund.status === 'paid') throw new RefundError('ALREADY_PAID', 'This refund has already been marked paid.', 409);
  if (refund.status === 'rejected') throw new RefundError('REJECTED', 'This refund was refused; reopen it first.', 409);
  if (!refund.bank || !refund.bank.accountNumber) {
    throw new RefundError('NO_BANK', 'The guest has not given an account to send this to yet.', 409);
  }

  const now = new Date();
  refund.status = 'paid';
  refund.reference = String(reference || '').slice(0, 120) || null;
  refund.paidAt = now;
  refund.paidByAdminId = admin ? String(admin._id) : null;
  refund.paidByAdminName = admin?.name || '';
  await refund.save();
  return refund;
};

/** Refuse a refund, with a reason the guest will read. */
const reject = async (refundId, { reason = '', admin } = {}) => {
  const refund = await HotelRefund.findById(refundId);
  if (!refund) throw new RefundError('NOT_FOUND', 'No refund with that id.', 404);
  if (refund.status === 'paid') throw new RefundError('ALREADY_PAID', 'This refund has already been sent.', 409);

  refund.status = 'rejected';
  refund.rejectedReason = String(reason || '').slice(0, 400) || 'Refused by Lampose.';
  refund.rejectedAt = new Date();
  refund.paidByAdminName = admin?.name || '';
  await refund.save();
  return refund;
};

/** The refunds for a set of bookings, keyed by bookingId — one query for a list. */
const forBookings = async (bookingIds) => {
  const ids = (bookingIds || []).map(String).filter(Boolean);
  if (!ids.length) return new Map();
  const rows = await HotelRefund.find({ bookingId: { $in: ids } });
  return new Map(rows.map((r) => [r.bookingId, r]));
};

/**
 * Could cancelling this booking produce a refund?
 *
 * Read by the app BEFORE the guest cancels, so the cancel form knows whether
 * to ask for a bank account. True when a settlement exists with money in it.
 */
const refundableBookingIds = async (bookingIds) => {
  const ids = (bookingIds || []).map(String).filter(Boolean);
  if (!ids.length) return new Set();
  const rows = await HotelSettlement.find({
    bookingId: { $in: ids }, grossAmountPaise: { $gt: 0 },
  }).select('bookingId').lean();
  return new Set(rows.map((r) => r.bookingId));
};

module.exports = {
  RefundError,
  /* Exported so a cancel can refuse bad bank details BEFORE it cancels —
     a booking must not be cancelled and then told the account was wrong. */
  validateBank: normaliseBank,
  openForCancelledBooking,
  attachBankDetails,
  markPaid,
  reject,
  forBookings,
  refundableBookingIds,
};
