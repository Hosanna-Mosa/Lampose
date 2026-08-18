/* ══════════════════════════════════════════════════════════════════════════
   The worker: the only thing here that acts without being asked.

   The test that matters is the one where nobody is looking — no owner
   tapping, no student polling, no read to settle anything on the way past.
   That is the case the whole worker exists for, and the case a lazy
   on-read expiry silently fails.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const config = require('../src/config/env');
const Property = require('../src/modules/properties/property.model');
const Partner = require('../src/modules/partners/partner.model');
const Customer = require('../src/modules/customers/customer.model');
const VisitRequest = require('../src/modules/visits/visitRequest.model');
const { syncShareTypes } = require('../src/modules/inventory/inventory.service');
const { createStayRequest, accept } = require('../src/modules/visits/stayRequest.service');
const {
  tick, startExpiryWorker, stopExpiryWorker, expiryWorkerStatus,
  setExpiryHandler, resetExpiryStats,
} = require('../src/modules/visits/expiry.worker');

withDatabase();

const OWNER_PHONE = '+919876543210';

const setup = async (beds = 6) => {
  const owner = await Partner.create({
    partnerId: 'par_owner', phone: OWNER_PHONE, name: 'Ramesh', phoneVerifiedAt: new Date(),
  });
  const student = await Customer.create({
    customerId: 'cus_a', phone: '+919111111111', name: 'Priya',
    email: 'priya@example.com', phoneVerifiedAt: new Date(),
  });
  const property = await Property.create({
    name: 'Sai Krishna Boys PG',
    place: 'Vizag',
    ownerName: 'Ramesh',
    ownerMobile: OWNER_PHONE,
    category: 'PG',
    rent: 5999,
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

/** Push a request's deadline into the past without touching its status. */
const backdate = (id) => VisitRequest.updateOne(
  { _id: id }, { $set: { expiresAt: new Date(Date.now() - 1000) } },
);

beforeEach(() => {
  resetExpiryStats();
  /* Reset the handler between tests, or one test's spy stays installed for
     the next and the counts read as somebody else's. */
  setExpiryHandler(async () => {});
});

afterEach(() => stopExpiryWorker());

/* ------------------------------------------------------------------ */

describe('a tick', () => {
  it('expires an overdue request when nobody is looking at anything', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);
    await backdate(request._id);

    /* No read, no poll, no owner. Only the worker. */
    const result = await tick();

    assert.equal(result.expired, 1);
    const doc = await VisitRequest.findById(request._id).lean();
    assert.equal(doc.status, 'expired');
    assert.equal(doc.decisionReason, 'NO_ANSWER');
    assert.ok(doc.decidedAt);
  });

  it('leaves a live request alone', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);

    assert.equal((await tick()).expired, 0);
    assert.equal((await VisitRequest.findById(request._id).lean()).status, 'pending_owner');
  });

  it('reports each expiry exactly once, so nothing is notified twice', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);
    await backdate(request._id);

    const seen = [];
    setExpiryHandler(async (requests) => { seen.push(...requests.map((r) => String(r._id))); });

    await tick();
    await tick();
    await tick();

    assert.deepEqual(seen, [String(request._id)], 'three ticks, one notification');
  });

  it('hands the handler enough to write the message', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);
    await backdate(request._id);

    let received = null;
    setExpiryHandler(async ([expired]) => { received = expired; });
    await tick();

    /* M6 needs to say "nobody answered about Sai Krishna Boys PG" to a
       specific student — so the handler gets documents, not ids. */
    assert.equal(received.customerId, 'cus_a');
    assert.equal(received.propertyName, 'Sai Krishna Boys PG');
    assert.equal(received.status, 'expired');
  });

  it('records the transition even when notifying throws', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);
    await backdate(request._id);

    setExpiryHandler(async () => { throw new Error('push gateway down'); });
    const result = await tick();

    /* The status change is the durable fact and it already happened. A worker
       that rolled it back because a push failed would leave the request
       pending forever and try again on the next tick, notifying eventually
       and having lied in between. */
    assert.equal(result.expired, 1);
    assert.equal((await VisitRequest.findById(request._id).lean()).status, 'expired');
  });

  it('does not expire a request the owner accepted first', async () => {
    const { owner, student, property } = await setup();
    const { request } = await send(student, property);
    await accept(request._id, owner);
    await backdate(request._id);

    /* Terminal is terminal. The deadline passing after an acceptance means
       nothing — the guarded filter requires `pending_owner`. */
    assert.equal((await tick()).expired, 0);
    assert.equal((await VisitRequest.findById(request._id).lean()).status, 'confirmed');
  });

  it('never touches the web channel — those owners have 24 hours', async () => {
    const { property } = await setup();
    const guest = await VisitRequest.create({
      channel: 'web',
      listingId: String(property._id),
      propertyName: property.name,
      ownerMobile: OWNER_PHONE,
      customer: { name: 'Guest', phone: '+919333333333', email: 'g@example.com' },
      status: 'pending_owner',
      expiresAt: new Date(Date.now() - 1000),
    });

    assert.equal((await tick()).expired, 0);
    assert.equal((await VisitRequest.findById(guest._id).lean()).status, 'pending_owner');
  });

  it('skips itself rather than overlapping', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);
    await backdate(request._id);

    /* A slow handler holds the tick open. A second tick starting beside it
       would query the same rows — harmless, thanks to the guarded update, and
       pure waste against a database already struggling. */
    setExpiryHandler(() => new Promise((resolve) => { setTimeout(resolve, 60); }));

    const [first, second] = await Promise.all([tick(), tick()]);
    const skipped = [first, second].filter((r) => r.skipped);

    assert.equal(skipped.length, 1, 'exactly one tick ran');
  });

  it('survives a bad tick and keeps going', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);
    await backdate(request._id);

    setExpiryHandler(async () => { throw new Error('boom'); });
    await tick();

    const second = await send(
      await Customer.create({
        customerId: 'cus_b', phone: '+919222222222', name: 'B',
        email: 'b@example.com', phoneVerifiedAt: new Date(),
      }),
      property,
    );
    await backdate(second.request._id);

    setExpiryHandler(async () => {});
    assert.equal((await tick()).expired, 1, 'the next tick works normally');
  });

  it('is a no-op with the database down', async () => {
    const mongoose = require('mongoose');

    /*
     * `readyState` is a GETTER on the connection's prototype. Shadowing it
     * with an own property is how to fake a disconnect; restoring it means
     * DELETING that shadow so the prototype getter shows through again.
     *
     * Writing the old number back instead leaves a permanent, non-writable
     * own property — mongoose can then never update it, `disconnect()` throws
     * "Cannot assign to read only property", the teardown hook fails, and the
     * in-memory mongod is never stopped. The run hangs rather than failing,
     * which is the worst way for a test to be wrong.
     */
    Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });
    try {
      assert.equal((await tick()).skipped, true, 'no query against a connection that is down');
    } finally {
      delete mongoose.connection.readyState;
    }

    assert.equal(mongoose.connection.readyState, 1, 'the real getter is back');
  });
});

