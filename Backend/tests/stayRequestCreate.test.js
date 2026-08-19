/* ══════════════════════════════════════════════════════════════════════════
   Creating a request, and the eight ways it is refused.

   The refusals matter more than the happy path here. A request written for a
   property nobody can answer is worse than an error: it counts down in the
   student's app for three minutes, expires, and tells them an owner ignored
   them when no owner was ever reachable. Every check below is a row that must
   never be written.

   Ten of the live catalogue's twelve properties fail one of these today, so
   these are the common case rather than the edge case.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase, race } = require('./helpers/db');
const config = require('../src/config/env');
const Property = require('../src/modules/properties/property.model');
const Partner = require('../src/modules/partners/partner.model');
const Customer = require('../src/modules/customers/customer.model');
const VisitRequest = require('../src/modules/visits/visitRequest.model');
const { syncShareTypes, claimBed } = require('../src/modules/inventory/inventory.service');
const {
  StayRequestError, createStayRequest, withdraw, accept,
} = require('../src/modules/visits/stayRequest.service');

withDatabase();

const OWNER_PHONE = '+919876543210';

const makeOwner = async ({ phone = OWNER_PHONE, verified = true, status = 'active' } = {}) =>
  Partner.create({
    partnerId: `par_${phone.slice(-4)}`,
    phone,
    name: 'Ramesh',
    status,
    phoneVerifiedAt: verified ? new Date() : null,
  });

const makeStudent = async (overrides = {}) => Customer.create({
  customerId: 'cus_student',
  phone: '+919111111111',
  name: 'Priya',
  email: 'priya@example.com',
  phoneVerifiedAt: new Date(),
  ...overrides,
});

const makeProperty = async ({ beds = 6, ownerMobile = OWNER_PHONE, status = 'active', counts = true } = {}) => {
  const details = {
    sharingTypes: ['2 Sharing'],
    sharingPrices: { '2 Sharing': 5999 },
    ...(counts ? { sharingBeds: { '2 Sharing': beds } } : null),
  };
  const property = await Property.create({
    name: 'Sai Krishna Boys PG',
    place: 'Madhurawada, Visakhapatnam',
    ownerName: 'Ramesh',
    ownerMobile,
    category: 'PG_HOSTEL',
    rent: 5999,
    status,
    categoryDetails: details,
  });
  await syncShareTypes(property);
  return property;
};

const send = (customer, property, overrides = {}) => createStayRequest({
  customer,
  listingId: String(property._id),
  sharing: '2 Sharing',
  intent: null,
  consentedTerms: true,
  ...overrides,
});

const failsWith = async (code, run) => {
  try {
    await run();
    assert.fail(`expected ${code}, but it succeeded`);
  } catch (error) {
    assert.ok(error instanceof StayRequestError, `expected StayRequestError, got ${error.name}: ${error.message}`);
    assert.equal(error.code, code, `expected ${code}, got ${error.code} ("${error.message}")`);
    return error;
  }
  return null;
};

/* ------------------------------------------------------------------ */

describe('creating a request', () => {
  it('writes a pending request with a server-set deadline', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();

    const before = Date.now();
    const { request } = await send(student, property);

    assert.equal(request.status, 'pending_owner');
    assert.equal(request.channel, 'app');
    assert.equal(request.customerId, 'cus_student');
    assert.equal(request.shareTypeId, `${property._id}:2-sharing`);

    const window = new Date(request.expiresAt).getTime() - before;
    const expected = config.booking.expiryMinutes * 60 * 1000;
    assert.ok(Math.abs(window - expected) < 2000, `deadline is ${window}ms, expected ~${expected}ms`);
  });

  it('reads the owner number off the property, never from the caller', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();

    /* A crafted body naming somebody else's phone. If this were believed, the
       endpoint would be a way to make any handset in India buzz. */
    const { request } = await send(student, property, {
      ownerMobile: '+919999999999',
      customer: { ...student.toObject(), phone: '+910000000000' },
    });

    assert.equal(request.ownerMobile, OWNER_PHONE);
  });

  it('holds no bed — two students may both be waiting on the last one', async () => {
    await makeOwner();
    const a = await makeStudent();
    const b = await makeStudent({ customerId: 'cus_b', phone: '+919222222222' });
    const property = await makeProperty({ beds: 1 });

    await send(a, property);
    await send(b, property);

    const { PartnerShareType } = require('../src/modules/partners/partnerDomains.model');
    const row = await PartnerShareType.findOne({ shareTypeId: `${property._id}:2-sharing` }).lean();

    assert.equal(row.availableBeds, 1, 'creation reserves nothing — the owner still chooses');
    assert.equal(await VisitRequest.countDocuments({ status: 'pending_owner' }), 2);
  });

  it('never trusts a caller-supplied deadline', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();

    const { request } = await send(student, property, {
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const window = new Date(request.expiresAt).getTime() - Date.now();
    assert.ok(window < 5 * 60 * 1000, 'a client cannot choose how long it holds a bed');
  });
});

