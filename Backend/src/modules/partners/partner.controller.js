/* ══════════════════════════════════════════════════════════════════════════
   Partner accounts — register, log in, and the profile behind them.

   Register and log in are the SAME two calls, exactly as they are for
   customers. A number Lampose has seen before signs in; one it has not creates
   an account. The client says which it thinks is happening so the copy can
   differ, and the server does not believe it — telling somebody "no account
   exists for this number" at the moment they are trying to get in is both
   useless and an account-enumeration oracle.

     POST /auth/start    a number in, a code out by SMS.
     POST /auth/verify   the code back, a session out.
     POST /auth/resend   another code, rate limited by the server's clock.
     GET  /me            who this token belongs to.
     PATCH /me           name, email, business name — the profile-setup screen.

   ## The OTP machinery is the visit-request flow's, unchanged

   Same six digits, same ten-minute window, same salted hash, same DLT template
   going to the same handsets. Three OTP implementations in one process would
   drift, and the one that drifted would be the one nobody was testing.

   ## The profile is written after the code, never before

   `verify` accepts an optional name and email — the app collects them on the
   screen after the code — and applies them only once the code is correct. A
   profile written on `start` would let anyone rename a stranger's account by
   typing their number into a registration form.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const mongoose = require('mongoose');

const Partner = require('./partner.model');
const { signPartnerToken } = require('./partnerAuth.middleware');
const { sendOtpSms, smsConfigProblem } = require('../../infrastructure/sms/sms');
const { toE164, isIndianMobile, maskPhone } = require('../../infrastructure/twilio/twilio');
const {
  OTP_MAX_ATTEMPTS, OTP_MAX_RESENDS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS,
  generateOtp, newSalt, hashOtp, verifyOtp,
} = require('../visits/otp.util');

const OTP_LENGTH = 6;

/* How long a code stays locked after too many wrong tries. On the CODE, not on
   the person: asking for a new one clears it. */
const LOCK_MS = 10 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

const smsUnavailable = (res) => {
  const problem = smsConfigProblem();
  console.error('[partners] SMS gateway not ready:', problem);
  return res.status(503).json({
    success: false,
    code: 'SMS_NOT_CONFIGURED',
    message: 'We cannot send sign-in codes right now. Please try again shortly.',
  });
};

const readPhone = (body) => {
  const e164 = toE164((body || {}).phone);
  return isIndianMobile(e164) ? e164 : null;
};

/**
 * Issues a code and sends it.
 *
 * Saved before the send, so a gateway that accepts the message and then fails
 * on our side still leaves a code the partner can use. The reverse order would
 * send a code that verifies against nothing.
 */
const issueOtp = async (partner) => {
  const otp = generateOtp();
  const salt = newSalt();

  partner.otp.salt = salt;
  partner.otp.hash = hashOtp(otp, salt);
  partner.otp.expiresAt = new Date(Date.now() + OTP_TTL_MS);
  partner.otp.attempts = 0;
  partner.otp.lockedUntil = null;
  partner.otp.lastSentAt = new Date();
  await partner.save();

  const sent = await sendOtpSms(partner.phone, otp);
  if (sent.success && sent.campId) {
    partner.otp.campId = sent.campId;
    await partner.save();
  }
  return sent;
};

/** The shape every send answers with, so the client has one thing to read. */
const sentPayload = (partner) => ({
  phoneMasked: maskPhone(partner.phone),
  otpLength: OTP_LENGTH,
  resendInSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
  maxAttempts: OTP_MAX_ATTEMPTS,
});

/* ── POST /auth/start ─────────────────────────────────────────────────────── */

