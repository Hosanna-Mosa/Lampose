/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/restaurant-admin — the restaurant OWNER's door into the console.

   The THIRD admin router in this module, and the only one whose caller is not
   a member of Lampose staff:

     foodAdmin.routes.js       staff approving restaurants        (`admins`)
     foodOrderAdmin.routes.js  staff reading every order, refunds (`admins`)
     restaurantAdmin.routes.js an OWNER working their own shop    (`food_restaurants`)

   The first two are gated by the capability table in `iam/iam.roles.js` and
   see every restaurant on the platform. This one is gated by
   `requireRestaurantAdmin` and sees exactly one — the shop in its own token.
   Nothing here can reach those handlers and nothing there can reach these:
   the two identities verify different `typ` claims and neither guard was
   taught about the other.

   v1 rather than v2 for the reason the two routers above give — it is part of
   the admin console's surface, and the console's own paths are v1 — even
   though the account behind it lives in the v2 collection. The alternative
   spelling would have put an owner's console under /api/v2 and the staff
   console under /api/v1 in the same browser tab.

   ## Almost every handler here is one the mobile app already uses

   Deliberately. See `restaurantAdmin.controller.js` — accepting an order is
   not a status field, it is a rider search, a dispatch cancellation, a refund
   flag and a push notification, and a second copy of that chain reached only
   from the web would drift from the first in silence. `requireRestaurantAdmin`
   sets `req.foodPartner` to the same document those handlers already read, so
   they run here unchanged.

   What is new in this module's controller is what is genuinely new: the
   sign-in that mints this session, and the day-at-a-glance the phone's
   dashboard never had room for.

   ## The order of the middleware

   `tagFoodPartnerRequest` first, so a blocked request and a 404 are as
   visible in the log as a successful one. Then `requireLamposeDb`, so a query
   issued while the connection is down answers immediately rather than
   buffering for ten seconds into a generic 500. Then `requireAuthConfig` and
   the guard. The same order as the other two routers in this module.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');
const multer = require('multer');

const { rateLimit } = require('../../shared/middleware/rateLimit');
const { requireLamposeDb, requireAuthConfig } = require('../../shared/middleware/requireDb');
const { tagFoodPartnerRequest } = require('./foodPartner.log');
const { requireRestaurantAdmin } = require('./restaurantAdmin.middleware');
const {
  login, summary, analytics, earnings,
  listPayoutAccounts, addPayoutAccount, activatePayoutAccount, removePayoutAccount,
  listPayouts, requestPayout,
} = require('./restaurantAdmin.controller');

/* The shared handlers. Each one is the SAME function the Food-Partner app
   calls, reached through a different door. */
const { getMe, updateMe, setAvailability } = require('./foodPartner.controller');
const {
  listMyOrders, getMyOrder, setOrderStatus, setDeliveryMethod,
} = require('./foodOrder.controller');
const {
  listMyProducts, createProduct, updateProduct, deleteProduct, setProductAvailability,
} = require('./foodMenu.controller');
const { uploadFoodPartnerImages, FOOD_UPLOAD_LIMITS } = require('./foodUpload.controller');

const router = express.Router();

/* Held in memory and streamed straight to Cloudinary — nothing uploaded here
   touches this server's disk. The ceiling is the upload controller's, read
   from it rather than restated, so the multer limit and the handler's own
   check cannot disagree. */
const imageUpload = multer({ storage: multer.memoryStorage(), limits: FOOD_UPLOAD_LIMITS });

/** The identifier a limiter counts against, however the body spells it. */
const identifierOf = (req) => {
  const body = req.body || {};
  const raw = String(body.identifier || body.email || body.phone || '').trim().toLowerCase();
  return raw || req.ip;
};

/* Two limiters on sign-in, as `admin.routes.js` and the app's own login both
   have: one by address, to slow a scan across many accounts, and a tighter
   one by identifier, to slow a guess at one password. An office behind a
   single address is plausible; ten attempts at one account in a quarter of an
   hour is not. */
const loginByIp = rateLimit({ name: 'restaurant-admin-login-ip', windowMs: 15 * 60 * 1000, max: 30 });
const loginByIdentifier = rateLimit({
  name: 'restaurant-admin-login-id', windowMs: 15 * 60 * 1000, max: 10, keyOf: identifierOf,
});

router.use(tagFoodPartnerRequest);

