/* ══════════════════════════════════════════════════════════════════════════
   Who brings the order — the restaurant's own person, or a Lampose driver.

   When a restaurant accepts a delivery order it says how the order will get
   to the diner. Two answers:

     self     "We will deliver it ourselves." The restaurant's own person takes
              it. Nobody is contacted.
     driver   "Send a Lampose driver." The delivery desk is sent a WhatsApp —
              pickup, drop, customer, cash to collect — and sends somebody.

   Either way the diner's screen says the driver has been assigned.

   ## This replaces the automatic rider search for that order

   An order the restaurant has chosen a method for is no longer searched for in
   the rider app. Two riders for one bag — the desk's and one of the fleet's —
   is worse than none, so choosing cancels whatever search was running
   (`cancelDispatch`) and the dispatcher's own guard keeps it from starting
   again. An order accepted WITHOUT a choice (an older partner app that does not
   send one) keeps the automatic search exactly as before: `delivery.method` is
   the only thing that tells the two apart.

   ## The diner is told "assigned" only when it is true

   `self` is true the moment the restaurant says it. `driver` is true only once
   the WhatsApp has actually gone out: a message that bounced does not send a
   driver, and a diner told one is coming would wait for somebody who was never
   asked. Until it has gone, the restaurant is shown that it did not and why,
   with a button to send it again, and the diner sees "arranging a driver". See
   `driverAssigned` in the order model, which every diner-facing view asks.

   ## Never throws for a message that did not go

   The WhatsApp is a third party over the network — the slowest and least
   reliable step here. A failure is RECORDED on the order (`delivery.request`)
   and reported to the caller; it is never raised, because the order was
   accepted and that write was right whatever happened to the message.

   ## What the message deliberately leaves out

   The diner's delivery code. There is none on these orders any more: the
   diner confirms the delivery themselves, with a button, so nobody is asked for
   a code and none is shown. (The app's own riders still use one — that is a
   different flow, and untouched.)
   ══════════════════════════════════════════════════════════════════════════ */
const FoodOrder = require('./foodOrder.model');
const config = require('../../config/env');
const twilio = require('../../infrastructure/twilio/twilio');
const { BADGE, logError } = require('./foodPartner.log');

const {
  DELIVERY_METHODS, restaurantArrangedDelivery, driverAssigned, isWebDelivery,
} = FoodOrder;

/** States in which the way an order travels can still be decided or changed. */
const ARRANGEABLE = ['accepted', 'preparing', 'ready'];

/**
 * A second "send it" inside this window is the same tap arriving twice.
 * Thirty seconds is longer than a double-click or a retried request and much
 * shorter than a restaurant genuinely deciding the message needs sending again.
 */
const DUPLICATE_WINDOW_MS = 30 * 1000;

const rupees = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

/** A refusal a route can turn straight into a response. */
const refuse = (code, message, status = 409) => ({ ok: false, code, message, status });

/**
 * Why this order's delivery cannot be arranged — or null when it can.
 *
 * Kept as one function so the accept path and the "choose delivery" button
 * cannot disagree about what is allowed.
 */
const whyNotArrangeable = (order) => {
  if (order.fulfilment === 'pickup') {
    return refuse('NOT_A_DELIVERY', 'This is a counter-pickup order. Nobody delivers it.');
  }
  if (!isWebDelivery(order)) {
    return refuse(
      'NOT_A_WEBSITE_ORDER',
      'This order was placed in the app. A Lampose rider is found for it automatically, so there is nothing to choose.',
    );
  }
  if (!ARRANGEABLE.includes(order.status)) {
    return refuse(
      'WRONG_STATE',
      order.status === 'placed'
        ? 'Accept the order first, then choose who delivers it.'
        : `Delivery cannot be changed on an order that is "${order.status}".`,
    );
  }
  if (order.delivery && order.delivery.driverId) {
    return refuse(
      'RIDER_ALREADY_ASSIGNED',
      'A rider from the Lampose app has already taken this order, so it cannot be handed to anyone else.',
    );
  }
  return null;
};

/** A Google Maps link for a GeoJSON [lng, lat] pair, or '' when there is no pin. */
const mapLink = (point) => {
  const pair = point && Array.isArray(point.coordinates) ? point.coordinates : null;
  if (!pair || pair.length !== 2 || !pair.every(Number.isFinite)) return '';
  return `https://www.google.com/maps?q=${pair[1]},${pair[0]}`;
};

