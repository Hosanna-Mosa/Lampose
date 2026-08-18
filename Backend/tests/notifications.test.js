/* ══════════════════════════════════════════════════════════════════════════
   Telling somebody, exactly once, without ever breaking what already happened.

   Two properties are worth more than all the message wording put together:

     · a notification fires only for a transition that COMMITTED, so three
       expiry sweeps over one request produce one notification — with no
       dedupe table, because the guarded update already is one;

     · a notification that fails changes nothing, because the thing it is
       about has already been written and answered.

   Expo is never actually called here: `sendPush` is stubbed, and what is
   asserted is who would have been reached and with what.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const config = require('../src/config/env');
const Property = require('../src/modules/properties/property.model');
const Partner = require('../src/modules/partners/partner.model');
const Customer = require('../src/modules/customers/customer.model');
const VisitRequest = require('../src/modules/visits/visitRequest.model');
const { PartnerNotification } = require('../src/modules/partners/partnerDomains.model');
const { syncShareTypes } = require('../src/modules/inventory/inventory.service');
const {
  createStayRequest, acceptAndBook, decline, withdraw,
} = require('../src/modules/visits/stayRequest.service');
const { tick, setExpiryHandler, resetExpiryStats } = require('../src/modules/visits/expiry.worker');
const notifier = require('../src/modules/notifications/stayRequest.notifier');
const push = require('../src/infrastructure/push/push');

withDatabase();

const OWNER_PHONE = '+919876543210';
const OWNER_TOKEN = 'ExponentPushToken[owner-handset]';
const STUDENT_TOKEN = 'ExponentPushToken[student-handset]';

/* Every send that would have gone out. */
let outbox = [];
const realSendPush = push.sendPush;

beforeEach(() => {
  outbox = [];
  resetExpiryStats();
  push.sendPush = async (tokens, message) => {
    outbox.push({ tokens: [...tokens], ...message });
    return { sent: tokens.length, failed: 0, invalid: [], problem: null };
  };
});

afterEach(() => { push.sendPush = realSendPush; });

const setup = async ({ beds = 6, ownerDevices = true, studentDevices = true } = {}) => {
  const owner = await Partner.create({
    partnerId: 'par_owner', phone: OWNER_PHONE, name: 'Ramesh', phoneVerifiedAt: new Date(),
    devices: ownerDevices ? [{ token: OWNER_TOKEN, platform: 'android' }] : [],
  });
  const student = await Customer.create({
    customerId: 'cus_a', phone: '+919111111111', name: 'Priya',
    email: 'priya@example.com', phoneVerifiedAt: new Date(),
    devices: studentDevices ? [{ token: STUDENT_TOKEN, platform: 'ios' }] : [],
  });
  const property = await Property.create({
    name: 'Sai Krishna Boys PG', place: 'Vizag', ownerName: 'Ramesh',
    ownerMobile: OWNER_PHONE, category: 'PG', rent: 5999,
    categoryDetails: {
      sharingTypes: ['2 Sharing'],
      sharingPrices: { '2 Sharing': 5999 },
      sharingBeds: { '2 Sharing': beds },
    },
  });
  await syncShareTypes(property);
  return { owner, student, property };
};

const send = (student, property) => createStayRequest({
  customer: student, listingId: String(property._id), sharing: '2 Sharing', consentedTerms: true,
});

const backdate = (id) => VisitRequest.updateOne(
  { _id: id }, { $set: { expiresAt: new Date(Date.now() - 1000) } },
);

/* ------------------------------------------------------------------ */

