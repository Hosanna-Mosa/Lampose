/* ══════════════════════════════════════════════════════════════════════════
   The link in "you have a new order" — one order, no sign-in.

   The WhatsApp an owner gets carries a link. Making it open the console meant
   asking them to sign in first, and that is where it fell apart: a link opened
   from WhatsApp often lands in an in-app browser that keeps nothing between
   openings, so every new order asked for the password again — on a phone, in a
   kitchen, with the food waiting. A sign-in that cannot be remembered is not a
   sign-in anybody will do for each order.

   So the link proves itself. It carries a code that is good for THAT order and
   nothing else, and the page it opens can view that one order and move it
   through its states — the same handlers the console uses, so nothing about
   what an owner can DO to an order changes. What it cannot do is anything that
   is not that order: no queue, no menu, no earnings, no payout account. Those
   still need the password.

   ## The code

   An HMAC of `restaurantId | orderNumber` under the server's signing secret,
   truncated to 22 base64url characters — 132 bits, not guessable. Nothing is
   stored: the server recomputes it and compares in constant time, so there is
   no table of links to leak, and an order the code was not minted for fails
   however the number is edited. Rotating `JWT_SECRET` revokes every link at
   once, which is the right blunt instrument if one ever leaks.

   Deterministic, so the same order always gets the same link. That is a feature
   here: the alert may be resent, and an owner who has the first message and the
   second should not find that only one of them works.

   ## How long it lives

   Twenty-four hours from when the order was PLACED (`ORDER_LINK_TTL_HOURS`).
   Not from when the message was sent, and not from first use — an order is a
   thing that happens in the next hour, and a link that outlives the food is
   only a longer window for a forwarded message to be used by somebody it was
   not for. After that it says so and points at the console.

   Past a closed order the state machine is the guard: a delivered, refused or
   cancelled order has no moves left, and the link cannot invent one.

   ## What a leaked link is worth

   The message goes to the owner's own WhatsApp, and the most a copy can do is
   what the owner could: accept, refuse or progress ONE order, and read that
   order's items, address and phone for a day. That is why it is scoped this
   narrowly instead of minting a console session — a session from a forwarded
   message would be the whole restaurant, payout account included.

   ## Failures are 403 and 410, never 401

   The console treats any 401 as "your session ended" and signs the person out
   (`api:unauthorized`). A bad link must not sign somebody out of the console
   they are using in another tab, so a link that is wrong is a 403 and one that
   has expired is a 410.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');

const config = require('../../config/env');
const FoodOrder = require('./foodOrder.model');
const FoodRestaurant = require('./foodRestaurant.model');

/** Bumped only if the recipe changes, so an old link fails cleanly instead of matching a new one. */
const PURPOSE = 'restaurant-order-link/v1';
const CODE_LENGTH = 22;

/** The query-string name. `token` is on the request logger's redaction list, so it never reaches a log. */
const PARAM = 'token';

const ttlHours = () => Number(process.env.ORDER_LINK_TTL_HOURS) || 24;

/**
 * The code for one order, or null when the server has no signing secret (the
 * same production-only condition that turns sign-in off). Callers treat null as
 * "no link can be made" and fall back to the plain, sign-in link.
 */
const codeFor = (restaurantId, orderNumber) => (
  restaurantId && orderNumber ? hmacCode(PURPOSE, restaurantId, orderNumber) : null
);

/**
 * The recipe, shared with the DINER's tracking link (`foodweb/trackLink.service.js`).
 *
 * Two links exist for one order — the owner's, which can move it, and the
 * diner's, which can only read it — and they must not be the same string. The
 * PURPOSE is what keeps them apart: the same secret and the same order number
 * produce different codes under different purposes, so a diner's link cannot be
 * retyped into the console's route and vice versa. One implementation of the
 * HMAC because two would drift, and a drift here is silent.
 */
function hmacCode(purpose, ...parts) {
  if (!config.auth.configured) return null;
  return crypto
    .createHmac('sha256', config.auth.jwtSecret)
    .update([purpose, ...parts].join('|'))
    .digest('base64url')
    .slice(0, CODE_LENGTH);
}

/** Constant-time comparison; a code of the wrong length is a mismatch, not an error. */
const sameCode = (given, expected) => {
  if (!expected) return false;
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * What goes after `?order=` in the link: the order number, then the code.
 * `LO241045&token=Ab3…` — also the exact suffix the button template appends to
 * its fixed address. Just the order number when no code can be made.
 */
const linkSuffix = (restaurantId, orderNumber) => {
  const number = encodeURIComponent(orderNumber);
  const code = codeFor(restaurantId, orderNumber);
  return code ? `${number}&${PARAM}=${code}` : number;
};

const refuse = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

/**
 * Lets a request through as the restaurant that owns the order in `:orderNumber`,
 * when — and only when — it carries that order's code.
 *
 * Sets the same two names `requireRestaurantAdmin` does, so the shared order
 * handlers run unchanged. They scope every lookup to `req.foodPartner` AND the
 * order number in the path, which is what pins a link to its one order: the
 * code that opened LO1 cannot be pointed at LO2, because LO2's code is a
 * different value and the handler would look it up under this restaurant.
 *
 * One answer for "no such order" and "wrong code": a link that reveals whether
 * an order number exists is a way of counting orders.
 */
async function requireOrderLink(req, res, next) {
  try {
    if (!config.auth.configured) {
      return refuse(res, 503, 'AUTH_NOT_CONFIGURED', 'Order links are unavailable right now.');
    }

    const orderNumber = String(req.params.orderNumber || '').trim();
    const invalid = () => refuse(res, 403, 'LINK_INVALID', 'This link is not valid.');

    const order = await FoodOrder.findOne({ orderNumber }).select('restaurantId placedAt').lean();
    if (!order) return invalid();

    if (!sameCode(req.query[PARAM], codeFor(order.restaurantId, orderNumber))) return invalid();

    const age = Date.now() - new Date(order.placedAt).getTime();
    if (age > ttlHours() * 60 * 60 * 1000) {
      return refuse(
        res, 410, 'LINK_EXPIRED',
        'This link has expired. Sign in to the restaurant console to see the order.',
      );
    }

    const restaurant = await FoodRestaurant.findOne({ restaurantId: order.restaurantId });
    if (!restaurant) return invalid();

    /* A rejected account gets the same refusal the console gives it. */
    if (restaurant.verificationStatus === 'rejected') {
      return refuse(res, 403, 'ACCOUNT_REJECTED', 'This application was not approved. Please contact Lampose.');
    }

    req.restaurantAdmin = restaurant;
    req.foodPartner = restaurant;
    req.orderLink = { orderNumber };
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  PARAM, CODE_LENGTH, ttlHours, codeFor, sameCode, linkSuffix, requireOrderLink, hmacCode,
};
