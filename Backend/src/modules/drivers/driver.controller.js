/* ══════════════════════════════════════════════════════════════════════════
   Rider accounts — sign in, the profile, and the duty switch.

   Sign-in and sign-up are the SAME two calls, exactly as they are for
   customers: a number we have seen signs in, a number we have not creates an
   account. The client says which one it thinks is happening so the copy can
   differ, and the server does not believe it — telling somebody "no account
   exists for this number" at the moment they are trying to get in is both
   useless and an account-enumeration oracle.

     POST /auth/start    a number in, a code out by SMS
     POST /auth/verify   the code back, a session out
     POST /auth/resend   another code, on the server's clock
     GET  /me            who this token belongs to, and whether they may work
     PATCH /me           name, dob, city, photo, vehicle, payout
     GET  /me/documents  the five-row checklist and each one's verdict
     POST /me/documents  submit or resubmit one document
     POST /me/duty       the go-online switch
     PATCH /me/location  where they are, every fifteen seconds while online
     GET  /me/earnings   what they have been paid, derived from orders

   ## A new rider cannot work, and that is the point

   Every account is created `pending`. Nothing on this router can move it to
   `approved` — that is an administrator's decision, in the admin console,
   against the licence they uploaded. A module that could approve its own
   accounts is a module where "approved" means nothing, which is the same rule
   that keeps `verificationStatus` out of the food-partner routes.

   ## Going online is not the same as being available

   `POST /me/duty` sets `isOnline` — the rider's own choice, which survives an
   app restart. It deliberately does NOT touch `isAvailable`, which the
   dispatcher owns: a rider who goes offline mid-delivery is still carrying
   food, and clearing their assignment here would strand the order. So going
   offline while on a job is refused, with the order number in the message.

   ## The position is the hot path

   `PATCH /me/location` is called every fifteen seconds by every online rider —
   by a wide margin the most frequent write in this process. It is therefore a
   single `updateOne` with no document load, no validation round trip and no
   response body beyond an acknowledgement. Everything expensive that could be
   done per position (matching, geofencing, trip distance) is deliberately not
   done here.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const Driver = require('./driver.model');
const FoodOrder = require('../foodpartners/foodOrder.model');
const { signDriverToken } = require('./driverAuth.middleware');
const {
  AddressInputError, buildAddress, makeAddressId, publicAddress,
} = require('../../shared/utils/address');
const { sendOtpSms, smsConfigProblem } = require('../../infrastructure/sms/sms');
const { toE164, isIndianMobile, maskPhone } = require('../../infrastructure/twilio/twilio');
const {
  OTP_TTL_MS, OTP_MAX_ATTEMPTS, OTP_MAX_RESENDS, OTP_RESEND_COOLDOWN_MS,
  generateOtp, newSalt, hashOtp, verifyOtp,
} = require('../visits/otp.util');
const {
  makeDriverId, hasFreshLocation, VEHICLE_TYPES,
  DOCUMENT_KINDS, DOCUMENT_LABELS, documentChecklist, onboardingProgress,
} = Driver;

const OTP_LENGTH = 6;
/* On the CODE, not on the person — asking for a new one clears it. The same
   ten minutes the customer flow uses, for the same reason: it is the same
   DLT-registered template. */
const LOCK_MS = 10 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const fail = (res, status, code, message, extra = {}) => res.status(status).json({
  success: false, code, message, error: message, ...extra,
});

const dbDown = (res) => fail(
  res, 503, 'DB_DISCONNECTED', 'The server is running but not connected to the database.',
);

const isUp = () => mongoose.connection.readyState === 1;

const readPhone = (body) => {
  const e164 = toE164((body || {}).phone);
  return isIndianMobile(e164) ? e164 : null;
};

/**
 * Issue a code and send it.
 *
 * Saved BEFORE the send, so a gateway that accepts the message and then fails
 * on our side still leaves a code the rider can use. The reverse order sends a
 * code that verifies against nothing.
 */
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

