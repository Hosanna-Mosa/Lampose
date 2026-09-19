/* ══════════════════════════════════════════════════════════════════════════
   Getting a restaurant into `food_restaurants`, and keeping it there.

   Seven handlers, and they are the whole of a food partner's relationship
   with this backend before it has a menu:

     POST   /auth/otp/start        a number in, a code out by SMS
     POST   /auth/otp/verify       the code back, a short-lived phone proof out
     POST   /applications          the whole onboarding form, in one body
     POST   /auth/login            email or phone plus password, a session out
     GET    /me                    who this session belongs to
     PATCH  /me                    the operations fields, and only those
     PATCH  /me/availability       the manual open/closed override

   The menu, the uploads and the three public screens live in their own files.
   What is here is identity and the application, which are the two things that
   have to be right before anything else in the module means anything.

   ## `submitApplication` is the centre of this file

   It is one request carrying twenty minutes of somebody's typing: a licence
   number, a bank account, a week of opening hours and a menu dish by dish. It
   is therefore written around a single assumption — that it will fail
   sometimes, and that a failure must leave the partner able to press the
   button again. Three decisions follow from that and are load-bearing:

     · THE CONSOLE BLOCK IS PRINTED BEFORE ANYTHING IS CHECKED. `logApplicationSteps`
       runs the moment the body has been read, ahead of validation and well
       ahead of the write. "What did they actually send" is the first question
       asked about every rejection, and a validator that returns early is the
       one thing guaranteed not to answer it. The log must survive the failure
       it exists to diagnose.

     · EVERY PROBLEM IS REPORTED AT ONCE, never the first one. A form that
       refuses one field per round trip is a form somebody abandons on the
       fourth attempt, and `validateApplication` already returns the whole list
       in the app's own voice.

     · A HALF-WRITTEN APPLICATION IS COMPENSATED AWAY. If the restaurant saves
       and the menu insert then fails, the restaurant is deleted again. The
       alternative is the worst outcome available here: an account holding the
       partner's email and phone number, with no menu, which they cannot
       resubmit because their own email is now taken and cannot sign into
       usefully because there is nothing there. There is no transaction to lean
       on — a standalone MongoDB deployment is not a replica set and has no
       sessions — so the compensating delete is the honest substitute, and it
       is named as exactly that rather than dressed up as atomicity. It can
       itself fail; when it does, the failure is printed with the id, because
       the row then needs a person.

   ## Where the one-time code lives, which is nowhere in the database

   `foodRestaurant.model.js` says there is no `otp` sub-document on purpose:
   the code is sent BEFORE the restaurant exists, and a half-document invented
   to hold one would put unverified junk in the collection every time somebody
   abandoned the form. So the pending codes live in a module-level Map, keyed
   by the E.164 number, holding a salted hash of the code and never the code —
   the same `visits/otp.util` the visit-request flow and the User App already
   use, because it is the same six digits going to the same handsets through
   the same DLT template, and a second implementation would drift.

   Two limits of that choice, stated rather than discovered:

     · A RESTART DROPS PENDING CODES. The partner asks for another, which
       costs one SMS and a tap. Nothing is lost, because nothing had been
       written yet.
     · A SECOND INSTANCE BEHIND A LOAD BALANCER WOULD NOT SEE THEM. One
       process serves every Lampose client today; the day that stops being
       true, this Map becomes a small collection with a TTL index, and the
       shape here (issue, read, spend, sweep) is deliberately the shape that
       port would take.

   ## The password

   Hashed with bcryptjs through `FoodRestaurant.hashPassword` — the model
   forbids a hashing pre-save hook, because this controller hashes first and an
   auto-hook would silently bcrypt the bcrypt. The plaintext arrives on its own
   key from `sanitiseApplication`, is used once, and is never assigned to a
   document. It is never logged, in either outcome: a mistyped password at a
   failed sign-in is usually a real password with one character wrong.

   ## Failure shape

   `{ success: false, code, message, error }` — all four, on every refusal.
   The website reads `message`, the apps switch on `code`, older screens still
   render `error`, and any one of them missing is a blank alert on somebody's
   phone. Success is `{ success: true, data, … }`. Nothing here exits the
   process: a missing database, SMS gateway or `JWT_SECRET` is a named 503 on
   the affected route and nothing else.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../../config/env');
const { sendOtpSms, smsConfigProblem } = require('../../infrastructure/sms/sms');
const {
  OTP_TTL_MS, OTP_MAX_ATTEMPTS, OTP_MAX_RESENDS, OTP_RESEND_COOLDOWN_MS,
  generateOtp, newSalt, hashOtp, verifyOtp,
} = require('../visits/otp.util');

const FoodRestaurant = require('./foodRestaurant.model');
const FoodProduct = require('./foodProduct.model');
const {
  signFoodPartnerToken, signPhoneVerificationToken, readPhoneProof, PHONE_TOKEN_TTL,
} = require('./foodPartnerAuth.middleware');
const {
  normalisePhone, isIndianMobile, buildOpeningHours,
  sanitiseApplication, validateApplication,
} = require('./foodPartner.util');
const {
  logApplicationSteps, logApplicationSaved, logRejected, logLogin, logAvailability,
  logDependencyMissing, logError, startTimer, PREFIX,
} = require('./foodPartner.log');

const {
  makeRestaurantId, phoneKey, isOpenNow, OPEN_STATES, DELIVERY_FEE_TYPES,
} = FoodRestaurant;
const { makeProductId } = FoodProduct;

/* Six, because that is what the DLT-registered template says and the template
   cannot be changed on a whim. Named here so the client can size its input
   boxes from the response rather than from a guess. */
const OTP_LENGTH = 6;

/* How long a code stays locked after too many wrong tries. On the CODE and not
   on the number: asking for a new one clears it. A lock that punishes somebody
   for mistyping on a bus is how an app loses them at the first screen. The same
   ten minutes `customers/customer.controller.js` settled on. */
const LOCK_MS = 10 * 60 * 1000;

/* ── Replies ──────────────────────────────────────────────────────────────
   `code`, `message` AND `error` on every failure — see the header. The same
   four helpers `support/ticket.controller.js` and `foodUpload.controller.js`
   use, so a client meets one failure shape across the whole module. */

const fail = (res, status, code, message, extra = {}) => res.status(status).json({
  success: false, code, message, error: message, ...extra,
});

