/* ══════════════════════════════════════════════════════════════════════════
   The Add Customer form: a guest's code, their documents, and the record.

   Three endpoints that only make sense together, so they live in one file:

     POST /guest-otp/start    a code to the guest's phone
     POST /guest-otp/verify   the code back; the number is now proven
     POST /uploads/kyc        identity photographs to Cloudinary
     POST /bookings           the record, refusing anything unproven

   ## The server decides what "verified" means

   The form has a verified tick and an uploaded tick, and NEITHER is taken from
   the request body. `createBooking` looks the verification up in the database
   and reads the Cloudinary URLs off what `uploads/kyc` actually stored. An
   owner logging a walk-in is the one party with a reason to skip the check,
   and a boolean they can set is not a check.

   ## Cloudinary, not the database

   Images go to Cloudinary and what is stored here is the secure URL and the
   public id. The same account and the same folder convention the onboarding
   flow has always used — see `property.routes.v1.js`, which is where the
   config below is copied from rather than reinvented.

   The public id is kept alongside the URL because deleting an image needs it,
   and a URL cannot be turned back into one reliably.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

const GuestVerification = require('./guestVerification.model');
const { PartnerBooking } = require('./partnerDomains.model');
const Partner = require('./partner.model');
const { sendOtpSms, smsConfigProblem } = require('../../infrastructure/sms/sms');
const { toE164, isIndianMobile, maskPhone } = require('../../infrastructure/twilio/twilio');
const {
  OTP_TTL_MS, OTP_MAX_ATTEMPTS, OTP_MAX_RESENDS, OTP_RESEND_COOLDOWN_MS,
  generateOtp, newSalt, hashOtp, verifyOtp,
} = require('../visits/otp.util');

const { phoneKey } = Partner;

const OTP_LENGTH = 6;
const AADHAR_DIGITS = 12;
const MAX_KYC_IMAGES = 1;

/** How long a proven number stays usable while the rest of the form is filled. */
const PROOF_WINDOW_MS = 30 * 60 * 1000;

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

const badInput = (res, message, code = 'BAD_INPUT') => res.status(400).json({
  success: false, code, message,
});

const digitsOf = (partner) => partner.phoneDigits || phoneKey(partner.phone);

/* ── Guest OTP ─────────────────────────────────────────────────────────────*/

// @route   POST /api/v2/partners/guest-otp/start
// @desc    Send a code to the guest whose details are being entered
// @access  Partner session
const startGuestOtp = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    if (smsConfigProblem()) {
      return res.status(503).json({
        success: false,
        code: 'SMS_NOT_CONFIGURED',
        message: 'We cannot send codes right now. Please try again shortly.',
      });
    }

    const guestPhone = toE164((req.body || {}).phone);
    if (!isIndianMobile(guestPhone)) {
      return badInput(res, 'Enter a valid 10-digit Indian mobile number.', 'BAD_PHONE');
    }

    const key = digitsOf(req.partner);

    /*
     * An owner must not be able to ring a stranger's phone repeatedly by
     * retyping the number, so the cooldown is enforced against the stored
     * `lastSentAt` rather than trusted from the client. The victim of an
     * SMS flood is the person holding the handset, not us.
     */
    let challenge = await GuestVerification.findOne({ partnerPhoneDigits: key, guestPhone });

    if (challenge) {
      const since = Date.now() - new Date(challenge.lastSentAt).getTime();
      if (since < OTP_RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - since) / 1000);
        return res.status(429).json({
          success: false,
          code: 'RESEND_TOO_SOON',
          retryAfter: wait,
          message: `A code has just gone out. Please wait ${wait}s.`,
        });
      }
      if (challenge.resends >= OTP_MAX_RESENDS) {
        return res.status(429).json({
          success: false,
          code: 'RESEND_LIMIT',
          message: 'That is the maximum number of codes for this number. Start again in a few minutes.',
        });
      }
    }

    const otp = generateOtp();
    const salt = newSalt();
    const now = new Date();

    if (challenge) {
      challenge.hash = hashOtp(otp, salt);
      challenge.salt = salt;
      challenge.attempts = 0;
      challenge.resends += 1;
      challenge.lastSentAt = now;
      challenge.verifiedAt = null;
      challenge.expiresAt = new Date(now.getTime() + OTP_TTL_MS);
      await challenge.save();
    } else {
      challenge = await GuestVerification.create({
        partnerPhoneDigits: key,
        guestPhone,
        hash: hashOtp(otp, salt),
        salt,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      });
    }

    const sent = await sendOtpSms(guestPhone, otp);
    if (!sent.success) {
      return res.status(502).json({
        success: false,
        code: 'OTP_SEND_FAILED',
        message: 'We could not send the code to that number. Check it and try again.',
      });
    }

    return res.json({
      success: true,
      data: {
        phoneMasked: maskPhone(guestPhone),
        otpLength: OTP_LENGTH,
        resendInSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
        maxAttempts: OTP_MAX_ATTEMPTS,
      },
    });
  } catch (error) {
    return next(error);
  }
};

