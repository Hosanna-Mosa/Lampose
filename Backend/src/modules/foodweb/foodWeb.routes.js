/* ══════════════════════════════════════════════════════════════════════════
   The website's food surface — lampose.com, not the apps.

   Mounted at /api/v2/food-web. One router, and the handlers live in SEPARATE
   controller files beside it rather than in one long module:

     catalogue.controller.js   the filter chips, the diet labels, the area
     kitchens.controller.js    the feed, and one kitchen
     dishes.controller.js      a menu, one dish, the popular strip
     coupons.controller.js     the offers at checkout
     checkout.controller.js    addresses with a verdict, and payment methods
     orders.controller.js      the orders list, and the tracking page
     insights.controller.js    the usuals and the month's spend
     foodWeb.shape.js          the one place a document becomes a card

   Each file is one screen's worth of questions, which is the grain the pages
   are written at — the checkout imports one module, the feed imports another,
   and neither drags the other's queries along with it.

   ## Why this is not more routes under /food-partners

   See the header of `foodWeb.shape.js`. In short: that router answers the
   MOBILE apps, in the apps' own field names, and the two sets of screens want
   different shapes. Keeping them apart means neither reply carries the
   other's fields, and a change to the website cannot break the Food-Partner
   app on a Friday.

   What is NOT duplicated is the part that decides who is visible in public —
   `LISTED` is imported from `foodDiscovery.controller.js`, never retyped.

   ## Three levels of access, and nothing in between

     public      the catalogue, the kitchens, the dishes, the payment methods.
                 A student compares kitchens before they have an account.

     optional    the coupons. `attachCustomerIfPresent` sets `req.customer`
                 when a token is sent and does nothing when it is not, so a
                 signed-out diner still sees the offers that apply to
                 everybody and a signed-in one also sees their own credit.

     customer    the addresses, the orders, the usuals, the spend. Everything
                 that is about ONE person is behind `requireCustomer`, and
                 every query additionally filters on their `customerId` —
                 the guard says who is asking, the filter says what they may
                 have. Neither alone is enough.

   ## Read-only, all of it

   There is not a single write in this router, and that is deliberate rather
   than unfinished. Placing an order, paying for it and cancelling it already
   exist under `/api/v2/food-partners/orders`, they are what the apps use, and
   they carry the dispatch and notification consequences that make an order
   real. A second `POST /orders` here would be a second way to create money
   and a second thing to keep correct.

   So the website READS through this router and WRITES through that one.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { requireCustomer, attachCustomerIfPresent } = require('../customers/customerAuth.middleware');

const { getCatalogue } = require('./catalogue.controller');
const { listKitchens, getKitchen } = require('./kitchens.controller');
const { listKitchenDishes, listPopularDishes, getDish } = require('./dishes.controller');
const { listCoupons } = require('./coupons.controller');
const { listAddresses, listPaymentMethods } = require('./checkout.controller');
const { listOrders, getOrder } = require('./orders.controller');
const { listUsuals, getSpend } = require('./insights.controller');

const router = express.Router();

/*
 * Every route here reads MongoDB, so the guard is mounted once on the router
 * rather than repeated on eleven lines. It answers a named 503 while the
 * connection is down, which is what stops a feed rendering "no kitchens
 * near you" during a database blip — an empty list and an outage look
 * identical to a page, and only one of them is worth telling somebody about.
 */
router.use(requireLamposeDb);

/* ── Public ─────────────────────────────────────────────────────────────── */

/** The feed's chrome: cuisines, diet labels, and the area for `?lat&lng`. */
router.get('/catalogue', getCatalogue);

/** The feed itself. */
router.get('/kitchens', listKitchens);

/*
 * BEFORE `/dishes/:dishId`, and the order is load bearing: Express matches in
 * declaration order, so a `/dishes/popular` declared after the parameter
 * route would be captured by it and answered with "that dish is not
 * available". The same trap `routes/index.js` documents for its own mounts.
 */
router.get('/dishes/popular', listPopularDishes);
router.get('/dishes/:dishId', getDish);

/* A kitchen and its menu. Two calls — see `kitchens.controller.js`. */
router.get('/kitchens/:kitchenId', getKitchen);
router.get('/kitchens/:kitchenId/dishes', listKitchenDishes);

/** What this kitchen accepts. Public: it changes what the cart may offer. */
router.get('/payment-methods', listPaymentMethods);

/* ── Public, but richer when signed in ──────────────────────────────────── */

/** Promos for everybody; the referral credit only for whoever owns it. */
router.get('/coupons', attachCustomerIfPresent, listCoupons);

/* ── The diner's own ────────────────────────────────────────────────────── */

/*
 * `requireCustomer` on each line rather than a `router.use` above them,
 * because the public routes are declared in the same file and a guard that
 * applied from a point downwards would be one reordering away from either
 * locking the feed or opening somebody's order history. Named on every route
 * it protects, it cannot be moved by accident.
 */
router.get('/addresses', requireCustomer, listAddresses);
router.get('/orders', requireCustomer, listOrders);
router.get('/orders/:reference', requireCustomer, getOrder);
router.get('/usuals', requireCustomer, listUsuals);
router.get('/spend', requireCustomer, getSpend);

module.exports = router;
