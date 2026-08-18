/* ══════════════════════════════════════════════════════════════════════════
   /api/v2/partners — the Stay Partner app.

   The three auth routes are public and every one of them can send an SMS we
   pay for, so the limiters below are not a formality — they are the only thing
   between an anonymous caller and a bill. Two ceilings per route, matching the
   customer routes and for the same reasons:

     by IP     stops one script working through a list of numbers.
     by phone  stops a distributed set of addresses hammering ONE number,
               which is the shape of an SMS-bombing attack — the victim is the
               person whose handset rings, not us.

   The per-phone limits are backed up by the server's own cooldown in the
   controller, enforced against `otp.lastSentAt` in the database, so it survives
   a process restart and applies across instances. These are the cheap first
   line; that is the real one.

   ## What is behind a session, and what is not yet here

   Everything that is not `/auth/*`. A partner's properties and their customers'
   phone numbers are the most sensitive data this process holds on the supply
   side, and `requirePartner` additionally refuses any session whose phone was
   never verified — see the note in `partnerAuth.middleware.js`.

   The routes this app's remaining screens need — bookings, check-in, payouts,
   earnings, reviews, staff, complaints — are absent because the collections
   they would read do not exist. See `Stay Partner/services/api/endpoints.ts`
   for the full list and what each one is waiting on.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');
const multer = require('multer');

const {
  startGuestOtp, verifyGuestOtp, uploadKycImages, createBooking, updateBooking, deleteBooking,
  MAX_KYC_IMAGES,
} = require('./addCustomer.controller');

/* Held in memory and streamed straight to Cloudinary — nothing identity-
   related touches this server's disk. 10MB is generous for a phone photograph
   of a card and small enough that five at once cannot exhaust the process. */
const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_KYC_IMAGES },
});

const {
  startAuth, resendAuth, verifyAuth, getMe, updateMe,
} = require('./partner.controller');
const {
  getMyProperties, getMyRequests, getMyRequest, markRequestsRead, getSummary,
  acceptRequest, declineRequest,
} = require('./portfolio.controller');
const { requirePartner } = require('./partnerAuth.middleware');
const {
  registerPartnerDevice, unregisterPartnerDevice,
} = require('../notifications/device.controller');
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

const startByIp = rateLimit({ name: 'partner-start-ip', windowMs: 60 * 60 * 1000, max: 20 });
const startByPhone = rateLimit({
  name: 'partner-start-phone', windowMs: 60 * 60 * 1000, max: 6, keyOf: phoneKey,
});

const resendByIp = rateLimit({ name: 'partner-resend-ip', windowMs: 60 * 60 * 1000, max: 20 });
const resendByPhone = rateLimit({
  name: 'partner-resend-phone', windowMs: 60 * 60 * 1000, max: 6, keyOf: phoneKey,
});

/* Verifying is free to us, but it is the guessing surface: six digits is a
   million combinations, and the per-code attempt counter in the controller is
   what actually stops a brute force. This ceiling catches somebody cycling
   through fresh codes to reset that counter. */
const verifyByIp = rateLimit({ name: 'partner-verify-ip', windowMs: 15 * 60 * 1000, max: 40 });
const verifyByPhone = rateLimit({
  name: 'partner-verify-phone', windowMs: 15 * 60 * 1000, max: 15, keyOf: phoneKey,
});

const {
  getBookings,
  getBookingById,
  checkInBooking,
  checkOutBooking,
  cancelBooking,
  getEarningsSummary,
  getPayouts,
  getPayoutById,
  getPaymentMethods,
  addPaymentMethod,
  deletePaymentMethod,
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaintStatus,
  getNotifications,
  markNotificationRead,
  getStaff,
  inviteStaff,
  removeStaff,
  getReviews,
  getReferralInfo,
  withdrawReferral,
  getShareTypes,
  updateShareTypeAvailability,
} = require('./partnerDomains.controller');

router.post('/auth/start', requireLamposeDb, startByIp, startByPhone, startAuth);
router.post('/auth/resend', requireLamposeDb, resendByIp, resendByPhone, resendAuth);
router.post('/auth/verify', requireLamposeDb, verifyByIp, verifyByPhone, verifyAuth);

/* Counted per signed-in owner, and declared here because the limiters below
   close over it. `phoneKey` above reads the number out of the BODY, which is
   the guest's on the Add Customer routes — using that would let one owner
   exhaust another's allowance by typing their number. */
const partnerKey = (req) => (req.partner ? req.partner.partnerId : req.ip);

/* The profile. `PATCH /me` is what the profile-setup screen writes. */
router.get('/me', requireLamposeDb, requirePartner, getMe);
router.patch('/me', requireLamposeDb, requirePartner, updateMe);

/* This device. An owner with no registered handset cannot be told a request
   arrived, and a three-minute deadline then expires every time. */
router.post('/devices', requireLamposeDb, requirePartner, registerPartnerDevice);
router.delete('/devices', requireLamposeDb, requirePartner, unregisterPartnerDevice);

/* Dashboard summary */
router.get('/summary', requireLamposeDb, requirePartner, getSummary);

