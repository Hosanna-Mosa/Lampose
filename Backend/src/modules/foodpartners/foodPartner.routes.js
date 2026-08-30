/* ══════════════════════════════════════════════════════════════════════════
   /api/v2/food-partners — the restaurant partner app.

   ## What is public, and why each public route is rate-limited

   Three routes are anonymous and every one of them costs something real: the
   two OTP routes send an SMS we pay for, and the application POST writes a
   restaurant and its whole menu. Each gets TWO ceilings, matching
   `partners.routes.js` and for the same reasons:

     by IP     stops one script working through a list of numbers.
     by phone  stops a distributed set of addresses hammering ONE number,
               which is the shape of an SMS-bombing attack — the victim is the
               person whose handset rings, not us.

   The per-phone limits are the cheap first line; the server's own cooldown in
   the controller, enforced against the stored code's age, is the real one,
   because it survives a restart and applies across instances.

   ## What is behind a session

   Everything under `/me`. A restaurant's payout account, its documents and its
   customers' addresses are the most sensitive data this module holds, and
   `requireFoodPartner` additionally refuses a token whose restaurant has been
   rejected — with its own code, so the app can send them to the status screen
   rather than to a login form that will not help.

   ## What is deliberately NOT here

   The approval queue. Deciding an application belongs to the admin console and
   lives in `foodAdmin.routes.js` behind `verifyAdminToken`, a different
   identity system entirely. No handler on this router can set
   `verificationStatus` or `isActive`, which is what makes "approved" mean
   something.

   The logger's tag middleware is mounted FIRST, before everything, so nothing
   this module answers is invisible in the console.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');
const multer = require('multer');

const { rateLimit } = require('../../shared/middleware/rateLimit');
const { requireAuthConfig, requireLamposeDb } = require('../../shared/middleware/requireDb');

const {
  startPhoneOtp, verifyPhoneOtp, submitApplication,
  login, getMe, updateMe, setAvailability,
} = require('./foodPartner.controller');
const {
  listMyProducts, createProduct, updateProduct, deleteProduct, setProductAvailability,
} = require('./foodMenu.controller');
const { listMyOrders, getMyOrder, setOrderStatus } = require('./foodOrder.controller');
const {
  placeOrder, listMyOrders: listCustomerOrders, getMyOrder: getCustomerOrder, cancelMyOrder,
} = require('./foodCustomerOrder.controller');
const { requireCustomer } = require('../customers/customerAuth.middleware');
const {
  registerFoodPartnerDevice, unregisterFoodPartnerDevice,
} = require('../notifications/device.controller');
const { listRestaurants, getRestaurant, getProduct } = require('./foodDiscovery.controller');
const {
  uploadFoodPartnerImages, FOOD_UPLOAD_LIMITS,
} = require('./foodUpload.controller');
const {
  requireFoodPartner, requireFoodPartnerOrVerifiedPhone,
} = require('./foodPartnerAuth.middleware');
const { tagFoodPartnerRequest } = require('./foodPartner.log');

const router = express.Router();

/* Held in memory and streamed straight to Cloudinary — nothing a partner
   uploads touches this server's disk. The ceiling is the upload controller's,
   read from it rather than restated, so the multer limit and the handler's own
   check cannot disagree. */
const imageUpload = multer({ storage: multer.memoryStorage(), limits: FOOD_UPLOAD_LIMITS });

/** The phone a limiter should count against, however the body spells it. */
const phoneOf = (req) => String((req.body && (req.body.phone || req.body.ownerPhone)) || '').replace(/\D/g, '').slice(-10);

const byIp = (name, windowMs, max) => rateLimit({ name, windowMs, max });
const byPhone = (name, windowMs, max) => rateLimit({ name, windowMs, max, keyOf: phoneOf });

/* Everything below is logged with the module's badge. First, so a blocked
   request and a 404 are as visible as a successful one. */
router.use(tagFoodPartnerRequest);

/* ── Public: onboarding ──────────────────────────────────────────────────── */

router.post(
  '/auth/otp/start',
  byIp('fp-otp-start-ip', 15 * 60 * 1000, 20),
  byPhone('fp-otp-start-phone', 15 * 60 * 1000, 5),
  requireLamposeDb,
  startPhoneOtp,
);

