/* ══════════════════════════════════════════════════════════════════════════
   /api/v2/drivers — the Driver app.

   ## Three public routes, and every one of them costs money

   The OTP routes send an SMS we pay for and ring a real handset. Each gets TWO
   ceilings, matching `foodPartner.routes.js` and `partner.routes.js` for the
   same reasons:

     by IP     stops one script working through a list of numbers.
     by phone  stops a distributed set of addresses hammering ONE number,
               which is the shape of an SMS-bombing attack — the victim is the
               person whose handset rings, not us.

   The per-phone limits are the cheap first line; the server's own cooldown in
   the controller, enforced against the stored code's age, is the real one,
   because it survives a restart and applies across instances.

   ## Two session tiers, and the second one is where the work is

   `requireDriver` loads the rider. `requireApprovedDriver` additionally
   refuses anybody an administrator has not approved. Everything that touches a
   live order sits behind BOTH, at the mount point rather than inside the
   handlers — which is what makes "approved" mean something: there is no route
   here through which an unapproved rider can be offered, accept or complete
   work, and no handler has to remember to check.

   The profile, document and upload routes deliberately sit on the first tier
   only. A pending rider has to be able to read `/me` and upload a licence, or
   approval could never happen — and a rider whose licence was REJECTED is
   unapproved by definition and has to be able to send another one. Behind
   `requireApprovedDriver` those routes would be a queue with no exit.

   ## The two rider hot paths are limited PER RIDER, not per IP

   `PATCH /me/location` runs four times a minute per online rider, and
   `GET /me/offer` every four seconds while they wait — by a wide margin the
   two most frequent calls in this process.

   Both are keyed on the driverId, and that is not a nicety. Indian mobile
   carriers put very large numbers of subscribers behind a handful of NAT
   addresses, so an IP-keyed ceiling is shared by every rider on that carrier in
   that city: at four riders per address the offer poll alone exhausts a
   60-per-minute budget, and the fifth rider starts getting 429s. The failure is
   silent and it is the worst one this module has — a throttled position makes
   the dispatcher treat that rider as stale and stop offering them work, so they
   sit online all shift receiving nothing, and nothing anywhere says why.

   Keying per rider means these limiters run AFTER `requireDriver`, because
   `req.driver` does not exist before it. That ordering is load-bearing; moving
   them back in front of the session silently reverts to `req.ip`.

   ## What is deliberately NOT here

   Approval. Moving a rider to `approved` belongs to the admin console, behind
   `verifyAdminToken` — a different identity system entirely. No handler on
   this router can set `status`, which is the same rule that keeps
   `verificationStatus` out of the food-partner routes.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const { rateLimit } = require('../../shared/middleware/rateLimit');
const { requireAuthConfig, requireLamposeDb } = require('../../shared/middleware/requireDb');

const {
  startAuth, resendAuth, verifyAuth,
  getMe, getMyStanding, updateMe, submitDocument, getMyDocuments,
  setDuty, updateLocation, getEarnings,
} = require('./driver.controller');
const {
  uploadDriverImages, driverImageUpload, DRIVER_UPLOAD_LIMITS,
} = require('./driverUpload.controller');
const {
  getMyOffer, acceptOrder, declineOrder, getActiveOrder,
  setOrderStatus, releaseOrder, listMyOrders,
} = require('./driverOrder.controller');
const { registerDriverDevice, unregisterDriverDevice } = require('../notifications/device.controller');
const {
  requireDriver, requireApprovedDriver, requireDriverForSupport,
} = require('./driverAuth.middleware');

const router = express.Router();

/** The phone a limiter should count against, however the body spells it. */
const phoneOf = (req) => String((req.body && req.body.phone) || '').replace(/\D/g, '').slice(-10);

const byIp = (name, windowMs, max) => rateLimit({ name, windowMs, max });
const byPhone = (name, windowMs, max) => rateLimit({ name, windowMs, max, keyOf: phoneOf });
/* Only usable AFTER `requireDriver` has run — `req.driver` is what it counts
   against. Placed before it, `keyOf` returns undefined and the limiter waves
   everything through, which is a quieter failure than the one it replaces but
   still not the intended rule. */
const byDriver = (name, windowMs, max) => rateLimit({
  name, windowMs, max, keyOf: (req) => req.driver && req.driver.driverId,
});

