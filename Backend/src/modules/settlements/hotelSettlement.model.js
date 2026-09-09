/* ══════════════════════════════════════════════════════════════════════════
   `hotel_settlements` — the ledger for ONE paid hotel booking.

   A guest pays for a stay, Lampose keeps a commission, the hotel is paid the
   rest. This row is the record of all three, and it is the only thing any
   screen, route or payout is allowed to compute those figures from.

   ## Why this is a new collection rather than a field on the booking

   `PartnerPayout` already exists and is deliberately left alone. It is a
   different shape for a different job: the OWNER taps "request payout", it
   batches every completed booking they have not been paid for, and it carries
   no notion of a commission. This is admin-initiated, one row per booking, and
   a split. Folding the two together would mean one model where half the fields
   are null depending on which flow wrote it, and the first bug would be a
   commission applied to a PG payout that should never have had one.

   ## Scope: HOTEL only

   PG/Hostel and Co-living take no money through the platform at all, and
   Bachelor's ₹199 assisted-visit fee is entirely ours — there is no owner
   share to hold, split or release. None of them ever gets a row here. The
   guard is `paymentPurposeFor(category) === 'stay_booking'`, which is the same
   question `requestPayment.util.js` asks when it decides what to charge, so
   the two cannot disagree about which bookings are settleable.

   ## Every figure is in PAISE, and every one is ours

   Rupees are for display. Razorpay speaks paise, floating-point rupees do not
   divide by 100 exactly, and a commission is a percentage of a number — three
   reasons the integer is the stored form and the conversion happens at the
   edge that renders it.

   `grossAmountPaise` is a SNAPSHOT of what Razorpay actually captured, not
   what the listing costs today. `commissionPaise` and `ownerSharePaise` are
   derived from it and `commissionPercent` on the server, every time, and
   stored so a later change to the percentage cannot silently rewrite what an
   owner was already paid.

   ## The one rule this collection exists to enforce

   No amount ever arrives from a client. Not from the admin panel, not from the
   Stay Partner app, not from a webhook body. The admin sends a PERCENTAGE and
   nothing else; the server multiplies it by a figure it captured itself.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

/**
 * Where the money has got to.
 *
 *   held         the guest has paid and the owner's share is ours to hold.
 *                Nothing may be released — the guest has not arrived, and a
 *                cancellation before check-in is refunded out of it.
 *   releasable   the guest checked in. The refund window has closed, so the
 *                owner's share may now be paid — but nothing is paid until an
 *                administrator says so.
 *   withdrawing  an administrator pressed Withdraw and a RazorpayX payout
 *                exists. This state is the LOCK: nothing else may act on the
 *                row while money is in flight, and it is where a settlement
 *                sits for as long as the payout is queued, pending or
 *                processing.
 *   paid_out     RazorpayX reported `processed`. The bank took it. Terminal,
 *                and reachable ONLY from a payout status — never from the
 *                HTTP response that created the payout.
 *   failed       the payout failed or was cancelled. Retryable: a new attempt
 *                earns a new idempotency key. The reason is kept for the
 *                person deciding whether to try again.
 *   reversed     either the booking was cancelled while still held, or a
 *                completed payout came back from the bank. Terminal.
 *
 * ## The hold is OURS now, not the gateway's
 *
 * Under Razorpay Route a held transfer existed at the gateway from the moment
 * the guest paid, and `held` described something Razorpay was doing. Under
 * RazorpayX there is no provider object until Withdraw is pressed: the money
 * sits in Lampose's account and `held` is a fact about this row alone.
 *
 * That makes the state machine MORE load-bearing rather than less. It is the
 * only thing standing between a guest's payment and a hotel's bank account,
 * so every transition below is guarded, and the `withdrawing` lock is taken
 * atomically in the database rather than checked in a handler.
 *
 * A settlement is created at `held` and never starts anywhere else: money that
 * has not been captured has nothing to settle.
 */
const SETTLEMENT_STATUSES = ['held', 'releasable', 'withdrawing', 'paid_out', 'failed', 'reversed'];

/** The states from which an administrator may release funds. */
const RELEASABLE_FROM = ['releasable', 'failed'];

