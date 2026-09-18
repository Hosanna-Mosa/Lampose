/* ══════════════════════════════════════════════════════════════════════════
   "Delete my account", asked for from the open web.

   Google Play requires that a rider be able to ask for their account and data
   to be deleted WITHOUT the app and WITHOUT signing in, from a page anybody
   can open. `lampose.com/delete-account` is that page, and this is what it
   talks to.

   That requirement is also the whole difficulty. The form is public, so the
   only thing it can be given is a phone number, and a phone number is not
   proof of anything — it is a string somebody typed, and the person typing it
   may be an ex-flatmate with a grudge. So:

     POST /account/deletion/start     a number in, a one-time code out by SMS
     POST /account/deletion/confirm   the code back, and the account is MARKED

   The code is what makes the request the account holder's. Nothing is marked
   until it comes back correct, and nothing is deleted even then.

   ## Why nothing is deleted here

   `confirm` sets `deletion.status = 'requested'` and a date. It does not
   remove the row, and the page says so in those words. Three reasons, and
   only the first is about us:

     · A rider carrying an order has somebody's dinner on their bike.
     · Money owed has to be paid, and the records proving it was paid are
       books of account the law requires us to keep.
     · A tap made in anger at 11pm is one people ask us to undo at 9am.

   `DELETION_GRACE_DAYS` is that window, and it is the number the page prints.
   The two must agree, which is why the page is served the value rather than
   having it typed into the copy.

   ## Nothing here says whether a number has an account

   Every answer from `start` is the same envelope whether or not the number is
   registered, and `confirm` answers a wrong code and an unknown number with
   one refusal. A public form that replies differently to the two is a way to
   test whether somebody rides for Lampose, and the rest of this module is
   already careful about exactly that.

   ## Asking twice is not an error

   Somebody who fills the form in again, or who taps the button twice on a
   slow connection, has not done anything wrong and should not be told they
   have. A request that already exists is reported as the existing one, with
   its own dates, and nothing is overwritten.
   ══════════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const Driver = require('./driver.model');
const FoodOrder = require('../foodpartners/foodOrder.model');
const { sendOtpSms, smsConfigProblem } = require('../../infrastructure/sms/sms');
const { toE164, isIndianMobile, maskPhone } = require('../../infrastructure/twilio/twilio');
const {
  OTP_TTL_MS, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS,
  generateOtp, newSalt, hashOtp, verifyOtp,
} = require('../visits/otp.util');

const OTP_LENGTH = 6;
const LOCK_MS = 10 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * How long a confirmed request waits before it may be carried out.
 *
 * Printed on the page, so the page asks for it rather than repeating it — a
 * site promising 30 days against a server that waits 14 is the disagreement
 * that ends up in front of a regulator.
 */
const DELETION_GRACE_DAYS = 30;
const MAX_REASON = 500;

const fail = (res, status, code, message, extra = {}) => res.status(status).json({
  success: false, code, message, error: message, ...extra,
});

const isUp = () => mongoose.connection.readyState === 1;
const dbDown = (res) => fail(
  res, 503, 'DB_DISCONNECTED', 'The server is running but not connected to the database.',
);

const readPhone = (body) => {
  const e164 = toE164((body || {}).phone);
  return isIndianMobile(e164) ? e164 : null;
};

/*
 * The one answer `start` ever gives.
 *
 * Identical whether the number is registered or not — see the header. The
 * masked number is echoed from what was TYPED rather than from a record, so
 * that even the shape of the reply carries nothing we were not given.
 */
const startedPayload = (phone) => ({
  phoneMasked: maskPhone(phone),
  otpLength: OTP_LENGTH,
  resendInSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
  maxAttempts: OTP_MAX_ATTEMPTS,
  graceDays: DELETION_GRACE_DAYS,
});

/* Identical to the sign-in issuer, on purpose: same six digits, same
   DLT-registered template, same gateway, same `otp.util.js`. */