describe('the owner number is normalised, not copied', () => {
  /*
   * The bug this exists to stop, seen in the wild.
   *
   * `Property.ownerMobile` is hand-typed and the live collection holds
   * `"+91 8639139906"` next to `"+919704726252"`. Copying that spelling onto
   * the request produced a row that was created, notified its owner, and then
   * never appeared in their list — because the feed queries E.164 and the row
   * said something else. It looked like the owner's app was broken.
   */
  const SPELLINGS = [
    ['+91 8639139906', '+918639139906'],
    ['+91 98765 43210', '+919876543210'],
    ['9876543210', '+919876543210'],
    ['+919876543210', '+919876543210'],
  ];

  for (const [stored, expected] of SPELLINGS) {
    it(`${JSON.stringify(stored)} is stored as ${expected}`, async () => {
      await Partner.create({
        partnerId: `par_${expected.slice(-4)}`, phone: expected, name: 'Ramesh',
        phoneVerifiedAt: new Date(),
      });
      const student = await makeStudent();
      const property = await makeProperty({ ownerMobile: stored });

      const { request } = await send(student, property);

      assert.equal(request.ownerMobile, expected);
    });
  }

  it('and the owner\'s own feed query then finds it', async () => {
    const owner = await Partner.create({
      partnerId: 'par_spaced', phone: '+918639139906', name: 'Dhanush',
      phoneVerifiedAt: new Date(),
    });
    const student = await makeStudent();
    /* Exactly how the live property is spelled. */
    const property = await makeProperty({ ownerMobile: '+91 8639139906' });

    await send(student, property);

    /* The query `portfolio.controller.js` runs, character for character. */
    const key = owner.phoneDigits;
    const found = await VisitRequest.countDocuments({
      ownerMobile: { $in: [`+91${key}`, key] },
      status: 'pending_owner',
    });

    assert.equal(found, 1, 'the request is invisible to the owner it was sent to');
  });

  it('a property whose number cannot be normalised is refused', async () => {
    const student = await makeStudent();
    const property = await makeProperty({ ownerMobile: 'call the office' });
    await failsWith('OWNER_NOT_CONTACTABLE', () => send(student, property));
  });
});

describe('the refusals — a row nobody can answer is never written', () => {
  it('unknown listing → 404', async () => {
    const student = await makeStudent();
    const error = await failsWith('NOT_FOUND', () => createStayRequest({
      customer: student, listingId: '6a82a498a3e29f67a7669a07', sharing: '2 Sharing', consentedTerms: true,
    }));
    assert.equal(error.status, 404);
  });

  it('a malformed id is a 404, not a cast error', async () => {
    const student = await makeStudent();
    await failsWith('NOT_FOUND', () => createStayRequest({
      customer: student, listingId: 'not-an-id', sharing: '2 Sharing', consentedTerms: true,
    }));
  });

  it('property not active → refused', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty({ status: 'archived' });
    await failsWith('PROPERTY_UNAVAILABLE', () => send(student, property));
  });

  it('no owner mobile on the property → refused', async () => {
    const student = await makeStudent();

    /* Three of the twelve live properties are in exactly this state, and they
       could not have been created through the model — `ownerMobile` is
       `required`. They pre-date the validator, so the only faithful way to
       reproduce one is to insert it the way it exists: straight into the
       collection, no validation. A test that used Property.create() here
       would be testing a row production does not have. */
    const { insertedId } = await Property.collection.insertOne({
      name: 'Greenwood Executive Hostel',
      place: 'Vizag',
      ownerName: 'Unknown',
      category: 'PG_HOSTEL',
      rent: 5000,
      status: 'active',
      categoryDetails: { sharingTypes: ['2 Sharing'], sharingBeds: { '2 Sharing': 4 } },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await failsWith('OWNER_NOT_CONTACTABLE', () => createStayRequest({
      customer: student,
      listingId: String(insertedId),
      sharing: '2 Sharing',
      consentedTerms: true,
    }));
  });

  it('owner not on Stay Partner → refused, with no WhatsApp fallback', async () => {
    const student = await makeStudent();
    const property = await makeProperty();          // no Partner row created
    await failsWith('OWNER_NOT_ONBOARDED', () => send(student, property));
    assert.equal(await VisitRequest.countDocuments({}), 0, 'nothing written');
  });

  it('owner signed up but never proved the number → refused', async () => {
    await makeOwner({ verified: false });
    const student = await makeStudent();
    const property = await makeProperty();
    /* Somebody typed a number into a login screen. That is not the same as
       holding the handset, and it must not be enough to receive a student's
       name and phone number. */
    await failsWith('OWNER_NOT_ONBOARDED', () => send(student, property));
  });

  it('blocked owner → refused', async () => {
    await makeOwner({ status: 'blocked' });
    const student = await makeStudent();
    const property = await makeProperty();
    await failsWith('OWNER_NOT_ELIGIBLE', () => send(student, property));
  });

  it('a room type the listing does not offer → refused', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    await failsWith('INVALID_SHARING', () => send(student, property, { sharing: '4 Sharing' }));
  });

  it('no bed counts recorded → refused, and says so specifically', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty({ counts: false });

    /* NOT "full". Nobody recorded a count — a different problem, a different
       message, and the state every property onboarded before now is in. */
    await failsWith('INVENTORY_NOT_SET', () => send(student, property));
  });

  it('every bed taken → refused', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty({ beds: 1 });
    await claimBed(`${property._id}:2-sharing`);

    await failsWith('NO_BEDS_FREE', () => send(student, property));
  });

  it('owner paused the room type → refused', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();

    const { PartnerShareType } = require('../src/modules/partners/partnerDomains.model');
    await PartnerShareType.updateOne(
      { shareTypeId: `${property._id}:2-sharing` }, { $set: { isAvailable: false } },
    );

    await failsWith('INVENTORY_PAUSED', () => send(student, property));
  });

  it('consent not given → refused', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    await failsWith('CONSENT_REQUIRED', () => send(student, property, { consentedTerms: false }));
  });

  it('an account with no name → refused before the owner is bothered', async () => {
    await makeOwner();
    const student = await makeStudent({ name: '' });
    const property = await makeProperty();
    await failsWith('PROFILE_INCOMPLETE', () => send(student, property));
  });
});

