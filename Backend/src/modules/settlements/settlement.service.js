/* ══════════════════════════════════════════════════════════════════════════
   The hotel settlement lifecycle. Every state change lives here.

       paid ──► held ──► releasable ──► withdrawing ──► paid_out
                  │           ▲              │
                  │           └── failed ◄───┘
                  └──► reversed  (cancelled before check-in)

   ## One writer

   No route, controller or webhook changes `status` itself. They call a
   function here. The reason is the `withdrawing` state: it is a LOCK, taken
   with an atomic `findOneAndUpdate` that only succeeds from a releasable
   state, and a lock is worth nothing if a second file can set the field
   directly.

   ## Nothing here takes an amount from a caller

   `createForPaidBooking` reads what Razorpay captured. `releaseToOwner` reads
   what is stored. The only figure any caller may supply is a PERCENTAGE, and
   only through `setCommission`, and only while the row is still editable.
   A route handler that wanted to pay a different amount has no way to say so.

   ## HOTEL only

   `paymentPurposeFor(category) === 'stay_booking'` is the gate, the same
   question `requestPayment.util.js` asks when deciding what to charge. PG,
   Hostel and Co-living never reach this file because they never take money;
   Bachelor's ₹199 never reaches it because the fee is entirely ours and there
   is no owner share to hold, split or release.
   ══════════════════════════════════════════════════════════════════════════ */
const config = require('../../config/env');
const razorpay = require('../../infrastructure/razorpay/razorpay');
const {
  HotelSettlement, RELEASABLE_FROM, splitAmount,
  settlementStatusFor, payoutIdempotencyKey,
} = require('./hotelSettlement.model');

/** A refusal the caller is meant to show somebody. */
class SettlementError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'SettlementError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Where this owner's money should go, or null if we cannot pay them yet.
 *
 * Read at the moment it is needed rather than cached on the settlement,
 * because an owner completing onboarding AFTER a guest has already paid is a
 * normal sequence — the booking is taken, the money is held, and the details
 * arrive later.
 *
 * A RazorpayX FUND ACCOUNT is the beneficiary. Unlike Route's linked account
 * there is no activation step and no merchant onboarding: the hotel is a payee,
 * not a sub-merchant. So `active` here means "we have a fund account id from
 * RazorpayX", which is the only thing a payout actually needs.
 */
const beneficiaryFor = async (ownerPhoneDigits) => {
  /* Default export, not a named one — see `partner.model.js`. */
  const Partner = require('../partners/partner.model');
  const partner = await Partner.findOne({ phoneDigits: ownerPhoneDigits })
    .select('payoutOnboarding').lean();
  const onboarding = partner && partner.payoutOnboarding;

  if (!onboarding || onboarding.status !== 'active' || !onboarding.razorpayFundAccountId) {
    return null;
  }
  return {
    fundAccountId: onboarding.razorpayFundAccountId,
    contactId: onboarding.razorpayContactId || null,
  };
};

/**
 * Create the ledger row for a hotel booking whose payment has just verified,
 * and hold the owner's share on a Route transfer.
 *
 * ## Nothing is sent to a gateway here, and that is the migration
 *
 * Under Razorpay Route this created a held TRANSFER at the moment of payment,
 * so the owner's share was ring-fenced at the gateway. RazorpayX has no such
 * object: a payout is created when it is paid, and never before.
 *
 * So the hold is entirely this row. The money sits in Lampose's account, the
 * split is recorded against the payment that was actually captured, and
 * nothing reaches RazorpayX until an administrator presses Withdraw.
 *
 * A consequence worth stating: an owner who has not finished payout onboarding
 * no longer blocks anything at this point. The guest pays, the settlement is
 * held, and the beneficiary is looked up at RELEASE — which is the only moment
 * it is actually needed. `releaseToOwner` is where "the hotel owner has not
 * completed payout onboarding" is raised.
 *
 * ## Idempotent
 *
 * `bookingId` is unique. A redelivered webhook or a retried verify finds the
 * existing row and returns it rather than creating a second — and the caller
 * cannot tell the difference, which is the point.
 */