// @route   POST /api/v2/partners/guest-otp/verify
// @desc    Check the code the guest read back
// @access  Partner session
const verifyGuestOtp = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const { otp } = req.body || {};
    const guestPhone = toE164((req.body || {}).phone);
    if (!isIndianMobile(guestPhone)) return badInput(res, 'Enter a valid mobile number.', 'BAD_PHONE');

    const key = digitsOf(req.partner);
    const challenge = await GuestVerification.findOne({ partnerPhoneDigits: key, guestPhone });

    /* No challenge and a wrong code get the same answer, so the response
       cannot be used to discover which numbers have codes outstanding. */
    if (!challenge || !challenge.hash) {
      return badInput(res, 'That code is not right. Ask for a new one.', 'OTP_WRONG');
    }

    if (challenge.expiresAt <= new Date()) {
      return res.status(410).json({
        success: false, code: 'OTP_EXPIRED', message: 'That code has expired. Send a new one.',
      });
    }

    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        code: 'OTP_LOCKED',
        message: 'Too many incorrect attempts. Send a new code.',
      });
    }

    if (!verifyOtp(String(otp || '').trim(), challenge.salt, challenge.hash)) {
      challenge.attempts += 1;
      await challenge.save();
      const left = Math.max(0, OTP_MAX_ATTEMPTS - challenge.attempts);
      return res.status(400).json({
        success: false,
        code: left === 0 ? 'OTP_LOCKED' : 'OTP_WRONG',
        attemptsLeft: left,
        message: left > 0
          ? `That code is not right. ${left} attempt${left === 1 ? '' : 's'} left.`
          : 'Too many incorrect attempts. Send a new code.',
      });
    }

    /* Correct. The code is destroyed so the same digits cannot be replayed,
       and the PROOF is kept — with a longer window, because the owner still
       has the rest of the form to fill in. */
    challenge.hash = '';
    challenge.salt = '';
    challenge.attempts = 0;
    challenge.verifiedAt = new Date();
    challenge.expiresAt = new Date(Date.now() + PROOF_WINDOW_MS);
    await challenge.save();

    return res.json({
      success: true,
      data: { phone: guestPhone, verifiedAt: challenge.verifiedAt },
    });
  } catch (error) {
    return next(error);
  }
};

/* ── Cloudinary ────────────────────────────────────────────────────────────*/

/**
 * Configured per request from the environment, exactly as the onboarding
 * routes do it. An unset key fails loudly rather than falling back to
 * credentials baked into the repo — that fallback used to exist and was a
 * committed secret.
 */
const configureCloudinary = () => {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) return null;
  cloudinary.config({ cloud_name, api_key, api_secret });
  return cloud_name;
};

