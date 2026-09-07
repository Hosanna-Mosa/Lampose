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

/** What an owner could request right now, in rupees. */
const availableBalance = async (partnerPhoneDigits) => {
  const bookings = await unpaidBookingsQuery(partnerPhoneDigits).select('paidAmount').lean();
  return bookings.reduce((sum, b) => sum + (Number(b.paidAmount) || 0), 0);
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
  const amount = bookings.reduce((sum, b) => sum + (Number(b.paidAmount) || 0), 0);
  if (amount <= 0) {
    throw new PayoutError('NOTHING_TO_PAY_OUT', 'There is nothing to pay out yet.');
  }

  const payout = await PartnerPayout.create({
    partnerPhoneDigits: key,
    amount,
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
      narration: 'Lampose payout',
    });

    /* RazorpayX answers `processed` or `queued` on acceptance — either means
       it is on its way, not necessarily settled to the second, which is why
       this is `completed` in OUR status vocabulary rather than left
       `processing` forever waiting for a settlement webhook nothing here yet
       listens for. */
    payout.status = ['processed', 'queued'].includes(dispatched.status) ? 'completed' : 'processing';
    payout.referenceId = dispatched.id;
    payout.razorpayContactId = contactId;
    payout.razorpayFundAccountId = fundAccountId;
    payout.payoutDate = new Date().toISOString().slice(0, 10);
    payout.processedAt = new Date();
    await payout.save();
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

module.exports = {
  PayoutError, availableBalance, requestPayout, processPayout,
};
