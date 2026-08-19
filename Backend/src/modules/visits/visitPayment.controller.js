/* ══════════════════════════════════════════════════════════════════════════
   The visit token — paying for a confirmed bachelor or co-live viewing.

   ## The order of events, and why it is this order

     1  the student asks, with a LAYOUT and nothing else
     2  the owner accepts
     3  the student pays a small token
     4  only then are they asked for a joining date
     5  and only then do they get the street address

   A joining date asked at step 1 is a guess about a viewing that may never be
   agreed to. Asked at step 4 it is a commitment, because money has already
   changed hands — which is the whole point of the token. The address moves for
   the same reason: an owner's door number is not something to hand out to
   everyone who taps a button.

   ## What may mark a request paid

   Exactly one thing: `razorpay.verifySignature`, over an HMAC only this server
   can compute. A client saying "it worked" is not evidence and is never
   treated as any.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../../config/env');
const razorpay = require('../../infrastructure/razorpay/razorpay');
const VisitRequest = require('./visitRequest.model');
const Property = require('../properties/property.model');
const { TOKEN_CATEGORIES, normaliseCategory } = require('../../shared/constants/categories');
const { isISODate, joinWindow } = require('../listings/stayIntent.util');
const twilio = require('../../infrastructure/twilio/twilio');
const { generateEntryPin } = require('./otp.util');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

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
 * The payment link a confirmed customer is sent on WhatsApp.
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
      amountPaise: doc.payment.amountPaise || config.razorpay.tokenAmountPaise,
      description: `Visit token · ${doc.propertyName || 'Lampose'}`,
      name: doc.customer?.name,
      phone: doc.customer?.phone,
      /* The id rides along on the webhook, so the money finds its way home
         without a lookup table. */
      notes: { visitRequestId: String(doc._id) },
      expiresAt: doc.payment.dueBy ? Math.floor(doc.payment.dueBy.getTime() / 1000) : null,
    });

    doc.payment.linkId = link.id || null;
    doc.payment.linkUrl = link.short_url || null;
    doc.payment.status = 'pending';
    await doc.save();
    return doc.payment.linkUrl;
  } catch (error) {
    console.error('[token] Could not create the payment link:', error.message);
    return null;
  }
};

/**
 * Mark the token paid, and send the address the token just bought.
 *
 * One implementation, called by both the API route and the browser callback,
 * so a payment made from the website and one made from the app cannot end up
 * releasing different things.
 *
 * The confirmation message the owner's YES triggered deliberately withheld the
 * street address while this was outstanding — see visitRequest.controller.js.
 * This is where it is handed over, which is the whole shape of the flow: the
 * owner agrees, the student pays, and only then do they learn the door.
 *
 * The message is fire-and-forget. The payment has already committed; making a
 * verified rupee depend on WhatsApp being reachable would be the wrong way
 * round.
 */
