/* ══════════════════════════════════════════════════════════════════════════
   The "rider dispatch" WhatsApp template - RIDER_DISPATCH_MODE=whatsapp.

   Sent to the Lampose team when a restaurant accepts an order; they arrange the
   rider by hand. Eight variables, in this order - `sendRiderDispatch` in
   `twilio.js` fills exactly these, and `tests/riderDispatchMode.test.js` fails
   if the two ever stop agreeing:

     {{1}} order number        LO151171
     {{2}} restaurant name     Paradise Biryani House
     {{3}} pickup              address, phone, map link
     {{4}} drop                address, map link
     {{5}} customer            name, phone
     {{6}} items               2 x Chicken Biryani, 1 x Raita
     {{7}} what to collect     cash amount, or "Already paid online"
     {{8}} rider payout        Rs 40

   Like deliveryRequestTemplate.js, it deliberately has no delivery code and no
   instruction to collect one (Meta rejected that wording as OTP-like). A
   variable is never first or last in the body, and never empty or multi-line.
   UTILITY: it facilitates a specific, agreed transaction.
   ══════════════════════════════════════════════════════════════════════════ */
const FRIENDLY_NAME = 'lampose_rider_dispatch_v1';
const LANGUAGE = 'en';
const CATEGORY = 'UTILITY';
const ENV_KEY = 'TWILIO_RIDER_DISPATCH_CONTENT_SID';

const BODY = [
  'New delivery {{1}}',
  '',
  'Pickup: {{2}} - {{3}}',
  'Drop: {{4}}',
  'Customer: {{5}}',
  'Items: {{6}}',
  '',
  '{{7}}',
  'Rider payout: {{8}}',
  '',
  'Please arrange a rider to collect the order from the restaurant and hand it over only to the customer named above.',
].join('\n');

const SAMPLES = {
  1: 'LO151171',
  2: 'Paradise Biryani House',
  3: 'Opposite the RTC Complex, Visakhapatnam - Call +919876543210 - https://www.google.com/maps?q=17.7231,83.3013',
  4: 'Flat 204, Sai Residency, MVP Colony, Visakhapatnam - https://www.google.com/maps?q=17.7420,83.3350',
  5: 'Ravi Kumar - +919812345678',
  6: '2 x Chicken Biryani, 1 x Raita',
  7: 'Cash to collect: Rs 450 (pay on delivery)',
  8: 'Rs 40',
};

const variableKeys = (body = BODY) => [...new Set(
  [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => match[1]),
)];

const render = (values = SAMPLES) => Object.entries(values)
  .reduce((text, [key, value]) => text.split(`{{${key}}}`).join(value), BODY);

module.exports = {
  FRIENDLY_NAME, LANGUAGE, CATEGORY, ENV_KEY, BODY, SAMPLES, variableKeys, render,
};
