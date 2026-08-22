/* ══════════════════════════════════════════════════════════════════════════
   The ₹199 assisted-visit payment — the ONE charge on a bachelor or co-live
   visit.

   ## The order of events, and why it is this order

     1  the student asks, with a LAYOUT and nothing else
     2  the owner accepts
     3  the customer pays ₹199 — ₹100 for the representative who accompanies
        them, ₹99 Lampose fee — via the WhatsApp link, the website, or the
        app's checkout. All of them settle the same record.
     4  only then do they pick a date and time (WhatsApp on the web channel,
        the app on the app channel — see assistedSlot.controller.js)
     5  and only when the slot is fixed do they get the street address

   Paying releases NOTHING by itself — no address, no owner number, no PIN,
   no bed. The address comes with the slot, the representative deals with
   the owner, and there is no PIN because the representative is at the door.
   (This file used to be the ₹20 visit token, which released all of those;
   the ₹20 and the separate ₹99 contact unlock are both retired.)

   ## What may mark a request paid

   Exactly one thing: `razorpay.verifySignature` (or the webhook's own
   signature check), over an HMAC only this server can compute. A client
   saying "it worked" is not evidence and is never treated as any.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../../config/env');
const razorpay = require('../../infrastructure/razorpay/razorpay');
const VisitRequest = require('./visitRequest.model');
const { TOKEN_CATEGORIES, normaliseCategory } = require('../../shared/constants/categories');
const twilio = require('../../infrastructure/twilio/twilio');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/* The note that travels on every order and payment link this flow mints, and
   that the webhook dispatches on. Its ABSENCE also routes here — that is what
   a payment link minted before purposes existed looks like — which is why the
   webhook guards on the amount as well. */
const ASSISTED_PURPOSE = 'assisted_visit';

const fail = (res, status, code, message) =>
  res.status(status).json({ success: false, code, message, error: message });

/** True when this property's visits are paid for. */
const needsToken = (property) =>
  TOKEN_CATEGORIES.includes(normaliseCategory(property && property.category));

const load = async (res, id) => {
  if (!OBJECT_ID.test(String(id))) {
    fail(res, 404, 'NOT_FOUND', 'That request no longer exists.');
    return null;
  }
  const doc = await VisitRequest.findById(id);
  if (!doc) {
    fail(res, 404, 'NOT_FOUND', 'That request no longer exists.');
    return null;
  }
  return doc;
};

/**
 * The payment link the confirmed customer is sent on WhatsApp.
 *
 * Created once and reused: reopening the same link is how somebody who closed
 * it comes back, and minting a second would leave two live ways to pay for one
 * visit.
 *
 * Returns null when payments are not configured or Razorpay refuses. The
 * caller carries on without it — an owner's confirmation must not fail because
 * a payment gateway did.
 */
const ensurePaymentLink = async (doc) => {
  if (!doc.payment?.required || doc.payment.status === 'paid') return null;
  if (doc.payment.linkUrl) return doc.payment.linkUrl;
  if (!razorpay.isConfigured()) return null;

  try {
    const link = await razorpay.createPaymentLink({
      amountPaise: doc.payment.amountPaise || config.razorpay.assistedVisitAmountPaise,
      description: `Assisted visit · ${doc.propertyName || 'Lampose'}`,
      name: doc.customer?.name,
      phone: doc.customer?.phone,
      /* The id AND the purpose ride along on the webhook, so the money finds
         its way home without a lookup table — and cannot be mistaken for a
         legacy payment. */
      notes: { visitRequestId: String(doc._id), purpose: ASSISTED_PURPOSE },
      expiresAt: doc.payment.dueBy ? Math.floor(doc.payment.dueBy.getTime() / 1000) : null,
    });

    doc.payment.linkId = link.id || null;
    doc.payment.linkUrl = link.short_url || null;
    doc.payment.status = 'pending';
    await doc.save();
    return doc.payment.linkUrl;
  } catch (error) {
    console.error('[visit-pay] Could not create the payment link:', error.message);
    return null;
  }
};

/**
 * Mark the visit paid, and start the slot step.
 *
 * One implementation, called by the API verify, the browser callback and the
 * webhook, so a payment made anywhere lands identically. Deliberately narrow:
 * it settles the money, flips the visit to `slot_pending`, and tells the
 * customer what to do next. It releases nothing — the address waits for the
 * slot, and the owner is not told until there is a slot to tell them.
 *
 * The messages are fire-and-forget. The payment has already committed; making
 * a verified rupee depend on WhatsApp or push being reachable would be the
 * wrong way round. A customer whose T2 never arrived is caught by the slot
 * reminder sweep two hours later.
 */