router.post(
  '/auth/otp/verify',
  byIp('fp-otp-verify-ip', 15 * 60 * 1000, 40),
  byPhone('fp-otp-verify-phone', 15 * 60 * 1000, 10),
  requireLamposeDb,
  verifyPhoneOtp,
);

/* The big one: a restaurant and its entire menu in one body. Limited harder
   by phone than by IP, because a whole office applying from one address is
   plausible and one number applying five times in an hour is not. */
router.post(
  '/applications',
  byIp('fp-apply-ip', 60 * 60 * 1000, 30),
  byPhone('fp-apply-phone', 60 * 60 * 1000, 5),
  requireLamposeDb,
  requireAuthConfig,
  submitApplication,
);

router.post(
  '/auth/login',
  byIp('fp-login-ip', 15 * 60 * 1000, 30),
  requireLamposeDb,
  requireAuthConfig,
  login,
);

/* ── Uploads ─────────────────────────────────────────────────────────────── */

/* Reachable by a signed-in partner OR by somebody mid-application holding a
   phone-verification token: a restaurant that does not exist yet still has to
   attach a photograph of a licence. */
router.post(
  '/uploads/images',
  requireAuthConfig,
  requireFoodPartnerOrVerifiedPhone,
  imageUpload.array('images', FOOD_UPLOAD_LIMITS.files),
  uploadFoodPartnerImages,
);

/* ── The signed-in restaurant ────────────────────────────────────────────── */

router.get('/me', requireLamposeDb, requireAuthConfig, requireFoodPartner, getMe);
router.patch('/me', requireLamposeDb, requireAuthConfig, requireFoodPartner, updateMe);
router.patch(
  '/me/availability',
  requireLamposeDb, requireAuthConfig, requireFoodPartner,
  setAvailability,
);

/* ── The menu ────────────────────────────────────────────────────────────── */

const session = [requireLamposeDb, requireAuthConfig, requireFoodPartner];

router.get('/me/products', session, listMyProducts);
router.post('/me/products', session, createProduct);
router.patch('/me/products/:productId', session, updateProduct);
router.delete('/me/products/:productId', session, deleteProduct);
/* Its own route because it is the one thing a kitchen does mid-service, from a
   list, twenty times a day — it must not require sending the whole dish back. */
router.patch('/me/products/:productId/availability', session, setProductAvailability);

/* ── Handsets ─────────────────────────────────────────────────────────────
   A kitchen registers every device it is signed in on, because a new order
   has to ring on whichever one is being watched. The alert itself is
   `foodOrder.notifier.js`. */

router.post('/me/devices', session, registerFoodPartnerDevice);
router.delete('/me/devices', session, unregisterFoodPartnerDevice);

/* ── Orders: the restaurant's side ───────────────────────────────────────── */

router.get('/me/orders', session, listMyOrders);
router.get('/me/orders/:orderNumber', session, getMyOrder);
router.patch('/me/orders/:orderNumber/status', session, setOrderStatus);

/* ── Orders: the diner's side ─────────────────────────────────────────────
   A DIFFERENT identity system — `app_customers`, not the restaurant's own
   session — which is why these sit on their own middleware and in their own
   controller. Nothing here can read another restaurant's queue, and nothing
   on the partner routes above can place an order. */

const customer = [requireLamposeDb, requireAuthConfig, requireCustomer];

router.post('/orders', customer, placeOrder);
router.get('/orders', customer, listCustomerOrders);
router.get('/orders/:orderNumber', customer, getCustomerOrder);
router.patch('/orders/:orderNumber/cancel', customer, cancelMyOrder);

/* ── Public discovery ────────────────────────────────────────────────────── */

/* Approved and active only — the projection is asserted in the controller
   rather than left to `toJSON`, because this is the one unauthenticated
   reader and belt-and-braces is right there. */
router.get('/restaurants', requireLamposeDb, listRestaurants);
router.get('/restaurants/:restaurantId', requireLamposeDb, getRestaurant);
router.get('/products/:productId', requireLamposeDb, getProduct);

module.exports = router;
