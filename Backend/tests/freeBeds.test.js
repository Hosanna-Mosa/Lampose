/* ══════════════════════════════════════════════════════════════════════════
   Free beds: what a person sees next to capacity, and their correction of it.

   The Stay Partner app and the admin console used to show only CAPACITY
   (`categoryDetails.sharingBeds`), which never moves, so a bed being booked
   looked like nothing happened. `inventoryForProperty` is the read both now
   draw "free now" from, and `setFreeBeds` is the one way a person changes it.

   What must hold:
     - capacity is never touched by a free-beds edit
     - free beds cannot go below 0, or above capacity − Lampose bookings
     - the correction survives the things that rebuild availability
       (a capacity change, a reconcile, a check-out)
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const Property = require('../src/modules/properties/property.model');
const { PartnerShareType, PartnerBooking } = require('../src/modules/partners/partnerDomains.model');
const {
  syncShareTypes, claimBed, releaseBed, reconcile, inventoryForProperty, setFreeBeds,
} = require('../src/modules/inventory/inventory.service');

withDatabase();

const makeProperty = (sharingBeds = { Single: 12 }) => Property.create({
  name: 'sunand',
  place: 'Bobbaralanka',
  ownerName: 'Sunand',
  ownerMobile: '+91 98765 43210',
  category: 'PG_HOSTEL',
  rent: 4977,
  categoryDetails: {
    sharingTypes: ['Single', '2 Sharing'],
    sharingPrices: { Single: 6000, '2 Sharing': 4977 },
    sharingBeds,
  },
});

const book = (property, status = 'in_house', shareType = 'Single') => PartnerBooking.create({
  partnerPhoneDigits: '9876543210',
  propertyId: String(property._id),
  propertyName: property.name,
  guestName: 'Guest', guestPhone: '1', roomNumber: '1',
  shareType,
  checkInDate: '2026-09-01', checkOutDate: '2026-12-01',
  status, totalAmount: 0, paidAmount: 0,
});

const single = (property) => `${property._id}:single`;

describe('inventoryForProperty — capacity and free beds side by side', () => {
  it('lists every option, with free beds only where a count exists', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    await book(property);
    await claimBed(single(property));

    const items = await inventoryForProperty(property);
    const s = items.find((i) => i.label === 'Single');
    const two = items.find((i) => i.label === '2 Sharing');

    assert.equal(s.recorded, true);
    assert.equal(s.capacity, 12);
    assert.equal(s.totalBeds, 12);
    assert.equal(s.availableBeds, 11, 'what the student app shows as "11 left"');
    assert.equal(s.bookedInApp, 1);
    assert.equal(s.maxFree, 11);

    /* No bed count for 2 Sharing: listed, but so the screen can say
       "set total beds first" instead of dropping it. */
    assert.equal(two.recorded, false);
    assert.equal(two.availableBeds, null);
  });
});