const markVisitPaid = async (doc, paymentId) => {
  if (doc.payment.status === 'paid') return;

  doc.payment.status = 'paid';
  doc.payment.paymentId = paymentId ? String(paymentId) : null;
  doc.payment.verifiedAt = new Date();
  doc.payment.failureReason = '';
  /* A slot fixed before the money cannot happen in this flow, but a redelivered
     webhook after scheduling can — and must not knock a scheduled visit back
     to the picker. */
  if (!['scheduled', 'manual'].includes(doc.lamposeVisit.status)) {
    doc.lamposeVisit.status = 'slot_pending';
    doc.lamposeVisit.slotStage = 'none';
  }
  await doc.save();

  if (doc.channel === 'app') {
    /* An app request is answered in the app: the push says "pick your slot"
       and the picker is a screen, not a chat. */
    try {
      const notifier = require('../notifications/stayRequest.notifier');
      notifier.notifyVisitPaid(doc).catch((e) => console.error('[visit-pay] push failed:', e.message));
    } catch (error) {
      console.error('[visit-pay] notifier unavailable:', error.message);
    }
    return;
  }

  /* Web channel: T2, whose quick-reply button opens the session the two list
     pickers ride in. Only where they opted in — WhatsApp will not carry a
     business message to someone who never agreed to hear from us. */
  if (doc.consentWhatsApp && doc.customer?.phone) {
    twilio.sendPaymentReceived({
      customerPhone: doc.customer.phone,
      customerName: doc.customer.name,
      propertyName: doc.propertyName,
    }).then((r) => {
      if (!r?.success) console.error('[visit-pay] Payment-received message failed:', r?.error);
    }).catch((e) => console.error('[visit-pay] Payment-received message threw:', e.message));
  }
};

/**
 * Give the browser or the app an order to open Razorpay's checkout against.
 *
 * Only the key ID goes back. The secret stays here — it is what makes the
 * signature check below mean anything, and a secret in a bundle is not a
 * secret.
 *
 * @route POST /api/v2/visit-requests/:id/payment/order
 */
const createPaymentOrder = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, 'DB_DISCONNECTED', 'The server is not connected to the database.');
    }
    if (!razorpay.isConfigured()) {
      return fail(res, 503, 'PAYMENTS_UNAVAILABLE',
        'Payments are not set up on this server yet. Nothing has been charged.');
    }

    const doc = await load(res, req.params.id);
    if (!doc) return undefined;

    if (!doc.payment?.required) {
      return fail(res, 400, 'NO_PAYMENT_REQUIRED', 'This visit has nothing to pay for.');
    }
    if (doc.status !== 'confirmed') {
      return fail(res, 409, 'NOT_CONFIRMED',
        'The owner has not confirmed this visit yet, so there is nothing to pay for.');
    }
    if (doc.payment.status === 'paid') {
      /* Idempotent: reopening a finished checkout should not create a second
         order, and must not look like an error to a customer who tapped twice. */
      return res.json({ success: true, data: { alreadyPaid: true, payment: doc.payment } });
    }
    if (doc.payment.dueBy && doc.payment.dueBy.getTime() < Date.now()) {
      if (doc.payment.status !== 'expired') {
        doc.payment.status = 'expired';
        await doc.save();
      }
      return fail(res, 410, 'CONFIRMATION_LAPSED',
        'This confirmation has lapsed. Ask the owner again to arrange a visit.');
    }

    const amountPaise = doc.payment.amountPaise || config.razorpay.assistedVisitAmountPaise;

    const order = await razorpay.createOrder({
      amountPaise,
      /* Our own id, so a payment in their dashboard traces straight back. */
      receipt: String(doc._id),
      notes: {
        visitRequestId: String(doc._id),
        purpose: ASSISTED_PURPOSE,
        property: doc.propertyName || '',
      },
    });

    doc.payment.status = 'pending';
    doc.payment.orderId = order.id;
    doc.payment.amountPaise = amountPaise;
    await doc.save();

    return res.json({
      success: true,
      data: {
        orderId: order.id,
        amountPaise,
        currency: order.currency || 'INR',
        /* Publishable by design — it identifies the account, it does not
           authorise anything. */
        keyId: config.razorpay.keyId,
        propertyName: doc.propertyName,
        customerName: doc.customer?.name || '',
        customerPhone: doc.customer?.phone || '',
      },
    });
  } catch (error) {
    if (error.code === 'RAZORPAY_ORDER_FAILED' || error.code === 'RAZORPAY_NOT_CONFIGURED') {
      return fail(res, 502, error.code, error.message);
    }
    return next(error);
  }
};

/**
 * Check the signature, and only then call it paid.
 *
 * @route POST /api/v2/visit-requests/:id/payment/verify
 */
