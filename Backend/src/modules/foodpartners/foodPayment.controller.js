/* ══════════════════════════════════════════════════════════════════════════
   Paying for a food order.

   ## The order comes first, and it is invisible until the money lands

   Two orderings were possible and only one of them is safe:

     pay, then create      the diner is charged for a cart the server has not
                           priced yet, so the amount has to come from the
                           client — which is the exact hole `placeOrder` was
                           written to close.

     create, then pay      the server prices the cart, mints a Razorpay order
                           for ITS OWN figure, and the kitchen is not told
                           anything until a signature says the money arrived.

   The second is what this does. The cost is that an abandoned checkout leaves
   a row in `food_orders` with `paymentStatus: 'pending'` — which is honest, is
   what actually happened, and is filtered out of every place a restaurant or a
   rider could see it. The cost of the first ordering is a ₹320 biryani ordered
   for ₹1.

   ## `paid` has exactly one cause

   A verified signature. `razorpay.verifySignature` is the whole of the trust
   boundary and nothing else in this codebase may set `paymentStatus: 'paid'`
   on an online order. That is why the in-app verify and the webhook below
   share ONE implementation (`confirmPayment`) rather than each doing the work
   — two implementations of "mark it paid" is two places for the check to be
   forgotten, and only one of them would be under test.

   ## Why the webhook matters as well as the in-app call

   The in-app verify fires only if the app is still in the foreground when
   checkout returns. An app killed by Android mid-payment, a phone that lost
   signal at the UPI screen, a diner who switched to their bank app and never
   came back — all of those are money taken with nobody to report it. The
   webhook is the path that finishes those, and it is why the confirm step is
   idempotent: both paths routinely run for the same payment.

   ## What a failed payment does NOT do

   It does not cancel the order and it does not tell the kitchen anything. A
   diner who taps back out of the UPI screen and tries again a minute later
   must land on the same order, not a second one — which is also why the
   Razorpay order id is reused while it is still valid rather than minted per
   attempt.
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const config = require('../../config/env');
const razorpay = require('../../infrastructure/razorpay/razorpay');
const FoodOrder = require('./foodOrder.model');
const { notifyRestaurantOfOrder, notifyCustomerOfOrder } = require('./foodOrder.notifier');
const { BADGE, logError } = require('./foodPartner.log');
const { returnToAppPage } = require('../../shared/utils/returnToApp');

/*
 * The claim on a checkout link.
 *
 * The checkout PAGE cannot carry a bearer token — a WebView loading a URL
 * sends no Authorization header, and the visit flow gets away with an
 * unauthenticated page only because a visit request is addressed by a 24-hex
 * ObjectId. A food order number is six digits, which is guessable, so the link
 * carries its own proof instead: a short-lived JWT naming exactly one order.
 *
 * Ten minutes, because that is a checkout, not a session. A link left in a
 * browser history is dead long before anybody finds it, and re-opening the
 * payment mints a fresh one.
 */
const CHECKOUT_TOKEN_TYPE = 'food_checkout';
const CHECKOUT_TTL = '10m';

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const dbDown = (res) => fail(
  res, 503, 'DB_DISCONNECTED', 'The server is running but not connected to the database.',
);

const isUp = () => mongoose.connection.readyState === 1;

const notConfigured = (res) => fail(
  res, 503, 'PAYMENTS_NOT_CONFIGURED',
  'Online payment is unavailable right now. Please choose cash on delivery.',
);

/* ── The shared confirm ───────────────────────────────────────────────────*/

/**
 * Mark an order paid, tell the kitchen, and send for a rider.
 *
 * The ONE place an online food order becomes `paid`. Called by the in-app
 * verify and by the webhook, both of which have already checked a signature —
 * this function does not check one itself, precisely so that the check cannot
 * be accidentally satisfied by calling this instead.
 *
 * Idempotent by the first branch: both paths routinely run for the same
 * payment, and a kitchen rung twice for one order is a cook who cannot tell
 * whether there are one or two.
 *
 * @param {object} order a loaded FoodOrder document
 * @param {{ paymentId: string, amountPaise?: number }} payment
 * @returns {Promise<{ alreadyPaid: boolean, notified: boolean }>}
 */
