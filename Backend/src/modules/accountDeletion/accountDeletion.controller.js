/* ══════════════════════════════════════════════════════════════════════════
   "Delete my account", for every app — from the open web and from inside it.

   Two doors, one outcome. Both write the same `deletion` sub-document
   (`accountDeletion.schema.js`) on the account, and neither removes the row:

     PUBLIC   /api/v2/account-deletion/:app/{policy,start,confirm}
              lampose.com/delete-account. Google Play requires that somebody
              can ask without the app and without signing in, so the only
              thing the form can be given is a phone number — and a phone
              number is a string anybody can type. `start` texts a one-time
              code to it; nothing is marked until `confirm` brings it back.

     IN APP   …/me/account-deletion   GET status · POST request · DELETE cancel
              Behind each app's OWN guard (requireCustomer, requirePartner,
              requireFoodPartner, requireDriver). The session is the proof, so
              no code is needed. No guard is widened to understand a second
              audience — each router is built for one.

   ## Nothing is deleted here

   A confirmed request is scheduled `DELETION_GRACE_DAYS` out. The window is
   for work in flight, money owed, and the person who changes their mind by
   morning — which is also why the in-app door can CANCEL and the public one
   cannot: cancelling needs the session that proves the account is theirs.

   ## Nothing here says whether a number has an account

   `start` answers a registered and an unregistered number with the same
   envelope, and `confirm` answers a wrong code and an unknown number with one
   refusal. A public form that replied differently would be a way to test
   whether somebody rides, cooks, lets rooms or eats with Lampose.

   ## Asking twice is not an error

   A request that already stands is reported as the existing one, with its own
   dates. A second request must not quietly extend the window being waited out.
   ══════════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const DeletionOtp = require('./deletionOtp.model');
const { AUDIENCES } = require('./accountDeletion.audiences');
/* The module object, not destructured functions, so a test can stand in for
   the gateway without a network. */
const sms = require('../../infrastructure/sms/sms');
const { toE164, isIndianMobile, maskPhone } = require('../../infrastructure/twilio/twilio');
const {
  OTP_TTL_MS, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS,
  generateOtp, newSalt, hashOtp, verifyOtp,
} = require('../visits/otp.util');

const OTP_LENGTH = 6;
const LOCK_MS = 10 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a confirmed request waits before it may be carried out.
 *
 * Printed on the page and in four apps, so they ASK for it (`policy`, and
 * every status reply) rather than repeating it — a page promising 30 days
 * against a server that waits 14 is the disagreement that ends up in front of
 * a regulator.
 */
const DELETION_GRACE_DAYS = 30;
const MAX_REASON = 500;

const supportEmail = () => process.env.SUPPORT_EMAIL || 'contact@lampose.com';

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

const readEmail = (body) => String((body || {}).email || '').trim().toLowerCase();
const readReason = (body) => String((body || {}).reason || '').trim().slice(0, MAX_REASON);

/** A document from before `deletion` existed reads as "never asked". */
const deletionOf = (doc) => doc.deletion || { status: 'none' };
const isRequested = (doc) => deletionOf(doc).status === 'requested';

/** What the page or the app prints once a request stands (or does not). */
const requestView = (audience, doc) => {
  const d = deletionOf(doc);
  return {
    app: audience.key,
    status: d.status || 'none',
    requestedAt: d.requestedAt || null,
    scheduledFor: d.scheduledFor || null,
    cancelledAt: d.cancelledAt || null,
    source: d.source || '',
    graceDays: DELETION_GRACE_DAYS,
    canCancel: d.status === 'requested',
    phoneMasked: maskPhone(toE164(audience.phoneOf(doc)) || audience.phoneOf(doc)),
    supportEmail: supportEmail(),
  };
};

/*
 * Write only `deletion`, never the whole document.
 *
 * `save()` re-validates every field, and a row written before some field
 * became required would then refuse the one request its owner is entitled to
 * make. A targeted update touches nothing else — and its condition makes two
 * taps in flight one request rather than two sets of dates.
 *
 * Returns false when the condition did not match (somebody else got there).
 */
const writeDeletion = async (doc, condition, deletion) => {
  const result = await doc.constructor.updateOne(
    { _id: doc._id, ...condition },
    { $set: { deletion } },
    { runValidators: true },
  );
  if (!result.matchedCount) return false;
  doc.set('deletion', deletion);
  return true;
};

/** Mark the account. The caller has already proved it is theirs. */
const markRequested = (doc, { source, reason = '', contactEmail = '' }) => {
  const now = new Date();
  return writeDeletion(doc, { 'deletion.status': { $ne: 'requested' } }, {
    status: 'requested',
    requestedAt: now,
    scheduledFor: new Date(now.getTime() + DELETION_GRACE_DAYS * DAY_MS),
    cancelledAt: null,
    processedAt: null,
    reason,
    contactEmail,
    source,
  });
};

/** Re-read after losing a race, so the reply carries the request that won. */
const reload = (audience, doc) => audience.model().findById(doc._id);

/* Counted AFTER the request is saved, so a slow query can never be the reason
   a request was lost — and a failed count is not worth failing it over. */
