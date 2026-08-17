/* ══════════════════════════════════════════════════════════════════════════
   Customer accounts — sign in, sign up, and the profile behind them.

   Sign-in and sign-up are the SAME two calls. A number we have seen before
   signs in; a number we have not creates an account. The client says which
   one it thinks is happening so the copy can differ, and the server does not
   believe it — a "Sign in" from an unknown number still works, because
   telling somebody "no account exists for this number" at the moment they are
   trying to get in is both useless and an account-enumeration oracle.

     POST /auth/start    a number in, a code out by SMS.
     POST /auth/verify   the code back, a session out.
     POST /auth/resend   another code, rate limited by the server's clock.
     GET  /me            who this token belongs to.
     PATCH /me           name, email, category.

   ## What the response deliberately does not say

   `start` returns the same shape whether or not the number is already known.
   `isNewAccount` is NOT in it. An endpoint that reports whether a number has
   an account is a way to test a list of numbers against our customer base,
   and the app does not need the answer: it already knows which tab the
   student pressed, and the copy is chosen from that.

   ## The code is checked before the name is written

   `verify` takes an optional name and email — the sign-up path collects them
   on the same screen — and applies them only after the code is correct. A
   profile written on `start` would let anyone rename a stranger's account by
   typing their number into a sign-up form.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const mongoose = require('mongoose');

const Customer = require('./customer.model');
const { signCustomerToken } = require('./customerAuth.middleware');
const { sendOtpSms, smsConfigProblem } = require('../../infrastructure/sms/sms');
const { toE164, isIndianMobile, maskPhone } = require('../../infrastructure/twilio/twilio');
const {
  OTP_TTL_MS, OTP_MAX_ATTEMPTS, OTP_MAX_RESENDS, OTP_RESEND_COOLDOWN_MS,
  generateOtp, newSalt, hashOtp, verifyOtp,
} = require('../visits/otp.util');

/* The same six digits, the same ten minutes and the same hashing the
   visit-request flow uses — because it is the same DLT-registered template
   going to the same handsets. Two OTP implementations in one process would
   drift, and the one that drifted would be the one nobody was testing. */
const OTP_LENGTH = 6;

/* How long a code stays locked after too many wrong tries. On the CODE, not
   on the person: asking for a new one clears it, and the number stays usable
   throughout. A lock that punishes somebody for mistyping on a bus is how an
   app loses them at the first screen. */
const LOCK_MS = 10 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CATEGORIES = ['PG_HOSTEL', 'BACHELOR', 'COLIVE', 'HOTEL'];

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

const smsUnavailable = (res) => {
  const problem = smsConfigProblem();
  console.error('[customers] SMS gateway not ready:', problem);
  return res.status(503).json({
    success: false,
    code: 'SMS_NOT_CONFIGURED',
    message: 'We cannot send sign-in codes right now. Please try again shortly.',
  });
};

/** Reads and validates the one field every auth call starts from. */
const readPhone = (body) => {
  const e164 = toE164((body || {}).phone);
  return isIndianMobile(e164) ? e164 : null;
};

/**
 * Issues a code and sends it.
 *
 * Saved before the send, so a gateway that accepts the message and then fails
 * on our side still leaves a code the customer can use. The reverse order
 * would send a code that verifies against nothing.
 */
const issueOtp = async (customer) => {
  const otp = generateOtp();
  const salt = newSalt();

  customer.otp.salt = salt;
  customer.otp.hash = hashOtp(otp, salt);
  customer.otp.expiresAt = new Date(Date.now() + OTP_TTL_MS);
  customer.otp.attempts = 0;
  customer.otp.lockedUntil = null;
  customer.otp.lastSentAt = new Date();
  await customer.save();

  const sent = await sendOtpSms(customer.phone, otp);
  if (sent.success && sent.campId) {
    customer.otp.campId = sent.campId;
    await customer.save();
  }
  return sent;
};