const sentPayload = (driver) => ({
  phoneMasked: maskPhone(driver.phone),
  otpLength: OTP_LENGTH,
  resendInSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
  maxAttempts: OTP_MAX_ATTEMPTS,
});

/**
 * The rider as their own app sees them.
 *
 * `canGoOnline` and `blockedReason` are computed rather than stored: the app
 * needs one boolean to enable the switch and one sentence to explain a
 * disabled one, and deriving both here means the rule lives in one place
 * instead of being reimplemented in the app against fields it has to
 * interpret.
 */
const selfView = (driver) => {
  const progress = onboardingProgress(driver);
  /* The rejected documents, named, so the app can put "Retake your PAN card"
     in front of a rider instead of a bare "not approved". */
  const needsRedo = progress.documents.filter((doc) => doc.status === 'rejected');

  return {
    ...driver.toJSON(),
    /* Always the full five-row checklist, never only what happens to be
       stored — see `documentChecklist`. Overwrites the raw array from
       `toJSON()` on purpose: one shape reaches the app, and it is the one
       with a row for every document it has to draw. */
    documents: progress.documents,
    /* `[lng, lat]` for the pin, unswapped — the app flips it at the point it
       draws, and nowhere else. */
    address: publicAddress(driver.address),
    onboarding: {
      step: driver.onboardingStep || 'personal',
      complete: progress.complete,
      /* What is left, in the server's words. The app lists these rather than
         reimplementing the rule and disagreeing about it. */
      missing: progress.missing,
    },
    locationFresh: hasFreshLocation(driver),
    canGoOnline: driver.status === 'approved' && driver.hasCompletedOnboarding,
    blockedReason: (() => {
      /* Ordered by what the rider can DO about it. An unfinished form is
         actionable right now and is therefore said first, even while the
         account is technically `pending` — telling somebody their documents
         are under review when they have not sent any is the one message that
         guarantees they wait forever. */
      if (!driver.hasCompletedOnboarding) {
        return progress.missing.length
          ? `Still to add: ${progress.missing.join(', ')}.`
          : 'Finish setting up your profile and vehicle.';
      }
      if (needsRedo.length && driver.status !== 'approved') {
        return `${needsRedo.map((doc) => doc.label).join(' and ')} needs to be sent again.`;
      }
      if (driver.status === 'pending') return 'Your documents are being reviewed.';
      if (driver.status === 'rejected') {
        return driver.statusReason || 'This account was not approved. Please contact support.';
      }
      if (driver.status === 'suspended') {
        return driver.statusReason || 'This account is on hold. Please contact support.';
      }
      return '';
    })(),
  };
};

/* ── POST /auth/start ─────────────────────────────────────────────────────*/

const startAuth = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const phone = readPhone(req.body);
    if (!phone) return fail(res, 400, 'BAD_PHONE', 'Please enter a valid 10-digit Indian mobile number.');

    const problem = smsConfigProblem();
    if (problem) {
      /* Named 503 on this route only, leaving every other flow serving — the
         same rule the rest of the codebase follows. Outside production
         `sendOtpSms` prints the code instead, so development is unaffected. */
      console.error('[drivers] SMS gateway not ready:', problem);
      return fail(
        res, 503, 'SMS_NOT_CONFIGURED',
        'We cannot send sign-in codes right now. Please try again shortly.',
      );
    }

    let driver = await Driver.findOne({ phone });
    if (!driver) {
      driver = new Driver({ driverId: makeDriverId(), phone });
    }

    if (driver.otp.lastSentAt) {
      const since = Date.now() - new Date(driver.otp.lastSentAt).getTime();
      if (since < OTP_RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - since) / 1000);
        return fail(
          res, 429, 'OTP_COOLDOWN',
          `Please wait ${wait} seconds before asking for another code.`,
          { retryAfter: wait },
        );
      }
    }

    await issueOtp(driver);
    return res.json({ success: true, data: sentPayload(driver) });
  } catch (error) {
    return next(error);
  }
};

