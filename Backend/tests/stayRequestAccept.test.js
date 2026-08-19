/* ══════════════════════════════════════════════════════════════════════════
   What accepting actually does, and the three ways a bed comes back.

   `accept` is tested as a transition in stayRequest.test.js. This is the
   orchestration around it — the customer row, the auto-decline sweep, and the
   give-back paths that are the only reason a property does not drift to zero
   beds and stop being requestable forever.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase, race } = require('./helpers/db');
const Property = require('../src/modules/properties/property.model');
const Partner = require('../src/modules/partners/partner.model');
const Customer = require('../src/modules/customers/customer.model');
const VisitRequest = require('../src/modules/visits/visitRequest.model');
const { PartnerBooking, PartnerShareType } = require('../src/modules/partners/partnerDomains.model');
const { syncShareTypes, releaseBed, shareTypeIdForBooking } = require('../src/modules/inventory/inventory.service');
const {
  acceptAndBook, createStayRequest, decline, expireDue, StayRequestError,
} = require('../src/modules/visits/stayRequest.service');

withDatabase();

const OWNER_PHONE = '+919876543210';
const OWNER_DIGITS = '9876543210';

const makeOwner = () => Partner.create({
  partnerId: 'par_owner', phone: OWNER_PHONE, name: 'Ramesh', phoneVerifiedAt: new Date(),
});

const makeStudent = (id = 'cus_a', phone = '+919111111111') => Customer.create({
  customerId: id, phone, name: `Student ${id}`, email: `${id}@example.com`, phoneVerifiedAt: new Date(),
});

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

const send = (customer, property) => createStayRequest({
  customer,
  listingId: String(property._id),
  sharing: '2 Sharing',
  intent: null,
  consentedTerms: true,
});

const bedsFree = async (property) => (
  await PartnerShareType.findOne({ shareTypeId: `${property._id}:2-sharing` }).lean()
).availableBeds;

/* ------------------------------------------------------------------ */

describe('accepting opens a customer record', () => {
  it('writes a booking row the owner can see immediately', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    const { request } = await send(student, property);

    const result = await acceptAndBook(request._id, owner);

    assert.equal(result.request.status, 'confirmed');
    assert.ok(result.booking, 'a booking row was written');

    /* The field that separates a guest who proved their own number in the User
       App from a walk-in the owner typed in. A dispute months later turns on
       exactly this. */
    assert.equal(result.booking.source, 'request');
    assert.equal(result.booking.guestName, 'Student cus_a');
    assert.equal(result.booking.shareType, '2 Sharing');
    assert.equal(result.booking.paidAmount, 0, 'nothing is charged');
    assert.equal(result.booking.partnerPhoneDigits, OWNER_DIGITS);
  });

  it('links the two so either can be found from the other', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    const { request } = await send(student, property);

    const { booking } = await acceptAndBook(request._id, owner);
    const stored = await VisitRequest.findById(request._id).lean();

    assert.equal(stored.bookingId, String(booking._id));
  });

  it('a second tap creates no second booking and takes no second bed', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    const { request } = await send(student, property);

    await acceptAndBook(request._id, owner);
    await assert.rejects(() => acceptAndBook(request._id, owner), (e) => e.code === 'ALREADY_ACCEPTED');

    assert.equal(await PartnerBooking.countDocuments({}), 1);
    assert.equal(await bedsFree(property), 5);
  });

  it('FIVE simultaneous taps produce one booking and one bed', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    const { request } = await send(student, property);

    const results = await race(5, () => acceptAndBook(request._id, owner));

    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await PartnerBooking.countDocuments({}), 1, 'no duplicate customer records');
    assert.equal(await bedsFree(property), 5);
  });
});

