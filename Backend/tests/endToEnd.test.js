/* ══════════════════════════════════════════════════════════════════════════
   The whole flow, over real HTTP, with nothing stubbed but the push gateway.

   Every other test file reaches into a service. This one boots the actual
   Express app on a real port and drives it the way the two phones do —
   through the routes, the session middleware, the rate limiters and the JSON
   contract. The distinction matters because a service that works and a route
   that is not mounted look identical from a unit test, and because
   authorisation lives in middleware that a direct service call never runs.

   Two students, one owner, one bed. That is the smallest arrangement in which
   every rule in the flow is reachable: the race, the auto-decline, the
   isolation between owners, and the difference between a decline and a bed
   that went to somebody else.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
/* `app.js` exports a factory, not an instance — see server.js, which builds
   the real one with CORS middleware injected. These tests call it over
   loopback, where no browser origin exists, so the CORS argument is omitted
   and the app is assembled without it. */
const createApp = require('../app');
const config = require('../src/config/env');
const Customer = require('../src/modules/customers/customer.model');
const Partner = require('../src/modules/partners/partner.model');
const Property = require('../src/modules/properties/property.model');
const VisitRequest = require('../src/modules/visits/visitRequest.model');
const { PartnerBooking, PartnerNotification } = require('../src/modules/partners/partnerDomains.model');
const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
const { signPartnerToken } = require('../src/modules/partners/partnerAuth.middleware');
const { syncShareTypes } = require('../src/modules/inventory/inventory.service');
const { tick, setExpiryHandler } = require('../src/modules/visits/expiry.worker');
const { notifyExpired } = require('../src/modules/notifications/stayRequest.notifier');
const push = require('../src/infrastructure/push/push');

withDatabase();

let server;
let base;

/* Every push that would have left the process. Expo is never called — what is
   being tested is that the flow fires the right notification at the right
   person, not a third party's uptime. */
let outbox = [];

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  push.sendPush = async (tokens, message) => {
    outbox.push({ tokens: [...tokens], ...message });
    return { sent: tokens.length, failed: 0, invalid: [], problem: null };
  };
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const call = async (method, path, { token, body } = {}) => {
  /* undici throws on a GET with a body, so one is never attached to one —
     the unauthenticated sweep below passes the same payload to every route
     regardless of verb. */
  const sendsBody = body && !['GET', 'HEAD'].includes(method);

  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(sendsBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: sendsBody ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

/**
 * Wait for a condition, rather than sleeping a guessed number of milliseconds.
 *
 * The controllers fire notifications without awaiting them — deliberately, so
 * a slow push gateway never delays a response — which means a test has to wait
 * for one to land. A fixed sleep is a guess, and it became wrong the moment
 * the notifier gained one more database write before its push: the sleep
 * expired first and the notification arrived into the NEXT step's outbox.
 *
 * Polling for the thing itself cannot go stale that way.
 */
const waitFor = async (predicate, { timeout = 3000, every = 20 } = {}) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (predicate()) return true;
    await new Promise((resolve) => { setTimeout(resolve, every); });
  }
  return predicate();
};

/** Wait for `n` pushes to have been recorded. */
const settle = (n = 1) => waitFor(() => outbox.length >= n);

/** Wait for a specific event, which is what most assertions actually mean. */
const settleFor = (kind) => waitFor(() => outbox.some((m) => m.data?.kind === kind));

const OWNER_PHONE = '+919876543210';

/*
 * A fresh cast per test, with ids nothing else has used.
 *
 * The rate limiters are real and their state is module-level, so it survives
 * the database being wiped between tests. Reusing `cus_a` across a dozen
 * tests trips the twelve-creates-an-hour ceiling part way through the file —
 * which is the limiter working correctly and a test suite quietly measuring
 * it. Unique ids keep each test independent without weakening the limit.
 */
let castNo = 0;

