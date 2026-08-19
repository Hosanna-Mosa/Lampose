/* ══════════════════════════════════════════════════════════════════════════
   The state machine, and the four ways two people can collide on it.

   The race tests are the reason this file exists. Everything else here could
   be established by reading the source; "an owner tapping Accept at the same
   instant as the expiry worker produces exactly one outcome" cannot, because
   it is a claim about what the DATABASE does under concurrency. Mocking it
   would test the author's belief about Mongo rather than Mongo.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase, race } = require('./helpers/db');
const config = require('../src/config/env');
const Property = require('../src/modules/properties/property.model');
const Partner = require('../src/modules/partners/partner.model');
const Customer = require('../src/modules/customers/customer.model');
const VisitRequest = require('../src/modules/visits/visitRequest.model');
const { PartnerShareType } = require('../src/modules/partners/partnerDomains.model');
const { syncShareTypes } = require('../src/modules/inventory/inventory.service');
const {
  StayRequestError, deadlineFrom, accept, decline, withdraw,
  expireDue, declineForLostInventory, settleIfExpired,
} = require('../src/modules/visits/stayRequest.service');

withDatabase();

/* ------------------------------------------------------------------ *
 * The cast
 * ------------------------------------------------------------------ */

const OWNER_PHONE = '+919876543210';
const OTHER_OWNER_PHONE = '+919000000001';

const makeOwner = (phone = OWNER_PHONE, partnerId = 'par_owner') => Partner.create({
  partnerId, phone, name: 'Ramesh', phoneVerifiedAt: new Date(),
});

const makeStudent = (customerId = 'cus_student', phone = '+919111111111') => Customer.create({
  customerId, phone, name: 'Priya', phoneVerifiedAt: new Date(),
});

/** `beds` is how many of "2 Sharing" exist — one makes the conflict reachable. */
const makeProperty = async (beds = 6) => {
  const property = await Property.create({
    name: 'Sai Krishna Boys PG',
    place: 'Madhurawada, Visakhapatnam',
    ownerName: 'Ramesh',
    ownerMobile: OWNER_PHONE,
    category: 'PG_HOSTEL',
    rent: 5999,
    categoryDetails: {
      sharingTypes: ['2 Sharing'],
      sharingPrices: { '2 Sharing': 5999 },
      sharingBeds: { '2 Sharing': beds },
    },
  });
  await syncShareTypes(property);
  return property;
};

/** A request as the create endpoint will write it — already past the code step. */
const makeRequest = async (property, { customerId = 'cus_student', expiresAt = null, status = 'pending_owner' } = {}) =>
  VisitRequest.create({
    channel: 'app',
    listingId: String(property._id),
    propertyName: property.name,
    ownerName: property.ownerName,
    ownerMobile: property.ownerMobile,
    customerId,
    customer: { name: 'Priya', phone: '+919111111111', email: 'priya@example.com' },
    shareTypeId: `${property._id}:2-sharing`,
    sharing: { label: '2 Sharing', price: 5999 },
    status,
    phoneVerifiedAt: new Date(),
    expiresAt: expiresAt || deadlineFrom(),
  });

const bedsFree = async (property) => (
  await PartnerShareType.findOne({ shareTypeId: `${property._id}:2-sharing` }).lean()
).availableBeds;

/** Assert a call fails with a specific business code. */
const failsWith = async (code, run) => {
  try {
    await run();
    assert.fail(`expected ${code}, but the call succeeded`);
  } catch (error) {
    assert.ok(error instanceof StayRequestError, `expected StayRequestError, got ${error.name}: ${error.message}`);
    assert.equal(error.code, code, `expected ${code}, got ${error.code} ("${error.message}")`);
    return error;
  }
  return null;
};

/* ------------------------------------------------------------------ *
 * The deadline
 * ------------------------------------------------------------------ */