const badInput = (res, message, code = 'BAD_INPUT', extra = {}) => (
  fail(res, 400, code, message, extra)
);

const notFound = (res, message = 'We could not find that.') => (
  fail(res, 404, 'NOT_FOUND', message)
);

const dbDown = (res) => fail(
  res,
  503,
  'DB_DISCONNECTED',
  'The server is running but not connected to the database.',
);

/* Only ever reached if the routes file forgot `requireAuthConfig`, which is
   why it is here at all: a forgotten guard becomes a named 503 rather than a
   500 thrown out of jsonwebtoken about `secretOrPrivateKey`. */
const authNotConfigured = (res, route) => {
  logDependencyMissing({
    dependency: 'JWT_SECRET',
    code: 'AUTH_NOT_CONFIGURED',
    route,
    hint: 'set JWT_SECRET in .env and restart; no token is issued without it',
  });
  return fail(
    res,
    503,
    'AUTH_NOT_CONFIGURED',
    'Sign-in is not available on this server right now.',
  );
};

/* ── One console line that is not one of the logger's named events ────────
   `foodPartner.log.js` exports `PREFIX` for exactly this: the badge is the
   grep string for the whole module and must not be retyped. The
   `config.log.enabled` check is repeated because these lines do not go
   through the logger's own `safely` wrapper, and the promise that a single
   switch turns this module quiet has to hold for them too. */
const note = (...parts) => {
  if (!config.log.enabled) return;
  try {
    console.log(`${PREFIX} ${parts.filter(Boolean).join(' ')}`);
  } catch (error) {
    /* The console itself is gone. There is nothing further to try. */
  }
};

/* ── Phone numbers ────────────────────────────────────────────────────────*/

/**
 * The last four digits, and nothing else.
 *
 * Written here rather than imported from `infrastructure/twilio/twilio.js`
 * for the reason `foodPartner.util.js` gives about `normalisePhone`: requiring
 * that module constructs a Twilio SDK client and prints a credentials warning
 * as a side effect, and this file is loaded on every food-partner call
 * including the ones that never send a message.
 */
const maskPhone = (e164) => {
  const digits = String(e164 || '').replace(/\D/g, '');
  return digits.length >= 4 ? `••••••${digits.slice(-4)}` : '••••';
};

/** The one field every OTP call starts from, or null. */
const readMobile = (body) => {
  const e164 = normalisePhone((body || {}).phone || (body || {}).ownerPhone);
  return isIndianMobile(e164) ? e164 : null;
};

/* ══════════════════════════════════════════════════════════════════════════
   The pending phone codes

   In this process and nowhere else. See the header for why there is no
   collection behind this and what would replace it on the day a second
   instance exists.
   ══════════════════════════════════════════════════════════════════════════ */

const pendingCodes = new Map();

/* A code that nobody ever came back for would otherwise sit in the Map for the
   life of the process. Swept on every `start`, which is the only call that can
   grow it — a sweep on a timer would be a second thing to reason about for a
   map that is a few dozen entries at its worst. */
const sweepExpiredCodes = (at = Date.now()) => {
  pendingCodes.forEach((entry, key) => {
    const dead = entry.expiresAt <= at
      && (!entry.lockedUntil || entry.lockedUntil <= at);
    if (dead) pendingCodes.delete(key);
  });
};

/**
 * Issues a code for a number and tries to send it.
 *
 * The entry is stored BEFORE the send, exactly as the customer flow does it: a
 * gateway that accepts the message and then fails on our side still leaves a
 * code the partner can type. The reverse order sends a code that verifies
 * against nothing.
 *
 * `resends` is carried across, because it is the counter that stops one number
 * being used to send a hundred messages at our expense.
 */
const issuePhoneCode = async (phone) => {
  const previous = pendingCodes.get(phone);
  const code = generateOtp();
  const salt = newSalt();

  pendingCodes.set(phone, {
    salt,
    hash: hashOtp(code, salt),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    lockedUntil: null,
    lastSentAt: Date.now(),
    resends: previous ? previous.resends + 1 : 0,
  });

  const sent = await sendOtpSms(phone, code);

  /*
   * DEVELOPMENT ONLY, and the marker says so on the line itself.
   *
   * Printed only when the code did NOT go out — an unconfigured gateway, or a
   * send the gateway refused — so the onboarding flow is walkable on a laptop
   * with no DLT account, which is the state every new developer starts in.
   *
   * Safe here and emphatically not in production. A development console prints
   * to the terminal of the person who started the process, against a throwaway
   * database. A production console is aggregated into a log system several
   * people and at least one vendor can read, and a printed code is a working
   * credential for whatever number is beside it — which in this module is a
   * licence to submit an application in somebody else's name.
   */
  if (!sent.success && !config.isProduction) {
    note(
      '🔓',
      'DEV-ONLY ·',
      `the code for ${phone} is ${code}`,
      `· ${sent.code || 'SMS_SEND_FAILED'}`,
      '· this line is never printed when NODE_ENV=production',
    );
  }

  return sent;
};

/** The shape every send answers with, so the client has one thing to read. */
const sentPayload = (phone) => ({
  phoneMasked: maskPhone(phone),
  otpLength: OTP_LENGTH,
  expiresInSeconds: Math.ceil(OTP_TTL_MS / 1000),
  resendInSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
  maxAttempts: OTP_MAX_ATTEMPTS,
});

