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
const mongoose = require('mongoose');

const Property = require('../properties/property.model');
const VisitRequest = require('./visitRequest.model');
const { sharingOptionsFor, findSharingOption } = require('../listings/sharing.util');
const { validateIntent, describeIntent } = require('../listings/stayIntent.util');

/* Kept in step with SIMPLE_PATH_CATEGORIES in utils/listingFormatter.js —
   the categories whose page asks for sharing alone. */
const SIMPLE_PATH_CATEGORIES = ['Bachelor Room'];
const { sendOtpSms, smsConfigProblem } = require('../../infrastructure/sms/sms');
const {
  toE164, isIndianMobile, maskPhone,
  sendVisitRequestMessage, sendVisitOutcomeMessage,
} = require('../../infrastructure/twilio/twilio');
const {
  OTP_TTL_MS, OTP_MAX_ATTEMPTS, OTP_MAX_RESENDS, OTP_RESEND_COOLDOWN_MS,
  generateOtp, newSalt, hashOtp, verifyOtp,
} = require('./otp.util');

const VISIT_TTL_MS = 24 * 60 * 60 * 1000;
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

const createVisitRequest = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);
    if (smsConfigProblem()) return smsUnavailable(res);

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
    if (!EMAIL_RE.test(String(email || '').trim())) {
      return res.status(400).json({ success: false, code: 'BAD_EMAIL', message: 'Please enter a valid email address.' });
    }

    const customerPhone = toE164(phone);
    if (!isIndianMobile(customerPhone)) {
      return res.status(400).json({
        success: false,
        code: 'BAD_PHONE',
        message: 'Please enter a valid 10-digit Indian mobile number.',
      });
    }

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
    const simplePath = SIMPLE_PATH_CATEGORIES.includes(property.category);
    const checked = validateIntent({
      doc: property,
      intent: postedIntent,
      sharingOption: chosen,
      simplePath,
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
    if (!simplePath && !checked.legacy && consentedTerms !== true) {
      return res.status(400).json({
        success: false,
        code: 'CONSENT_REQUIRED',
        message: 'Please accept the Privacy Policy and Terms to continue.',
      });
    }

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
      createdAt: { $gt: new Date(Date.now() - VISIT_TTL_MS) },
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
        email: String(email).trim(),
      },
      preferredDate: preferredDate ? String(preferredDate).trim().slice(0, 60) : null,
      preferredTime: preferredTime ? String(preferredTime).trim().slice(0, 60) : null,
      sharing: chosen ? { label: chosen.label, price: chosen.price } : { label: null, price: null },
      intent,
      consentWhatsApp: Boolean(consentWhatsApp),
      consentAt: consentWhatsApp ? new Date() : null,
      consentedTerms: consentedTerms === true,
      consentedTermsAt: consentedTerms === true ? new Date() : null,
      requestIp: req.ip,
      status: 'otp_pending',
    });

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
      data: Object.assign(doc.toPublic(), {
        phoneMasked: maskPhone(customerPhone),
        resendInSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
      }),
    });
  } catch (error) {
    return next(error);
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

    const sent = await sendVisitRequestMessage({
      ownerMobile: doc.ownerMobile,
      ownerName: doc.ownerName,
      propertyName: doc.propertyName,
      customerName: doc.customer.name,
      sharingLabel: doc.sharing && doc.sharing.label,
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
    doc.expiresAt = new Date(Date.now() + VISIT_TTL_MS);
    await doc.save();

    return res.json({ success: true, data: doc.toPublic() });
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

    // Polled every few seconds by every waiting customer — never cached.
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, data: doc.toPublic() });
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

      doc = await VisitRequest.findOne({ ownerMobile: sender, status: 'pending_owner' })
        .sort({ createdAt: -1 });
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
      return `That visit request for ${what} expired before it was answered, so we have `
        + 'let the customer know. Thank you for replying.';
    }

    doc.status = confirmed ? 'confirmed' : 'declined';
    doc.decidedAt = new Date();
    doc.ownerReplyRaw = payload || text;
    await doc.save();

    /* The customer's page is polling and will show this within seconds. The
       WhatsApp note is the courtesy on top, and only where they asked for it
       — so a failure is logged and dropped, never surfaced to the owner whose
       reply was recorded perfectly well. */
    if (doc.consentWhatsApp) {
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

    return confirmed
      ? `Thank you. We have told ${doc.customer.name} that ${what} is available, `
        + 'and shared your number so they can arrange the visit.'
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