/* ── POST /auth/resend ────────────────────────────────────────────────────*/

const resendAuth = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const phone = readPhone(req.body);
    if (!phone) return fail(res, 400, 'BAD_PHONE', 'Please enter a valid 10-digit Indian mobile number.');

    const driver = await Driver.findOne({ phone });
    /* The same answer whether or not the number is known — see the header. A
       resend for a number with no pending code is a no-op that looks
       identical from outside. */
    if (!driver) return res.json({ success: true, data: { otpLength: OTP_LENGTH } });

    const since = driver.otp.lastSentAt
      ? Date.now() - new Date(driver.otp.lastSentAt).getTime()
      : Infinity;
    if (since < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - since) / 1000);
      return fail(res, 429, 'OTP_COOLDOWN', `Please wait ${wait} seconds.`, { retryAfter: wait });
    }
    if ((driver.otp.resends || 0) >= OTP_MAX_RESENDS) {
      return fail(
        res, 429, 'OTP_TOO_MANY_RESENDS',
        'Too many codes have been sent to that number. Please try again later.',
      );
    }

    driver.otp.resends = (driver.otp.resends || 0) + 1;
    await issueOtp(driver);
    return res.json({ success: true, data: sentPayload(driver) });
  } catch (error) {
    return next(error);
  }
};

/* ── POST /auth/verify ────────────────────────────────────────────────────*/

const verifyAuth = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const phone = readPhone(req.body);
    const code = String((req.body || {}).code || (req.body || {}).otp || '').trim();
    if (!phone) return fail(res, 400, 'BAD_PHONE', 'Please enter a valid 10-digit Indian mobile number.');
    if (code.length !== OTP_LENGTH) {
      return fail(res, 400, 'BAD_CODE', `The code is ${OTP_LENGTH} digits.`);
    }

    const driver = await Driver.findOne({ phone });
    /* Deliberately the same refusal as a wrong code. A different one here
       would report which numbers have accounts. */
    if (!driver || !driver.otp.hash) {
      return fail(res, 400, 'CODE_INCORRECT', 'That code is not right. Please check and try again.');
    }

    if (driver.otp.lockedUntil && driver.otp.lockedUntil > new Date()) {
      return fail(
        res, 429, 'CODE_LOCKED',
        'Too many wrong tries. Ask for a new code to start again.',
      );
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

    /* Correct. The profile fields the sign-up screen collected are applied
       ONLY now — writing them on `start` would let anybody rename a
       stranger's account by typing their number into a sign-up form. */
    const body = req.body || {};
    if (body.name) driver.name = String(body.name).trim().slice(0, 80);
    if (body.email && EMAIL_RE.test(String(body.email).trim())) {
      driver.email = String(body.email).trim().toLowerCase();
    }

    driver.phoneVerifiedAt = driver.phoneVerifiedAt || new Date();
    driver.lastLoginAt = new Date();
    driver.otp = {
      hash: null, salt: null, expiresAt: null, attempts: 0, resends: 0, lastSentAt: null, campId: null, lockedUntil: null,
    };
    await driver.save();

    const token = signDriverToken(driver);
    if (!token) {
      return fail(res, 503, 'AUTH_NOT_CONFIGURED', 'Sign-in is unavailable right now.');
    }

    return res.json({ success: true, data: { token, driver: selfView(driver) } });
  } catch (error) {
    return next(error);
  }
};

/* ── The signed-in rider ──────────────────────────────────────────────────*/

const getMe = async (req, res) => res.json({ success: true, data: selfView(req.driver) });