// @route   POST /api/v2/food-partners/auth/otp/start
// @desc    Send a one-time code to the owner's mobile, before any account exists
// @access  Public (rate-limited in the routes file)
const startPhoneOtp = async (req, res, next) => {
  try {
    const phone = readMobile(req.body);
    if (!phone) {
      logRejected('the number could not receive a code', {
        code: 'BAD_PHONE', field: 'phone', status: 400,
      });
      return badInput(
        res,
        'Please enter a valid 10-digit Indian mobile number.',
        'BAD_PHONE',
      );
    }

    /*
     * Whether this number already has a restaurant is deliberately NOT checked
     * here, and the answer is deliberately not in the response. An endpoint
     * that reports which numbers have accounts is a way to test a list of
     * numbers against our partner base, and the application route refuses a
     * duplicate anyway — with a message that sends the partner to sign in,
     * which is the point at which knowing is useful and authenticated.
     */

    const problem = smsConfigProblem();

    /* In production a code that cannot be sent is a dead end, and saying so is
       the whole of the "degrade loudly, per route" rule. Outside production the
       flow carries on and the code is printed instead — see `issuePhoneCode`. */
    if (problem && config.isProduction) {
      logDependencyMissing({
        dependency: `the DLT SMS gateway (${problem})`,
        code: 'SMS_NOT_CONFIGURED',
        route: 'POST /api/v2/food-partners/auth/otp/start',
        hint: 'set the SMS_* variables in .env; nothing else in this module is affected',
      });
      return fail(
        res,
        503,
        'SMS_NOT_CONFIGURED',
        'We cannot send verification codes right now. Please try again shortly.',
      );
    }

    sweepExpiredCodes();

    const existing = pendingCodes.get(phone);
    if (existing) {
      const since = Date.now() - existing.lastSentAt;
      if (since < OTP_RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - since) / 1000);
        return fail(
          res,
          429,
          'OTP_COOLDOWN',
          `Please wait ${wait} seconds before asking for another code.`,
          { retryAfter: wait },
        );
      }
      /* Every send costs real money and rings a real handset. Three is enough
         for a genuinely lost message and few enough that this is not a way to
         make a stranger's phone buzz all afternoon. */
      if (existing.resends >= OTP_MAX_RESENDS) {
        return fail(
          res,
          429,
          'OTP_TOO_MANY_RESENDS',
          'Too many codes have been sent to that number. Please try again later.',
        );
      }
    }

    const sent = await issuePhoneCode(phone);

    if (!sent.success && config.isProduction) {
      logRejected('the gateway would not send the code', {
        code: sent.code || 'OTP_SEND_FAILED', field: 'phone', status: 502,
      });
      return fail(
        res,
        502,
        'OTP_SEND_FAILED',
        'We could not send the code. Please check the number and try again.',
      );
    }

    note(
      '📨',
      'OTP SENT ·',
      maskPhone(phone),
      sent.success ? '· by SMS' : '· NOT SENT (development, see the DEV-ONLY line above)',
      sent.campId ? `· campId ${sent.campId}` : '',
    );

    return res.json({ success: true, data: sentPayload(phone) });
  } catch (error) {
    logError('could not start phone verification', error);
    return next(error);
  }
};

// @route   POST /api/v2/food-partners/auth/otp/verify
// @desc    Check the code and hand back a short-lived proof of the number
// @access  Public (rate-limited in the routes file)
const verifyPhoneOtp = async (req, res, next) => {
  try {
    if (!config.auth.configured) {
      return authNotConfigured(res, 'POST /api/v2/food-partners/auth/otp/verify');
    }

    const phone = readMobile(req.body);
    if (!phone) {
      return badInput(
        res,
        'Please enter a valid 10-digit Indian mobile number.',
        'BAD_PHONE',
      );
    }

    const code = String((req.body || {}).otp || (req.body || {}).code || '').trim();
    const entry = pendingCodes.get(phone);

    /* One answer for "no code was ever sent to that number" and for "the code
       has been used". Both mean the same thing to the app — start again — and
       telling them apart would say whether somebody else had just verified
       that number. */
    if (!entry) {
      return badInput(
        res,
        'That code has expired. Please ask for a new one.',
        'OTP_EXPIRED',
      );
    }

    if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
      return fail(
        res,
        429,
        'OTP_LOCKED',
        'Too many incorrect attempts. Please ask for a new code.',
        { unlocksAt: new Date(entry.lockedUntil) },
      );
    }

    if (entry.expiresAt <= Date.now()) {
      pendingCodes.delete(phone);
      return badInput(
        res,
        'That code has expired. Please ask for a new one.',
        'OTP_EXPIRED',
      );
    }

    if (!verifyOtp(code, entry.salt, entry.hash)) {
      entry.attempts += 1;
      const left = Math.max(0, OTP_MAX_ATTEMPTS - entry.attempts);
      if (left === 0) entry.lockedUntil = Date.now() + LOCK_MS;

      logRejected('the code did not match', {
        code: left === 0 ? 'OTP_LOCKED' : 'OTP_WRONG',
        field: 'otp',
        ownerPhone: maskPhone(phone),
        status: 400,
      });

      return badInput(
        res,
        left === 0
          ? 'Too many incorrect attempts. Please ask for a new code.'
          : `That code is not right. ${left} attempt${left === 1 ? '' : 's'} left.`,
        left === 0 ? 'OTP_LOCKED' : 'OTP_WRONG',
        { attemptsLeft: left },
      );
    }

    /* Single use. The proof now lives in the token, and leaving the code
       behind would let a second application be submitted with it. */
    pendingCodes.delete(phone);

    const token = signPhoneVerificationToken(phone);
    if (!token) {
      return authNotConfigured(res, 'POST /api/v2/food-partners/auth/otp/verify');
    }

    note('✅', 'PHONE VERIFIED ·', maskPhone(phone), `· proof valid ${PHONE_TOKEN_TTL}`);

    return res.json({
      success: true,
      data: {
        /* Named for what it is rather than `token`, because the app holds this
           and a session token at different times and must never send one where
           the other belongs. */
        verificationToken: token,
        expiresIn: PHONE_TOKEN_TTL,
        phone,
        phoneMasked: maskPhone(phone),
      },
    });
  } catch (error) {
    logError('could not verify the phone code', error);
    return next(error);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   The application
   ══════════════════════════════════════════════════════════════════════════ */

/** The field a duplicate-key error was about, or null. */
const duplicateKeyOf = (error) => {
  if (!error || error.code !== 11000) return null;
  const keys = Object.keys(error.keyPattern || error.keyValue || {});
  return keys[0] || null;
};

/**
 * Menu positions, numbered within each category.
 *
 * `sanitiseProduct` defaults `displayOrder` to the item's index across the
 * WHOLE menu, which is the right default for a flat list and the wrong number
 * to store: the read path sorts by `{ restaurantId, category, displayOrder }`,
 * so a second category starting at 40 is a set of positions that mean nothing
 * within their own group. Numbering restarts per category here.
 *
 * The sort is by the sanitised order and then by arrival, so a client that DID
 * send an explicit `displayOrder` still decides the sequence within its
 * category; only the absolute numbers are rewritten.
 */
const withCategoryOrder = (products) => {
  const seen = new Map();
  return products
    .map((product, index) => ({ product, index }))
    .sort((a, b) => (
      (Number(a.product.displayOrder) - Number(b.product.displayOrder))
      || (a.index - b.index)
    ))
    .map(({ product }) => {
      const category = product.category || '';
      const position = seen.get(category) || 0;
      seen.set(category, position + 1);
      return { ...product, displayOrder: position };
    });
};

/**
 * Saves the restaurant, retrying only a `restaurantId` collision.
 *
 * 32^8 is about 1.1 x 10^12, so nobody will see one — but `restaurantId` is a
 * unique index, and an unhandled 11000 would surface to a partner as a server
 * error on a form they have just spent twenty minutes filling in. A duplicate
 * on any OTHER key is a real conflict about a real account and is rethrown for
 * the caller to answer as a 409.
 */
const saveWithNewId = async (fields) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const doc = new FoodRestaurant({ ...fields, restaurantId: makeRestaurantId() });
    try {
      return await doc.save();
    } catch (error) {
      if (duplicateKeyOf(error) !== 'restaurantId' || attempt === 2) throw error;
    }
  }
  return null;
};

