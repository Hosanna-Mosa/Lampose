/* ══════════════════════════════════════════════════════════════════════════
   Razorpay, over its REST API.

   ## Why there is no SDK here

   Two calls are needed — create an order, and check a signature — and the
   second is an HMAC that Node already does. A dependency for that would be a
   dependency to keep current, audit and mock, in exchange for nothing.

   ## The one rule

   A client's word that it paid is worth nothing. Razorpay's checkout hands
   the browser an `order_id`, a `payment_id` and a `signature`, and the
   signature is an HMAC-SHA256 of `order_id|payment_id` keyed with OUR secret.
   Only the server holds that secret, so only the server can tell a real
   payment from a crafted one. `verifySignature` below is the whole of the
   trust boundary — nothing else in this codebase may mark a request paid.

   ## Missing keys are not fatal

   Same rule as Mongo, SMS and Twilio: an unconfigured gateway degrades to a
   named 503 on the routes that need it and leaves every other flow alone.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');

const config = require('../../config/env');

const ORDERS_URL = 'https://api.razorpay.com/v1/orders';
const LINKS_URL = 'https://api.razorpay.com/v1/payment_links';

/** True when both keys are present. Checked by the routes before they answer. */
const isConfigured = () => Boolean(config.razorpay.keyId && config.razorpay.keySecret);

const authHeader = () => `Basic ${Buffer
  .from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`)
  .toString('base64')}`;

/**
 * Create an order Razorpay's checkout can be opened against.
 *
 * `receipt` is our own reference — the visit request id — so a payment in
 * their dashboard can be traced back to a row here without a lookup table.
 *
 * @param {{ amountPaise: number, receipt: string, notes?: object }} input
 * @returns {Promise<{ id: string, amount: number, currency: string }>}
 */
const createOrder = async ({ amountPaise, receipt, notes = {} }) => {
  if (!isConfigured()) {
    const error = new Error('Payments are not configured on this server.');
    error.code = 'RAZORPAY_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(ORDERS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt: String(receipt).slice(0, 40),
      /* Razorpay retries an identical receipt into the SAME order rather than
         creating a second one, which is what makes reopening a half-finished
         checkout safe. */
      payment_capture: 1,
      notes,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.description || `Razorpay refused the order (${response.status}).`;
    const error = new Error(message);
    error.code = 'RAZORPAY_ORDER_FAILED';
    error.status = response.status;
    throw error;
  }
  return body;
};

/**
 * Is this really Razorpay saying this payment happened?
 *
 * `timingSafeEqual` rather than `===`: a plain comparison leaks how much of a
 * forged signature was right through how long it took to reject, which is
 * enough to reconstruct one a byte at a time.
 */
const verifySignature = ({ orderId, paymentId, signature }) => {
  if (!isConfigured() || !orderId || !paymentId || !signature) return false;

  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

/**
 * The same question for a webhook, whose signature covers the whole raw body.
 *
 * Needs the body EXACTLY as it arrived — re-serialising a parsed object
 * reorders keys and changes the bytes, and the HMAC then never matches.
 */
const verifyWebhook = ({ rawBody, signature }) => {
  const secret = config.razorpay.webhookSecret;
  if (!secret || !rawBody || !signature) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

/**
 * A shareable payment link — a URL anybody can open and pay at.
 *
 * ## Why a link rather than an order
 *
 * An order needs a page to open the checkout on, which means the customer has
 * to be back on the website. A link is a URL that works in WhatsApp, so an
 * owner's confirmation can carry "pay here" straight to the person waiting for
 * it instead of asking them to find their way back to a tab.
 *
 * `notes` is how the payment finds its way home: Razorpay echoes it on the
 * webhook, so the visit request id travels with the money and no lookup table
 * is needed.
 *
 * `reminder_enable` is on because the whole point is somebody paying later, on
 * their phone, away from the page they started on.
 *
 * @param {{ amountPaise: number, description: string, name?: string,
 *           phone?: string, email?: string, notes?: object,
 *           callbackUrl?: string, expiresAt?: number }} input
 */
const createPaymentLink = async ({
  amountPaise, description, name, phone, email, notes = {}, callbackUrl, expiresAt,
}) => {
  if (!isConfigured()) {
    const error = new Error('Payments are not configured on this server.');
    error.code = 'RAZORPAY_NOT_CONFIGURED';
    throw error;
  }

  const body = {
    amount: amountPaise,
    currency: 'INR',
    accept_partial: false,
    description: String(description || 'Lampose visit token').slice(0, 2048),
    customer: {
      name: String(name || '').slice(0, 100) || undefined,
      contact: phone || undefined,
      email: email || undefined,
    },
    notify: { sms: false, email: Boolean(email) },
    reminder_enable: true,
    notes,
  };

  /* Razorpay rejects an expiry under 15 minutes out, and one in the past
     outright — so it is only sent when it clears that. */
  if (expiresAt && expiresAt > Math.floor(Date.now() / 1000) + 900) {
    body.expire_by = Math.floor(expiresAt);
  }
  if (callbackUrl) {
    body.callback_url = callbackUrl;
    body.callback_method = 'get';
  }

  const response = await fetch(LINKS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify(body),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.error?.description || `Razorpay refused the payment link (${response.status}).`;
    const error = new Error(message);
    error.code = 'RAZORPAY_LINK_FAILED';
    error.status = response.status;
    throw error;
  }
  return json;
};

module.exports = {
  isConfigured, createOrder, createPaymentLink, verifySignature, verifyWebhook,
};
