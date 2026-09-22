/* ══════════════════════════════════════════════════════════════════════════
   "You have a new order" — the WhatsApp a restaurant owner gets, and the link
   in it that takes them into the restaurant console to accept.

   The message is what an owner acts on: a link that is missing, dead, or
   points at the wrong order is an order nobody accepts. So this runs the real
   notifier against a real database and a fake Twilio client, and reads what
   would have been sent.

   Three ways the same alert can go out, and each has its own test:
     text template     the link is inside the body — "Accept it here: <URL>"
     button template   the link is a real button; only the order number varies
     plain text        no template configured — reaches an owner only inside an
                       open 24-hour session

   Nothing here can reach a real phone: credentials are blanked before anything
   loads, outbound requests are blocked, and the client is a fake.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'TWILIO_FOOD_ORDER_CONTENT_SID', 'TWILIO_FOOD_ORDER_BUTTON_SID', 'RESTAURANT_CONSOLE_URL',
  'SMS_APIKEY', 'SMS_USERNAME', 'SMS_API_URL', 'EXPO_ACCESS_TOKEN',
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

const { withDatabase } = require('./helpers/db');
const config = require('../src/config/env');
const twilio = require('../src/infrastructure/twilio/twilio');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const { notifyRestaurantOfOrder, orderLink } = require('../src/modules/foodpartners/foodOrder.notifier');
const { codeFor } = require('../src/modules/foodpartners/orderLink.service');

withDatabase();

const CONSOLE = 'https://admin.lampose.com';

/* The proof the link carries: good for this order, and nothing else. */
const CODE = codeFor('FP-TEST0001', 'LO241045');
const LINK = `${CONSOLE}/?order=LO241045&token=${CODE}`;

/*
 * `itemsTotal` is the figure this message quotes, and `grandTotal` is here to
 * prove it is NOT the one: the bill carries GST, the platform fee and the
 * delivery fee, none of which the restaurant sells, collects or keeps. A
 * kitchen reading "₹402" for ₹350 of food is being told it sold somebody
 * else's revenue.
 */
const order = () => ({
  orderNumber: 'LO241045',
  restaurantId: 'FP-TEST0001',
  itemsTotal: 350,
  grandTotal: 402,
  lines: [{ quantity: 5, productName: 'Butter Naan' }],
  placedAt: new Date(),
});

const makeKitchen = () => FoodRestaurant.create({
  restaurantId: 'FP-TEST0001',
  restaurantName: 'Paradise Biryani House',
  ownerName: 'Owner',
  ownerPhone: '+919000000001',
  ownerEmail: 'owner1@example.invalid',
  fssaiLicenseNumber: '12345678901234',
  cuisineTypes: ['North Indian'],
  verificationStatus: 'approved',
  isActive: true,
});

/** A stand-in for Twilio's client that records every message it is asked to send. */
const fakeClient = () => {
  const created = [];
  const messages = () => ({ fetch: async () => ({ status: 'delivered' }) });
  messages.create = async (payload) => { created.push(payload); return { sid: 'SMFAKE0001', status: 'queued' }; };
  return { client: { messages }, created };
};

/**
 * Send the alert and wait for it. The notifier starts the WhatsApp WITHOUT
 * awaiting it (a slow Twilio must not hold up a diner's checkout), so the test
 * waits for the message to appear rather than for the function to return.
 */
