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
const {
  getMyPropertyById, updateMyProperty, setMyPropertyAvailability, removeMyProperty,
  uploadPropertyImages, MAX_PROPERTY_IMAGES, getMyPropertyInventory, setMyFreeBeds,
} = require('./propertyEdit.controller');

/* Held in memory and streamed straight to Cloudinary — nothing identity-
   related touches this server's disk. 10MB is generous for a phone photograph
   of a card and small enough that five at once cannot exhaust the process. */
const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_KYC_IMAGES },
});

/* Property photographs run larger than an identity document scan — a modern
   phone camera's ordinary output — so this gets the same 15MB ceiling the v1
   onboarding upload uses rather than the KYC tile's 10MB. */
const propertyImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: MAX_PROPERTY_IMAGES },
});

const {
  startAuth, resendAuth, verifyAuth, loginWithPassword, getMe, updateMe,
} = require('./partner.controller');
const {
  getMyProperties, getMyRequests, getMyRequest, markRequestsRead, getSummary,
  acceptRequest, declineRequest,
} = require('./portfolio.controller');
const { createInvite, getInvites } = require('./customerReferral.controller');
const { requirePartner } = require('./partnerAuth.middleware');
const { makeInAppDeletionRouter } = require('../accountDeletion/accountDeletion.routes');
const { makeLogout } = require('../iam/session.controller');
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

/*
 * Password sign-in, limited by IP and again by the email being tried.
 *
 * The per-email limit is the one that matters: without it this route is an
 * offline-speed password oracle against a known owner's address, and the IP
 * limit alone is worth little to anybody who can change IP. Keyed off the
 * BODY's email, which on this route is the identity being claimed — unlike
 * `phoneKey` above, there is no second party whose allowance could be burned
 * by typing their address.
 */
const loginEmailKey = (req) => String((req.body || {}).email || '').trim().toLowerCase() || req.ip;
const loginByIp = rateLimit({ name: 'partner-login-ip', windowMs: 15 * 60 * 1000, max: 40 });
const loginByEmail = rateLimit({
  name: 'partner-login-email', windowMs: 15 * 60 * 1000, max: 10, keyOf: loginEmailKey,
});

const {
  getBookings,
  getBookingById,
  checkInBooking,
  devForceCheckInOwner,
  checkOutBooking,
  cancelBooking,
  getEarningsSummary,
  getPayouts,
  getPayoutById,
  requestPayout,
  replyToReview,
  getPaymentMethods,
  addPaymentMethod,
  setPrimaryPaymentMethod,
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
  updateOneShareTypeAvailability,
} = require('./partnerDomains.controller');
const {
  getOnboarding, submitOnboarding, syncStatus, devActivate,
} = require('./payoutOnboarding.controller');

router.post('/auth/start', requireLamposeDb, startByIp, startByPhone, startAuth);
router.post('/auth/resend', requireLamposeDb, resendByIp, resendByPhone, resendAuth);
router.post('/auth/verify', requireLamposeDb, verifyByIp, verifyByPhone, verifyAuth);

/* Email and password, for accounts that have been GIVEN a password. Beside the
   three above rather than replacing them: an account with no `passwordHash`
   cannot be signed into here at all, so this takes nothing away from the
   phone-and-OTP route every other owner uses. */
router.post('/auth/login', requireLamposeDb, loginByIp, loginByEmail, loginWithPassword);

/* Counted per signed-in owner, and declared here because the limiters below
   close over it. `phoneKey` above reads the number out of the BODY, which is
   the guest's on the Add Customer routes — using that would let one owner
   exhaust another's allowance by typing their number. */
const partnerKey = (req) => (req.partner ? req.partner.partnerId : req.ip);

/* The profile. `PATCH /me` is what the profile-setup screen writes. */
router.get('/me', requireLamposeDb, requirePartner, getMe);
router.patch('/me', requireLamposeDb, requirePartner, updateMe);

/* Asking to delete the account from inside the app — status, request, cancel.
   The public half is lampose.com/delete-account; see accountDeletion.routes.js. */
router.use('/me/account-deletion', makeInAppDeletionRouter('partner', 'partner', [requireLamposeDb, requirePartner]));

/* This device. An owner with no registered handset cannot be told a request
   arrived, and a three-minute deadline then expires every time. */
router.post('/devices', requireLamposeDb, requirePartner, registerPartnerDevice);
router.delete('/devices', requireLamposeDb, requirePartner, unregisterPartnerDevice);

/* Signing out, server-side: forget this handset, or — `everywhere: true` —
   end every session of the account. See iam/session.controller.js. */
router.post('/auth/logout', requireLamposeDb, requirePartner, makeLogout('partner'));

/* Dashboard summary */
router.get('/summary', requireLamposeDb, requirePartner, getSummary);

/* Listings & Requests */
router.get('/properties', requireLamposeDb, requirePartner, getMyProperties);

/* A single listing, every onboarding field, and the ability to add or correct
   them — scoped to a property this session's phone number actually owns. See
   propertyEdit.controller.js for how this differs from the v1 onboarding
   surface's employee-gated edit, and why an edit here has no review step. */
router.get('/properties/:id', requireLamposeDb, requirePartner, getMyPropertyById);
router.patch('/properties/:id', requireLamposeDb, requirePartner, updateMyProperty);

/* Pausing ONE listing. The dashboard switch below is partner-wide — every
   property at once — which left an owner with more than one no way to take a
   single listing off. See `setMyPropertyAvailability`. */