/** "Food is ready in about 12 min." — measured from NOW, so a resend is not stale. */
const readyLine = (order) => {
  if (order.status === 'ready') return 'The food is ready now.';
  if (!order.promisedMinutes) return '';
  const accepted = (order.statusHistory || []).find((event) => event.status === 'accepted');
  if (!accepted || !accepted.at) return '';
  const left = Math.round(
    (new Date(accepted.at).getTime() + order.promisedMinutes * 60000 - Date.now()) / 60000,
  );
  return left > 0 ? `The food will be ready in about ${left} min.` : 'The food is ready about now.';
};

/**
 * The WhatsApp's content, from the order as stored.
 *
 * Address and phone come off the snapshot the order carries — the same one the
 * rider app heads a job with — so this says what the restaurant was when the
 * order was placed, not whatever its profile says today.
 */
const describeRequest = (order) => {
  const kitchen = order.restaurant || {};
  const pickupMap = mapLink(order.pickupLocation);
  const dropMap = mapLink(order.dropLocation);
  const owed = order.paymentMode === 'cod' && order.paymentStatus !== 'paid';

  return {
    orderNumber: order.orderNumber,
    restaurantName: kitchen.name || 'The restaurant',
    pickup: [kitchen.address, kitchen.phone && `Call ${kitchen.phone}`, pickupMap]
      .filter(Boolean).join(' · ') || 'Ask the restaurant',
    drop: [order.deliveryAddress || 'Address on the order', dropMap].filter(Boolean).join(' · '),
    customer: [order.customerName || 'Customer', order.customerPhone].filter(Boolean).join(' · '),
    collect: owed
      ? `Cash to collect: ${rupees(order.grandTotal)} (pay on delivery)`
      : 'Already paid online — nothing to collect.',
    ready: readyLine(order),
  };
};

/**
 * Send the request to the desk and record what came of it on `order`.
 *
 * Mutates `order.delivery.request` and does NOT save — the caller saves once,
 * with the rest of what it changed. Never throws.
 */
const requestFromDesk = async (order) => {
  const to = config.deliveryDesk.whatsapp;
  const previous = (order.delivery.request && order.delivery.request.attempts) || 0;

  let result;
  try {
    /* Looked up on the module at call time, not destructured at load: this is
       the one thing a test replaces to stand in for WhatsApp. */
    result = await twilio.sendDeliveryRequest({ to, ...describeRequest(order), kind: 'request' });
  } catch (error) {
    result = { success: false, error: error.message };
  }

  order.delivery.request = {
    to,
    sentAt: new Date(),
    ok: Boolean(result && result.success),
    messageSid: (result && result.messageSid) || '',
    error: result && result.success ? '' : String((result && result.error) || 'The message was not accepted.'),
    attempts: previous + 1,
  };

  console.log(
    `${BADGE} [Delivery] ${order.orderNumber} → desk ${order.delivery.request.ok
      ? `WhatsApp sent (${order.delivery.request.messageSid || 'queued'})`
      : `WhatsApp FAILED: ${order.delivery.request.error}`}`,
  );
  return order.delivery.request;
};

/** Tell the desk not to send anyone. Best effort — the order has already moved on. */
const withdrawFromDesk = (order) => {
  Promise.resolve()
    .then(() => twilio.sendDeliveryRequest({
      to: config.deliveryDesk.whatsapp, ...describeRequest(order), kind: 'cancel',
    }))
    .catch((error) => logError('withdrawing a delivery request', error));
};

/**
 * Decide who brings this order.
 *
 * Callable at accept time and again afterwards (the "choose delivery" button,
 * and the resend after a failed message). Reloads the order itself, so the
 * caller's copy — saved a moment ago for the status change — is never the one
 * this writes over.
 *
 * @param {string} orderNumber
 * @param {'self'|'driver'} method
 * @param {string} restaurantId  the caller's, from its token — an order that is
 *                               not theirs is "not found", exactly as everywhere
 * @returns {Promise<{ok: true, order: object, sent: boolean|null} | {ok: false, code: string, message: string, status: number}>}
 *          `sent` is null for `self` (nothing was sent), otherwise whether the
 *          WhatsApp went out.
 */
