/* ══════════════════════════════════════════════════════════════════════════
   Waking the three people an order concerns.

   The socket is how these messages arrive when an app is OPEN. This is how
   they arrive when it is not — and for a rider, "not open" is the ordinary
   case: a phone in a pocket on a scooter is locked, and an offer that only
   exists inside a websocket is an offer nobody sees.

   So every dispatch event goes out twice, on purpose: once through
   `realtime.js` for the screen that is already showing, and once through Expo
   for the phone that is not. The two are idempotent — the app keys on the
   order number, and receiving both is one offer, not two.

   ## Failure is logged, never thrown

   The same rule as `foodOrder.notifier.js`, and for a sharper reason here: a
   push that fails must not roll back a state transition that already
   committed. A rider IS assigned whether or not the diner's handset buzzed,
   and an exception thrown out of this file mid-assignment would leave an order
   with a rider on it and a dispatch session that never closed.

   ## The channel ids are shared with the apps, and must stay in step

   Android routes sound and importance by CHANNEL, not by payload. A channel
   the app created with default importance is silent no matter what is sent
   here — which on a rider's phone is the difference between a job and a missed
   job. The ids below are created by the Driver app in `app/_layout.tsx`; if
   you rename one, rename the other.
   ══════════════════════════════════════════════════════════════════════════ */
const { sendPush, pushReady, pushConfigProblem } = require('../../infrastructure/push/push');
const Driver = require('./driver.model');
const Customer = require('../customers/customer.model');

const BADGE = '🛵 [dispatch]';

/**
 * The offer channel, which is deliberately its own.
 *
 * A rider's phone gets two kinds of notification and they are not equally
 * urgent: an offer expires in fifteen seconds and must be able to ring through
 * Do Not Disturb; "you were paid" can wait. One channel for both means the
 * rider either silences the payouts or misses the work.
 */
const OFFER_CHANNEL = 'delivery-offers';
const JOB_CHANNEL = 'delivery-updates';
/** What the diner's phone uses. Matches the User App's existing order channel. */
const ORDER_CHANNEL = 'food-orders';

const rupees = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const km = (metres) => `${(Math.max(0, Number(metres) || 0) / 1000).toFixed(1)} km`;

/**
 * Send to every handset an account has registered, and never throw.
 *
 * `select('+devices')` is not needed on `app_drivers` — unlike the restaurant
 * model, `devices` is a plain path here — but the token list is filtered
 * anyway, because a document written before push existed has an empty array
 * and `sendPush([])` should not be a round trip.
 */
const ring = async (tokens, message, label) => {
  const result = { attempted: 0, sent: 0, failed: 0, reason: null };
  try {
    if (!pushReady()) {
      result.reason = pushConfigProblem() || 'push is not configured';
      return result;
    }
    const list = (tokens || []).filter(Boolean);
    result.attempted = list.length;
    if (!list.length) {
      result.reason = 'no handset is registered';
      return result;
    }
    const outcome = await sendPush(list, message);
    result.sent = outcome?.sent ?? 0;
    result.failed = outcome?.failed ?? 0;
  } catch (error) {
    /* Deliberately swallowed — see the header. */
    result.reason = error.message;
    console.error(`${BADGE} [${label}] push failed: ${error.message}`);
  }
  return result;
};

const driverTokens = async (driverId) => {
  const driver = await Driver.findOne({ driverId }).select('devices').lean();
  return (driver?.devices || []).map((d) => d.token);
};

const customerTokens = async (customerId) => {
  if (!customerId) return [];
  const customer = await Customer.findOne({ customerId }).select('devices').lean();
  return (customer?.devices || []).map((d) => d.token);
};

/**
 * "There is a job for you, and it expires."
 *
 * The body carries the two numbers a rider decides on — what it pays and how
 * far the pickup is — because that decision often happens on the lock screen
 * without the app ever coming to the front. A notification that said only "new
 * order" would force an unlock to learn something that fits in eight words.
 */
async function notifyDriverOfOffer(driverId, { order, distanceMeters, expiresInSeconds }) {
  const tokens = await driverTokens(driverId);
  return ring(tokens, {
    title: `New delivery · ${rupees(order.delivery?.earnings || 0)}`,
    body: `${km(distanceMeters)} to pickup · tap within ${expiresInSeconds}s`,
    data: {
      kind: 'delivery_offer',
      orderNumber: order.orderNumber,
      expiresInSeconds,
    },
    sound: 'default',
    channelId: OFFER_CHANNEL,
    priority: 'high',
    /* Expo drops a notification whose TTL passed before delivery. Matching it
       to the offer window means a phone that comes back online two minutes
       later does not buzz about a job that is long gone — which is the thing
       that teaches a rider to stop trusting the alerts. */
    ttl: expiresInSeconds,
  }, 'offer');
}

