/* ══════════════════════════════════════════════════════════════════════════
   A refund owed to a guest whose paid hotel stay was cancelled.

   ## Why this is its own collection

   `hotel_settlements` records money coming IN and the owner's share of it.
   A refund is money going back OUT to the guest, and it has a life of its
   own: it needs bank details the guest may not have given yet, it is paid by
   a person, and it can sit open for days. Folding that onto the settlement
   row would make one document carry two different people's money in two
   different directions.

   ## The rule it implements

   A guest whose booking is cancelled — by them or by the owner — gets the
   FULL amount they paid back. Lampose keeps nothing. That was decided on
   9 September 2026 and this file assumes it; there is no partial-refund
   arithmetic here on purpose.

   ## The bank details are the whole reason for the record

   Money is refunded by bank transfer, made by a person, so the guest has to
   say where. They are asked at the moment they cancel; if the OWNER
   cancelled, they are asked afterwards. Until they answer the refund is
   `awaiting_details` and cannot be paid, and the admin queue says so.

   The account number is stored in full — somebody has to type it into a
   banking app — and is never sent back to the phone: `toCustomer` masks it,
   `toAdmin` does not. Same split as the owner's payout accounts.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

/**
 *   awaiting_details   cancelled, money owed, no account to send it to yet
 *   pending            account given; waiting for a person to make the transfer
 *   paid               transferred, reference recorded
 *   rejected           refused by an administrator, with a reason the guest sees
 */
const REFUND_STATUSES = ['awaiting_details', 'pending', 'paid', 'rejected'];

const hotelRefundSchema = new mongoose.Schema(
  {
    /* One refund per booking. The unique index is what makes opening one
       idempotent — a cancel that fires twice finds the first. */
    bookingId: { type: String, required: true, unique: true, index: true },
    settlementId: { type: String, default: null, index: true },
    requestId: { type: String, default: null },
    customerId: { type: String, required: true, index: true },

    propertyId: { type: String, default: null },
    propertyName: { type: String, default: '' },
    ownerPhoneDigits: { type: String, default: null, index: true },
    guestName: { type: String, default: '' },
    guestPhone: { type: String, default: '' },
    checkInDate: { type: String, default: null },

    /* The FULL amount the guest paid, in paise. Not the owner's share, not
       the gross minus commission — what left their account. */
    amountPaise: { type: Number, required: true, min: 0 },

    /*
     * WHO cancelled and WHY — the two facts the person paying this refund
     * reads before they pay it.
     *
     * The rule is a full refund either way, so these do not change the
     * amount. They change whether the refund is RIGHT: an owner who cancelled
     * on the guest is a different situation from a guest who walked away, and
     * "Guest request" chosen by an owner means the guest asked them to cancel
     * — which the team may want to read as guest-initiated. Both the fixed
     * reason and the free-text note come across, because the note is where
     * an owner explains a reason of "Other".
     */
    cancelledBy: { type: String, enum: ['student', 'owner'], required: true },
    cancelReason: { type: String, default: null },
    cancelNote: { type: String, default: null },

    /*
     * Where the settlement was when the booking was cancelled.
     *
     * `held` or `releasable` means nothing had been paid to the owner, the
     * settlement was reversed, and the whole payment is ours to refund from.
     * `withdrawing` or `paid_out` means the owner has already been paid their
     * share — the guest is still owed the full amount, but recovering the
     * owner's part is a conversation, and the admin queue flags it.
     */
    settlementStatusAtCancel: { type: String, default: null },

    status: { type: String, enum: REFUND_STATUSES, default: 'awaiting_details', index: true },

    bank: {
      accountName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifsc: { type: String, default: '' },
      providedAt: { type: Date, default: null },
    },

    /* What the person who made the transfer typed back — the bank's UTR or
       whatever reference they have. */
    reference: { type: String, default: null },
    paidAt: { type: Date, default: null },
    paidByAdminId: { type: String, default: null },
    paidByAdminName: { type: String, default: '' },

    rejectedReason: { type: String, default: null },
    rejectedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'hotel_refunds' },
);

hotelRefundSchema.index({ status: 1, createdAt: -1 });

const rupees = (paise) => Math.round(Number(paise) || 0) / 100;
const last4 = (n) => String(n || '').slice(-4);

/** What the guest's app sees. The account is four digits and a bank code. */
hotelRefundSchema.methods.toCustomer = function toCustomer() {
  return {
    id: String(this._id),
    bookingId: this.bookingId,
    status: this.status,
    amount: rupees(this.amountPaise),
    amountPaise: this.amountPaise,
    cancelledBy: this.cancelledBy,
    bank: this.bank && this.bank.accountNumber
      ? {
        accountName: this.bank.accountName,
        accountLast4: last4(this.bank.accountNumber),
        ifsc: this.bank.ifsc,
      }
      : null,
    reference: this.reference,
    paidAt: this.paidAt,
    rejectedReason: this.rejectedReason,
    createdAt: this.createdAt,
  };
};

/** What the console sees. The account in full, because somebody types it. */
hotelRefundSchema.methods.toAdmin = function toAdmin() {
  return {
    id: String(this._id),
    bookingId: this.bookingId,
    settlementId: this.settlementId,
    requestId: this.requestId,
    customerId: this.customerId,
    propertyId: this.propertyId,
    propertyName: this.propertyName,
    ownerPhoneDigits: this.ownerPhoneDigits,
    guestName: this.guestName,
    guestPhone: this.guestPhone,
    checkInDate: this.checkInDate,
    amount: rupees(this.amountPaise),
    amountPaise: this.amountPaise,
    cancelledBy: this.cancelledBy,
    cancelReason: this.cancelReason,
    cancelNote: this.cancelNote,
    settlementStatusAtCancel: this.settlementStatusAtCancel,
    /* The owner already has their share when the settlement had left
       `held`/`releasable`. The queue shows this as a warning. */
    ownerAlreadyPaid: ['withdrawing', 'paid_out'].includes(this.settlementStatusAtCancel || ''),
    status: this.status,
    bank: this.bank && this.bank.accountNumber
      ? {
        accountName: this.bank.accountName,
        accountNumber: this.bank.accountNumber,
        ifsc: this.bank.ifsc,
        providedAt: this.bank.providedAt,
      }
      : null,
    reference: this.reference,
    paidAt: this.paidAt,
    paidByAdminName: this.paidByAdminName,
    rejectedReason: this.rejectedReason,
    rejectedAt: this.rejectedAt,
    createdAt: this.createdAt,
  };
};

const HotelRefund = mongoose.models.HotelRefund
  || mongoose.model('HotelRefund', hotelRefundSchema);

module.exports = { HotelRefund, REFUND_STATUSES };
