/* ══════════════════════════════════════════════════════════════════════════
   The owner never answered: the student asks the Lampose team, the team
   rings the owner and answers AVAILABLE / UNAVAILABLE on WhatsApp, and the
   student's request follows that answer.

   Also the rule that made this necessary — every room type may be asked for —
   and the line it must not cross: a bed that was COUNTED free still cannot be
   given to two students.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const Property = require('../src/modules/properties/property.model');
const Partner = require('../src/modules/partners/partner.model');
const Customer = require('../src/modules/customers/customer.model');
const VisitRequest = require('../src/modules/visits/visitRequest.model');
const { PartnerBooking, PartnerShareType } = require('../src/modules/partners/partnerDomains.model');
const { syncShareTypes, claimBed } = require('../src/modules/inventory/inventory.service');
const twilio = require('../src/infrastructure/twilio/twilio');
const {
  acceptAndBook, createStayRequest, expireDue, requestTeamHelp, teamReference,
} = require('../src/modules/visits/stayRequest.service');
const { handleStayHelpReply } = require('../src/modules/visits/stayHelp.whatsapp');

withDatabase();

const OWNER_PHONE = '+919876543210';
const TEAM = 'whatsapp:+919000000001';
const TEAM_TWO = 'whatsapp:+919000000002';

/* Every WhatsApp the team would have been sent, instead of sending it. */
let sent = [];
let sendResult = { success: true, messageSid: 'SM_test' };
const realSend = twilio.sendStayHelpRequest;

beforeEach(() => {
  sent = [];
  sendResult = { success: true, messageSid: 'SM_test' };
  process.env.STAY_HELP_TEAM_NUMBERS = `${TEAM},+919000000002`;
  twilio.sendStayHelpRequest = async (message) => { sent.push(message); return sendResult; };
});

process.on('exit', () => { twilio.sendStayHelpRequest = realSend; });

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
  customer, listingId: String(property._id), sharing: '2 Sharing', intent: null, consentedTerms: true,
});

const pool = (property) => `${property._id}:2-sharing`;
const bedsFree = async (property) => (await PartnerShareType.findOne({ shareTypeId: pool(property) }).lean()).availableBeds;

