/* ══════════════════════════════════════════════════════════════════════════
   Paying a Stay Partner owner what their completed bookings earned them.

   Two calls, deliberately separate:

     requestPayout    the owner's own "Request payout" button. Reserves the
                       money — a `pending` PartnerPayout row, and every
                       `completed` booking behind it stamped with this
                       payout's id, so a second tap cannot double-spend the
                       same booking into two payouts.

     processPayout    the half that actually moves money, over RazorpayX.
                       NOT called automatically from `requestPayout` — a
                       payout is real money leaving a real account, and this
                       codebase's rule for anything that size (see the fences
                       around `visitPayment.controller.js`'s dev-mark-paid) is
                       a deliberate, separate step rather than a silent one.
                       Today that step is an administrator's own action
                       (`POST /admin/partner-payouts/:id/process`); nothing
                       stops it later being a queued worker once the volume
                       justifies one.

   ## What this deliberately does NOT do

   It does not decide what a "correct" payout amount is beyond "what the
   completed, unpaid-out bookings on this account sum to" — no platform fee,
   no tax withholding, no minimum payout threshold. `breakdown` on the model
   is where those numbers go once a product decision fixes them; until then
   this pays the gross figure it can already prove, honestly, rather than
   inventing a fee schedule nobody has approved.

   ## Amounts, in and out

   `PartnerBooking.paidAmount` and `PartnerPayout.amount` are RUPEES, matching
   every other figure `partnerDomains.controller.js` already shows an owner.
   RazorpayX, like the payment side of Razorpay, accepts only PAISE — the
   conversion happens at the one boundary that calls it (`processPayout`),
   the same rule `config.razorpay.assistedVisitAmountPaise` follows for money
   coming in.
   ══════════════════════════════════════════════════════════════════════════ */
const razorpay = require('../../infrastructure/razorpay/razorpay');
const config = require('../../config/env');
const settlements = require('../settlements/settlement.service');
const {
  PartnerBooking, PartnerPayout, PartnerPaymentMethod,
} = require('./partnerDomains.model');

/** A refusal the caller is meant to show somebody. */
class PayoutError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'PayoutError';
    this.code = code;
    this.status = status;
  }
}

/** Every `completed` booking this owner has not yet been paid out for. */
const unpaidBookingsQuery = (partnerPhoneDigits) => PartnerBooking.find({
  partnerPhoneDigits, status: 'completed', payoutId: null,
});

/**
 * What an owner could request right now, in rupees.
 *
 * TWO sources, because an owner has two kinds of earnings and one screen:
 *
 *   · completed bookings they collected the money for themselves — PG,
 *     hostel, co-living. We were never holding this; it is a record of what
 *     they are owed against our commission.
 *
 *   · HOTEL settlements, where the guest paid US. That money is genuinely in
 *     Lampose's account and the owner's share of it is a debt we owe them.
 *     Only `releasable` rows count — the guest has arrived — which is why
 *     `heldBalance` exists separately for the rest.
 *
 * Settlements are paise and bookings are rupees, so the settlement half is
 * converted at this boundary and nowhere else.
 */
const availableBalance = async (partnerPhoneDigits) => {
  const bookings = await unpaidBookingsQuery(partnerPhoneDigits).select('paidAmount').lean();
  const fromBookings = bookings.reduce((sum, b) => sum + (Number(b.paidAmount) || 0), 0);
  const fromSettlements = await settlements.releasableTotalFor(partnerPhoneDigits);
  return fromBookings + Math.round(fromSettlements) / 100;
};

/**
 * Hotel money a guest has paid that the owner cannot request yet, in rupees.
 *
 * Shown as "held until check-in". It is deliberately visible: an owner whose
 * guest paid last night should see that the money exists, and telling them
 * only once it unlocks makes the product look like it lost a payment.
 */
const heldBalance = async (partnerPhoneDigits) => {
  const paise = await settlements.heldTotalFor(partnerPhoneDigits);
  return Math.round(paise) / 100;
};

/** "HDFC •••• 4821" / "ramesh@upi" — a label for display, never the full
    account number. */
const maskMethod = (method) => {
  if (method.type === 'upi') return method.upiId || 'UPI';
  const last4 = String(method.accountNumber || '').slice(-4);
  return `${method.accountName || 'Bank'} •••• ${last4 || '····'}`;
};

/**
 * The owner's own "Request payout" tap.
 *
 * Refuses outright if there is nothing to pay out or no payment method to pay
 * it to. RazorpayX is never touched here — this only reserves the money.
 */
