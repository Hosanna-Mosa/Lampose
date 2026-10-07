/* ══════════════════════════════════════════════════════════════════════════
   A rider paying their outstanding by UPI — see `riderRepayment.model.js`.

     startRepayment(driver, { amountPaise })   a payment link for the amount
     settleRepayment(repaymentId, payment)     Razorpay says it was paid
     reconcileRepayment(row)                   ask Razorpay, settle if paid
     sweepRepayments()                         the backstop, every 2 minutes

   ## The rider's word is worth nothing here either

   The app never says "I paid". It opens the link, and the row turns `paid`
   only on Razorpay's own word: the signed webhook, or Razorpay's answer when
   this server asks it about the link. The same rule `razorpay.js` states for
   every other payment.

   ## Whatever is paid is credited

   Between asking for the link and paying it, what the rider owes can change
   (a delivery paid online clears some of it). So the money is applied when
   it arrives, against the balance as it stands then: as much as is still
   outstanding comes off it, and anything over goes into the rider's wallet.
   Money the rider paid is never lost in a gap.

   ## Settling is one conditional write, then one ledger row

   The webhook, the app's status check and the sweep can all find the same
   payment at once. The row turns `paid` only where it is not already, so
   one of them wins; the ledger row's `key` (`repayment:<id>`) makes the
   posting once-only as well. A crash between the two is caught by the sweep,
   which posts any `paid` row that has no `ledgerPostedAt`.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');

const RiderRepayment = require('./riderRepayment.model');
const riderLedger = require('./riderLedger.service');
const razorpay = require('../../infrastructure/razorpay/razorpay');
const realtime = require('../../infrastructure/realtime/realtime');

const { LedgerRefusal } = riderLedger;

/** What a repayment link's `notes.purpose` says. The webhook routes on it. */
const REPAYMENT_PURPOSE = 'rider_repayment';

/** How long a link stays payable. Razorpay refuses anything under 15 minutes. */
const LINK_LIFETIME_MS = 30 * 60 * 1000;

/** Razorpay's smallest payment. */
const MIN_PAISE = 100;

const LOG = '💸 [rider-repayment]';