const createForPaidBooking = async ({ request, booking }) => {
  if (!request || !booking) return null;

  const existing = await HotelSettlement.findOne({ bookingId: String(booking._id) });
  if (existing) return existing;

  /* What Razorpay actually captured, never what the listing costs today. */
  const grossPaise = Number(request.payment?.amountPaise) || 0;
  if (grossPaise <= 0) {
    console.error(
      `[settlement] booking ${booking._id} is a paid hotel stay with no captured amount — `
      + 'no settlement created. This is a bug in the payment path, not a free room.',
    );
    return null;
  }

  const percent = config.razorpay.hotelCommissionPercent;
  const split = splitAmount(grossPaise, percent);

  const settlement = await HotelSettlement.create({
    bookingId: String(booking._id),
    requestId: String(request._id),
    propertyId: request.listingId,
    propertyName: request.propertyName || '',
    ownerPhoneDigits: booking.partnerPhoneDigits,
    guestName: request.customer?.name || '',
    guestPhone: request.customer?.phone || '',
    checkInDate: request.intent?.checkIn || booking.checkInDate || null,
    checkOutDate: request.intent?.checkOut || booking.checkOutDate || null,

    grossAmountPaise: split.grossPaise,
    commissionPercent: percent,
    commissionPaise: split.commissionPaise,
    ownerSharePaise: split.ownerSharePaise,

    status: 'held',
    paymentId: request.payment?.paymentId || null,
  });

  /*
   * The key the FIRST payout attempt will use, derived from the row's own id
   * so a retried HTTP call lands on the same payout at RazorpayX. Stored
   * rather than recomputed — see the model — and advanced only by a
   * definitively failed payout.
   */
  settlement.idempotencyKey = payoutIdempotencyKey(settlement._id, 0);
  await settlement.save();

  return settlement;
};

/**
 * Apply a RazorpayX payout status to a settlement.
 *
 * The ONE place a payout status becomes a settlement status, used by both the
 * create response and the webhook, so the two can never disagree about what
 * `processed` means.
 *
 * Three rules it exists to hold:
 *
 *   · only `processed` reaches `paid_out`. A 200 from the create call is not
 *     money in a bank.
 *   · an unrecognised status changes NOTHING. A new word from Razorpay must
 *     not be able to mark a settlement paid.
 *   · `paid_out` and `reversed` are terminal for everything except a
 *     `reversed` arriving after a `processed` — which is a real sequence, and
 *     the one case where a paid settlement must move again.
 */
const applyPayoutStatus = async (settlement, payout) => {
  const payoutStatus = String(payout?.status || '').toLowerCase();
  const next = settlementStatusFor(payoutStatus);

  settlement.payoutStatus = payoutStatus || settlement.payoutStatus;
  if (payout?.id) settlement.payoutId = payout.id;
  if (payout?.utr) settlement.utr = payout.utr;

  if (!next || next === settlement.status) {
    await settlement.save();
    return settlement;
  }

  /* A settled payout cannot be un-settled by a late `processing` webhook
     arriving out of order — but a REVERSAL after settlement is real money
     coming back and must always land. */
  const terminal = settlement.status === 'paid_out' || settlement.status === 'reversed';
  if (terminal && next !== 'reversed') {
    await settlement.save();
    return settlement;
  }

  settlement.status = next;

  if (next === 'paid_out') {
    settlement.settledAt = settlement.settledAt || new Date();
    settlement.failureCode = '';
    settlement.failureReason = '';
  }
  if (next === 'failed') {
    settlement.failureCode = payout?.failure_reason ? 'PAYOUT_FAILED' : (settlement.failureCode || 'PAYOUT_FAILED');
    settlement.failureReason = String(
      payout?.failure_reason || payout?.status_details?.description || settlement.failureReason || '',
    ).slice(0, 400);
    /* A definitively failed payout is the ONLY thing that earns a new
       idempotency key — a retry is then a genuinely new payout rather than a
       second submission of the one that is still in flight. */
    settlement.payoutAttempt = (settlement.payoutAttempt || 0) + 1;
    settlement.idempotencyKey = payoutIdempotencyKey(settlement._id, settlement.payoutAttempt);
  }
  if (next === 'reversed') {
    settlement.reversedAt = settlement.reversedAt || new Date();
  }

  await settlement.save();
  return settlement;
};

