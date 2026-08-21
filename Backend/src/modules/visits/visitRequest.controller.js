/* ══════════════════════════════════════════════════════════════════════════
   Availability / visit requests.

   The public site's "Request a visit" flow, end to end:

     POST /visit-requests            form in, SMS code out. Nothing reaches
                                     the owner yet.
     POST /visit-requests/:id/verify code checked, THEN the owner is asked.
     POST /visit-requests/:id/resend a new code, rate limited.
     GET  /visit-requests/:id        what the waiting page polls.

     inbound WhatsApp "AVAILABLE"    handleAvailabilityReply(), called from
                                     the single webhook in
                                     routes/v1/verificationRoutes.js.

   Two decisions carry most of the safety here:

   1. The owner is contacted only after a code sent to the customer's phone
      comes back correct. That ordering is what stops the button being a way
      to make a stranger's WhatsApp ring under an invented name.

   2. The owner's number is read from the `properties` document by id. It is
      never accepted from the request body, or the endpoint would be an open
      relay for messaging any number at all.

   This flow is entirely separate from property verification. It never reads
   or writes VerificationRequest, and the word it listens for is AVAILABLE.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const mongoose = require('mongoose');

const Property = require('../properties/property.model');
const VisitRequest = require('./visitRequest.model');
const { sharingOptionsFor, findSharingOption } = require('../listings/sharing.util');
const { requestableOptions, bookedAtLabel } = require('../inventory/inventory.service');
const { readListingAddress, readListingContact } = require('./visitAddress.util');
const { validateIntent, describeIntent } = require('../listings/stayIntent.util');
const config = require('../../config/env');
const { needsToken, ensurePaymentLink } = require('./visitPayment.controller');

/* One definition, in shared/constants/categories.js — these used to be
   three hand-synchronised copies. */
const {
  NIGHTLY_CATEGORIES, SIMPLE_PATH_CATEGORIES, normaliseCategory,
} = require('../../shared/constants/categories');
const { sendOtpSms, smsConfigProblem } = require('../../infrastructure/sms/sms');
const {
  toE164, isIndianMobile, maskPhone,
  sendVisitRequestMessage, sendVisitOutcomeMessage, sendVisitConfirmationToCustomer,
} = require('../../infrastructure/twilio/twilio');
const {
  OTP_TTL_MS, OTP_MAX_ATTEMPTS, OTP_MAX_RESENDS, OTP_RESEND_COOLDOWN_MS,
  generateOtp, newSalt, hashOtp, verifyOtp,
} = require('./otp.util');

/* ── Two different clocks, deliberately separate ───────────────────────────
   These were one constant, and they must not be: it was used both for how
   long the OWNER has to answer and for how long a CUSTOMER is blocked from
   asking the same property again. Shortening the reply window to minutes
   would otherwise have quietly shortened the anti-spam window to minutes
   too, letting one person re-approach the same owner every few minutes. */

/** How long the owner has to answer before the request lapses.
    Five minutes by default — a client decision; tune without a deploy. */
const OWNER_REPLY_WINDOW_MINUTES =
  Math.max(1, Number(process.env.VISIT_REPLY_WINDOW_MINUTES) || 5);
const OWNER_REPLY_WINDOW_MS = OWNER_REPLY_WINDOW_MINUTES * 60 * 1000;

/** One approach per property per phone per day, answered or not. */
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/* ── Visit reference ───────────────────────────────────────────────────────
   Issued when the owner confirms, and sent to BOTH sides so they can match
   it at the door.

   The "LV-" prefix is not decoration. WhatsApp rejected the first version of
   these templates with INCORRECT_CATEGORY: a bare six-digit number reads to
   Meta's classifier as a login passcode, which may only be sent under the
   AUTHENTICATION category — and that category forbids the property name,
   address and dates this message exists to carry. Prefixed, it reads as what
   it actually is: a booking reference, which is ordinary utility content.

   Six digits behind the prefix, never trimmed, because it is read aloud at a
   gate and must always be the same length. */
/* Moved to otp.util.js so the app channel issues the same format. Two copies
   of this would be two PIN formats an owner has to recognise. */
const { generateEntryPin } = require('./otp.util');

/** The choice the customer actually made, as one line: room, stay, price. */
const describeSelection = (doc) => {
  const intent = doc.intent || {};
  const parts = [];

  if (doc.sharing && doc.sharing.label) parts.push(doc.sharing.label);

  if (intent.duration && intent.durationUnit) {
    const unit = intent.duration === 1 ? intent.durationUnit.replace(/s$/, '') : intent.durationUnit;
    parts.push(`${intent.stayType === 'short' ? 'short stay' : 'long stay'}, ${intent.duration} ${unit}`);
  } else if (intent.stayType) {
    parts.push(intent.stayType === 'short' ? 'short stay' : 'long stay');
  }

  if (intent.rateAmount && intent.rateUnit) {
    parts.push(`₹${Number(intent.rateAmount).toLocaleString('en-IN')}/${intent.rateUnit}`);
  } else if (doc.sharing && doc.sharing.price) {
    parts.push(`₹${Number(doc.sharing.price).toLocaleString('en-IN')}/month`);
  }

  if (intent.totalAmount) parts.push(`total ₹${Number(intent.totalAmount).toLocaleString('en-IN')}`);

  return parts.join(' · ');
};