const startAuth = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    if (smsConfigProblem()) return smsUnavailable(res);

    const phone = readPhone(req.body);
    if (!phone) {
      return res.status(400).json({
        success: false,
        code: 'BAD_PHONE',
        message: 'Please enter a valid 10-digit Indian mobile number.',
      });
    }

    /* Found or created in one call. A find-then-create would race two taps of
       the same button into two documents for one number, and the unique index
       would reject the second with a duplicate-key error that means nothing to
       anybody reading it. */
    let partner = await Partner.findOne({ phone });
    if (!partner) {
      partner = await Partner.create({
        partnerId: `prt_${crypto.randomBytes(9).toString('hex')}`,
        phone,
      });
    }

    if (partner.status === 'blocked') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_BLOCKED',
        message: 'This number cannot be used to sign in. Please contact Lampose.',
      });
    }

    /* The server's own cooldown, applied to `start` as well as `resend`.
       Without it, closing the screen and reopening it is an unlimited resend
       button — and every press is an SMS we pay for. */
    const since = partner.otp.lastSentAt ? Date.now() - partner.otp.lastSentAt.getTime() : Infinity;
    if (since < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - since) / 1000);
      return res.status(429).json({
        success: false,
        code: 'RESEND_TOO_SOON',
        retryAfter: wait,
        message: `We have just sent a code. Please wait ${wait}s before asking for another.`,
        data: sentPayload(partner),
      });
    }

    /* A new send is a new session's worth of tries. */
    partner.otp.resends = 0;
    const sent = await issueOtp(partner);

    if (!sent.success) {
      return res.status(502).json({
        success: false,
        code: 'OTP_SEND_FAILED',
        message: 'We could not send the code to that number. Please check it and try again.',
      });
    }

    return res.status(200).json({ success: true, data: sentPayload(partner) });
  } catch (error) {
    return next(error);
  }
};

/* ── POST /auth/resend ────────────────────────────────────────────────────── */

const resendAuth = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    if (smsConfigProblem()) return smsUnavailable(res);

    const phone = readPhone(req.body);
    if (!phone) {
      return res.status(400).json({
        success: false, code: 'BAD_PHONE', message: 'Please enter a valid mobile number.',
      });
    }

    const partner = await Partner.findOne({ phone });
    /* Deliberately the same answer a real cooldown would give. Saying "no
       sign-in is in progress for that number" would report whether a number is
       mid-flow to anybody who asks. */
    if (!partner || partner.status === 'blocked') {
      return res.status(429).json({
        success: false,
        code: 'RESEND_TOO_SOON',
        retryAfter: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
        message: 'Please start again from the number.',
      });
    }

    const since = partner.otp.lastSentAt ? Date.now() - partner.otp.lastSentAt.getTime() : Infinity;
    if (since < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - since) / 1000);
      return res.status(429).json({
        success: false,
        code: 'RESEND_TOO_SOON',
        retryAfter: wait,
        message: `Please wait ${wait}s before asking for another code.`,
      });
    }

    if (partner.otp.resends >= OTP_MAX_RESENDS) {
      return res.status(429).json({
        success: false,
        code: 'RESEND_LIMIT',
        message: 'That is the maximum number of codes for one sign-in. Please start again in a few minutes.',
      });
    }

    partner.otp.resends += 1;
    const sent = await issueOtp(partner);
    if (!sent.success) {
      return res.status(502).json({
        success: false,
        code: 'OTP_SEND_FAILED',
        message: 'We could not send the code. Please check the number and try again.',
      });
    }

    return res.json({ success: true, data: sentPayload(partner) });
  } catch (error) {
    return next(error);
  }
};

/* ── POST /auth/verify ────────────────────────────────────────────────────── */

