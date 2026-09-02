/* ══════════════════════════════════════════════════════════════════════════
   Telling a kitchen an order has arrived.

   This is the one notification in the product that somebody is standing and
   waiting for. A stay request can be read in an hour; an order that nobody
   notices for ten minutes is a cold meal and a refund, so it is sent
   immediately, to every handset the restaurant has registered, and it asks
   the device to make a noise.

   ## Why the sound is named here and not left to the app

   Expo's push payload carries `sound`, and Android additionally routes by
   CHANNEL — a channel with its own importance and its own tone, created by
   the app at startup. Both have to agree or the alert arrives silent on
   Android, which is the platform every one of these kitchens is on. So the
   channel id lives here beside the sound, and the partner app creates a
   channel with exactly this id. If you rename one, rename the other.

   ## Failure is logged, never thrown

   A push that cannot be delivered must not fail the order. The diner has paid
   and the row is written; a restaurant that missed the ping still sees the
   order the moment it opens the app, and the Orders tab polls. So every path
   here resolves, and a problem is printed through the module's own logger
   rather than raised.
   ══════════════════════════════════════════════════════════════════════════ */
const { sendPush, pushReady, pushConfigProblem } = require('../../infrastructure/push/push');
const FoodRestaurant = require('./foodRestaurant.model');
const { BADGE } = require('./foodPartner.log');
const realtime = require('../../infrastructure/realtime/realtime');

/**
 * The Android channel the partner app must create with the same id.
 *
 * Kept in step with `Food-Partner/app/_layout.tsx`. On Android 8 and later the
 * channel — not the payload — decides whether a notification makes a sound,
 * and a channel created with default importance is silent no matter what this
 * sends.
 */
const ORDER_CHANNEL = 'food-orders';

/** Expo plays the device default for `'default'`. */
const ORDER_SOUND = 'default';

const rupees = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

/**
 * A one-line summary of what was ordered.
 *
 * The lock screen gets about two lines, and "3 items" tells a cook nothing
 * they can start on. The first dish by name plus a count is what actually
 * helps somebody decide whether to walk to the pass.
 */
const summarise = (lines = []) => {
  if (!lines.length) return 'A new order is waiting.';
  const first = `${lines[0].quantity}× ${lines[0].productName}`;
  const rest = lines.length - 1;
  return rest > 0 ? `${first} and ${rest} more item${rest === 1 ? '' : 's'}` : first;
};

/**
 * Ring every handset signed in to this restaurant.
 *
 * Resolves either way — see the header. Returns a small report so the caller
 * can log whether anybody was actually reachable, which is the difference
 * between "the kitchen ignored it" and "the kitchen was never told".
 */
async function notifyRestaurantOfOrder(order) {
  const result = { attempted: 0, sent: 0, failed: 0, reason: null, live: false };

  /*
   * The socket first, and it is not a duplicate of the push.
   *
   * A push reaches a handset that is asleep and needs a registered device
   * token to do it. `order_placed` reaches a tablet that is AWAKE — which is
   * how a kitchen actually runs, face-up on a counter — and needs nothing but
   * the session the app already holds.
   *
   * That distinction was not academic: the first restaurant in production had
   * ZERO registered handsets, because `getPushToken` returns null on a
   * simulator and on a refused permission, so every order arrived in total
   * silence and the kitchen found out on the twenty-second poll. This is the
   * path that does not depend on any of that.
   *
   * Emitted BEFORE the push and outside its `pushReady()` guard, deliberately:
   * a deployment with no Expo credentials still has a working socket, and the
   * old code returned early and told the kitchen nothing at all.
   */
  try {
    /* The RETURN VALUE, not the absence of a throw. `emit` answers `false`
       when no socket server is attached rather than raising — a deployment
       without socket.io degrades to polling by design — so assuming success
       here would have the log line claim a live event on exactly the
       deployments that never sent one. */
    result.live = realtime.toRestaurant(order.restaurantId, 'order_placed', {
      orderNumber: order.orderNumber,
      grandTotal: order.grandTotal,
      itemCount: (order.lines || []).length,
      summary: summarise(order.lines),
      placedAt: order.placedAt || new Date().toISOString(),
    }) === true;
  } catch (error) {
    /* Socket.io absent, or no listener attached. The push and the poll both
       still stand. */
    console.warn(`${BADGE} [Order Alert] ${order.orderNumber} live emit failed: ${error.message}`);
  }

  try {
    if (!pushReady()) {
      result.reason = pushConfigProblem() || 'push is not configured';
      console.warn(`${BADGE} [Order Alert] not sent — ${result.reason}`);
      return result;
    }

    /* `devices` is `select: false` on the model, so it has to be asked for. */
    const restaurant = await FoodRestaurant.findOne({ restaurantId: order.restaurantId })
      .select('+devices restaurantName')
      .lean();

    const tokens = (restaurant?.devices || []).map((d) => d.token).filter(Boolean);
    result.attempted = tokens.length;

    if (!tokens.length) {
      result.reason = 'no handset is registered to this restaurant';
      console.warn(
        `${BADGE} [Order Alert] ${order.orderNumber} — ${result.reason}. ` +
        'The order is saved; the partner sees it on their next open.',
      );
      return result;
    }

    const outcome = await sendPush(tokens, {
      title: `New order · ${rupees(order.grandTotal)}`,
      body: summarise(order.lines),
      /* What the app routes on when the notification is tapped. */
      data: {
        kind: 'food_order',
        orderNumber: order.orderNumber,
        restaurantId: order.restaurantId,
      },
      sound: ORDER_SOUND,
      channelId: ORDER_CHANNEL,
      priority: 'high',
    });

    result.sent = outcome?.sent ?? 0;
    result.failed = outcome?.failed ?? 0;

    console.log(
      `${BADGE} [Order Alert] ${order.orderNumber} → ${result.sent}/${tokens.length} handset(s) ` +
      `at ${restaurant?.restaurantName || order.restaurantId}` +
      `${result.live ? ' · live event sent' : ''}`,
    );
  } catch (error) {
    /* Deliberately swallowed. See the header: a failed ping must not undo a
       paid order. */
    result.reason = error.message;
    console.error(`${BADGE} [Order Alert] ${order.orderNumber} failed: ${error.message}`);
  }

  return result;
}

module.exports = { notifyRestaurantOfOrder, ORDER_CHANNEL, ORDER_SOUND, summarise };