/* ── Public: sign in / sign up ───────────────────────────────────────────── */

router.post(
  '/auth/start',
  byIp('driver-otp-start-ip', 15 * 60 * 1000, 20),
  byPhone('driver-otp-start-phone', 15 * 60 * 1000, 5),
  requireLamposeDb,
  startAuth,
);

router.post(
  '/auth/resend',
  byIp('driver-otp-resend-ip', 15 * 60 * 1000, 20),
  byPhone('driver-otp-resend-phone', 15 * 60 * 1000, 5),
  requireLamposeDb,
  resendAuth,
);

router.post(
  '/auth/verify',
  byIp('driver-otp-verify-ip', 15 * 60 * 1000, 40),
  byPhone('driver-otp-verify-phone', 15 * 60 * 1000, 10),
  requireLamposeDb,
  requireAuthConfig,
  verifyAuth,
);

/* ── The signed-in rider (approval not required) ─────────────────────────── */

const session = [requireLamposeDb, requireAuthConfig, requireDriver];

router.get('/me', session, getMe);

/* The one read a SUSPENDED rider is allowed.

   `requireDriver` refuses them before `req.driver` exists, so every route on
   the tier below is closed to a rider on hold — including the one carrying the
   reason they are on hold. That left the app telling somebody to contact
   support about a decision it could not name. This route sits behind the
   SEPARATE guard the support router already uses; no existing guard is
   widened, and it answers a narrow standing view rather than the self view. */
const standing = [requireLamposeDb, requireAuthConfig, requireDriverForSupport];

router.get('/me/standing', standing, getMyStanding);
router.patch('/me', session, updateMe);

/* Onboarding, and every later correction to it. Emphatically on the first
   tier: a rider whose licence was rejected has an UNAPPROVED account and has
   to be able to send a new photograph, and putting these behind
   `requireApprovedDriver` would be a queue nobody can ever leave. */
router.get('/me/documents', session, getMyDocuments);
router.post('/me/documents', session, submitDocument);

/* Where the scans come from. Rate-limited per rider rather than per IP for the
   reason in the header — a shared carrier NAT is otherwise one rider's upload
   budget spent by another's. Twenty images in fifteen minutes is the whole
   five-document set sent twice over with room for retries, and far below a
   client looping. */
router.post(
  '/me/uploads/images',
  ...session,
  byDriver('driver-uploads', 15 * 60 * 1000, 20),
  driverImageUpload.array('images', DRIVER_UPLOAD_LIMITS.files),
  uploadDriverImages,
);

/* Handsets. On the first tier because a pending rider still needs to be told
   the moment they are approved, and that message is a push. */
router.post('/me/devices', session, registerDriverDevice);
router.delete('/me/devices', session, unregisterDriverDevice);

/* ── Working (approval required) ─────────────────────────────────────────── */

const working = [...session, requireApprovedDriver];

router.post('/me/duty', working, setDuty);

/* AFTER the session, so the limiter can key on the rider — see the header.
   240 per 15 minutes is one every 3.75 seconds sustained: four times what the
   app produces at its fifteen-second interval, and far below a client looping
   without a timer. */
router.patch(
  '/me/location',
  ...working,
  byDriver('driver-location', 15 * 60 * 1000, 240),
  updateLocation,
);

router.get('/me/earnings', working, getEarnings);

/* ── Orders ──────────────────────────────────────────────────────────────── */

/* The poll fallback for when the socket is down. Its own limiter because a
   rider app with a broken socket will call it every four seconds all shift,
   and that is the intended behaviour rather than abuse — the ceiling only has
   to stop a client with no interval at all. Per rider, for the reason in the
   header: 60/minute shared across a carrier's NAT is four riders. */
router.get(
  '/me/offer',
  ...working,
  byDriver('driver-offer-poll', 60 * 1000, 60),
  getMyOffer,
);

router.get('/me/orders/active', working, getActiveOrder);
router.get('/me/orders', working, listMyOrders);

router.post('/orders/:orderNumber/accept', working, acceptOrder);
router.post('/orders/:orderNumber/decline', working, declineOrder);
router.post('/orders/:orderNumber/release', working, releaseOrder);
router.patch('/orders/:orderNumber/status', working, setOrderStatus);

module.exports = router;