const issueOtp = async (driver) => {
  const otp = generateOtp();
  const salt = newSalt();

  driver.otp.salt = salt;
  driver.otp.hash = hashOtp(otp, salt);
  driver.otp.expiresAt = new Date(Date.now() + OTP_TTL_MS);
  driver.otp.attempts = 0;
  driver.otp.lockedUntil = null;
  driver.otp.lastSentAt = new Date();
  await driver.save();

  const sent = await sendOtpSms(driver.phone, otp);
  if (sent.success && sent.campId) {
    driver.otp.campId = sent.campId;
    await driver.save();
  }
  return sent;
};

/** What the page prints back to the rider once a request stands. */
const requestView = (driver) => ({
  status: driver.deletion.status,
  requestedAt: driver.deletion.requestedAt,
  scheduledFor: driver.deletion.scheduledFor,
  graceDays: DELETION_GRACE_DAYS,
  phoneMasked: maskPhone(driver.phone),
});

/* ── POST /api/v2/drivers/account/deletion/start ──────────────────────────── */

/**
 * Send the code that proves the number belongs to whoever is asking.
 *
 * A number with no account is answered exactly as one with an account, and no
 * account is ever CREATED here — which is the difference between this and
 * `/auth/start`, where an unknown number is a sign-up. A deletion form that
 * created the account it was asked to delete would be a joke at somebody's
 * expense.
 */
const startDeletion = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const phone = readPhone(req.body);
    if (!phone) {
      return fail(res, 400, 'BAD_PHONE', 'Please enter a valid 10-digit Indian mobile number.');
    }

    const driver = await Driver.findOne({ phone });

    /* No account. Answered as though there were one — and no SMS is sent,
       because sending one would tell the OWNER of that number that somebody
       is trying to delete an account they do not have. */
    if (!driver) {
      return res.json({ success: true, data: startedPayload(phone) });
    }

    /* Already asked, and still inside the window. Say so plainly: this is the
       duplicate case, and it is not a failure. */
    if (driver.deletion.status === 'requested') {
      return res.json({
        success: true,
        data: { ...startedPayload(phone), alreadyRequested: true, request: requestView(driver) },
      });
    }

    const cooling = driver.otp.lastSentAt
      && Date.now() - new Date(driver.otp.lastSentAt).getTime() < OTP_RESEND_COOLDOWN_MS;
    if (cooling) {
      const wait = Math.ceil(
        (OTP_RESEND_COOLDOWN_MS - (Date.now() - new Date(driver.otp.lastSentAt).getTime())) / 1000,
      );
      /* A code is already on its handset, so this is not a refusal to help —
         the page moves on to the code box either way. */
      return res.json({
        success: true,
        data: { ...startedPayload(phone), resendInSeconds: wait },
      });
    }

    const problem = smsConfigProblem();
    if (problem) {
      return fail(
        res, 503, 'SMS_NOT_CONFIGURED',
        'We cannot send a code right now. Please email support and we will process your request by hand.',
      );
    }

    const sent = await issueOtp(driver);
    if (!sent.success) {
      return fail(
        res, 502, 'SMS_SEND_FAILED',
        'The code could not be sent. Please try again in a moment, or email support.',
      );
    }

    return res.json({ success: true, data: startedPayload(phone) });
  } catch (error) {
    return next(error);
  }
};

/* ── POST /api/v2/drivers/account/deletion/confirm ────────────────────────── */

/**
 * The code back, and the account is marked.
 *
 * Marked, not deleted — see the header. What this writes is a dated request
 * and the words the rider gave for it; what it does not write is any change to
 * the ACCOUNT's own status, which stays whatever an administrator set.
 */
