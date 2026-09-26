/* ══════════════════════════════════════════════════════════════════════════
   The "document needs a new photo" WhatsApp template — the definition.

   Sent to a rider when an administrator refuses one of their onboarding
   documents in the console — a blurred licence, a cropped Aadhaar — with the
   administrator's reason. Read by the script that creates it in Twilio
   (`scripts/create-driver-document-template.js`) and, once approved, by
   `twilio.sendDriverDocumentRejected`. It lives here so both can `require` it
   without the script running.

   ## The body IS the contract

   Three variables, in this order:

     {{1}} rider name        Ravi Kumar
     {{2}} document          Driving licence
     {{3}} the reason        Photo is blurry — the text cannot be read

   Written to the rules `restaurantApprovedTemplate.js` learnt the hard way:
   no variable first or last, none adjacent, numbered from 1 with no gaps, and
   no vocabulary about signing in, passwords or "details". A changed body is a
   new template and a fresh Meta review.

   ## UTILITY

   It is an update about the rider's own application that asks them to act on
   it — which is what UTILITY is for. If Meta refuses it with
   INCORRECT_CATEGORY, read the record in `restaurantApprovedTemplate.js`
   before trying MARKETING.

   Put the approved sid in `TWILIO_DRIVER_DOCUMENT_CONTENT_SID`.
   ══════════════════════════════════════════════════════════════════════════ */

const FRIENDLY_NAME = 'lampose_rider_document_resubmit_v1';
const LANGUAGE = 'en';
const CATEGORY = 'UTILITY';

const BODY = [
  '📄 *A document needs a new photo — Lampose Rider*',
  '',
  'Hi {{1}}, we checked the {{2}} you uploaded and could not verify it.',
  '',
  '*Reason:* {{3}}',
  '',
  'Please open the Lampose Rider app, go to Documents and upload a clear photo of it. We will review it again as soon as it arrives.',
].join('\n');

const SAMPLES = {
  1: 'Ravi Kumar',
  2: 'Driving licence',
  3: 'Photo is blurry — the text cannot be read',
};

/** The variable numbers the body uses, as strings, in order. */
const variableKeys = (body = BODY) => [...new Set(
  [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => match[1]),
)];

/** The body with values filled in — what the rider will read. */
const render = (values = SAMPLES) => Object.entries(values)
  .reduce((text, [key, value]) => text.split(`{{${key}}}`).join(value), BODY);

module.exports = {
  FRIENDLY_NAME, LANGUAGE, CATEGORY, BODY, SAMPLES, variableKeys, render,
};