/**
 * The guest checked in, so the refund window has closed and the owner's share
 * may now be released.
 *
 * Only ever moves `held → releasable`. Anything already `withdrawing`,
 * `paid_out` or `reversed` is left alone: a second check-in event, or a
 * check-in recorded after a payout, must not reopen a finished settlement.
 */
const markReleasable = async (bookingId) => {
  const updated = await HotelSettlement.findOneAndUpdate(
    { bookingId: String(bookingId), status: 'held' },
    { $set: { status: 'releasable', becameReleasableAt: new Date() } },
    { new: true },
  );
  return updated;
};

/**
 * Change the commission, and re-split from the stored gross.
 *
 * The percentage is the ONLY number an administrator may send, and even that
 * is refused once the row has left an editable state — rewriting the split
 * behind a payout that has already gone would make the ledger disagree with
 * the bank.
 */
const setCommission = async (settlementId, percent) => {
  const pct = Number(percent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new SettlementError('BAD_PERCENT', 'The commission must be a number between 0 and 100.');
  }

  const settlement = await HotelSettlement.findById(settlementId);
  if (!settlement) throw new SettlementError('NOT_FOUND', 'That settlement does not exist.', 404);

  const editable = settlement.status === 'held' || RELEASABLE_FROM.includes(settlement.status);
  if (!editable) {
    throw new SettlementError(
      'NOT_EDITABLE',
      `This settlement is ${settlement.status} — its split can no longer be changed.`,
      409,
    );
  }

  const before = {
    commissionPercent: settlement.commissionPercent,
    commissionPaise: settlement.commissionPaise,
    ownerSharePaise: settlement.ownerSharePaise,
  };

  /* Re-split from the CAPTURED figure, never from the previous shares. */
  const split = splitAmount(settlement.grossAmountPaise, pct);
  settlement.commissionPercent = pct;
  settlement.commissionPaise = split.commissionPaise;
  settlement.ownerSharePaise = split.ownerSharePaise;
  await settlement.save();

  return { settlement, before };
};

/**
 * Release the owner's share. The one call that lets money reach a hotel.
 *
 * ## The lock
 *
 * The first thing this does is an atomic `findOneAndUpdate` from a releasable
 * state into `withdrawing`. Two administrators pressing Withdraw at the same
 * moment both reach this line; exactly one of them matches the filter, and the
 * other is told the settlement is already being processed. The guard is the
 * database's, not a check in a route handler that two requests can both pass.
 *
 * ## Why no amount is passed in
 *
 * There is no parameter for one. The figure is `ownerSharePaise`, computed by
 * this service from what Razorpay captured. An administrator can change the
 * PERCENTAGE beforehand — and that is audited — but nobody can name a rupee
 * figure at the moment of payment.
 */
