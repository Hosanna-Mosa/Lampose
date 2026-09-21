/* ══════════════════════════════════════════════════════════════════════════
   The delivery desk's WhatsApp — the sender, and the template it must match.

   `sendDeliveryRequest` decides something a diner is told: only when it
   reports success does the tracking page say "a driver has been assigned". So
   it is exercised here against a fake Twilio client that answers the way the
   real one does — including the message that is ACCEPTED and then refused a
   second later, which is how WhatsApp reports a plain message sent outside the
   24-hour window and is the failure that matters most.

   And the template: Twilio renders whatever variables it is given, so a body
   and a sender that disagree produce a message that sends cleanly and reads
   wrong. The contract tests fail the moment they stop agreeing.

   Nothing here can reach a real phone. The credentials are blanked before
   anything loads, outbound requests are blocked, and the client is a fake.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'TWILIO_DELIVERY_REQUEST_CONTENT_SID', 'DELIVERY_PARTNER_WHATSAPP',
  'SMS_APIKEY', 'SMS_USERNAME', 'SMS_API_URL',
]) process.env[key] = '';

const http = require('node:http');
const https = require('node:https');

const blocked = [];
const isLocal = (host) => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(host || ''));
const hostOf = (target) => {
  if (typeof target === 'string') return new URL(target).hostname;
  if (target instanceof URL) return target.hostname;
  return (target && (target.hostname || target.host)) || '';
};
const refuse = (target) => {
  blocked.push(typeof target === 'string' ? target : hostOf(target));
  throw new Error('Blocked an outbound request in a test');
};
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  if (!isLocal(hostOf(url))) refuse(url);
  return realFetch(input, init);
};
for (const mod of [http, https]) {
  for (const name of ['request', 'get']) {
    const real = mod[name];
    mod[name] = (target, ...rest) => {
      if (!isLocal(hostOf(target))) refuse(target);
      return real.call(mod, target, ...rest);
    };
  }
}

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const twilio = require('../src/infrastructure/twilio/twilio');
const template = require('../src/infrastructure/twilio/deliveryRequestTemplate');
const { describeRequest } = require('../src/modules/foodpartners/foodDelivery.service');

const DESK = '+916302321942';

const request = (over = {}) => ({
  to: DESK,
  orderNumber: 'LO151171',
  restaurantName: 'Paradise Biryani House',
  pickup: 'Opposite the RTC complex · Call +919000000009',
  drop: '12 Test Lane, Testville',
  customer: 'Test Diner · +919111111111',
  collect: 'Cash to collect: ₹270 (pay on delivery)',
  ready: 'The food will be ready in about 12 min.',
  ...over,
});

/**
 * A stand-in for Twilio's client. `messages(sid).fetch()` walks through
 * `statuses` one call at a time and then repeats the last, so a test can say
 * "queued, queued, failed" and mean it.
 */
const fakeClient = ({ statuses = [{ status: 'delivered' }], createError = null, fetchError = null } = {}) => {
  const created = [];
  let fetches = 0;
  const messages = () => ({
    fetch: async () => {
      fetches += 1;
      if (fetchError) throw fetchError;
      return statuses[Math.min(fetches - 1, statuses.length - 1)];
    },
  });
  messages.create = async (payload) => {
    created.push(payload);
    if (createError) throw createError;
    return { sid: 'SMFAKE0001', status: 'queued' };
  };
  return { client: { messages }, created, fetches: () => fetches };
};

afterEach(() => {
  twilio._useClientForTests(null);
  process.env.TWILIO_DELIVERY_REQUEST_CONTENT_SID = '';
});