// @route   POST /api/v2/food-partners/applications
// @desc    The whole onboarding form: one restaurant and its entire menu
// @access  Public (rate-limited in the routes file; a phone proof is enforced
//          on the route when one is mounted, and checked here when it ran)
const submitApplication = async (req, res, next) => {
  const timer = req.foodPartnerTimer || startTimer();

  /*
   * FIRST, before the database guard and before a single field is checked.
   *
   * This is the point of the whole logging feature: an application that is
   * about to be refused, or that is about to hit a disconnected database, has
   * still been printed in full, section by section, with a count of what
   * arrived against what exists. A block printed after validation is a block
   * that is missing from every request anybody ever needs it for.
   */
  logApplicationSteps(req.body, req);

  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const sanitised = sanitiseApplication(req.body);
    const { restaurant: fields, products: rawProducts, password } = sanitised;
    const dropped = sanitised.errors || [];

    const problems = validateApplication(sanitised);
    if (problems.length) {
      const message = `We still need ${problems.join(', ')}.`;
      logRejected('the application is incomplete', {
        code: 'INCOMPLETE_APPLICATION',
        field: problems[0],
        ownerEmail: fields.ownerEmail,
        ownerPhone: fields.ownerPhone,
        status: 400,
      });
      /* Every problem, not the first — see the header. `dropped` travels with
         them because a value the sanitiser could not read (a day that is not a
         day, a document with no file) is a thing the partner typed and will
         otherwise never hear about. */
      return badInput(res, message, 'INCOMPLETE_APPLICATION', {
        data: { problems, dropped },
      });
    }

    /*
     * If the routes file mounted `requireVerifiedPhone`, the proof is on the
     * request and this is the comparison that middleware cannot make: it
     * answers "somebody proved a number", and only here is it known whether
     * they proved THIS one. Without the check, an applicant could verify their
     * own handset and then submit an application in a stranger's name, with the
     * stranger's number as the login identity.
     *
     * Compared on the last ten digits rather than as strings, because that is
     * the part every spelling of a number agrees on.
     */
    if (req.verifiedPhone && phoneKey(req.verifiedPhone) !== phoneKey(fields.ownerPhone)) {
      logRejected('the verified number is not the number on the application', {
        code: 'PHONE_MISMATCH',
        field: 'ownerPhone',
        ownerPhone: maskPhone(fields.ownerPhone),
        status: 403,
      });
      return fail(
        res,
        403,
        'PHONE_MISMATCH',
        'The verified number does not match the owner number on this application.',
      );
    }

    /*
     * The Aadhaar-registered number, proven the same way and stamped HERE.
     *
     * `sanitiseApplication` deliberately leaves `aadhaar.verifiedAt` null, so
     * this is the only line in the process that can set it, and it sets it
     * from a signed proof rather than from anything the body claimed. The
     * Onboard console sends that proof as `aadhaar.verificationToken`, in the
     * body rather than the Authorization header, because the header already
     * carries the agent's own staff token.
     *
     * The proof is compared against the number ON the application, for the
     * same reason `ownerPhone` is above: the token answers "somebody proved a
     * number", and only this comparison answers "they proved THIS one".
     * Without it an agent could verify their own handset and file an
     * application against a stranger's Aadhaar.
     *
     * A missing or stale proof is NOT a refusal. It leaves `verifiedAt` null,
     * which is exactly what an application from the Food-Partner app — which
     * has no Aadhaar step — looks like, and the verification queue reads that
     * field to know which of the two it is holding.
     */
    if (fields.aadhaar && fields.aadhaar.phone) {
      const provenAadhaarPhone = readPhoneProof(
        (req.body && req.body.aadhaar && req.body.aadhaar.verificationToken) || '',
      );

      if (provenAadhaarPhone && phoneKey(provenAadhaarPhone) === phoneKey(fields.aadhaar.phone)) {
        fields.aadhaar.verifiedAt = new Date();
      } else if (provenAadhaarPhone) {
        logRejected('the Aadhaar proof is for a different number', {
          code: 'AADHAAR_PHONE_MISMATCH',
          field: 'aadhaar.phone',
          ownerPhone: maskPhone(fields.aadhaar.phone),
          status: 403,
        });
        return fail(
          res,
          403,
          'AADHAAR_PHONE_MISMATCH',
          'The verified code was sent to a different number than the Aadhaar mobile on this application.',
        );
      }
    }

    /* Checked before the write so the answer can name which one, and caught
       again on the save below because two taps of one button can race through
       this gap. Both paths answer 409 with the same codes. */
    const clash = await FoodRestaurant.findOne({
      $or: [
        { ownerEmail: fields.ownerEmail },
        { phoneKey: phoneKey(fields.ownerPhone) },
      ],
    }).select('ownerEmail phoneKey restaurantId');

    if (clash) {
      const isEmail = clash.ownerEmail === fields.ownerEmail;
      const code = isEmail ? 'EMAIL_IN_USE' : 'PHONE_IN_USE';
      const message = isEmail
        ? 'An account already exists for that email address. Please sign in instead.'
        : 'An account already exists for that phone number. Please sign in instead.';

      logRejected('an account already exists', {
        code,
        field: isEmail ? 'ownerEmail' : 'ownerPhone',
        ownerEmail: fields.ownerEmail,
        restaurantId: clash.restaurantId,
        status: 409,
      });
      return fail(res, 409, code, message);
    }

    /* The one place the plaintext is used. `sanitiseApplication` returns it on
       its own key precisely so that it cannot be spread onto the document by
       accident, and the model has no hashing hook because this controller
       hashes first — a hook would bcrypt the bcrypt.
     *
     * A password is OPTIONAL, because an application does not always come from
     * the person who will sign in. The Onboard console is filled in by a
     * Lampose employee sitting with the owner, and a password chosen in that
     * room — by the agent, out loud — is worse than no password at all. Those
     * applications arrive without one and the field is left unset.
     *
     * Unset is SAFE rather than open: `verifyPassword` returns false when there
     * is no hash to compare against, so a passwordless account cannot be signed
     * into at all. It is an account waiting for a credential, not one with a
     * blank one. `hashPassword('')` would be the opposite — a real bcrypt hash
     * of the empty string, which anybody sending an empty password would match. */
    const passwordHash = password ? await FoodRestaurant.hashPassword(password) : undefined;

    let restaurant;
    try {
      const credential = passwordHash ? { passwordHash } : {};
      restaurant = await saveWithNewId({ ...fields, ...credential });
    } catch (error) {
      const key = duplicateKeyOf(error);
      if (key === 'ownerEmail' || key === 'ownerPhone' || key === 'phoneKey') {
        const isEmail = key === 'ownerEmail';
        const code = isEmail ? 'EMAIL_IN_USE' : 'PHONE_IN_USE';
        const message = isEmail
          ? 'An account already exists for that email address. Please sign in instead.'
          : 'An account already exists for that phone number. Please sign in instead.';
        logRejected('two applications raced for one identity', { code, status: 409 });
        return fail(res, 409, code, message);
      }
      /* A ValidationError here means the whitelist and the schema disagree,
         which is a bug in this process rather than something the partner can
         act on. It goes to the shared error handler with the payload already
         printed above. */
      throw error;
    }

    const documents = Array.isArray(restaurant.verificationDocuments)
      ? restaurant.verificationDocuments.length
      : 0;

    let productCount = 0;
    if (rawProducts.length) {
      const docs = withCategoryOrder(rawProducts).map((product) => ({
        ...product,
        productId: makeProductId(),
        restaurantId: restaurant.restaurantId,
      }));

      try {
        /* `ordered: true`: the menu is one thing the partner typed, and a
           partial menu accepted with a 201 is a restaurant that lists nine of
           its twelve dishes with nothing anywhere to say which three are
           missing. The first failure stops the insert and the compensation
           below removes the lot. */
        const inserted = await FoodProduct.insertMany(docs, { ordered: true });
        productCount = inserted.length;
      } catch (error) {
        /*
         * The compensating delete. See the header: there is no transaction to
         * lean on, because a standalone MongoDB deployment is not a replica set
         * and has no sessions, so this is the honest substitute rather than
         * atomicity by another name.
         *
         * The products go first. Deleting the restaurant while its rows
         * survived would leave a menu belonging to an id that no longer
         * exists — invisible to every screen and impossible to find by hand.
         */
        logError('the menu could not be saved; undoing the application', error);
        try {
          await FoodProduct.deleteMany({ restaurantId: restaurant.restaurantId });
          await FoodRestaurant.deleteOne({ restaurantId: restaurant.restaurantId });
          logRejected('the menu could not be saved, so the application was rolled back', {
            code: 'MENU_SAVE_FAILED',
            restaurantId: restaurant.restaurantId,
            ownerEmail: fields.ownerEmail,
            status: 500,
          });
        } catch (cleanupError) {
          /* Loud, and with the id, because this is the one outcome that needs
             a person: the partner's email and phone number are now held by a
             restaurant with no menu, and they cannot resubmit until somebody
             removes it. */
          logError(
            `COULD NOT ROLL BACK ${restaurant.restaurantId} — it holds ${fields.ownerEmail} `
            + 'and must be deleted by hand before that partner can apply again',
            cleanupError,
          );
        }

        return fail(
          res,
          500,
          'MENU_SAVE_FAILED',
          'We could not save your menu, so nothing was submitted. Please try again.',
        );
      }
    }

    logApplicationSaved({
      restaurantId: restaurant.restaurantId,
      restaurantName: restaurant.restaurantName,
      productCount,
      verificationStatus: restaurant.verificationStatus,
      timer,
    });

    /*
     * The session is issued here rather than on a second call, so the app can
     * draw its "we are checking your papers" screen without a round trip that
     * could fail on a train.
     *
     * A null token means `JWT_SECRET` is missing and the routes file's
     * `requireAuthConfig` was not mounted. The application is NOT rolled back
     * for it: it is stored, complete and correct, and losing twenty minutes of
     * somebody's typing to a configuration mistake on our side is much the
     * worse of the two outcomes. The app is told plainly to sign in later.
     */
    const token = signFoodPartnerToken(restaurant);
    if (!token) {
      logDependencyMissing({
        dependency: 'JWT_SECRET',
        code: 'AUTH_NOT_CONFIGURED',
        route: 'POST /api/v2/food-partners/applications',
        hint: 'the application WAS saved; only the session could not be issued',
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        restaurantId: restaurant.restaurantId,
        verificationStatus: restaurant.verificationStatus,
        token,
        /* Named when it is missing, so the app shows "please sign in" rather
           than an empty session screen it cannot explain. */
        tokenError: token ? null : 'AUTH_NOT_CONFIGURED',
        restaurant,
        productCount,
        documentCount: documents,
        /* Everything the sanitiser could not read. An empty array on a normal
           submission; anything in it is worth showing on the status screen. */
        dropped,
      },
      message: 'Your application has been received. Lampose will verify your documents.',
    });
  } catch (error) {
    logError('the application could not be submitted', error);
    return next(error);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   The session
   ══════════════════════════════════════════════════════════════════════════ */

/* ONE sentence for "no such account" and for "wrong password". Two would make
   this endpoint an oracle for which email addresses and which numbers are
   registered with Lampose, which is a list worth having and not one we hand
   out at the login screen. */
const WRONG_CREDENTIALS = 'That email or phone number and password do not match.';

// @route   POST /api/v2/food-partners/auth/login
// @desc    Email or phone plus password, in one identifier field
// @access  Public (rate-limited in the routes file)
const login = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    if (!config.auth.configured) {
      return authNotConfigured(res, 'POST /api/v2/food-partners/auth/login');
    }

    const body = req.body || {};
    const identifier = String(
      body.identifier || body.email || body.ownerEmail || body.phone || body.ownerPhone || '',
    ).trim();
    const password = String(body.password || '');

    /* A malformed identifier is a 400 rather than the generic refusal: it does
       not depend on anything stored, so it leaks nothing, and "enter your email
       or phone number" is more use than "those do not match". */
    if (!identifier || !password) {
      return badInput(
        res,
        'Enter your email address or phone number, and your password.',
        'MISSING_CREDENTIALS',
      );
    }

    /* One field, two kinds of value — the app has one box and the partner types
       whichever they remember. An `@` decides; a number is matched on its last
       ten digits, because the number they type today is not necessarily spelled
       the way it was typed on the day they applied. */
    let query = null;
    if (identifier.includes('@')) {
      query = { ownerEmail: identifier.toLowerCase() };
    } else {
      const key = phoneKey(normalisePhone(identifier));
      if (key) query = { phoneKey: key };
    }

    if (!query) {
      return badInput(
        res,
        'Enter the email address or the phone number you registered with.',
        'BAD_IDENTIFIER',
      );
    }

    /* The one route in this module that asks for the hash back. It is
       `select: false` everywhere else, and `toJSON` deletes it again before
       this document is serialised below. */
    const restaurant = await FoodRestaurant.findOne(query).select('+passwordHash');

    const ok = restaurant ? await restaurant.verifyPassword(password) : false;
    if (!ok) {
      logLogin({
        identifier,
        ok: false,
        reason: restaurant ? 'the password did not match' : 'no account for that identifier',
        code: 'INVALID_CREDENTIALS',
      });
      /* 401 and the same sentence either way. The console line above says
         which it was, because that is where the answer belongs. */
      return fail(res, 401, 'INVALID_CREDENTIALS', WRONG_CREDENTIALS);
    }

    /*
     * A rejected partner is refused HERE rather than being handed a session
     * that `requireFoodPartner` will refuse on the very next call. The loop
     * that would otherwise produce — sign in, get a token, be thrown out,
     * return to the sign-in screen — is the one the support call opens with:
     * "it just logs me out". The note travels so the app can show the reason.
     *
     * Pending and inactive accounts sign in normally. The days before approval
     * are exactly when a partner types their menu, and an approved kitchen that
     * has switched itself closed for a fortnight still needs its dashboard.
     */
    if (restaurant.verificationStatus === 'rejected') {
      const message = restaurant.verificationNote
        ? `This application was not approved: ${restaurant.verificationNote}`
        : 'This application was not approved. Please contact Lampose.';
      logLogin({
        identifier,
        ok: false,
        reason: 'the application was rejected',
        code: 'ACCOUNT_REJECTED',
        restaurantId: restaurant.restaurantId,
      });
      return fail(res, 403, 'ACCOUNT_REJECTED', message, {
        data: {
          verificationStatus: restaurant.verificationStatus,
          verificationNote: restaurant.verificationNote || '',
        },
      });
    }

    const token = signFoodPartnerToken(restaurant);
    if (!token) return authNotConfigured(res, 'POST /api/v2/food-partners/auth/login');

    logLogin({
      identifier,
      ok: true,
      restaurantId: restaurant.restaurantId,
      restaurantName: restaurant.restaurantName,
      verificationStatus: restaurant.verificationStatus,
    });

    return res.json({
      success: true,
      data: {
        token,
        /* `toJSON` drops `passwordHash` and `payout.bankAccountNumber` even
           though this is the one read that selected the hash on purpose. */
        restaurant,
      },
    });
  } catch (error) {
    logError('sign-in failed', error);
    return next(error);
  }
};

