/* ══════════════════════════════════════════════════════════════════════════
   Proof that an inbound WhatsApp message came from Twilio.

   `/api/whatsapp/webhook` is where an owner's YES verifies a property and a
   verifier's YES publishes it, and where an owner's AVAILABLE tells a
   student a room is theirs to visit. Until now anybody who knew the URL
   could POST `From=whatsapp:+91…&Body=YES` and speak as that owner. Twilio
   signs every request it sends with the account's auth token
   (`X-Twilio-Signature`, an HMAC over the exact URL plus the sorted POST
   parameters); this middleware checks it and refuses everything else.

   ## The URL has to be the one Twilio was given

   The signature covers the URL as configured in the Twilio console, scheme
   and host included. Behind nginx the request reaches this process as plain
   http on an internal host, so the URL is rebuilt from, in order:

     TWILIO_WEBHOOK_URL   the exact string, when set
     PUBLIC_BASE_URL      + req.originalUrl (the mount path and query intact)
     req.protocol/host    what Express sees — right only with `trust proxy`

   ## Fail closed, with one documented exception

   No auth token configured → 503, because a webhook that cannot be
   authenticated must not act. ALLOW_UNSIGNED_WEBHOOKS=true skips the check
   for a laptop that has no tunnel; `env.js` refuses that flag under
   NODE_ENV=production, the same way it refuses DEV_ALLOW_MARK_PAID.
   ══════════════════════════════════════════════════════════════════════════ */
const twilio = require('twilio');
const config = require('../../config/env');

const refuse = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

let warnedUnsigned = false;

const webhookUrl = (req) => {
  if (config.webhooks.twilioUrl) return config.webhooks.twilioUrl;
  const base = config.webhooks.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
  return `${base}${req.originalUrl}`;
};

function verifyTwilioSignature(req, res, next) {
  if (config.webhooks.allowUnsigned) {
    if (!warnedUnsigned) {
      console.warn('⚠️  [twilio] ALLOW_UNSIGNED_WEBHOOKS is on — inbound WhatsApp is NOT authenticated. Development only.');
      warnedUnsigned = true;
    }
    return next();
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return refuse(res, 503, 'WEBHOOK_NOT_CONFIGURED', 'TWILIO_AUTH_TOKEN is not set, so inbound messages cannot be authenticated.');
  }

  const signature = req.get('X-Twilio-Signature');
  if (!signature) return refuse(res, 403, 'MISSING_SIGNATURE', 'This request carries no Twilio signature.');

  const url = webhookUrl(req);
  const params = req.body && typeof req.body === 'object' ? req.body : {};
  if (!twilio.validateRequest(authToken, signature, url, params)) {
    console.warn(`🚫 [twilio] webhook rejected — signature does not match ${url}`);
    return refuse(res, 403, 'BAD_SIGNATURE', 'This request was not signed by Twilio.');
  }
  return next();
}

module.exports = { verifyTwilioSignature, webhookUrl };