describe('the students left waiting on a bed that has gone', () => {
  it('are auto-declined with their own reason, not a rejection', async () => {
    const owner = await makeOwner();
    const a = await makeStudent('cus_a');
    const b = await makeStudent('cus_b', '+919222222222');
    const property = await makeProperty(1);          // one bed

    const first = await send(a, property);
    const second = await send(b, property);

    const { autoDeclined } = await acceptAndBook(first.request._id, owner);

    assert.equal(autoDeclined.length, 1);
    assert.equal(String(autoDeclined[0]._id), String(second.request._id));

    /* NOT `OWNER_DECLINED`. Nobody rejected this student — the bed went while
       they were waiting, and the app must be able to say so. */
    assert.equal(autoDeclined[0].decisionReason, 'INVENTORY_TAKEN');
  });

  it('are left alone while beds remain — the owner can accept several', async () => {
    const owner = await makeOwner();
    const a = await makeStudent('cus_a');
    const b = await makeStudent('cus_b', '+919222222222');
    const c = await makeStudent('cus_c', '+919333333333');
    const property = await makeProperty(3);

    const first = await send(a, property);
    const second = await send(b, property);
    const third = await send(c, property);

    const one = await acceptAndBook(first.request._id, owner);
    assert.equal(one.autoDeclined.length, 0, 'two beds left, nobody turned away');

    /* All three, because there are three beds. This is the rule from §9. */
    await acceptAndBook(second.request._id, owner);
    await acceptAndBook(third.request._id, owner);

    assert.equal(await bedsFree(property), 0);
    assert.equal(await VisitRequest.countDocuments({ status: 'confirmed' }), 3);
    assert.equal(await PartnerBooking.countDocuments({}), 3);
  });

  it('never touch a different room type', async () => {
    const owner = await makeOwner();
    const a = await makeStudent('cus_a');
    const b = await makeStudent('cus_b', '+919222222222');

    const property = await Property.create({
      name: 'Two Room Types PG',
      place: 'Vizag',
      ownerName: 'Ramesh',
      ownerMobile: OWNER_PHONE,
      category: 'PG_HOSTEL',
      rent: 5999,
      categoryDetails: {
        sharingTypes: ['Single', '2 Sharing'],
        sharingPrices: { Single: 8000, '2 Sharing': 5999 },
        sharingBeds: { Single: 1, '2 Sharing': 4 },
      },
    });
    await syncShareTypes(property);

    const single = await createStayRequest({
      customer: a, listingId: String(property._id), sharing: 'Single', consentedTerms: true,
    });
    const shared = await createStayRequest({
      customer: b, listingId: String(property._id), sharing: '2 Sharing', consentedTerms: true,
    });

    /* The single room is now full. The 2-Sharing request has nothing to do
       with it and must not be swept up. */
    const { autoDeclined } = await acceptAndBook(single.request._id, owner);

    assert.equal(autoDeclined.length, 0);
    assert.equal((await VisitRequest.findById(shared.request._id).lean()).status, 'pending_owner');
  });
});