/** The joining date in words, or the older free-text preference. */
const describeJoiningDate = (doc) => {
  const intent = doc.intent || {};
  if (intent.joiningDate) {
    const d = new Date(`${intent.joiningDate}T00:00:00Z`);
    const when = d.toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
    return intent.flexibleJoin ? `${when} (flexible)` : when;
  }
  return [doc.preferredDate, doc.preferredTime].filter(Boolean).join(' at ') || '';
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/* ── Availability vocabulary ───────────────────────────────────────────────
   AVAILABLE is exclusive to this flow. YES and NO are deliberately absent:
   they belong to property verification, and an owner can have both pending
   at the same time on the same number.

   NOT AVAILABLE is tested first — it contains the word "available", so the
   other order would read every decline as a confirmation. */
const DECLINE_RE = /\b(not\s*available|unavailable|not\s*free|no\s*t?\s*available)\b/i;
const CONFIRM_RE = /\bavailable\b/i;

/** Is this inbound message addressed to the availability flow at all? */
const isAvailabilityCommand = (text, payload) => {
  const body = `${payload || ''} ${text || ''}`;
  return /^VISIT_(YES|NO):/i.test(String(payload || '').trim())
    || DECLINE_RE.test(body)
    || CONFIRM_RE.test(body);
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

/* Twilio/SMS being unconfigured is a deployment fault, not a customer's
   mistake, and it should say so plainly rather than fail further in. */
const smsUnavailable = (res) => {
  const problem = smsConfigProblem();
  console.error('[visit-requests] SMS gateway not ready:', problem);
  return res.status(503).json({
    success: false,
    code: 'SMS_NOT_CONFIGURED',
    message: 'We cannot send verification codes right now. Please call the owner directly.',
  });
};

/* A request nobody answered is not still pending, whatever the row says.
   Resolved on read rather than by a background job — the only things that
   care are the status endpoint and the webhook, and both pass through here. */
const settleIfExpired = async (doc) => {
  if (doc.status === 'pending_owner' && doc.expiresAt && doc.expiresAt <= new Date()) {
    doc.status = 'expired';
    doc.decidedAt = new Date();
    await doc.save();
  }
  return doc;
};

const issueOtp = async (doc) => {
  const otp = generateOtp();
  const salt = newSalt();
  doc.otp.salt = salt;
  doc.otp.hash = hashOtp(otp, salt);
  doc.otp.expiresAt = new Date(Date.now() + OTP_TTL_MS);
  doc.otp.attempts = 0;
  doc.otp.lastSentAt = new Date();
  await doc.save();

  const sent = await sendOtpSms(doc.customer.phone, otp);

  /* The gateway's campaign id is the only handle on a message once it has
     left, so "the code never arrived" can be traced rather than guessed. */
  if (sent.success && sent.campId) {
    doc.otp.campId = sent.campId;
    await doc.save();
  }
  return sent;
};

/* ── POST / — start a request ─────────────────────────────────────────────── */


/**
 * Is the room the visitor picked actually free?
 *
 * ## Why this is asked before the owner is ever messaged
 *
 * An owner whose last bed went yesterday was still being sent a WhatsApp
 * template asking whether it was free, and the visitor was still being told to
 * wait for an answer — an answer that could only ever be "no". That is a
 * message an owner did not need and a wait a student should not have had.
 *
 * ## Silence is not zero
 *
 * `NO_INVENTORY_RECORDED` means nobody ever counted this property's beds, and
 * a third of the live listings are in that state. Refusing those would break
 * requests for properties that are perfectly available and merely unmeasured,
 * so only a KNOWN empty pool — or an owner who paused the room — stops a
 * request here. The unmeasured case carries on exactly as before.
 *
 * @returns {Promise<{free: true} | {free: false, code: string, message: string}>}
 */
const checkRoomIsFree = async (property, chosen) => {
  if (!chosen || !chosen.label) return { free: true };

  let options;
  try {
    options = await requestableOptions(property);
  } catch (error) {
    /* The inventory read failing is not the visitor's problem, and refusing
       on it would turn a database hiccup into "this room is taken". */
    console.warn('[visit-requests] Could not read inventory; letting the request through:', error.message);
    return { free: true };
  }

  const option = options.find((o) => o.label === chosen.label);
  if (!option) return { free: true };

  if (option.reason === 'NO_BEDS_FREE') {
    /* Naming the moment it went does two things a bare "full" cannot: it
       shows the listing is live rather than stale, and it tells somebody
       whether they missed it by an hour or a fortnight. */
    const when = await bookedAtLabel(option.shareTypeId);
    return {
      free: false,
      code: 'NO_BEDS_FREE',
      bookedAt: when,
      message: when
        ? `${chosen.label} was booked on ${when}. Nothing has been sent to the owner — try another room type, or check back later.`
        : `${chosen.label} is fully booked. Nothing has been sent to the owner — try another room type, or check back later.`,
    };
  }
  if (option.reason === 'OWNER_PAUSED') {
    return {
      free: false,
      code: 'OWNER_PAUSED',
      message: `The owner has paused ${chosen.label} for now. Nothing has been sent to them — try another room type.`,
    };
  }
  return { free: true };
};

const createVisitRequest = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    /* The SMS gateway is checked further down, once it is known whether a code
       is going out at all. Someone already signed in needs no code, and
       refusing them because the gateway is down would be a 503 for a
       dependency their request never touches. */

    const {
      listingId, name, phone, email, sharing,
      preferredDate, preferredTime, consentWhatsApp = false,
      consentedTerms = false, intent: postedIntent,
    } = req.body || {};

    if (!listingId) {
      return res.status(400).json({ success: false, code: 'BAD_INPUT', message: 'Which property?' });
    }
    if (!String(name || '').trim()) {
      return res.status(400).json({ success: false, code: 'BAD_NAME', message: 'Please enter your name.' });
    }
    /* Optional, and only checked when given: a visitor who typed something
       into the box deserves to know it is malformed, but one who left it
       alone is not being asked for it at all. */
    const givenEmail = String(email || '').trim();
    if (givenEmail && !EMAIL_RE.test(givenEmail)) {
      return res.status(400).json({ success: false, code: 'BAD_EMAIL', message: 'That email address does not look right. You can leave it blank.' });
    }

    const customerPhone = toE164(phone);
    if (!isIndianMobile(customerPhone)) {
      return res.status(400).json({
        success: false,
        code: 'BAD_PHONE',
        message: 'Please enter a valid 10-digit Indian mobile number.',
      });
    }

    /*
     * Already signed in as this number?
     *
     * `attachCustomerIfPresent` put the customer here if a valid session came
     * with the request. The phone comparison is the part that matters: a
     * session proves one number, and it must not be usable to skip the code
     * for a different one. Mismatched, it is ignored and the form behaves
     * exactly as it does for a stranger.
     *
     * This preserves the rule the whole flow is built on — the owner is
     * contacted only after the customer's number is proven. A session IS that
     * proof, an SMS code from the same number within the last day, and it is
     * re-verified against the database on every request rather than trusted
     * from the token alone.
     */
    const signedInAs = req.customer && req.customer.phone === customerPhone
      ? req.customer
      : null;

    /* The property is the source of truth for who gets messaged. */
    const property = OBJECT_ID.test(String(listingId))
      ? await Property.findById(listingId).lean()
      : null;

    if (!property) {
      return res.status(404).json({ success: false, code: 'NO_LISTING', message: 'That listing is no longer available.' });
    }

    const ownerMobile = toE164(property.ownerMobile);
    if (!ownerMobile) {
      console.error(`[visit-requests] Property ${listingId} has an unusable ownerMobile:`, property.ownerMobile);
      return res.status(422).json({
        success: false,
        code: 'NO_OWNER_CONTACT',
        message: 'This owner has no reachable number on file, so a visit cannot be requested here.',
      });
    }

    /* The occupancy picked, resolved against the property rather than
       believed. The price travels from the property too, so a posted body
       cannot put a number in front of the owner that the page never showed. */
    const options = sharingOptionsFor(property);
    let chosen = null;
    if (options.length) {
      chosen = findSharingOption(property, sharing);
      if (!chosen) {
        return res.status(400).json({
          success: false,
          code: 'BAD_SHARING',
          options: options.map((o) => o.label),
          message: 'Please choose which sharing option you want to visit for.',
        });
      }
    }

    /* The stay itself: type, duration, joining date, flexibility. Re-derived
       from the property, never believed — validateIntent returns the intent
       rebuilt from the property's own numbers, so a posted rate is discarded
       rather than trusted. */
    const simplePath = SIMPLE_PATH_CATEGORIES.includes(normaliseCategory(property.category));
  /* A hotel is asked for a check-in and a check-out rather than a duration.
     `validateIntent` resolves the two dates into the same intent shape a short
     stay produces, so nothing past this line has to know. */
  const datesPath = NIGHTLY_CATEGORIES.includes(normaliseCategory(property.category));
  /* A token category asks for the layout and nothing else at this stage. The
     joining date comes after the owner confirms and the token is paid, when it
     is a commitment rather than a guess about a viewing nobody has agreed to
     yet. */
  const tokenPath = needsToken(property);
    const checked = validateIntent({
      doc: property,
      intent: postedIntent,
      sharingOption: chosen,
      simplePath,
      datesPath,
    });
    if (!checked.ok) {
      return res.status(400).json({
        success: false,
        code: checked.code,
        message: checked.message,
        ...(checked.options ? { options: checked.options } : {}),
        ...(checked.window ? { window: checked.window } : {}),
      });
    }
    const intent = checked.intent;

    /* Consent is a legal record, not a formality. Required wherever the page
       shows the Privacy Policy and Terms — which is the full stay-intent
       path. The simple path has no such gate, and neither did clients written
       before this existed: demanding it of them would reject requests that
       were valid yesterday, for a box their build never rendered. */
    /*
     * Consent is asked of every category.
     *
     * The simple path used to be exempt, which meant a bachelor or co-live
     * request was recorded with no evidence the person agreed to anything —
     * the same contact details going to the same owner, and nothing behind
     * it. The exemption was about the stay INTENT being simpler, and it got
     * applied to the consent by proximity.
     *
     * `legacy` still is exempt: a client sending no intent at all predates
     * the checkbox, and rejecting those would break requests from an older
     * app bundle that were valid when it shipped.
     */
    if (!checked.legacy && consentedTerms !== true) {
      return res.status(400).json({
        success: false,
        code: 'CONSENT_REQUIRED',
        message: 'Please accept the Privacy Policy and Terms to continue.',
      });
    }

    /*
     * The room is NOT checked here, and that is a deliberate reversal.
     *
     * It used to be, so that a full room cost nobody an SMS. But refusing at
     * this point means the visitor is turned away before they exist: no row,
     * no name, no number, nothing to follow up with. Somebody who wanted this
     * room enough to fill the form is worth knowing about even when the room
     * is gone — they are the first person to call when it frees up, or the
     * one to offer the room next door.
     *
     * So the form completes, the code is sent, and the request is written
     * with their details on it. `verifyVisitRequest` checks the room once the
     * number is proven, refuses there if it is taken, and the row stays.
     *
     * The trade is one DLT SMS for one lead. That is the intended price.
     */

    /* Already waiting on this exact property? Hand back the request in flight
       instead of ringing the owner a second time about it. */
    const open = await VisitRequest.findOne({
      listingId: String(listingId),
      'customer.phone': customerPhone,
      status: 'pending_owner',
    }).sort({ createdAt: -1 });

    if (open) {
      await settleIfExpired(open);
      if (open.status === 'pending_owner') {
        return res.status(200).json({
          success: true,
          alreadyPending: true,
          data: Object.assign(open.toPublic(), { phoneMasked: maskPhone(customerPhone) }),
        });
      }
    }

    /* One approach per property per day, answered or not. */
    const recent = await VisitRequest.countDocuments({
      listingId: String(listingId),
      'customer.phone': customerPhone,
      phoneVerifiedAt: { $ne: null },
      createdAt: { $gt: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    });
    if (recent >= 1) {
      return res.status(429).json({
        success: false,
        code: 'ALREADY_REQUESTED',
        message: 'You have already requested a visit for this property today. '
          + 'The owner has your number and will be in touch.',
      });
    }

    const doc = await VisitRequest.create({
      listingId: String(listingId),
      propertyName: property.name,
      ownerName: property.ownerName || 'Property Owner',
      ownerMobile,
      customer: {
        name: String(name).trim(),
        phone: customerPhone,
        email: givenEmail,
      },
      preferredDate: preferredDate ? String(preferredDate).trim().slice(0, 60) : null,
      preferredTime: preferredTime ? String(preferredTime).trim().slice(0, 60) : null,
      sharing: chosen ? { label: chosen.label, price: chosen.price } : { label: null, price: null },
      /*
       * Which bed pool this request is for.
       *
       * The app has always recorded it; the website never did, and the label
       * alone is not enough — the pool is keyed by a slug of it. Without this
       * there is nothing to decrement when the token is paid, and nothing to
       * look up when saying WHEN a room was booked.
       *
       * Derived at creation from the option the visitor actually picked, so a
       * label renamed on the property later cannot re-point a request that is
       * already in flight at a different pool.
       */
      shareTypeId: (chosen && chosen.shareTypeId) || null,
      intent,
      /*
       * A bachelor or co-live visit is paid for once the owner confirms.
       *
       * Decided here, from the category, and never re-read: a listing whose
       * category is edited later must not retroactively make a paid request
       * unpaid, or turn a free one into a debt.
       */
      payment: needsToken(property)
        ? { required: true, status: 'pending', amountPaise: config.razorpay.tokenAmountPaise }
        : { required: false, status: 'not_required' },
      consentWhatsApp: Boolean(consentWhatsApp),
      consentAt: consentWhatsApp ? new Date() : null,
      consentedTerms: consentedTerms === true,
      consentedTermsAt: consentedTerms === true ? new Date() : null,
      requestIp: req.ip,
      status: 'otp_pending',
      /* Stamped from the session rather than from an SMS about to be sent.
         The status stays `otp_pending` because the step it names — telling the
         owner — has not happened yet; `/verify` does that, and skips the code
         check when this field is already set. */
      phoneVerifiedAt: signedInAs ? new Date() : null,
    });

    /* Signed in: no code, nothing to wait for. The site posts straight to
       `/verify`, which sees a verified number and goes on to the owner. */
    if (signedInAs) {
      return res.status(201).json({
        success: true,
        otpRequired: false,
        data: Object.assign(doc.toPublic(), { phoneMasked: maskPhone(customerPhone) }),
      });
    }

    if (smsConfigProblem()) return smsUnavailable(res);

    const sent = await issueOtp(doc);
    if (!sent.success) {
      return res.status(502).json({
        success: false,
        code: 'OTP_SEND_FAILED',
        message: 'We could not send the verification code to that number. Please check it and try again.',
      });
    }

    return res.status(201).json({
      success: true,
      otpRequired: true,
      data: Object.assign(doc.toPublic(), {
        phoneMasked: maskPhone(customerPhone),
        resendInSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
      }),
    });
  } catch (error) {
    return next(error);
  }
};

/* ── the browser session ───────────────────────────────────────────────────
 *
 * A visit request already proves a phone number with an SMS code. That is the
 * same proof `/customers/auth/verify` demands, so rather than stand up a
 * fourth identity system for the website, the same OTP mints the same kind of
 * customer session the app uses — one day rather than seven.
 *
 * Signing in is therefore a side effect of asking for a visit, never a gate in
 * front of it. Nothing below can fail the request: a session is a convenience
 * that saves the NEXT request an SMS, and losing it costs one code.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Find or create the customer behind a verified request, and issue a session.
 *
 * Returns null rather than throwing — every caller is on a path where the
 * visit request itself has already succeeded.
 */
const startWebSession = async (doc) => {
  if (!config.auth.configured) return null;
  try {
    const Customer = require('../customers/customer.model');
    const { signCustomerToken } = require('../customers/customerAuth.middleware');

    let customer = await Customer.findOne({ phone: doc.customer.phone });
    if (!customer) {
      customer = await Customer.create({
        customerId: `cus_${crypto.randomBytes(9).toString('hex')}`,
        phone: doc.customer.phone,
      });
    }
    /* A blocked number gets no session. The visit request it just made still
       stands — blocking is about signing in, and unpicking a request that is
       already on its way to an owner is not this function's business. */
    if (customer.status === 'blocked') return null;

    /* Only ever filled in, never overwritten: someone who set a name in the
       app must not have it replaced by whatever they typed into a form on a
       phone borrowed at a property viewing. */
    if (!customer.name && doc.customer.name) customer.name = doc.customer.name.slice(0, 80);
    if (!customer.email && doc.customer.email) customer.email = doc.customer.email;
    if (!customer.phoneVerifiedAt) customer.phoneVerifiedAt = new Date();
    customer.lastLoginAt = new Date();
    await customer.save();

    return {
      token: signCustomerToken(customer, { expiresIn: config.auth.webJwtExpiresIn }),
      expiresIn: config.auth.webJwtExpiresIn,
      customer: customer.toPublic(),
    };
  } catch (error) {
    console.warn('[visit-requests] Could not open a web session:', error.message);
    return null;
  }
};

/* ── POST /:id/verify — check the code, then ask the owner ─────────────────── */

const verifyVisitRequest = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const { id } = req.params;
    const { otp } = req.body || {};

    if (!OBJECT_ID.test(String(id))) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'That request no longer exists.' });
    }

    const doc = await VisitRequest.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'That request no longer exists.' });
    }

    // Verifying twice is not an error — the owner has already been asked.
    if (doc.status !== 'otp_pending') {
      await settleIfExpired(doc);
      return res.json({ success: true, data: doc.toPublic() });
    }

    /*
     * A request nobody was ever sent a code for was created by a held
     * session, and that session is the ONLY thing standing behind its
     * number. So finishing it requires the same session.
     *
     * Without this, the code is no longer what protects the step: request ids
     * are ObjectIds, which carry a timestamp and a counter and are therefore
     * guessable enough to try, and a hit would ring an owner's phone with
     * somebody else's half-finished request. The blast radius was small — the
     * name and number on it are the real customer's — but "small" is not a
     * reason to leave the door open when the check is one comparison.
     *
     * A request that DID get a code is untouched by this: the code is its
     * proof, it is checked below, and demanding a session as well would break
     * the ordinary signed-out flow entirely.
     */
    const codeWasSent = Boolean(doc.otp && doc.otp.lastSentAt);
    if (!codeWasSent && (!req.customer || req.customer.phone !== doc.customer.phone)) {
      return res.status(401).json({
        success: false,
        code: 'SESSION_REQUIRED',
        message: 'Please start the request again.',
      });
    }

    /* Already verified means this is a retry of the step *after* the code —
       the owner message failed and the customer pressed the button again.
       Re-checking a code that has already been destroyed would refuse a
       request that has nothing wrong with it. */
    if (!doc.phoneVerifiedAt) {
      if (!doc.otp || !doc.otp.hash || !doc.otp.expiresAt || doc.otp.expiresAt <= new Date()) {
        return res.status(410).json({
          success: false, code: 'OTP_EXPIRED', message: 'That code has expired. Ask for a new one.',
        });
      }

      if (doc.otp.attempts >= OTP_MAX_ATTEMPTS) {
        return res.status(429).json({
          success: false, code: 'OTP_LOCKED', message: 'Too many incorrect attempts. Start the request again.',
        });
      }

      if (!verifyOtp(String(otp || '').trim(), doc.otp.salt, doc.otp.hash)) {
        doc.otp.attempts += 1;
        await doc.save();
        const left = Math.max(0, OTP_MAX_ATTEMPTS - doc.otp.attempts);
        return res.status(400).json({
          success: false,
          code: 'OTP_WRONG',
          attemptsLeft: left,
          message: left > 0
            ? `That code is not right. ${left} attempt${left === 1 ? '' : 's'} left.`
            : 'That code is not right, and there are no attempts left.',
        });
      }

      /* Correct. Recorded before anything is attempted on WhatsApp, and the
         code destroyed so the row cannot be replayed — the phone is proven
         whether or not the next step succeeds. */
      doc.phoneVerifiedAt = new Date();
      doc.otp = {
        hash: null,
        salt: null,
        expiresAt: null,
        attempts: 0,
        // Kept: they say when the code went and how it can be traced.
        resends: doc.otp.resends,
        lastSentAt: doc.otp.lastSentAt,
        campId: doc.otp.campId,
      };
      await doc.save();
    }

    /* Read from the listing at send time rather than snapshotted onto the
       request, so a corrected door number corrects every request at once. The
       util swallows a missing listing into an empty string — a dropped line,
       never a blocked request. */
    const listingAddress = await readListingAddress(doc.listingId);

    /*
     * The room, checked once — here.
     *
     * This is the last moment before an owner's phone rings, and the only
     * place the check now lives. It runs after the number is proven and after
     * the request is written, so a visitor turned away is still a visitor on
     * record rather than one who bounced off the form.
     */
    /* Read here rather than reusing a variable from the create handler —
       this is a separate request, minutes later, with none of that scope. */
    const propertyNow = await Property.findById(doc.listingId).lean();
    const stillFree = propertyNow
      ? await checkRoomIsFree(propertyNow, doc.sharing)
      : { free: true };
    if (!stillFree.free) {
      doc.status = 'declined';
      doc.decidedAt = new Date();
      /*
       * `INVENTORY_TAKEN`, not the raw check code.
       *
       * `decisionReason` is a small closed vocabulary that both mobile apps
       * carry as a TypeScript union and switch on — `INVENTORY_TAKEN` is
       * already their word for "a decline the owner never made, forced by the
       * room being gone", and both render a sentence for it. Writing
       * `NO_BEDS_FREE` here instead put a value in the field that is not in
       * the schema enum at all: the save threw, the customer got a validation
       * error in place of an explanation, and the request was left mid-flight.
       *
       * A paused room lands here too. It is not literally taken, but it is
       * the same fact for everyone downstream — unavailable, and not the
       * owner's answer — and the customer's sentence comes from `message`,
       * which says which of the two it was.
       */
      doc.decisionReason = 'INVENTORY_TAKEN';
      await doc.save();

      /* `stillFree.message` verbatim now. It used to be reworded to "it went
         while you were confirming your number", which was true only because
         the room had been checked and found free at the form. Nothing checks
         it there any more, so it may equally have been taken yesterday, and
         the plain "was booked on <when>" is the sentence that is true in both
         cases. */
      return res.status(409).json({
        success: false,
        code: stillFree.code,
        message: stillFree.message,
        error: stillFree.code,
        data: doc.toPublic(),
      });
    }

    const sent = await sendVisitRequestMessage({
      ownerMobile: doc.ownerMobile,
      ownerName: doc.ownerName,
      propertyName: doc.propertyName,
      customerName: doc.customer.name,
      sharingLabel: doc.sharing && doc.sharing.label,
      address: listingAddress,
      selectionSummary: describeSelection(doc),
      joiningDate: describeJoiningDate(doc),
      /* The intent in words, built from what was actually recorded — an
         absent field drops out of the sentence rather than printing null.
         Falls back to the free-text preferences for older requests. */
      stayDescription: describeIntent(doc.intent)
        || [doc.preferredDate, doc.preferredTime].filter(Boolean).join(' at ')
        || null,
      requestId: String(doc._id),
    });

    if (!sent.success) {
      console.error('[visit-requests] Owner message failed:', sent.error);
      return res.status(502).json({
        success: false,
        code: 'OWNER_NOTIFY_FAILED',
        phoneVerified: true,
        message: 'Your number is verified, but we could not reach the owner on WhatsApp. Please try again shortly.',
      });
    }

    doc.status = 'pending_owner';
    doc.ownerMessageSid = sent.messageSid;
    doc.expiresAt = new Date(Date.now() + OWNER_REPLY_WINDOW_MS);
    await doc.save();

    /* The number is proven and the owner is away — so this is the moment the
       session is worth issuing. `session` is null when auth is unconfigured
       or the number is blocked, and the site simply stays signed out. */
    return res.json({ success: true, data: doc.toPublic(), session: await startWebSession(doc) });
  } catch (error) {
    return next(error);
  }
};