const confirmDeletion = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const body = req.body || {};
    const phone = readPhone(body);
    const code = String(body.code || body.otp || '').trim();

    if (!phone) {
      return fail(res, 400, 'BAD_PHONE', 'Please enter a valid 10-digit Indian mobile number.');
    }
    if (code.length !== OTP_LENGTH) {
      return fail(res, 400, 'BAD_CODE', `The code is ${OTP_LENGTH} digits.`);
    }

    const email = String(body.email || '').trim().toLowerCase();
    if (email && !EMAIL_RE.test(email)) {
      return fail(res, 400, 'BAD_EMAIL', 'That email address does not look right. Leave it blank if you would rather not give one.');
    }

    const driver = await Driver.findOne({ phone });

    /* Deliberately the same refusal a wrong code gets. A different one would
       report which numbers have accounts, from a form anybody can open. */
    if (!driver || !driver.otp.hash) {
      return fail(res, 400, 'CODE_INCORRECT', 'That code is not right. Please check and try again.');
    }

    if (driver.otp.lockedUntil && driver.otp.lockedUntil > new Date()) {
      return fail(res, 429, 'CODE_LOCKED', 'Too many wrong tries. Ask for a new code to start again.');
    }
    if (!driver.otp.expiresAt || driver.otp.expiresAt < new Date()) {
      return fail(res, 400, 'CODE_EXPIRED', 'That code has expired. Ask for a new one.');
    }

    if (!verifyOtp(code, driver.otp.salt, driver.otp.hash)) {
      driver.otp.attempts = (driver.otp.attempts || 0) + 1;
      if (driver.otp.attempts >= OTP_MAX_ATTEMPTS) {
        driver.otp.lockedUntil = new Date(Date.now() + LOCK_MS);
      }
      await driver.save();
      return fail(res, 400, 'CODE_INCORRECT', 'That code is not right. Please check and try again.');
    }

    /* Correct. The code is destroyed first, so the same six digits cannot be
       replayed while this response is in flight. */
    driver.otp = {
      hash: null, salt: null, expiresAt: null, attempts: 0, resends: 0,
      lastSentAt: driver.otp.lastSentAt, campId: driver.otp.campId, lockedUntil: null,
    };

    /* Asking again inside the window changes nothing and is not an error. The
       original dates stand — a second request must not quietly extend the very
       window the rider is waiting out. */
    if (driver.deletion.status === 'requested') {
      await driver.save();
      return res.json({
        success: true,
        data: { ...requestView(driver), alreadyRequested: true },
        message: 'Your account is already scheduled for deletion.',
      });
    }

    const now = new Date();
    driver.deletion.status = 'requested';
    driver.deletion.requestedAt = now;
    driver.deletion.scheduledFor = new Date(now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    driver.deletion.reason = String(body.reason || '').trim().slice(0, MAX_REASON);
    driver.deletion.contactEmail = email;
    driver.deletion.source = 'web';
    await driver.save();

    /*
     * Whether anything is in their hands right now.
     *
     * Reported rather than refused: somebody may ask to leave in the middle of
     * a shift and is entitled to, but the page should say that the delivery
     * they are carrying still has to arrive. Counted after the request is
     * saved, so a slow query can never be the reason a request was lost.
     */
    let activeOrders = 0;
    try {
      activeOrders = await FoodOrder.countDocuments({
        'dispatch.driverId': driver.driverId,
        status: { $nin: ['delivered', 'cancelled', 'rejected'] },
      });
    } catch {
      /* A count is not worth failing a deletion request over. */
    }

    console.log(`🗑️  [Driver Deletion] ${maskPhone(driver.phone)} requested deletion — due ${driver.deletion.scheduledFor.toISOString()}`);

    return res.status(201).json({
      success: true,
      message: 'Your deletion request has been received.',
      data: { ...requestView(driver), activeOrders },
    });
  } catch (error) {
    return next(error);
  }
};

/* ── GET /api/v2/drivers/account/deletion/policy ──────────────────────────── */

/**
 * The numbers the page prints, from the server that enforces them.
 *
 * Public and uninteresting on purpose: it names no account and takes no input.
 * It exists so the grace period on the page cannot drift from the one in this
 * file — a published promise of 30 days against a server that waits 14 is the
 * disagreement worth spending one endpoint to prevent.
 */
const deletionPolicy = (req, res) => res.json({
  success: true,
  data: {
    app: 'Lampose Delivery Partner',
    graceDays: DELETION_GRACE_DAYS,
    otpLength: OTP_LENGTH,
    supportEmail: process.env.SUPPORT_EMAIL || 'contact@lampose.com',
  },
});

module.exports = {
  DELETION_GRACE_DAYS,
  startDeletion,
  confirmDeletion,
  deletionPolicy,
};