const requestPayout = async (partner) => {
  const key = partner.phoneDigits;
  if (!key) throw new PayoutError('NOT_ELIGIBLE', 'This account has no verified number.', 403);

  const method = await PartnerPaymentMethod.findOne({ partnerPhoneDigits: key })
    .sort({ isPrimary: -1, createdAt: 1 })
    .lean();
  if (!method) {
    throw new PayoutError(
      'NO_PAYMENT_METHOD',
      'Add a bank account or UPI id before requesting a payout.',
    );
  }

  const bookings = await unpaidBookingsQuery(key).select('_id paidAmount').lean();
  const fromBookings = bookings.reduce((sum, b) => sum + (Number(b.paidAmount) || 0), 0);
  const releasable = await settlements.releasableTotalFor(key);

  if (fromBookings + releasable <= 0) {
    throw new PayoutError('NOTHING_TO_PAY_OUT', 'There is nothing to pay out yet.');
  }

  /* Created first, so its id is what both halves are stamped with. The amount
     is corrected below to whatever was actually claimed. */
  const payout = await PartnerPayout.create({
    partnerPhoneDigits: key,
    amount: fromBookings,
    status: 'pending',
    bankAccount: maskMethod(method),
    bookingIds: bookings.map((b) => String(b._id)),
    requestedAt: new Date(),
  });

  /* Claimed AFTER the row exists, so `payout._id` is what stamps them — and
     scoped on `payoutId: null` as well as the id list, so a booking claimed
     by a second, concurrent request between the read above and this write is
     left for that OTHER payout rather than counted into both. */
  await PartnerBooking.updateMany(
    { _id: { $in: bookings.map((b) => b._id) }, payoutId: null },
    { $set: { payoutId: String(payout._id) } },
  );

  /*
   * The hotel half, claimed the same way and for the same reason.
   *
   * `claimForPartnerPayout` matches on `status: 'releasable'` inside the
   * update, so a settlement another request took a millisecond earlier is not
   * counted here — which is why the total is recomputed from what came BACK
   * rather than from what was read above. An owner is never told they
   * requested money that a concurrent request had already taken.
   */
  const claimed = await settlements.claimForPartnerPayout(key, payout._id);
  const claimedPaise = claimed.reduce((sum, r) => sum + (Number(r.ownerSharePaise) || 0), 0);

  const total = fromBookings + Math.round(claimedPaise) / 100;
  if (total <= 0) {
    /* Everything was taken between the read and the claim. Nothing to pay. */
    await PartnerPayout.deleteOne({ _id: payout._id });
    await PartnerBooking.updateMany(
      { payoutId: String(payout._id) }, { $set: { payoutId: null } },
    );
    throw new PayoutError('NOTHING_TO_PAY_OUT', 'There is nothing to pay out yet.');
  }

  payout.amount = total;
  payout.settlementCount = claimed.length;
  await payout.save();

  return payout;
};

/**
 * The half that moves money — an administrator's action, not automatic.
 *
 * Reuses a contact/fund account already provisioned for this exact owner and
 * masked method from an earlier successful payout, so a second payout to the
 * same person does not re-create either at RazorpayX (which has no natural
 * key to look one up by — our own history is the only reliable "have we made
 * this before").
 */