const markPaidAndReleaseAddress = async (doc, paymentId) => {
  doc.payment.status = 'paid';
  doc.payment.paymentId = String(paymentId);
  doc.payment.verifiedAt = new Date();
  doc.payment.failureReason = '';
  doc.addressReleasedAt = new Date();

  /* The reference is minted HERE, not when the owner tapped.
     It is what the two of them match at the door, so it belongs to a visit
     somebody has actually paid for. */
  const firstIssue = !doc.entryPin;
  if (firstIssue) {
    doc.entryPin = generateEntryPin();
    doc.entryPinIssuedAt = new Date();
  }
  await doc.save();

  /*
   * The booking row was written when the owner accepted, which on a token
   * category is BEFORE the PIN exists — so it copied a null and kept it. This
   * is the moment the PIN becomes real, so it is also the moment the booking
   * has to learn it: the two are compared at the door, and a booking holding
   * null against a request holding LV-… is a match that cannot be made.
   */
  if (firstIssue && doc.bookingId) {
    try {
      const { PartnerBooking } = require('../partners/partnerDomains.model');
      await PartnerBooking.updateOne(
        { _id: doc.bookingId },
        { $set: { entryPin: doc.entryPin } },
      );
    } catch (error) {
      console.error('[token] Could not copy the PIN onto the booking:', error.message);
    }
  }

  let full = '';
  try {
    const listing = await Property.findById(doc.listingId).select('address place').lean();
    if (listing) {
      full = listing.address && listing.place
        && String(listing.address).toLowerCase().includes(String(listing.place).toLowerCase())
        ? listing.address
        : [listing.address, listing.place].filter(Boolean).join(', ');
    }
  } catch (error) {
    console.warn('[token] Could not read the listing address to release it:', error.message);
  }

  /*
   * ── Which surface gets told ─────────────────────────────────────────────
   *
   * A request made in the app is answered in the app. Its owner accepted in
   * Stay Partner and its student is holding a phone with the request open, so
   * both are reachable by push — and neither asked for WhatsApp. Sending it
   * anyway put a message in front of people who never opted in, and in a test
   * account where the owner and the student share a number it arrived twice.
   *
   * The web channel is the opposite: it has no app on either side, WhatsApp is
   * how the whole flow has been conducted, and the student ticked the box for
   * it. So the channel decides, not a preference lookup.
   */
  if (doc.channel === 'app') {
    const notifier = require('../notifications/stayRequest.notifier');
    if (typeof notifier.notifyTokenPaid === 'function') {
      notifier.notifyTokenPaid(doc).catch((e) => console.error('[token] push failed:', e.message));
    }
    return;
  }

  /* Fire and forget, both of them. The payment has already committed; making a
     verified rupee depend on WhatsApp being reachable would be backwards. */
  if (doc.consentWhatsApp && doc.customer?.phone) {
    twilio.sendVisitConfirmationToCustomer({
      customerPhone: doc.customer.phone,
      customerName: doc.customer.name,
      propertyName: doc.propertyName,
      address: full,
      sharingLabel: doc.sharing && doc.sharing.label,
      joiningDate: doc.intent?.joiningDate || '',
      pin: doc.entryPin,
    }).then((r) => {
      if (!r?.success) console.error('[token] Address message failed:', r?.error);
    }).catch((e) => console.error('[token] Address message threw:', e.message));
  }

  /* And the owner, who was told to wait for exactly this. */
  if (doc.ownerMobile) {
    const what = doc.sharing?.label ? `${doc.sharing.label} at ${doc.propertyName}` : doc.propertyName;
    twilio.sendOwnerText({
      ownerMobile: doc.ownerMobile,
      body: `${doc.customer?.name || 'The visitor'} has confirmed their visit for ${what}.\n\n`
        + `Visit reference: ${doc.entryPin}\n\n`
        + 'They have the same number. Please ask for it when they arrive and check that it matches.',
    }).then((r) => {
      if (r && r.success === false) console.error('[token] Owner reference message failed:', r.error);
    }).catch((e) => console.error('[token] Owner reference message threw:', e.message));
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
      return fail(res, 400, 'NO_TOKEN_REQUIRED', 'This visit does not need a token.');
    }
    if (doc.status !== 'confirmed') {
      return fail(res, 409, 'NOT_CONFIRMED',
        'The owner has not confirmed this visit yet, so there is nothing to pay for.');
    }
    if (doc.payment.status === 'paid') {
      /* Idempotent: reopening a finished checkout should not create a second
         order, and must not look like an error to a student who tapped twice. */
      return res.json({ success: true, data: { alreadyPaid: true, payment: doc.payment } });
    }
    if (doc.payment.dueBy && doc.payment.dueBy.getTime() < Date.now()) {
      if (doc.payment.status !== 'expired') {
        doc.payment.status = 'expired';
        await doc.save();
      }
      return fail(res, 410, 'TOKEN_WINDOW_CLOSED',
        'This confirmation has lapsed. Ask the owner again to arrange a visit.');
    }

    const amountPaise = doc.payment.amountPaise || config.razorpay.tokenAmountPaise;

    const order = await razorpay.createOrder({
      amountPaise,
      /* Our own id, so a payment in their dashboard traces straight back. */
      receipt: String(doc._id),
      notes: { visitRequestId: String(doc._id), property: doc.propertyName || '' },
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
      return fail(res, 400, 'NO_TOKEN_REQUIRED', 'This visit does not need a token.');
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

    await markPaidAndReleaseAddress(doc, razorpayPaymentId);

    return res.json({ success: true, data: doc.toPublic() });
  } catch (error) {
    return next(error);
  }
};

/**
 * The joining date, asked only once the token is paid.
 *
 * @route POST /api/v2/visit-requests/:id/joining-date
 */
const setJoiningDate = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, 'DB_DISCONNECTED', 'The server is not connected to the database.');
    }

    const doc = await load(res, req.params.id);
    if (!doc) return undefined;

    if (doc.payment?.required && doc.payment.status !== 'paid') {
      return fail(res, 402, 'TOKEN_UNPAID', 'Pay the visit token before choosing a date.');
    }

    const { joiningDate, flexibleJoin } = req.body || {};
    if (!isISODate(joiningDate)) {
      return fail(res, 400, 'BAD_JOIN_DATE', 'Please choose a joining date.');
    }

    /* The same window the listing offered, re-derived here rather than
       believed — a date is being agreed with an owner, not just recorded. */
    const window = joinWindow();
    if (joiningDate < window.min || joiningDate > window.max) {
      return res.status(400).json({
        success: false,
        code: 'JOIN_DATE_OUT_OF_RANGE',
        window,
        message: `Joining date must be between ${window.min} and ${window.max}.`,
      });
    }

    doc.intent = { ...(doc.intent ? doc.intent.toObject?.() ?? doc.intent : {}), joiningDate, flexibleJoin: flexibleJoin === true };
    doc.markModified('intent');
    await doc.save();

    /* The address goes back with it — this is the moment it is earned. */
    const property = await Property.findById(doc.listingId).lean();
    return res.json({
      success: true,
      data: {
        ...doc.toPublic(),
        address: property?.address || '',
        ownerMobile: doc.ownerMobile || '',
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * A checkout page the mobile app can open in a browser tab.
 *
 * ## Why a server-rendered page rather than a native SDK
 *
 * Razorpay's React Native SDK needs a native module, which needs a prebuild
 * and a config plugin, on both platforms, for one screen. `expo-web-browser`
 * is already a dependency and opens a real browser session — so this route
 * renders the same checkout the website uses, verifies the result HERE where
 * the secret already lives, and hands control back through the app's own
 * deep link.
 *
 * The app never sees the payment id or the signature. It opens a URL and waits
 * to be returned to, which is less that can go wrong on a phone with a flaky
 * connection and one less place a secret could end up.
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

    /* The app passes where to come back to. Only a scheme we recognise is
       honoured — an open redirect here would let anybody bounce a paying
       customer to a page of their choosing. */
    const raw = String(req.query.redirect || '');
    const redirect = /^lampose:\/\//.test(raw) ? raw : 'lampose://visit';

    let order;
    if (doc.payment.status === 'paid') {
      return res.type('html').send(bounce(redirect, 'paid'));
    }
    order = await razorpay.createOrder({
      amountPaise: doc.payment.amountPaise || config.razorpay.tokenAmountPaise,
      receipt: String(doc._id),
      notes: { visitRequestId: String(doc._id) },
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
      description: `Visit token · ${doc.propertyName || ''}`.trim(),
      prefill: { name: doc.customer?.name || '', contact: doc.customer?.phone || '' },
      theme: { color: '#45855a' },
    };

    /* The handler POSTs back to this server, which verifies and only then
       bounces to the app. The browser is a courier, not an authority. */
    return res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lampose · Visit token</title>
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
  new Razorpay(opts).open();
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
    const raw = String(req.body?.redirect || '');
    const redirect = /^lampose:\/\//.test(raw) ? raw : 'lampose://visit';

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

    await markPaidAndReleaseAddress(doc, req.body.razorpayPaymentId);

    return res.type('html').send(bounce(redirect, 'paid'));
  } catch (error) {
    return next(error);
  }
};

/** A bare page that hands control back to the app. */
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

module.exports = {
  createPaymentOrder, verifyPayment, setJoiningDate, needsToken,
  ensurePaymentLink, markPaidAndReleaseAddress,
  renderCheckout, paymentCallback,
};