/* ── Public ──────────────────────────────────────────────────────────────── */

router.post('/login', loginByIp, loginByIdentifier, requireLamposeDb, requireAuthConfig, login);

/* ── Everything below needs a Restaurant Admin session ───────────────────── */

const session = [requireLamposeDb, requireAuthConfig, requireRestaurantAdmin];

/* The shop itself. */
router.get('/summary', session, summary);

/* How the trade is going, and what it has earned.

   `earnings` rather than `payouts`, and the name is load bearing: there is no
   food settlement ledger in this system, so nothing here can say an amount
   was PAID. See the controller's own header — the route reports what was
   earned and refuses to imply the rest. */
router.get('/analytics', session, analytics);
router.get('/earnings', session, earnings);

/* ── Money: asking for it, and saying where it goes ──────────────────────

   `/payouts` is the balance and the history; `/payouts/request` is the
   button. Only the request is rate-limited, and only it needs to be: the
   reads cost a couple of indexed aggregations, while a request writes a row
   that a person then has to act on, and a button held down should not fill
   a staff queue. Six an hour is the ceiling `partner.routes.js` puts on the
   Stay side's equivalent press. */
const payoutRequestLimit = rateLimit({
  name: 'restaurant-payout-request',
  windowMs: 60 * 60 * 1000,
  max: 6,
  keyOf: (req) => (req.restaurantAdmin && req.restaurantAdmin.restaurantId) || req.ip,
});

router.get('/payouts', session, listPayouts);
router.post('/payouts/request', session, payoutRequestLimit, requestPayout);

/* The saved bank accounts.

   These four are the ONE exception to `PATCH /me` refusing `payout`, and
   they are separate routes precisely so that refusal stands: the whitelist
   on `/me` still answers NEEDS_REVERIFICATION, and repointing settlements is
   reachable only by asking for it by name. The controller's own section
   header records that letting an owner do this at all was a decision, what
   it costs, and what stands in place of the protection it removed. */
router.get('/payout-accounts', session, listPayoutAccounts);
router.post('/payout-accounts', session, addPayoutAccount);
router.patch('/payout-accounts/:accountId/activate', session, activatePayoutAccount);
router.delete('/payout-accounts/:accountId', session, removePayoutAccount);

/* ── The shop record ─────────────────────────────────────────────────── */
router.get('/me', session, getMe);
router.patch('/me', session, updateMe);
router.patch('/me/availability', session, setAvailability);

/* The orders. `setOrderStatus` is the one that carries the consequences —
   see the file header and the controller's. */
router.get('/orders', session, listMyOrders);
router.get('/orders/:orderNumber', session, getMyOrder);
router.patch('/orders/:orderNumber/status', session, setOrderStatus);
/* Who delivers it: its own person, or a Lampose driver asked for on WhatsApp.
   Chosen with the accept, and available here for choosing afterwards or
   resending a message that did not go out. Console-only — see
   `foodDelivery.service.js`. */
router.patch('/orders/:orderNumber/delivery', session, setDeliveryMethod);

/* The menu, in full: add, edit, retire, and flip an item in or out of stock.
   `/menu/:productId/availability` is declared before nothing it could shadow
   — Express matches in order, and the two-segment path cannot be swallowed by
   the one-segment `/menu/:productId` above it whatever the order — but it is
   kept beside its siblings for reading rather than moved for safety. */
router.get('/menu', session, listMyProducts);
router.post('/menu', session, createProduct);
router.patch('/menu/:productId', session, updateProduct);
router.patch('/menu/:productId/availability', session, setProductAvailability);
router.delete('/menu/:productId', session, deleteProduct);

/* Photographs for a menu item or for the shop's own logo and banner.
   A route of its own rather than a third branch inside the app's
   `requireFoodPartnerOrVerifiedPhone`: that guard accepts a partner session
   and a phone proof, and teaching it a third identity would put one
   middleware in charge of choosing between three unrelated identity systems.
   The audiences stay apart and the ROUTES differ — the same reasoning
   `foodPartner.routes.js` applies to its onboarding-upload route. The handler
   folders by `req.foodPartner`, which the guard above has set. */
router.post(
  '/uploads/images',
  requireAuthConfig,
  requireRestaurantAdmin,
  imageUpload.array('images', FOOD_UPLOAD_LIMITS.files),
  uploadFoodPartnerImages,
);

module.exports = router;