describe('the delivery request message, as plain text', () => {
  it('goes to the desk, from the Lampose sender, with what a driver needs', async () => {
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);
    const res = await twilio.sendDeliveryRequest(request());

    assert.equal(res.success, true);
    assert.equal(res.messageSid, 'SMFAKE0001');
    assert.equal(fake.created.length, 1);
    const [sent] = fake.created;
    assert.equal(sent.to, `whatsapp:${DESK}`);
    assert.match(sent.from, /^whatsapp:\+/);
    assert.equal(sent.contentSid, undefined, 'no template configured, so none is used');
    for (const fact of [
      'LO151171', 'Paradise Biryani House', 'Opposite the RTC complex', '12 Test Lane, Testville',
      'Test Diner', 'Cash to collect: ₹270', 'ready in about 12 min',
    ]) assert.ok(sent.body.includes(fact), `the message says: ${fact}`);
  });

  it('says nothing about a delivery code - nobody is asked for one, the diner confirms the delivery themselves', async () => {
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);
    await twilio.sendDeliveryRequest(request());
    assert.ok(!/\b(code|otp|pin)\b/i.test(fake.created[0].body), 'no code, PIN or OTP anywhere in the message');
    assert.ok(!/\b\d{4}\b/.test(fake.created[0].body.replace(/\+?\d{6,}/g, '')), 'and no four-digit number in the text');
    assert.match(fake.created[0].body, /hand it over to the customer named above/, 'it just says where the order goes');
  });

  it('accepts a number typed any way the rest of the product accepts one', async () => {
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);
    await twilio.sendDeliveryRequest(request({ to: '63023 21942' }));
    assert.equal(fake.created[0].to, `whatsapp:${DESK}`);
  });

  it('refuses a number that is not a phone number, without calling Twilio', async () => {
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);
    const res = await twilio.sendDeliveryRequest(request({ to: 'not a number' }));
    assert.equal(res.success, false);
    assert.match(res.error, /not a valid phone number/);
    assert.equal(fake.created.length, 0);
  });

  it('says so, plainly, when WhatsApp is not configured on this server', async () => {
    const res = await twilio.sendDeliveryRequest(request());
    assert.equal(res.success, false);
    assert.match(res.error, /not configured/);
  });
});

