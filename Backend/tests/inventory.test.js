/* ══════════════════════════════════════════════════════════════════════════
   Beds: capacity in, availability out, and the claim that decides conflicts.

   The claim test is the one that matters. Everything else here is arithmetic
   that could be read off the source; `claimBed` racing against itself is the
   single assumption the whole request flow rests on — that two owners tapping
   Accept for the last bed in the same millisecond produce one acceptance and
   one refusal, decided by the database rather than by luck.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase, race } = require('./helpers/db');
const Property = require('../src/modules/properties/property.model');
const { PartnerShareType, PartnerBooking } = require('../src/modules/partners/partnerDomains.model');
const {
  syncShareTypes, claimBed, releaseBed, requestableOptions, reconcile,
} = require('../src/modules/inventory/inventory.service');

withDatabase();

/** A PG with the counts the onboarding form now collects. */
const makeProperty = (overrides = {}) => Property.create({
  name: 'Sai Krishna Boys PG',
  place: 'Madhurawada, Visakhapatnam',
  ownerName: 'Ramesh',
  ownerMobile: '+91 98765 43210',
  category: 'PG',
  rent: 5999,
  categoryDetails: {
    sharingTypes: ['Single', '2 Sharing'],
    sharingPrices: { Single: 8000, '2 Sharing': 5999 },
    sharingRooms: { Single: 2, '2 Sharing': 3 },
    sharingBeds: { Single: 2, '2 Sharing': 6 },
  },
  ...overrides,
});

