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

/* ── Full-data verification template helpers ────────────────────────────────
   The owner-approval template carries the whole submission (address, stay
   options with prices, mess, amenities). Two WhatsApp rules shape these:
   template variables may not contain newlines or tabs, and the rendered body
   must stay under 1024 characters — so every list is joined onto one line
   and capped, never dumped raw. */

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

/** Collapses any whitespace to single spaces and truncates with an ellipsis. */
const oneLine = (value, max) => {
  const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};

/** Every stay type the property offers, with duration and price, plus deposit. */
function describeStayOptions(property) {
  const p = property || {};
  const daily = Number(p.dailyPrice) || 0;
  const monthly = Number(p.monthlyPrice) || Number(p.rent) || 0;
  const stayType = p.stayType || 'Long Stay';
  const parts = [];
  if (stayType !== 'Long Stay' && daily) {
    parts.push(`Short stay (${p.shortStayDuration || '1-7 days'}) ${inr(daily)}/day`);
  }
  if (stayType !== 'Short Stay' && monthly) {
    parts.push(`Long stay (${p.longStayDuration || '1 month+'}) ${inr(monthly)}/month`);
  }
  if (!parts.length && monthly) parts.push(`${inr(monthly)}/month`);
  if (Number(p.deposit)) parts.push(`deposit ${inr(p.deposit)}`);
  return parts.join(' · ') || 'Not specified';
}

/* The onboarding form records food on categoryDetails (foodIncluded/foodType);
   older rows may only carry "Food" in amenities, so both are consulted. */
function describeMess(property) {
  const p = property || {};
  const details = p.categoryDetails || {};
  if (details.foodIncluded === true) return details.foodType ? `Available – ${details.foodType}` : 'Available';
  if (details.foodIncluded === false) return 'Not available';
  const amenities = (Array.isArray(p.amenities) ? p.amenities : []).map((a) => String(a).toLowerCase());
  if (amenities.some((a) => a.includes('food') || a.includes('mess'))) return 'Available';
  return 'Not specified';
}

function describeAmenities(property) {
  const list = (property && Array.isArray(property.amenities) ? property.amenities : [])
    .map((a) => String(a).trim())
    .filter(Boolean);
  if (!list.length) return 'None listed';
  const shown = list.slice(0, 10);
  const more = list.length - shown.length;
  return shown.join(' · ') + (more > 0 ? ` +${more} more` : '');
}

/**
 * Sends approval request message to property owner.
 *
 * With a `property` object it fills the full-data template (7 variables:
 * name, address, stay options, mess, owner number, amenities). Extra
 * variables are ignored by a template that does not reference them, so this
 * is safe to ship while TWILIO_VERIFY_CONTENT_SID still points at the old
 * two-variable template awaiting the new one's Meta approval.
 *
 * `requestId` is the verification request's id. It rides in the quick-reply
 * button payloads (VERIFY_YES:<id>) rather than the body, so a tap names the
 * property it was shown against — see the webhook for why that matters.
 */