async function arrangeDelivery(orderNumber, method, restaurantId) {
  if (!DELIVERY_METHODS.includes(method)) {
    return refuse('BAD_INPUT', `"deliveryBy" must be one of: ${DELIVERY_METHODS.join(', ')}.`, 400);
  }

  const number = String(orderNumber || '').trim();
  const existing = await FoodOrder.findOne({ restaurantId, orderNumber: number });
  if (!existing) return refuse('NOT_FOUND', 'We could not find that order.', 404);

  const refusal = whyNotArrangeable(existing);
  if (refusal) return refusal;

  /* The same tap arriving twice. Answered as success with what is already true,
     rather than a second WhatsApp to a desk that has just been asked. */
  const last = existing.delivery.request;
  if (
    method === 'driver'
    && existing.delivery.method === 'driver'
    && last && last.ok
    && last.sentAt && Date.now() - new Date(last.sentAt).getTime() < DUPLICATE_WINDOW_MS
  ) {
    return { ok: true, order: existing, sent: true };
  }

  /*
   * The automatic search stops first, and while the order is still as loaded.
   *
   * `cancelDispatch` closes any offers still open to riders (they are told the
   * job is gone) and puts a `searching` / `unassigned` order back to `idle`
   * with an empty reason — this is not a failed search, it is one nobody needs.
   * It works on its own copy of the order, which is why the order is read
   * again afterwards instead of being written from this one.
   */
  // eslint-disable-next-line global-require
  const dispatch = require('../drivers/foodDispatch.service');
  await dispatch.cancelDispatch(number, '');

  const order = await FoodOrder.findOne({ restaurantId, orderNumber: number });
  const before = order.delivery.method;
  const wasAssigned = driverAssigned(order);

  order.delivery.method = method;
  if (before !== method || !order.delivery.methodChosenAt) order.delivery.methodChosenAt = new Date();
  order.dispatch.state = 'idle';
  order.dispatch.failureReason = '';

  let sent = null;
  if (method === 'driver') {
    const request = await requestFromDesk(order);
    sent = request.ok;
  } else {
    /* "We will do it ourselves." Whatever was asked of the desk before is
       withdrawn, and the record of it cleared so nothing reads a stale "sent". */
    if (before === 'driver') withdrawFromDesk(order);
    order.delivery.request = {
      to: '', sentAt: null, ok: false, messageSid: '', error: '', attempts: 0,
    };
  }

  await order.save();

  /* Everybody watching is told, and the diner's phone is nudged — but only when
     "assigned" became true just now, not on every retry of a message that had
     already gone. */
  // eslint-disable-next-line global-require
  const realtime = require('../../infrastructure/realtime/realtime');
  // eslint-disable-next-line global-require
  const notifier = require('../drivers/dispatch.notifier');
  realtime.toOrderParties(order, 'dispatch_update', dispatch.dispatchUpdate(order));
  if (!wasAssigned && driverAssigned(order)) {
    notifier.notifyCustomerOfDriverAssigned(order).catch(() => {});
  }

  return { ok: true, order, sent };
}

/**
 * "The delivery boy has taken it" — the restaurant's one move on an order it
 * arranged after the food is ready. Writes the time so the diner's page can say
 * when. Mutates `order` and does not save.
 *
 * Only reachable for an order the restaurant arranged (`partnerMovesFor` offers
 * it to nobody else), so there is no rider account to make the move.
 */
const markPickedUp = (order) => {
  order.delivery.pickedUpAt = new Date();
};

/**
 * Close an order the restaurant arranged as DELIVERED.
 *
 * Not the restaurant's move — see `partnerMovesFor` — but the DINER's, who
 * received the food, or the Lampose admin's, for one the diner never closed. Both
 * come through here so they mean exactly the same thing:
 *
 *   · the status, and who said so, are recorded
 *   · cash taken at the door is the moment a cash order is paid — the same rule
 *     the rider's own hand-over applies — and an online order, already paid, is
 *     left alone so `razorpay.paidAt` does not move to the doorstep
 *   · an order closed from `ready` (the restaurant never pressed "taken") still
 *     gets a pickup time, so its journey does not have a hole in it
 *
 * Restaurants are paid when an order reaches `delivered`, so this is the moment
 * money becomes owed to them. Mutates `order` and does not save.
 *
 * @param {object} order
 * @param {{by: 'customer'|'admin', note?: string}} who
 */
const markDelivered = (order, { by, note = '' }) => {
  const now = new Date();
  order.status = 'delivered';
  if (!order.delivery.pickedUpAt) order.delivery.pickedUpAt = now;
  order.delivery.deliveredAt = now;
  if (order.paymentMode === 'cod' && order.paymentStatus === 'pending') order.paymentStatus = 'paid';
  order.statusHistory.push({
    status: 'delivered', at: now, by, note: String(note).slice(0, 200),
  });
};

module.exports = {
  ARRANGEABLE,
  arrangeDelivery,
  markPickedUp,
  markDelivered,
  describeRequest,
  withdrawRequest: withdrawFromDesk,
  restaurantArrangedDelivery,
};