/* Listings & Requests */
router.get('/properties', requireLamposeDb, requirePartner, getMyProperties);
router.get('/requests', requireLamposeDb, requirePartner, getMyRequests);
router.post('/requests/read', requireLamposeDb, requirePartner, markRequestsRead);
router.get('/requests/:id', requireLamposeDb, requirePartner, getMyRequest);

/* Answering a stay request. Both are guarded, atomic and idempotent in the
   service — a second tap changes nothing and is told which of the four
   possible endings got there first.

   Rate limited per OWNER rather than per IP: the cost is a push to a student
   and, on the last bed, an auto-decline sweep across everybody else waiting
   on it. Generous, because an owner working through a morning's requests is
   the ordinary case and must never be throttled mid-list. */
const answerLimit = rateLimit({
  name: 'partner-answer-request', windowMs: 60 * 60 * 1000, max: 120, keyOf: partnerKey,
});

router.post('/requests/:id/accept', requireLamposeDb, requirePartner, answerLimit, acceptRequest);
router.post('/requests/:id/decline', requireLamposeDb, requirePartner, answerLimit, declineRequest);

/* ── Add Customer ────────────────────────────────────────────────────────
   A code to the guest, their documents to Cloudinary, then the record. The
   create refuses anything the server has not itself proved — see the note at
   the top of addCustomer.controller.js.

   The OTP limiters are per OWNER rather than per IP: an owner retyping a
   number must not be able to ring a stranger's handset repeatedly, and the
   victim of an SMS flood is the person holding it. The controller enforces a
   second cooldown against the stored `lastSentAt`, which survives a restart. */

const guestOtpLimit = rateLimit({
  name: 'partner-guest-otp', windowMs: 60 * 60 * 1000, max: 20, keyOf: partnerKey,
});
const uploadLimit = rateLimit({
  name: 'partner-kyc-upload', windowMs: 60 * 60 * 1000, max: 60, keyOf: partnerKey,
});

router.post('/guest-otp/start', requireLamposeDb, requirePartner, guestOtpLimit, startGuestOtp);
router.post('/guest-otp/verify', requireLamposeDb, requirePartner, verifyGuestOtp);

router.post(
  '/uploads/kyc',
  requireLamposeDb,
  requirePartner,
  uploadLimit,
  kycUpload.array('images', MAX_KYC_IMAGES),
  uploadKycImages,
);

router.post('/bookings', requireLamposeDb, requirePartner, createBooking);

/* Bookings */
router.get('/bookings', requireLamposeDb, requirePartner, getBookings);
router.get('/bookings/:id', requireLamposeDb, requirePartner, getBookingById);
router.post('/bookings/:id/checkin', requireLamposeDb, requirePartner, checkInBooking);
router.post('/bookings/:id/checkout', requireLamposeDb, requirePartner, checkOutBooking);
router.post('/bookings/:id/cancel', requireLamposeDb, requirePartner, cancelBooking);

/* Correcting and removing a record. Both scoped on the partner as well as the
   id — see the notes in addCustomer.controller.js for what may be edited and
   why the phone number and the verification may not. */
router.patch('/bookings/:id', requireLamposeDb, requirePartner, updateBooking);
router.delete('/bookings/:id', requireLamposeDb, requirePartner, deleteBooking);

/* Earnings & Payouts */
router.get('/earnings', requireLamposeDb, requirePartner, getEarningsSummary);
router.get('/payouts', requireLamposeDb, requirePartner, getPayouts);
router.get('/payouts/:id', requireLamposeDb, requirePartner, getPayoutById);
router.get('/payment-methods', requireLamposeDb, requirePartner, getPaymentMethods);
router.post('/payment-methods', requireLamposeDb, requirePartner, addPaymentMethod);
router.delete('/payment-methods/:id', requireLamposeDb, requirePartner, deletePaymentMethod);

/* Complaints & Support */
router.get('/complaints', requireLamposeDb, requirePartner, getComplaints);
router.get('/complaints/:id', requireLamposeDb, requirePartner, getComplaintById);
router.post('/complaints', requireLamposeDb, requirePartner, createComplaint);
/* Close or reopen one. The app's 'Mark resolved' button had no endpoint. */
router.patch('/complaints/:id', requireLamposeDb, requirePartner, updateComplaintStatus);

/* Notifications */
router.get('/notifications', requireLamposeDb, requirePartner, getNotifications);
router.post('/notifications/:id/read', requireLamposeDb, requirePartner, markNotificationRead);

/* Staff */
router.get('/staff', requireLamposeDb, requirePartner, getStaff);
router.post('/staff/invite', requireLamposeDb, requirePartner, inviteStaff);
router.delete('/staff/:id', requireLamposeDb, requirePartner, removeStaff);

/* Reviews */
router.get('/reviews', requireLamposeDb, requirePartner, getReviews);

/* Referrals */
router.get('/referrals', requireLamposeDb, requirePartner, getReferralInfo);
router.post('/referrals/withdraw', requireLamposeDb, requirePartner, withdrawReferral);

/* Share Types & Availability */
router.get('/share-types', requireLamposeDb, requirePartner, getShareTypes);
router.patch('/share-types/availability', requireLamposeDb, requirePartner, updateShareTypeAvailability);

module.exports = router;