describe('the owner is told a request arrived', () => {
  it('with the room type and the deadline in the body', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);

    await notifier.notifyOwnerOfNewRequest(request);

    assert.equal(outbox.length, 1);
    assert.deepEqual(outbox[0].tokens, [OWNER_TOKEN]);
    assert.equal(outbox[0].title, 'New stay request');

    /* An owner deciding from a lock screen should not have to open the app to
       learn what they are being asked or how long they have. */
    assert.match(outbox[0].body, /Priya/);
    assert.match(outbox[0].body, /2 Sharing/);
    assert.match(outbox[0].body, new RegExp(`${config.booking.expiryMinutes} minutes`));
  });

  it('and the payload deep-links straight to the request', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);

    await notifier.notifyOwnerOfNewRequest(request);

    /* Carried rather than looked up on open: with three minutes on the clock
       an extra round trip before the countdown renders is a real fraction of
       the window. */
    assert.equal(outbox[0].data.requestId, String(request._id));
    assert.equal(outbox[0].data.kind, 'request.created');
    assert.ok(outbox[0].data.expiresAt);
  });

  it('and an inbox row survives the notification', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);

    await notifier.notifyOwnerOfNewRequest(request);

    const rows = await PartnerNotification.find({ partnerPhoneDigits: '9876543210' }).lean();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].read, false);
    assert.match(rows[0].message, /Sai Krishna Boys PG/);
  });

  it('an owner with no registered handset is a no-op, not an error', async () => {
    const { student, property } = await setup({ ownerDevices: false });
    const { request } = await send(student, property);

    const result = await notifier.notifyOwnerOfNewRequest(request);

    assert.equal(result.reason, 'NO_DEVICES');
    assert.equal(outbox.length, 0);
    /* The inbox row is still written — they find it when they next open the
       app, which is the whole reason the row comes first. */
    assert.equal(await PartnerNotification.countDocuments({}), 1);
  });
});

describe('the student is told what the owner did', () => {
  it('accepted', async () => {
    const { owner, student, property } = await setup();
    const { request } = await send(student, property);
    outbox = [];

    const { request: accepted } = await acceptAndBook(request._id, owner);
    await notifier.notifyStudentAccepted(accepted);

    assert.deepEqual(outbox[0].tokens, [STUDENT_TOKEN]);
    assert.match(outbox[0].title, /accepted/i);
    assert.equal(outbox[0].data.kind, 'request.accepted');
  });

  it('declined — as the owner\'s decision', async () => {
    const { owner, student, property } = await setup();
    const { request } = await send(student, property);
    outbox = [];

    const declined = await decline(request._id, owner);
    await notifier.notifyStudentDeclined(declined);

    assert.match(outbox[0].title, /declined/i);
    assert.equal(outbox[0].data.kind, 'request.declined');
  });

  it('but "taken" when the bed went — never a rejection', async () => {
    const { owner, student, property } = await setup({ beds: 1 });
    const b = await Customer.create({
      customerId: 'cus_b', phone: '+919222222222', name: 'Arun',
      email: 'arun@example.com', phoneVerifiedAt: new Date(),
      devices: [{ token: 'ExponentPushToken[arun]', platform: 'android' }],
    });

    const first = await send(student, property);
    await send(b, property);
    outbox = [];

    const { autoDeclined } = await acceptAndBook(first.request._id, owner);
    for (const lost of autoDeclined) await notifier.notifyStudentDeclined(lost);

    assert.equal(outbox.length, 1);
    assert.deepEqual(outbox[0].tokens, ['ExponentPushToken[arun]']);

    /* The distinction the whole reason code exists for. Nobody rejected
       Arun — somebody else was faster, and "try again" is the right advice
       rather than "look elsewhere". */
    assert.match(outbox[0].title, /taken/i);
    assert.equal(outbox[0].data.kind, 'request.inventoryTaken');
    assert.match(outbox[0].body, /while you were waiting/i);
  });

  it('expired — and not as though they were ignored', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);
    await backdate(request._id);
    outbox = [];

    setExpiryHandler(notifier.notifyExpired);
    await tick();
    setExpiryHandler(null);

    assert.equal(outbox.length, 1);
    assert.match(outbox[0].title, /expired/i);
    /* An owner who missed three minutes was probably driving. A student who
       reads silence as rejection stops sending requests. */
    assert.match(outbox[0].body, /did not answer in time/i);
    assert.match(outbox[0].body, /try again/i);
  });
});