describe('two workers, as two instances would be', () => {
  it('expire each request once between them', async () => {
    const { property } = await setup();

    /* `phone` is unique on app_customers, and the base student in setup()
       already holds +919111111111 — so these are built from a different
       prefix rather than a suffix that can collide with it. */
    for (const [index, id] of ['cus_1', 'cus_2', 'cus_3'].entries()) {
      const student = await Customer.create({
        customerId: id, phone: `+9192222222${String(index).padStart(2, '0')}`, name: id,
        email: `${id}@example.com`, phoneVerifiedAt: new Date(),
      });
      const { request } = await send(student, property);
      await backdate(request._id);
    }

    const seen = [];
    setExpiryHandler(async (requests) => { seen.push(...requests.map((r) => String(r._id))); });

    /* `tick` guards against overlapping ITSELF, so two instances are modelled
       by calling expireDue concurrently — which is what two processes do. */
    const { expireDue } = require('../src/modules/visits/stayRequest.service');
    const [a, b] = await Promise.all([expireDue(), expireDue()]);

    assert.equal(a.length + b.length, 3, 'three rows, three claims, no duplicates');
    assert.equal(await VisitRequest.countDocuments({ status: 'expired' }), 3);
  });
});

describe('the interval', () => {
  it('starts, reports itself, and stops', async () => {
    assert.equal(expiryWorkerStatus().running, false);

    startExpiryWorker();
    const status = expiryWorkerStatus();
    assert.equal(status.running, true);
    assert.equal(status.everyMs, config.booking.expiryTickMs);
    assert.equal(status.deadlineMinutes, config.booking.expiryMinutes);

    stopExpiryWorker();
    assert.equal(expiryWorkerStatus().running, false);
  });

  it('starting twice does not produce two intervals', async () => {
    const first = startExpiryWorker();
    const second = startExpiryWorker();
    /* `node --watch` re-runs the boot path on every save. Two intervals would
       double the query rate and survive the reload that created them. */
    assert.equal(first, second);
    stopExpiryWorker();
  });

  it('actually fires on its own, with nothing else touching the request', async () => {
    const { student, property } = await setup();
    const { request } = await send(student, property);
    await backdate(request._id);

    const fired = [];
    setExpiryHandler(async (requests) => { fired.push(...requests); });

    /* The real thing: an interval, left alone, doing the work. Driven at a
       short period rather than the configured five seconds so the test does
       not sit for a third of a minute. */
    const original = config.booking.expiryTickMs;
    config.booking.expiryTickMs = 25;
    try {
      startExpiryWorker();
      await new Promise((resolve) => { setTimeout(resolve, 200); });
    } finally {
      stopExpiryWorker();
      config.booking.expiryTickMs = original;
    }

    assert.equal(fired.length, 1, 'the interval expired it without being asked');
    assert.equal((await VisitRequest.findById(request._id).lean()).status, 'expired');
  });

  it('stops firing once stopped', async () => {
    const { student, property } = await setup();

    const original = config.booking.expiryTickMs;
    config.booking.expiryTickMs = 20;
    startExpiryWorker();
    stopExpiryWorker();
    config.booking.expiryTickMs = original;

    const { request } = await send(student, property);
    await backdate(request._id);
    await new Promise((resolve) => { setTimeout(resolve, 120); });

    /* Shutdown must actually stop it, or a tick lands on a connection that is
       being closed. */
    assert.equal((await VisitRequest.findById(request._id).lean()).status, 'pending_owner');
  });
});