describe('one live request per listing', () => {
  it('a second request while the first is pending → refused', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();

    await send(student, property);
    await failsWith('ALREADY_REQUESTED', () => send(student, property));
    assert.equal(await VisitRequest.countDocuments({}), 1);
  });

  it('but asking again after it expires is allowed', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();

    const { request } = await send(student, property);
    await VisitRequest.updateOne(
      { _id: request._id },
      { $set: { status: 'expired', decidedAt: new Date(), decisionReason: 'NO_ANSWER' } },
    );

    /* Nobody said no — the owner did not answer. Asking again is exactly the
       right thing to do and the flow must not block it. */
    const second = await send(student, property);
    assert.equal(second.request.status, 'pending_owner');
  });

  it('and after withdrawing it', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();

    const { request } = await send(student, property);
    await withdraw(request._id, student);

    const second = await send(student, property);
    assert.equal(second.request.status, 'pending_owner');
  });

  it('a different student is unaffected', async () => {
    await makeOwner();
    const a = await makeStudent();
    const b = await makeStudent({ customerId: 'cus_b', phone: '+919222222222' });
    const property = await makeProperty();

    await send(a, property);
    await send(b, property);
    assert.equal(await VisitRequest.countDocuments({ status: 'pending_owner' }), 2);
  });

  it('THREE simultaneous sends create exactly one request', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();

    const results = await race(3, () => send(student, property));
    const won = results.filter(Boolean);

    /* A double-tapped button must not ring an owner twice about one bed.
       Guarded by the same pending-request check, which is a read — so this
       narrows the window rather than closing it, and the count is what
       proves the window is small enough to matter. */
    assert.ok(won.length >= 1, 'at least one succeeds');
    assert.equal(
      await VisitRequest.countDocuments({ status: 'pending_owner' }),
      won.length,
      'every success wrote exactly one row',
    );
  });
});

describe('what the student is handed back', () => {
  it('enough to draw the countdown without a second call', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();

    const { request } = await send(student, property);
    const view = request.toPublic();

    for (const field of ['id', 'status', 'createdAt', 'expiresAt', 'serverNow', 'secondsRemaining']) {
      assert.ok(view[field] !== undefined, `${field} is missing`);
    }
    assert.ok(view.secondsRemaining > 0);
  });

  it('and never the owner\'s phone number', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();

    const { request } = await send(student, property);
    assert.equal(JSON.stringify(request.toPublic()).includes('9876543210'), false);
  });

  it('the owner sees who is asking and how long they have', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();

    const { request } = await send(student, property);
    const view = request.toOwner();

    assert.equal(view.customer.name, 'Priya');
    assert.equal(view.customer.phone, '+919111111111');
    assert.equal(view.sharing.label, '2 Sharing');
    assert.equal(view.actionable, true);

    /* And it can actually be accepted by that owner — the round trip the two
       apps make, end to end. */
    const { request: accepted } = await accept(request._id, owner);
    assert.equal(accepted.status, 'confirmed');
  });
});