describe('the owner is told the student walked away', () => {
  it('with a push and an inbox row', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);
    outbox = [];

    const cancelled = await withdraw(request._id, student);
    await notifier.notifyOwnerOfWithdrawal(cancelled);

    assert.deepEqual(outbox[0].tokens, [OWNER_TOKEN]);
    assert.match(outbox[0].title, /cancelled/i);
    assert.equal(outbox[0].data.kind, 'request.cancelled');

    const rows = await PartnerNotification.find({ partnerPhoneDigits: '9876543210' }).lean();
    assert.equal(rows.filter((r) => /cancelled/i.test(r.title)).length, 1);
  });
});

describe('exactly once, with no dedupe table', () => {
  it('three expiry sweeps notify once', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);
    await backdate(request._id);
    outbox = [];

    setExpiryHandler(notifier.notifyExpired);
    await tick();
    await tick();
    await tick();
    setExpiryHandler(null);

    /* The guarded update IS the dedupe: sweeps two and three match zero
       documents, so there is nothing to notify about. */
    assert.equal(outbox.length, 1, 'three sweeps, one notification');
  });

  it('a second accept notifies nobody', async () => {
    const { owner, student, property } = await setup();
    const { request } = await send(student, property);
    const { request: accepted } = await acceptAndBook(request._id, owner);
    await notifier.notifyStudentAccepted(accepted);
    outbox = [];

    await assert.rejects(() => acceptAndBook(request._id, owner));
    assert.equal(outbox.length, 0, 'a refused transition sends nothing');
  });
});

describe('a failed notification never undoes what happened', () => {
  it('the request is still expired when the gateway is down', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);
    await backdate(request._id);

    push.sendPush = async () => { throw new Error('gateway down'); };

    setExpiryHandler(notifier.notifyExpired);
    const result = await tick();
    setExpiryHandler(null);

    assert.equal(result.expired, 1);
    assert.equal((await VisitRequest.findById(request._id).lean()).status, 'expired');
  });

  it('and the notifier reports rather than throwing', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);
    push.sendPush = async () => { throw new Error('gateway down'); };

    const result = await notifier.notifyOwnerOfNewRequest(request);
    assert.ok(result.error, 'the failure is reported');
  });
});

describe('dead device tokens are pruned', () => {
  it('a token Expo says is gone is removed from the account', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);

    push.sendPush = async () => ({
      sent: 0, failed: 1, invalid: [OWNER_TOKEN], problem: null,
    });

    await notifier.notifyOwnerOfNewRequest(request);

    /* Otherwise it fails on every future send forever, and "did the push
       work" stops being answerable from the numbers. */
    const owner = await Partner.findOne({ partnerId: 'par_owner' }).lean();
    assert.equal(owner.devices.length, 0);
  });
});

describe('the push transport itself', () => {
  it('accepts only Expo-shaped tokens', () => {
    assert.equal(push.isExpoToken('ExponentPushToken[xxx]'), true);
    assert.equal(push.isExpoToken('ExpoPushToken[xxx]'), true);
    assert.equal(push.isExpoToken('fcm-looking-token'), false);
    assert.equal(push.isExpoToken(''), false);
    assert.equal(push.isExpoToken(null), false);
  });

  it('sends nothing, and reports why, when push is switched off', async () => {
    push.sendPush = realSendPush;
    const original = config.push.enabled;
    config.push.enabled = false;
    try {
      const result = await push.sendPush([OWNER_TOKEN], { title: 'x', body: 'y' });
      assert.equal(result.sent, 0);
      assert.match(result.problem, /PUSH_ENABLED/);
    } finally {
      config.push.enabled = original;
    }
  });

  it('makes no network call for an empty or junk token list', async () => {
    push.sendPush = realSendPush;
    const result = await push.sendPush(['not-a-token', '', null], { title: 'x', body: 'y' });
    assert.equal(result.sent, 0);
    assert.equal(result.problem, null);
  });
});