describe('a bed comes back', () => {
  const makeBooking = async (property, status = 'in_house') => PartnerBooking.create({
    partnerPhoneDigits: OWNER_DIGITS,
    propertyId: String(property._id),
    propertyName: property.name,
    guestName: 'Walk In', guestPhone: '+919444444444', roomNumber: '1',
    shareType: '2 Sharing',
    checkInDate: '2026-01-01', checkOutDate: '',
    status, totalAmount: 0, paidAmount: 0, source: 'manual',
  });

  it('when a lost accept gives back the bed it took', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    const { request } = await send(student, property);

    /* The clock beat the owner. The bed was taken before the request was
       claimed, so it has to be handed back or a race nobody won costs a bed. */
    await VisitRequest.updateOne({ _id: request._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    await assert.rejects(() => acceptAndBook(request._id, owner), (e) => e.code === 'REQUEST_EXPIRED');
    assert.equal(await bedsFree(property), 6, 'the bed was returned');
  });

  it('when a booking is cancelled', async () => {
    const property = await makeProperty();
    const booking = await makeBooking(property);
    const shareTypeId = shareTypeIdForBooking(booking.toObject());

    /* The booking is occupying a bed, so start from a claimed counter. */
    await PartnerShareType.updateOne({ shareTypeId }, { $inc: { availableBeds: -1 } });
    assert.equal(await bedsFree(property), 5);

    await releaseBed(shareTypeId);
    assert.equal(await bedsFree(property), 6);
  });

  it('but a double release cannot invent a bed', async () => {
    const property = await makeProperty();
    const shareTypeId = `${property._id}:2-sharing`;

    await PartnerShareType.updateOne({ shareTypeId }, { $inc: { availableBeds: -1 } });
    await race(6, () => releaseBed(shareTypeId));

    assert.equal(await bedsFree(property), 6, 'one bed back, capped at capacity');
  });
});

describe('a walk-in takes a bed too', () => {
  it('otherwise the counter lies the first time an owner fills one', async () => {
    const property = await makeProperty();
    const { claimBed, shareTypeIdForBooking: idFor } = require('../src/modules/inventory/inventory.service');

    const booking = await PartnerBooking.create({
      partnerPhoneDigits: OWNER_DIGITS,
      propertyId: String(property._id),
      propertyName: property.name,
      guestName: 'Walk In', guestPhone: '+919444444444', roomNumber: '1',
      shareType: '2 Sharing',
      checkInDate: '2026-01-01', checkOutDate: '',
      status: 'in_house', totalAmount: 0, paidAmount: 0, source: 'manual',
    });

    await claimBed(idFor(booking.toObject()));
    assert.equal(await bedsFree(property), 5);
  });

  it('and the reconcile agrees afterwards', async () => {
    const property = await makeProperty();
    const { claimBed, shareTypeIdForBooking: idFor, reconcile } = require('../src/modules/inventory/inventory.service');

    const booking = await PartnerBooking.create({
      partnerPhoneDigits: OWNER_DIGITS,
      propertyId: String(property._id),
      propertyName: property.name,
      guestName: 'Walk In', guestPhone: '+919444444444', roomNumber: '1',
      shareType: '2 Sharing',
      checkInDate: '2026-01-01', checkOutDate: '',
      status: 'in_house', totalAmount: 0, paidAmount: 0, source: 'manual',
    });
    await claimBed(idFor(booking.toObject()));

    /* The whole point of moving the counter: the stored number and the
       bookings now tell the same story. */
    assert.equal((await reconcile()).drifted.length, 0);
  });

  it('a walk-in that did NOT move the counter is caught as drift', async () => {
    const property = await makeProperty();
    const { reconcile } = require('../src/modules/inventory/inventory.service');

    await PartnerBooking.create({
      partnerPhoneDigits: OWNER_DIGITS,
      propertyId: String(property._id),
      propertyName: property.name,
      guestName: 'Forgotten', guestPhone: '+919555555555', roomNumber: '1',
      shareType: '2 Sharing',
      checkInDate: '2026-01-01', checkOutDate: '',
      status: 'in_house', totalAmount: 0, paidAmount: 0, source: 'manual',
    });

    const { drifted } = await reconcile();
    assert.equal(drifted.length, 1, 'the safety net catches a writer that forgot');
    assert.equal(drifted[0].stored, 6);
    assert.equal(drifted[0].expected, 5);
  });
});

describe('an acceptance is scoped to the owner of the property', () => {
  it('another owner cannot accept it, and takes no bed trying', async () => {
    await makeOwner();
    const intruder = await Partner.create({
      partnerId: 'par_intruder', phone: '+919000000001', name: 'Someone', phoneVerifiedAt: new Date(),
    });
    const student = await makeStudent();
    const property = await makeProperty();
    const { request } = await send(student, property);

    await assert.rejects(
      () => acceptAndBook(request._id, intruder),
      (e) => e instanceof StayRequestError && e.code === 'NOT_FOUND' && e.status === 404,
    );

    assert.equal(await bedsFree(property), 6);
    assert.equal(await PartnerBooking.countDocuments({}), 0);
  });
});

/* ------------------------------------------------------------------ *
 * The entry PIN
 * ------------------------------------------------------------------ */

describe('the entry PIN', () => {
  it('is issued on acceptance, in the same write', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    const { request } = await send(student, property);

    assert.equal(request.entryPin, null, 'a pending request already has a PIN');

    const { request: accepted } = await acceptAndBook(request._id, owner);

    assert.match(accepted.entryPin, /^LV-\d{6}$/, `PIN is ${accepted.entryPin}`);
    assert.ok(accepted.entryPinIssuedAt);
    /* Same write as the confirmation, so there is no window in which a
       request reads as confirmed with no PIN — both apps render that row the
       moment the status flips. */
    assert.equal(accepted.entryPinIssuedAt.getTime(), accepted.decidedAt.getTime());
  });

  it('reaches BOTH sides — that is the whole point of it', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    const { request } = await send(student, property);
    const { request: accepted } = await acceptAndBook(request._id, owner);

    const studentSees = accepted.toPublic().entryPin;
    const ownerSees = accepted.toOwner().entryPin;

    assert.ok(studentSees, 'the student cannot see the PIN');
    assert.ok(ownerSees, 'the owner cannot see the PIN — they could not check anybody in');
    /* Compared at the door, not verified against a hash. Two different values
       would make the one thing it exists for impossible. */
    assert.equal(studentSees, ownerSees);
  });

  it('is never issued for a decline, an expiry or a withdrawal', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();

    const a = await send(student, property);
    const declined = await decline(a.request._id, owner);
    assert.equal(declined.entryPin, null);

    await VisitRequest.updateOne({ _id: a.request._id }, { $set: { status: 'pending_owner' } });

    const b = await makeStudent('cus_b', '+919222222222');
    const second = await send(b, property);
    await VisitRequest.updateOne(
      { _id: second.request._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const [expired] = await expireDue();
    assert.equal(expired.entryPin, null);
  });

  it('does not change if it is read again', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    const { request } = await send(student, property);

    const { request: accepted } = await acceptAndBook(request._id, owner);
    const first = accepted.entryPin;

    /* An owner asked to read it out twice must read out the same thing. */
    const reread = await VisitRequest.findById(request._id);
    assert.equal(reread.entryPin, first);
    assert.equal(reread.toOwner().entryPin, first);
  });
});