// @route   POST /api/v2/partners/uploads/kyc
// @desc    Identity photographs to Cloudinary; returns secure URLs
// @access  Partner session
const uploadKycImages = async (req, res, next) => {
  try {
    const cloudName = configureCloudinary();
    if (!cloudName) {
      console.error('❌ [Cloudinary] CLOUDINARY_* is not set — KYC upload refused.');
      return res.status(503).json({
        success: false,
        code: 'STORAGE_NOT_CONFIGURED',
        message: 'Image storage is not set up on this server.',
      });
    }

    /*
     * Two shapes accepted, because two clients send different ones: multer
     * parses `multipart/form-data` from a native picker, and `images[]` as
     * base64 data URIs is what a JSON client sends. Whichever arrives, the
     * upload below is identical.
     */
    const files = Array.isArray(req.files) ? req.files : [];
    const inline = Array.isArray((req.body || {}).images) ? req.body.images : [];

    const sources = [
      ...files.map((f) => `data:${f.mimetype || 'image/jpeg'};base64,${f.buffer.toString('base64')}`),
      ...inline.map((s) => (String(s).startsWith('data:') ? String(s) : `data:image/jpeg;base64,${s}`)),
    ];

    if (!sources.length) return badInput(res, 'No images were attached.');
    if (sources.length > MAX_KYC_IMAGES) {
      return badInput(res, `Please attach at most ${MAX_KYC_IMAGES} images.`);
    }

    const key = digitsOf(req.partner);

    /* Foldered per owner, so a support request about one partner's documents
       does not mean trawling a shared bucket. */
    const folder = `lampose_kyc/${key}`;

    const uploaded = [];
    for (const source of sources) {
      // Sequential rather than parallel: five 15MB images at once is a memory
      // spike on a small dyno for no gain a person would notice.
      const result = await cloudinary.uploader.upload(source, { folder, resource_type: 'image' });
      uploaded.push({ url: result.secure_url, publicId: result.public_id });
    }

    console.log(`   ☁️  [KYC Upload] ${uploaded.length} image(s) stored in "${folder}"`);

    return res.status(201).json({ success: true, count: uploaded.length, data: uploaded });
  } catch (error) {
    console.error('   ❌ [KYC Upload Error]:', error.message || error);
    return next(error);
  }
};

/* ── The record ────────────────────────────────────────────────────────────*/

/*
 * How far a stay may sit either side of today.
 *
 * A calendar-valid date is not the same as a plausible one. The form parses
 * DD/MM/YYYY strictly — 31/02 and 29/02/2026 are already rejected — but
 * 01/01/1900 and 01/01/3000 are both perfectly valid calendar dates, and the
 * typo this actually catches is a transposed year: 2062 for 2026 reads as an
 * ordinary date and is thirty-six years out.
 *
 * Backdating is allowed a year, because logging a walk-in late is a real thing
 * an owner does. Forward is two, which covers any booking somebody could
 * sensibly be taking now.
 */
const MAX_BACKDATE_DAYS = 365;
const MAX_FUTURE_DAYS = 730;
/** A stay, not a tenancy. Beyond this it is a typo in the year. */
const MAX_STAY_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight today, so a check-in dated today is never "in the past". */
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * A `YYYY-MM-DD` string, or null.
 *
 * Parsed against the calendar rather than handed to `new Date(string)` alone:
 * that constructor happily turns "2026-02-31" into 3 March, so a date the form
 * refuses would be silently corrected here instead of rejected.
 */
const asDateString = (value) => {
  const text = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;

  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  const real = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  return real ? text : null;
};

