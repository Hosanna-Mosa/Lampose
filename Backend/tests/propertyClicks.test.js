/* ══════════════════════════════════════════════════════════════════════════
   Property card clicks: every tap counts, the owner and the console read it.

     - POST /api/v2/listings/:id/click adds one, with no login (guests count)
     - repeat taps each count ("every tap", by product decision)
     - an unknown, malformed or hidden listing is not counted — and not an error
     - the property document itself is never written (its updatedAt stays put)
     - the counter reaches the owner's list and the console's list
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const Property = require('../src/modules/properties/property.model');
const { PropertyClick, clickCountsFor } = require('../src/modules/listings/propertyClick.model');

withDatabase();

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const click = (id) => fetch(`${base}/api/v2/listings/${id}/click`, { method: 'POST' })
  .then(async (r) => ({ status: r.status, body: await r.json() }));

const makeProperty = (overrides = {}) => Property.create({
  name: 'Click Test PG',
  place: 'Bobbaralanka',
  ownerName: 'Owner',
  ownerMobile: '+91 98765 43210',
  category: 'PG_HOSTEL',
  rent: 5000,
  ...overrides,
});

describe('POST /listings/:id/click', () => {
  it('counts every tap, with no login', async () => {
    const property = await makeProperty();
    const id = String(property._id);

    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await click(id);
      assert.equal(res.status, 202);
      assert.equal(res.body.counted, true);
    }

    const counts = await clickCountsFor([id]);
    assert.equal(counts.get(id), 3);
  });

  it('does not touch the property document', async () => {
    const property = await makeProperty();
    const before = (await Property.findById(property._id).lean()).updatedAt;
    await click(String(property._id));
    const after = (await Property.findById(property._id).lean()).updatedAt;
    assert.equal(String(after), String(before));
  });

  it('ignores unknown, malformed and hidden listings without an error', async () => {
    const removed = await makeProperty({ status: 'removed' });
    const review = await makeProperty({ status: 'review' });

    for (const id of ['not-an-id', '64b000000000000000000000', String(removed._id), String(review._id)]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await click(id);
      assert.equal(res.status, 202, id);
      assert.equal(res.body.counted, false, id);
    }
    assert.equal(await PropertyClick.countDocuments({}), 0);
  });

  it('counts two simultaneous taps as two', async () => {
    const property = await makeProperty();
    const id = String(property._id);
    await Promise.all([click(id), click(id), click(id), click(id)]);
    assert.equal((await clickCountsFor([id])).get(id), 4);
  });
});
