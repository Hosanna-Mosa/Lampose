/* ══════════════════════════════════════════════════════════════════════════
   RIDER_DISPATCH_MODE - the switch between the rider app and WhatsApp.

     app        a rider is searched for and offered the job (unchanged)
     whatsapp   no search; every number in RIDER_DISPATCH_NUMBERS is sent the
                full order when the restaurant accepts

   Nothing here can reach a real phone: the messaging credentials are blanked
   before anything loads, and the sender is replaced with a recorder.
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'TWILIO_DELIVERY_REQUEST_CONTENT_SID', 'TWILIO_RIDER_DISPATCH_CONTENT_SID',
  'DELIVERY_PARTNER_WHATSAPP', 'SMS_APIKEY', 'SMS_USERNAME', 'SMS_API_URL',
  'EXPO_ACCESS_TOKEN',
]) process.env[key] = '';

const {
  describe, it, before, after, beforeEach,
} = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const config = require('../src/config/env');
const twilio = require('../src/infrastructure/twilio/twilio');
const FoodOrder = require('../src/modules/foodpartners/foodOrder.model');
const dispatch = require('../src/modules/drivers/foodDispatch.service');
const template = require('../src/infrastructure/twilio/riderDispatchTemplate');

withDatabase();

let sent = [];
let answers = {};
const realSender = twilio.sendRiderDispatch;

before(() => {
  twilio.sendRiderDispatch = async (args) => {
    sent.push(args);
    return answers[args.to] || { success: true, messageSid: `SM_${args.to}` };
  };
});

after(() => {
  twilio.sendRiderDispatch = realSender;
  config.riderDispatch.mode = 'app';
  config.riderDispatch.numbers = [];
  dispatch.stopAllDispatch();
});

beforeEach(() => {
  sent = [];
  answers = {};
  config.riderDispatch.mode = 'whatsapp';
  config.riderDispatch.numbers = ['+919000000001', '+919000000002', '+919000000003'];
});

const order = (orderNumber, over = {}) => FoodOrder.collection.insertOne({
  orderNumber,
  restaurantId: 'FP-TEST0001',
  status: 'accepted',
  fulfilment: 'delivery',
  paymentMode: 'cod',
  paymentStatus: 'pending',
  grandTotal: 265,
  deliveryFee: 40,
  customerName: 'Ravi',
  customerPhone: '+919812345678',
  deliveryAddress: 'Flat 204, Sai Residency',
  restaurant: { name: 'Test Kitchen', address: 'RTC complex', phone: '+919000000009' },
  lines: [
    { productName: 'Chicken Biryani', variantName: 'Half', quantity: 2, unitPrice: 100, lineTotal: 200 },
    { productName: 'Raita', quantity: 1, unitPrice: 30, lineTotal: 30 },
  ],
  statusHistory: [],
  placedAt: new Date(),
  ...over,
});

describe('RIDER_DISPATCH_MODE=whatsapp', () => {
  it('sends the full order to every number, with no rider search', async () => {
    await order('LO200001');
    const result = await dispatch.startDispatch('LO200001', { reason: 'accepted' });

    assert.equal(result.started, true);
    assert.deepEqual(sent.map((s) => s.to).sort(), config.riderDispatch.numbers);
    const first = sent[0];
    assert.equal(first.orderNumber, 'LO200001');
    assert.equal(first.items, '2 x Chicken Biryani (Half), 1 x Raita');
    assert.match(first.customer, /Ravi.*\+919812345678/);
    assert.match(first.collect, /Cash to collect: ₹265/);
    assert.equal(first.payout, '₹32');

    const saved = await FoodOrder.findOne({ orderNumber: 'LO200001' });
    assert.equal(saved.delivery.method, 'driver');
    assert.equal(saved.delivery.request.ok, true);
    assert.equal(saved.dispatch.state, 'idle');
    assert.equal(saved.dispatch.offers.length, 0);
    assert.equal(FoodOrder.driverAssigned(saved), true);
  });

  it('says "already paid" for a paid online order', async () => {
    await order('LO200002', { paymentMode: 'online', paymentStatus: 'paid' });
    await dispatch.startDispatch('LO200002');
    assert.match(sent[0].collect, /Already paid/);
  });

  it('does not message the team twice for one order', async () => {
    await order('LO200003');
    await dispatch.startDispatch('LO200003', { reason: 'accepted' });
    await dispatch.startDispatch('LO200003', { reason: 'food is ready' });
    await dispatch.startDispatch('LO200003', { reason: 'retry' });
    assert.equal(sent.length, 3, 'one message per number, once');
  });

  it('lets an administrator resend', async () => {
    await order('LO200004');
    await dispatch.startDispatch('LO200004');
    await dispatch.startDispatch('LO200004', { reason: 'admin' });
    assert.equal(sent.length, 6);
  });

  it('sends nothing for a pickup order or an unpaid online one', async () => {
    await order('LO200005', { fulfilment: 'pickup' });
    await order('LO200006', { paymentMode: 'online', paymentStatus: 'pending' });
    await dispatch.startDispatch('LO200005');
    await dispatch.startDispatch('LO200006');
    assert.equal(sent.length, 0);
  });

  it('counts as sent when at least one number got it, and records the others', async () => {
    answers['+919000000002'] = { success: false, error: 'not on WhatsApp' };
    await order('LO200007');
    const result = await dispatch.startDispatch('LO200007');
    assert.equal(result.started, true);
    const saved = await FoodOrder.findOne({ orderNumber: 'LO200007' });
    assert.equal(saved.delivery.request.ok, true);
    assert.match(saved.delivery.request.error, /919000000002.*not on WhatsApp/);
  });

  it('leaves the order unassigned when nobody could be messaged, then retries it', async () => {
    for (const n of config.riderDispatch.numbers) answers[n] = { success: false, error: 'template not approved' };
    await order('LO200008');
    const first = await dispatch.startDispatch('LO200008');
    assert.equal(first.started, false);

    let saved = await FoodOrder.findOne({ orderNumber: 'LO200008' });
    assert.equal(saved.delivery.request.ok, false);
    assert.equal(saved.dispatch.state, 'unassigned');
    assert.equal(FoodOrder.driverAssigned(saved), false, 'the diner is not told a driver is coming');

    answers = {};
    const retry = await dispatch.startDispatch('LO200008', { reason: 'retry' });
    assert.equal(retry.started, true);
    saved = await FoodOrder.findOne({ orderNumber: 'LO200008' });
    assert.equal(saved.delivery.request.ok, true);
    assert.equal(saved.dispatch.state, 'idle');
  });

  it('stops retrying after MAX_SWEEPS failures, but an administrator still can', async () => {
    for (const n of config.riderDispatch.numbers) answers[n] = { success: false, error: 'down' };
    await order('LO200009');
    for (let i = 0; i < 5; i += 1) await dispatch.startDispatch('LO200009', { reason: 'retry' });
    assert.equal(sent.length, 9, 'three attempts x three numbers, then it stops');
    answers = {};
    const admin = await dispatch.startDispatch('LO200009', { reason: 'admin' });
    assert.equal(admin.started, true);
  });

  it('fails loudly, not silently, when no numbers are configured', async () => {
    config.riderDispatch.numbers = [];
    await order('LO200010');
    const result = await dispatch.startDispatch('LO200010');
    assert.equal(result.started, false);
    const saved = await FoodOrder.findOne({ orderNumber: 'LO200010' });
    assert.match(saved.delivery.request.error, /RIDER_DISPATCH_NUMBERS is empty/);
  });

  it('respects a restaurant that chose to deliver itself', async () => {
    await order('LO200011', { delivery: { method: 'self' } });
    await dispatch.startDispatch('LO200011');
    assert.equal(sent.length, 0);
  });
});

describe('RIDER_DISPATCH_MODE=app (the default)', () => {
  it('sends no WhatsApp and does not mark the order as arranged by the desk', async () => {
    config.riderDispatch.mode = 'app';
    await order('LO200012');
    await dispatch.startDispatch('LO200012');
    assert.equal(sent.length, 0);
    const saved = await FoodOrder.findOne({ orderNumber: 'LO200012' });
    assert.equal(saved.delivery.method || '', '');
  });
});

describe('the rider-dispatch WhatsApp template', () => {
  it('has exactly the eight variables the sender fills, in order', () => {
    assert.deepEqual(template.variableKeys(), ['1', '2', '3', '4', '5', '6', '7', '8']);
    assert.deepEqual(Object.keys(template.SAMPLES), template.variableKeys());
  });

  it('does not start or end on a variable (Meta rejects that)', () => {
    assert.doesNotMatch(template.BODY, /^\{\{/);
    assert.doesNotMatch(template.BODY, /\}\}$/);
  });
});