/** The same string as a local Date, for comparing against today. */
const asDate = (isoDay) => {
  const [y, m, d] = isoDay.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// @route   POST /api/v2/partners/bookings
// @desc    Log a walk-in the owner already knows
// @access  Partner session
const createBooking = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const body = req.body || {};
    const key = digitsOf(req.partner);

    const guestName = String(body.guestName || '').trim();
    if (!guestName) return badInput(res, "Enter the guest's name.");

    const guestPhone = toE164(body.guestPhone);
    if (!isIndianMobile(guestPhone)) {
      return badInput(res, 'Enter a valid 10-digit mobile number.', 'BAD_PHONE');
    }

    const checkInDate = asDateString(body.checkInDate);
    const checkOutDate = asDateString(body.checkOutDate);
    if (!checkInDate || !checkOutDate) {
      return badInput(res, 'Enter valid check-in and check-out dates.', 'BAD_DATE');
    }

    /* String comparison is safe on `YYYY-MM-DD` and avoids a timezone ever
       deciding which of two dates is earlier. */
    if (checkOutDate <= checkInDate) {
      return badInput(res, 'Check-out must be after check-in.', 'BAD_DATE');
    }

    const today = startOfToday();
    const inAt = asDate(checkInDate);
    const outAt = asDate(checkOutDate);

    const backdatedDays = Math.round((today - inAt) / DAY_MS);
    if (backdatedDays > MAX_BACKDATE_DAYS) {
      return badInput(
        res,
        'That check-in is more than a year ago. Check the year.',
        'BAD_DATE',
      );
    }

    const aheadDays = Math.round((inAt - today) / DAY_MS);
    if (aheadDays > MAX_FUTURE_DAYS) {
      return badInput(
        res,
        'That check-in is more than two years away. Check the year.',
        'BAD_DATE',
      );
    }

    const stayDays = Math.round((outAt - inAt) / DAY_MS);
    if (stayDays > MAX_STAY_DAYS) {
      return badInput(
        res,
        'That stay is longer than a year. Check the check-out date.',
        'BAD_DATE',
      );
    }

    const shareType = String(body.shareType || '').trim();
    if (!shareType) return badInput(res, 'Choose a room type.');

    const aadharNumber = String(body.aadharNumber || '').replace(/\D/g, '');
    if (aadharNumber.length !== AADHAR_DIGITS) {
      return badInput(res, `An Aadhar number is ${AADHAR_DIGITS} digits.`);
    }

    const address = String(body.address || '').trim();
    if (!address) return badInput(res, "Enter the guest's address.");

    /*
     * The verification is looked up, never believed.
     *
     * `verified: true` in a request body is a claim by the one party with a
     * reason to skip the step. This is the row the server wrote when a code it
     * generated came back correct, for THIS owner and THIS number.
     */
    const proof = await GuestVerification.findOne({
      partnerPhoneDigits: key,
      guestPhone,
      verifiedAt: { $ne: null },
    });

    if (!proof) {
      return res.status(409).json({
        success: false,
        code: 'GUEST_NOT_VERIFIED',
        message: 'Send a code to the guest and have them read it back before saving.',
      });
    }

    /* Same for the images: whatever the client claims, these are the
       Cloudinary results it was handed by `uploads/kyc`. A URL that is not
       ours is dropped rather than stored. */
    const aadharImages = (Array.isArray(body.aadharImages) ? body.aadharImages : [])
      .filter((img) => img && typeof img.url === 'string' && /^https:\/\/res\.cloudinary\.com\//.test(img.url))
      .slice(0, MAX_KYC_IMAGES)
      .map((img) => ({ url: img.url, publicId: String(img.publicId || '') }));

    if (!aadharImages.length) {
      return badInput(res, 'Attach at least one photograph of the Aadhar card.', 'KYC_IMAGE_REQUIRED');
    }

    const total = Number(body.totalAmount);
    const paid = Number(body.paidAmount);

    const booking = await PartnerBooking.create({
      partnerPhoneDigits: key,
      propertyId: String(body.propertyId || '').trim() || 'unassigned',
      propertyName: String(body.propertyName || '').trim() || 'Unassigned property',
      guestName,
      guestPhone,
      guestEmail: String(body.guestEmail || '').trim().toLowerCase(),
      roomNumber: String(body.roomNumber || '').trim() || shareType,
      shareType,
      checkInDate,
      checkOutDate,
      status: 'upcoming',
      /* Zero, not a stand-in. A walk-in logged before any money changes hands
         is the ordinary case, and inventing an amount here would put a figure
         on the owner's earnings that nobody agreed. */
      totalAmount: Number.isFinite(total) && total >= 0 ? total : 0,
      paidAmount: Number.isFinite(paid) && paid >= 0 ? paid : 0,
      notes: String(body.notes || '').trim(),
      guestsLabel: String(body.guestsLabel || '').trim(),
      source: 'manual',
      kyc: {
        address,
        aadharNumber,
        aadharImages,
        verifiedAt: proof.verifiedAt,
        verifiedPhone: guestPhone,
      },
    });

    /* The proof is spent. Leaving it would let a second walk-in be saved
       against one verification. */
    await GuestVerification.deleteOne({ _id: proof._id });

    /*
     * The walk-in takes a bed too.
     *
     * Easy to forget, and the counter lies the first time an owner fills a
     * bed themselves: the app would keep offering a room that is physically
     * full, and a student would be accepted into it. A bed is a bed however
     * the person arrived.
     *
     * Best effort and never fatal — the customer record is the thing the
     * owner asked for and it has already been written. A counter that did not
     * move is drift `npm run reconcile:inventory` reports; refusing the whole
     * save over it would lose a record somebody is standing at a desk for.
     */
    try {
      const { claimBed, shareTypeIdForBooking } = require('../inventory/inventory.service');
      const shareTypeId = shareTypeIdForBooking(booking);
      if (shareTypeId) await claimBed(shareTypeId);
    } catch (error) {
      console.error('[add-customer] booking saved but the bed count did not move:', error.message);
    }

    return res.status(201).json({
      success: true,
      data: { ...booking.toObject(), id: String(booking._id) },
    });
  } catch (error) {
    return next(error);
  }
};