describe('sync — capacity becomes claimable rows', () => {
  it('creates one row per sharing option, seeded at full capacity', async () => {
    const property = await makeProperty();
    const result = await syncShareTypes(property);

    assert.equal(result.created, 2);

    const rows = await PartnerShareType.find({ propertyId: String(property._id) }).sort({ name: 1 }).lean();
    assert.equal(rows.length, 2);

    const twoSharing = rows.find((r) => r.name === '2 Sharing');
    assert.equal(twoSharing.totalBeds, 6, '3 rooms x 2 sharing');
    assert.equal(twoSharing.availableBeds, 6);
    assert.equal(twoSharing.shareTypeId, `${property._id}:2-sharing`);
    /* Ownership travels with the row, so the owner's app can scope on it
       without going back to the property. */
    assert.equal(twoSharing.partnerPhoneDigits, '9876543210');
  });

  it('seeds availability from existing bookings, not from capacity', async () => {
    const property = await makeProperty();

    /* Two tenants already in the building when counts are recorded for the
       first time. Seeding at capacity would mark their beds free. */
    await PartnerBooking.create([
      {
        partnerPhoneDigits: '9876543210',
        propertyId: String(property._id),
        propertyName: property.name,
        guestName: 'A', guestPhone: '1', roomNumber: '1',
        shareType: '2 Sharing',
        checkInDate: '2026-01-01', checkOutDate: '2026-12-01',
        status: 'in_house', totalAmount: 0, paidAmount: 0,
      },
      {
        partnerPhoneDigits: '9876543210',
        propertyId: String(property._id),
        propertyName: property.name,
        guestName: 'B', guestPhone: '2', roomNumber: '2',
        shareType: '2 Sharing',
        checkInDate: '2026-02-01', checkOutDate: '2026-12-01',
        status: 'upcoming', totalAmount: 0, paidAmount: 0,
      },
    ]);

    await syncShareTypes(property);

    const row = await PartnerShareType.findOne({ name: '2 Sharing' }).lean();
    assert.equal(row.totalBeds, 6);
    assert.equal(row.availableBeds, 4, 'six beds minus two occupied');
  });

  it('moves availability by the delta when capacity is corrected', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);

    /* Two beds taken by requests. */
    const shareTypeId = `${property._id}:2-sharing`;
    await claimBed(shareTypeId);
    await claimBed(shareTypeId);
    assert.equal((await PartnerShareType.findOne({ shareTypeId })).availableBeds, 4);

    /* The owner corrects 3 rooms to 4. Capacity +2, so availability +2 —
       NOT reset to 8, which would mark the two taken beds free again. */
    property.categoryDetails = {
      ...property.categoryDetails,
      sharingRooms: { ...property.categoryDetails.sharingRooms, '2 Sharing': 4 },
      sharingBeds: { ...property.categoryDetails.sharingBeds, '2 Sharing': 8 },
    };
    property.markModified('categoryDetails');
    await property.save();
    await syncShareTypes(property);

    const row = await PartnerShareType.findOne({ shareTypeId }).lean();
    assert.equal(row.totalBeds, 8);
    assert.equal(row.availableBeds, 6, 'delta applied, occupancy preserved');
  });

  it('never invents a count for a property that has none', async () => {
    const property = await makeProperty({
      categoryDetails: { sharingTypes: ['Single'], sharingPrices: { Single: 5000 } },
    });
    const result = await syncShareTypes(property);

    assert.equal(result.created, 0);
    assert.equal(result.skipped, 1);
    assert.equal(await PartnerShareType.countDocuments({}), 0, 'no row rather than a zero row');

    /* And the option reports why, so the app can say "call the owner"
       instead of "full". */
    const [option] = await requestableOptions(property);
    assert.equal(option.requestable, false);
    assert.equal(option.reason, 'NO_INVENTORY_RECORDED');
    assert.equal(option.availableBeds, null, 'null, never 0');
  });

  it('removes rows for an option the property has dropped', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    assert.equal(await PartnerShareType.countDocuments({}), 2);

    property.categoryDetails = {
      sharingTypes: ['2 Sharing'],
      sharingPrices: { '2 Sharing': 5999 },
      sharingRooms: { '2 Sharing': 3 },
      sharingBeds: { '2 Sharing': 6 },
    };
    property.markModified('categoryDetails');
    await property.save();

    const result = await syncShareTypes(property);
    assert.equal(result.removed, 1);
    assert.equal(await PartnerShareType.countDocuments({}), 1);
  });

  it('is idempotent — syncing twice changes nothing', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    await claimBed(`${property._id}:2-sharing`);

    const before = await PartnerShareType.find({}).sort({ name: 1 }).lean();
    await syncShareTypes(property);
    const after = await PartnerShareType.find({}).sort({ name: 1 }).lean();

    assert.deepEqual(
      after.map((r) => [r.shareTypeId, r.totalBeds, r.availableBeds]),
      before.map((r) => [r.shareTypeId, r.totalBeds, r.availableBeds]),
    );
  });
});

describe('claim — the conflict rule', () => {
  it('takes one bed and reports the new count', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);

    const row = await claimBed(`${property._id}:2-sharing`);
    assert.equal(row.availableBeds, 5);
  });

  it('refuses when the last bed has gone', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    const shareTypeId = `${property._id}:single`;   // two beds

    assert.ok(await claimBed(shareTypeId));
    assert.ok(await claimBed(shareTypeId));
    assert.equal(await claimBed(shareTypeId), null, 'third claim finds nothing');

    const row = await PartnerShareType.findOne({ shareTypeId }).lean();
    assert.equal(row.availableBeds, 0, 'never negative');
  });

  it('SIX simultaneous claims on six beds all succeed', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    const shareTypeId = `${property._id}:2-sharing`;

    const results = await race(6, () => claimBed(shareTypeId));

    assert.equal(results.filter(Boolean).length, 6, 'every bed claimable concurrently');
    const row = await PartnerShareType.findOne({ shareTypeId }).lean();
    assert.equal(row.availableBeds, 0);
  });

  it('TWENTY simultaneous claims on six beds yield exactly six', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    const shareTypeId = `${property._id}:2-sharing`;

    const results = await race(20, () => claimBed(shareTypeId));
    const won = results.filter(Boolean).length;

    /* The whole feature rests on this number. Not "about six" — six. */
    assert.equal(won, 6, 'exactly the beds that exist, no double-booking');

    const row = await PartnerShareType.findOne({ shareTypeId }).lean();
    assert.equal(row.availableBeds, 0);
    assert.ok(row.availableBeds >= 0, 'the counter never goes negative under load');
  });

  it('claims on different options do not contend', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);

    const results = await race(4, (i) => claimBed(
      `${property._id}:${i % 2 === 0 ? '2-sharing' : 'single'}`,
    ));

    assert.equal(results.filter(Boolean).length, 4, 'two beds each, both succeed');
  });

  it('is null-safe on an id that does not exist', async () => {
    assert.equal(await claimBed('nope:2-sharing'), null);
    assert.equal(await claimBed(null), null);
  });
});