/** The shape every send answers with, so the client has one thing to read. */
const sentPayload = (customer) => ({
  phoneMasked: maskPhone(customer.phone),
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
       would then reject the second with an error about a duplicate key that
       means nothing to anybody reading it. */
    let customer = await Customer.findOne({ phone });
    if (!customer) {
      customer = await Customer.create({
        customerId: `cus_${crypto.randomBytes(9).toString('hex')}`,
        phone,
      });
    }

    if (customer.status === 'blocked') {
      /* Answered as a successful-looking refusal rather than a 200: there is
         nothing for the app to do, and a code is not going out. */
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_BLOCKED',
        message: 'This number cannot be used to sign in. Please contact support.',
      });
    }

    /* The server's own cooldown, applied to `start` as well as `resend`.
       Without it, closing the screen and reopening it is an unlimited resend
       button — and every press is an SMS we pay for. */
    const since = customer.otp.lastSentAt ? Date.now() - customer.otp.lastSentAt.getTime() : Infinity;
    if (since < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - since) / 1000);
      return res.status(429).json({
        success: false,
        code: 'RESEND_TOO_SOON',
        retryAfter: wait,
        message: `We have just sent a code. Please wait ${wait}s before asking for another.`,
        data: sentPayload(customer),
      });
    }

    /* A new send is a new session's worth of tries. */
    customer.otp.resends = 0;
    const sent = await issueOtp(customer);

    if (!sent.success) {
      return res.status(502).json({
        success: false,
        code: 'OTP_SEND_FAILED',
        message: 'We could not send the code to that number. Please check it and try again.',
      });
    }

    return res.status(200).json({ success: true, data: sentPayload(customer) });
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
      return res.status(400).json({ success: false, code: 'BAD_PHONE', message: 'Please enter a valid mobile number.' });
    }

    const customer = await Customer.findOne({ phone });
    /* Deliberately the same answer as a real cooldown would give for a number
       that has one. Saying "no sign-in is in progress for that number" would
       report whether a number is mid-flow to anybody who asks. */
    if (!customer || customer.status === 'blocked') {
      return res.status(429).json({
        success: false,
        code: 'RESEND_TOO_SOON',
        retryAfter: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
        message: 'Please start again from the number.',
      });
    }

    const since = customer.otp.lastSentAt ? Date.now() - customer.otp.lastSentAt.getTime() : Infinity;
    if (since < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - since) / 1000);
      return res.status(429).json({
        success: false,
        code: 'RESEND_TOO_SOON',
        retryAfter: wait,
        message: `Please wait ${wait}s before asking for another code.`,
      });
    }

    if (customer.otp.resends >= OTP_MAX_RESENDS) {
      return res.status(429).json({
        success: false,
        code: 'RESEND_LIMIT',
        message: 'That is the maximum number of codes for one sign-in. Please start again in a few minutes.',
      });
    }

    customer.otp.resends += 1;
    const sent = await issueOtp(customer);
    if (!sent.success) {
      return res.status(502).json({
        success: false,
        code: 'OTP_SEND_FAILED',
        message: 'We could not send the code. Please check the number and try again.',
      });
    }

    return res.json({ success: true, data: sentPayload(customer) });
  } catch (error) {
    return next(error);
  }
};

/* ── POST /auth/verify ────────────────────────────────────────────────────── */