/* ── POST /:id/resend — a fresh code ──────────────────────────────────────── */

const resendVisitOtp = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    if (smsConfigProblem()) return smsUnavailable(res);

    const { id } = req.params;
    if (!OBJECT_ID.test(String(id))) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'That request no longer exists.' });
    }

    const doc = await VisitRequest.findById(id);
    if (!doc || doc.status !== 'otp_pending') {
      return res.status(409).json({
        success: false, code: 'NOT_PENDING', message: 'There is no code waiting to be sent for this request.',
      });
    }

    const lastSent = doc.otp && doc.otp.lastSentAt ? doc.otp.lastSentAt.getTime() : 0;
    const since = Date.now() - lastSent;
    if (since < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - since) / 1000);
      return res.status(429).json({
        success: false, code: 'RESEND_TOO_SOON', retryAfter: wait,
        message: `Please wait ${wait}s before asking for another code.`,
      });
    }

    if (doc.otp.resends >= OTP_MAX_RESENDS) {
      return res.status(429).json({
        success: false, code: 'RESEND_LIMIT',
        message: 'That is the maximum number of codes for one request. Please start again.',
      });
    }

    doc.otp.resends += 1;
    const sent = await issueOtp(doc);
    if (!sent.success) {
      return res.status(502).json({
        success: false, code: 'OTP_SEND_FAILED',
        message: 'We could not send the code. Please check the number and try again.',
      });
    }

    return res.json({
      success: true,
      data: Object.assign(doc.toPublic(), {
        phoneMasked: maskPhone(doc.customer.phone),
        resendInSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
      }),
    });
  } catch (error) {
    return next(error);
  }
};