/**
 * Where this account stands — the one read a SUSPENDED rider is allowed.
 *
 * `requireDriver` answers 403 ACCOUNT_SUSPENDED before `req.driver` is ever
 * set, which is right for everything that touches the road and wrong for this
 * one question. A rider who is on hold is told to contact support, and until
 * now the app could not tell them WHY they were on hold, because the only
 * route carrying the reason was one they were refused. They were left reading
 * a screen about a decision nobody would show them.
 *
 * So this sits behind `requireDriverForSupport` — the same separate guard the
 * support router uses, admitting a suspended rider and nobody else new. No
 * existing guard is widened; reading your own standing is not riding.
 *
 * It is deliberately NOT `selfView`. This is the narrowest answer that lets
 * the app say something true: what the status is, the sentence an
 * administrator was required to write when they set it, and which documents
 * need retaking. `reviewedBy` is not here and must not be — a decision comes
 * from Lampose, not from a person the rider could go and find.
 */
const getMyStanding = async (req, res) => {
  const driver = req.driver;
  return res.json({
    success: true,
    data: {
      driverId: driver.driverId,
      name: driver.name || '',
      status: driver.status,
      /* Required of the administrator at the moment they suspend or reject, so
         this is empty only on accounts decided before that rule existed. The
         app says so rather than inventing a reason. */
      statusReason: driver.statusReason || '',
      documents: (driver.documents || []).map((doc) => ({
        kind: doc.kind,
        status: doc.status,
        reason: doc.reason || '',
      })),
    },
  });
};

/**
 * Everything the onboarding form and the profile screens collect.
 *
 * Name, date of birth, city, photo, vehicle, and where to be paid. Each field
 * is optional and each is applied independently, so the app can PATCH one step
 * at a time as the rider finishes it and a half-filled form survives the app
 * being killed — which is the difference between a rider who comes back and
 * one who starts again from the beginning.
 *
 * Note what cannot be set: `status`, `documents[].status`, `isAvailable`,
 * `currentOrderNumber`, `driverId`, `phone`. Approval and every document
 * verdict belong to an administrator, availability belongs to the dispatcher,
 * and the number is the account — changing it here would be an account
 * takeover with extra steps. Everything writable is named explicitly rather
 * than spread from the body, which is what makes that list enforceable rather
 * than aspirational.
 *
 * ## `hasCompletedOnboarding` is DERIVED, never accepted
 *
 * The app sends `hasCompletedOnboarding: true` to say "I have shown every
 * step". The server answers by running `onboardingProgress` and setting the
 * flag only if it agrees — because that flag is what `POST /me/duty` gates the
 * road on, and a client that could set it at will could put a rider with no
 * licence in front of a diner by sending one boolean. When it disagrees it
 * says what is missing, in the same words `GET /me` uses.
 */