const releaseToOwner = async (settlementId) => {
  /*
   * Not while this deployment pays by hand.
   *
   * Refused HERE rather than in the route, so every caller — the console, a
   * script, a future worker — gets the same answer. The RazorpayX code below
   * is intact and tested; it is simply not the way money moves today, and a
   * dispatch attempted without credentials would fail deeper down with a
   * worse message.
   */
  if (config.razorpayx.manualPayouts) {
    throw new SettlementError(
      'MANUAL_PAYOUTS',
      'Automatic payouts are switched off. Pay the owner by bank transfer and record it with '
      + 'Mark as paid.',
      409,
    );
  }

  /* Take the lock. Only a releasable or previously-failed row may be claimed. */
  const claimed = await HotelSettlement.findOneAndUpdate(
    { _id: settlementId, status: { $in: RELEASABLE_FROM } },
    { $set: { status: 'withdrawing', failureCode: '', failureReason: '' } },
    { new: true },
  );

  if (!claimed) {
    const current = await HotelSettlement.findById(settlementId).lean();
    if (!current) throw new SettlementError('NOT_FOUND', 'That settlement does not exist.', 404);
    if (current.status === 'paid_out') {
      throw new SettlementError('ALREADY_PAID_OUT', 'This owner has already been paid for this booking.', 409);
    }
    if (current.status === 'held') {
      throw new SettlementError(
        'NOT_RELEASABLE',
        'The guest has not checked in yet, so this money is still held against a possible refund.',
        409,
      );
    }
    if (current.status === 'withdrawing') {
      throw new SettlementError('IN_PROGRESS', 'This payout is already being processed.', 409);
    }
    throw new SettlementError('NOT_RELEASABLE', `This settlement is ${current.status}.`, 409);
  }

  /*
   * The bank details check, before anything moves.
   *
   * This is the "Hotel owner bank details are missing" refusal, and it is made
   * against a RazorpayX FUND ACCOUNT — an id Razorpay gave us for a
   * beneficiary it accepted — rather than against fields somebody typed into
   * our database. An owner who filled the form but whose account RazorpayX
   * refused has no fund account id, and is correctly refused here.
   */
  const beneficiary = await beneficiaryFor(claimed.ownerPhoneDigits);
  if (!beneficiary) {
    return failRelease(claimed, new SettlementError(
      'OWNER_NOT_ONBOARDED',
      'The hotel owner has not added their bank details, so we cannot pay them yet.',
      409,
    ));
  }

  /*
   * A payout may ALREADY exist for this settlement.
   *
   * The lock stops two administrators racing, but not a process that died
   * between creating a payout and recording it. Asking RazorpayX about the
   * payout we know of — rather than creating a second — is what makes a crash
   * mid-withdraw recoverable instead of a double payment.
   */
  if (claimed.payoutId) {
    try {
      const existing = await razorpay.fetchPayout(claimed.payoutId);
      const settled = await applyPayoutStatus(claimed, existing);
      return { settlement: settled, razorpay: existing };
    } catch (error) {
      return failRelease(claimed, error);
    }
  }

  try {
    /*
     * The payout. The one call in this codebase that sends a hotel money.
     *
     * `ownerSharePaise` is the stored figure — never recomputed here, never
     * from a request body. `account_number` inside the client is LAMPOSE'S
     * RazorpayX account; the hotel is identified only by `fund_account_id`.
     *
     * The idempotency key is the settlement's current one, which advances only
     * when a payout has definitively failed. Retrying a payout that is still
     * processing therefore reaches the SAME payout rather than making a second.
     */
    const payout = await razorpay.createPayout({
      fundAccountId: beneficiary.fundAccountId,
      amountPaise: claimed.ownerSharePaise,
      referenceId: String(claimed._id),
      idempotencyKey: claimed.idempotencyKey || payoutIdempotencyKey(claimed._id, claimed.payoutAttempt || 0),
      narration: `Lampose ${String(claimed.propertyName || 'hotel').slice(0, 18)}`,
      purpose: 'vendor bill',
      notes: { settlementId: String(claimed._id), bookingId: claimed.bookingId },
    });

    claimed.payoutId = payout.id || null;
    claimed.razorpayFundAccountId = beneficiary.fundAccountId;
    claimed.razorpayContactId = beneficiary.contactId;
    claimed.releasedAt = claimed.releasedAt || new Date();

    /*
     * The status comes from the PAYOUT, not from the fact this call returned.
     *
     * RazorpayX answers 200 with `queued` or `processing` far more often than
     * `processed`, and money has not reached a bank in either case. So the
     * settlement usually STAYS `withdrawing` here and is finished by the
     * webhook. Marking it paid because the HTTP call succeeded is precisely
     * the mistake this migration has to avoid.
     */
    const settled = await applyPayoutStatus(claimed, payout);
    return { settlement: settled, razorpay: payout };
  } catch (error) {
    return failRelease(claimed, error);
  }
};