/* ── GET /:id — what the waiting page polls ───────────────────────────────── */

const getVisitRequest = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const { id } = req.params;
    if (!OBJECT_ID.test(String(id))) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'That request no longer exists.' });
    }

    const doc = await VisitRequest.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'That request no longer exists.' });
    }

    await settleIfExpired(doc);

    const data = doc.toPublic();

    /*
     * The address, but only once it has been released.
     *
     * `toPublic` says WHEN the address was released and never what it is —
     * it is a synchronous method on the document and the address lives on the
     * property. So the page could see that it had been paid for and still had
     * nothing to show; the street address only ever arrived as the return
     * value of `setJoiningDate`, which meant a reload lost it and a payment
     * made on the phone never produced it at all.
     *
     * `addressReleasedAt` is the gate, exactly as it is everywhere else: set
     * by the token handler when the payment verifies, and null until then.
     * Reading it here rather than trusting a client flag keeps the rule in
     * one place — a request that has not paid gets no address from this
     * endpoint no matter what it asks for.
     */
    if (doc.addressReleasedAt) {
      data.address = await readListingAddress(doc.listingId);
    }

    /*
     * The owner's number and a map pin, once the ₹99 unlock has verified.
     *
     * A separate gate from the one above and deliberately so: the visit token
     * releases the address, this releases a way to ring the owner, and they
     * are bought separately. Reading `contactUnlock.verifiedAt` — the field
     * only an HMAC check writes — rather than trusting anything the client
     * sent keeps that decision here, next to the other one, instead of in a
     * browser.
     *
     * `toPublic` deliberately carries the status and not the contents, so
     * this is the only place a customer's number-shaped answer is assembled.
     */
    if (doc.contactUnlock?.status === 'paid' && doc.contactUnlock?.verifiedAt) {
      data.contact = await readListingContact(doc.listingId);
    }

    // Polled every few seconds by every waiting customer — never cached.
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