const updateMe = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { driver } = req;

    if (typeof body.name === 'string') driver.name = body.name.trim().slice(0, 80);
    if (typeof body.email === 'string') {
      const email = body.email.trim().toLowerCase();
      if (email && !EMAIL_RE.test(email)) {
        return fail(res, 400, 'BAD_EMAIL', 'That does not look like an email address.');
      }
      driver.email = email;
    }

    if (typeof body.city === 'string') driver.city = body.city.trim().slice(0, 60);

    /*
     * Where the rider lives. Singular, and NOT part of `onboardingProgress`.
     *
     * An approver reads it beside the Aadhaar — a mismatch there is the second
     * most common reason an application is refused. It is deliberately not a
     * completeness rule: making it one would stop every rider already approved
     * from working until they filled it in, which is a fix that breaks the
     * people it was meant to help.
     *
     * `null` clears it. The shape and its validation are shared with the diner
     * and the owner — see `shared/utils/address.js`.
     */
    if (body.address !== undefined) {
      if (body.address === null) {
        driver.address = undefined;
      } else {
        const fields = buildAddress(body.address, { partial: !!driver.address });
        if (driver.address) {
          Object.entries(fields).forEach(([key, value]) => { driver.address[key] = value; });
        } else {
          driver.address = { addressId: makeAddressId(), ...fields };
        }
      }
    }
    if (typeof body.profilePhotoUrl === 'string') driver.profilePhotoUrl = body.profilePhotoUrl.trim();

    if (body.dateOfBirth !== undefined) {
      /* Refused rather than coerced. `new Date('yesterday')` is
         `Invalid Date`, which Mongoose stores as null and the console then
         renders as "not provided" — a rider who typed something and a form
         that silently forgot it. */
      const dob = new Date(body.dateOfBirth);
      if (Number.isNaN(dob.getTime())) {
        return fail(res, 400, 'BAD_DOB', 'That date of birth could not be read. Use YYYY-MM-DD.');
      }
      /* Eighteen is the floor for a commercial two-wheeler licence in India,
         and this is the last point at which it is cheap to say so — the
         alternative is an approver noticing it against the Aadhaar, or not. */
      const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (age < 18) return fail(res, 400, 'TOO_YOUNG', 'Partners must be at least 18 years old.');
      if (age > 100) return fail(res, 400, 'BAD_DOB', 'Please check that date of birth.');
      driver.dateOfBirth = dob;
    }

    if (body.vehicle && typeof body.vehicle === 'object') {
      if (body.vehicle.type) {
        if (!VEHICLE_TYPES.includes(body.vehicle.type)) {
          return fail(res, 400, 'BAD_VEHICLE', `Vehicle type must be one of: ${VEHICLE_TYPES.join(', ')}.`);
        }
        driver.vehicle.type = body.vehicle.type;
      }
      if (typeof body.vehicle.model === 'string') driver.vehicle.model = body.vehicle.model.trim().slice(0, 60);
      if (typeof body.vehicle.plate === 'string') {
        /* Spaces and hyphens out, so "TS 09 AB 1234" and "TS09AB1234" are one
           plate rather than two. A diner reading a plate at a gate does not
           reproduce the spacing. */
        driver.vehicle.plate = body.vehicle.plate.replace(/[\s-]/g, '').toUpperCase().slice(0, 16);
      }
    }

    if (body.payout && typeof body.payout === 'object') {
      const payout = body.payout;
      if (typeof payout.accountHolderName === 'string') {
        driver.payout.accountHolderName = payout.accountHolderName.trim().slice(0, 80);
      }
      if (typeof payout.bankName === 'string') driver.payout.bankName = payout.bankName.trim().slice(0, 60);
      if (typeof payout.accountType === 'string' && ['savings', 'current'].includes(payout.accountType)) {
        driver.payout.accountType = payout.accountType;
      }
      if (typeof payout.ifscCode === 'string') {
        const ifsc = payout.ifscCode.replace(/\s/g, '').toUpperCase();
        /* Four letters, a zero, six alphanumerics — the RBI's own shape. A
           typo here is a payout that bounces a week later with no clue why,
           and this is the only moment somebody is looking at the field. */
        if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
          return fail(res, 400, 'BAD_IFSC', 'That IFSC code does not look right. It is 11 characters, like HDFC0001432.');
        }
        driver.payout.ifscCode = ifsc;
      }
      if (typeof payout.upiId === 'string') {
        const upi = payout.upiId.trim().toLowerCase();
        if (upi && !/^[\w.-]{2,64}@[a-z]{2,32}$/.test(upi)) {
          return fail(res, 400, 'BAD_UPI', 'That UPI id does not look right. It looks like name@bank.');
        }
        driver.payout.upiId = upi;
      }
      if (typeof payout.bankAccountNumber === 'string') {
        const account = payout.bankAccountNumber.replace(/\s/g, '');
        if (account && !/^\d{9,18}$/.test(account)) {
          return fail(res, 400, 'BAD_ACCOUNT', 'A bank account number is 9 to 18 digits.');
        }
        driver.payout.bankAccountNumber = account;
        /* Written beside the number at the moment it arrives, so no screen in
           the product — the rider's own profile included — ever has a reason
           to select the full number back. */
        driver.payout.accountLast4 = account ? account.slice(-4) : '';
      }
    }

    if (typeof body.onboardingStep === 'string'
      && ['personal', 'vehicle', 'documents', 'bank', 'done'].includes(body.onboardingStep)) {
      driver.onboardingStep = body.onboardingStep;
    }

    /* Derived, not accepted — see the header. Checked AFTER every field on
       this request has landed, so a rider who fills the last box and says
       "done" in one PATCH is finished by that PATCH rather than the next. */
    if (body.hasCompletedOnboarding === true) {
      const progress = onboardingProgress(driver);
      if (!progress.complete) {
        /* Everything valid in the body is still saved — this is a refusal to
           mark the form finished, not a refusal to keep the rider's work. */
        await driver.save();
        return fail(res, 409, 'ONBOARDING_INCOMPLETE', `Still to add: ${progress.missing.join(', ')}.`, {
          missing: progress.missing,
          data: selfView(driver),
        });
      }
      driver.hasCompletedOnboarding = true;
      driver.onboardingStep = 'done';
    }

    await driver.save();
    return res.json({ success: true, data: selfView(driver) });
  } catch (error) {
    /* An address the rider can fix by retyping is a 400 with the sentence that
       says what is wrong, not a 500 from the shared error handler. */
    if (error instanceof AddressInputError) return fail(res, 400, error.code, error.message);
    return next(error);
  }
};