describe('the clock is the server\'s', () => {
  it('deadline is createdAt + the configured minutes', () => {
    const created = new Date('2026-08-17T10:00:15.000Z');
    const due = deadlineFrom(created);
    assert.equal(
      due.getTime() - created.getTime(),
      config.booking.expiryMinutes * 60 * 1000,
    );
  });

  it('defaults to three minutes', () => {
    assert.equal(config.booking.expiryMinutes, 3);
  });

  it('every read carries the server clock, so a wrong phone clock cannot lie', async () => {
    const property = await makeProperty();
    const request = await makeRequest(property);
    const view = request.toPublic();

    assert.ok(view.serverNow, 'serverNow is sent');
    assert.ok(view.secondsRemaining > 0 && view.secondsRemaining <= 180);
  });

  it('secondsRemaining floors at zero rather than going negative', async () => {
    const property = await makeProperty();
    const request = await makeRequest(property, { expiresAt: new Date(Date.now() - 60_000) });
    assert.equal(request.toPublic().secondsRemaining, 0);
  });
});

/* ------------------------------------------------------------------ *
 * Accept
 * ------------------------------------------------------------------ */

describe('accept', () => {
  it('confirms the request and takes exactly one bed', async () => {
    const owner = await makeOwner();
    const property = await makeProperty();
    const request = await makeRequest(property);

    const { request: accepted } = await accept(request._id, owner);

    assert.equal(accepted.status, 'confirmed');
    assert.ok(accepted.decidedAt);
    assert.equal(accepted.decidedBy, 'par_owner');
    assert.equal(await bedsFree(property), 5);
  });

  it('refuses a request belonging to a different owner, as a 404', async () => {
    await makeOwner();
    const intruder = await makeOwner(OTHER_OWNER_PHONE, 'par_intruder');
    const property = await makeProperty();
    const request = await makeRequest(property);

    /* 404 rather than 403 on purpose: a 403 confirms the request exists, and
       an id would become a way to discover whose requests are whose. */
    const error = await failsWith('NOT_FOUND', () => accept(request._id, intruder));
    assert.equal(error.status, 404);

    assert.equal(await bedsFree(property), 6, 'no bed taken by a failed accept');
  });

  it('refuses after the deadline, and says the request expired', async () => {
    const owner = await makeOwner();
    const property = await makeProperty();
    const request = await makeRequest(property, { expiresAt: new Date(Date.now() - 1000) });

    await failsWith('REQUEST_EXPIRED', () => accept(request._id, owner));
    assert.equal(await bedsFree(property), 6, 'the bed was given back');
  });

  it('refuses when the last bed has already gone, without changing the request', async () => {
    const owner = await makeOwner();
    const property = await makeProperty(1);          // one bed
    const first = await makeRequest(property);
    const second = await makeRequest(property, { customerId: 'cus_other' });

    await accept(first._id, owner);
    await failsWith('INVENTORY_GONE', () => accept(second._id, owner));

    const stillPending = await VisitRequest.findById(second._id).lean();
    assert.equal(stillPending.status, 'pending_owner', 'a failed accept does not decide the request');
  });

  it('a second tap is refused and takes no second bed', async () => {
    const owner = await makeOwner();
    const property = await makeProperty();
    const request = await makeRequest(property);

    await accept(request._id, owner);
    await failsWith('ALREADY_ACCEPTED', () => accept(request._id, owner));

    assert.equal(await bedsFree(property), 5, 'one bed, not two');
  });

  it('FIVE simultaneous taps produce one acceptance and one bed', async () => {
    const owner = await makeOwner();
    const property = await makeProperty();
    const request = await makeRequest(property);

    const results = await race(5, () => accept(request._id, owner));
    const won = results.filter(Boolean);

    assert.equal(won.length, 1, 'exactly one tap wins');
    assert.equal(await bedsFree(property), 5, 'exactly one bed leaves the pool');
  });

  it('a request with no share type is acceptable and moves no counter', async () => {
    const owner = await makeOwner();
    const property = await makeProperty();
    const request = await makeRequest(property);
    await VisitRequest.updateOne({ _id: request._id }, { $set: { shareTypeId: null } });

    const { request: accepted } = await accept(request._id, owner);
    assert.equal(accepted.status, 'confirmed');
    assert.equal(await bedsFree(property), 6, 'nothing to claim, nothing claimed');
  });
});

/* ------------------------------------------------------------------ *
 * Decline
 * ------------------------------------------------------------------ */