/** One owner, two students, one property with `beds` free. */
async function cast(beds = 1) {
  outbox = [];
  castNo += 1;
  const n = String(castNo).padStart(2, '0');

  const owner = await Partner.create({
    partnerId: `par_e2e_${n}`, phone: OWNER_PHONE, name: 'Ramesh', phoneVerifiedAt: new Date(),
    devices: [{ token: 'ExponentPushToken[owner]', platform: 'android' }],
  });

  const make = async (suffix, name, device) => {
    const customer = await Customer.create({
      customerId: `cus_${suffix}_${n}`,
      phone: `+9191${suffix === 'a' ? '1' : '2'}${n}00000`,
      name,
      email: `${suffix}${n}@example.com`,
      phoneVerifiedAt: new Date(),
      devices: [{ token: device, platform: 'ios' }],
    });
    return { customer, token: signCustomerToken(customer) };
  };

  const property = await Property.create({
    name: 'Sai Krishna Boys PG', place: 'Madhurawada, Visakhapatnam',
    ownerName: 'Ramesh', ownerMobile: OWNER_PHONE, category: 'PG', rent: 8000,
    categoryDetails: {
      sharingTypes: ['Single'],
      sharingPrices: { Single: 8000 },
      sharingRooms: { Single: beds },
      sharingBeds: { Single: beds },
    },
  });
  await syncShareTypes(property);

  return {
    owner,
    ownerToken: signPartnerToken(owner),
    a: await make('a', 'Priya', 'ExponentPushToken[priya]'),
    b: await make('b', 'Arun', 'ExponentPushToken[arun]'),
    propertyId: String(property._id),
  };
}

const send = (token, propertyId) => call('POST', '/api/v2/customers/stay-requests', {
  token, body: { listingId: propertyId, sharing: 'Single', consentedTerms: true },
});

const kindsIn = () => outbox.map((m) => m.data?.kind);

/* ------------------------------------------------------------------ */

describe('end to end · the happy path', () => {
  it('student asks, owner is buzzed, owner accepts, student is buzzed', async () => {
    const { ownerToken, a, propertyId } = await cast(2);

    /* ── 1. The student asks ─────────────────────────────────────────── */
    const created = await send(a.token, propertyId);
    assert.equal(created.status, 201);
    assert.equal(created.body.data.status, 'pending_owner');
    assert.ok(created.body.data.expiresAt, 'the server set no deadline');
    const requestId = created.body.data.id;

    await settleFor('request.created');

    /* ── 2. The owner's phone buzzes ─────────────────────────────────── */
    assert.deepEqual(kindsIn(), ['request.created']);
    assert.deepEqual(outbox[0].tokens, ['ExponentPushToken[owner]']);

    /* ── 3. It is in their inbox with a live clock ───────────────────── */
    const feed = await call('GET', '/api/v2/partners/requests', { token: ownerToken });
    const mine = feed.body.data.find((r) => r.id === requestId);
    assert.ok(mine, 'the request never reached the owner\'s list');
    assert.equal(mine.actionable, true);
    assert.ok(mine.secondsRemaining > 0 && mine.secondsRemaining <= 180);
    assert.equal(mine.customer.name, 'Priya');

    /* ── 4. They accept ──────────────────────────────────────────────── */
    outbox = [];
    const accepted = await call('POST', `/api/v2/partners/requests/${requestId}/accept`, {
      token: ownerToken,
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.data.status, 'confirmed');
    assert.equal(accepted.body.data.actionable, false, 'the buttons must die with the status');
    assert.ok(accepted.body.booking?.id, 'no customer record was opened');

    await settleFor('request.accepted');
    assert.deepEqual(kindsIn(), ['request.accepted']);
    assert.deepEqual(outbox[0].tokens, ['ExponentPushToken[priya]']);

    /* ── 5. The student sees the same thing ──────────────────────────── */
    const student = await call('GET', `/api/v2/customers/stay-requests/${requestId}`, {
      token: a.token,
    });
    assert.equal(student.body.data.status, 'confirmed');
    assert.ok(student.body.data.bookingId, 'nowhere for the student to continue to');

    /* ── 6. And a bed left the pool, exactly one ─────────────────────── */
    const listing = await call('GET', `/api/v2/listings/${propertyId}`);
    const option = listing.body.data.sharingOptions.find((o) => o.label === 'Single');
    assert.equal(option.availableBeds, 1, 'two beds, one taken');
  });
});

describe('end to end · two students, one bed', () => {
  it('one is confirmed, the other is told the bed went — not that they were refused', async () => {
    const { ownerToken, a, b, propertyId } = await cast(1);

    const first = await send(a.token, propertyId);
    const second = await send(b.token, propertyId);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201, 'the second student must still be able to ask');

    /* Neither reserved anything — the owner has the choice, which is the
       whole reason creation does not hold a bed. */
    const before = await call('GET', `/api/v2/listings/${propertyId}`);
    assert.equal(before.body.data.sharingOptions[0].availableBeds, 1);

    outbox = [];
    const accepted = await call('POST', `/api/v2/partners/requests/${first.body.data.id}/accept`, {
      token: ownerToken,
    });
    assert.equal(accepted.body.autoDeclined, 1, 'the other student was not closed out');

    await settle(2);

    /* Two notifications, and they say different things. */
    assert.deepEqual(kindsIn().sort(), ['request.accepted', 'request.inventoryTaken']);

    const taken = outbox.find((m) => m.data.kind === 'request.inventoryTaken');
    assert.deepEqual(taken.tokens, ['ExponentPushToken[arun]']);
    assert.match(taken.body, /while you were waiting/i);

    /* And the second student's own screen agrees. */
    const arun = await call('GET', `/api/v2/customers/stay-requests/${second.body.data.id}`, {
      token: b.token,
    });
    assert.equal(arun.body.data.status, 'declined');
    assert.equal(arun.body.data.decisionReason, 'INVENTORY_TAKEN');

    const after = await call('GET', `/api/v2/listings/${propertyId}`);
    assert.equal(after.body.data.sharingOptions[0].availableBeds, 0);
    assert.equal(after.body.data.sharingOptions[0].requestable, false);
  });
});