/* ── POST /me/documents ───────────────────────────────────────────────────*/

/**
 * Submit or replace one document.
 *
 * One kind per call, because that is how a rider actually works through it —
 * photograph the licence, send it, photograph the RC. A single batched
 * endpoint would mean a rider who got three of five right sees the whole call
 * fail on the fourth.
 *
 * ## Resubmitting is what this endpoint is FOR
 *
 * A rejected document is not a dead end. Sending the same kind again replaces
 * the URLs and puts the row back to `pending` with the old reason cleared, and
 * the account returns to the approver's queue. Nothing here can set
 * `verified` — the whole reason the rider's own routes cannot write a status
 * is that a module which approves its own documents has no verification in it.
 *
 * The scans arrive as Cloudinary URLs from `POST /me/uploads/images`, which is
 * the only thing in this module that talks to storage. This handler stores
 * strings.
 */
const submitDocument = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { driver } = req;

    const kind = String(body.kind || '').trim().toLowerCase();
    if (!DOCUMENT_KINDS.includes(kind)) {
      return fail(res, 400, 'UNKNOWN_DOCUMENT', `"kind" must be one of: ${DOCUMENT_KINDS.join(', ')}.`);
    }

    const frontUrl = String(body.frontUrl || '').trim();
    const backUrl = String(body.backUrl || '').trim();
    const existing = driver.documents.find((doc) => doc.kind === kind);

    /* A document with no photograph is not a document. Allowed only when one
       is already on file and the rider is correcting the NUMBER on it — a
       common enough fix that making them retake a good photograph for it
       would be its own reason to give up. */
    if (!frontUrl && !(existing && existing.frontUrl)) {
      return fail(res, 400, 'NO_IMAGE', `Attach a photo of your ${DOCUMENT_LABELS[kind].toLowerCase()}.`);
    }

    let expiresAt = existing ? existing.expiresAt : null;
    if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== '') {
      const parsed = new Date(body.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        return fail(res, 400, 'BAD_EXPIRY', 'That expiry date could not be read. Use YYYY-MM-DD.');
      }
      expiresAt = parsed;
    }

    const next_ = {
      kind,
      number: String(body.number ?? (existing ? existing.number : '')).trim().toUpperCase().slice(0, 32),
      frontUrl: frontUrl || existing.frontUrl,
      backUrl: backUrl || (existing ? existing.backUrl : ''),
      expiresAt,
      /* Back to the queue, and the previous refusal cleared with it. Leaving
         the old reason on a freshly-sent photograph is the app telling a rider
         their new upload was already rejected. */
      status: 'pending',
      reason: '',
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedBy: '',
    };

    if (existing) Object.assign(existing, next_);
    else driver.documents.push(next_);

    await driver.save();

    console.log(`🛵 [drivers] ${driver.driverId} submitted ${kind}${existing ? ' (resubmission)' : ''}`);

    return res.json({ success: true, data: selfView(driver) });
  } catch (error) {
    return next(error);
  }
};

