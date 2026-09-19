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

   ## Three channels, because each one fails differently

     socket    reaches a tablet that is AWAKE on the counter. Needs nothing
               but the session the app holds — and needs the app to be open.
     push      reaches a handset that is asleep. Needs a registered device
               token, which the first restaurant in production did not have.
     WhatsApp  reaches the phone in the owner's pocket whether or not they
               have our app open, installed, or signed in.

   The third is the one that works when the other two have quietly stopped.
   It carries a link straight to the order in the restaurant console, so the
   owner goes from the buzz to the Accept button without navigating.

   ## Failure is logged, never thrown

   A push that cannot be delivered must not fail the order. The diner has paid
   and the row is written; a restaurant that missed the ping still sees the
   order the moment it opens the app, and the Orders tab polls. So every path
   here resolves, and a problem is printed through the module's own logger
   rather than raised.

   The WhatsApp is sent the same way and for a sharper reason: it talks to a
   third party over the network, which is the slowest and least reliable step
   in placing an order. It is NOT awaited by the caller's critical path — see
   below — so a Twilio outage cannot hold up a diner's checkout.
   ══════════════════════════════════════════════════════════════════════════ */
const { sendPush, pushReady, pushConfigProblem } = require('../../infrastructure/push/push');
const FoodRestaurant = require('./foodRestaurant.model');
const { BADGE } = require('./foodPartner.log');
const realtime = require('../../infrastructure/realtime/realtime');
const config = require('../../config/env');
const { sendFoodOrderAlert } = require('../../infrastructure/twilio/twilio');

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
 * A link that opens THIS order in the restaurant console.
 *
 * `#restaurant-orders/LO123456` — the console's hash router reads the
 * segment after the tab as the order to open, and drops straight into its
 * detail with the Accept button on screen. See `RestaurantConsole` in
 * `Admin/src/App.tsx`.
 *
 * Returns null when `RESTAURANT_CONSOLE_URL` is unset, and the message then
 * goes without a link rather than with a broken one — a kitchen that taps a
 * localhost address once does not tap the next one. The order number is
 * encoded even though it is always `LO` plus digits today: a link builder
 * that trusts its input is one id-format change away from a broken URL.
 */
const orderLink = (orderNumber) => {
  const base = config.restaurantConsoleUrl;
  if (!base) return null;
  /*
   * `?order=` and not `#restaurant-orders/`.
   *
   * The WhatsApp button's URL is built the same way — a fixed prefix in the
   * approved template plus this order number as the suffix — and a fragment
   * is the part of a URL that link handlers mangle. WhatsApp and the in-app
   * browsers that open from it are not where you want to discover whether
   * `#` survives. The console reads both spellings; this is the one that
   * travels.
   */
  return `${base}/?order=${encodeURIComponent(orderNumber)}`;
};

/**
 * WhatsApp the owner. Resolves either way — see the header.
 *
 * Separated from the push so one failing does not skip the other: they had
 * been in one `try` and a Twilio timeout would have taken the push with it.
 */
async function whatsappTheOwner(order, restaurant) {
  const phone = restaurant && restaurant.ownerPhone;
  if (!phone) {
    return { sent: false, reason: 'no owner phone on the restaurant' };
  }

  try {
    const res = await sendFoodOrderAlert({
      restaurantPhone: phone,
      restaurantName: restaurant.restaurantName,
      orderNumber: order.orderNumber,
      amount: rupees(order.grandTotal),
      summary: summarise(order.lines),
      /* Both spellings of the same destination. The button template needs
         only the suffix — its prefix is baked in and Meta-approved — while
         the text template and the plain-text fallback need the whole URL.
         The sender picks; see its header. */
      link: orderLink(order.orderNumber),
      linkSuffix: order.orderNumber,
    });

    if (res && res.success) {
      console.log(
        `${BADGE} [Order Alert] ${order.orderNumber} → WhatsApp ${maskTail(phone)} ` +
        `(${res.messageSid || 'sent'})`,
      );
      return { sent: true, reason: null };
    }
    const reason = (res && res.error) || 'the message was not accepted';
    console.warn(`${BADGE} [Order Alert] ${order.orderNumber} WhatsApp failed: ${reason}`);
    return { sent: false, reason };
  } catch (error) {
    /* Swallowed, like every other path here. A kitchen that missed a
       WhatsApp still has the socket, the push and the queue. */
    console.warn(`${BADGE} [Order Alert] ${order.orderNumber} WhatsApp threw: ${error.message}`);
    return { sent: false, reason: error.message };
  }
}

/** "…3210" — enough to tell two numbers apart in a log, not enough to dial. */
const maskTail = (phone) => `…${String(phone || '').slice(-4)}`;

/**
 * Ring every handset signed in to this restaurant.
 *
 * Resolves either way — see the header. Returns a small report so the caller
 * can log whether anybody was actually reachable, which is the difference
 * between "the kitchen ignored it" and "the kitchen was never told".
 */
async function notifyRestaurantOfOrder(order) {
  const result = { attempted: 0, sent: 0, failed: 0, reason: null, live: false, whatsapp: false };

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

    /* `devices` is `select: false` on the model, so it has to be asked for.
       `ownerPhone` rides along for the WhatsApp below — one read, not two. */
    const restaurant = await FoodRestaurant.findOne({ restaurantId: order.restaurantId })
      .select('+devices restaurantName ownerPhone')
      .lean();

    /*
     * WhatsApp, started HERE and not awaited.
     *
     * Started before the push so the two overlap rather than queue, and left
     * un-awaited because this whole function IS awaited by the checkout path
     * — `foodCustomerOrder.controller.js` waits for it before answering the
     * diner. A Twilio call that takes four seconds would be four seconds a
     * diner stares at a spinner after their money has already left.
     *
     * `result.whatsapp` is therefore "we tried", not "it arrived". The log
     * line inside `whatsappTheOwner` is where the outcome is recorded.
     */
    if (restaurant) {
      result.whatsapp = true;
      whatsappTheOwner(order, restaurant).catch(() => {});
    }

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

module.exports = {
  notifyRestaurantOfOrder, ORDER_CHANNEL, ORDER_SOUND, summarise, orderLink,
};
