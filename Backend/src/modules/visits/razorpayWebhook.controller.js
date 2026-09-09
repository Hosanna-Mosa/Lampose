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
const { claimEvent, noteEvent } = require('../settlements/paymentEvent.model');
const { HotelSettlement } = require('../settlements/hotelSettlement.model');
const settlements = require('../settlements/settlement.service');
const partnerPayouts = require('../partners/payout.service');
const audit = require('../admins/adminAuditLog.model');

/*
 * Who a webhook is, for the audit log.
 *
 * `audit.record` reads `req.admin` because every other caller is an
 * administrator pressing something. A payout reversal has no administrator —
 * it is the bank telling us money came back — and the log still has to name an
 * actor. This is that actor, and it is deliberately recognisable as not a
 * person.
 */
const SYSTEM_ACTOR = {
  _id: 'system:razorpayx-webhook',
  name: 'RazorpayX webhook',
  email: '',
  role: 'system',
};
const twilio = require('../../infrastructure/twilio/twilio');

const LEGACY_PURPOSES = ['contact_unlock', 'assisted_balance'];

/* ══════════════════════════════════════════════════════════════════════════
   RazorpayX payout events — how a hotel settlement finishes.

   ## Why this is the only path to `paid_out`

   Creating a payout returns 200 with a status that is almost always `queued`
   or `processing`. Money has not reached a bank at that point, and a
   settlement marked paid on the strength of that response would tell a hotel
   they had been paid while the money was still with us.

   So `releaseToOwner` records whatever RazorpayX answered and leaves the
   settlement in `withdrawing`. These events are what move it: `processed`
   makes it `paid_out`, `failed` and `cancelled` make it retryable, `reversed`
   says money came back. `applyPayoutStatus` in the settlement service is the
   single interpreter, shared with the reconciliation path, so a status word
   cannot mean two things.

   ## Duplicates

   Razorpay redelivers for hours until it gets a 2xx, and a payout event that
   ran twice would write a second audit entry and could move a settlement that
   had already moved on. The event id is claimed before anything is read, and a
   redelivery is acknowledged without running.

   `applyPayoutStatus` is idempotent on top of that — a repeated `processed`
   is a no-op, and a late `processing` arriving after `processed` is refused by
   the terminal-state rule — so the guard and the handler each hold on their
   own.
   ══════════════════════════════════════════════════════════════════════════ */
