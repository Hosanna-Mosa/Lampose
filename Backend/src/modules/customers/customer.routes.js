/* ══════════════════════════════════════════════════════════════════════════
   Customer accounts for the mobile app.

   The three auth routes are public and every one of them can send an SMS we
   pay for, so the limiters below are not a formality — they are the only
   thing between an anonymous caller and a bill. They sit per-route rather
   than globally, the same way the visit-request limiters do: the v1 and v2
   surfaces are in production and adding a limiter in front of them is not
   part of this change.

   Two ceilings per route, deliberately:

     by IP     stops one script working through a list of numbers.
     by phone  stops a distributed set of addresses hammering ONE number,
               which is the shape of an SMS-bombing attack — the victim is
               the person whose handset rings, not us.

   The per-phone limits are backed up by the server's own cooldown in the
   controller, which is enforced against `otp.lastSentAt` in the database and
   therefore survives a process restart and applies across instances. These
   are the cheap first line; that is the real one.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const {
  startAuth, resendAuth, verifyAuth, getMe, updateMe,
} = require('./customer.controller');
const { getNotifications, markNotificationsRead } = require('./notification.controller');
const { getSaved, addSaved, removeSaved } = require('./saved.controller');
const { getMyCoupon } = require('./foodCoupon.controller');
const { requireCustomer } = require('./customerAuth.middleware');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { rateLimit } = require('../../shared/middleware/rateLimit');

const router = express.Router();

/* Normalised the same way the controller normalises it, so "9876543210" and
   "+919876543210" count against one bucket rather than two. Falls back to the
   IP when the body has no usable number — a malformed request still costs
   something to handle. */
const phoneKey = (req) => {
  const raw = String((req.body && req.body.phone) || '').replace(/\D/g, '');
  return raw ? raw.slice(-10) : req.ip;
};

const startByIp = rateLimit({ name: 'cust-start-ip', windowMs: 60 * 60 * 1000, max: 20 });
const startByPhone = rateLimit({
  name: 'cust-start-phone', windowMs: 60 * 60 * 1000, max: 6, keyOf: phoneKey,
});

const resendByIp = rateLimit({ name: 'cust-resend-ip', windowMs: 60 * 60 * 1000, max: 20 });
const resendByPhone = rateLimit({
  name: 'cust-resend-phone', windowMs: 60 * 60 * 1000, max: 6, keyOf: phoneKey,
});

/* Verifying is free to us, but it is the guessing surface: six digits is a
   million combinations, and the per-code attempt counter in the controller is
   what actually stops a brute force. This ceiling catches somebody cycling
   through fresh codes to reset that counter. */
const verifyByIp = rateLimit({ name: 'cust-verify-ip', windowMs: 15 * 60 * 1000, max: 40 });
const verifyByPhone = rateLimit({
  name: 'cust-verify-phone', windowMs: 15 * 60 * 1000, max: 15, keyOf: phoneKey,
});

router.post('/auth/start', requireLamposeDb, startByIp, startByPhone, startAuth);
router.post('/auth/resend', requireLamposeDb, resendByIp, resendByPhone, resendAuth);
router.post('/auth/verify', requireLamposeDb, verifyByIp, verifyByPhone, verifyAuth);

/* Behind a session. Not gated by REQUIRE_AUTH: "who am I" and "change my
   name" have no meaning without a token, and the escape hatch that switch
   provides is for staff clients that cannot send a header. */
router.get('/me', requireLamposeDb, requireCustomer, getMe);
router.patch('/me', requireLamposeDb, requireCustomer, updateMe);

/* Derived from this customer's own visit requests — see
   notification.controller.js for why there is no notifications collection. */
router.get('/notifications', requireLamposeDb, requireCustomer, getNotifications);
router.post('/notifications/read', requireLamposeDb, requireCustomer, markNotificationsRead);

/* The shortlist. On the account rather than the device, so it survives a
   reinstall — and each entry keeps the rent it was saved at, which is what
   makes "cheaper since you saved it" possible at all. */
router.get('/saved', requireLamposeDb, requireCustomer, getSaved);
router.post('/saved', requireLamposeDb, requireCustomer, addSaved);
router.delete('/saved/:listingId', requireLamposeDb, requireCustomer, removeSaved);

/* Set by `verify`, if a valid owner-invite code came in with it — see
   partners/customerReferral.controller.js. Null data, not a 404: not having
   one is the ordinary case for most customers. */
router.get('/food-coupon', requireLamposeDb, requireCustomer, getMyCoupon);

module.exports = router;