/**
 * RazorpayX's payout lifecycle, and what Lampose makes of each.
 *
 * The mapping is the whole safety property of this migration. Creating a
 * payout returns 200 with a status that is usually `queued` or `processing` —
 * money has NOT reached a bank at that point, and treating a successful HTTP
 * response as a completed payout is exactly how a hotel gets marked paid for
 * money still sitting with us.
 *
 * So only `processed` produces `paid_out`. Everything in flight leaves the
 * settlement in `withdrawing`, where the admin queue shows it as still going
 * and nothing can start a second payout for it.
 *
 *   queued        accepted, waiting on balance or on the bank window
 *   pending       awaiting an approval workflow on the RazorpayX account
 *   processing    with the bank
 *   processed     the bank took it. THE ONLY TERMINAL SUCCESS.
 *   failed        the bank refused. Retryable as a NEW payout.
 *   cancelled     cancelled before it left. Retryable.
 *   reversed      it left, and came back. The money is ours again, and this
 *                 is the one that must never be quietly re-marked as paid.
 */
const PAYOUT_STATUS_MAP = {
  queued: 'withdrawing',
  pending: 'withdrawing',
  processing: 'withdrawing',
  processed: 'paid_out',
  failed: 'failed',
  cancelled: 'failed',
  reversed: 'reversed',
};

/**
 * What Lampose's settlement should become, given RazorpayX's payout status.
 *
 * An unrecognised status keeps the settlement where it is rather than guessing
 * — a new status word from Razorpay must not be able to mark money paid.
 */
const settlementStatusFor = (payoutStatus) =>
  PAYOUT_STATUS_MAP[String(payoutStatus || '').toLowerCase()] || null;

/**
 * The idempotency key for one payout attempt.
 *
 * Deterministic in the settlement id and the attempt number: retrying the same
 * attempt reaches the same payout at RazorpayX, and only a definitively failed
 * payout advances the attempt and therefore earns a new key. Kept under
 * RazorpayX's 40-character header limit.
 */
const payoutIdempotencyKey = (settlementId, attempt = 0) =>
  `lam-stl-${String(settlementId)}-${attempt}`.slice(0, 40);