const verifyPayment = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, 'DB_DISCONNECTED', 'The server is not connected to the database.');
    }

    const doc = await load(res, req.params.id);
    if (!doc) return undefined;

    if (doc.payment?.status === 'paid') {
      return res.json({ success: true, data: { payment: doc.payment, alreadyPaid: true } });
    }
    if (!doc.payment?.required) {
      return fail(res, 400, 'NO_PAYMENT_REQUIRED', 'This visit has nothing to pay for.');
    }

    const { razorpayPaymentId, razorpaySignature } = req.body || {};
    const orderId = doc.payment.orderId;

    if (!orderId) {
      return fail(res, 409, 'NO_ORDER', 'Start the payment before confirming it.');
    }

    const genuine = razorpay.verifySignature({
      orderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!genuine) {
      /* Recorded rather than only refused: a bad signature is either a bug in
         a client or somebody trying, and both are worth being able to see. */
      doc.payment.status = 'failed';
      doc.payment.failureReason = 'signature did not verify';
      await doc.save();
      return fail(res, 400, 'PAYMENT_NOT_VERIFIED',
        'That payment could not be verified. If money left your account it has not been taken — contact support.');
    }

    await markVisitPaid(doc, razorpayPaymentId);

    return res.json({ success: true, data: doc.toPublic() });
  } catch (error) {
    return next(error);
  }
};

/*
 * The redirect a checkout page may bounce to.
 *
 * Prefix-checked AND charset-checked. The prefix keeps it ours; the charset
 * is what stops a crafted `redirect` breaking out of the meta-refresh
 * attribute it is interpolated into — `"` and `>` are simply not in the set.
 */
const SAFE_REDIRECT = /^lampose:\/\/[A-Za-z0-9\-._~/?=&:%]*$/;
const safeRedirect = (raw) =>
  (SAFE_REDIRECT.test(String(raw || '')) ? String(raw) : 'lampose://visit');

/**
 * A checkout page the mobile app renders in its own WebView.
 *
 * ## Why a server-rendered page rather than a native SDK
 *
 * Razorpay's React Native SDK needs a native module, which needs a prebuild
 * and a config plugin, on both platforms, for one screen. This route renders
 * the same checkout the website uses, verifies the result HERE where the
 * secret already lives, and hands control back through the app's own deep
 * link. The app never sees the payment id or the signature.
 *
 * @route GET /api/v2/visit-requests/:id/payment/checkout
 */