describe('decline', () => {
  it('declines and frees nothing, because nothing was taken', async () => {
    const owner = await makeOwner();
    const property = await makeProperty();
    const request = await makeRequest(property);

    const declined = await decline(request._id, owner, { note: 'Dates unavailable' });

    assert.equal(declined.status, 'declined');
    assert.equal(declined.decisionReason, 'OWNER_DECLINED');
    assert.equal(declined.declineNote, 'Dates unavailable');
    assert.equal(await bedsFree(property), 6);
  });

  it('cannot decline something already accepted', async () => {
    const owner = await makeOwner();
    const property = await makeProperty();
    const request = await makeRequest(property);

    await accept(request._id, owner);
    await failsWith('ALREADY_ACCEPTED', () => decline(request._id, owner));
  });

  it('another owner cannot decline it either', async () => {
    await makeOwner();
    const intruder = await makeOwner(OTHER_OWNER_PHONE, 'par_intruder');
    const property = await makeProperty();
    const request = await makeRequest(property);

    await failsWith('NOT_FOUND', () => decline(request._id, intruder));
  });
});

/* ------------------------------------------------------------------ *
 * Withdraw
 * ------------------------------------------------------------------ */

describe('withdraw', () => {
  it('cancels a pending request', async () => {
    const student = await makeStudent();
    const property = await makeProperty();
    const request = await makeRequest(property);

    const cancelled = await withdraw(request._id, student);

    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.cancelledBy, 'student');
    assert.equal(cancelled.decisionReason, 'STUDENT_WITHDREW');
    assert.equal(cancelled.withdrawals, 1);
  });

  it('another student cannot withdraw it, as a 404', async () => {
    await makeStudent();
    const other = await makeStudent('cus_other', '+919222222222');
    const property = await makeProperty();
    const request = await makeRequest(property);

    const error = await failsWith('NOT_FOUND', () => withdraw(request._id, other));
    assert.equal(error.status, 404);
    assert.equal((await VisitRequest.findById(request._id)).status, 'pending_owner');
  });

  it('withdrawing twice is refused — the limit needs no counter to enforce it', async () => {
    const student = await makeStudent();
    const property = await makeProperty();
    const request = await makeRequest(property);

    await withdraw(request._id, student);
    await failsWith('REQUEST_CANCELLED', () => withdraw(request._id, student));

    const doc = await VisitRequest.findById(request._id).lean();
    assert.equal(doc.withdrawals, 1, 'the count did not move on the failed attempt');
  });

  it('cannot withdraw one the owner already accepted', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    const request = await makeRequest(property);

    await accept(request._id, owner);
    await failsWith('ALREADY_ACCEPTED', () => withdraw(request._id, student));
  });

  it('THREE simultaneous withdrawals cancel once', async () => {
    const student = await makeStudent();
    const property = await makeProperty();
    const request = await makeRequest(property);

    const results = await race(3, () => withdraw(request._id, student));

    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await VisitRequest.findById(request._id).lean()).withdrawals, 1);
  });
});

/* ------------------------------------------------------------------ *
 * The races — the reason this file exists
 * ------------------------------------------------------------------ */