/** "That one is gone" — so a lock screen does not keep showing a dead offer. */
async function notifyDriverOfferClosed(driverId, orderNumber, reason) {
  const tokens = await driverTokens(driverId);
  return ring(tokens, {
    title: 'Offer closed',
    body: reason === 'timeout'
      ? 'The delivery was passed to another rider.'
      : 'That delivery is no longer available.',
    data: { kind: 'delivery_offer_closed', orderNumber },
    /* No sound. Nothing is being asked of the rider, and a noise for every
       expired offer is how an app ends up muted. */
    channelId: JOB_CHANNEL,
    priority: 'default',
  }, 'offer-closed');
}

/** "A rider is coming" — to the diner. */
async function notifyCustomerOfRider(order, driver) {
  const tokens = await customerTokens(order.customerId);
  return ring(tokens, {
    title: 'A rider is on the way 🛵',
    body: `${driver.name || 'Your rider'} is heading to the restaurant. `
      + `Share PIN ${order.deliveryOtp} at the door.`,
    data: {
      kind: 'food_order',
      orderNumber: order.orderNumber,
      status: order.status,
      dispatchState: 'assigned',
    },
    sound: 'default',
    channelId: ORDER_CHANNEL,
    priority: 'high',
  }, 'rider-assigned');
}

/**
 * "We are still looking" — to the diner, when a whole sweep found nobody.
 *
 * Worded as a delay rather than a failure, because it IS one: the order stands,
 * the kitchen is still cooking, and the dispatcher retries when the food is
 * ready. Telling somebody their order failed and then delivering it is worse
 * than saying nothing.
 */
async function notifyCustomerNoRider(order) {
  const tokens = await customerTokens(order.customerId);
  return ring(tokens, {
    title: 'Finding you a rider',
    body: 'Every rider nearby is busy. We are still looking and your food is being prepared.',
    data: {
      kind: 'food_order',
      orderNumber: order.orderNumber,
      dispatchState: 'unassigned',
    },
    channelId: ORDER_CHANNEL,
    priority: 'default',
  }, 'no-rider');
}

/**
 * "The kitchen could not take it" — to the diner.
 *
 * The one outcome the diner was never told about. A rejection ends the order:
 * nothing is cooked, no rider is sent, and prepaid money is flagged as owed
 * back — and until this existed the only sign of any of it was a
 * `dispatch_update` on a socket the User App deliberately does not hold on its
 * tracking screen. A student who put their phone down after ordering found out
 * by opening the app later, or by waiting for food that was never started.
 *
 * The kitchen's own sentence is carried when there is one, because "sold out
 * of biryani" and "we are closing early" are different things to somebody
 * deciding what to do next, and a generic apology answers neither. When the
 * restaurant gave no reason this says so plainly rather than inventing one.
 *
 * `kind: 'food_order'` and `orderNumber` are what the User App's push router
 * keys on — the same two the rider-assigned and hand-over notifications carry,
 * so a tap opens the order rather than the app's front door.
 */
async function notifyCustomerOfRejection(order) {
  const tokens = await customerTokens(order.customerId);
  const reason = String(order.rejectionReason || '').trim();

  return ring(tokens, {
    title: 'Your order was not accepted',
    body: reason
      ? `The restaurant could not take it: ${reason}`
      : 'The restaurant could not take this order. Nothing has been prepared.',
    data: {
      kind: 'food_order',
      orderNumber: order.orderNumber,
      status: 'rejected',
    },
    /* A sound, and the high priority band. This is not an update on an order
       that is still coming — it is the end of one somebody is waiting for, and
       the sooner they know the sooner they can order somewhere else. */
    sound: 'default',
    channelId: ORDER_CHANNEL,
    priority: 'high',
  }, 'rejected');
}

/** "Your food is on its way" / "It has arrived" — the two hand-overs. */
async function notifyCustomerOfHandover(order, moment) {
  const tokens = await customerTokens(order.customerId);
  const copy = moment === 'picked_up'
    ? {
      title: 'Your order is on its way 🛵',
      body: `${order.delivery?.driverName || 'Your rider'} has collected it. `
        + `Have PIN ${order.deliveryOtp} ready.`,
    }
    : {
      title: 'Delivered 🍽️',
      body: 'Enjoy your meal. Tap to rate the order.',
    };

  return ring(tokens, {
    ...copy,
    data: { kind: 'food_order', orderNumber: order.orderNumber, status: moment },
    sound: 'default',
    channelId: ORDER_CHANNEL,
    priority: 'high',
  }, `handover-${moment}`);
}

module.exports = {
  OFFER_CHANNEL,
  JOB_CHANNEL,
  ORDER_CHANNEL,
  notifyDriverOfOffer,
  notifyDriverOfferClosed,
  notifyCustomerOfRider,
  notifyCustomerNoRider,
  notifyCustomerOfRejection,
  notifyCustomerOfHandover,
};