/**
 * Record a refusal and put the row back where an administrator can retry it.
 *
 * `failed` rather than back to `releasable` so the failure is visible in the
 * queue — but `RELEASABLE_FROM` includes `failed`, so retrying is one press
 * and never needs a manual state fix.
 */
const failRelease = async (settlement, error) => {
  settlement.status = 'failed';
  settlement.failureCode = error.code || 'RELEASE_FAILED';
  settlement.failureReason = String(error.message || '').slice(0, 400);

  /*
   * Advance the attempt ONLY when we know no payout was created.
   *
   * These are the refusals that happened before RazorpayX accepted anything —
   * a missing beneficiary, a rejected request, an unconfigured server — so the
   * next press is a genuinely new payout and needs a fresh key.
   *
   * A settlement that already carries a `payoutId` is NOT advanced: something
   * is in flight at RazorpayX, and handing the retry a new key would submit a
   * second payout for the same booking. That row is recovered by the
   * `fetchPayout` branch in `releaseToOwner`, not by a new attempt.
   */
  if (!settlement.payoutId) {
    settlement.payoutAttempt = (settlement.payoutAttempt || 0) + 1;
    settlement.idempotencyKey = payoutIdempotencyKey(settlement._id, settlement.payoutAttempt);
  }

  await settlement.save();

  const failure = new SettlementError(
    settlement.failureCode,
    settlement.failureReason,
    error.status || 502,
  );
  failure.settlement = settlement;
  throw failure;
};

/**
 * Take the held share back so a cancellation can be refunded from the full
 * payment.
 *
 * Refused once the money has been released — at that point it is the hotel's,
 * and recovering it is a conversation rather than an API call. The state
 * machine is what guarantees that: only a `held` row can be reversed, and a
 * row stops being `held` the moment the guest checks in.
 */
const reverseForRefund = async (settlementId) => {
  /* `releasable` as well as `held`: the guest checked in and the owner has
     not yet asked for the money. Nothing has left Lampose's account in either
     state, so both can be given back in full. `withdrawing`/`paid_out` cannot —
     the owner has that money — and stay refused below. */
  const settlement = await HotelSettlement.findOneAndUpdate(
    { _id: settlementId, status: { $in: ['held', 'releasable'] } },
    { $set: { status: 'reversed', reversedAt: new Date() } },
    { new: true },
  );

  if (!settlement) {
    const current = await HotelSettlement.findById(settlementId).lean();
    if (!current) throw new SettlementError('NOT_FOUND', 'That settlement does not exist.', 404);
    throw new SettlementError(
      'NOT_REVERSIBLE',
      `This settlement is ${current.status} — the owner's share is no longer held.`,
      409,
    );
  }

  /*
   * There is nothing at a gateway to reverse, and that is the point.
   *
   * Under Route the owner's share sat in a held transfer, so a cancellation
   * had to reverse it before the guest could be refunded. Under RazorpayX
   * nothing left Lampose's account while the settlement was `held` — no payout
   * was ever created — so the full payment is already ours to refund from, and
   * marking the row `reversed` is the whole operation.
   *
   * A historical Route row still carrying a `transferId` is left alone rather
   * than reversed from here: that rail is retired, and a reversal against it
   * belongs to whoever is reconciling those records by hand.
   */
  return settlement;
};


/* ══════════════════════════════════════════════════════════════════════════
   Hotel money, reaching the owner through their OWN payout request.

   ## Why it is claimed rather than paid directly

   There are now two ways money could leave for the same booking: an
   administrator releasing a settlement, and an owner requesting a payout that
   includes it. Two paths to one pot is how a hotel gets paid twice.

   So there is one path. A settlement becomes `withdrawing` the moment an
   owner's request claims it, stamped with that request's id — and
   `RELEASABLE_FROM` does not include `withdrawing`, so nothing else can take
   it while it is spoken for.

   ## Check-in is still the gate

   Only `releasable` rows are claimable, and a row becomes releasable when the
   guest actually arrives. An owner sees held money on their earnings screen
   from the moment the guest pays — see `heldTotalFor` — but cannot request it
   until there is a guest in the building, which is the whole reason the hold
   exists.
   ══════════════════════════════════════════════════════════════════════════ */