const processPayout = async (payoutId) => {
  /* The automatic rail, switched off until this deployment has RazorpayX
     credentials. `markPaidManually` below is what pays an owner today. */
  if (config.razorpayx.manualPayouts) {
    throw new PayoutError(
      'MANUAL_PAYOUTS',
      'Automatic payouts are switched off. Pay the owner by bank transfer and record it with '
      + 'Mark as paid.',
      409,
    );
  }

  if (!razorpay.isPayoutConfigured()) {
    throw new PayoutError('RAZORPAYX_NOT_CONFIGURED', 'Payouts are not configured on this server.', 503);
  }

  const payout = await PartnerPayout.findOne({ _id: payoutId, status: 'pending' });
  if (!payout) {
    throw new PayoutError('NOT_FOUND', 'No pending payout with that id.', 404);
  }

  // eslint-disable-next-line global-require
  const Partner = require('./partner.model');
  const partner = await Partner.findOne({ phoneDigits: payout.partnerPhoneDigits }).lean();
  if (!partner) {
    throw new PayoutError('OWNER_NOT_FOUND', 'This payout has no owner account behind it any more.', 404);
  }

  payout.status = 'processing';
  await payout.save();

  try {
    const previous = await PartnerPayout.findOne({
      partnerPhoneDigits: payout.partnerPhoneDigits,
      bankAccount: payout.bankAccount,
      razorpayFundAccountId: { $ne: null },
    }).sort({ createdAt: -1 }).lean();

    let contactId = previous?.razorpayContactId || null;
    let fundAccountId = previous?.razorpayFundAccountId || null;

    if (!contactId) {
      const contact = await razorpay.createContact({
        name: partner.name || 'Lampose partner',
        phone: partner.phone,
        referenceId: partner.partnerId,
      });
      contactId = contact.id;
    }

    if (!fundAccountId) {
      const method = await PartnerPaymentMethod.findOne({
        partnerPhoneDigits: payout.partnerPhoneDigits,
      }).sort({ isPrimary: -1, createdAt: 1 }).lean();
      if (!method) throw new PayoutError('NO_PAYMENT_METHOD', 'This owner has no payout method on file.');

      const fundAccount = method.type === 'upi'
        ? await razorpay.createFundAccount({ contactId, method: 'vpa', vpa: method.upiId })
        : await razorpay.createFundAccount({
          contactId,
          method: 'bank_account',
          bankAccount: {
            name: method.accountName, ifsc: method.ifsc, accountNumber: method.accountNumber,
          },
        });
      fundAccountId = fundAccount.id;
    }

    const dispatched = await razorpay.createPayout({
      fundAccountId,
      amountPaise: Math.round(payout.amount * 100),
      referenceId: String(payout._id),
      /* Explicit now that `createPayout` takes the two separately. This is
         exactly the value that was previously sent as the idempotency header
         — the reference id — so behaviour here is unchanged. This flow has one
         attempt per `PartnerPayout` row, so it needs no attempt counter; the
         hotel settlement flow does, and derives its own. */
      idempotencyKey: String(payout._id),
      narration: 'Lampose payout',
    });

    payout.referenceId = dispatched.id;
    payout.razorpayContactId = contactId;
    payout.razorpayFundAccountId = fundAccountId;
    payout.payoutDate = new Date().toISOString().slice(0, 10);
    payout.processedAt = new Date();

    /*
     * The status comes from the PAYOUT, not from the fact this call returned.
     *
     * This used to call a `queued` payout `completed`, on the reasoning that
     * accepted means on its way. It does not: queued money has not left the
     * account, and an owner reading "Completed" on their Payouts screen has
     * been told they were paid when they were not.
     *
     * `applyPayoutStatus` below is the single interpreter, shared with the
     * webhook, so the dispatch response and the event that follows it can
     * never disagree about what a status word means.
     */
    await applyPayoutStatus(payout, dispatched);
    return payout;
  } catch (error) {
    payout.status = 'failed';
    payout.failureReason = error.message || 'RazorpayX refused this payout.';
    await payout.save();

    /* Give the bookings back — a failed payout must not leave them
       permanently unclaimable by a future, successful request. */
    await PartnerBooking.updateMany(
      { payoutId: String(payout._id) },
      { $set: { payoutId: null } },
    );

    throw error;
  }
};


/* ══════════════════════════════════════════════════════════════════════════
   What RazorpayX's payout status makes of a PartnerPayout.

   The same shape as the hotel settlement's `applyPayoutStatus`, and for the
   same three reasons: only `processed` means paid; an unrecognised word
   changes nothing; and a terminal row does not move again. Two flows, two
   collections, one rule about what the bank is telling us.

   `completed` is reached HERE and from the webhook, and nowhere else.
   ══════════════════════════════════════════════════════════════════════════ */
const PAYOUT_STATUS_MAP = {
  queued: 'processing',
  pending: 'processing',
  processing: 'processing',
  processed: 'completed',
  failed: 'failed',
  cancelled: 'failed',
  reversed: 'failed',
};

/**
 * Apply a RazorpayX payout entity to a `PartnerPayout` row and save it.
 *
 * Returns the row. A failure additionally hands the owner's bookings back, so
 * money that never arrived can be requested again — the same release the
 * dispatch path does in its catch, because a payout that fails at the bank
 * two days later is the identical situation to one refused at creation.
 */