async function confirmPayment(order, { paymentId, amountPaise }) {
  if (order.paymentStatus === 'paid') return { alreadyPaid: true, notified: false };

  order.paymentStatus = 'paid';
  order.razorpay.paymentId = String(paymentId || '');
  if (Number.isFinite(amountPaise)) order.razorpay.amountPaise = amountPaise;
  order.razorpay.paidAt = new Date();
  order.statusHistory.push({
    status: order.status, at: new Date(), by: 'system', note: 'Payment received',
  });
  await order.save();

  console.log(`${BADGE} [Paid] ${order.orderNumber} · ₹${order.grandTotal} · ${paymentId}`);

  /* Only NOW does the kitchen learn about it. Everything before this point was
     a diner filling a form. Dispatch does not start here any more, either —
     see `eligibleForDispatch`'s own note on why an unpaid order was never
     sent a rider, and `setOrderStatus` in `foodOrder.controller.js` for
     where that now happens: the kitchen accepting with a prep-time quote,
     which for an online order cannot come before this payment has verified,
     since the restaurant is not even told about an unpaid one. */
  const placed = order.toObject();
  const alert = await notifyRestaurantOfOrder(placed);
  /* The diner learns it is real at the same instant the kitchen does — never
     before, because an unpaid order is invisible to both. */
  await notifyCustomerOfOrder(placed);

  return { alreadyPaid: false, notified: alert.sent > 0 };
}

/* ── POST /orders/:orderNumber/payment ────────────────────────────────────*/

// @route   POST /api/v2/food-partners/orders/:orderNumber/payment
// @desc    Mint (or re-use) the Razorpay order this food order is paid against
// @access  Customer session (owner only)
const startPayment = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);
    if (!razorpay.isConfigured()) return notConfigured(res);

    const order = await FoodOrder.findOne({
      customerId: req.customer.customerId,
      orderNumber: String(req.params.orderNumber || '').trim().toUpperCase(),
    });

    if (!order) return fail(res, 404, 'NOT_FOUND', 'We could not find that order.');
    if (order.paymentMode !== 'online') {
      return fail(res, 409, 'NOT_AN_ONLINE_ORDER', 'That order is being paid in cash.');
    }
    if (order.paymentStatus === 'paid') {
      return res.json({ success: true, data: { alreadyPaid: true, order: order.toJSON() } });
    }
    if (['cancelled', 'rejected'].includes(order.status)) {
      return fail(res, 409, 'ORDER_CLOSED', 'That order is no longer open.');
    }

    const amountPaise = Math.round(order.grandTotal * 100);

    /* Re-used rather than re-minted. A diner who backs out of the UPI screen
       and tries again must land on the same Razorpay order — Razorpay itself
       collapses a repeated `receipt` into one order for the same reason, and
       reusing the id we already stored saves the round trip. */
    if (!order.razorpay.orderId) {
      const created = await razorpay.createOrder({
        amountPaise,
        /* Our own reference, so a payment in their dashboard traces back here
           without a lookup table. */
        receipt: order.orderNumber,
        /* Echoed back on the webhook — this is how the money finds its way
           home when the app never came back to the foreground. */
        notes: { foodOrderNumber: order.orderNumber, purpose: 'food_order' },
      });
      order.razorpay.orderId = created.id;
      order.razorpay.amountPaise = amountPaise;
      await order.save();
    }

    return res.json({
      success: true,
      data: {
        razorpayOrderId: order.razorpay.orderId,
        amountPaise,
        currency: 'INR',
        /* The PUBLISHABLE key. The secret never leaves this process — see
           `razorpay.js`. */
        keyId: config.razorpay.keyId,
        orderNumber: order.orderNumber,
        name: 'Lampose',
        description: `Order ${order.orderNumber}`,
        prefill: {
          name: order.customerName || '',
          contact: order.customerPhone || '',
        },
        /* The page the app renders in its own WebView, and the proof it needs
           to be allowed to. See `CHECKOUT_TOKEN_TYPE`. */
        checkoutToken: config.auth.configured
          ? jwt.sign(
            { sub: order.orderNumber, typ: CHECKOUT_TOKEN_TYPE },
            config.auth.jwtSecret,
            { expiresIn: CHECKOUT_TTL },
          )
          : '',
      },
    });
  } catch (error) {
    if (error.code === 'RAZORPAY_NOT_CONFIGURED') return notConfigured(res);
    if (error.code === 'RAZORPAY_ORDER_FAILED') {
      logError('minting a Razorpay order', error);
      return fail(res, 502, 'GATEWAY_REFUSED', 'The payment gateway would not open. Please try again.');
    }
    logError('starting a food payment', error);
    return next(error);
  }
};