const workInHand = async (audience, doc) => {
  try {
    return await audience.activeWork(doc);
  } catch {
    return {};
  }
};

const logRequest = (audience, doc, source) => {
  console.log(
    `🗑️  [Account Deletion] ${audience.key} ${audience.idOf(doc)} requested deletion from ${source}`
    + ` — due ${deletionOf(doc).scheduledFor.toISOString()}`,
  );
};

/* ── Public: the website ──────────────────────────────────────────────────── */

const startedPayload = (audience, phone) => ({
  app: audience.key,
  phoneMasked: maskPhone(phone),
  otpLength: OTP_LENGTH,
  resendInSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
  maxAttempts: OTP_MAX_ATTEMPTS,
  graceDays: DELETION_GRACE_DAYS,
});

const policyPayload = (audience) => ({
  app: audience.key,
  appName: audience.appName,
  graceDays: DELETION_GRACE_DAYS,
  otpLength: OTP_LENGTH,
  supportEmail: supportEmail(),
});

/** GET /api/v2/account-deletion/policy — every app, for the page's picker. */
const allPolicies = (req, res) => res.json({
  success: true,
  data: {
    graceDays: DELETION_GRACE_DAYS,
    otpLength: OTP_LENGTH,
    supportEmail: supportEmail(),
    apps: Object.values(AUDIENCES).map((a) => ({ key: a.key, appName: a.appName, who: a.who })),
  },
});

/**
 * The three public handlers for one audience.
 *
 * Built per audience (rather than one handler reading `:app`) so each gets
 * its own rate-limit buckets at the router, and so no handler can be reached
 * with an app name nobody registered.
 */