const renderCheckout = async (req, res, next) => {
  try {
    if (!razorpay.isConfigured()) {
      return res.status(503).type('html').send(page('Payments are not set up yet',
        'Nothing has been charged. Please try again later.'));
    }

    const doc = await VisitRequest.findById(req.params.id).catch(() => null);
    if (!doc || !doc.payment?.required) {
      return res.status(404).type('html').send(page('That request no longer exists', ''));
    }
    if (doc.status !== 'confirmed') {
      return res.status(409).type('html').send(page('Not confirmed yet',
        'The owner has not confirmed this visit, so there is nothing to pay for.'));
    }
    /* The same deadline the JSON route enforces. The two paths refusing
       different things is how somebody pays for a hold that ended. */
    if (doc.payment.dueBy && doc.payment.dueBy.getTime() < Date.now()) {
      if (doc.payment.status !== 'expired') {
        doc.payment.status = 'expired';
        await doc.save();
      }
      return res.status(410).type('html').send(page('This confirmation has lapsed',
        'The owner held the place for a while and nothing was arranged. Ask again and they can confirm a fresh visit.'));
    }

    const redirect = safeRedirect(req.query.redirect);

    if (doc.payment.status === 'paid') {
      return res.type('html').send(bounce(redirect, 'paid'));
    }
    const order = await razorpay.createOrder({
      amountPaise: doc.payment.amountPaise || config.razorpay.assistedVisitAmountPaise,
      receipt: String(doc._id),
      notes: { visitRequestId: String(doc._id), purpose: ASSISTED_PURPOSE },
    });
    doc.payment.status = 'pending';
    doc.payment.orderId = order.id;
    await doc.save();

    const opts = {
      key: config.razorpay.keyId,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'Lampose',
      description: `Assisted visit · ${doc.propertyName || ''}`.trim(),
      prefill: { name: doc.customer?.name || '', contact: doc.customer?.phone || '' },
      theme: { color: '#45855a' },
    };

    /* The handler POSTs back to this server, which verifies and only then
       bounces to the app. The browser is a courier, not an authority. */
    return res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lampose · Assisted visit</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f7f9f7;color:#14201a}p{color:#46564d}</style>
</head><body>
<div><p>Opening the payment window…</p></div>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var opts = ${JSON.stringify(opts)};
  opts.handler = function (r) {
    var f = document.createElement('form');
    f.method = 'POST';
    f.action = ${JSON.stringify(`/api/v2/visit-requests/${doc._id}/payment/callback`)};
    [['razorpayPaymentId', r.razorpay_payment_id],
     ['razorpaySignature', r.razorpay_signature],
     ['redirect', ${JSON.stringify(redirect)}]].forEach(function (kv) {
      var i = document.createElement('input');
      i.type = 'hidden'; i.name = kv[0]; i.value = kv[1];
      f.appendChild(i);
    });
    document.body.appendChild(f); f.submit();
  };
  opts.modal = { ondismiss: function () { window.location = ${JSON.stringify(`${redirect}?paid=0`)}; } };

  var rzp = new Razorpay(opts);

  /*
   * Razorpay FAILING and Razorpay never opening were indistinguishable from
   * outside until this existed. Reported with \`keepalive\` so it still
   * leaves if the page is navigating, and wrapped so that reporting a
   * failure can never itself break the retry the customer is about to make.
   */
  rzp.on('payment.failed', function (e) {
    var err = (e && e.error) || {};
    try {
      var f = new FormData();
      f.append('code', err.code || '');
      f.append('description', err.description || '');
      f.append('reason', err.reason || '');
      f.append('step', err.step || '');
      f.append('source', err.source || '');
      f.append('paymentId', (err.metadata && err.metadata.payment_id) || '');
      fetch(${JSON.stringify(`/api/v2/visit-requests/${doc._id}/payment/failed`)}, {
        method: 'POST', body: f, keepalive: true,
      });
    } catch (ignored) { /* Never block the retry. */ }
  });

  rzp.open();
</script>
</body></html>`);
  } catch (error) {
    return next(error);
  }
};

/**
 * Where the rendered checkout posts its result. Same verification as the API
 * route — one implementation, so a browser flow and an app flow cannot end up
 * trusting different things.
 *
 * @route POST /api/v2/visit-requests/:id/payment/callback
 */
const paymentCallback = async (req, res, next) => {
  try {
    const doc = await VisitRequest.findById(req.params.id).catch(() => null);
    const redirect = safeRedirect(req.body?.redirect);

    if (!doc || !doc.payment?.orderId) {
      return res.type('html').send(bounce(redirect, 'error'));
    }

    const genuine = razorpay.verifySignature({
      orderId: doc.payment.orderId,
      paymentId: req.body?.razorpayPaymentId,
      signature: req.body?.razorpaySignature,
    });

    if (!genuine) {
      doc.payment.status = 'failed';
      doc.payment.failureReason = 'signature did not verify';
      await doc.save();
      return res.type('html').send(bounce(redirect, 'unverified'));
    }

    await markVisitPaid(doc, req.body.razorpayPaymentId);

    return res.type('html').send(bounce(redirect, 'paid'));
  } catch (error) {
    return next(error);
  }
};

/** A bare page that hands control back to the app. The redirect has already
    been through `safeRedirect`, whose charset admits nothing that can close
    an attribute or a tag. */
const bounce = (redirect, outcome) => `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${redirect}?paid=${outcome === 'paid' ? '1' : '0'}&outcome=${outcome}">
<title>Returning to Lampose</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0">
<p>Returning to the app…</p>
<script>window.location = ${JSON.stringify(`${redirect}?paid=`)} + ${outcome === 'paid' ? "'1'" : "'0'"} + '&outcome=${outcome}';</script>
</body></html>`;

const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:2rem">
<div><h1 style="font-size:1.1rem">${title}</h1><p style="color:#46564d">${body}</p></div>
</body></html>`;

/**
 * What Razorpay said when it refused.
 *
 * Records only — it never marks anything paid, and it deliberately does not
 * end the request: a declined card is a reason to try another one, and the
 * checkout stays open behind this call. `payment.status` stays `pending`: the
 * order is still open and a retry on the same order is exactly what the
 * customer is being offered.
 *
 * @route POST /api/v2/visit-requests/:id/payment/failed
 */
const recordPaymentFailure = async (req, res, next) => {
  try {
    const doc = await VisitRequest.findById(req.params.id).catch(() => null);
    /* 204 either way. This is telemetry from a page that is mid-retry; an
       error status here would surface in the checkout as a failed fetch and
       tell the customer about a problem that is not theirs. */
    if (!doc || !doc.payment?.required) return res.status(204).end();

    const trim = (value) => String(value || '').slice(0, 200);
    const detail = [
      trim(req.body?.code),
      trim(req.body?.step),
      trim(req.body?.source),
      trim(req.body?.reason),
      trim(req.body?.description),
    ].filter(Boolean).join(' · ');

    doc.payment.failureReason = detail || 'razorpay declined, no reason given';
    if (req.body?.paymentId) doc.payment.paymentId = trim(req.body.paymentId);
    await doc.save();

    console.warn(`💳 [payment failed] request ${doc._id} — ${doc.payment.failureReason}`);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createPaymentOrder, verifyPayment, needsToken,
  ensurePaymentLink, markVisitPaid,
  renderCheckout, paymentCallback, recordPaymentFailure,
  ASSISTED_PURPOSE,
};
