/* ══════════════════════════════════════════════════════════════════════════
   Razorpay telling us the ₹199 assisted visit was paid.

   ## Why this exists as well as the in-page verification

   The browser flow verifies a signature the moment checkout returns, and that
   is the fast path. It only fires if the customer is still on the page — and
   the whole point of a payment LINK is that they are not: they tapped it in
   WhatsApp, possibly hours later, on a different device.

   So this is the path that actually completes most payments. The two share
   one implementation of "mark paid and start the slot step"
   (`markVisitPaid`) so a payment made either way lands identically.

   ## What is believed

   Only the signature. Razorpay signs the raw request body with a secret only
   this server and they hold, and `app.js` keeps those exact bytes because
   re-serialising the parsed JSON reorders keys and breaks the HMAC.

   With no `RAZORPAY_WEBHOOK_SECRET` configured the route refuses everything.
   That is deliberate: an unauthenticated endpoint that marks payments as
   received is worse than no endpoint at all.

   ## Legacy money

   The retired flows' purposes (`contact_unlock`, `assisted_balance`) are
   acknowledged and ignored — those products no longer exist. A payment with
   NO purpose is how every link minted before purposes existed looks, which
   includes the retired ₹20 token links still sitting in old WhatsApp chats:
   the amount guard below is what stops a ₹20 payment being recorded as a
   ₹199 one. Underpayments are logged and the team is told, because somebody
   has genuinely paid money that bought nothing and a human owes them a call.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../../config/env');
const razorpay = require('../../infrastructure/razorpay/razorpay');
const VisitRequest = require('./visitRequest.model');
const { markVisitPaid, ASSISTED_PURPOSE } = require('./visitPayment.controller');
const twilio = require('../../infrastructure/twilio/twilio');

const LEGACY_PURPOSES = ['contact_unlock', 'assisted_balance'];

/**
 * @route POST /api/v2/payments/razorpay/webhook
 */
const razorpayWebhook = async (req, res) => {
  /* 200 on everything Razorpay could retry pointlessly. A 500 makes them
     redeliver the same event for hours; the interesting failures are logged
     here rather than pushed back at them. */
  const ack = (note) => {
    if (note) console.log(`[razorpay-webhook] ${note}`);
    return res.status(200).json({ received: true });
  };

  if (!config.razorpay.webhookSecret) {
    console.warn('[razorpay-webhook] Refused: RAZORPAY_WEBHOOK_SECRET is not set.');
    return res.status(503).json({
      success: false,
      code: 'WEBHOOK_NOT_CONFIGURED',
      message: 'This server is not set up to accept payment webhooks.',
    });
  }

  const signature = req.headers['x-razorpay-signature'];
  const genuine = razorpay.verifyWebhook({ rawBody: req.rawBody, signature });

  if (!genuine) {
    console.warn('[razorpay-webhook] Refused: signature did not verify.');
    return res.status(400).json({ success: false, code: 'BAD_SIGNATURE' });
  }

  if (mongoose.connection.readyState !== 1) {
    /* 500 on purpose — this one IS worth a retry: the payment is real and the
       database will be back. */
    console.error('[razorpay-webhook] Database is down; asking Razorpay to retry.');
    return res.status(500).json({ success: false, code: 'DB_DISCONNECTED' });
  }

  const event = req.body?.event || '';
  const payload = req.body?.payload || {};

  /* Two events mean the same thing here. `payment_link.paid` is the one the
     link flow fires; `payment.captured` covers a payment made against an
     order from the website or the app. Either carries our id in `notes`. */
  const entity = payload.payment_link?.entity || payload.payment?.entity || {};
  const paymentEntity = payload.payment?.entity || {};

  if (!['payment_link.paid', 'payment.captured'].includes(event)) {
    return ack(`ignored event "${event}"`);
  }

  const requestId = entity.notes?.visitRequestId || paymentEntity.notes?.visitRequestId;
  const linkId = payload.payment_link?.entity?.id;

  const doc = requestId && /^[0-9a-fA-F]{24}$/.test(String(requestId))
    ? await VisitRequest.findById(requestId)
    : (linkId ? await VisitRequest.findOne({ 'payment.linkId': linkId }) : null);

  if (!doc) return ack(`no visit request for "${requestId || linkId || 'unknown'}"`);

  const paymentId = paymentEntity.id || entity.id || null;
  const purpose = entity.notes?.purpose || paymentEntity.notes?.purpose || '';

  /* The retired products. Their money is real but buys nothing any more —
     acknowledged so Razorpay stops redelivering, logged so it can be found. */
  if (LEGACY_PURPOSES.includes(purpose)) {
    console.warn(`[razorpay-webhook] LEGACY PAYMENT ignored: request ${doc._id}, `
      + `purpose "${purpose}", payment ${paymentId}. A human should refund this.`);
    return ack();
  }

  if (doc.payment?.status === 'paid') {
    /* Razorpay redelivers, and a customer can trigger both paths. Doing this
       twice must not send a second message. */
    return ack(`request ${doc._id} was already paid`);
  }

  /*
   * The amount guard.
   *
   * Purpose `assisted_visit` — or none, which is what every payment link
   * minted before purposes existed looks like, INCLUDING the retired ₹20
   * token links still live in old WhatsApp chats. The signature proves the
   * money is real; only the amount says which product it bought. A payment
   * short of the price on the document must not settle it.
   */
  const expected = doc.payment?.amountPaise || config.razorpay.assistedVisitAmountPaise;
  const amount = Number(paymentEntity.amount || entity.amount || entity.amount_paid || 0);
  if (amount > 0 && amount < expected) {
    console.error(`[razorpay-webhook] UNDERPAID: request ${doc._id} received ${amount} paise `
      + `against ${expected} (payment ${paymentId}, likely a legacy link). Not marking paid.`);
    const roster = String(process.env.VERIFICATION_TEAM_NUMBERS || '')
      .split(',').map((n) => n.trim()).filter(Boolean);
    for (const number of roster) {
      twilio.sendOwnerText({
        ownerMobile: number,
        body: '⚠️ Underpaid visit payment\n\n'
          + `Property: ${doc.propertyName || 'Unnamed'}\n`
          + `Customer: ${doc.customer?.name || 'Not given'} · ${doc.customer?.phone || ''}\n`
          + `Paid ₹${amount / 100} against ₹${expected / 100} — probably an old payment link.\n`
          + `Please call them and arrange a refund. Request: ${doc._id}`,
      }).catch(() => {});
    }
    return ack();
  }

  await markVisitPaid(doc, paymentId);

  console.log(`[razorpay-webhook] ${event} → request ${doc._id} paid (${paymentId}), slot step started.`);
  return ack();
};

module.exports = { razorpayWebhook };