const verifyAuth = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const { otp, name, email, businessName } = req.body || {};
    const phone = readPhone(req.body);
    if (!phone) {
      return res.status(400).json({
        success: false, code: 'BAD_PHONE', message: 'Please enter a valid mobile number.',
      });
    }

    const partner = await Partner.findOne({ phone });
    /* No code was ever issued for this number. Same 400 and the same wording a
       wrong code gets, so the response cannot be used to discover which numbers
       have accounts. */
    if (!partner || !partner.otp.hash) {
      return res.status(400).json({
        success: false, code: 'OTP_WRONG', message: 'That code is not right. Ask for a new one.',
      });
    }

    if (partner.status === 'blocked') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_BLOCKED',
        message: 'This number cannot be used to sign in. Please contact Lampose.',
      });
    }

    if (partner.otp.lockedUntil && partner.otp.lockedUntil > new Date()) {
      return res.status(429).json({
        success: false,
        code: 'OTP_LOCKED',
        /* The clock time, so the app can say "try again after 9:41" rather than
           "later". A wait you cannot see the end of is a wait people abandon. */
        unlocksAt: partner.otp.lockedUntil,
        message: 'Too many incorrect attempts. Ask for a new code.',
      });
    }

    if (!partner.otp.expiresAt || partner.otp.expiresAt <= new Date()) {
      return res.status(410).json({
        success: false, code: 'OTP_EXPIRED', message: 'That code has expired. Ask for a new one.',
      });
    }

    if (!verifyOtp(String(otp || '').trim(), partner.otp.salt, partner.otp.hash)) {
      partner.otp.attempts += 1;
      const left = Math.max(0, OTP_MAX_ATTEMPTS - partner.otp.attempts);
      if (left === 0) partner.otp.lockedUntil = new Date(Date.now() + LOCK_MS);
      await partner.save();

      return res.status(400).json({
        success: false,
        code: left === 0 ? 'OTP_LOCKED' : 'OTP_WRONG',
        attemptsLeft: left,
        ...(left === 0 ? { unlocksAt: partner.otp.lockedUntil } : {}),
        message: left > 0
          ? `That code is not right. ${left} attempt${left === 1 ? '' : 's'} left.`
          : 'Too many incorrect attempts. Ask for a new code.',
      });
    }

    /* Correct. The code is destroyed before anything else happens, so the same
       six digits cannot be replayed while the response is in flight. */
    partner.otp = {
      hash: null,
      salt: null,
      expiresAt: null,
      attempts: 0,
      resends: 0,
      lockedUntil: null,
      // Kept: they say when the code went and how it can be traced.
      lastSentAt: partner.otp.lastSentAt,
      campId: partner.otp.campId,
    };

    if (!partner.phoneVerifiedAt) partner.phoneVerifiedAt = new Date();
    partner.lastLoginAt = new Date();

    /*
     * Registration fields, applied now that the number is proven.
     *
     * Only ever filled in, never blanked: a sign-in sends no name, and treating
     * that absent field as an instruction to clear one would wipe a returning
     * owner's profile on every login.
     */
    if (typeof name === 'string' && name.trim()) {
      partner.name = name.trim().slice(0, 80);
      if (!partner.profileCompletedAt) partner.profileCompletedAt = new Date();
    }
    if (typeof businessName === 'string' && businessName.trim()) {
      partner.businessName = businessName.trim().slice(0, 120);
    }
    if (typeof email === 'string' && email.trim()) {
      const cleaned = email.trim().toLowerCase();
      if (!EMAIL_RE.test(cleaned)) {
        return res.status(400).json({
          success: false, code: 'BAD_EMAIL', message: 'Please enter a valid email address.',
        });
      }
      partner.email = cleaned;
    }

    await partner.save();

    return res.json({
      success: true,
      data: {
        token: signPartnerToken(partner),
        partner: partner.toPublic(),
      },
    });
  } catch (error) {
    return next(error);
  }
};

/* ── GET /me ──────────────────────────────────────────────────────────────── */

const getMe = async (req, res) => res.json({ success: true, data: req.partner.toPublic() });

/* ── PATCH /me ────────────────────────────────────────────────────────────── */

/**
 * The profile-setup screen, and every later edit of it.
 *
 * Unlike `verify`, an explicitly sent empty string here DOES clear a field —
 * this is the editor, and clearing the business name is how somebody removes
 * one they no longer trade under. `undefined` still means "not part of this
 * change"; the difference between the two is the whole reason PATCH is the
 * verb rather than PUT.
 *
 * The name is the exception: it is what Lampose staff see against every
 * property and every payout, so it may be changed but not emptied.
 */
const updateMe = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const { name, email, businessName } = req.body || {};
    const partner = req.partner;

    if (name !== undefined) {
      const cleaned = String(name).trim();
      if (!cleaned) {
        return res.status(400).json({
          success: false, code: 'BAD_INPUT', message: 'Please tell us your name.',
        });
      }
      partner.name = cleaned.slice(0, 80);
      if (!partner.profileCompletedAt) partner.profileCompletedAt = new Date();
    }

    if (email !== undefined) {
      const cleaned = String(email).trim().toLowerCase();
      if (cleaned && !EMAIL_RE.test(cleaned)) {
        return res.status(400).json({
          success: false, code: 'BAD_EMAIL', message: 'Please enter a valid email address.',
        });
      }
      partner.email = cleaned;
    }

    if (businessName !== undefined) {
      partner.businessName = String(businessName).trim().slice(0, 120);
    }

    await partner.save();

    return res.json({ success: true, data: partner.toPublic() });
  } catch (error) {
    return next(error);
  }
};

module.exports = { startAuth, resendAuth, verifyAuth, getMe, updateMe };
