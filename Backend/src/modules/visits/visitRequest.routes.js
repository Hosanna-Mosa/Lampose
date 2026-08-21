/* ══════════════════════════════════════════════════════════════════════════
   Availability / visit requests — the public site's "Request a visit" flow.

   Public and unauthenticated, like the listings feed it sits beside, so the
   rate limits below are the only thing between an anonymous caller and a real
   phone ringing at real cost. They are applied here rather than globally: the
   v1 and v2 surfaces are in production and adding a limiter in front of them
   is not part of this change.

   The business logic lives in controllers/visitRequestController.js so that
   the /api/v2 mount and the unversioned /api alias are the same handler
   rather than two copies.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const {
  createVisitRequest,
  verifyVisitRequest,
  resendVisitOtp,
  getVisitRequest,
} = require('./visitRequest.controller');
const {
  createPaymentOrder, verifyPayment, setJoiningDate, renderCheckout, paymentCallback,
  recordPaymentFailure,
} = require('./visitPayment.controller');
const {
  createUnlockOrder, verifyUnlockPayment, createAssistedOrder, verifyAssistedPayment,
  createBalanceOrder, verifyBalancePayment,
} = require('./contactUnlock.controller');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { attachCustomerIfPresent } = require('../customers/customerAuth.middleware');
const { rateLimit } = require('../../shared/middleware/rateLimit');

const router = express.Router();

/* Creating a request sends an SMS; verifying it messages the owner. The
   ceilings are generous enough that a person filling in a form twice never
   meets them, and low enough that a script cannot run up a bill. */
const startLimit = rateLimit({ name: 'visit-start-ip', windowMs: 60 * 60 * 1000, max: 8 });
const verifyLimit = rateLimit({ name: 'visit-verify-ip', windowMs: 15 * 60 * 1000, max: 20 });
const resendLimit = rateLimit({ name: 'visit-resend-ip', windowMs: 60 * 60 * 1000, max: 10 });

/* Polling the status is cheap and read-only, but it is still a public
   endpoint, so it gets a ceiling an honest poller never reaches — the page
   backs off from 4s to 20s and gives up after fifteen minutes. */
const statusLimit = rateLimit({ name: 'visit-status-ip', windowMs: 60 * 1000, max: 60 });

/* Optional auth: a held session skips the SMS code, no session still works.
   See `createVisitRequest` for why the phone must match the token. */
router.post('/', requireLamposeDb, attachCustomerIfPresent, startLimit, createVisitRequest);
/* Optional auth here too: a request created from a session is finished with
   that session and no code — see the SESSION_REQUIRED guard in the handler. */
router.post('/:id/verify', requireLamposeDb, attachCustomerIfPresent, verifyLimit, verifyVisitRequest);
router.post('/:id/resend', requireLamposeDb, resendLimit, resendVisitOtp);
router.get('/:id', requireLamposeDb, statusLimit, getVisitRequest);

/* ── The visit token ──────────────────────────────────────────────────────
   Bachelor and co-live only, and only after the owner has confirmed. The
   request id is the capability, exactly as it is for GET above — these routes
   add no new exposure, and the address they eventually release is behind a
   verified payment rather than behind knowing an id. */
router.post('/:id/payment/order', requireLamposeDb, statusLimit, createPaymentOrder);
router.post('/:id/payment/verify', requireLamposeDb, statusLimit, verifyPayment);
router.post('/:id/joining-date', requireLamposeDb, statusLimit, setJoiningDate);

/* The mobile app opens this in a browser tab rather than carrying a native
   Razorpay SDK. It renders the same checkout, verifies here where the secret
   already lives, and bounces back through the app's deep link. */
router.get('/:id/payment/checkout', requireLamposeDb, renderCheckout);
router.post('/:id/payment/callback', requireLamposeDb, paymentCallback);
/* Telemetry from the checkout page when Razorpay declines. Records the reason
   and answers 204 — it never decides anything. */
router.post('/:id/payment/failed', requireLamposeDb, recordPaymentFailure);

/* ── After the owner confirms: the two ways to actually see the room ──────
   Free and accompanied, or paid and alone. Same capability as the routes
   above — the request id — and the same ceiling, because neither is cheaper
   to abuse than starting a checkout is.

   Opening an assisted-visit order writes a slot and calls Razorpay, so it
   gets the tighter of the two limits: a caller who re-opens a checkout ten
   times an hour has stopped being a customer picking a time. Verifying is on
   the looser one, because a customer whose network drops mid-payment has to
   be able to retry. */
const lamposeLimit = rateLimit({ name: 'lampose-visit-ip', windowMs: 60 * 60 * 1000, max: 10 });

router.post('/:id/unlock/order', requireLamposeDb, statusLimit, createUnlockOrder);
router.post('/:id/unlock/verify', requireLamposeDb, statusLimit, verifyUnlockPayment);
router.post('/:id/assisted/order', requireLamposeDb, lamposeLimit, createAssistedOrder);
router.post('/:id/assisted/verify', requireLamposeDb, statusLimit, verifyAssistedPayment);
/* The other half of an assisted visit, settled when the room is confirmed. */
router.post('/:id/assisted/balance/order', requireLamposeDb, statusLimit, createBalanceOrder);
router.post('/:id/assisted/balance/verify', requireLamposeDb, statusLimit, verifyBalancePayment);

module.exports = router;