/** A request the owner let run out. */
const expiredRequest = async ({ beds = 6 } = {}) => {
  await makeOwner();
  const student = await makeStudent();
  const property = await makeProperty(beds);
  const { request } = await send(student, property);
  await VisitRequest.updateOne({ _id: request._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const [expired] = await expireDue();
  assert.equal(expired.status, 'expired');
  return { student, property, request: expired };
};

/* ------------------------------------------------------------------ */

describe('every room type can be asked for', () => {
  it('a paused type is requestable, and an owner may accept it with no bed counted', async () => {
    const owner = await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty(1);
    await claimBed(pool(property));   // the only bed is gone

    const { request } = await send(student, property);
    assert.equal(request.bedCounted, false);

    const { request: confirmed, autoDeclined } = await acceptAndBook(request._id, owner);
    assert.equal(confirmed.status, 'confirmed');
    assert.equal(await bedsFree(property), 0, 'no bed was invented or taken below zero');
    assert.equal(autoDeclined.length, 0, 'accepting past an empty count turns nobody else away');
  });

  it('a bed COUNTED free still cannot go to two students', async () => {
    const owner = await makeOwner();
    const a = await makeStudent('cus_a', '+919111111111');
    const b = await makeStudent('cus_b', '+919222222222');
    const property = await makeProperty(1);
    const { request: first } = await send(a, property);
    const { request: second } = await send(b, property);
    assert.equal(second.bedCounted, true);

    /* Not through acceptAndBook for the first: that would auto-decline the
       second, and the question is what Accept itself does with no bed. */
    await claimBed(pool(property));
    await assert.rejects(() => acceptAndBook(second._id, owner), (e) => e.code === 'INVENTORY_GONE');
    assert.ok(first);
  });
});

describe('the student asks the team', () => {
  it('only after the owner let it run out — and says so on the request', async () => {
    await makeOwner();
    const student = await makeStudent();
    const property = await makeProperty();
    const { request } = await send(student, property);

    assert.equal(request.toPublic().canAskTeam, false, 'not while the owner can still answer');
    await assert.rejects(() => requestTeamHelp(request._id, student), (e) => e.code === 'TEAM_HELP_NOT_OPEN');
    assert.equal(sent.length, 0);
  });

  it('messages every team member once, with who, where and the owner to ring', async () => {
    const { student, request } = await expiredRequest();
    assert.equal(request.toPublic().canAskTeam, true);

    const asked = await requestTeamHelp(request._id, student);

    assert.equal(asked.teamHelp.status, 'requested');
    assert.equal(asked.toPublic().canAskTeam, false);
    assert.equal(sent.length, 2);
    assert.deepEqual(sent.map((m) => m.to).sort(), [TEAM, TEAM_TWO].sort());
    assert.equal(sent[0].customerName, 'Student cus_a');
    assert.equal(sent[0].customerPhone, '+919111111111');
    assert.equal(sent[0].propertyName, 'Sai Krishna Boys PG');
    assert.equal(sent[0].roomLabel, '2 Sharing');
    assert.equal(sent[0].ownerPhone, OWNER_PHONE);
    assert.equal(sent[0].reference, teamReference(request));
  });

  it('a second tap sends nothing more', async () => {
    const { student, request } = await expiredRequest();
    await requestTeamHelp(request._id, student);
    await assert.rejects(() => requestTeamHelp(request._id, student), (e) => e.code === 'TEAM_ALREADY_ASKED');
    assert.equal(sent.length, 2);
  });

  it('another student cannot ask about it', async () => {
    const { request } = await expiredRequest();
    const other = await makeStudent('cus_b', '+919222222222');
    await assert.rejects(() => requestTeamHelp(request._id, other), (e) => e.code === 'NOT_FOUND');
  });

  it('when no message could be sent, the button works again', async () => {
    const { student, request } = await expiredRequest();
    sendResult = { success: false, error: 'boom' };

    await assert.rejects(() => requestTeamHelp(request._id, student), (e) => e.code === 'TEAM_UNREACHABLE');
    const stored = await VisitRequest.findById(request._id);
    assert.equal(stored.teamHelp.status, 'none');
    assert.equal(stored.toPublic().canAskTeam, true);
  });

  it('with no team configured, it refuses rather than pretending', async () => {
    const { student, request } = await expiredRequest();
    process.env.STAY_HELP_TEAM_NUMBERS = '';
    await assert.rejects(() => requestTeamHelp(request._id, student), (e) => e.code === 'TEAM_NOT_CONFIGURED');
  });
});

describe('the team answers on WhatsApp', () => {
  it('AVAILABLE (button) confirms the request and books the guest with the owner', async () => {
    const { student, property, request } = await expiredRequest();
    await requestTeamHelp(request._id, student);

    const reply = await handleStayHelpReply({
      from: TEAM, body: 'Available', buttonPayload: `STAY_HELP_YES:${request._id}`,
    });
    assert.match(reply, /AVAILABLE/);

    const stored = await VisitRequest.findById(request._id);
    assert.equal(stored.status, 'confirmed');
    assert.equal(stored.decidedBy, 'lampose_team');
    assert.equal(stored.teamHelp.status, 'available');
    assert.equal(stored.teamHelp.answeredBy, TEAM);
    assert.ok(stored.entryPin, 'a free category gets its PIN exactly as on an owner Accept');
    assert.equal(await bedsFree(property), 5, 'a bed was taken');

    const booking = await PartnerBooking.findById(stored.bookingId).lean();
    assert.equal(booking.partnerPhoneDigits, '9876543210');
    assert.equal(booking.guestName, 'Student cus_a');
  });

  it('AVAILABLE works even when the counter reads zero — the owner said so', async () => {
    const { student, property, request } = await expiredRequest({ beds: 1 });
    await claimBed(pool(property));
    await requestTeamHelp(request._id, student);

    await handleStayHelpReply({ from: TEAM, body: 'Available', buttonPayload: `STAY_HELP_YES:${request._id}` });
    assert.equal((await VisitRequest.findById(request._id)).status, 'confirmed');
    assert.equal(await bedsFree(property), 0);
  });

  it('UNAVAILABLE typed with the reference declines it', async () => {
    const { student, request } = await expiredRequest();
    await requestTeamHelp(request._id, student);

    const reply = await handleStayHelpReply({ from: TEAM, body: `not available ${teamReference(request).toLowerCase()}` });
    assert.match(reply, /UNAVAILABLE/);

    const stored = await VisitRequest.findById(request._id);
    assert.equal(stored.status, 'declined');
    assert.equal(stored.decisionReason, 'TEAM_UNAVAILABLE');
    assert.equal(stored.teamHelp.status, 'unavailable');
  });

  it('a typed word with no reference picks the only waiting request', async () => {
    const { student, request } = await expiredRequest();
    await requestTeamHelp(request._id, student);

    await handleStayHelpReply({ from: TEAM_TWO, body: 'AVAILABLE' });
    assert.equal((await VisitRequest.findById(request._id)).status, 'confirmed');
  });

  it('the second team member is told it was already answered, and nothing changes', async () => {
    const { student, request } = await expiredRequest();
    await requestTeamHelp(request._id, student);

    await handleStayHelpReply({ from: TEAM, body: 'Available', buttonPayload: `STAY_HELP_YES:${request._id}` });
    const reply = await handleStayHelpReply({ from: TEAM_TWO, body: 'Unavailable', buttonPayload: `STAY_HELP_NO:${request._id}` });

    assert.match(reply, /Already answered/);
    assert.equal((await VisitRequest.findById(request._id)).status, 'confirmed');
    assert.equal(await PartnerBooking.countDocuments({ requestId: String(request._id) }), 1);
  });

  it('nobody off the team can answer', async () => {
    const { student, request } = await expiredRequest();
    await requestTeamHelp(request._id, student);

    const button = await handleStayHelpReply({
      from: 'whatsapp:+919333333333', body: 'Available', buttonPayload: `STAY_HELP_YES:${request._id}`,
    });
    assert.match(button, /not on the Lampose stay-help team/);

    /* A typed AVAILABLE from anybody else is an owner's word for a website
       visit — passed on untouched. */
    assert.equal(await handleStayHelpReply({ from: OWNER_PHONE, body: 'AVAILABLE' }), null);
    assert.equal((await VisitRequest.findById(request._id)).status, 'expired');
  });

  it('a team member typing AVAILABLE with nothing waiting is not claimed', async () => {
    assert.equal(await handleStayHelpReply({ from: TEAM, body: 'available' }), null);
  });
});
