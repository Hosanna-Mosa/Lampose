const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

let client;
if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
} else {
  console.warn('⚠️ Twilio credentials missing in environment variables.');
}

/**
 * Normalizes a phone number to bare E.164, or null if it cannot be one.
 *
 * Two formats meet here and they do not agree. `ownerMobile` comes from the
 * onboarding panel as free text — "+91 98765 43210", "9876543210", sometimes
 * with dashes. Twilio hands inbound numbers back as "whatsapp:+919876543210".
 * Both must collapse to the same string or an inbound reply cannot be matched
 * to the request that caused it.
 *
 * Returns null rather than a best guess: sending a verification code to a
 * wrongly-padded number is worse than refusing the request.
 */
function toE164(phone, countryCode) {
  if (!phone) return null;

  const region = String(countryCode || process.env.DEFAULT_PHONE_REGION || '91').replace(/\D/g, '') || '91';

  // Strip the channel prefix Twilio puts on inbound numbers.
  const raw = String(phone).replace(/^whatsapp:/i, '').trim();
  const hasPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');

  if (!digits) return null;
  if (hasPlus) return `+${digits}`;

  // A domestic trunk prefix — "09876543210".
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  // Country code typed without the plus — "919876543210".
  if (digits.length === 12 && digits.startsWith(region)) return `+${digits}`;

  // A bare national number.
  if (digits.length === 10) return `+${region}${digits}`;

  // Long enough to already carry a country code we do not recognise.
  if (digits.length > 10 && digits.length <= 15) return `+${digits}`;

  return null;
}

/** An Indian mobile specifically — the only thing that can receive a DLT SMS. */
const isIndianMobile = (e164) => typeof e164 === 'string' && /^\+91[6-9]\d{9}$/.test(e164);

/** "+919876543210" → "•••••43210", for anything the browser can see. */
const maskPhone = (e164) => (e164 ? `•••••${String(e164).slice(-5)}` : '');

/**
 * Normalizes phone number to E.164 and wraps in whatsapp: prefix.
 *
 * Unchanged in behaviour for every input the onboarding flow already sends;
 * it now additionally tolerates an inbound "whatsapp:+91…" and returns null
 * for input that is not a phone number at all, instead of the previous
 * "whatsapp:+" for empty digits.
 */
function formatWhatsAppNumber(phone) {
  const e164 = toE164(phone);
  return e164 ? `whatsapp:${e164}` : null;
}

/**
 * Sends approval request message to property owner
 */
