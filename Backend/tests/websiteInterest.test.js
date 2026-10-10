/* ══════════════════════════════════════════════════════════════════════════
   The public site's "Notify me" form (`POST /api/v2/interest`), and who may
   write to `/api/v2/properties`.

   The form used to store nothing. It now files a Website lead the leads panel
   already works — once per email, whatever happens to it afterwards.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-website-interest';

const { withDatabase } = require('./helpers/db');
const createApp = require('../app');
const { ScrapedLead, User } = require('../src/modules/scraper/scriper.model');
const { signToken } = require('../src/shared/middleware/authMiddleware');
const { resetRateLimits } = require('../src/shared/middleware/rateLimit');

withDatabase();

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); });
beforeEach(() => resetRateLimits());

const call = async (method, path, { token, body } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

describe('notify me', () => {
  it('files a NEW Website lead, once per email', async () => {
    const first = await call('POST', '/api/v2/interest', { body: { email: ' Chef@Example.com ', page: 'food-partner' } });
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const lead = await ScrapedLead.findOne({}).lean();
    assert.equal(lead.source, 'Website');
    assert.equal(lead.leadStatus, 'NEW');
    assert.equal(lead.email, 'chef@example.com');
    assert.equal(lead.category, 'Restaurant partner (website)');

    /* A rep has started on it; signing up again must not reset that. */
    await ScrapedLead.updateOne({ _id: lead._id }, { leadStatus: 'CONTACTED' });
    const again = await call('POST', '/api/v2/interest', { body: { email: 'chef@example.com' } });
    assert.equal(again.status, 201);
    assert.equal(await ScrapedLead.countDocuments({}), 1);
    assert.equal((await ScrapedLead.findById(lead._id).lean()).leadStatus, 'CONTACTED');
  });

  it('refuses something that is not an email, and writes nothing', async () => {
    const res = await call('POST', '/api/v2/interest', { body: { email: 'not-an-email' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'BAD_EMAIL');
    assert.equal(await ScrapedLead.countDocuments({}), 0);
  });
});

describe('v2 property writes', () => {
  it('an EMPLOYEE token is refused on create and delete', async () => {
    const employee = await User.create({
      userId: 'usr_emp1', name: 'Field Agent', email: 'agent@lampose.test', password: 'hashed-anyway', role: 'EMPLOYEE',
    });
    const token = signToken(employee);

    const created = await call('POST', '/api/v2/properties', { token, body: { name: 'Should not exist' } });
    assert.equal(created.status, 403, JSON.stringify(created.body));
    const removed = await call('DELETE', '/api/v2/properties/507f1f77bcf86cd799439011', { token });
    assert.equal(removed.status, 403);
  });
});
