/* ══════════════════════════════════════════════════════════════════════════
   Razorpay telling us a visit token was paid.

   ## Why this exists as well as the in-page verification

   The browser flow verifies a signature the moment checkout returns, and that
   is the fast path. It only fires if the customer is still on the page — and
   the whole point of a payment LINK is that they are not: they tapped it in
   WhatsApp, possibly hours later, on a different device.

   So this is the path that actually completes most payments. The two share
   one implementation of "mark paid and release the address" so a payment made
   either way releases exactly the same thing.

   ## What is believed

   Only the signature. Razorpay signs the raw request body with a secret only
   this server and they hold, and `app.js` keeps those exact bytes because
   re-serialising the parsed JSON reorders keys and breaks the HMAC.

   With no `RAZORPAY_WEBHOOK_SECRET` configured the route refuses everything.
   That is deliberate: an unauthenticated endpoint that marks payments as
   received is worse than no endpoint at all.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../../config/env');
const razorpay = require('../../infrastructure/razorpay/razorpay');
const VisitRequest = require('./visitRequest.model');
const { markPaidAndReleaseAddress } = require('./visitPayment.controller');
const {
  markContactUnlocked, markAssistedBooked, markBalancePaid,
  UNLOCK_PURPOSE, ASSISTED_PURPOSE, ASSISTED_BALANCE_PURPOSE,
} = require('./contactUnlock.controller');

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
     order from the website. Either carries our id in `notes`. */
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

  /*
   * WHICH of this request's payments was this?
   *
   * A confirmed bachelor request can have FOUR distinct orders against it —
   * the visit token, the contact unlock, the assisted visit's advance and
   * that visit's balance — and every one of them carries the same
   * `visitRequestId` home. Without this they would all be read as the token:
   * any of the other three would mark it paid, release the address and take
   * a bed out of the pool, none of which anybody bought.
   *
   * The balance is tested BEFORE the advance. Both belong to the assisted
   * visit, and reading a settled balance as an advance would re-book a visit
   * that already exists and message the roster about it a second time.
   *
   * The note is set by contactUnlock.controller.js. Its absence means the
   * token, which is what every payment made before this existed looks like —
   * so old events and payment links keep meaning exactly what they meant.
   */
  const purpose = entity.notes?.purpose || paymentEntity.notes?.purpose || '';

  if (purpose === ASSISTED_BALANCE_PURPOSE) {
    if (doc.lamposeVisit?.balance?.status === 'paid') {
      return ack(`request ${doc._id} assisted balance was already paid`);
    }
    await markBalancePaid(doc, paymentId);
    console.log(`[razorpay-webhook] ${event} → request ${doc._id} assisted balance paid (${paymentId}).`);
    return ack();
  }

  if (purpose === ASSISTED_PURPOSE) {
    if (doc.lamposeVisit?.status === 'requested') {
      return ack(`request ${doc._id} assisted visit was already booked`);
    }
    /* The slot was written when the order was created, so the booking can be
       completed here with nothing from the browser — which is the whole point
       of this path. */
    await markAssistedBooked(doc, paymentId);
    console.log(`[razorpay-webhook] ${event} → request ${doc._id} assisted visit booked (${paymentId}).`);
    return ack();
  }

  if (purpose === UNLOCK_PURPOSE) {
    if (doc.contactUnlock?.status === 'paid') {
      return ack(`request ${doc._id} contact unlock was already paid`);
    }
    await markContactUnlocked(doc, paymentId);
    console.log(`[razorpay-webhook] ${event} → request ${doc._id} contact unlock paid (${paymentId}).`);
    return ack();
  }

  if (doc.payment?.status === 'paid') {
    /* Razorpay redelivers, and a customer can trigger both paths. Doing this
       twice must not send a second address message. */
    return ack(`request ${doc._id} was already paid`);
  }

  await markPaidAndReleaseAddress(doc, paymentId);

  console.log(`[razorpay-webhook] ${event} → request ${doc._id} paid (${paymentId}), address released.`);
  return ack();
};

module.exports = { razorpayWebhook };