const handlePayoutEvent = async ({ event, payload, eventId, ack }) => {
  const payout = payload.payout?.entity || {};
  const payoutId = payout.id || null;

  /*
   * Find the settlement.
   *
   * By `reference_id` first — it is the settlement's own `_id`, set when the
   * payout was created — and by the payout id second, which covers a payout
   * made before references were set and any row whose reference did not
   * survive.
   */
  const reference = payout.reference_id || payout.notes?.settlementId || null;
  const settlement = reference && /^[0-9a-fA-F]{24}$/.test(String(reference))
    ? await HotelSettlement.findById(reference)
    : (payoutId ? await HotelSettlement.findOne({ payoutId }) : null);

  if (!settlement) {
    /*
     * Not a hotel settlement. Try the OTHER thing that pays over this rail.
     *
     * `payout.service.js` is the owner-initiated Stay Partner payout flow. It
     * uses the same RazorpayX account, so its events arrive at this same URL
     * and carry a `PartnerPayout` id as their reference. Without this branch
     * an owner's payout would sit at "Processing" forever: the dispatch call
     * answers `queued` far more often than `processed`, and this event is the
     * only thing that can finish it.
     */
    if (!await claimEvent({ eventId, event, source: 'payout', payoutId })) {
      return ack(`payout event ${eventId} already handled`);
    }

    const partnerPayout = await partnerPayouts.applyWebhookPayout(payout);
    if (partnerPayout) {
      await noteEvent(eventId, 'processed', `partner payout ${partnerPayout._id} → ${partnerPayout.status}`);
      console.log(`[razorpay-webhook] ${event} → partner payout ${partnerPayout._id} is ${partnerPayout.status}`);
      return ack();
    }

    await noteEvent(eventId, 'ignored', `no settlement or partner payout for ${payoutId || 'unknown'}`);
    return ack(`nothing matches payout ${payoutId || 'unknown'}`);
  }

  /* Claimed before anything is changed. A redelivery stops here. */
  if (!await claimEvent({
    eventId, event, source: 'payout', payoutId, settlementId: String(settlement._id),
  })) {
    return ack(`payout event ${eventId} already handled`);
  }

  const before = settlement.status;

  try {
    await settlements.applyPayoutStatus(settlement, payout);
  } catch (error) {
    await noteEvent(eventId, 'failed', error.message);
    console.error(`[razorpay-webhook] payout ${payoutId} could not be applied:`, error.message);
    /* Acknowledged rather than retried: the money has already moved and the
       fault is ours to find in the log. A 500 would have Razorpay redeliver
       this for hours against a handler that will fail the same way. */
    return ack();
  }

  await noteEvent(eventId, 'processed', `${before} → ${settlement.status}`);

  /*
   * A REVERSAL is the one payout outcome a person has to know about.
   *
   * Everything else is visible in the admin queue when somebody looks. Money
   * that left and came back changes what is owed to a hotel, and nobody is
   * watching the queue at the moment it happens — so it is written to the
   * audit log, which is the record an accountant reads.
   */
  if (settlement.status === 'reversed') {
    await audit.record({ admin: SYSTEM_ACTOR, ip: '', headers: {} }, {
      action: 'settlement.reversed',
      targetType: 'hotel_settlements',
      targetId: settlement._id,
      before: { status: before },
      after: { status: 'reversed', payoutId, payoutStatus: settlement.payoutStatus },
      errorCode: payout.failure_reason ? 'PAYOUT_REVERSED' : '',
      errorMessage: payout.failure_reason || '',
    });
  }

  console.log(`[razorpay-webhook] ${event} → settlement ${settlement._id} ${before} → ${settlement.status}`);
  return ack();
};

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

  /*
   * Two products, one endpoint, two secrets.
   *
   * Payment-gateway events and RazorpayX PAYOUT events arrive here together —
   * the same "one inbound URL, dispatch on what the payload says" rule the
   * food handler below follows. They are signed with different secrets, so a
   * payout event verified only against the payment secret would be refused,
   * and money that had already left the account would go unrecorded.
   *
   * `verifyPayoutWebhook` tries the RazorpayX secret and falls back to the
   * payment one, which covers the common configuration where a merchant sets
   * a single secret for both.
   */
  const signature = req.headers['x-razorpay-signature'];
  const genuine = razorpay.verifyWebhook({ rawBody: req.rawBody, signature })
    || razorpay.verifyPayoutWebhook({ rawBody: req.rawBody, signature });

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
  /*
   * Razorpay's own delivery id, from the header rather than the body.
   *
   * It is stable across redeliveries of the same event, which is exactly what
   * a dedupe key needs — where a payment id would not do, since one payment
   * legitimately produces several events.
   */
  const eventId = req.headers['x-razorpay-event-id'] || null;

  /* Two events mean the same thing here. `payment_link.paid` is the one the
     link flow fires; `payment.captured` covers a payment made against an
     order from the website or the app. Either carries our id in `notes`. */
  const entity = payload.payment_link?.entity || payload.payment?.entity || {};
  const paymentEntity = payload.payment?.entity || {};

  /*
   * ── RazorpayX PAYOUT events ────────────────────────────────────────────
   *
   * Dispatched on the event name, and BEFORE the payment allow-list below: a
   * payout is money going OUT and has nothing to do with a request's own
   * payment, so none of the entity reading underneath applies to it.
   *
   * The ordering here is load-bearing. The allow-list answers 200 and returns
   * for anything that is not a payment, which is the correct thing to do with
   * the dozens of event types Razorpay sends and we do not want — but a payout
   * event caught by it would be acknowledged and dropped, and a settlement can
   * reach `paid_out` from nowhere else. That failure is silent and it is on
   * the wrong side: the money has already left the account.
   *
   * `verify:hotel-payout` scenarios 10, 11 and 14 exist to hold this order.
   */
  if (String(event).startsWith('payout.')) {
    return handlePayoutEvent({ event, payload, eventId, ack });
  }

  if (!['payment_link.paid', 'payment.captured'].includes(event)) {
    return ack(`ignored event "${event}"`);
  }

  /*
   * A food order's payment arrives through the SAME webhook, and is told apart
   * by the note it carries — never by the route.
   *
   * The same rule the WhatsApp webhook follows for YES/AVAILABLE: one inbound
   * URL, dispatched on what the payload says rather than split into two
   * endpoints a gateway would have to be reconfigured to reach. Razorpay is
   * configured with one webhook URL and adding a second is a deployment step
   * somebody will forget in the environment where it matters.
   *
   * Handled before the visit lookup so a food payment is never measured
   * against a visit request it has nothing to do with.
   */
  const foodOrderNumber = entity.notes?.foodOrderNumber || paymentEntity.notes?.foodOrderNumber;
  if (foodOrderNumber) {
    try {
      // eslint-disable-next-line global-require
      const { handleFoodOrderWebhook } = require('../foodpartners/foodPayment.controller');
      await handleFoodOrderWebhook({
        orderNumber: foodOrderNumber,
        paymentId: paymentEntity.id || entity.id || null,
        amountPaise: Number(paymentEntity.amount ?? entity.amount),
      });
    } catch (error) {
      /* Acknowledged anyway. A 500 makes Razorpay redeliver the same event for
         hours; the money has already moved and the fault is ours to find in
         the log, not theirs to retry. */
      console.error(`[razorpay-webhook] food order ${foodOrderNumber} failed: ${error.message}`);
    }
    return ack(`food order ${foodOrderNumber}`);
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
   * The replay guard, claimed before anything is changed.
   *
   * The `already paid` check above happens to make a redelivered PAYMENT
   * harmless, because settling one twice is a no-op. That is luck rather than
   * a guarantee, and it stops being true the moment a handler does anything
   * with a side effect — which `markVisitPaid` now does: it writes a
   * settlement and notifies people.
   *
   * First writer wins. A redelivery finds the id already claimed and is
   * acknowledged without running.
   */
  if (!await claimEvent({
    eventId, event, source: 'payment', visitRequestId: String(doc._id), paymentId,
  })) {
    return ack(`event ${eventId} already handled`);
  }

  /*
   * The amount guard.
   *
   * Purpose `assisted_visit`, `stay_booking`, or none — which is what every
   * payment link minted before purposes existed looks like, INCLUDING the
   * retired ₹20 token links still live in old WhatsApp chats. The signature
   * proves the money is real; only the amount says which product it bought. A
   * payment short of the price on the document must not settle it.
   *
   * The fallback to the platform fee is for an ASSISTED VISIT only. A stay has
   * no configured price — it is rate × nights, stamped on the request when it
   * was made — so falling back would let a ₹199 payment settle a ₹3,600 hotel
   * booking. A stay with no amount on the document is refused outright rather
   * than compared against a number from another product.
   */
  const isStay = (doc.payment?.purpose || 'assisted_visit') === 'stay_booking';
  const expected = isStay
    ? doc.payment?.amountPaise
    : (doc.payment?.amountPaise || config.razorpay.assistedVisitAmountPaise);

  if (isStay && !expected) {
    console.error(`[razorpay-webhook] request ${doc._id} is a stay booking with no amount on `
      + `record; refusing to settle it against payment ${paymentId}.`);
    return ack();
  }

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
  await noteEvent(eventId, 'processed', `request ${doc._id} paid`);

  console.log(`[razorpay-webhook] ${event} → request ${doc._id} paid (${paymentId}).`);
  return ack();
};

module.exports = { razorpayWebhook };