async function sendVerificationMessage(ownerMobile, ownerName, propertyName, property, requestId) {
  if (!client) {
    console.error('❌ Twilio client not initialized.');
    return { success: false, error: 'Twilio client not initialized' };
  }

  const to = formatWhatsAppNumber(ownerMobile);
  // .env only — the baked SID fallback was dead code (env overrides it) and
  // pointed at a template this account may not even own.
  const contentSid = process.env.TWILIO_VERIFY_CONTENT_SID;

  const contentVariables = property
    ? JSON.stringify({
      '1': oneLine(ownerName, 60) || 'Property Owner',
      '2': oneLine(propertyName, 80) || 'your property',
      '3': addressOneLine(property, 110) || 'Not specified',
      '4': oneLine(describeStayOptions(property), 160),
      '5': oneLine(describeMess(property), 60),
      '6': oneLine(toE164(ownerMobile) || ownerMobile, 20),
      '7': oneLine(describeAmenities(property), 140),
      // Rides in the button payloads (VERIFY_YES:<id>), never in the body.
      '8': String(requestId || ''),
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

/** One line of address; skips appending the place when the address names it. */
function addressOneLine(property, max) {
  if (!property) return '';
  const joined = property.address && property.place
    && String(property.address).toLowerCase().includes(String(property.place).toLowerCase())
    ? property.address
    : [property.address, property.place].filter(Boolean).join(', ');
  return oneLine(joined, max);
}

/**
 * Sends approval request message to verification team member.
 *
 * Variable numbering is kept compatible across template generations: the
 * live 3-variable template reads {{1}} owner name, {{2}} owner mobile,
 * {{3}} property name; the full-data replacement adds {{4}} address,
 * {{5}} Google Maps link, {{6}} the review-page URL. A template ignores
 * variables it does not reference, so all six are always sent and switching
 * templates stays a one-line .env swap.
 *
 * `extras` = { property, token, requestId } — the pending submission
 * snapshot, the verification request's token (which the maps and review
 * links are built from) and its id, which rides in the quick-reply button
 * payloads so a tap names the property it was shown against. Without them
 * the link variables degrade to "Not available".
 */
async function sendTeamVerificationMessage(verifierMobile, ownerName, ownerMobile, propertyName, extras) {
  if (!client) {
    console.error('❌ Twilio client not initialized.');
    return { success: false, error: 'Twilio client not initialized' };
  }

  const to = formatWhatsAppNumber(verifierMobile);
  const teamContentSid = process.env.TWILIO_TEAM_CONTENT_SID;

  // If no team content SID is provided, fallback to owner verify SID
  const contentSid = teamContentSid || process.env.TWILIO_VERIFY_CONTENT_SID;

  const property = (extras && extras.property) || null;
  const token = (extras && extras.token) || '';
  const requestId = (extras && extras.requestId) || '';

  /* No coordinates are captured at onboarding, so the map link is a search
     for the typed address — as accurate as the agent's typing, no more. */
  const addressLine = addressOneLine(property, 110);
  const mapsUrl = addressLine
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine)}`
    : 'Not available';

  /* The token-gated review page served by this process (photos + numbers).
     PUBLIC_BASE_URL makes it absolute in production; localhost otherwise. */
  const publicBase = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  const reviewUrl = token
    ? `${publicBase || `http://localhost:${process.env.PORT || 5001}`}/api/verifications/review/${token}`
    : 'Not available';

  // Prepare variables based on template SID used
  const contentVariables = teamContentSid
    ? JSON.stringify({
        '1': oneLine(ownerName, 60) || 'Property Owner',
        '2': oneLine(toE164(ownerMobile) || ownerMobile, 20) || 'N/A',
        '3': oneLine(propertyName, 80) || 'your property',
        '4': addressLine || 'Not specified',
        '5': mapsUrl,
        '6': reviewUrl,
        // Rides in the button payloads (VERIFY_YES:<id>), never in the body.
        '7': String(requestId)
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
  address, selectionSummary, joiningDate,
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

  /* Two generations of this template, and they number their variables
     differently — v3 inserts address and joining date, which shifts
     everything after {{2}}. Sending v3's mapping to v2 would put the address
     where the customer's name belongs, so the version is chosen by WHICH SID
     is configured rather than by a flag: setting the v3 variable is the whole
     switch, and leaving it unset keeps the approved v2 message exactly as it
     is. */
  const v3Sid = process.env.TWILIO_VISIT_REQUEST_V3_CONTENT_SID;
  const contentSid = v3Sid || process.env.TWILIO_VISIT_REQUEST_CONTENT_SID;

  try {
    const payload = contentSid
      ? {
        from: whatsappFrom,
        to,
        contentSid,
        contentVariables: v3Sid
          ? JSON.stringify({
            1: oneLine(ownerName, 60) || 'there',
            2: oneLine(propertyName, 80),
            3: oneLine(address, 110) || 'Address not recorded',
            4: oneLine(customerName, 60),
            5: oneLine(selectionSummary || room, 160),
            6: oneLine(joiningDate, 40) || 'Not specified',
            7: String(requestId),
          })
          : JSON.stringify({
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

/**
 * The entry PIN, sent to both sides once the owner confirms a visit.
 *
 * Both messages carry the SAME pin — it is compared at the door, not verified
 * against the server, so there is nothing secret to protect on our side and
 * both parties must be able to read it.
 *
 * Each send is independent: the owner's message failing must not cost the
 * customer theirs, so the two are reported separately and neither throws.
 * Templates are optional — without one the plain text still reaches the owner
 * (their reply has just opened a 24-hour window) but will only reach the
 * customer inside a window they may not have.
 */
async function sendVisitEntryPin({
  ownerMobile, customerPhone, ownerName, customerName,
  propertyName, address, sharingLabel, joiningDate, pin,
}) {
  if (!client) {
    console.error('❌ Twilio client not initialized.');
    return { owner: { success: false, error: 'Twilio client not initialized' }, customer: { success: false, error: 'Twilio client not initialized' } };
  }

  const room = sharingLabel || 'the room';
  const when = joiningDate || 'Not specified';
  const ownerSid = process.env.TWILIO_VISIT_PIN_OWNER_CONTENT_SID;
  const customerSid = process.env.TWILIO_VISIT_PIN_CUSTOMER_CONTENT_SID;

  const send = async (to, contentSid, variables, body) => {
    if (!to) return { success: false, error: 'No number to send to.' };
    try {
      const message = await client.messages.create(
        contentSid
          ? { from: whatsappFrom, to, contentSid, contentVariables: JSON.stringify(variables) }
          : { from: whatsappFrom, to, body },
      );
      return { success: true, messageSid: message.sid };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const ownerTo = formatWhatsAppNumber(ownerMobile);
  const customerTo = formatWhatsAppNumber(customerPhone);

  const [owner, customer] = await Promise.all([
    send(ownerTo, ownerSid, {
      1: oneLine(ownerName, 60) || 'there',
      2: oneLine(customerName, 60),
      3: oneLine(propertyName, 80),
      4: oneLine(room, 60),
      5: oneLine(when, 40),
      6: String(pin),
    }, `✅ Visit confirmed — Lampose\n\nThank you ${ownerName || 'there'}. We have told ${customerName} that ${room} at "${propertyName}" is available.\n\n`
      + `Visit reference: ${pin}\n\n${customerName} has been given the same reference number. Please ask them for it when they arrive and check that it matches.`),

    send(customerTo, customerSid, {
      1: oneLine(customerName, 60),
      2: oneLine(propertyName, 80),
      3: oneLine(address, 110) || 'Address not recorded',
      4: oneLine(room, 60),
      5: oneLine(when, 40),
      6: String(pin),
    }, `✅ Visit confirmed — Lampose\n\nGood news ${customerName} — the owner has confirmed ${room} at "${propertyName}" is free to visit.\n\n`
      + `Visit reference: ${pin}\n\nPlease show this reference number to the owner when you arrive. They have been given the same one.`),
  ]);

  return { owner, customer };
}

module.exports = {
  sendVerificationMessage,
  sendConfirmationMessage,
  sendVisitEntryPin,
  sendTeamVerificationMessage,
  formatWhatsAppNumber,
  toE164,
  isIndianMobile,
  maskPhone,
  sendVisitRequestMessage,
  sendVisitOutcomeMessage,
};