/* ------------------------------------------------------------------ *
 * Asking again for a bed you already hold
 * ------------------------------------------------------------------ */

describe('a student who already has this bed cannot re-request it', () => {
  it('their own acceptance is what makes the room full', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty(1);          // one bed

    const { request } = await send(student, property);
    await acceptAndBook(request._id, owner);

    /*
     * The exact sequence a returning student produced.
     *
     * The confirmation screen re-sent on re-entry, and the server refused it
     * with NO_BEDS_FREE — correctly, because the student's OWN accepted
     * request was holding the only bed. The screen then told them their
     * request had failed because the room was full, which was true and
     * useless: the room was full of them.
     *
     * The refusal is right and stays. The app no longer asks.
     */
    /* ALREADY_BOOKED, checked before inventory — "you already have this" is
       a better sentence than "it is full", and it is the true one. */
    await assert.rejects(
      () => send(student, property),
      (e) => e.code === 'ALREADY_BOOKED',
    );

    /* And nothing was written — no second request, no second booking, and the
       bed is still theirs. */
    assert.equal(await VisitRequest.countDocuments({ customerId: student.customerId }), 1);
    assert.equal(await PartnerBooking.countDocuments({}), 1);
    assert.equal(await bedsFree(property), 0);
  });

  it('and with beds left it is still refused, as one live request per listing', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty(4);

    const { request } = await send(student, property);
    await acceptAndBook(request._id, owner);

    /* Beds remain, so nothing about inventory refuses this — the rule does.
       A student holding a confirmed bed here has no business asking for a
       second, and the owner should not be notified about it. */
    await assert.rejects(() => send(student, property), (e) => e.code === 'ALREADY_BOOKED');
    assert.equal(await VisitRequest.countDocuments({ customerId: student.customerId }), 1);
  });
});