/* ── POST /orders/:orderNumber/payment/verify ─────────────────────────────*/

// @route   POST /api/v2/food-partners/orders/:orderNumber/payment/verify
// @desc    The signature Razorpay's checkout handed the app, checked here
// @access  Customer session (owner only)
const verifyPayment = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);
    if (!razorpay.isConfigured()) return notConfigured(res);

    const body = req.body || {};
    const order = await FoodOrder.findOne({
      customerId: req.customer.customerId,
      orderNumber: String(req.params.orderNumber || '').trim().toUpperCase(),
    });

    if (!order) return fail(res, 404, 'NOT_FOUND', 'We could not find that order.');

    /* Idempotent, and answered as a success. The webhook routinely beats the
       app back, and a diner whose payment already landed must not be shown a
       failure for having also told us about it. */
    if (order.paymentStatus === 'paid') {
      return res.json({ success: true, data: { order: order.toJSON(), alreadyPaid: true } });
    }

    const razorpayOrderId = String(body.razorpayOrderId || body.razorpay_order_id || '').trim();
    const paymentId = String(body.razorpayPaymentId || body.razorpay_payment_id || '').trim();
    const signature = String(body.razorpaySignature || body.razorpay_signature || '').trim();

    /* The order id is checked against the one WE minted rather than trusted
       from the body. Without this, a valid signature from a different, cheaper
       order of the same customer's would verify — the HMAC covers
       `order_id|payment_id` and says nothing about which of our rows it
       belongs to. */
    if (!razorpayOrderId || razorpayOrderId !== order.razorpay.orderId) {
      return fail(res, 400, 'WRONG_ORDER', 'That payment is for a different order.');
    }

    const valid = razorpay.verifySignature({ orderId: razorpayOrderId, paymentId, signature });
    if (!valid) {
      console.warn(`${BADGE} [Payment] signature refused for ${order.orderNumber}`);
      return fail(
        res, 400, 'SIGNATURE_INVALID',
        'We could not confirm that payment. If money left your account it will be refunded.',
      );
    }

    const result = await confirmPayment(order, { paymentId, amountPaise: order.razorpay.amountPaise });

    return res.json({
      success: true,
      message: 'Payment received. Your order is with the kitchen.',
      data: { order: order.toJSON() },
      notified: result.notified,
    });
  } catch (error) {
    logError('verifying a food payment', error);
    return next(error);
  }
};

/* ── The checkout page ────────────────────────────────────────────────────*/

/*
 * The redirect a checkout page may bounce to.
 *
 * Prefix-checked AND charset-checked, exactly as `visitPayment.controller.js`
 * does it and for the same reason: the prefix keeps it ours, and the charset
 * is what stops a crafted `redirect` breaking out of the attribute it is
 * interpolated into — `"` and `>` are simply not in the set.
 */