describe('races — exactly one transition may commit', () => {
  it('accept versus withdraw: one wins, and the loser is told which', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    const request = await makeRequest(property);

    const [acceptResult, withdrawResult] = await Promise.allSettled([
      accept(request._id, owner),
      withdraw(request._id, student),
    ]);

    const wins = [acceptResult, withdrawResult].filter((r) => r.status === 'fulfilled');
    assert.equal(wins.length, 1, 'never both');

    const doc = await VisitRequest.findById(request._id).lean();

    if (acceptResult.status === 'fulfilled') {
      assert.equal(doc.status, 'confirmed');
      assert.equal(withdrawResult.reason.code, 'ALREADY_ACCEPTED');
      assert.equal(await bedsFree(property), 5);
    } else {
      assert.equal(doc.status, 'cancelled');
      assert.equal(acceptResult.reason.code, 'REQUEST_CANCELLED');
      assert.equal(await bedsFree(property), 6, 'a lost accept gives its bed back');
    }
  });

  it('accept versus expiry at the deadline: one wins, never both', async () => {
    const owner = await makeOwner();
    const property = await makeProperty();

    /* Expiring in a few milliseconds, so the owner's tap and the worker's
       tick genuinely contend rather than one obviously preceding the other. */
    const request = await makeRequest(property, { expiresAt: new Date(Date.now() + 15) });
    await new Promise((resolve) => { setTimeout(resolve, 14); });

    const [acceptResult, expireResult] = await Promise.allSettled([
      accept(request._id, owner),
      expireDue(),
    ]);

    const doc = await VisitRequest.findById(request._id).lean();
    const expiredIds = expireResult.status === 'fulfilled'
      ? expireResult.value.map((r) => String(r._id))
      : [];

    if (acceptResult.status === 'fulfilled') {
      assert.equal(doc.status, 'confirmed');
      assert.equal(expiredIds.length, 0, 'the worker must not report expiring an accepted request');
      assert.equal(await bedsFree(property), 5);
    } else {
      assert.equal(doc.status, 'expired');
      assert.equal(acceptResult.reason.code, 'REQUEST_EXPIRED');
      assert.equal(await bedsFree(property), 6, 'a lost accept gives its bed back');
    }
  });

  it('decline versus withdraw: one wins', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    const request = await makeRequest(property);

    const results = await Promise.allSettled([
      decline(request._id, owner),
      withdraw(request._id, student),
    ]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const doc = await VisitRequest.findById(request._id).lean();
    assert.ok(['declined', 'cancelled'].includes(doc.status));
  });

  it('two students racing for one bed: one confirmed, one refused, one bed gone', async () => {
    const owner = await makeOwner();
    const property = await makeProperty(1);          // a single bed
    const a = await makeRequest(property, { customerId: 'cus_a' });
    const b = await makeRequest(property, { customerId: 'cus_b' });

    const results = await Promise.allSettled([
      accept(a._id, owner),
      accept(b._id, owner),
    ]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'one acceptance');
    assert.equal(await bedsFree(property), 0);

    const loser = results.find((r) => r.status === 'rejected');
    assert.equal(loser.reason.code, 'INVENTORY_GONE');

    /* Both rows must be accounted for: one confirmed, one still pending until
       the auto-decline sweeps it. Neither may be silently lost. */
    const statuses = (await VisitRequest.find({}).lean()).map((r) => r.status).sort();
    assert.deepEqual(statuses, ['confirmed', 'pending_owner']);
  });

  it('two students, two beds: both confirmed, no contention', async () => {
    const owner = await makeOwner();
    const property = await makeProperty(2);
    const a = await makeRequest(property, { customerId: 'cus_a' });
    const b = await makeRequest(property, { customerId: 'cus_b' });

    const results = await Promise.allSettled([accept(a._id, owner), accept(b._id, owner)]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2, 'both accepted');
    assert.equal(await bedsFree(property), 0);
  });
});

/* ------------------------------------------------------------------ *
 * Expiry
 * ------------------------------------------------------------------ */

describe('expiry', () => {
  it('expires only what is actually overdue', async () => {
    const property = await makeProperty();
    const overdue = await makeRequest(property, { expiresAt: new Date(Date.now() - 1000) });
    const live = await makeRequest(property, { customerId: 'cus_b' });

    const expired = await expireDue();

    assert.equal(expired.length, 1);
    assert.equal(String(expired[0]._id), String(overdue._id));
    assert.equal((await VisitRequest.findById(live._id).lean()).status, 'pending_owner');
  });

  it('is idempotent — a second pass reports nothing, so nothing is notified twice', async () => {
    const property = await makeProperty();
    await makeRequest(property, { expiresAt: new Date(Date.now() - 1000) });

    assert.equal((await expireDue()).length, 1);
    assert.equal((await expireDue()).length, 0, 'the second run has nothing to report');
    assert.equal((await expireDue()).length, 0);
  });

  it('two workers running at once expire each row once', async () => {
    const property = await makeProperty();
    await makeRequest(property, { expiresAt: new Date(Date.now() - 1000), customerId: 'cus_a' });
    await makeRequest(property, { expiresAt: new Date(Date.now() - 1000), customerId: 'cus_b' });

    /* Two instances of the process, both ticking. Only one may claim each
       row, or the student gets two "your request expired" notifications. */
    const [runA, runB] = await Promise.all([expireDue(), expireDue()]);

    assert.equal(runA.length + runB.length, 2, 'two rows, two claims, no duplicates');
  });

  it('leaves the web channel alone — those owners have 24 hours', async () => {
    const property = await makeProperty();
    await VisitRequest.create({
      channel: 'web',
      listingId: String(property._id),
      propertyName: property.name,
      ownerMobile: OWNER_PHONE,
      customer: { name: 'Guest', phone: '+919333333333', email: 'g@example.com' },
      status: 'pending_owner',
      expiresAt: new Date(Date.now() - 1000),
    });

    assert.equal((await expireDue()).length, 0, 'the app worker must not touch web requests');
  });

  it('a read settles an overdue row without notifying', async () => {
    const property = await makeProperty();
    const request = await makeRequest(property, { expiresAt: new Date(Date.now() - 1000) });

    const settled = await settleIfExpired(request);
    assert.equal(settled.status, 'expired');

    /* And the worker then has nothing to report — so the read did not cause a
       duplicate notification, it just stopped a screen showing a dead wait. */
    assert.equal((await expireDue()).length, 0);
  });
});