// @route   GET /api/v2/food-partners/me
// @desc    The signed-in restaurant, as the dashboard's first screen reads it
// @access  Food-partner session
const getMe = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const restaurant = req.foodPartner;
    if (!restaurant) return notFound(res, 'This account no longer exists.');

    /* One indexed count, on the first screen the app draws. It is what the
       dashboard shows beside "Menu", and a screen that has to call the menu
       route to render a number would fetch the whole menu to do it. */
    const menuItemCount = await FoodProduct.countDocuments({
      restaurantId: restaurant.restaurantId,
    });

    return res.json({
      success: true,
      data: {
        restaurant,
        menuItemCount,
        /* Also on the serialised restaurant as a virtual. Repeated at the top
           level because it is the one value the header of every screen reads,
           and it is derived rather than stored — see the model. */
        isCurrentlyOpen: isOpenNow(restaurant),
      },
    });
  } catch (error) {
    logError('could not read the partner profile', error);
    return next(error);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   PATCH /me — the operations fields, and only those

   Three lists rather than one, because "you may not" and "we do not know what
   that is" are different answers and a client author fixes them differently.

   Nothing is ever silently dropped. A PATCH that accepted an unknown field and
   quietly ignored it produces the worst possible screen: one that shows the
   partner a change which never happened, and which they discover a week later
   from a customer. A refusal naming the field is a thing an app author fixes
   once.

   The consequence, said plainly because it constrains the client: this route
   takes the fields that CHANGED, not the whole document read back. An app that
   PATCHes everything it holds will be refused, by design.
   ══════════════════════════════════════════════════════════════════════════ */

const EDITABLE_FIELDS = [
  /* Presentation. */
  'description', 'cuisineTypes', 'logoImage', 'coverBannerImage',
  /* Contact — the customer-facing number, which is not the login identity. */
  'contactNumber',
  /* C. Operations. */
  'openingHours', 'openState', 'avgPreparationTime', 'deliveryRadiusKm',
  'minOrderValue', 'packagingCharge', 'deliveryFee',
  'acceptsOnlinePayment', 'acceptsCod',
];

/* Server-decided. A partner who could set `verificationStatus` would list an
   unverified kitchen at two in the morning; one who could set `ratingAvg`
   would be five stars by lunchtime. Same reasoning as a support ticket's
   status: a client that sets its own status can mark its own dispute
   resolved. */
const SERVER_DECIDED_FIELDS = [
  'verificationStatus', 'verificationNote', 'verifiedAt', 'isActive',
  'ratingAvg', 'ratingCount', 'restaurantId', 'phoneKey', 'passwordHash',
  '_id', 'id', '__v', 'createdAt', 'updatedAt',
];

/* Changeable, but not from a device and not without a human. The licence names
   the business at an address, so a name or an address that a partner could
   edit after approval would silently invalidate the check somebody performed
   on the papers. `payout` is on this list for a blunter reason: it is where the
   settlement money goes, and a session that can repoint it is the whole of that
   attack. */
const RE_VERIFICATION_FIELDS = [
  'restaurantName', 'ownerName', 'ownerEmail', 'ownerPhone', 'password',
  'address', 'location', 'partnerType',
  'fssaiLicenseNumber', 'fssaiExpiry', 'gstNumber', 'gstExempt', 'panNumber',
  'payout', 'contract', 'verificationDocuments',
];

/** "logoImage" and "coverBannerImage" carry a Cloudinary pair and nothing else. */
const readImage = (value) => {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    url: String(raw.url || raw.secure_url || '').trim(),
    publicId: String(raw.publicId || raw.public_id || '').trim(),
  };
};

const readMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

// @route   PATCH /api/v2/food-partners/me
// @desc    Presentation and operations fields on the signed-in restaurant
// @access  Food-partner session
const updateMe = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const restaurant = req.foodPartner;
    if (!restaurant) return notFound(res, 'This account no longer exists.');

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const keys = Object.keys(body);

    if (!keys.length) {
      return badInput(res, 'Nothing was sent to change.', 'EMPTY_PATCH');
    }

    const refusedServer = keys.filter((key) => SERVER_DECIDED_FIELDS.includes(key));
    if (refusedServer.length) {
      logRejected('a PATCH tried to set a server-decided field', {
        code: 'FORBIDDEN_FIELD',
        field: refusedServer.join(', '),
        restaurantId: restaurant.restaurantId,
        status: 403,
      });
      return fail(
        res,
        403,
        'FORBIDDEN_FIELD',
        `${refusedServer.join(', ')} ${refusedServer.length === 1 ? 'is' : 'are'} decided by Lampose and cannot be changed from the app.`,
        { data: { fields: refusedServer } },
      );
    }

    const refusedLegal = keys.filter((key) => RE_VERIFICATION_FIELDS.includes(key));
    if (refusedLegal.length) {
      logRejected('a PATCH tried to change a verified detail', {
        code: 'NEEDS_REVERIFICATION',
        field: refusedLegal.join(', '),
        restaurantId: restaurant.restaurantId,
        status: 403,
      });
      return fail(
        res,
        403,
        'NEEDS_REVERIFICATION',
        `${refusedLegal.join(', ')} ${refusedLegal.length === 1 ? 'is' : 'are'} part of your verified business and payout details. Contact Lampose to change ${refusedLegal.length === 1 ? 'it' : 'them'}.`,
        { data: { fields: refusedLegal } },
      );
    }

    const unknown = keys.filter((key) => !EDITABLE_FIELDS.includes(key));
    if (unknown.length) {
      return badInput(
        res,
        `We do not recognise ${unknown.join(', ')}. This route changes: ${EDITABLE_FIELDS.join(', ')}.`,
        'UNKNOWN_FIELD',
        { data: { fields: unknown, editable: EDITABLE_FIELDS } },
      );
    }

    const problems = [];
    /* Whole sentences about rows that could not be read, kept apart from
       `problems` on purpose: `foodPartner.util.js` writes its two error lists
       in two voices — fragments that complete "We still need …" for something
       that was never sent, and sentences for something that was sent and
       dropped — and joining them produces one ungrammatical paragraph. */
    const dropped = [];
    const changed = [];
    const previousOpenState = restaurant.openState;

    if (body.description !== undefined) {
      restaurant.description = String(body.description).trim();
      changed.push('description');
    }

    if (body.cuisineTypes !== undefined) {
      if (!Array.isArray(body.cuisineTypes)) {
        problems.push('cuisineTypes has to be a list');
      } else {
        const list = body.cuisineTypes
          .map((entry) => String(entry === null || entry === undefined ? '' : entry).trim())
          .filter(Boolean);
        if (!list.length) problems.push('at least one cuisine');
        else {
          restaurant.cuisineTypes = list;
          changed.push('cuisineTypes');
        }
      }
    }

    ['logoImage', 'coverBannerImage'].forEach((key) => {
      if (body[key] === undefined) return;
      const image = readImage(body[key]);
      /* A pair with no URL is a client clearing an image it never uploaded, or
         sending the shape of one it failed to upload. Neither should overwrite
         a photograph that is currently on the listing card. */
      if (!image.url) {
        problems.push(`an uploaded image for ${key} — upload it first, then send the url and publicId`);
        return;
      }
      restaurant.set(key, image);
      changed.push(key);
    });

    if (body.contactNumber !== undefined) {
      /* Permissive on purpose: this is the number printed in the app, and it is
         frequently a landline or a counter phone. `ownerPhone` is the strict
         one, and it is not editable here. */
      const contact = normalisePhone(body.contactNumber);
      if (!contact) problems.push('a contact number we can read');
      else {
        restaurant.contactNumber = contact;
        changed.push('contactNumber');
      }
    }

    if (body.openingHours !== undefined) {
      const hoursProblems = [];
      const hours = buildOpeningHours(body.openingHours, hoursProblems);
      if (hours.length) {
        restaurant.openingHours = hours;
        changed.push('openingHours');
      } else if (!hoursProblems.length) {
        /* Only when nothing was sent at all. When the builder DID have
           something and could not read it, its own sentences say why, and
           "we still need the days you are open" would replace a reason with a
           restatement of the request. */
        problems.push('the days you are open');
      }
      /* Rows the builder could not read are reported, not swallowed, and on
         this route they are fatal. A slot that quietly vanished is a kitchen
         that shows as shut on a day it is open, and nobody would ever connect
         the two. The application route accepts the same rows and reports them
         instead, because there the alternative is throwing away twenty minutes
         of typing; here the partner is looking at the one screen that sets
         them and can fix it in a tap. */
      hoursProblems.forEach((problem) => dropped.push(problem));
    }

    if (body.openState !== undefined) {
      const state = String(body.openState).toLowerCase();
      if (!OPEN_STATES.includes(state)) {
        problems.push(`openState to be one of ${OPEN_STATES.join(', ')}`);
      } else {
        restaurant.openState = state;
        changed.push('openState');
      }
    }

    [
      ['avgPreparationTime', 'a preparation time of zero minutes or more'],
      ['deliveryRadiusKm', 'a delivery radius of zero or more'],
      ['minOrderValue', 'a minimum order value of zero or more'],
      ['packagingCharge', 'a packaging charge of zero or more'],
    ].forEach(([key, fragment]) => {
      if (body[key] === undefined) return;
      const value = readMoney(body[key]);
      /* Said in words here rather than left to the schema's `min: 0`, which
         throws a ValidationError that reaches the app as a 500. */
      if (value === null) problems.push(fragment);
      else {
        restaurant[key] = value;
        changed.push(key);
      }
    });

    if (body.deliveryFee !== undefined) {
      const fee = body.deliveryFee && typeof body.deliveryFee === 'object' ? body.deliveryFee : {};

      if (fee.type !== undefined) {
        const type = String(fee.type).toLowerCase();
        if (!DELIVERY_FEE_TYPES.includes(type)) {
          problems.push(`a delivery fee type of ${DELIVERY_FEE_TYPES.join(', ')}`);
        } else {
          /* Set by path. `deliveryFee` is a nested path rather than a
             subdocument — its own `type` key is a field, not a type
             declaration — and assigning the whole object would be a merge whose
             rules are worth nobody's time to remember. */
          restaurant.set('deliveryFee.type', type);
          changed.push('deliveryFee.type');
        }
      }

      [['amount', 'a delivery fee of zero or more'],
        ['perKm', 'a per-kilometre rate of zero or more'],
        ['freeAboveValue', 'a free-delivery threshold of zero or more'],
      ].forEach(([key, fragment]) => {
        if (fee[key] === undefined) return;
        const value = readMoney(fee[key]);
        if (value === null) problems.push(fragment);
        else {
          restaurant.set(`deliveryFee.${key}`, value);
          changed.push(`deliveryFee.${key}`);
        }
      });
    }

    ['acceptsOnlinePayment', 'acceptsCod'].forEach((key) => {
      if (body[key] === undefined) return;
      if (typeof body[key] !== 'boolean') {
        problems.push(`${key} to be true or false`);
        return;
      }
      restaurant[key] = body[key];
      changed.push(key);
    });

    if (problems.length) {
      logRejected('the profile update was refused', {
        code: 'BAD_INPUT',
        field: problems[0],
        restaurantId: restaurant.restaurantId,
        status: 400,
      });
      /* Nothing has been saved at this point — the document is modified in
         memory and thrown away with the request. */
      return badInput(res, `We still need ${problems.join(', ')}.`, 'BAD_INPUT', {
        data: { problems },
      });
    }

    if (dropped.length) {
      logRejected('part of the opening hours could not be read', {
        code: 'PARTIAL_OPENING_HOURS',
        field: 'openingHours',
        restaurantId: restaurant.restaurantId,
        status: 400,
      });
      return badInput(
        res,
        `${dropped.join(' ')} Set a time for every day you are open, or unselect the day.`,
        'PARTIAL_OPENING_HOURS',
        { data: { dropped } },
      );
    }

    await restaurant.save();

    note(
      '📝',
      'PROFILE UPDATED ·',
      restaurant.restaurantId,
      restaurant.restaurantName ? `"${restaurant.restaurantName}"` : '',
      `· changed ${changed.join(', ') || 'nothing'}`,
    );

    /* The availability line as well, when the override moved. It is the one
       field on this route that changes what a customer sees this minute, and
       `logAvailability` prints the stored state beside what it works out to
       now — which is the pair that answers "the app says we are shut". */
    if (changed.includes('openState') && previousOpenState !== restaurant.openState) {
      logAvailability({
        restaurantId: restaurant.restaurantId,
        restaurantName: restaurant.restaurantName,
        from: previousOpenState,
        to: restaurant.openState,
        effective: isOpenNow(restaurant),
      });
    }

    return res.json({
      success: true,
      data: {
        restaurant,
        changed,
        isCurrentlyOpen: isOpenNow(restaurant),
      },
    });
  } catch (error) {
    logError('could not update the partner profile', error);
    return next(error);
  }
};

