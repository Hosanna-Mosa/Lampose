/* ══════════════════════════════════════════════════════════════════════════
   SMS — smslogin.co, the DLT-registered route.

   One-time codes for the visit-request flow go out through here rather than
   Twilio. India's DLT regime binds SMS delivery to a registered sender header
   and an approved template body; that registration is with smslogin.co, while
   the Twilio sender is a WhatsApp number. The two are not interchangeable, so
   this sits alongside config/twilio.js rather than inside it.

   The provider's API is a plain GET with credentials in the query string, and
   it answers with a bare body rather than a status document — an invalid key
   still comes back HTTP 200 with the word "Invalid" in the text. Success is
   therefore inferred from the transport plus a scan of what came back. That
   is the contract on offer; the alternative is treating every send as
   successful, which leaves a customer staring at a code entry box for a
   message that never left.

   Uses global fetch (Node >= 18, which package.json already requires) so no
   HTTP dependency is added.
   ══════════════════════════════════════════════════════════════════════════ */
require('../../config/env');

const TIMEOUT_MS = 15000;

/* Read on every call, never captured at require time — module bodies run in
   require order, and anything captured here could be captured before dotenv
   has populated the environment. */
const cfg = () => ({
  apiUrl: process.env.SMS_API_URL || 'https://smslogin.co/v3/api.php',
  username: process.env.SMS_USERNAME,
  apikey: process.env.SMS_APIKEY,
  senderid: process.env.SMS_SENDERID,
});

/*
 * The registered bodies, one entry per DLT template.
 *
 * DLT binds every message to a template REGISTERED WITH THE OPERATOR, matched
 * character for character, and each one has its own id. Two kinds of message
 * therefore means two registrations — there is no generic "send some text"
 * on this route, which is the whole point of the regime.
 *
 * `otp` is the one-time code the visit, diner, rider and partner sign-ins all
 * use. `partnerPassword` is the restaurant owner's first credential, sent when
 * an administrator approves their application: it is on SMS rather than
 * WhatsApp because Meta refuses to register a WhatsApp template that carries a
 * credential — twice, with no reason given. See
 * `infrastructure/twilio/restaurantApprovedTemplate.js`.
 *
 * Read on every call, never captured at require time, for the same reason the
 * account is.
 */
const TEMPLATES = {
  otp: {
    idVar: 'SMS_OTP_TEMPLATE_ID',
    bodyVar: 'OTP_SMS_TEMPLATE',
    what: 'the one-time code',
  },
  /* Two slots, in this order: the ID, then the password. `sendTemplatedSms`
     refuses to send if the registered body and the values disagree about how
     many there are, because the alternative is a text message telling an owner
     their password is their phone number. */
  partnerPassword: {
    idVar: 'SMS_PARTNER_PASSWORD_TEMPLATE_ID',
    bodyVar: 'PARTNER_PASSWORD_SMS_TEMPLATE',
    what: "a restaurant owner's first password",
  },
};

const template = (kind) => {
  const spec = TEMPLATES[kind] || TEMPLATES.otp;
  return {
    ...spec,
    templateId: process.env[spec.idVar],
    body: process.env[spec.bodyVar] || '',
  };
};

/* Both spellings of the variable slot are accepted so the registered template
   can be pasted in exactly as the DLT portal shows it — `{#var#}` is what the
   portal writes, and hand-editing it to `{{otp}}` is one more chance to alter
   a body that has to match character for character. `{{password}}` is read
   too, so the second template can name its slot after what goes in it. */
