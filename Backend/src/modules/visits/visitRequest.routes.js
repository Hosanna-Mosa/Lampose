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
} = require('./visitPayment.controller');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
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

router.post('/', requireLamposeDb, startLimit, createVisitRequest);
router.post('/:id/verify', requireLamposeDb, verifyLimit, verifyVisitRequest);
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

module.exports = router;