/* ── GET /me/documents ────────────────────────────────────────────────────*/

/** The five-row checklist on its own, for the app's Documents screen. */
const getMyDocuments = async (req, res) => res.json({
  success: true,
  data: documentChecklist(req.driver),
});

/* ── POST /me/duty ────────────────────────────────────────────────────────*/

/**
 * The go-online switch.
 *
 * Refuses to take a rider offline mid-delivery. That is not paternalism — the
 * order has their name on it and a diner is waiting; the way out is
 * `POST /orders/:number/release`, which hands the food back to the dispatcher
 * so somebody else can carry it. A silent offline would leave an assigned
 * order with a rider who has stopped receiving anything.
 *
 * Going online with a stale position is allowed and reported. The rider is
 * online, the matcher will skip them until the app reports a fix, and the
 * response says so — which is what lets the app show "waiting for GPS" rather
 * than "you are online" over a switch that will never ring.
 */
const setDuty = async (req, res, next) => {
  try {
    const { driver } = req;
    const online = (req.body || {}).online === true || (req.body || {}).online === 'true';

    if (online && driver.status !== 'approved') {
      return fail(
        res, 403, 'NOT_APPROVED',
        driver.status === 'pending'
          ? 'Your documents are still being reviewed.'
          : 'This account cannot take deliveries. Please contact support.',
      );
    }
    if (online && !driver.hasCompletedOnboarding) {
      return fail(res, 409, 'ONBOARDING_INCOMPLETE', 'Finish setting up your profile and vehicle first.');
    }
    if (!online && driver.currentOrderNumber) {
      return fail(
        res, 409, 'ON_A_DELIVERY',
        `You are still carrying ${driver.currentOrderNumber}. Finish it before going offline.`,
      );
    }

    driver.isOnline = online;
    driver.onlineSince = online ? (driver.onlineSince || new Date()) : null;
    /* Only ever set TRUE here, and only when going online with nothing in
       hand. The dispatcher owns the false. */
    if (online && !driver.currentOrderNumber) driver.isAvailable = true;
    await driver.save();

    console.log(`🛵 [duty] ${driver.driverId} is ${online ? 'ONLINE' : 'offline'}`);

    return res.json({
      success: true,
      data: {
        isOnline: driver.isOnline,
        isAvailable: driver.isAvailable,
        onlineSince: driver.onlineSince,
        locationFresh: hasFreshLocation(driver),
        /* The honest caveat. See above. */
        note: online && !hasFreshLocation(driver)
          ? 'You are online, but we cannot see where you are yet — turn on location so orders can reach you.'
          : '',
      },
    });
  } catch (error) {
    return next(error);
  }
};

/* ── PATCH /me/location ───────────────────────────────────────────────────*/

/**
 * Where the rider is. The hot path — see the header.
 *
 * `updateOne` rather than load-mutate-save: this runs four times a minute per
 * online rider and a document round trip per call would be the largest source
 * of load in the process for no benefit. The trade-off is that schema
 * validators do not run on the sub-document, so the range check is done here
 * explicitly rather than left to the model.
 */
