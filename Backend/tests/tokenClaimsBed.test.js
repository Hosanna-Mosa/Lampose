/* ══════════════════════════════════════════════════════════════════════════
   The paid token takes the bed.

   The website had no way to consume inventory. `claimBed` was reachable only
   from the Stay Partner app and the owner's manual add-a-customer screen, so
   a listing whose owner lives on WhatsApp advertised "1 BED FREE" no matter
   how many people paid for it — which is what happened in production: three
   paid requests against a one-bed room, and the pool never moved.

   The token payment is the fix and the right place for it. An owner replying
   "available" is answering about a VIEWING; taking a bed on that would empty
   a building every time somebody asked to look around. Money changing hands
   is the commitment.

   What is tested here is mostly the unhappy half: paying twice, paying for a
   room that just went, and paying on a request made before any of this
   existed. The happy path is one line and the failures are where somebody's
   money is.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

/* Stubs before `visitPayment.controller` is loaded — it destructures its
   senders, which freezes whatever they are at require time. See the longer
   note in webSession.test.js. */
const twilio = require('../src/infrastructure/twilio/twilio');
let sent = [];
twilio.sendVisitConfirmationToCustomer = async (payload) => {
  sent.push(payload);
  return { success: true, messageSid: 'SM_1' };
};
twilio.sendVisitOutcomeMessage = async () => ({ success: true, messageSid: 'SM_2' });

const { withDatabase } = require('./helpers/db');
const Property = require('../src/modules/properties/property.model');
const VisitRequest = require('../src/modules/visits/visitRequest.model');
const { PartnerShareType } = require('../src/modules/partners/partnerDomains.model');
const { syncShareTypes } = require('../src/modules/inventory/inventory.service');
const { markPaidAndReleaseAddress } = require('../src/modules/visits/visitPayment.controller');

withDatabase();

beforeEach(() => { sent = []; });

let n = 0;

/** A bachelor listing with `beds` in one pool, and its shareTypeId. */
const makeListing = async (beds) => {
  n += 1;
  const property = await Property.create({
    name: `Token probe ${n}`,
    place: 'Chintal',
    address: '1-2-3 Main Road',
    category: 'BACHELOR',
    ownerName: 'Owner',
    ownerMobile: '+919876500041',
    rent: 12000,
    isVerified: true,
    categoryDetails: {
      roomTypes: ['1 BHK'],
      sharingPrices: { '1 BHK': 12000 },
      sharingBeds: { '1 BHK': beds },
    },
  });
  await syncShareTypes(property);
  return { property, shareTypeId: `${property._id}:1-bhk` };
};

const freeBeds = async (shareTypeId) => {
  const row = await PartnerShareType.findOne({ shareTypeId }).lean();
  return row.availableBeds;
};

/** A confirmed request with the token outstanding — the state before paying. */
const awaitingPayment = ({ property, shareTypeId }, name = 'Payer') => VisitRequest.create({
  listingId: String(property._id),
  propertyName: property.name,
  ownerName: 'Owner',
  ownerMobile: property.ownerMobile,
  customer: { name, phone: `+9190000${String(10000 + n)}` },
  status: 'confirmed',
  decidedAt: new Date(),
  shareTypeId,
  sharing: { label: '1 BHK', price: 12000 },
  payment: { required: true, status: 'pending', amountPaise: 2000 },
});

describe('paying the token takes a bed', () => {
  it('one payment, one bed', async () => {
    const listing = await makeListing(2);
    const doc = await awaitingPayment(listing);

    await markPaidAndReleaseAddress(doc, 'pay_ONE');

    assert.equal(await freeBeds(listing.shareTypeId), 1);
    assert.ok(doc.bedClaimedAt, 'the claim is recorded on the request');
  });

  it('a redelivered webhook does not take a second', async () => {
    const listing = await makeListing(2);
    const doc = await awaitingPayment(listing);

    await markPaidAndReleaseAddress(doc, 'pay_TWICE');
    await markPaidAndReleaseAddress(doc, 'pay_TWICE');

    /* Razorpay redelivers, and a customer can trigger both the callback and
       the webhook. A double decrement invents an occupancy the building does
       not have, and nothing downstream would ever notice. */
    assert.equal(await freeBeds(listing.shareTypeId), 1);
  });

  it('two payers take two beds, and the room reads full', async () => {
    const listing = await makeListing(2);

    await markPaidAndReleaseAddress(await awaitingPayment(listing, 'First'), 'pay_A');
    await markPaidAndReleaseAddress(await awaitingPayment(listing, 'Second'), 'pay_B');

    assert.equal(await freeBeds(listing.shareTypeId), 0);
  });
});

describe('paying for a bed that has just gone', () => {
  /* Nothing is held during a Razorpay redirect, so two people can be paying
     for the last bed at once. One of them loses, and they have already paid. */
  it('never fails the payment, and never goes negative', async () => {
    const listing = await makeListing(1);

    await markPaidAndReleaseAddress(await awaitingPayment(listing, 'Winner'), 'pay_WIN');
    const loser = await awaitingPayment(listing, 'Loser');
    await markPaidAndReleaseAddress(loser, 'pay_LOSE');

    assert.equal(await freeBeds(listing.shareTypeId), 0, 'the count stops at zero');
    assert.equal(loser.payment.status, 'paid', 'their money is still taken');
    assert.ok(loser.addressReleasedAt, 'and they still get what they paid for');
    assert.ok(loser.entryPin, 'including the reference');
  });

  it('and says so, rather than looking like a normal payment', async () => {
    const listing = await makeListing(1);
    await markPaidAndReleaseAddress(await awaitingPayment(listing, 'Winner'), 'pay_WIN2');
    const loser = await awaitingPayment(listing, 'Loser');
    await markPaidAndReleaseAddress(loser, 'pay_LOSE2');

    /* This is the whole reason `bedClaimedAt` is a field rather than an
       inference from `payment.status`: somebody has paid for a room that is
       gone, and finding them later has to be a query, not an audit. */
    assert.equal(loser.bedClaimedAt, null);
    assert.equal(loser.payment.status, 'paid');
  });
});

describe('requests that predate the pool id', () => {
  it('fall back to deriving it from the room label', async () => {
    const listing = await makeListing(2);
    const doc = await awaitingPayment(listing);

    /* Web requests did not record `shareTypeId` until this change. The
       derivation is the same slug `sharingOptionsFor` builds, so an old row
       still finds its pool. */
    doc.shareTypeId = undefined;
    await doc.save();

    await markPaidAndReleaseAddress(doc, 'pay_LEGACY');
    assert.equal(await freeBeds(listing.shareTypeId), 1);
    assert.ok(doc.bedClaimedAt);
  });

  it('and a request with no room type at all takes nothing', async () => {
    const listing = await makeListing(2);
    const doc = await awaitingPayment(listing);
    doc.shareTypeId = undefined;
    doc.sharing = { label: null, price: null };
    await doc.save();

    await markPaidAndReleaseAddress(doc, 'pay_NOROOM');

    assert.equal(await freeBeds(listing.shareTypeId), 2, 'nothing to claim, nothing claimed');
    assert.equal(doc.bedClaimedAt, null);
    assert.equal(doc.payment.status, 'paid', 'and the payment still stands');
  });
});