const newRepaymentId = () => `RPY-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const isOpen = (row, now = Date.now()) => row.status === 'created'
  && (!row.expiresAt || new Date(row.expiresAt).getTime() > now);

const repaymentView = (row) => ({
  repaymentId: row.repaymentId,
  amountPaise: row.amountPaise,
  status: row.status === 'created' && !isOpen(row) ? 'expired' : row.status,
  linkUrl: row.status === 'created' ? row.linkUrl : '',
  expiresAt: row.expiresAt,
  paidPaise: row.paidPaise || 0,
  paidAt: row.paidAt,
  createdAt: row.createdAt,
});

const tellRider = async (driverId) => {
  try {
    realtime.toDriver(driverId, 'wallet_update', await riderLedger.statementFor(driverId, { limit: 10 }));
  } catch (error) {
    console.error(`${LOG} could not tell ${driverId}: ${error.message}`);
  }
};

/* ── Settling ─────────────────────────────────────────────────────────── */

/** The ledger row for a paid repayment, once. */
const postToLedger = async (row) => {
  const paid = row.paidPaise;
  await riderLedger.post(row.driverId, (balance) => {
    const take = Math.min(paid, balance.outstandingPaise);
    return {
      kind: 'repayment',
      outstandingPaise: -take,
      walletPaise: paid - take,
      key: `repayment:${row.repaymentId}`,
      reference: row.paymentId || row.repaymentId,
      note: paid > take
        ? `Paid by UPI — ₹${((paid - take) / 100).toFixed(2)} more than was owed, added to the wallet`
        : 'Paid by UPI',
      by: 'rider',
      at: row.paidAt || new Date(),
    };
  });
  await RiderRepayment.updateOne(
    { _id: row._id, ledgerPostedAt: null },
    { $set: { ledgerPostedAt: new Date() } },
  );
};

/**
 * Mark a repayment paid on Razorpay's word, and credit the ledger.
 *
 * @returns {Promise<{ settled: boolean, row: object|null, reason?: string }>}
 */
const settleRepayment = async (repaymentId, { paymentId, amountPaise } = {}) => {
  const row = await RiderRepayment.findOne({ repaymentId }).lean();
  if (!row) return { settled: false, row: null, reason: 'unknown repayment' };
  if (row.status === 'paid') return { settled: false, row, reason: 'already paid' };

  const paidPaise = Number.isFinite(amountPaise) && amountPaise > 0 ? amountPaise : row.amountPaise;
  if (paidPaise !== row.amountPaise) {
    console.error(
      `${LOG} ${repaymentId}: ₹${paidPaise / 100} paid against a ₹${row.amountPaise / 100} link. `
      + 'Crediting what was actually paid.',
    );
  }

  const updated = await RiderRepayment.findOneAndUpdate(
    { _id: row._id, status: { $ne: 'paid' } },
    {
      $set: {
        status: 'paid', paymentId: String(paymentId || ''), paidPaise, paidAt: new Date(),
      },
    },
    { new: true },
  ).lean();
  if (!updated) {
    return { settled: false, row: await RiderRepayment.findById(row._id).lean(), reason: 'already paid' };
  }

  try {
    await postToLedger(updated);
  } catch (error) {
    /* The money is real and the row says so; the sweep posts it. */
    console.error(`${LOG} ${repaymentId} paid but not yet on the ledger (the sweep will retry): ${error.message}`);
  }
  console.log(`${LOG} ${repaymentId} · ${updated.driverId} paid ₹${paidPaise / 100} · ${paymentId || 'no id'}`);
  await tellRider(updated.driverId);
  return { settled: true, row: updated };
};

/**
 * Ask Razorpay whether the row's link has been paid, and settle it if so.
 *
 * @returns {Promise<object>} the row as it now stands
 */
const reconcileRepayment = async (row) => {
  if (!row || row.status === 'paid' || !row.linkId || !razorpay.isConfigured()) return row;

  const link = await razorpay.fetchPaymentLink(row.linkId);
  const payment = (link.payments || []).find((p) => p.status === 'captured')
    || (link.payments || [])[0];
  if (link.status === 'paid' || (payment && payment.status === 'captured')) {
    const { row: after } = await settleRepayment(row.repaymentId, {
      paymentId: payment ? payment.payment_id || payment.id : '',
      amountPaise: Number(link.amount_paid) || (payment && Number(payment.amount)) || undefined,
    });
    return after || row;
  }
  return row;
};

/* ── Starting one ─────────────────────────────────────────────────────── */

/**
 * A payment link for the rider's outstanding — all of it by default, or the
 * `amountPaise` asked for. An open link for the same amount is handed back
 * rather than a second one made; one for a different amount is cancelled
 * first, so there is only ever one link to pay.
 *
 * @returns {Promise<object>} the repayment view
 * @throws LedgerRefusal
 */
const startRepayment = async (driver, { amountPaise } = {}) => {
  const settings = await riderLedger.getSettings();
  if (!settings.startedAt) {
    throw new LedgerRefusal('LEDGER_NOT_OPEN', 'Paying dues in the app is not switched on yet.');
  }
  if (!razorpay.isConfigured()) {
    throw new LedgerRefusal('PAYMENTS_NOT_CONFIGURED', 'UPI payments are not available right now.', 503);
  }

  const { outstandingPaise } = await riderLedger.balanceFor(driver.driverId);
  if (outstandingPaise < MIN_PAISE) {
    throw new LedgerRefusal('NOTHING_OUTSTANDING', 'You do not owe Lampose anything right now.');
  }

  const amount = amountPaise == null ? outstandingPaise : Math.round(Number(amountPaise));
  if (!Number.isFinite(amount) || amount < MIN_PAISE) {
    throw new LedgerRefusal('INVALID_AMOUNT', 'Pay at least ₹1.', 400);
  }
  if (amount > outstandingPaise) {
    throw new LedgerRefusal(
      'MORE_THAN_OUTSTANDING',
      `You owe ₹${(outstandingPaise / 100).toFixed(2)}. You cannot pay more than that.`,
    );
  }

  /* The open one, if any: paid already, the same amount, or replaced. */
  const open = await RiderRepayment.findOne({ driverId: driver.driverId, status: 'created' })
    .sort({ createdAt: -1 }).lean();
  if (open) {
    const now = await reconcileRepayment(open).catch(() => open);
    if (now.status === 'paid') {
      throw new LedgerRefusal('JUST_PAID', 'Your last payment just came through. Check your balance again.');
    }
    if (isOpen(now, Date.now() + 60 * 1000) && now.amountPaise === amount) return repaymentView(now);

    await razorpay.cancelPaymentLink(now.linkId).catch((error) => {
      console.error(`${LOG} could not cancel ${now.linkId}: ${error.message}`);
    });
    await RiderRepayment.updateOne(
      { _id: now._id, status: 'created' },
      { $set: { status: isOpen(now) ? 'superseded' : 'expired' } },
    );
  }

  const repaymentId = newRepaymentId();
  const expiresAt = new Date(Date.now() + LINK_LIFETIME_MS);
  const link = await razorpay.createPaymentLink({
    amountPaise: amount,
    description: `Lampose rider dues · ${driver.driverId}`,
    name: driver.name || driver.driverId,
    phone: driver.phone || undefined,
    notes: { purpose: REPAYMENT_PURPOSE, riderRepaymentId: repaymentId, driverId: driver.driverId },
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
  });

  const row = await RiderRepayment.create({
    repaymentId,
    driverId: driver.driverId,
    amountPaise: amount,
    linkId: link.id,
    linkUrl: link.short_url || '',
    expiresAt,
  });
  console.log(`${LOG} ${repaymentId} · ${driver.driverId} · link for ₹${amount / 100}`);
  return repaymentView(row.toObject());
};

/* ── The backstop ─────────────────────────────────────────────────────── */

/**
 * Two things a webhook can leave undone:
 *   · a `paid` row whose ledger posting failed — post it
 *   · a `created` row past its expiry — ask Razorpay once (it may have been
 *     paid with the webhook lost), then settle it or mark it expired
 */
const sweepRepayments = async ({ limit = 100 } = {}) => {
  let posted = 0;
  let settled = 0;
  let expired = 0;

  const unposted = await RiderRepayment.find({ status: 'paid', ledgerPostedAt: null }).limit(limit).lean();
  for (const row of unposted) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await postToLedger(row);
      posted += 1;
    } catch (error) {
      console.error(`${LOG} could not post ${row.repaymentId}: ${error.message}`);
    }
  }

  const lapsed = await RiderRepayment.find({ status: 'created', expiresAt: { $lt: new Date() } })
    .limit(limit).lean();
  for (const row of lapsed) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const now = await reconcileRepayment(row);
      if (now.status === 'paid') {
        settled += 1;
      } else {
        // eslint-disable-next-line no-await-in-loop
        await RiderRepayment.updateOne({ _id: row._id, status: 'created' }, { $set: { status: 'expired' } });
        expired += 1;
      }
    } catch (error) {
      console.error(`${LOG} could not check ${row.repaymentId}: ${error.message}`);
    }
  }
  return { posted, settled, expired };
};

module.exports = {
  REPAYMENT_PURPOSE,
  LINK_LIFETIME_MS,
  repaymentView,
  startRepayment,
  settleRepayment,
  reconcileRepayment,
  sweepRepayments,
};