async function sendVerificationMessage(ownerMobile, ownerName, propertyName) {
  if (!client) {
    console.error('❌ Twilio client not initialized.');
    return { success: false, error: 'Twilio client not initialized' };
  }

  const to = formatWhatsAppNumber(ownerMobile);
  // .env only — the baked SID fallback was dead code (env overrides it) and
  // pointed at a template this account may not even own.
  const contentSid = process.env.TWILIO_VERIFY_CONTENT_SID;

  try {
    const message = await client.messages.create({
      from: whatsappFrom,
      to,
      contentSid,
      contentVariables: JSON.stringify({
        '1': ownerName || 'Property Owner',
        '2': propertyName || 'your property'
      })
    });
    console.log(`📤 WhatsApp verification template sent successfully to ${to} using Content SID ${contentSid}. Message SID: ${message.sid}`);
    return { success: true, messageSid: message.sid };
  } catch (error) {
    console.error(`❌ Failed to send WhatsApp template to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sends confirmation/cancellation message to property owner
 */
async function sendConfirmationMessage(ownerMobile, isApproved) {
  if (!client) {
    console.error('❌ Twilio client not initialized.');
    return { success: false, error: 'Twilio client not initialized' };
  }

  const to = formatWhatsAppNumber(ownerMobile);
  const body = isApproved
    ? `Thanks for choosing Lampose! Your property is verified and added successfully.`
    : `Understood. The onboarding request for your property has been cancelled. Thank you.`;

  try {
    const message = await client.messages.create({
      body,
      from: whatsappFrom,
      to,
    });
    console.log(`📤 WhatsApp confirmation sent successfully to ${to}. Message SID: ${message.sid}`);
    return { success: true, messageSid: message.sid };
  } catch (error) {
    console.error(`❌ Failed to send WhatsApp confirmation to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sends approval request message to verification team member
 */
async function sendTeamVerificationMessage(verifierMobile, ownerName, ownerMobile, propertyName) {
  if (!client) {
    console.error('❌ Twilio client not initialized.');
    return { success: false, error: 'Twilio client not initialized' };
  }

  const to = formatWhatsAppNumber(verifierMobile);
  const teamContentSid = process.env.TWILIO_TEAM_CONTENT_SID;
  
  // If no team content SID is provided, fallback to owner verify SID
  const contentSid = teamContentSid || process.env.TWILIO_VERIFY_CONTENT_SID;

  // Prepare variables based on template SID used
  const contentVariables = teamContentSid
    ? JSON.stringify({
        '1': ownerName || 'Property Owner',
        '2': ownerMobile || 'N/A',
        '3': propertyName || 'your property'
      })
    : JSON.stringify({
        '1': ownerName || 'Property Owner',
        '2': propertyName || 'your property'
      });

  try {
    const message = await client.messages.create({
      from: whatsappFrom,
      to,
      contentSid,
      contentVariables
    });
    console.log(`📤 WhatsApp verifier template sent successfully to ${to} using Content SID ${contentSid}. Message SID: ${message.sid}`);
    return { success: true, messageSid: message.sid };
  } catch (error) {
    console.error(`❌ Failed to send WhatsApp verifier template to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

/* ══ Availability (visit requests) ═════════════════════════════════════════
   A different business flow from the verification messages above, on the same
   Twilio number. The owner is asked whether a specific room is free to visit
   and replies AVAILABLE — never YES, which belongs to verification and would
   be ambiguous when an owner has both pending at once.
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Asks the owner whether a property is free to visit.
 *
 * Sent as an approved Content template when TWILIO_VISIT_REQUEST_CONTENT_SID
 * is configured, and as plain text otherwise, so the flow is testable before
 * the template clears Meta review. The plain-text path only reaches an owner
 * inside an open 24-hour session; the template is what works cold.
 *
 * If the template is built with quick-reply buttons, give their payloads as
 * VISIT_YES:<requestId> / VISIT_NO:<requestId> — the id is what identifies
 * the request when an owner has several pending. The visible button text
 * should still read AVAILABLE.
 */
async function sendVisitRequestMessage({
  ownerMobile, ownerName, propertyName, customerName, sharingLabel,
  stayDescription, preferredDate, preferredTime, requestId,
}) {
  if (!client) {
    console.error('❌ Twilio client not initialized.');
    return { success: false, error: 'Twilio client not initialized' };
  }

  const to = formatWhatsAppNumber(ownerMobile);
  if (!to) return { success: false, error: "The owner's number on this listing is not valid." };

  const room = sharingLabel || 'a room';
  /* Built from what the customer actually chose. Each part is omitted when
     absent rather than printed as null, so a sparse request still reads as a
     sentence. Falls back to the older free-text fields, then to a neutral
     phrase — never to invented dates. */
  const when = stayDescription
    || [preferredDate, preferredTime].filter(Boolean).join(' at ')
    || 'as soon as possible';
  const contentSid = process.env.TWILIO_VISIT_REQUEST_CONTENT_SID;

  try {
    const payload = contentSid
      ? {
        from: whatsappFrom,
        to,
        contentSid,
        contentVariables: JSON.stringify({
          1: ownerName || 'there',
          2: propertyName,
          3: customerName,
          4: room,
          5: when,
          6: String(requestId),
        }),
      }
      : {
        from: whatsappFrom,
        to,
        body: `Hello ${ownerName || 'there'}, ${customerName} would like to visit `
          + `${room} at "${propertyName}" (${when}).\n\n`
          + 'Reply AVAILABLE to confirm the visit, or NOT AVAILABLE if it is not free.',
      };

    const message = await client.messages.create(payload);
    console.log(`📤 Visit request sent to ${to}${contentSid ? ` (template ${contentSid})` : ' (plain text)'}. Message SID: ${message.sid}`);
    return { success: true, messageSid: message.sid };
  } catch (error) {
    console.error(`❌ Failed to send visit request to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Tells the customer what the owner said. Only sent where they opted in —
 * WhatsApp will not carry a business-initiated message to someone who has not
 * written first, and the page is already showing the same answer, so a
 * failure here costs a courtesy rather than the flow.
 */
async function sendVisitOutcomeMessage({
  customerPhone, customerName, propertyName, sharingLabel, confirmed,
}) {
  if (!client) {
    console.error('❌ Twilio client not initialized.');
    return { success: false, error: 'Twilio client not initialized' };
  }

  const to = formatWhatsAppNumber(customerPhone);
  if (!to) return { success: false, error: 'That phone number is not valid.' };

  const room = sharingLabel ? `${sharingLabel} at ${propertyName}` : propertyName;
  const contentSid = process.env.TWILIO_VISIT_OUTCOME_CONTENT_SID;

  try {
    const payload = contentSid
      ? {
        from: whatsappFrom,
        to,
        contentSid,
        contentVariables: JSON.stringify({
          1: customerName,
          2: propertyName,
          3: confirmed ? 'available' : 'not available',
        }),
      }
      : {
        from: whatsappFrom,
        to,
        body: confirmed
          ? `Good news ${customerName} — the owner confirmed ${room} is available to visit. `
            + 'They have your number and will be in touch to arrange a time.'
          : `Hello ${customerName}, the owner has said ${room} is not available to visit `
            + 'at the moment. There are similar rooms on lampose.com.',
      };

    const message = await client.messages.create(payload);
    return { success: true, messageSid: message.sid };
  } catch (error) {
    console.error(`❌ Failed to send visit outcome to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendVerificationMessage,
  sendConfirmationMessage,
  sendTeamVerificationMessage,
  formatWhatsAppNumber,
  toE164,
  isIndianMobile,
  maskPhone,
  sendVisitRequestMessage,
  sendVisitOutcomeMessage,
};