/* ------------------------------------------------------------------ *
 * The losers of an inventory race
 * ------------------------------------------------------------------ */

describe('auto-decline when the last bed goes', () => {
  it('declines the stranded requests with their own reason', async () => {
    const owner = await makeOwner();
    const property = await makeProperty(1);
    const winner = await makeRequest(property, { customerId: 'cus_a' });
    const loser = await makeRequest(property, { customerId: 'cus_b' });

    await accept(winner._id, owner);
    const declined = await declineForLostInventory(`${property._id}:2-sharing`, { exceptId: winner._id });

    assert.equal(declined.length, 1);
    assert.equal(String(declined[0]._id), String(loser._id));
    assert.equal(declined[0].status, 'declined');

    /* NOT `OWNER_DECLINED`. Nobody rejected this student — the bed went while
       they waited, and the app has to be able to say so. */
    assert.equal(declined[0].decisionReason, 'INVENTORY_TAKEN');
  });

  it('never touches the request that won', async () => {
    const owner = await makeOwner();
    const property = await makeProperty(1);
    const winner = await makeRequest(property, { customerId: 'cus_a' });

    await accept(winner._id, owner);
    await declineForLostInventory(`${property._id}:2-sharing`, { exceptId: winner._id });

    assert.equal((await VisitRequest.findById(winner._id).lean()).status, 'confirmed');
  });

  it('is idempotent', async () => {
    const owner = await makeOwner();
    const property = await makeProperty(1);
    const winner = await makeRequest(property, { customerId: 'cus_a' });
    await makeRequest(property, { customerId: 'cus_b' });

    await accept(winner._id, owner);
    const shareTypeId = `${property._id}:2-sharing`;

    assert.equal((await declineForLostInventory(shareTypeId, { exceptId: winner._id })).length, 1);
    assert.equal((await declineForLostInventory(shareTypeId, { exceptId: winner._id })).length, 0);
  });
});

/* ------------------------------------------------------------------ *
 * What each side is allowed to see
 * ------------------------------------------------------------------ */

describe('projections', () => {
  it('the student\'s view carries no owner phone number', async () => {
    const property = await makeProperty();
    const request = await makeRequest(property);
    const view = request.toPublic();

    assert.equal(JSON.stringify(view).includes(OWNER_PHONE), false, 'the owner\'s number must not leak');
    assert.equal(view.channel, 'app');
    assert.ok(view.expiresAt);
  });

  it('the owner\'s view carries who is asking, and whether they may still act', async () => {
    const property = await makeProperty();
    const request = await makeRequest(property);
    const view = request.toOwner();

    assert.equal(view.customer.name, 'Priya');
    assert.equal(view.customer.phone, '+919111111111');
    assert.equal(view.actionable, true);
  });

  it('a terminal request is never actionable', async () => {
    const owner = await makeOwner();
    const property = await makeProperty();
    const request = await makeRequest(property);

    const { request: accepted } = await accept(request._id, owner);
    assert.equal(accepted.toOwner().actionable, false, 'the buttons must die with the status');
  });

  it('an overdue request is not actionable even before the worker reaches it', async () => {
    const property = await makeProperty();
    const request = await makeRequest(property, { expiresAt: new Date(Date.now() - 1000) });

    assert.equal(request.status, 'pending_owner', 'the row still says pending');
    assert.equal(request.toOwner().actionable, false, 'but the clock has already decided');
  });
});

/* ------------------------------------------------------------------ *
 * The countdown a terminal request reports
 * ------------------------------------------------------------------ */