describe('release — giving a bed back', () => {
  it('returns a claimed bed', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    const shareTypeId = `${property._id}:2-sharing`;

    await claimBed(shareTypeId);
    const row = await releaseBed(shareTypeId);
    assert.equal(row.availableBeds, 6);
  });

  it('cannot invent a bed above capacity', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    const shareTypeId = `${property._id}:single`;   // two beds, none taken

    assert.equal(await releaseBed(shareTypeId), null, 'nothing to give back');
    const row = await PartnerShareType.findOne({ shareTypeId }).lean();
    assert.equal(row.availableBeds, 2, 'still two, not three');
  });

  it('a double release stops at capacity', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    const shareTypeId = `${property._id}:single`;

    await claimBed(shareTypeId);
    await race(5, () => releaseBed(shareTypeId));

    const row = await PartnerShareType.findOne({ shareTypeId }).lean();
    assert.equal(row.availableBeds, 2, 'one bed back, capped at the total');
  });
});

describe('reconcile — catching drift', () => {
  it('reports a counter that disagrees with the bookings', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);

    /* A writer that forgot: a booking exists, the counter was never moved. */
    await PartnerBooking.create({
      partnerPhoneDigits: '9876543210',
      propertyId: String(property._id),
      propertyName: property.name,
      guestName: 'A', guestPhone: '1', roomNumber: '1',
      shareType: '2 Sharing',
      checkInDate: '2026-01-01', checkOutDate: '2026-12-01',
      status: 'in_house', totalAmount: 0, paidAmount: 0,
    });

    const report = await reconcile();
    const drift = report.drifted.find((d) => d.name === '2 Sharing');

    assert.ok(drift, 'the drift is found');
    assert.equal(drift.stored, 6);
    assert.equal(drift.expected, 5);
    assert.equal(report.fixed, 0, 'reports without writing by default');
  });

  it('writes the corrected numbers only when asked', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    await PartnerBooking.create({
      partnerPhoneDigits: '9876543210',
      propertyId: String(property._id),
      propertyName: property.name,
      guestName: 'A', guestPhone: '1', roomNumber: '1',
      shareType: '2 Sharing',
      checkInDate: '2026-01-01', checkOutDate: '2026-12-01',
      status: 'in_house', totalAmount: 0, paidAmount: 0,
    });

    await reconcile({ fix: true });

    const row = await PartnerShareType.findOne({ name: '2 Sharing' }).lean();
    assert.equal(row.availableBeds, 5);
    assert.equal((await reconcile()).drifted.length, 0, 'clean on the second pass');
  });

  it('a cancelled booking is not occupancy', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    await PartnerBooking.create({
      partnerPhoneDigits: '9876543210',
      propertyId: String(property._id),
      propertyName: property.name,
      guestName: 'A', guestPhone: '1', roomNumber: '1',
      shareType: '2 Sharing',
      checkInDate: '2026-01-01', checkOutDate: '2026-12-01',
      status: 'cancelled', totalAmount: 0, paidAmount: 0,
    });

    assert.equal((await reconcile()).drifted.length, 0);
  });
});
