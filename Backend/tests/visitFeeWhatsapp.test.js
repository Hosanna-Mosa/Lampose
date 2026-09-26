/* ══════════════════════════════════════════════════════════════════════════
   The visit-fee WhatsApp messages never state a price the link does not charge.

   The two templates Meta approved for "pay for your visit" and "payment
   received" have "₹199 (₹100 + ₹99)" written into their FIXED text. After
   fees became per-layout, one of them went to a customer booking a 3 BHK
   above a Razorpay link for ₹1,499. These tests pin the rule that stops it:
   a legacy template is sent for a ₹199 fee and for nothing else.

   Nothing here can reach a real phone — the client is a fake.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN',
  'TWILIO_ASSISTED_PAY_CONTENT_SID', 'TWILIO_PAYMENT_RECEIVED_CONTENT_SID',
  'TWILIO_ASSISTED_PAY_AMOUNT_CONTENT_SID', 'TWILIO_PAYMENT_RECEIVED_AMOUNT_CONTENT_SID',
  'TWILIO_VISIT_PAID_APP_CONTENT_SID', 'TWILIO_ADMIN_NOTICE_CONTENT_SID',
]) process.env[key] = '';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const twilio = require('../src/infrastructure/twilio/twilio');

const LEGACY_PAY = 'HXLEGACYPAY';
const LEGACY_RECEIVED = 'HXLEGACYRECEIVED';
const GENERIC = 'HXGENERIC';

let created;
beforeEach(() => {
  created = [];
  const messages = () => ({ fetch: async () => ({ status: 'delivered' }) });
  messages.create = async (payload) => { created.push(payload); return { sid: 'SMFAKE', status: 'queued' }; };
  twilio._useClientForTests({ messages });
  process.env.TWILIO_ASSISTED_PAY_CONTENT_SID = LEGACY_PAY;
  process.env.TWILIO_PAYMENT_RECEIVED_CONTENT_SID = LEGACY_RECEIVED;
  process.env.TWILIO_ADMIN_NOTICE_CONTENT_SID = GENERIC;
});
afterEach(() => {
  twilio._useClientForTests(null);
  for (const key of [
    'TWILIO_ASSISTED_PAY_CONTENT_SID', 'TWILIO_PAYMENT_RECEIVED_CONTENT_SID',
    'TWILIO_ASSISTED_PAY_AMOUNT_CONTENT_SID', 'TWILIO_PAYMENT_RECEIVED_AMOUNT_CONTENT_SID',
    'TWILIO_VISIT_PAID_APP_CONTENT_SID', 'TWILIO_ADMIN_NOTICE_CONTENT_SID',
  ]) process.env[key] = '';
});

const payRequest = (amountPaise) => twilio.sendAssistedPayRequest({
  customerPhone: '+919000000001',
  customerName: 'Dhanush',
  sharingLabel: '3 BHK',
  propertyName: 'testing-00',
  payLink: 'https://rzp.io/rzp/abc',
  listingUrl: 'https://lampose.com/explore/1',
  amountPaise,
});

const vars = (payload) => JSON.parse(payload.contentVariables || '{}');

describe('the pay-for-your-visit message (T1)', () => {
  it('a ₹1,499 fee NEVER goes out in the ₹199 template — it carries ₹1,499', async () => {
    await payRequest(149900);
    assert.equal(created.length, 1);
    assert.notEqual(created[0].contentSid, LEGACY_PAY);
    assert.equal(created[0].contentSid, GENERIC);
    const text = vars(created[0])[2];
    assert.match(text, /₹1,499/);
    assert.doesNotMatch(text, /₹199|₹100|₹99\b/);
    assert.match(text, /https:\/\/rzp\.io\/rzp\/abc/);
    assert.match(text, /Pick my slot/);
  });

  it('a ₹199 fee (a request made before per-layout pricing) still uses the approved template', async () => {
    await payRequest(19900);
    assert.equal(created[0].contentSid, LEGACY_PAY);
  });

  it('an approved amount template wins, with the fee as {{6}}', async () => {
    process.env.TWILIO_ASSISTED_PAY_AMOUNT_CONTENT_SID = 'HXAMOUNT';
    await payRequest(99900);
    assert.equal(created[0].contentSid, 'HXAMOUNT');
    assert.equal(vars(created[0])[6], '₹999');
  });

  it('with no generic template either, it falls to plain text with the right amount — never the ₹199 template', async () => {
    process.env.TWILIO_ADMIN_NOTICE_CONTENT_SID = '';
    await payRequest(249900);
    assert.equal(created[0].contentSid, undefined);
    assert.match(created[0].body, /₹2,499/);
    assert.doesNotMatch(created[0].body, /₹199/);
  });

  it('the generic text is one line — WhatsApp refuses newlines in a variable', async () => {
    await payRequest(149900);
    assert.doesNotMatch(vars(created[0])[2], /\n|\t/);
  });
});

describe('the payment-received message (T2)', () => {
  const received = (amountPaise) => twilio.sendPaymentReceived({
    customerPhone: '+919000000001', customerName: 'Dhanush', propertyName: 'testing-00', amountPaise,
  });

  it('a ₹1,499 payment is confirmed as ₹1,499, and says details come on WhatsApp', async () => {
    await received(149900);
    assert.equal(created[0].contentSid, GENERIC);
    const text = vars(created[0])[2];
    assert.match(text, /₹1,499/);
    assert.doesNotMatch(text, /₹199/);
    assert.match(text, /WhatsApp/);
  });

  it('a ₹199 payment keeps the approved template and its Pick-my-slot button', async () => {
    await received(19900);
    assert.equal(created[0].contentSid, LEGACY_RECEIVED);
  });
});

describe('the app receipt (T2a)', () => {
  it('goes out in the generic template with the amount paid', async () => {
    await twilio.sendVisitPaidApp({
      customerPhone: '+919000000001', customerName: 'Dhanush', propertyName: 'testing-00', amountPaise: 49900,
    });
    assert.equal(created[0].contentSid, GENERIC);
    assert.match(vars(created[0])[2], /₹499/);
  });
});