const SAFE_REDIRECT = /^lampose:\/\/[A-Za-z0-9\-._~/?=&:%]*$/;
const safeRedirect = (raw) => (
  SAFE_REDIRECT.test(String(raw || '')) ? String(raw) : 'lampose://food-payment-done'
);

/** A bare page for the states where there is nothing to pay. */
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lampose</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center;
min-height:100vh;margin:0;background:#f7f9f7;color:#14201a;text-align:center;padding:24px}
p{color:#46564d;max-width:32ch}</style>
</head><body><div><h2>${title}</h2><p>${body}</p></div></body></html>`;

/* Hands control back to the app — a tap-to-return page, because Chrome will
   not follow a bare redirect to `lampose://` without one (see
   `shared/utils/returnToApp.js`). The URL shape is unchanged. */
const bounce = (redirect, state) => returnToAppPage(
  `${redirect}?paid=${state === 'paid' ? 1 : 0}`,
  state === 'paid',
);

/** The order this checkout link names, or null if the link is not valid. */
const orderFromToken = async (raw) => {
  if (!raw || !config.auth.configured) return null;
  try {
    const claims = jwt.verify(String(raw), config.auth.jwtSecret);
    if (claims.typ !== CHECKOUT_TOKEN_TYPE || !claims.sub) return null;
    return await FoodOrder.findOne({ orderNumber: String(claims.sub) });
  } catch {
    /* Expired or forged. Both are "this link does not open anything", and
       telling them apart would only help somebody probing. */
    return null;
  }
};

/**
 * The checkout page the app renders in its own WebView.
 *
 * ## Why a server-rendered page rather than a native SDK
 *
 * The same reasoning `visitPayment.controller.js` sets out, and the same
 * screen renders it: Razorpay's React Native SDK needs a native module, a
 * prebuild and a config plugin on both platforms, for one screen. This route
 * renders the same checkout, verifies the result HERE where the secret already
 * lives, and hands control back through the app's own deep link. The app never
 * sees a payment id or a signature — it shows a page and watches for a bounce.
 *
 * @route GET /api/v2/food-partners/checkout?t=<token>&redirect=lampose://…
 */