const hotelSettlementSchema = new mongoose.Schema(
  {
    /*
     * The booking this settles, and the unique key of the whole collection.
     *
     * One booking, one settlement, enforced by the database rather than by a
     * check in a controller — two rows for one booking is two payouts for one
     * stay, and a uniqueness rule that lives in application code is a rule
     * that loses a race.
     */
    bookingId: { type: String, required: true, unique: true, index: true },
    /* The `VisitRequest` the payment was actually made against. The money is
       on that document; this is how a settlement is traced back to it. */
    requestId: { type: String, required: true, index: true },

    propertyId: { type: String, required: true, index: true },
    propertyName: { type: String, default: '' },
    /* Who gets paid. The same key `PartnerPayout` and `PartnerPaymentMethod`
       are indexed by, so an owner's settlements and their existing payouts can
       be read together without a join through a third collection. */
    ownerPhoneDigits: { type: String, required: true, index: true },

    /* Who paid, for the admin queue's own display. Denormalised because a
       settlement is read long after a request may have been cleaned up. */
    guestName: { type: String, default: '' },
    guestPhone: { type: String, default: '' },
    checkInDate: { type: String, default: null },
    checkOutDate: { type: String, default: null },

    /* ── The money ─────────────────────────────────────────────────────── */

    /*
     * What Razorpay captured, in paise. The source figure for everything else.
     *
     * Written once, from the verified payment — never from a request body and
     * never re-read from the listing. A hotel that raises its nightly rate
     * tomorrow must not change what a guest paid today or what their hotel is
     * owed for it.
     */
    grossAmountPaise: { type: Number, required: true, min: 0 },

    /*
     * Lampose's cut, as a percentage. The ONE number an administrator sets.
     *
     * Capped at 100 and floored at 0 by the schema as well as by the route,
     * because a percentage outside that range is not a smaller or larger
     * commission — it is a negative payout or a debt, and neither is a thing
     * this system should be able to represent.
     */
    commissionPercent: { type: Number, required: true, min: 0, max: 100 },

    /* Both derived from the two above, on the server, and stored so the split
       an owner was actually paid on survives a later change to the rate. */
    commissionPaise: { type: Number, required: true, min: 0 },
    ownerSharePaise: { type: Number, required: true, min: 0 },

    /* ── State ─────────────────────────────────────────────────────────── */

    status: {
      type: String,
      enum: SETTLEMENT_STATUSES,
      default: 'held',
      index: true,
    },

    /*
     * WHICH RAIL settled this row.
     *
     * Lampose moved from Razorpay Route to RazorpayX Payouts. The two use
     * different provider objects and different identifiers, and rows made
     * under the old rail must stay readable — a settlement is a financial
     * record and cannot be rewritten to look like something it was not.
     *
     * So this says which set of identifier fields below is the live one.
     * Defaults to `razorpayx` because every NEW row is one; rows written
     * before the migration carry `route` and keep their own ids.
     */
    provider: {
      type: String,
      /* `manual` is a person making a bank transfer and typing the reference
         back in. It is a real rail — most of the money moves this way today —
         and it is recorded exactly like the other two so the ledger reads the
         same however it was paid. */
      enum: ['route', 'razorpayx', 'manual'],
      default: 'razorpayx',
      index: true,
    },

    /*
     * The owner's payout request this settlement was claimed by.
     *
     * Hotel money reaches an owner through their own "Request payout" now, not
     * through a separate admin release: a settlement that has been claimed is
     * `withdrawing` and belongs to that `PartnerPayout`, which is what stops
     * the same booking being paid twice down two different paths.
     */
    partnerPayoutId: { type: String, default: null, index: true },

    /* What a person typed after making the transfer — the bank's UTR, or
       whatever reference they have. Not validated: it is a note for a human
       tracing money, and refusing an odd-looking one helps nobody. */
    manualReference: { type: String, default: null },

    /* Who marked it paid. An audit entry is written too; this is the copy
       that travels with the row so the ledger answers "who paid this" without
       a join. */
    paidByAdminId: { type: String, default: null },
    paidByAdminName: { type: String, default: '' },

    /* The captured payment this settles, for reconciliation against the
       Razorpay dashboard without a lookup table. Rail-independent — the money
       comes IN through the payment gateway either way. */
    paymentId: { type: String, default: null },

    /* ── RazorpayX Payouts: the live rail ─────────────────────────────── */

    /*
     * The payout that pays the hotel. Created when an administrator presses
     * Withdraw and NEVER before — unlike Route, where a held transfer existed
     * from the moment the guest paid. Under RazorpayX there is no provider
     * object at all while a settlement is `held`; the hold is entirely ours.
     */
    payoutId: { type: String, default: null, index: true },
    /*
     * RazorpayX's own lifecycle for that payout, kept verbatim beside our
     * `status` rather than collapsed into it.
     *
     * They answer different questions. `status` is what Lampose has decided;
     * this is what the bank rail is doing. A payout can sit `queued` for hours
     * on a thin balance, and a settlement whose only record was "withdrawing"
     * could not tell that from a request that was never made.
     */
    payoutStatus: { type: String, default: null },
    /*
     * How many payouts have been ATTEMPTED for this settlement.
     *
     * The input to the idempotency key. It advances only when a payout has
     * DEFINITIVELY failed and a retry is therefore a genuinely new payout —
     * never while one may still be processing, because a fresh key there would
     * be a second payment for the same booking.
     */
    payoutAttempt: { type: Number, default: 0 },
    /* Snapshots of who was paid, so a settlement can be audited after an owner
       changes their bank details. */
    razorpayContactId: { type: String, default: null },
    razorpayFundAccountId: { type: String, default: null },
    /* RazorpayX's own UTR, once the bank has one. What a hotel quotes to their
       bank when asking where the money is. */
    utr: { type: String, default: null },

    /* ── Razorpay Route: historical only ──────────────────────────────── */

    /*
     * Kept, not dropped. Rows settled before the migration reference a Route
     * transfer and a linked account, and deleting the fields would make those
     * records unauditable — the money moved, and the only trace of HOW is
     * here. Nothing writes them any more; `provider === 'route'` is what says
     * they are the meaningful pair on a given row.
     */
    transferId: { type: String, default: null, index: true },
    linkedAccountId: { type: String, default: null },

    /*
     * The idempotency key of the CURRENT payout attempt.
     *
     * Deterministic — derived from the row's `_id` and `payoutAttempt` — so a
     * retried HTTP call lands on the same payout at RazorpayX rather than
     * moving money twice. Stored rather than recomputed so a change to how it
     * is derived cannot orphan an operation already in flight.
     *
     * No longer unique across the collection: it changes when an attempt
     * advances, and a unique index would refuse the second attempt of a
     * genuinely failed payout. Uniqueness where it matters is enforced by
     * `bookingId` above and by the atomic status lock in the service.
     */
    idempotencyKey: { type: String, default: null, index: true },

    /* Razorpay's refusal, kept verbatim. Ours is `failureCode`; theirs is the
       reason a human needs when deciding whether a retry is worth anything. */
    failureCode: { type: String, default: '' },
    failureReason: { type: String, default: '' },

    /* ── Who did what, and when ────────────────────────────────────────── */

    /* The administrator who pressed Withdraw. Not for display — for the
       question "who released this", which is the one an audit asks. The
       `admin_audit_log` carries the fuller record; this is the pointer that
       survives on the row itself. */
    releasedByAdminId: { type: String, default: null },
    releasedAt: { type: Date, default: null },
    /* When Razorpay confirmed, which is not when we asked. */
    settledAt: { type: Date, default: null },
    /* When the guest checked in — what moved this to `releasable`. */
    becameReleasableAt: { type: Date, default: null },
    reversedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'hotel_settlements' },
);