const updateLocation = async (req, res, next) => {
  try {
    const body = req.body || {};
    const lat = Number(body.lat ?? body.latitude);
    const lng = Number(body.lng ?? body.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)
      || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return fail(res, 400, 'BAD_COORDS', 'Send lat between -90 and 90, and lng between -180 and 180.');
    }

    const heading = Number(body.heading);
    const update = {
      /* [LONGITUDE, LATITUDE] — MongoDB's order. Named inputs above are the
         only defence against the swap; see `driver.model.js`. */
      currentLocation: { type: 'Point', coordinates: [lng, lat] },
      locationUpdatedAt: new Date(),
    };
    if (Number.isFinite(heading)) update.heading = ((heading % 360) + 360) % 360;

    await Driver.updateOne({ driverId: req.driver.driverId }, { $set: update });

    /* Relayed to whoever is watching the order this rider is carrying. Only
       while they are actually carrying one — a position broadcast between jobs
       is a rider's movements going to nobody who should have them.

       `heading` rides along whenever this update carried one — same
       `update.heading` just computed above, not re-derived — so a diner's
       socket-fed map can turn the marker the moment a fix arrives instead
       of waiting for their next poll to read it back off `GET .../orders/:id`.
       Omitted (not sent as `null`) when this update had none, so the client
       side's existing "hold the last known heading" behaviour is what
       applies rather than every client having to special-case a `null`. */
    if (req.driver.currentOrderNumber) {
      const realtime = require('../../infrastructure/realtime/realtime');
      realtime.toOrder(req.driver.currentOrderNumber, 'driver_location', {
        orderNumber: req.driver.currentOrderNumber,
        driverId: req.driver.driverId,
        lat,
        lng,
        ...(Number.isFinite(update.heading) ? { heading: update.heading } : null),
        at: new Date().toISOString(),
      });
    }

    /* No body worth parsing. A rider on 2G sends this four times a minute and
       every byte back is one they paid for. */
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
};

/* ── GET /me/earnings ─────────────────────────────────────────────────────*/

/**
 * What this rider has been paid.
 *
 * DERIVED from `food_orders`, never from a counter — see the note in
 * `driver.model.js`. A counter and a ledger that disagree is the worst bug
 * this product could have, and the only way they cannot disagree is for there
 * to be one of them.
 *
 * Only delivered orders count. An order in progress has not been paid for and
 * showing it would mean the number goes DOWN when a delivery is cancelled,
 * which is how a rider comes to believe they were docked.
 */
const getEarnings = async (req, res, next) => {
  try {
    if (!isUp()) return dbDown(res);

    const { driverId } = req.driver;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - 6);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const delivered = await FoodOrder.find({
      'delivery.driverId': driverId,
      status: 'delivered',
      'delivery.deliveredAt': { $gte: startOfMonth < startOfWeek ? startOfMonth : startOfWeek },
    }).select('delivery.earnings delivery.deliveredAt').lean();

    const sum = (from) => delivered
      .filter((order) => order.delivery.deliveredAt >= from)
      .reduce((total, order) => total + (order.delivery.earnings || 0), 0);

    const trips = (from) => delivered.filter((order) => order.delivery.deliveredAt >= from).length;

    /* Seven bars, oldest first, so the chart never has to guess which end is
       today. Empty days are present with a zero rather than absent — a chart
       that skips them silently redraws Monday as Tuesday. */
    const weekly = [];
    for (let back = 6; back >= 0; back -= 1) {
      const day = new Date(startOfDay);
      day.setDate(day.getDate() - back);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      weekly.push({
        day: day.toISOString().slice(0, 10),
        amount: delivered
          .filter((o) => o.delivery.deliveredAt >= day && o.delivery.deliveredAt < nextDay)
          .reduce((total, o) => total + (o.delivery.earnings || 0), 0),
      });
    }

    const monthTotal = await FoodOrder.aggregate([
      {
        $match: {
          'delivery.driverId': driverId,
          status: 'delivered',
          'delivery.deliveredAt': { $gte: startOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: '$delivery.earnings' } } },
    ]);

    return res.json({
      success: true,
      data: {
        today: sum(startOfDay),
        week: sum(startOfWeek),
        month: monthTotal.length ? monthTotal[0].total : 0,
        todayTrips: trips(startOfDay),
        weekTrips: trips(startOfWeek),
        monthTrips: trips(startOfMonth),
        onlineMinutes: req.driver.onlineSince
          ? Math.round((Date.now() - new Date(req.driver.onlineSince).getTime()) / 60000)
          : 0,
        weekly,
      },
    });
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
  getMyStanding,
  updateMe,
  submitDocument,
  getMyDocuments,
  setDuty,
  updateLocation,
  getEarnings,
  selfView,
};