const applyPayoutStatus = async (payout, entity) => {
  const next = PAYOUT_STATUS_MAP[String(entity?.status || '').toLowerCase()] || null;

  /* An unknown status, or one that would move a finished row backwards. */
  if (!next) return payout;
  if (payout.status === 'completed' && next !== 'failed') return payout;

  const before = payout.status;
  payout.status = next;
  payout.razorpayReferenceId = entity.utr || payout.razorpayReferenceId || null;
  if (entity.id) payout.referenceId = entity.id;
  if (next === 'failed') {
    payout.failureReason = entity.failure_reason
      || entity.status_details?.description
      || 'RazorpayX could not complete this payout.';
  }
  if (next === 'completed') payout.processedAt = payout.processedAt || new Date();
  await payout.save();

  if (next === 'failed' && before !== 'failed') {
    await PartnerBooking.updateMany(
      { payoutId: String(payout._id) },
      { $set: { payoutId: null } },
    );
  }

  return payout;
};

/**
 * The webhook's entry point: find the payout an event belongs to, and apply it.
 *
 * Returns null when the event is not about a Stay Partner payout at all —
 * hotel settlements share this RazorpayX account and arrive at the same URL,
 * so "not ours" is the common case and not an error.
 */
const applyWebhookPayout = async (entity) => {
  const reference = entity?.reference_id || null;
  const byReference = reference && /^[0-9a-fA-F]{24}$/.test(String(reference))
    ? await PartnerPayout.findById(reference)
    : null;
  const payout = byReference
    || (entity?.id ? await PartnerPayout.findOne({ referenceId: entity.id }) : null);

  if (!payout) return null;
  return applyPayoutStatus(payout, entity);
};


/**
 * Record that a person paid this owner by bank transfer.
 *
 * The whole of what "processing a payout" means while the automatic rail is
 * off: somebody opened their banking app, made the transfer, and typed the
 * reference back in here. That reference is the only evidence the money moved,
 * which is why it is stored on the row and shown to the owner — it is what
 * they quote to their bank when they ring to ask.
 *
 * Both halves are settled together. A payout that covered three completed
 * bookings and two hotel settlements is one transfer, so it is one action:
 * the bookings stay claimed and the settlements become `paid_out`.
 */
const markPaidManually = async (payoutId, { reference = '', admin } = {}) => {
  const payout = await PartnerPayout.findOne({
    _id: payoutId, status: { $in: ['pending', 'processing', 'failed'] },
  });
  if (!payout) {
    const current = await PartnerPayout.findById(payoutId).lean();
    if (!current) throw new PayoutError('NOT_FOUND', 'No payout with that id.', 404);
    throw new PayoutError('ALREADY_PAID', 'This payout has already been marked paid.', 409);
  }

  const now = new Date();
  payout.status = 'completed';
  payout.razorpayReferenceId = String(reference || '').slice(0, 120) || null;
  payout.payoutDate = now.toISOString().slice(0, 10);
  payout.processedAt = now;
  payout.failureReason = null;
  payout.paidManually = true;
  payout.paidByAdminName = admin?.name || '';
  await payout.save();

  /* The hotel settlements this request claimed, finished with the same
     reference — so the ledger and the owner's screen tell one story. */
  await settlements.markClaimPaidManually(payout._id, { reference, admin });

  return payout;
};

/**
 * Refuse a request and give everything back.
 *
 * A payout an administrator decides not to make must not leave the owner's
 * bookings and settlements permanently claimed — that money would disappear
 * from their available balance with nothing to show for it.
 */
const rejectPayout = async (payoutId, { reason = '', admin } = {}) => {
  const payout = await PartnerPayout.findOne({
    _id: payoutId, status: { $in: ['pending', 'processing'] },
  });
  if (!payout) throw new PayoutError('NOT_FOUND', 'No open payout with that id.', 404);

  payout.status = 'failed';
  payout.failureReason = String(reason || '').slice(0, 400) || 'Refused by Lampose.';
  payout.paidByAdminName = admin?.name || '';
  await payout.save();

  await PartnerBooking.updateMany(
    { payoutId: String(payout._id) }, { $set: { payoutId: null } },
  );
  await settlements.releaseClaim(payout._id);

  return payout;
};

module.exports = {
  PayoutError, availableBalance, requestPayout, processPayout,
  /* Exported so a payout status has exactly one interpreter, shared with
     the webhook — see the note above `applyPayoutStatus`. */
  applyPayoutStatus, applyWebhookPayout,
  /* The manual rail — how an owner is actually paid today. */
  heldBalance, markPaidManually, rejectPayout,
};