describe('setFreeBeds — the correction', () => {
  it('changes free beds and never capacity', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);

    const result = await setFreeBeds({
      propertyId: property._id, shareTypeId: single(property), freeBeds: 9, editedBy: 'owner test',
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.availableBeds, 9);
    assert.equal(result.data.offlineOccupied, 3);

    const row = await PartnerShareType.findOne({ shareTypeId: single(property) }).lean();
    assert.equal(row.totalBeds, 12, 'capacity untouched');
    assert.equal(row.freeBedsEditedBy, 'owner test');

    const fresh = await Property.findById(property._id).lean();
    assert.equal(fresh.categoryDetails.sharingBeds.Single, 12, 'property capacity untouched');
  });

  it('refuses a negative, a fraction, or anything that is not a number', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    for (const bad of [-1, 2.5, 'abc', null, '']) {
      // eslint-disable-next-line no-await-in-loop
      const result = await setFreeBeds({ propertyId: property._id, shareTypeId: single(property), freeBeds: bad });
      assert.equal(result.ok, false, `refused ${JSON.stringify(bad)}`);
      assert.equal(result.code, 'VALIDATION_ERROR');
    }
  });

  it('refuses more free beds than the building has', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);

    const result = await setFreeBeds({ propertyId: property._id, shareTypeId: single(property), freeBeds: 13 });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'FREE_ABOVE_TOTAL');

    const ok = await setFreeBeds({ propertyId: property._id, shareTypeId: single(property), freeBeds: 12 });
    assert.equal(ok.ok, true, 'the total itself is allowed');
  });

  it('lets the owner free a bed a Lampose booking still holds (override)', async () => {
    /* The screenshot case: one bed, one tenant who left after a dispute, and
       a booking still reading in_house because nothing closed it. */
    const property = await makeProperty({ Single: 1 });
    await syncShareTypes(property);
    await book(property);
    await claimBed(single(property));

    const result = await setFreeBeds({ propertyId: property._id, shareTypeId: single(property), freeBeds: 1 });
    assert.equal(result.ok, true);
    assert.equal(result.data.availableBeds, 1);
    assert.equal(result.data.override, true);
    assert.equal(result.data.markedVacant, 1);
    assert.equal(result.data.offlineOccupied, 0);

    const booking = await PartnerBooking.findOne({ propertyId: String(property._id) }).lean();
    assert.equal(booking.status, 'in_house', 'the booking itself is not touched');

    const [item] = await inventoryForProperty(property);
    assert.equal(item.availableBeds, 1);
    assert.equal(item.markedVacant, 1);
  });

  it('refuses a share type that is not on this property', async () => {
    const a = await makeProperty();
    const b = await makeProperty();
    await syncShareTypes(a);
    await syncShareTypes(b);

    const result = await setFreeBeds({ propertyId: a._id, shareTypeId: single(b), freeBeds: 5 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
  });

  it('reports a room type with no bed count instead of inventing one', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    const result = await setFreeBeds({
      propertyId: property._id, shareTypeId: `${property._id}:2-sharing`, freeBeds: 3,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NO_INVENTORY_RECORDED');
  });
});

describe('the correction survives recounts', () => {
  it('survives a reconcile with fix', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    await setFreeBeds({ propertyId: property._id, shareTypeId: single(property), freeBeds: 9 });

    const report = await reconcile({ fix: true });
    assert.equal(report.drifted.length, 0, 'three beds held outside the app are not drift');

    const row = await PartnerShareType.findOne({ shareTypeId: single(property) }).lean();
    assert.equal(row.availableBeds, 9);
  });

  it('survives a capacity change, which still moves free beds by the delta', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);
    await setFreeBeds({ propertyId: property._id, shareTypeId: single(property), freeBeds: 9 });

    property.categoryDetails = { ...property.categoryDetails, sharingBeds: { Single: 14 } };
    property.markModified('categoryDetails');
    await property.save();
    await syncShareTypes(property);

    const row = await PartnerShareType.findOne({ shareTypeId: single(property) }).lean();
    assert.equal(row.totalBeds, 14);
    assert.equal(row.availableBeds, 11, '9 + 2 new beds');
    assert.equal(row.offlineOccupied, 3);
  });

  it('an override survives a reconcile, and a later check-out cannot exceed the total', async () => {
    const property = await makeProperty({ Single: 1 });
    await syncShareTypes(property);
    await book(property);
    await claimBed(single(property));
    await setFreeBeds({ propertyId: property._id, shareTypeId: single(property), freeBeds: 1 });

    const report = await reconcile({ fix: true });
    assert.equal(report.drifted.length, 0, 'the override is not drift');

    await releaseBed(single(property));
    const row = await PartnerShareType.findOne({ shareTypeId: single(property) }).lean();
    assert.equal(row.availableBeds, 1, 'never above the total');
  });

  it('an override whose booking later closes does not invent a bed on reconcile', async () => {
    const property = await makeProperty({ Single: 1 });
    await syncShareTypes(property);
    await book(property);
    await claimBed(single(property));
    await setFreeBeds({ propertyId: property._id, shareTypeId: single(property), freeBeds: 1 });

    await PartnerBooking.updateMany({ propertyId: String(property._id) }, { $set: { status: 'completed' } });
    await reconcile({ fix: true });

    const row = await PartnerShareType.findOne({ shareTypeId: single(property) }).lean();
    assert.equal(row.availableBeds, 1);
  });

  it('a check-out cannot free a bed held outside the app', async () => {
    const property = await makeProperty({ Single: 2 });
    await syncShareTypes(property);
    await book(property);
    await claimBed(single(property));
    /* One Lampose tenant, and the owner says the other bed is taken too. */
    await setFreeBeds({ propertyId: property._id, shareTypeId: single(property), freeBeds: 0 });

    await releaseBed(single(property));
    await releaseBed(single(property));

    const row = await PartnerShareType.findOne({ shareTypeId: single(property) }).lean();
    assert.equal(row.availableBeds, 1, 'only the Lampose bed comes back');
  });

  it('refuses a write computed from numbers that have since moved', async () => {
    const property = await makeProperty();
    await syncShareTypes(property);

    /* Simulate a claim landing between the read and the write inside
       setFreeBeds by moving the counter under it. */
    const original = PartnerShareType.findOne.bind(PartnerShareType);
    PartnerShareType.findOne = function patched(...args) {
      const query = original(...args);
      const exec = query.lean.bind(query);
      query.lean = () => {
        const q = exec();
        const then = q.then.bind(q);
        q.then = (ok, bad) => then(async (row) => {
          await claimBed(single(property));
          return row;
        }).then(ok, bad);
        return q;
      };
      return query;
    };
    try {
      const result = await setFreeBeds({ propertyId: property._id, shareTypeId: single(property), freeBeds: 5 });
      assert.equal(result.ok, false);
      assert.equal(result.code, 'INVENTORY_CHANGED');
    } finally {
      PartnerShareType.findOne = original;
    }
  });
});