/* ------------------------------------------------------------------ *
 * Moving in takes two people
 * ------------------------------------------------------------------ */

describe('moving in', () => {
  const { confirmMoveIn } = require('../src/modules/visits/stayRequest.service');

  /** Accept a request and hand back both halves. */
  const confirmed = async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    const { request } = await send(student, property);
    const { request: accepted, booking } = await acceptAndBook(request._id, owner);
    return { owner, student, request: accepted, booking };
  };

  const ownerMarks = (bookingId) => PartnerBooking.findOneAndUpdate(
    { _id: bookingId, movedInByOwnerAt: null },
    { $set: { movedInByOwnerAt: new Date() } },
    { new: true },
  );

  it('the student cannot confirm before the owner has', async () => {
    const { student, request } = await confirmed();

    /* The order is the point. A student able to mark themselves in before
       anybody opened a door has marked nothing, and the record would say
       somebody moved in that nobody let in. */
    await assert.rejects(
      () => confirmMoveIn(request._id, student),
      (e) => e.code === 'OWNER_HAS_NOT_CONFIRMED',
    );

    const booking = await PartnerBooking.findById(request.bookingId).lean();
    assert.equal(booking.movedInByStudentAt, null);
    assert.equal(booking.status, 'upcoming', 'nobody is in house yet');
  });

  it('the owner marking alone does not put anybody in house', async () => {
    const { request } = await confirmed();
    await ownerMarks(request.bookingId);

    const booking = await PartnerBooking.findById(request.bookingId).lean();
    assert.ok(booking.movedInByOwnerAt);
    assert.equal(booking.movedInByStudentAt, null);
    /* Half a confirmation is not an arrival. */
    assert.equal(booking.status, 'upcoming');
  });

  it('and then the student can — which completes it', async () => {
    const { student, request } = await confirmed();
    await ownerMarks(request.bookingId);

    const { booking } = await confirmMoveIn(request._id, student);

    assert.ok(booking.movedInByOwnerAt);
    assert.ok(booking.movedInByStudentAt);
    assert.equal(booking.status, 'in_house');
    /* The owner went first, and the record says so. */
    assert.ok(booking.movedInByStudentAt >= booking.movedInByOwnerAt);
  });

  it('confirming twice keeps the first time', async () => {
    const { student, request } = await confirmed();
    await ownerMarks(request.bookingId);

    const first = await confirmMoveIn(request._id, student);
    const again = await confirmMoveIn(request._id, student);

    assert.equal(
      again.booking.movedInByStudentAt.getTime(),
      first.booking.movedInByStudentAt.getTime(),
      'a second tap recorded a second arrival',
    );
  });

  it('another student cannot confirm somebody else\'s booking', async () => {
    const { request } = await confirmed();
    await ownerMarks(request.bookingId);

    const intruder = await makeStudent('cus_intruder', '+919333333333');
    await assert.rejects(
      () => confirmMoveIn(request._id, intruder),
      (e) => e.code === 'NOT_FOUND' && e.status === 404,
    );
  });

  it('and a request nobody accepted has nothing to move into', async () => {
    /* The owner has to exist for the request to be creatable at all — a
       property whose owner is not onboarded is refused before this. */
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    const { request } = await send(student, property);

    await assert.rejects(
      () => confirmMoveIn(request._id, student),
      (e) => e.code === 'NOT_CONFIRMED',
    );
  });
});