const SLOT = /\{\{\s*(?:otp|code|password)\s*\}\}|\{#\s*var\d*\s*#\}/gi;

/* The provider signals problems in prose, not in a status code. */
const FAILURE_HINT = /invalid|error|fail|unauthori[sz]ed|authentication|insufficient|balance|blocked|reject|not\s*found/i;

/* Deliberately narrower than FAILURE_HINT: a delivery report legitimately
   contains the word "Failed" as a per-message status. */
const REPORT_ERROR = /['"]?\berror\b['"]?\s*:|invalid|unauthori[sz]ed|authentication/i;

/* The gateway answers with a Python-style dict, not JSON — bodies arrive as
   "{'campid':'a3b928bcffad921463c3'}", single quotes and all, sometimes
   wrapped in a second set of double quotes. JSON.parse cannot read that, so a
   named field is pulled out directly and JSON is tried only as a fallback for
   the shape the documentation promises. */
const pickField = (raw, key) => {
  const quoted = String(raw).match(new RegExp(`['"]${key}['"]\\s*:\\s*['"]([^'"]*)['"]`, 'i'));
  if (quoted) return quoted[1];
  try {
    const parsed = JSON.parse(raw);
    const hit = Object.entries(parsed).find(([k]) => k.toLowerCase() === key.toLowerCase());
    return hit ? String(hit[1]) : null;
  } catch (err) {
    return null;
  }
};

const CAMP_ID = /\b[0-9a-f]{16,32}\b/i;

const fail = (error, code = 'SMS_SEND_FAILED') => ({ success: false, error, code });

/**
 * Which piece is missing, named, so the fix is a step rather than a hunt.
 *
 * Defaults to the OTP template because every existing caller asks about that
 * one and says so by asking nothing — the visit, diner and rider flows all
 * call `smsConfigProblem()` bare, and a change of default would answer them
 * about a template they do not send.
 */
const smsConfigProblem = (kind = 'otp') => {
  const c = cfg();
  if (!c.username) return 'SMS_USERNAME is not set.';
  if (!c.apikey) return 'SMS_APIKEY is not set.';
  if (!c.senderid) return 'SMS_SENDERID is not set (the registered DLT header).';

  const t = template(kind);
  if (!t.templateId) return `${t.idVar} is not set (the DLT template id for ${t.what}).`;
  if (!t.body) return `${t.bodyVar} is not set (the DLT-approved body for ${t.what}).`;
  return null;
};

const smsReady = (kind = 'otp') => !smsConfigProblem(kind);

/**
 * Send one registered template, filling its slots IN ORDER.
 *
 * Never throws — the caller decides what a failed send means, because a code
 * that did not arrive should not read the same as a database that is down.
 *
 * @param {'otp'|'partnerPassword'} kind  which registered template
 * @param {string} phone  E.164 or 10-digit; normalised here
 * @param {string|string[]} values  one value, or one per `{#var#}` in order
 */
async function sendTemplatedSms(kind, phone, values) {
  const problem = smsConfigProblem(kind);
  if (problem) return fail(problem, 'SMS_NOT_CONFIGURED');

  // Local require: config/twilio pulls in the Twilio SDK, and this module is
  // also loaded by scripts that never send WhatsApp.
  const { toE164 } = require('../twilio/twilio');
  const e164 = toE164(phone);
  if (!e164) return fail('That phone number is not valid.', 'BAD_PHONE');

  const c = cfg();
  const t = template(kind);
  // The API wants the country code without the plus: "919876543210".
  const mobile = e164.replace(/^\+/, '');

  /*
   * One value per slot, in order.
   *
   * A registered body may have more than one — the partner sign-in text
   * carries an ID and a password — and `String.replace` with a global pattern
   * would otherwise put the SAME value in both. The ID and the password are
   * not interchangeable, and a message that tells somebody their password is
   * their phone number is worse than one that fails.
   *
   * A single value is accepted as itself so the OTP callers, which pass one,
   * read the way they always did.
   */
  const list = Array.isArray(values) ? values : [values];
  const slots = t.body.match(SLOT) || [];

  /* A template whose variable slot was never filled would send the literal
     "{#var#}" to the recipient and burn their code for nothing. */
  if (!slots.length) {
    console.error(`[sms] ${t.bodyVar} has no variable slot — expected {{otp}}, {{password}} or {#var#}. `
      + 'If the body ends at "{", it is unquoted in .env and a # started a comment.');
    return fail('The SMS template has no place to put the value.', 'TEMPLATE_NO_SLOT');
  }

  /* Fewer values than slots would leave a literal `{#var#}` in a real message;
     more would mean the caller thinks the registered body says something it
     does not. Both are a mismatch between the code and the DLT registration,
     which is a deployment problem rather than something a retry fixes. */
  if (slots.length !== list.length) {
    console.error(`[sms] ${t.bodyVar} has ${slots.length} slot(s) and ${list.length} value(s) were given.`);
    return fail('The SMS template does not match what we are trying to send.', 'TEMPLATE_SLOT_MISMATCH');
  }

  let next = 0;
  const message = t.body.replace(SLOT, () => list[next++]);

  const params = new URLSearchParams({
    username: c.username,
    apikey: c.apikey,
    senderid: c.senderid,
    mobile,
    message,
    templateid: t.templateId,
  });

  try {
    const res = await fetch(`${c.apiUrl}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const raw = (await res.text()).trim();

    if (!res.ok) {
      console.error(`[sms] HTTP ${res.status} from the gateway: ${raw.slice(0, 200)}`);
      return fail(`The SMS gateway answered ${res.status}.`);
    }

    if (FAILURE_HINT.test(raw)) {
      /* Logged in full, returned generic: the body can name the account and
         the key, and none of that belongs in a browser. */
      console.error(`[sms] Gateway refused the send: ${raw.slice(0, 200)}`);
      return fail('The SMS gateway refused the message.');
    }

    const campId = pickField(raw, 'campid') || (raw.match(CAMP_ID) || [])[0] || null;
    /* TEMPORARY diagnostic — a 200 with no FAILURE_HINT match only means the
       gateway accepted the send, not that it reached a handset. Logging the
       raw reply here (normally only logged on a failure) is what lets a
       "sent successfully but nothing arrived" report be told apart from a
       real bug: a DLT-route rejection after acceptance, a queued-not-
       delivered status, or a malformed mobile field would all still show up
       here even though `FAILURE_HINT` didn't match. Remove once the current
       non-delivery report is resolved. */
    console.log(`[sms] Gateway accepted "${mobile}" → campId=${campId || 'none'} raw="${raw.slice(0, 300)}"`);
    return { success: true, campId, raw: raw.slice(0, 200) };
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    console.error('[sms] Send failed:', error.message);
    return fail(timedOut
      ? 'The SMS gateway did not respond in time.'
      : `Could not reach the SMS gateway: ${error.message}`);
  }
}

/**
 * A one-time code, on the template every sign-in in this product uses.
 *
 * Kept as its own function rather than callers naming the kind: it is called
 * from four modules, its signature predates the second template, and a caller
 * that had to pass `'otp'` is a caller that can pass the wrong thing.
 */
const sendOtpSms = (phone, otp) => sendTemplatedSms('otp', phone, otp);

/**
 * A restaurant owner's sign-in details, when their application is approved.
 *
 * TWO values, in the order the registered body names them: the ID they sign in
 * with — their own mobile number, because email is optional on an application
 * and the phone is the one every account has — and the password.
 *
 * On SMS rather than WhatsApp because Meta has refused four WhatsApp templates
 * on this account, two of which carried no credential at all. The WhatsApp
 * message still goes and says the details are in a text; it carries the name,
 * the link and the sentence that DLT text cannot.
 */
const sendPartnerPasswordSms = (phone, userId, password) => sendTemplatedSms(
  'partnerPassword', phone, [userId, password],
);

/**
 * Delivery report for a campaign id captured at send time. Diagnostic only —
 * nothing in the verification flow waits on it. "Submitted" means the operator
 * has it and has not confirmed handset delivery yet, which is normal for the
 * first few seconds and is not a failure.
 */
async function getDeliveryReport(campId) {
  const problem = smsConfigProblem();
  if (problem) return fail(problem, 'SMS_NOT_CONFIGURED');
  if (!campId) return fail('No campaign id was recorded for that message.', 'NO_CAMP_ID');

  const c = cfg();
  const params = new URLSearchParams({
    username: c.username,
    apikey: c.apikey,
    campid: campId,
  });

  try {
    const res = await fetch(`${c.apiUrl}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const raw = (await res.text()).trim();
    if (!res.ok) return fail(`The SMS gateway answered ${res.status}.`);

    if (REPORT_ERROR.test(raw)) {
      return fail(`The SMS gateway could not report on that campaign: ${raw.slice(0, 120)}`,
        'REPORT_UNAVAILABLE');
    }

    const reports = pickField(raw, 'Reports') || raw;
    const statuses = String(reports)
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [mobile, status] = part.split('-').map((s) => (s || '').trim());
        return { mobile, status: status || 'Unknown' };
      })
      /* A trailing ";" leaves an empty tail, and a body that was not a report
         at all leaves one shapeless row. Neither is a message status. */
      .filter((row) => /^\d{6,15}$/.test(row.mobile || ''));

    return { success: true, statuses, raw: String(reports).slice(0, 400) };
  } catch (error) {
    console.error('[sms] Delivery report failed:', error.message);
    return fail(error.message);
  }
}

/** One line at boot, called from server.js once the environment is loaded. */
const logSmsStatus = () => {
  const problem = smsConfigProblem();
  const c = cfg();
  if (problem) {
    console.warn(`⚠️  SMS gateway not configured (${problem}) — visit-request `
      + 'verification codes cannot be sent.');
    return;
  }
  let host = c.apiUrl;
  try { host = new URL(c.apiUrl).host; } catch (err) { /* keep the raw value */ }
  console.log(`📱 SMS gateway ready: ${c.senderid} via ${host}, template ${c.templateId}.`);
};

module.exports = {
  smsReady,
  smsConfigProblem,
  sendTemplatedSms,
  sendOtpSms,
  sendPartnerPasswordSms,
  getDeliveryReport,
  logSmsStatus,
};