const makePublicHandlers = (audience) => {
  const policy = (req, res) => res.json({ success: true, data: policyPayload(audience) });

  /*
   * Send the code that proves the number belongs to whoever is asking.
   *
   * A number with no account is answered exactly as one with an account, no
   * SMS is sent to it (that would tell its owner somebody is trying to delete
   * an account they do not have), and no account is ever CREATED here.
   */
  const start = async (req, res, next) => {
    try {
      if (!isUp()) return dbDown(res);

      const phone = readPhone(req.body);
      if (!phone) {
        return fail(res, 400, 'BAD_PHONE', 'Please enter a valid 10-digit Indian mobile number.');
      }

      const account = await audience.findByPhone(phone);
      /* Blocked accounts are answered as unknown ones: the block exists to
         stop a number ordering SMS at our expense, and the page tells anybody
         whose code never arrives to email support. */
      if (!account || account.status === 'blocked') {
        return res.json({ success: true, data: startedPayload(audience, phone) });
      }

      if (isRequested(account)) {
        return res.json({
          success: true,
          data: {
            ...startedPayload(audience, phone),
            alreadyRequested: true,
            request: requestView(audience, account),
          },
        });
      }

      const otpRow = await DeletionOtp.findOne({ audience: audience.key, phone });
      const sinceLast = otpRow && otpRow.lastSentAt
        ? Date.now() - new Date(otpRow.lastSentAt).getTime()
        : Infinity;
      if (sinceLast < OTP_RESEND_COOLDOWN_MS) {
        /* A code is already on its way, so the page moves to the code box. */
        return res.json({
          success: true,
          data: {
            ...startedPayload(audience, phone),
            cooling: true,
            resendInSeconds: Math.ceil((OTP_RESEND_COOLDOWN_MS - sinceLast) / 1000),
          },
        });
      }

      if (sms.smsConfigProblem()) {
        return fail(
          res, 503, 'SMS_NOT_CONFIGURED',
          'We cannot send a code right now. Please email support and we will process your request by hand.',
        );
      }

      const otp = generateOtp();
      const salt = newSalt();
      await DeletionOtp.findOneAndUpdate(
        { audience: audience.key, phone },
        {
          $set: {
            salt,
            hash: hashOtp(otp, salt),
            expiresAt: new Date(Date.now() + OTP_TTL_MS),
            attempts: 0,
            lockedUntil: null,
            lastSentAt: new Date(),
            campId: null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      const sent = await sms.sendOtpSms(phone, otp);
      if (!sent || !sent.success) {
        return fail(
          res, 502, 'SMS_SEND_FAILED',
          'The code could not be sent. Please try again in a moment, or email support.',
        );
      }
      if (sent.campId) {
        await DeletionOtp.updateOne({ audience: audience.key, phone }, { $set: { campId: sent.campId } });
      }

      return res.json({ success: true, data: startedPayload(audience, phone) });
    } catch (error) {
      return next(error);
    }
  };

  /* The code back, and the account is marked — marked, not deleted. */
  const confirm = async (req, res, next) => {
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

      const email = readEmail(body);
      if (email && !EMAIL_RE.test(email)) {
        return fail(res, 400, 'BAD_EMAIL', 'That email address does not look right. Leave it blank if you would rather not give one.');
      }

      const otpRow = await DeletionOtp.findOne({ audience: audience.key, phone });

      /* The same refusal a wrong code gets — see the header. */
      if (!otpRow || !otpRow.hash) {
        return fail(res, 400, 'CODE_INCORRECT', 'That code is not right. Please check and try again.');
      }
      if (otpRow.lockedUntil && otpRow.lockedUntil > new Date()) {
        return fail(res, 429, 'CODE_LOCKED', 'Too many wrong tries. Ask for a new code to start again.');
      }
      if (!otpRow.expiresAt || otpRow.expiresAt < new Date()) {
        return fail(res, 400, 'CODE_EXPIRED', 'That code has expired. Ask for a new one.');
      }

      if (!verifyOtp(code, otpRow.salt, otpRow.hash)) {
        otpRow.attempts = (otpRow.attempts || 0) + 1;
        if (otpRow.attempts >= OTP_MAX_ATTEMPTS) otpRow.lockedUntil = new Date(Date.now() + LOCK_MS);
        await otpRow.save();
        return fail(res, 400, 'CODE_INCORRECT', 'That code is not right. Please check and try again.');
      }

      /* Correct. The code is destroyed first, and conditionally, so the same
         six digits cannot be spent twice by two requests in flight. */
      const spent = await DeletionOtp.findOneAndUpdate(
        { _id: otpRow._id, hash: otpRow.hash },
        { $set: { hash: null, salt: null, expiresAt: null, attempts: 0, lockedUntil: null } },
      );
      if (!spent) {
        return fail(res, 400, 'CODE_INCORRECT', 'That code is not right. Please check and try again.');
      }

      const account = await audience.findByPhone(phone);
      if (!account) {
        return fail(res, 400, 'CODE_INCORRECT', 'That code is not right. Please check and try again.');
      }

      const marked = !isRequested(account)
        && await markRequested(account, { source: 'web', reason: readReason(body), contactEmail: email });
      if (!marked) {
        const current = (await reload(audience, account)) || account;
        return res.json({
          success: true,
          data: { ...requestView(audience, current), alreadyRequested: true },
          message: 'Your account is already scheduled for deletion.',
        });
      }

      const work = await workInHand(audience, account);
      logRequest(audience, account, 'web');

      return res.status(201).json({
        success: true,
        message: 'Your deletion request has been received.',
        data: { ...requestView(audience, account), ...work },
      });
    } catch (error) {
      return next(error);
    }
  };

  return { policy, start, confirm };
};

/* ── In app: the signed-in person ─────────────────────────────────────────── */

/**
 * The three signed-in handlers for one audience.
 *
 * `reqKey` is where that audience's guard put the account — `req.customer`,
 * `req.partner`, `req.foodPartner`, `req.driver`. The handlers never look
 * anywhere else, so a token from the wrong app cannot reach a second one.
 */
const makeInAppHandlers = (audience, reqKey) => {
  const accountOf = (req) => req[reqKey];

  const status = async (req, res, next) => {
    try {
      const account = accountOf(req);
      const work = isRequested(account) ? await workInHand(audience, account) : {};
      return res.json({ success: true, data: { ...requestView(audience, account), ...work } });
    } catch (error) {
      return next(error);
    }
  };

  const request = async (req, res, next) => {
    try {
      const account = accountOf(req);

      const email = readEmail(req.body);
      if (email && !EMAIL_RE.test(email)) {
        return fail(res, 400, 'BAD_EMAIL', 'That email address does not look right. Leave it blank if you would rather not give one.');
      }

      const marked = !isRequested(account)
        && await markRequested(account, { source: 'app', reason: readReason(req.body), contactEmail: email });
      if (!marked) {
        const current = (await reload(audience, account)) || account;
        return res.json({
          success: true,
          message: 'Your account is already scheduled for deletion.',
          data: { ...requestView(audience, current), alreadyRequested: true },
        });
      }

      const work = await workInHand(audience, account);
      logRequest(audience, account, 'app');

      return res.status(201).json({
        success: true,
        message: 'Your deletion request has been received.',
        data: { ...requestView(audience, account), ...work },
      });
    } catch (error) {
      return next(error);
    }
  };

  /* Changing your mind inside the window. The session is the proof. */
  const cancel = async (req, res, next) => {
    try {
      const account = accountOf(req);
      const current = deletionOf(account);
      const cancelled = current.status === 'requested' && await writeDeletion(
        account,
        { 'deletion.status': 'requested' },
        {
          ...(typeof current.toObject === 'function' ? current.toObject() : current),
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      );
      if (!cancelled) {
        return fail(res, 409, 'NOTHING_TO_CANCEL', 'There is no deletion request on this account to cancel.');
      }
      console.log(`↩️  [Account Deletion] ${audience.key} ${audience.idOf(account)} cancelled their request`);

      return res.json({
        success: true,
        message: 'Your deletion request has been cancelled. Your account stays open.',
        data: requestView(audience, account),
      });
    } catch (error) {
      return next(error);
    }
  };

  return { status, request, cancel };
};

module.exports = {
  DELETION_GRACE_DAYS,
  OTP_LENGTH,
  allPolicies,
  makePublicHandlers,
  makeInAppHandlers,
};