router.patch('/properties/:id/availability', requireLamposeDb, requirePartner, setMyPropertyAvailability);

/* Beds per room type — total, free right now, and booked through Lampose —
   and the owner's correction of the FREE count (capacity is edited on the
   property). See `inventoryForProperty` / `setFreeBeds` in inventory.service.js. */
router.get('/properties/:id/inventory', requireLamposeDb, requirePartner, getMyPropertyInventory);
router.patch('/properties/:id/inventory/:shareTypeId', requireLamposeDb, requirePartner, setMyFreeBeds);

/* Soft — sets `status: 'removed'`, never drops the document. Refused with a
   409 while a guest is currently staying/due or a student is waiting on an
   answer. See `removeMyProperty`. */
router.delete('/properties/:id', requireLamposeDb, requirePartner, removeMyProperty);

/* Refer a CUSTOMER, not another owner — a second, separate growth loop from
   /referrals below, sharing only the points wallet. Every code is minted off
   an already-proven phone number and redeemable only by that exact number —
   see customerReferral.controller.js for why, and what this replaced. */
router.post('/invites', requireLamposeDb, requirePartner, createInvite);
router.get('/invites', requireLamposeDb, requirePartner, getInvites);

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
const propertyImageUploadLimit = rateLimit({
  name: 'partner-property-image-upload', windowMs: 60 * 60 * 1000, max: 60, keyOf: partnerKey,
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

router.post(
  '/uploads/property-images',
  requireLamposeDb,
  requirePartner,
  propertyImageUploadLimit,
  propertyImageUpload.array('images', MAX_PROPERTY_IMAGES),
  uploadPropertyImages,
);

router.post('/bookings', requireLamposeDb, requirePartner, createBooking);

/* Bookings */
router.get('/bookings', requireLamposeDb, requirePartner, getBookings);
router.get('/bookings/:id', requireLamposeDb, requirePartner, getBookingById);
router.post('/bookings/:id/checkin', requireLamposeDb, requirePartner, checkInBooking);

/*
 * DEVELOPMENT ONLY — force both halves of a move-in, from the owner's app.
 *
 * 404s unless the server has `DEV_ALLOW_FORCE_CHECKIN` on, which `env.js`
 * refuses under NODE_ENV=production. Scoped to a booking this partner owns,
 * same as every route above. See `devForceCheckInOwner` for why it exists
 * and when to delete it.
 */
router.post('/bookings/:id/dev-force-checkin', requireLamposeDb, requirePartner, devForceCheckInOwner);

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
/* Before /payouts/:id — Express matches routes in order, and a literal
   segment has to be tried before the param that would otherwise swallow it. */
const payoutRequestLimit = rateLimit({
  name: 'partner-payout-request', windowMs: 60 * 60 * 1000, max: 6, keyOf: partnerKey,
});
router.post('/payouts/request', requireLamposeDb, requirePartner, payoutRequestLimit, requestPayout);
router.get('/payouts/:id', requireLamposeDb, requirePartner, getPayoutById);
/* ── Payout onboarding — HOTEL owners only ────────────────────────────────
   What Razorpay Route needs before it will settle to a hotel. Separate from
   the payment methods below: those feed the older RazorpayX flow, where we
   pay from an account we own; this makes the hotel a sub-merchant Razorpay
   pays directly. See `payoutOnboarding.controller.js`.

   Every route is scoped to `req.partner` — an owner can only ever read or
   write their own. */
router.get('/payout-onboarding', requireLamposeDb, requirePartner, getOnboarding);
router.post(
  '/payout-onboarding',
  requireLamposeDb, requirePartner,
  /* Submitting reaches a payment gateway and creates a merchant record, so it
     is limited — generously, because a form that failed on a typo should be
     re-submittable a few times. */
  rateLimit({
    name: 'partner-payout-onboarding', windowMs: 60 * 60 * 1000, max: 12, keyOf: partnerKey,
  }),
  submitOnboarding,
);
router.post('/payout-onboarding/refresh', requireLamposeDb, requirePartner, syncStatus);
/* DEVELOPMENT ONLY — 404s unless the server allows it. See `devActivate`. */
router.post('/payout-onboarding/dev-activate', requireLamposeDb, requirePartner, devActivate);

router.get('/payment-methods', requireLamposeDb, requirePartner, getPaymentMethods);
router.post('/payment-methods', requireLamposeDb, requirePartner, addPaymentMethod);
router.patch('/payment-methods/:id/primary', requireLamposeDb, requirePartner, setPrimaryPaymentMethod);
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
/* The owner's answer to a review. Saved on the review and shown to every
   student who reads it — see `GET /listings/:id/reviews`. */
router.post('/reviews/:id/reply', requireLamposeDb, requirePartner, replyToReview);

/* Referrals */
router.get('/referrals', requireLamposeDb, requirePartner, getReferralInfo);
router.post('/referrals/withdraw', requireLamposeDb, requirePartner, withdrawReferral);

/* Share Types & Availability */
router.get('/share-types', requireLamposeDb, requirePartner, getShareTypes);
router.patch('/share-types/availability', requireLamposeDb, requirePartner, updateShareTypeAvailability);
/* One room type, not the whole portfolio — see the note on
   `updateOneShareTypeAvailability` in partnerDomains.controller.js. */
router.patch('/share-types/:shareTypeId/availability', requireLamposeDb, requirePartner, updateOneShareTypeAvailability);

module.exports = router;