// @route   PATCH /api/v2/food-partners/me/availability
// @desc    The manual open/closed override
// @access  Food-partner session
const setAvailability = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const restaurant = req.foodPartner;
    if (!restaurant) return notFound(res, 'This account no longer exists.');

    const body = req.body || {};
    const raw = body.openState !== undefined ? body.openState : body.state;
    const state = String(raw === undefined || raw === null ? '' : raw).toLowerCase();

    /*
     * A boolean is deliberately NOT accepted, even though a toggle is what the
     * screen looks like. Three states exist because a boolean cannot express
     * "follow the schedule": mapping `true` to `open` would pin a kitchen open
     * until somebody noticed, which is precisely the bug the third state was
     * added to prevent. The app sends the word.
     */
    if (typeof raw === 'boolean') {
      return badInput(
        res,
        `Send openState as one of ${OPEN_STATES.join(', ')}. "auto" gives the schedule back; true and false cannot say that.`,
        'BAD_OPEN_STATE',
      );
    }

    if (!OPEN_STATES.includes(state)) {
      return badInput(
        res,
        `Send openState as one of ${OPEN_STATES.join(', ')}.`,
        'BAD_OPEN_STATE',
      );
    }

    const from = restaurant.openState;
    restaurant.openState = state;
    await restaurant.save();

    const effective = isOpenNow(restaurant);

    logAvailability({
      restaurantId: restaurant.restaurantId,
      restaurantName: restaurant.restaurantName,
      from,
      to: state,
      effective,
    });

    return res.json({
      success: true,
      data: {
        openState: state,
        /* Derived on read, never stored — see the model. The app shows this and
           not `openState`, because "auto" is not something a customer sees. */
        isCurrentlyOpen: effective,
        restaurantId: restaurant.restaurantId,
      },
    });
  } catch (error) {
    logError('could not change availability', error);
    return next(error);
  }
};

module.exports = {
  /* Onboarding, in the order the app calls them. */
  startPhoneOtp,
  verifyPhoneOtp,
  submitApplication,

  /* The session. */
  login,
  getMe,
  updateMe,
  setAvailability,

  /* Shared with the routes file so a limiter and a handler cannot disagree
     about how long a code lives, and with `npm run verify`, which walks the
     OTP flow and would otherwise trip its own cooldown on the second run. */
  OTP_LENGTH,
  resetPhoneCodes: () => pendingCodes.clear(),
};