const alert = async (fake) => {
  twilio._useClientForTests(fake.client);
  await makeKitchen();
  await notifyRestaurantOfOrder(order());
  for (let i = 0; i < 50 && !fake.created.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  return fake.created[0];
};

afterEach(() => {
  twilio._useClientForTests(null);
  process.env.TWILIO_FOOD_ORDER_CONTENT_SID = '';
  process.env.TWILIO_FOOD_ORDER_BUTTON_SID = '';
  config.restaurantConsoleUrl = '';
});

describe('the link to the order', () => {
  it('opens THIS order in the restaurant console, and carries the proof that needs no sign-in', () => {
    config.restaurantConsoleUrl = CONSOLE;
    assert.equal(orderLink('LO241045', 'FP-TEST0001'), LINK);
    assert.match(CODE, /^[A-Za-z0-9_-]{22}$/);
  });

  it('is the plain sign-in link when there is no restaurant to make a proof for', () => {
    config.restaurantConsoleUrl = CONSOLE;
    assert.equal(orderLink('LO241045'), `${CONSOLE}/?order=LO241045`);
  });

  it('is left out, not broken, when no console address is configured', () => {
    assert.equal(orderLink('LO241045'), null);
  });
});

describe('the alert, as the approved text template', () => {
  it('carries "Accept it here: <link>" so the owner can tap straight into the console', async () => {
    process.env.TWILIO_FOOD_ORDER_CONTENT_SID = 'HXTEXTALERT';
    config.restaurantConsoleUrl = CONSOLE;
    const sent = await alert(fakeClient());

    assert.ok(sent, 'a message was sent');
    assert.equal(sent.contentSid, 'HXTEXTALERT');
    assert.equal(sent.to, 'whatsapp:+919000000001');
    const v = JSON.parse(sent.contentVariables);
    assert.equal(v[1], 'Paradise Biryani House');
    assert.equal(v[2], 'LO241045');
    assert.equal(v[3], '₹350', 'the food, not the ₹402 bill');
    assert.equal(v[4], '5× Butter Naan');
    assert.equal(v[5], `Accept it here: ${LINK}`);
  });

  it('is a link WhatsApp will make tappable - a real https address, and this order\'s', async () => {
    process.env.TWILIO_FOOD_ORDER_CONTENT_SID = 'HXTEXTALERT';
    config.restaurantConsoleUrl = CONSOLE;
    const v = JSON.parse((await alert(fakeClient())).contentVariables);
    const url = v[5].replace('Accept it here: ', '');
    assert.doesNotThrow(() => new URL(url));
    assert.equal(new URL(url).protocol, 'https:');
    assert.equal(new URL(url).searchParams.get('order'), 'LO241045');
    assert.equal(new URL(url).searchParams.get('token'), CODE, 'and the proof rides in the same link');
    assert.ok(v[5].length <= 300, 'inside the template variable\'s limit');
  });

  it('says to open the partner app when there is no console address - never an empty slot', async () => {
    process.env.TWILIO_FOOD_ORDER_CONTENT_SID = 'HXTEXTALERT';
    const v = JSON.parse((await alert(fakeClient())).contentVariables);
    assert.equal(v[5], 'Open the Lampose partner app to accept it.');
    for (const key of ['1', '2', '3', '4', '5']) assert.ok(String(v[key]).length > 0, `variable ${key} is not empty`);
  });
});

describe('the alert, as the approved button template', () => {
  it('sends only the order number - the button\'s own address is fixed inside the template', async () => {
    process.env.TWILIO_FOOD_ORDER_BUTTON_SID = 'HXBUTTONALERT';
    process.env.TWILIO_FOOD_ORDER_CONTENT_SID = 'HXTEXTALERT';
    config.restaurantConsoleUrl = CONSOLE;
    const sent = await alert(fakeClient());

    assert.equal(sent.contentSid, 'HXBUTTONALERT', 'the button one is preferred when both are set');
    /* The button's own address ends "?order=", so this is what follows it: the
       order and the proof, which is what lets the button open the page with no
       sign-in. */
    assert.equal(JSON.parse(sent.contentVariables)[5], `LO241045&token=${CODE}`);
  });
});

describe('the alert, as plain text', () => {
  it('carries the link in the body when there is one', async () => {
    config.restaurantConsoleUrl = CONSOLE;
    const sent = await alert(fakeClient());
    assert.equal(sent.contentSid, undefined);
    assert.match(sent.body, /New order at Paradise Biryani House/);
    assert.match(sent.body, /Order LO241045 · ₹350/);
    assert.equal(sent.body.includes('402'), false, 'the diner\'s bill is not in a kitchen\'s message');
    assert.ok(sent.body.includes(`Accept it here: ${LINK}`), 'the plain-text message carries the same link');
  });

  it('falls back to the sentence when there is not', async () => {
    const sent = await alert(fakeClient());
    assert.match(sent.body, /Open the Lampose partner app to accept it\./);
    assert.ok(!/Accept it here/.test(sent.body));
  });
});

describe('and it stayed that way', () => {
  it('made no attempt to reach a real provider', () => {
    assert.deepEqual(blocked, [], 'something tried to leave this machine: ' + blocked.join(', '));
  });
});