/** Owner share, in paise, of everything this owner could request right now. */
const releasableTotalFor = async (ownerPhoneDigits) => {
  const rows = await HotelSettlement.find({
    ownerPhoneDigits, status: 'releasable',
  }).select('ownerSharePaise').lean();
  return rows.reduce((sum, r) => sum + (Number(r.ownerSharePaise) || 0), 0);
};

/**
 * Owner share, in paise, of money a guest has paid that is not yet claimable.
 *
 * Shown to the owner as "held until check-in". `failed` is deliberately part
 * of it: a payout that did not go through is still the owner's money and must
 * not silently vanish off their screen.
 */
const heldTotalFor = async (ownerPhoneDigits) => {
  const rows = await HotelSettlement.find({
    ownerPhoneDigits, status: { $in: ['held', 'failed'] },
  }).select('ownerSharePaise').lean();
  return rows.reduce((sum, r) => sum + (Number(r.ownerSharePaise) || 0), 0);
};

/**
 * Claim every releasable settlement for one owner into one payout request.
 *
 * Matched on `status: 'releasable'` in the update itself, so two requests
 * racing cannot both claim the same row — the second matches nothing.
 * Returns the claimed rows so the caller can total what it actually got,
 * rather than what it read a moment earlier.
 */
const claimForPartnerPayout = async (ownerPhoneDigits, partnerPayoutId) => {
  const ids = (await HotelSettlement.find({ ownerPhoneDigits, status: 'releasable' })
    .select('_id').lean()).map((r) => r._id);
  if (!ids.length) return [];

  await HotelSettlement.updateMany(
    { _id: { $in: ids }, status: 'releasable' },
    {
      $set: {
        status: 'withdrawing',
        partnerPayoutId: String(partnerPayoutId),
        releasedAt: new Date(),
      },
    },
  );

  return HotelSettlement.find({ _id: { $in: ids }, partnerPayoutId: String(partnerPayoutId) }).lean();
};

/** Hand claimed settlements back, for a request that failed or was cancelled. */
const releaseClaim = async (partnerPayoutId) => {
  await HotelSettlement.updateMany(
    { partnerPayoutId: String(partnerPayoutId), status: 'withdrawing' },
    { $set: { status: 'releasable', partnerPayoutId: null } },
  );
};

/**
 * Record that a person paid these settlements by bank transfer.
 *
 * `paid_out` is reached from here and from a `payout.processed` webhook, and
 * from nowhere else — the same rule as before, with a second rail that a
 * human is the evidence for rather than Razorpay.
 */
const markClaimPaidManually = async (partnerPayoutId, { reference = '', admin } = {}) => {
  const now = new Date();
  await HotelSettlement.updateMany(
    { partnerPayoutId: String(partnerPayoutId), status: 'withdrawing' },
    {
      $set: {
        status: 'paid_out',
        provider: 'manual',
        settledAt: now,
        manualReference: String(reference || '').slice(0, 120),
        paidByAdminId: admin ? String(admin._id) : null,
        paidByAdminName: admin?.name || '',
        failureCode: '',
        failureReason: '',
      },
    },
  );
  return HotelSettlement.find({ partnerPayoutId: String(partnerPayoutId) }).lean();
};

module.exports = {
  SettlementError,
  createForPaidBooking,
  markReleasable,
  setCommission,
  releaseToOwner,
  /* The webhook's entry point, and the reconciliation path's. Exported so a
     payout status has exactly one interpreter. */
  applyPayoutStatus,
  beneficiaryFor,
  reverseForRefund,
  /* The manual rail — how hotel money actually reaches an owner today. */
  releasableTotalFor,
  heldTotalFor,
  claimForPartnerPayout,
  releaseClaim,
  markClaimPaidManually,
};