describe('a finished request reports no time left', () => {
  it('cancelled reads zero, not the time that was left when it ended', async () => {
    const student = await makeStudent();
    const property = await makeProperty();
    const request = await makeRequest(property);

    /* Withdrawn a second after it was sent, so `expiresAt` is still nearly
       three minutes away. Computing the countdown from that alone had both
       apps rendering a live timer on a request nobody was waiting for. */
    const cancelled = await withdraw(request._id, student);

    assert.equal(cancelled.toPublic().secondsRemaining, 0);
    assert.equal(cancelled.toOwner().secondsRemaining, 0);
    assert.equal(cancelled.toOwner().actionable, false);
  });

  it('so do accepted, declined and expired', async () => {
    const owner = await makeOwner();
    const property = await makeProperty();

    const accepted = await makeRequest(property, { customerId: 'cus_a' });
    const declinedOne = await makeRequest(property, { customerId: 'cus_b' });
    const overdue = await makeRequest(property, {
      customerId: 'cus_c', expiresAt: new Date(Date.now() - 1000),
    });

    const { request: yes } = await accept(accepted._id, owner);
    const no = await decline(declinedOne._id, owner);
    const [gone] = await expireDue();

    for (const [label, doc] of [['confirmed', yes], ['declined', no], ['expired', gone]]) {
      assert.equal(doc.toPublic().secondsRemaining, 0, `${label} reports time remaining`);
    }
  });

  it('but a live one still counts down', async () => {
    const property = await makeProperty();
    const request = await makeRequest(property);
    assert.ok(request.toPublic().secondsRemaining > 0);
  });
});

/* ------------------------------------------------------------------ *
 * The stages the waiting screen draws
 * ------------------------------------------------------------------ */

describe('stages are recorded, never inferred', () => {
  it('a fresh request has neither stamp', async () => {
    const property = await makeProperty();
    const request = await makeRequest(property);
    const view = request.toPublic();

    /* Null means "has not happened". The screen must be able to tell that
       from "we do not know", which is why neither is defaulted to a date. */
    assert.equal(view.notifiedAt, null);
    assert.equal(view.seenAt, null);
  });

  it('notifying the owner stamps notifiedAt, once', async () => {
    const property = await makeProperty();
    const request = await makeRequest(property);
    const notifier = require('../src/modules/notifications/stayRequest.notifier');

    await notifier.notifyOwnerOfNewRequest(request);
    const first = (await VisitRequest.findById(request._id).lean()).notifiedAt;
    assert.ok(first, 'notifiedAt was never stamped');

    /* A retry must not move it — the moment the owner was reached does not
       change because something was sent again. */
    await notifier.notifyOwnerOfNewRequest(request);
    const second = (await VisitRequest.findById(request._id).lean()).notifiedAt;
    assert.equal(second.getTime(), first.getTime());
  });

  it('seenAt is only ever stamped while the request is still live', async () => {
    const owner = await makeOwner();
    const property = await makeProperty();
    const request = await makeRequest(property);

    /* Modelled on what the detail route does: stamp once, and only on a
       pending request. An owner reading their own history a week later must
       not write "seen" onto a wait that ended. */
    const stampSeen = async (doc) => {
      if (doc.channel !== 'app' || doc.status !== 'pending_owner' || doc.seenAt) return;
      await VisitRequest.updateOne({ _id: doc._id, seenAt: null }, { $set: { seenAt: new Date() } });
    };

    await stampSeen(await VisitRequest.findById(request._id));
    const seen = (await VisitRequest.findById(request._id).lean()).seenAt;
    assert.ok(seen, 'seenAt was never stamped');

    await accept(request._id, owner);
    await stampSeen(await VisitRequest.findById(request._id));

    const after = (await VisitRequest.findById(request._id).lean()).seenAt;
    assert.equal(after.getTime(), seen.getTime(), 'seenAt moved after the request was answered');
  });

  it('both reach the student and the owner', async () => {
    const property = await makeProperty();
    const request = await makeRequest(property);
    await VisitRequest.updateOne(
      { _id: request._id },
      { $set: { notifiedAt: new Date(), seenAt: new Date() } },
    );

    const fresh = await VisitRequest.findById(request._id);
    assert.ok(fresh.toPublic().notifiedAt, 'the student cannot draw the notified stage');
    assert.ok(fresh.toPublic().seenAt, 'the student cannot draw the seen stage');
    assert.ok(fresh.toOwner().seenAt, 'the owner\'s own history has no seenAt');
  });
});