/* The admin queue reads by status, newest first. */
hotelSettlementSchema.index({ status: 1, createdAt: -1 });

/**
 * Split a gross amount by a percentage, in paise, without losing a rupee.
 *
 * The commission is ROUNDED and the owner's share is the REMAINDER, rather
 * than both being rounded independently. Rounding both is how ₹10,000 at 5%
 * becomes ₹500 + ₹9,500.01 — the two halves must add up to the whole, always,
 * because the whole is a real payment sitting in a real account.
 *
 * Exported so the route, the model and any future reconciliation script all
 * compute a split exactly one way.
 */
const splitAmount = (grossPaise, percent) => {
  const gross = Math.max(0, Math.round(Number(grossPaise) || 0));
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  const commissionPaise = Math.round((gross * pct) / 100);
  return { grossPaise: gross, commissionPaise, ownerSharePaise: gross - commissionPaise };
};

/**
 * What the admin panel reads. Rupees for display, paise kept alongside.
 *
 * Both are sent on purpose: the rupee figures are what a person reads, and the
 * paise are what a follow-up request would have to agree with. Nothing here is
 * writable — the only thing a client may send back is a percentage.
 */
hotelSettlementSchema.methods.toAdmin = function toAdmin() {
  const rupees = (paise) => Math.round(Number(paise) || 0) / 100;

  return {
    id: String(this._id),
    bookingId: this.bookingId,
    requestId: this.requestId,
    propertyId: this.propertyId,
    propertyName: this.propertyName,
    ownerPhoneDigits: this.ownerPhoneDigits,
    guestName: this.guestName,
    guestPhone: this.guestPhone,
    checkInDate: this.checkInDate,
    checkOutDate: this.checkOutDate,

    grossAmountPaise: this.grossAmountPaise,
    commissionPercent: this.commissionPercent,
    commissionPaise: this.commissionPaise,
    ownerSharePaise: this.ownerSharePaise,
    totalAmount: rupees(this.grossAmountPaise),
    ourShare: rupees(this.commissionPaise),
    ownerShare: rupees(this.ownerSharePaise),

    status: this.status,
    /* Whether the button may be pressed at all, decided here rather than by
       the panel re-implementing the state machine. The server refuses anyway;
       this is what stops the panel offering an action that can only fail. */
    canWithdraw: RELEASABLE_FROM.includes(this.status),
    /* And whether the percentage may still be edited — frozen the moment the
       row leaves a releasable state, so nobody can rewrite the split behind a
       payout that has already gone. */
    canEditCommission: this.status === 'held' || RELEASABLE_FROM.includes(this.status),

    /* The live rail's identifiers, and the old rail's kept beside them so a
       historical row still shows where its money went. The console labels
       whichever is set. */
    provider: this.provider || 'razorpayx',
    partnerPayoutId: this.partnerPayoutId || null,
    manualReference: this.manualReference || null,
    paidByAdminName: this.paidByAdminName || '',
    payoutId: this.payoutId,
    payoutStatus: this.payoutStatus,
    payoutAttempt: this.payoutAttempt || 0,
    utr: this.utr,
    razorpayContactId: this.razorpayContactId,
    razorpayFundAccountId: this.razorpayFundAccountId,
    /* Historical Route rows only. Null on everything written since. */
    transferId: this.transferId,
    linkedAccountId: this.linkedAccountId,
    paymentId: this.paymentId,
    failureCode: this.failureCode || null,
    failureReason: this.failureReason || null,

    releasedByAdminId: this.releasedByAdminId,
    releasedAt: this.releasedAt ? this.releasedAt.toISOString() : null,
    settledAt: this.settledAt ? this.settledAt.toISOString() : null,
    becameReleasableAt: this.becameReleasableAt ? this.becameReleasableAt.toISOString() : null,
    reversedAt: this.reversedAt ? this.reversedAt.toISOString() : null,
    createdAt: this.createdAt,
  };
};

const HotelSettlement = mongoose.models.HotelSettlement
  || mongoose.model('HotelSettlement', hotelSettlementSchema);

module.exports = {
  HotelSettlement,
  SETTLEMENT_STATUSES,
  RELEASABLE_FROM,
  PAYOUT_STATUS_MAP,
  settlementStatusFor,
  payoutIdempotencyKey,
  splitAmount,
};