describe('the delivery request message, as the approved template', () => {
  it('uses the template when its id is set, with the six variables the body expects', async () => {
    process.env.TWILIO_DELIVERY_REQUEST_CONTENT_SID = 'HXTESTTEMPLATE';
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);
    await twilio.sendDeliveryRequest(request());

    const [sent] = fake.created;
    assert.equal(sent.contentSid, 'HXTESTTEMPLATE');
    assert.equal(sent.body, undefined, 'a template send carries no body of its own');
    const variables = JSON.parse(sent.contentVariables);
    assert.deepEqual(Object.keys(variables).sort(), template.variableKeys(), 'exactly the variables the body uses');
    assert.equal(variables[1], 'LO151171');
    assert.equal(variables[2], 'Paradise Biryani House');
    assert.match(variables[3], /Opposite the RTC complex/);
    assert.equal(variables[4], '12 Test Lane, Testville');
    assert.match(variables[5], /Test Diner/);
    assert.match(variables[6], /Cash to collect/);
  });

  it('never sends an empty variable - Twilio refuses the whole message for one', async () => {
    process.env.TWILIO_DELIVERY_REQUEST_CONTENT_SID = 'HXTESTTEMPLATE';
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);
    await twilio.sendDeliveryRequest(request({ pickup: '', drop: '   ', customer: undefined, collect: null }));

    const variables = JSON.parse(fake.created[0].contentVariables);
    for (const key of template.variableKeys()) {
      assert.ok(String(variables[key]).length > 0, `variable ${key} is not empty`);
    }
  });

  it('flattens a value with line breaks onto one line - a variable may not contain one', async () => {
    process.env.TWILIO_DELIVERY_REQUEST_CONTENT_SID = 'HXTESTTEMPLATE';
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);
    await twilio.sendDeliveryRequest(request({ drop: '12 Test Lane\n\tTestville\r\nAP' }));
    const variables = JSON.parse(fake.created[0].contentVariables);
    assert.equal(variables[4], '12 Test Lane Testville AP');
  });

  it('sends a real order\'s details in the right slots', async () => {
    process.env.TWILIO_DELIVERY_REQUEST_CONTENT_SID = 'HXTESTTEMPLATE';
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);
    const order = {
      orderNumber: 'LO777001',
      status: 'accepted',
      restaurant: { name: 'Paradise Biryani House', address: 'Opposite the RTC complex', phone: '+919000000009' },
      pickupLocation: { type: 'Point', coordinates: [83.3013, 17.7231] },
      dropLocation: { type: 'Point', coordinates: [83.335, 17.742] },
      deliveryAddress: 'Flat 204, Sai Residency, MVP Colony',
      customerName: 'Ravi Kumar',
      customerPhone: '+919812345678',
      paymentMode: 'cod',
      paymentStatus: 'pending',
      grandTotal: 450,
      promisedMinutes: 20,
      statusHistory: [{ status: 'accepted', at: new Date() }],
    };
    await twilio.sendDeliveryRequest({ to: DESK, ...describeRequest(order), kind: 'request' });

    const v = JSON.parse(fake.created[0].contentVariables);
    assert.equal(v[1], 'LO777001');
    assert.equal(v[2], 'Paradise Biryani House');
    assert.match(v[3], /Opposite the RTC complex/);
    assert.match(v[3], /\+919000000009/);
    assert.match(v[3], /google\.com\/maps\?q=17\.7231,83\.3013/);
    assert.match(v[4], /Flat 204, Sai Residency/);
    assert.match(v[4], /google\.com\/maps\?q=17\.742,83\.335/);
    assert.equal(v[5], 'Ravi Kumar · +919812345678');
    assert.equal(v[6], 'Cash to collect: ₹450 (pay on delivery)');
    for (const value of Object.values(v)) assert.ok(!/[\n\t]/.test(value), 'no newline or tab');
  });

  it('always cancels in plain text - the template is only for the request', async () => {
    process.env.TWILIO_DELIVERY_REQUEST_CONTENT_SID = 'HXTESTTEMPLATE';
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);
    await twilio.sendDeliveryRequest(request({ kind: 'cancel' }));

    const [sent] = fake.created;
    assert.equal(sent.contentSid, undefined);
    assert.match(sent.body, /cancelled/i);
    assert.match(sent.body, /LO151171/);
  });
});

describe('whether it really went - the message that is accepted and then refused', () => {
  it('reports a message WhatsApp refuses a second later as a FAILURE, with the reason a person can act on', async () => {
    const fake = fakeClient({ statuses: [{ status: 'queued' }, { status: 'failed', errorCode: 63016, errorMessage: 'outside window' }] });
    twilio._useClientForTests(fake.client);
    const res = await twilio.sendDeliveryRequest(request());

    assert.equal(res.success, false, 'accepted by Twilio is not sent');
    assert.equal(res.messageSid, 'SMFAKE0001');
    assert.equal(res.status, 'failed');
    assert.match(res.error, /24 hours/);
    assert.match(res.error, /TWILIO_DELIVERY_REQUEST_CONTENT_SID/, 'and says how to fix it');
    assert.equal(fake.fetches(), 2, 'it looked again after the first "queued"');
  });

  it('treats undelivered the same way', async () => {
    const fake = fakeClient({ statuses: [{ status: 'undelivered', errorCode: 63015 }] });
    twilio._useClientForTests(fake.client);
    const res = await twilio.sendDeliveryRequest(request());
    assert.equal(res.success, false);
    assert.match(res.error, /not reachable on WhatsApp/);
  });

  it('reports success once WhatsApp says it went', async () => {
    const fake = fakeClient({ statuses: [{ status: 'sent' }] });
    twilio._useClientForTests(fake.client);
    const res = await twilio.sendDeliveryRequest(request());
    assert.equal(res.success, true);
    assert.equal(res.status, 'sent');
  });

  it('gives up waiting after a few looks and reports what it knows - queued is not a failure', async () => {
    const fake = fakeClient({ statuses: [{ status: 'queued' }] });
    twilio._useClientForTests(fake.client);
    const res = await twilio.sendDeliveryRequest(request());
    assert.equal(res.success, true);
    assert.equal(res.status, 'queued');
    assert.equal(fake.fetches(), 3, 'a bounded number of looks, not a wait for a delivery receipt');
  });

  it('is not undone by a failed lookup - the send itself succeeded', async () => {
    const fake = fakeClient({ fetchError: new Error('lookup timed out') });
    twilio._useClientForTests(fake.client);
    const res = await twilio.sendDeliveryRequest(request());
    assert.equal(res.success, true);
  });

  it('reports a send Twilio rejects outright, and explains the window error', async () => {
    const err = Object.assign(new Error('freeform outside window'), { code: 63016 });
    twilio._useClientForTests(fakeClient({ createError: err }).client);
    const res = await twilio.sendDeliveryRequest(request());
    assert.equal(res.success, false);
    assert.match(res.error, /24 hours/);
  });

  it('passes on Twilio\'s own words for an error it has no better explanation for', async () => {
    const err = Object.assign(new Error('Account suspended'), { code: 20003 });
    twilio._useClientForTests(fakeClient({ createError: err }).client);
    const res = await twilio.sendDeliveryRequest(request());
    assert.equal(res.success, false);
    assert.equal(res.error, 'Account suspended');
  });
});