/* ── Editing and removing a record ─────────────────────────────────────────*/

/**
 * What an owner may change after the fact.
 *
 * Deliberately not everything. Three things are frozen and it is worth saying
 * why, because "let them edit the whole row" is the obvious alternative:
 *
 *   guestPhone   is the number a code was sent to and answered. Editing it
 *                would leave `kyc.verifiedAt` sitting next to a number nobody
 *                ever proved — the record would claim a verification it does
 *                not have. A different number is a different verification, so
 *                it means a new record.
 *
 *   kyc.verifiedAt / aadharImages
 *                are evidence. The whole point of the create endpoint refusing
 *                a client-set `verified` flag is undone if a PATCH can write
 *                one afterwards.
 *
 *   source       says where the record came from. It is immutable for the
 *                same reason `kind` is on a support ticket.
 *
 * Everything below is a typo somebody can reasonably need to fix: a misheard
 * name, the wrong room, a date entered a day out, a mistyped Aadhar digit
 * — the photograph is the evidence there, not the digits.
 */
const EDITABLE_TEXT = ['guestName', 'shareType', 'roomNumber', 'guestsLabel', 'notes'];

// @route   PATCH /api/v2/partners/bookings/:id
// @desc    Correct a record's details
// @access  Partner session (owner of the record only)
const updateBooking = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Record not found.' });
    }

    const key = digitsOf(req.partner);

    /* Scoped on the partner as well as the id, so changing a character in a
       URL cannot edit another owner's record. */
    const booking = await PartnerBooking.findOne({ _id: req.params.id, partnerPhoneDigits: key });
    if (!booking) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Record not found.' });
    }

    const body = req.body || {};

    for (const field of EDITABLE_TEXT) {
      if (body[field] !== undefined) booking[field] = String(body[field]).trim();
    }
    if (!booking.guestName) return badInput(res, "Enter the guest's name.");
    if (!booking.shareType) return badInput(res, 'Choose a room type.');

    if (body.address !== undefined) {
      const address = String(body.address).trim();
      if (!address) return badInput(res, "Enter the guest's address.");
      booking.kyc.address = address;
    }

    if (body.aadharNumber !== undefined) {
      const aadhar = String(body.aadharNumber).replace(/\D/g, '');
      if (aadhar.length !== AADHAR_DIGITS) {
        return badInput(res, `An Aadhar number is ${AADHAR_DIGITS} digits.`);
      }
      booking.kyc.aadharNumber = aadhar;
    }

    /* Dates go through the same bounds the create does — a correction is as
       able to carry a transposed year as the original entry was. */
    if (body.checkInDate !== undefined || body.checkOutDate !== undefined) {
      const checkInDate = asDateString(body.checkInDate ?? booking.checkInDate);
      const checkOutDate = asDateString(body.checkOutDate ?? booking.checkOutDate);
      if (!checkInDate || !checkOutDate) {
        return badInput(res, 'Enter valid check-in and check-out dates.', 'BAD_DATE');
      }
      if (checkOutDate <= checkInDate) {
        return badInput(res, 'Check-out must be after check-in.', 'BAD_DATE');
      }

      const today = startOfToday();
      const inAt = asDate(checkInDate);
      const outAt = asDate(checkOutDate);

      if (Math.round((today - inAt) / DAY_MS) > MAX_BACKDATE_DAYS) {
        return badInput(res, 'That check-in is more than a year ago. Check the year.', 'BAD_DATE');
      }
      if (Math.round((inAt - today) / DAY_MS) > MAX_FUTURE_DAYS) {
        return badInput(res, 'That check-in is more than two years away. Check the year.', 'BAD_DATE');
      }
      if (Math.round((outAt - inAt) / DAY_MS) > MAX_STAY_DAYS) {
        return badInput(res, 'That stay is longer than a year. Check the check-out date.', 'BAD_DATE');
      }

      booking.checkInDate = checkInDate;
      booking.checkOutDate = checkOutDate;
    }

    await booking.save();

    return res.json({ success: true, data: { ...booking.toObject(), id: String(booking._id) } });
  } catch (error) {
    return next(error);
  }
};