/* ── Inbound WhatsApp: the owner's AVAILABLE ──────────────────────────────── */

/**
 * Called from the single webhook before the verification logic runs.
 *
 * Returns a reply string when this flow owned the message, or null to say
 * "not mine" — in which case the caller carries on to property verification
 * exactly as before. Returning null for anything that is not an availability
 * command is what keeps YES and NO meaning what they have always meant.
 *
 * Identifying the right request, in order of confidence:
 *
 *   1. A quick-reply payload VISIT_YES:<id> / VISIT_NO:<id> names its own
 *      request. The sender must still own it, or a crafted payload could
 *      answer someone else's.
 *   2. Otherwise the newest still-open request from that number. An owner
 *      with several pending gets the most recent one, and the reply says
 *      which property it was so a wrong guess is visible rather than silent.
 *
 * Never throws: an exception here would fall through to the verification
 * handler and could answer a verification with an availability reply.
 */
const handleAvailabilityReply = async ({ from, body, buttonPayload }) => {
  try {
    const text = String(body || '').trim();
    const payload = String(buttonPayload || '').trim();

    if (!isAvailabilityCommand(text, payload)) return null;
    if (mongoose.connection.readyState !== 1) {
      console.error('[availability] Reply arrived while the database was disconnected.');
      return 'Sorry — we could not record that just now. Please try again in a few minutes.';
    }

    const sender = toE164(from);
    if (!sender) return null;

    let doc = null;
    let confirmed = null;

    const tagged = payload.match(/^VISIT_(YES|NO):([0-9a-fA-F]{24})$/i);
    if (tagged) {
      confirmed = tagged[1].toUpperCase() === 'YES';
      doc = await VisitRequest.findById(tagged[2]);
      if (doc && doc.ownerMobile !== sender) {
        console.warn(`[availability] ${sender} replied with a payload for a request owned by someone else.`);
        doc = null;
        confirmed = null;
      }
    }

    if (!doc) {
      // DECLINE first: "not available" contains "available".
      if (DECLINE_RE.test(text)) confirmed = false;
      else if (CONFIRM_RE.test(text)) confirmed = true;
      else return null;

      /*
       * Web requests only.
       *
       * An app request is answered in Stay Partner — its owner is never sent
       * a WhatsApp template for it, so a reply here cannot be about one. But
       * an owner with both kinds pending would have had this untargeted
       * lookup confirm whichever was newest, which could be the app one: a
       * visit accepted by a message the owner was never shown, and on the
       * app path that would also skip the bed claim that acceptance performs.
       */
      doc = await VisitRequest.findOne({
        ownerMobile: sender,
        status: 'pending_owner',
        channel: { $ne: 'app' },
      }).sort({ createdAt: -1 });
    }

    /* Nothing of ours is open. Deliberately returns null rather than a
       message: the same number may have a property verification pending, and
       this flow must not answer for it. */
    if (!doc) {
      console.log(`[availability] ${sender} sent an availability word with nothing pending — passing through.`);
      return null;
    }

    const what = doc.sharing && doc.sharing.label
      ? `${doc.sharing.label} at ${doc.propertyName}`
      : doc.propertyName;

    if (doc.status !== 'pending_owner') {
      const already = doc.status === 'confirmed' ? 'confirmed as available'
        : doc.status === 'declined' ? 'marked unavailable' : 'closed';
      return `That visit request for ${what} was already ${already}. Thank you.`;
    }

    if (doc.expiresAt && doc.expiresAt <= new Date()) {
      doc.status = 'expired';
      doc.decidedAt = new Date();
      doc.ownerReplyRaw = payload || text;
      await doc.save();
      /* The window is minutes long now, so an owner who taps late needs more
         than "it expired" — they need to know the next one will also be
         short, or they will keep missing them. The duration is read from the
         same constant that sets the deadline, so the sentence cannot drift
         out of step with the actual window. */
      return `This visit request for ${what} has expired — it was not answered within `
        + `${OWNER_REPLY_WINDOW_MINUTES} minutes, so we have let the customer know.\n\n`
        + 'Please watch out for the next request and reply as soon as it arrives: '
        + `requests stay open for only ${OWNER_REPLY_WINDOW_MINUTES} minutes.`;
    }

    doc.status = confirmed ? 'confirmed' : 'declined';

    /*
     * The token clock starts when the owner says yes.
     *
     * From here they are holding a layout for somebody, so the request has a
     * deadline to be paid for — without one an unpaid confirmation holds it
     * for ever. A decline needs no clock: there is nothing left to pay for.
     */
    if (confirmed && doc.payment?.required && doc.payment.status !== 'paid') {
      doc.payment.status = 'pending';
      doc.payment.dueBy = new Date(Date.now() + config.razorpay.payWindowHours * 60 * 60 * 1000);
    }
    doc.decidedAt = new Date();
    doc.ownerReplyRaw = payload || text;

    /* The entry PIN exists only for a confirmed visit, and only once: a
       second confirmation of the same request must not hand out a second
       number, or the two sides end up holding different PINs and neither is
       wrong. (The already-decided branch above normally catches a repeat, so
       this guard is for the race where two taps arrive together.) */
    /*
     * The visit reference waits for the money.
     *
     * It is what the two of them match at the door, so issuing it the moment
     * an owner taps AVAILABLE hands over a confirmed visit before anybody has
     * paid for one — the reference IS the confirmation as far as both sides
     * are concerned. On a category that charges, it is minted when the token
     * clears (see visitPayment.controller) and sent to both at once.
     */
    const tokenPending = doc.payment?.required && doc.payment.status !== 'paid';
    if (confirmed && !doc.entryPin && !tokenPending) {
      doc.entryPin = generateEntryPin();
      doc.entryPinIssuedAt = new Date();
    }

    await doc.save();

    /* Confirmed: only the CUSTOMER is messaged. The owner's copy used to go
       out here too and arrived as a near-duplicate of the reply below, which
       is what a live test showed — so the reply is now their single copy.
       Fired without awaiting: the owner's decision is already saved, and
       holding the webhook open on another Twilio call risks a timeout and a
       retry of the whole tap. */
    if (confirmed) {
      /*
       * The address is withheld while a token is outstanding.
       *
       * On a category that charges for a visit, the street address is what the
       * token buys — so a confirmation message that carried it handed over the
       * thing being paid for a minute before the payment. The owner's own
       * message still shows it; theirs is the door they own.
       *
       * The AREA still goes, because a confirmation with no location at all
       * reads as though nobody knows where the property is. What is held back
       * is the door number and the map link that leads to it.
       */
      const tokenOutstanding = doc.payment?.required && doc.payment.status !== 'paid';

      let pinAddress = '';
      try {
        const listing = await Property.findById(doc.listingId).select('address place').lean();

        if (tokenOutstanding) {
          /*
           * No address at all — a link to pay for it instead.
           *
           * The approved template's address variable takes any string, so the
           * instruction goes in that slot rather than needing a second
           * template through Meta review. A payment LINK rather than a button
           * on the site, because the person reading this is in WhatsApp: a
           * URL they can tap is one step, and finding their way back to a tab
           * they closed is several.
           */
          const link = await ensurePaymentLink(doc);
          const site = String(process.env.PUBLIC_SITE_URL || 'https://lampose.com').replace(/\/$/, '');
          const listingUrl = `${site}/explore/${doc.listingId}`;

          pinAddress = link
            ? `Pay ₹${(doc.payment.amountPaise || 0) / 100} to unlock the full address: ${link}`
            + ` — or open the listing: ${listingUrl}`
            : `Open the listing to pay and unlock the full address: ${listingUrl}`;
        } else if (listing) {
          pinAddress = listing.address && listing.place
            && String(listing.address).toLowerCase().includes(String(listing.place).toLowerCase())
            ? listing.address
            : [listing.address, listing.place].filter(Boolean).join(', ');
        }
      } catch (err) {
        console.warn('[availability] Could not read the listing address for the PIN message:', err.message);
      }

      // Only where they opted in — WhatsApp will not carry a business message
      // to someone who never wrote first, template or not.
      if (doc.consentWhatsApp) {
        sendVisitConfirmationToCustomer({
          customerPhone: doc.customer.phone,
          customerName: doc.customer.name,
          propertyName: doc.propertyName,
          address: pinAddress,
          /* No map link on the pre-payment message: that slot holds a "pay
             here" line, and a link built from it points Google at the
             sentence. */
          directions: !tokenOutstanding,
          sharingLabel: doc.sharing && doc.sharing.label,
          joiningDate: describeJoiningDate(doc),
          /* Nothing to show at a door that has not been paid for. */
          pin: doc.entryPin || 'Sent once your token is paid',
        }).then((result) => {
          if (!result.success) {
            console.error('[availability] Visit confirmation to customer failed:', result.error);
            return;
          }
          VisitRequest.updateOne({ _id: doc._id }, { customerMessageSid: result.messageSid })
            .catch((err) => console.error('[availability] Could not record the customer message SID:', err.message));
        }).catch((err) => console.error('[availability] Visit confirmation send failed:', err.message));
      }
    }

    /* The customer's page is polling and will show this within seconds. The
       WhatsApp note is the courtesy on top, and only where they asked for it
       — so a failure is logged and dropped, never surfaced to the owner whose
       reply was recorded perfectly well.

       A confirmed visit already sends the PIN message above, which carries
       the same news plus the code — so this plain outcome note is now only
       for a decline. */
    if (doc.consentWhatsApp && !confirmed) {
      sendVisitOutcomeMessage({
        customerPhone: doc.customer.phone,
        customerName: doc.customer.name,
        propertyName: doc.propertyName,
        sharingLabel: doc.sharing && doc.sharing.label,
        confirmed,
      }).then((sent) => {
        if (!sent.success) {
          console.error('[availability] Could not notify the customer:', sent.error);
          return;
        }
        VisitRequest.updateOne({ _id: doc._id }, { customerMessageSid: sent.messageSid })
          .catch((err) => console.error('[availability] Could not record the customer message SID:', err.message));
      });
    }

    console.log(`${confirmed ? '✅' : '❌'} [Availability] ${sender} marked ${what} `
      + `${confirmed ? 'available' : 'unavailable'} for ${doc.customer.name}.`);

    /* The PIN is repeated in this reply as well as its own message. The
       owner has just tapped a button and is looking at the chat right now,
       and the separate template can be delayed or fail — this reply cannot,
       because it is the response to their own inbound message. */
    /*
     * Two different truths, and the owner is owed the right one.
     *
     * Without a token the visit is settled the moment they tap, so they get
     * the reference now. With one outstanding, it is not settled: the visitor
     * still has to pay, and telling the owner to expect somebody with a
     * reference number nobody has issued would have them turn up to a door
     * expecting a match that cannot happen.
     */
    return confirmed
      ? (doc.payment?.required && doc.payment.status !== 'paid'
        ? `Thank you. We have told ${doc.customer.name} that ${what} is available.\n\n`
          + 'They are confirming their visit now. We will send you the visit reference number '
          + 'as soon as they do — please wait for it before expecting them.'
        : `Thank you. We have told ${doc.customer.name} that ${what} is available.\n\n`
          + `Visit reference: ${doc.entryPin}\n\n`
          + `${doc.customer.name} has the same reference number. Please ask them for it when they arrive and check that it matches.`)
      : `Thank you. We have let ${doc.customer.name} know that ${what} is not `
        + 'available at the moment.';
  } catch (error) {
    console.error('[availability] Failed to handle a reply:', error.message || error);
    /* Owning the message but failing is still owning it — falling through to
       verification here could let an availability reply approve a property. */
    return 'Sorry — something went wrong recording that. Please try again.';
  }
};

module.exports = {
  createVisitRequest,
  verifyVisitRequest,
  resendVisitOtp,
  getVisitRequest,
  handleAvailabilityReply,
  isAvailabilityCommand,
};