describe('the template and the sender agree', () => {
  it('uses variables 1 to 6 with no gaps, and the samples cover exactly those', () => {
    assert.deepEqual(template.variableKeys(), ['1', '2', '3', '4', '5', '6']);
    assert.deepEqual(Object.keys(template.SAMPLES).sort(), template.variableKeys());
  });

  it('follows Meta\'s rules: a variable is never the first or last thing in the body', () => {
    assert.ok(!/^\s*\{\{/.test(template.BODY), 'does not start with a variable');
    assert.ok(!/\}\}\s*$/.test(template.BODY), 'does not end with a variable');
  });

  it('has a sample for every variable that is non-empty and on one line', () => {
    for (const [key, value] of Object.entries(template.SAMPLES)) {
      assert.ok(String(value).trim().length > 0, `sample ${key} is not empty`);
      assert.ok(!/[\n\t]/.test(value), `sample ${key} has no newline or tab`);
    }
  });

  it('renders under WhatsApp\'s 1024-character body limit, with the longest values it can be sent', () => {
    const worst = {
      1: 'L'.repeat(20), 2: 'R'.repeat(60), 3: 'P'.repeat(200), 4: 'D'.repeat(300), 5: 'C'.repeat(80), 6: 'X'.repeat(60),
    };
    assert.ok(template.render(worst).length <= 1024, `worst case is ${template.render(worst).length} characters`);
  });

  it('is what the sender fills - the same six keys, nothing more', async () => {
    process.env.TWILIO_DELIVERY_REQUEST_CONTENT_SID = 'HXTESTTEMPLATE';
    const fake = fakeClient();
    twilio._useClientForTests(fake.client);
    await twilio.sendDeliveryRequest(request());
    assert.deepEqual(Object.keys(JSON.parse(fake.created[0].contentVariables)).sort(), template.variableKeys());
  });

  it('says nothing about the delivery code - not the code, and not a mention of one', () => {
    assert.ok(!/(code|otp|pin|passcode|password)/i.test(template.BODY),
      'a template that tells somebody to collect a code from another person was rejected by Meta');
    assert.ok(!/d{4}/.test(template.render()), 'and no four-digit number in what a reviewer reads');
  });

  it('is filed as a utility message, in English, under the name the script creates', () => {
    assert.equal(template.CATEGORY, 'UTILITY');
    assert.equal(template.LANGUAGE, 'en');
    assert.equal(template.FRIENDLY_NAME, 'lampose_delivery_request_v2');
  });
});

describe('and it stayed that way', () => {
  it('made no attempt to reach a real provider', () => {
    assert.deepEqual(blocked, [], 'something tried to leave this machine: ' + blocked.join(', '));
  });
});
