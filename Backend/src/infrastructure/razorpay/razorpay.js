/* ══════════════════════════════════════════════════════════════════════════
   Razorpay, over its REST API.

   ## Why there is no SDK here

   Three calls are needed — create an order, send one back, and check a
   signature — and the last is an HMAC that Node already does. A dependency for
   that would be a dependency to keep current, audit and mock, in exchange for
   nothing.

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
const REFUND_URL = (paymentId) => `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`;

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
 * Refund a captured payment, in full, once.
 *
 * Beside `createOrder` because it is the same client, the same credentials and
 * the same `isConfigured()` gate — this is the one module that knows how to
 * talk to Razorpay, and money going back is as much that job as money coming
 * in. It lived in `foodPayment.controller.js` for one release only because this
 * file was not editable at the time, and it has moved here unchanged in
 * behaviour.
 *
 * ## The amount is NOT sent, and that is the point
 *
 * Razorpay refunds the entire captured payment when no `amount` is given. Any
 * figure a caller computed — a grand total, or an `amountPaise` stored at
 * checkout — is our idea of what was charged, and if it ever disagreed with
 * what Razorpay actually captured, the disagreement would be settled in a
 * student's bank account. So the gateway refunds what it holds, and the amount
 * in the RESPONSE is what the caller records. Nothing here invents a number.
 *
 * A partial refund is therefore not possible from this call, which is
 * deliberate: a per-amount refund would break the idempotency key below.
 *
 * ## Idempotency, and why the key is required rather than defaulted
 *
 * `X-Razorpay-Idempotency-Key` is what makes two calls for the same thing ONE
 * refund at the gateway — the second gets the first one's response back rather
 * than moving money again. It is REQUIRED, and refusing a call without one is
 * the whole reason: a default derived from the payment id would look identical
 * at every call site and would silently stop being a guard the first time
 * somebody refunded two different things for one payment. A caller that has
 * nothing stable to key on does not have a safe refund to make.
 *
 * It is one of three guards, not the only one: the caller refuses an order that
 * already carries a refund record, and Razorpay itself refuses a payment that
 * has already been fully refunded. A double-click has to get past all three.
 *
 * ## What this function does NOT do
 *
 * It touches nothing. No row is read, no row is saved — the caller does all of
 * that, after this returns, so that a gateway failure leaves its record exactly
 * as it was and a human can retry from it. The one thing worse than a refund
 * that did not go is an order that says it did.
 *
 * @param {{ paymentId: string, idempotencyKey: string, notes?: object }} input
 * @returns {Promise<{ id: string, amount: number, currency: string,
 *                     status: string, payment_id: string }>} Razorpay's refund
 * @throws {Error} with `code` and Razorpay's own `description` as the message
 */
const refundPayment = async ({ paymentId, idempotencyKey, notes = {} }) => {
  if (!isConfigured()) {
    const error = new Error('Payments are not configured on this server.');
    error.code = 'RAZORPAY_NOT_CONFIGURED';
    throw error;
  }

  const id = String(paymentId || '').trim();
  if (!id) {
    const error = new Error('There is no Razorpay payment id to refund against.');
    error.code = 'NO_PAYMENT_ID';
    throw error;
  }

  const key = String(idempotencyKey || '').trim();
  if (!key) {
    /* Refused rather than defaulted. See the note above — a refund with no
       idempotency key is a refund that can be sent twice. */
    const error = new Error('A refund needs an idempotency key.');
    error.code = 'NO_IDEMPOTENCY_KEY';
    throw error;
  }

  const response = await fetch(REFUND_URL(id), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      /* Same thing, same key, one refund. */
      'X-Razorpay-Idempotency-Key': key,
    },
    body: JSON.stringify({
      /* No `amount` — the whole captured payment. See the note above. */
      speed: 'normal',
      /* Echoed on the refund in their dashboard, so a row there traces back to
         a row here and to a person without a lookup table — the same reason
         `createOrder` sends notes. */
      notes,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    /* Razorpay's OWN description, carried out to the caller unchanged. "The
       payment has been fully refunded" and "Your account is not activated for
       refunds" are two entirely different afternoons, and a generic message
       hides which one this is. */
    const message = body?.error?.description
      || `Razorpay refused the refund (${response.status}).`;
    const error = new Error(message);
    error.code = 'RAZORPAY_REFUND_FAILED';
    error.status = response.status;
    error.reason = body?.error?.reason || '';
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
  isConfigured, createOrder, refundPayment, createPaymentLink, verifySignature, verifyWebhook,
};