// @route   DELETE /api/v2/partners/bookings/:id
// @desc    Remove a record, and the identity photographs with it
// @access  Partner session (owner of the record only)
const deleteBooking = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Record not found.' });
    }

    const key = digitsOf(req.partner);
    const booking = await PartnerBooking.findOne({ _id: req.params.id, partnerPhoneDigits: key }).lean();
    if (!booking) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Record not found.' });
    }

    /*
     * The photographs go with the record.
     *
     * Deleting the row and leaving the Aadhar card in Cloudinary is the worst
     * of both: the owner believes it is gone, and a scan of somebody's
     * identity document is still sitting on a public CDN with a guessable URL.
     * This is why `publicId` is stored alongside the URL — a delete needs it,
     * and a URL cannot be turned back into one reliably.
     *
     * Cloudinary failing does NOT block the delete. The record is what the
     * owner asked to remove, and leaving it in place because a CDN call timed
     * out would be a confusing refusal; the failure is logged so an orphaned
     * asset can be swept later.
     */
    const publicIds = (booking.kyc?.aadharImages || [])
      .map((img) => img.publicId)
      .filter(Boolean);

    if (publicIds.length && configureCloudinary()) {
      for (const publicId of publicIds) {
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          console.error(`   ⚠️  [KYC Delete] Cloudinary kept "${publicId}":`, err.message || err);
        }
      }
    }

    await PartnerBooking.deleteOne({ _id: booking._id, partnerPhoneDigits: key });

    return res.json({
      success: true,
      data: { id: String(booking._id), imagesRemoved: publicIds.length },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  startGuestOtp,
  verifyGuestOtp,
  uploadKycImages,
  createBooking,
  updateBooking,
  deleteBooking,
  MAX_KYC_IMAGES,
};