describe('end to end · both apps closed', () => {
  it('the request expires anyway, and the student is told', async () => {
    const { a, propertyId } = await cast(2);

    const created = await send(a.token, propertyId);
    const requestId = created.body.data.id;

    /* Three minutes is too long to sit through, so the DEADLINE moves rather
       than the clock. Everything else stays real. */
    await VisitRequest.updateOne(
      { _id: requestId }, { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    /* The create's own push must land before the outbox is cleared, or it
       arrives afterwards and reads as an extra notification from expiry. */
    await settleFor('request.created');
    outbox = [];
    setExpiryHandler(notifyExpired);
    const swept = await tick();
    setExpiryHandler(null);

    assert.equal(swept.expired, 1);
    await settleFor('request.expired');

    assert.deepEqual(kindsIn(), ['request.expired']);
    assert.deepEqual(outbox[0].tokens, ['ExponentPushToken[priya]']);

    /* And when the student finally opens the app. */
    const reopened = await call('GET', `/api/v2/customers/stay-requests/${requestId}`, {
      token: a.token,
    });
    assert.equal(reopened.body.data.status, 'expired');
    assert.equal(reopened.body.data.decisionReason, 'NO_ANSWER');
    assert.equal(reopened.body.data.secondsRemaining, 0);

    /* An unanswered request costs nothing. If expiry moved a counter, every
       ignored request would slowly eat a property's inventory. */
    const listing = await call('GET', `/api/v2/listings/${propertyId}`);
    assert.equal(listing.body.data.sharingOptions[0].availableBeds, 2);
  });
});

describe('end to end · the student changes their mind', () => {
  it('withdrawing tells the owner and kills their buttons', async () => {
    const { ownerToken, a, propertyId } = await cast(2);

    const created = await send(a.token, propertyId);
    const requestId = created.body.data.id;

    /* Let the "new request" push land before clearing — see the note above. */
    await settleFor('request.created');
    outbox = [];
    const cancelled = await call(
      'POST', `/api/v2/customers/stay-requests/${requestId}/withdraw`, { token: a.token },
    );
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data.status, 'cancelled');

    await settleFor('request.cancelled');
    assert.deepEqual(kindsIn(), ['request.cancelled']);
    assert.deepEqual(outbox[0].tokens, ['ExponentPushToken[owner]']);

    /* The owner must never be able to accept somebody who has walked away. */
    const owner = await call('GET', `/api/v2/partners/requests/${requestId}`, { token: ownerToken });
    assert.equal(owner.body.data.status, 'cancelled');
    assert.equal(owner.body.data.actionable, false);

    const late = await call('POST', `/api/v2/partners/requests/${requestId}/accept`, {
      token: ownerToken,
    });
    assert.equal(late.status, 409);
    assert.equal(late.body.code, 'REQUEST_CANCELLED');
  });
});

describe('end to end · nobody sees anybody else\'s', () => {
  it('a second owner gets nothing in their feed and a 404 on accept', async () => {
    const { a, propertyId } = await cast(2);
    const created = await send(a.token, propertyId);

    const intruder = await Partner.create({
      partnerId: 'par_intruder', phone: '+919000000009', name: 'Other',
      phoneVerifiedAt: new Date(),
    });
    const token = signPartnerToken(intruder);

    const feed = await call('GET', '/api/v2/partners/requests', { token });
    assert.equal(feed.body.data.length, 0, 'another owner can see these requests');

    /* 404, never 403 — a 403 confirms the request exists, and an id would
       become a way to discover whose requests are whose. */
    const stolen = await call('POST', `/api/v2/partners/requests/${created.body.data.id}/accept`, {
      token,
    });
    assert.equal(stolen.status, 404);
  });

  it('a second student cannot read or withdraw one', async () => {
    const { a, b, propertyId } = await cast(2);
    const created = await send(a.token, propertyId);
    const id = created.body.data.id;

    assert.equal((await call('GET', `/api/v2/customers/stay-requests/${id}`, { token: b.token })).status, 404);
    assert.equal((await call('POST', `/api/v2/customers/stay-requests/${id}/withdraw`, { token: b.token })).status, 404);

    /* And it is untouched. */
    assert.equal((await VisitRequest.findById(id).lean()).status, 'pending_owner');
  });

  it('and nothing at all works without a session', async () => {
    const { propertyId } = await cast(2);
    for (const [method, path] of [
      ['POST', '/api/v2/customers/stay-requests'],
      ['GET', '/api/v2/customers/stay-requests'],
      ['GET', '/api/v2/partners/requests'],
      ['POST', '/api/v2/customers/devices'],
      ['POST', '/api/v2/partners/devices'],
    ]) {
      const { status } = await call(method, path, { body: { listingId: propertyId } });
      assert.equal(status, 401, `${method} ${path} answered ${status} unauthenticated`);
    }
  });
});

describe('end to end · a double tap costs one bed', () => {
  it('four simultaneous accepts open one customer record', async () => {
    const { ownerToken, a, propertyId } = await cast(2);
    const created = await send(a.token, propertyId);
    const id = created.body.data.id;

    const results = await Promise.all(
      Array.from({ length: 4 }, () => call('POST', `/api/v2/partners/requests/${id}/accept`, {
        token: ownerToken,
      })),
    );

    const won = results.filter((r) => r.status === 200);
    assert.equal(won.length, 1, `${won.length} accepts succeeded`);

    /*
     * The three that lost are told WHY — but not all with the same word, and
     * that is correct rather than sloppy.
     *
     * Acceptance takes the BED before the request. With two beds and four
     * simultaneous taps, two threads get a bed and two find none — those get
     * `INVENTORY_GONE` without ever reaching the request. Of the two holding
     * beds, one wins the guarded update and the other gets
     * `ALREADY_ACCEPTED` and hands its bed straight back.
     *
     * Which loser sees which code depends on scheduling, so asserting one
     * specific code here made this test flaky. What must hold is that every
     * refusal is a NAMED one and that the invariants below survive.
     */
    const LEGITIMATE = ['ALREADY_ACCEPTED', 'INVENTORY_GONE', 'REQUEST_EXPIRED', 'REQUEST_CANCELLED'];
    for (const lost of results.filter((r) => r.status !== 200)) {
      assert.equal(lost.status, 409, `a loser answered ${lost.status}`);
      assert.ok(LEGITIMATE.includes(lost.body.code),
        `unexpected refusal code ${lost.body.code}`);
    }

    /* The invariants, which hold whatever order the four threads ran in. */
    assert.equal(await PartnerBooking.countDocuments({}), 1, 'duplicate customer records');

    const listing = await call('GET', `/api/v2/listings/${propertyId}`);
    assert.equal(listing.body.data.sharingOptions[0].availableBeds, 1,
      'exactly one bed must leave the pool — every loser gives its bed back');

    /* And no counter drifted while three threads took and returned beds. */
    const { reconcile } = require('../src/modules/inventory/inventory.service');
    assert.equal((await reconcile()).drifted.length, 0, 'the bed counter drifted under contention');
  });
});

describe('end to end · the refusals a real catalogue produces', () => {
  it('a property whose owner is not on Stay Partner is refused at creation', async () => {
    const { a } = await cast(2);

    /* Seven of the twelve live properties are in this state. */
    const orphan = await Property.create({
      name: 'Unonboarded PG', place: 'Vizag', ownerName: 'Someone',
      ownerMobile: '+919555555555', category: 'PG', rent: 5000,
      categoryDetails: {
        sharingTypes: ['Single'], sharingPrices: { Single: 5000 }, sharingBeds: { Single: 4 },
      },
    });
    await syncShareTypes(orphan);

    const { status, body } = await send(a.token, String(orphan._id));
    assert.equal(status, 422);
    assert.equal(body.code, 'OWNER_NOT_ONBOARDED');

    /* Nothing written. A row nobody can answer is worse than an error — it
       counts down for three minutes and then tells the student they were
       ignored. */
    assert.equal(await VisitRequest.countDocuments({ listingId: String(orphan._id) }), 0);
  });

  it('a property with no bed counts says so specifically, not "full"', async () => {
    const { a } = await cast(2);

    const uncounted = await Property.create({
      name: 'Uncounted PG', place: 'Vizag', ownerName: 'Ramesh',
      ownerMobile: OWNER_PHONE, category: 'PG', rent: 5000,
      categoryDetails: { sharingTypes: ['Single'], sharingPrices: { Single: 5000 } },
    });
    await syncShareTypes(uncounted);

    const { status, body } = await send(a.token, String(uncounted._id));
    assert.equal(status, 422);
    /* "Nobody counted the beds" and "every bed is taken" are different
       problems and only one of them is about being busy. */
    assert.equal(body.code, 'INVENTORY_NOT_SET');
  });

  it('and asking twice on one listing is refused', async () => {
    const { a, propertyId } = await cast(2);

    assert.equal((await send(a.token, propertyId)).status, 201);
    const second = await send(a.token, propertyId);
    assert.equal(second.status, 409);
    assert.equal(second.body.code, 'ALREADY_REQUESTED');
  });
});

describe('end to end · the owner\'s inbox row outlives the push', () => {
  it('a row is written even when no handset is registered', async () => {
    const { a, propertyId, owner } = await cast(2);
    await Partner.updateOne({ partnerId: owner.partnerId }, { $set: { devices: [] } });

    outbox = [];
    await send(a.token, propertyId);

    /* Nothing to wait FOR here — the assertion is that nothing arrives — so
       this one genuinely does need a fixed window to be confident. */
    await new Promise((resolve) => { setTimeout(resolve, 400); });
    assert.equal(outbox.length, 0, 'a push went somewhere with no device registered');

    /* The record is the durable half. An owner with notifications off still
       finds the request when they next open the app. */
    const rows = await PartnerNotification.find({ partnerPhoneDigits: owner.phoneDigits }).lean();
    assert.equal(rows.length, 1);
    assert.match(rows[0].title, /new stay request/i);
  });
});

describe('end to end · the deadline is the configured one', () => {
  it('and it is the server that sets it', async () => {
    const { a, propertyId } = await cast(2);

    const sentAt = Date.now();
    const { body } = await send(a.token, propertyId);

    const window = Date.parse(body.data.expiresAt) - sentAt;
    const expected = config.booking.expiryMinutes * 60 * 1000;
    assert.ok(Math.abs(window - expected) < 3000,
      `deadline is ${Math.round(window / 1000)}s, expected ~${expected / 1000}s`);

    /* Both apps derive their countdown from this pair, so they must agree. */
    assert.ok(Math.abs(Date.parse(body.data.serverNow) - Date.now()) < 5000);
  });
});
