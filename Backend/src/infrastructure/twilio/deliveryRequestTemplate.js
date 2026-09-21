/* ══════════════════════════════════════════════════════════════════════════
   The "delivery request" WhatsApp template — the definition, in one place.

   Read by the script that creates it in Twilio
   (`scripts/create-delivery-request-template.js`) and by the test that checks
   it still matches the sender (`sendDeliveryRequest` in `twilio.js`). It lives
   here, and not inside the script, so both can `require` it without the script
   running: the script talks to a live Twilio account the moment it is loaded.

   ## The body IS the contract

   Six variables, in this order — the sender fills exactly these:

     {{1}} order number             LO151171
     {{2}} restaurant name          Paradise Biryani House
     {{3}} pickup: address, phone, map link
     {{4}} drop: address, map link
     {{5}} customer: name, phone
     {{6}} what to collect          "Cash to collect: ₹450 (pay on delivery)"
                                    or "Already paid online — nothing to collect."

   A template typed by hand into a web form drifts from the code sending it;
   Twilio renders whatever it is given, and a swapped pair produces a message
   that reads as though the customer's phone were the drop address. If the
   count or order changes, change it here and in `sendDeliveryRequest` in the
   same commit — `tests/twilioDeliveryRequest.test.js` fails until they agree.

   ## What it deliberately does not carry

   The diner's delivery code — not the code, and not a mention of one. It is
   the one thing that proves somebody stood at the door, so it goes to the diner
   and nowhere else.

   The first version of this template ended "ask the customer for their 4-digit
   delivery code" and Meta rejected it within seconds, with no reason given (the
   category was not the cause — Twilio had allowed a category change). The
   cause is not confirmed, but a template that tells somebody to collect a
   short code from another person reads like a one-time-passcode request, and
   the food templates, which say nothing of the kind, were approved. So this
   one leaves it out, and the restaurant's console is what tells the restaurant
   to get the code from the driver when it marks the order delivered. The
   plain-text fallback in the sender is not reviewed by anyone and still says
   it.

   The closing sentence is kept about as long as the one it replaced on
   purpose: Meta also rejects a body with too many variables for its length,
   and shortening the text would trade one rejection for another.

   ## Meta's rules this body is written to

   · A variable may not be the first or last thing in the body — this one
     starts with words and ends with a sentence.
   · Variables are numbered from 1 with no gaps.
   · A variable's value may not contain a newline or a tab, or be empty; the
     sender collapses whitespace and substitutes a dash for nothing.
   · UTILITY, not MARKETING: it facilitates a specific, agreed transaction — a
     delivery a restaurant has just asked for. Filed as marketing it would cost
     more and could be silenced by an opt-out the desk needs to run.
   ══════════════════════════════════════════════════════════════════════════ */

/* `_v2`: the first submission (`lampose_delivery_request`) was rejected, and a
   rejected name is not one to build on. The account's other templates are
   versioned the same way. */
const FRIENDLY_NAME = 'lampose_delivery_request_v2';
const LANGUAGE = 'en';
const CATEGORY = 'UTILITY';

const BODY = [
  'New delivery request {{1}}',
  '',
  'Pickup: {{2}} - {{3}}',
  'Drop: {{4}}',
  'Customer: {{5}}',
  '',
  '{{6}}',
  '',
  'Please collect the order from the restaurant, hand it over only to the customer named above, and let the restaurant know once it has been delivered.',
].join('\n');

/*
 * A sample for every variable — Meta reviews the RENDERED message, not the
 * placeholders, so these are what a reviewer reads. Shaped like the real
 * values (an address with a phone and a map link) because a sample that looks
 * nothing like what will be sent is how a template is approved and then
 * behaves differently.
 */
const SAMPLES = {
  1: 'LO151171',
  2: 'Paradise Biryani House',
  3: 'Opposite the RTC Complex, Visakhapatnam - Call +919876543210 - https://www.google.com/maps?q=17.7231,83.3013',
  4: 'Flat 204, Sai Residency, MVP Colony, Visakhapatnam - https://www.google.com/maps?q=17.7420,83.3350',
  5: 'Ravi Kumar - +919812345678',
  6: 'Cash to collect: ₹450 (pay on delivery)',
};

/** The variable numbers the body uses, as strings, in order — what the sender must supply. */
const variableKeys = (body = BODY) => [...new Set(
  [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => match[1]),
)];

/** The body with the samples filled in — what a reviewer, and the desk, will read. */
const render = (values = SAMPLES) => Object.entries(values)
  .reduce((text, [key, value]) => text.split(`{{${key}}}`).join(value), BODY);

module.exports = {
  FRIENDLY_NAME, LANGUAGE, CATEGORY, BODY, SAMPLES, variableKeys, render,
};