const verifyAuth = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const { otp, name, email, category } = req.body || {};
    const phone = readPhone(req.body);
    if (!phone) {
      return res.status(400).json({ success: false, code: 'BAD_PHONE', message: 'Please enter a valid mobile number.' });
    }

    const customer = await Customer.findOne({ phone });
    /* No code was ever issued for this number. Same 400 and the same wording
       a wrong code gets, so the response cannot be used to discover which
       numbers have accounts. */
    if (!customer || !customer.otp.hash) {
      return res.status(400).json({
        success: false,
        code: 'OTP_WRONG',
        message: 'That code is not right. Ask for a new one.',
      });
    }

    if (customer.status === 'blocked') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_BLOCKED',
        message: 'This number cannot be used to sign in. Please contact support.',
      });
    }

    if (customer.otp.lockedUntil && customer.otp.lockedUntil > new Date()) {
      return res.status(429).json({
        success: false,
        code: 'OTP_LOCKED',
        /* The clock time, so the app can say "try again after 9:41" rather
           than "later". A wait you cannot see the end of is a wait people
           abandon. */
        unlocksAt: customer.otp.lockedUntil,
        message: 'Too many incorrect attempts. Ask for a new code.',
      });
    }

    if (!customer.otp.expiresAt || customer.otp.expiresAt <= new Date()) {
      return res.status(410).json({
        success: false,
        code: 'OTP_EXPIRED',
        message: 'That code has expired. Ask for a new one.',
      });
    }

    if (!verifyOtp(String(otp || '').trim(), customer.otp.salt, customer.otp.hash)) {
      customer.otp.attempts += 1;
      const left = Math.max(0, OTP_MAX_ATTEMPTS - customer.otp.attempts);
      if (left === 0) customer.otp.lockedUntil = new Date(Date.now() + LOCK_MS);
      await customer.save();

      return res.status(400).json({
        success: false,
        code: left === 0 ? 'OTP_LOCKED' : 'OTP_WRONG',
        attemptsLeft: left,
        ...(left === 0 ? { unlocksAt: customer.otp.lockedUntil } : {}),
        message: left > 0
          ? `That code is not right. ${left} attempt${left === 1 ? '' : 's'} left.`
          : 'Too many incorrect attempts. Ask for a new code.',
      });
    }

    /* Correct. The code is destroyed before anything else happens, so the
       same six digits cannot be replayed while the response is in flight. */
    customer.otp = {
      hash: null,
      salt: null,
      expiresAt: null,
      attempts: 0,
      resends: 0,
      lockedUntil: null,
      // Kept: they say when the code went and how it can be traced.
      lastSentAt: customer.otp.lastSentAt,
      campId: customer.otp.campId,
    };

    if (!customer.phoneVerifiedAt) customer.phoneVerifiedAt = new Date();
    customer.lastLoginAt = new Date();

    /*
     * The sign-up fields, applied now that the number is proven.
     *
     * Only ever filled in, never blanked: a sign-in sends no name, and
     * treating that absent field as an instruction to clear one would wipe a
     * returning student's profile on every login.
     */
    if (typeof name === 'string' && name.trim()) customer.name = name.trim().slice(0, 80);
    if (typeof email === 'string' && email.trim()) {
      const cleaned = email.trim().toLowerCase();
      if (!EMAIL_RE.test(cleaned)) {
        return res.status(400).json({
          success: false,
          code: 'BAD_EMAIL',
          message: 'Please enter a valid email address.',
        });
      }
      customer.email = cleaned;
    }
    if (typeof category === 'string' && CATEGORIES.includes(category)) customer.category = category;

    await customer.save();

    return res.json({
      success: true,
      data: {
        token: signCustomerToken(customer),
        customer: customer.toPublic(),
      },
    });
  } catch (error) {
    return next(error);
  }
};

/* ── GET /me ──────────────────────────────────────────────────────────────── */

const getMe = async (req, res) => res.json({ success: true, data: req.customer.toPublic() });

/* ── PATCH /me ────────────────────────────────────────────────────────────── */

const updateMe = async (req, res, next) => {
  try {
    const { name, email, category } = req.body || {};
    const customer = req.customer;

    if (name !== undefined) {
      const cleaned = String(name).trim();
      if (!cleaned) {
        return res.status(400).json({
          success: false,
          code: 'BAD_NAME',
          message: 'Your name cannot be empty — owners see it on a request.',
        });
      }
      customer.name = cleaned.slice(0, 80);
    }

    /* An empty string here IS an instruction: this is the profile editor, and
       clearing the field is how somebody removes an address they no longer
       use. That is the opposite of `verify` above, where an absent field
       means "not supplied" — different endpoints, different intent, and the
       difference is worth stating rather than inferring. */
    if (email !== undefined) {
      const cleaned = String(email).trim().toLowerCase();
      if (cleaned && !EMAIL_RE.test(cleaned)) {
        return res.status(400).json({
          success: false,
          code: 'BAD_EMAIL',
          message: 'Please enter a valid email address.',
        });
      }
      customer.email = cleaned;
    }

    if (category !== undefined) {
      const cleaned = String(category);
      if (cleaned && !CATEGORIES.includes(cleaned)) {
        return res.status(400).json({
          success: false,
          code: 'BAD_CATEGORY',
          message: 'That is not a kind of place we list.',
        });
      }
      customer.category = cleaned;
    }

    /* The phone is absent from this endpoint on purpose. It is the account
       identifier and the code's destination, so changing it needs a code sent
       to the new number AND the old one — a flow, not a field. A PATCH that
       accepted it would let a stolen session move an account to a new phone. */

    await customer.save();
    return res.json({ success: true, data: customer.toPublic() });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  OTP_LENGTH,
  startAuth,
  resendAuth,
  verifyAuth,
  getMe,
  updateMe,
};
