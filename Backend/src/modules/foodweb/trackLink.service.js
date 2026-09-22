/* ══════════════════════════════════════════════════════════════════════════
   The link in "your order is placed" — one order, no sign-in, read only.

   The WhatsApp a diner gets the moment their order is real carries a link to
   the tracking page. Without a code that link is a sign-in wall: the tracking
   route is `requireCustomer`, and a link opened from WhatsApp usually lands in
   an in-app browser that holds no session — the same trap the RESTAURANT link
   was built for (`foodpartners/orderLink.service.js`, which this borrows its
   HMAC from). A diner who has just paid, watching a bag come across town, is
   the last person who should be asked for a password.

   ## What it can do, and what it deliberately cannot

   READ one order. That is all. The middleware sets `req.customer` for the one
   order named in the path and nothing else, so the same handler the signed-in
   page uses runs unchanged and returns exactly what that diner would see.

   It does NOT open the orders list, the addresses, the saved cards or the
   "I got it" button — `confirmDelivered` closes an order and pays a restaurant,
   and a forwarded link must never be able to do that. Those routes keep
   `requireCustomer` alone, so a token on them is simply ignored.

   ## The code

   An HMAC of the order number under the server's signing secret, truncated to
   22 base64url characters — 132 bits. Nothing is stored; the server recomputes
   and compares in constant time. A different PURPOSE string from the owner's
   link means the two codes for one order are different values, so neither can
   be used where the other belongs.

   Twenty-four hours from when the order was PLACED (`ORDER_LINK_TTL_HOURS`,
   shared with the owner's link). An order is a thing that happens within the
   hour; a link that outlives the food is only a longer window for a forwarded
   message. After that the page asks them to sign in, which still works and
   shows every order they have ever placed.

   ## A stale code does not lock anybody out

   If the code is wrong or expired the request falls through to `requireCustomer`
   rather than being refused. A diner who is signed in and taps yesterday's link
   sees their order; one who is not is asked to sign in, which is where they
   were before this file existed.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodOrder = require('../foodpartners/foodOrder.model');
const { hmacCode, sameCode, ttlHours } = require('../foodpartners/orderLink.service');
const { requireCustomer } = require('../customers/customerAuth.middleware');

/** Bumped only if the recipe changes, so an old link fails cleanly rather than matching a new one. */
const PURPOSE = 'diner-order-link/v1';

/** `token` and not `t`: the request logger redacts this name, so it never reaches a log file. */
const PARAM = 'token';

/** Where the public site lives — the same variable the visit messages link with. */
const siteUrl = () => String(process.env.PUBLIC_SITE_URL || 'https://lampose.com').trim().replace(/\/+$/, '');

/** The code for one order, or null when the server has no signing secret. */
const codeFor = (orderNumber) => (orderNumber ? hmacCode(PURPOSE, orderNumber) : null);

/**
 * The full tracking URL for a message — `…/food/orders/LO828483?token=Ab3…`.
 *
 * Without a code it is the plain address, which still works for a diner who is
 * signed in; the message is worth sending either way. The reference is encoded
 * even though it is `LO` plus six characters today, because a link builder that
 * trusts its input is one id-format change from a broken URL.
 */
const trackUrl = (orderNumber) => {
  const number = encodeURIComponent(String(orderNumber || ''));
  const code = codeFor(orderNumber);
  return `${siteUrl()}/food/orders/${number}${code ? `?${PARAM}=${code}` : ''}`;
};

/** Does this request carry the right, unexpired code for the order it names? */
const opensWithCode = async (req) => {
  const given = req.query ? req.query[PARAM] : null;
  if (!given) return null;

  const orderNumber = String(req.params.reference || '').trim();
  if (!sameCode(given, codeFor(orderNumber))) return null;

  /* Read AFTER the code matches, so a wrong code costs no database work and
     cannot be used to ask whether an order number exists. */
  const order = await FoodOrder.findOne({ orderNumber }).select('customerId placedAt').lean();
  if (!order) return null;

  const age = Date.now() - new Date(order.placedAt).getTime();
  if (age > ttlHours() * 60 * 60 * 1000) return null;

  return order;
};

/**
 * The tracking page's guard: a valid code, or a session, in that order.
 *
 * On a code it sets `req.customer` to the diner the order belongs to, which is
 * what lets `getOrder` run untouched — it filters on `customerId` AND the
 * reference in the path, so the code opens that one order and no other.
 */
async function customerOrTrackLink(req, res, next) {
  try {
    const order = await opensWithCode(req);
    if (order) {
      req.customer = { customerId: order.customerId };
      req.orderTrackLink = { orderNumber: String(req.params.reference || '').trim() };
      return next();
    }
  } catch (error) {
    /* A database hiccup here must not turn into a 500 on a page that a session
       would have opened perfectly well. Fall through and ask for one. */
    return requireCustomer(req, res, next);
  }
  return requireCustomer(req, res, next);
}

module.exports = { PURPOSE, PARAM, codeFor, trackUrl, siteUrl, customerOrTrackLink };