const renderCheckout = async (req, res, next) => {
  try {
    if (!razorpay.isConfigured()) {
      return res.status(503).type('html').send(page(
        'Payments are not set up yet',
        'Nothing has been charged. Please try again later, or choose cash on delivery.',
      ));
    }

    const order = await orderFromToken(req.query.t);
    if (!order) {
      return res.status(404).type('html').send(page(
        'This payment link has expired',
        'Nothing has been charged. Open the order again from the app to pay.',
      ));
    }

    const redirect = safeRedirect(req.query.redirect);

    if (order.paymentStatus === 'paid') {
      return res.type('html').send(bounce(redirect, 'paid'));
    }
    if (['cancelled', 'rejected'].includes(order.status)) {
      return res.status(409).type('html').send(page(
        'That order is closed',
        'Nothing has been charged.',
      ));
    }

    /* Re-used rather than re-minted, for the reason `startPayment` gives. */
    const amountPaise = Math.round(order.grandTotal * 100);
    if (!order.razorpay.orderId) {
      const created = await razorpay.createOrder({
        amountPaise,
        receipt: order.orderNumber,
        notes: { foodOrderNumber: order.orderNumber, purpose: 'food_order' },
      });
      order.razorpay.orderId = created.id;
      order.razorpay.amountPaise = amountPaise;
      await order.save();
    }

    const opts = {
      key: config.razorpay.keyId,
      order_id: order.razorpay.orderId,
      amount: amountPaise,
      currency: 'INR',
      name: 'Lampose',
      description: `Food order ${order.orderNumber}`,
      prefill: { name: order.customerName || '', contact: order.customerPhone || '' },
      theme: { color: '#45855a' },
    };

    /* The handler POSTs back to this server, which verifies and only then
       bounces to the app. The browser is a courier, not an authority. */
    return res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lampose · Food order</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f7f9f7;color:#14201a}p{color:#46564d}</style>
</head><body>
<div><p>Opening the payment window…</p></div>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var opts = ${JSON.stringify(opts)};
  opts.handler = function (r) {
    var f = document.createElement('form');
    f.method = 'POST';
    f.action = ${JSON.stringify('/api/v2/food-partners/checkout/callback')};
    [['orderNumber', ${JSON.stringify(order.orderNumber)}],
     ['razorpayOrderId', r.razorpay_order_id],
     ['razorpayPaymentId', r.razorpay_payment_id],
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
    if (error.code === 'RAZORPAY_ORDER_FAILED') {
      return res.status(502).type('html').send(page(
        'The payment window would not open',
        'Nothing has been charged. Please go back and try again.',
      ));
    }
    logError('rendering the food checkout', error);
    return next(error);
  }
};

/**
 * Where the rendered checkout posts its result.
 *
 * Verifies through the SAME `confirmPayment` the in-app route and the webhook
 * use — one implementation of "mark it paid", so a browser flow and an app
 * flow cannot end up trusting different things.
 *
 * Answers HTML, always: this is a form post from a page inside a WebView, and
 * a JSON body would leave the student looking at raw text.
 *
 * @route POST /api/v2/food-partners/checkout/callback
 */
const checkoutCallback = async (req, res, next) => {
  const body = req.body || {};
  const redirect = safeRedirect(body.redirect);

  try {
    const order = await FoodOrder.findOne({
      orderNumber: String(body.orderNumber || '').trim().toUpperCase(),
    });
    if (!order) return res.type('html').send(bounce(redirect, 'unpaid'));
    if (order.paymentStatus === 'paid') return res.type('html').send(bounce(redirect, 'paid'));

    /* The order id is checked against the one WE minted rather than trusted
       from the form. A valid signature from a different, cheaper order of the
       same customer's would otherwise verify — the HMAC covers
       `order_id|payment_id` and says nothing about which row it belongs to. */
    const razorpayOrderId = String(body.razorpayOrderId || '').trim();
    if (!razorpayOrderId || razorpayOrderId !== order.razorpay.orderId) {
      console.warn(`${BADGE} [Payment] checkout callback named the wrong order for ${order.orderNumber}`);
      return res.type('html').send(bounce(redirect, 'unpaid'));
    }

    const valid = razorpay.verifySignature({
      orderId: razorpayOrderId,
      paymentId: String(body.razorpayPaymentId || '').trim(),
      signature: String(body.razorpaySignature || '').trim(),
    });
    if (!valid) {
      console.warn(`${BADGE} [Payment] signature refused for ${order.orderNumber} (checkout)`);
      return res.type('html').send(bounce(redirect, 'unpaid'));
    }

    await confirmPayment(order, {
      paymentId: String(body.razorpayPaymentId || '').trim(),
      amountPaise: order.razorpay.amountPaise,
    });
    return res.type('html').send(bounce(redirect, 'paid'));
  } catch (error) {
    /* Bounced rather than 500'd. The money may well have moved, the webhook
       is the backstop that will finish it, and the student needs to be back in
       the app rather than looking at a stack trace. */
    logError('a food checkout callback', error);
    return res.type('html').send(bounce(redirect, 'unpaid'));
  }
};

/* ── The webhook's branch ─────────────────────────────────────────────────*/

/**
 * A `payment.captured` event that carries a food order number in its notes.
 *
 * Called from `visits/razorpayWebhook.controller.js`, which owns the route and
 * has ALREADY verified the signature over the raw body. This function is
 * therefore reached only for payments Razorpay signed, and it re-checks the
 * amount rather than the signature — an underpayment against a payment link
 * minted for a different amount is the one thing a valid signature does not
 * rule out.
 *
 * @returns {Promise<boolean>} whether this event was ours to handle
 */
async function handleFoodOrderWebhook({ orderNumber, paymentId, amountPaise }) {
  if (!orderNumber) return false;

  const order = await FoodOrder.findOne({ orderNumber: String(orderNumber).trim().toUpperCase() });
  if (!order) {
    console.warn(`${BADGE} [Webhook] payment for unknown order ${orderNumber}`);
    return true;
  }
  if (order.paymentStatus === 'paid') return true;

  const expected = Math.round(order.grandTotal * 100);
  if (Number.isFinite(amountPaise) && amountPaise < expected) {
    /* Logged loudly rather than accepted. Somebody has genuinely paid money
       that bought nothing, and a human owes them a call — the same handling
       the visit flow gives an underpayment. */
    console.error(
      `${BADGE} [Webhook] UNDERPAID ${orderNumber}: ${amountPaise} paise received, ${expected} expected. `
      + 'The order is NOT marked paid. Somebody needs to refund or top this up.',
    );
    return true;
  }

  await confirmPayment(order, { paymentId, amountPaise });
  return true;
}

/* ── Refunding a cancelled prepaid order ──────────────────────────────────*/

/**
 * Flag an order's money as owed back.
 *
 * Deliberately NOT a Razorpay refund call. A refund moves real money and is an
 * operations decision with a person behind it — an automatic one fired from a
 * cancel button is how a bug becomes a bank statement. What this does is mark
 * the row so the money shows up in the one place somebody is looking, and say
 * so loudly in the log.
 *
 * The diner is told the truth by the app: "a refund is on its way", which is
 * accurate, rather than "refunded", which would not be.
 *
 * ## And now there IS somewhere it shows up
 *
 * For a long time the "one place somebody is looking" was a console warning
 * in a log, which is to say nowhere. `foodOrderAdmin.controller.js` is the
 * queue this function was always writing to, and the refund button on that
 * queue is what finally sends it. Nothing about the reasoning changes: this
 * still refuses to move money, and the money still only moves when a named
 * administrator says so. What changed is that the sentence "refund this in the
 * dashboard" now names a dashboard.
 */
async function markForRefund(order, reason) {
  if (order.paymentMode !== 'online' || order.paymentStatus !== 'paid') return false;
  order.paymentStatus = 'refunded';
  order.statusHistory.push({
    status: order.status, at: new Date(), by: 'system', note: `Refund owed: ${reason}`.slice(0, 200),
  });
  await order.save();
  console.warn(
    `${BADGE} [Refund owed] ${order.orderNumber} · ₹${order.grandTotal} · ${reason} · `
    + `razorpay payment ${order.razorpay.paymentId || 'unknown'} — owed back. It is in the `
    + 'console under Food orders · refund owed, with a button that sends it.',
  );
  return true;
}

/* ── Actually sending the money back ──────────────────────────────────────
 *
 * It is not here any more, and this note is the signpost.
 *
 * The Razorpay refund call lived in this file for one release, for one reason:
 * `src/infrastructure/razorpay/razorpay.js` — the module that knows how to talk
 * to Razorpay — was not editable at the time, and a third call plainly belonged
 * in it. It is now `razorpay.refundPayment({ paymentId, idempotencyKey, notes })`,
 * beside `createOrder` and behind the same `isConfigured()` gate, with the same
 * credentials and the same idempotency behaviour it always had.
 *
 * What stayed here is `markForRefund` above, and the split is the right one:
 * deciding that money is OWED is a fact about a food order and belongs in the
 * food module; SENDING it is a call to a payment gateway and belongs in the
 * gateway client. `foodOrderAdmin.controller.js` is the only caller of the
 * second, and it is the only place a person can press it.
 */

module.exports = {
  startPayment,
  verifyPayment,
  renderCheckout,
  checkoutCallback,
  confirmPayment,
  handleFoodOrderWebhook,
  markForRefund,
};
