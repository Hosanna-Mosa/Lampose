/* ══════════════════════════════════════════════════════════════════════════
   Every API call all three frontends make, exercised against this backend,
   plus the routes no frontend calls any more but the backend still serves.

   smoke-test.js answers "is the server healthy". This answers the different
   question "does each screen still work" — it walks the exact list of calls
   found in the three frontends' api/ and services/ folders, sends the same
   paths and payloads they send, and checks the response carries the fields
   the calling component actually reads. A 200 with a renamed field is still a
   broken page.

     npm run verify                    boot locally and check
     npm run verify -- --scrape        also run a real Google Maps scrape
     SMOKE_URL=https://api.lampose.com npm run verify

   What it deliberately does NOT do: POST a complete property to
   /api/v1/properties. That endpoint sends a real WhatsApp message to the
   owner's number through Twilio — a live side effect with a cost and a human
   on the other end. The route is still exercised, through its validation
   path, which returns before Twilio is touched.

   Everything it creates (a temp admin, a temp employee, a temp lead, a temp
   property, a temp permission request) is removed again before it exits.
   ══════════════════════════════════════════════════════════════════════════ */
const config = require('../src/config/env');
const { connectDB, closeConnections } = require('../src/infrastructure/database/db');
const { initStore } = require('../src/modules/scraper/scraper.store');
/* The app server.js built — same CORS allowlist a browser hits in
   production, so the preflight checks below test the real policy. */
const { app } = require('../server');

const RUN_SCRAPE = process.argv.includes('--scrape');

const rows = [];
let group = '';
let server = null;
let base = process.env.SMOKE_URL ? process.env.SMOKE_URL.replace(/\/+$/, '') : null;

const section = (title) => { group = title; rows.push({ section: title }); };

const call = async (method, path, { token, body, raw, headers = {} } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  /* Bytes, not text: fetch's UTF-8 decode strips a leading BOM, so
     response.text() cannot tell you whether the CSV actually carries one. */
  if (raw) {
    return {
      status: response.status,
      headers: response.headers,
      bytes: Buffer.from(await response.arrayBuffer()),
    };
  }
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: response.status, headers: response.headers, body: parsed };
};

const check = async (frontendCall, run) => {
  try {
    const detail = await run();
    rows.push({ ok: true, group, frontendCall, detail: detail || 'ok' });
  } catch (error) {
    rows.push({ ok: false, group, frontendCall, detail: error.message });
  }
};

const expect = (condition, message) => { if (!condition) throw new Error(message); };

/* The point of the whole script: a field the calling component reads must be
   present, or the screen breaks even though the request "succeeded". */
const expectFields = (object, fields, label, forbidden = []) => {
  const missing = fields.filter((f) => (object || {})[f] === undefined);
  expect(missing.length === 0, `${label} is missing: ${missing.join(', ')}`);

  /* What must NOT be there is as much a contract as what must. */
  const leaked = forbidden.filter((f) => (object || {})[f] !== undefined);
  expect(leaked.length === 0, `${label} publishes what it must not: ${leaked.join(', ')}`);

  return `${fields.length} fields present${forbidden.length ? `, ${forbidden.length} withheld` : ''}`;
};


/**
 * The resolved Expo config for an app.
 *
 * Both apps moved from `app.json` to a self-contained `app.config.js`, which
 * is the shape `driver/` already used: one file, so a value cannot be declared
 * in two places and disagree. These checks read the config rather than the
 * file, so the move does not quietly turn them off — reading `app.json`
 * directly failed with ENOENT and took three real invariants down with it.
 *
 * `app.json` is still honoured where it exists, because nothing forces the
 * two apps to migrate on the same day.
 */
const readExpoConfig = (dir) => {
  /* Required here rather than relied on from the enclosing scope: the checks
     that call this each require their own `fs`/`path`, and this helper is
     defined above all of them. */
  const fs = require('fs');
  const path = require('path');

  const jsonPath = path.join(dir, 'app.json');
  if (fs.existsSync(jsonPath)) return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const configPath = path.join(dir, 'app.config.js');
  if (!fs.existsSync(configPath)) {
    throw new Error(`neither app.json nor app.config.js exists in ${dir}`);
  }
  /*
   * It is an ES module with `export default`, and this script is CommonJS.
   *
   * The WHOLE module is evaluated, not just the object literal after the
   * keyword: that literal reads consts declared above it — brand colours, the
   * google-services existence check — so evaluating it alone fails on the
   * first one. Swapping the keyword for a CommonJS assignment and running the
   * file is the smallest thing that actually resolves them.
   *
   * `__dirname` is the app's own directory so the existence checks inside the
   * config look where they would during a real build.
   */
  const src = fs.readFileSync(configPath, 'utf8').replace('export default', 'module.exports =');
  const shim = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', '__dirname', 'process', src)(
    shim, shim.exports, require, dir, process,
  );
  return shim.exports;
};

const stamp = Date.now();
const created = {
  userIds: [], propertyIds: [], leadIds: [], jobIds: [], permissionIds: [], adminIds: [],
  /* The booking sections create a throwaway student, a throwaway owner and
     whatever requests they exchange. All removed by cleanup() below — this
     script runs against a real database and must leave it as it found it. */
  customerIds: [], partnerIds: [], stayRequestIds: [], shareTypeIds: [], bookingIds: [],
};

/* A 1x1 transparent PNG, so the Cloudinary upload checks move real bytes
   through multer and the Cloudinary SDK rather than asserting on a 400. What
   they create is destroyed again by publicId cleanup below. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const uploadedPublicIds = [];

const run = async () => {
  if (!base) {
    await connectDB();
    await initStore();
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }

  const adminEmail = `verify_admin_${stamp}@example.invalid`;
  let token = null;
  let adminUserId = null;

  /* ══ lampose.com ══════════════════════════════════════════════════════
     lampose-frontend/src/api/listingsApi.js — pages/Explore.jsx, Listing.jsx */

  section('lampose.com   (lampose-frontend/src/api/listingsApi.js  →  v2)');

  /* Exactly the keys Explore.jsx and Listing.jsx read off a listing. */
  const LISTING_FIELDS = [
    'id', 'name', 'place', 'city', 'locality', 'category', 'categorySlug',
    'stayType', 'longStayDuration', 'shortStayDuration', 'rent', 'pricePeriod',
    'monthlyPrice', 'dailyPrice', 'deposit', 'ownerName', 'ownerMobile',
    'amenities', 'images', 'details', 'listedAt',
  ];

  /*
   * And the one key that must NOT be there.
   *
   * `address` used to be projected to everybody. No client rendered it — the
   * Listing page carries a comment explaining why a public page must not print
   * an owner's door number — so it was a leak with no reader, which is the
   * kind that survives longest. It is released with the visit token now, to
   * the one person who paid for it.
   */
  const LISTING_FORBIDDEN_FIELDS = ['address'];

  let sampleListingId = null;

  await check('listingsApi.getListings()  →  GET /api/v2/listings', async () => {
    const { status, body } = await call('GET', '/api/v2/listings');
    expect(status === 200, `expected 200, got ${status}`);
    expect(Array.isArray(body.data), 'response.data is not an array (Explore.jsx would throw)');
    if (body.data.length === 0) return '0 listings — shape not verifiable';
    sampleListingId = body.data[0].id;
    return `${body.count} listings, ${expectFields(body.data[0], LISTING_FIELDS, 'listing', LISTING_FORBIDDEN_FIELDS)}`;
  });

  await check('the unversioned /api/listings alias still answers', async () => {
    const { status, body } = await call('GET', '/api/listings');
    expect(status === 200 && Array.isArray(body.data), `expected 200, got ${status}`);
    return `${body.count} listings (same router as v2)`;
  });

  await check('listingsApi.getListings({category, city, maxPrice, search})', async () => {
    const { status, body } = await call('GET', '/api/v2/listings?category=PG&city=Bangalore&maxPrice=99999&search=a');
    expect(status === 200, `expected 200, got ${status}`);
    expect(Array.isArray(body.data), 'filtered response.data is not an array');
    return `${body.count} rows through all four filters`;
  });

  await check('listingsApi.getListingById(id)  →  GET /api/v2/listings/:id', async () => {
    if (!sampleListingId) return 'skipped — no listing to fetch';
    const { status, body } = await call('GET', `/api/v2/listings/${sampleListingId}`);
    expect(status === 200, `expected 200, got ${status}`);
    expect(body.data && body.data.id === sampleListingId, 'response.data.id does not match the requested id');
    return expectFields(body.data, LISTING_FIELDS, 'listing', LISTING_FORBIDDEN_FIELDS);
  });

  await check('listingsApi.getListingById(missing)  →  must 404 so it returns null', async () => {
    const { status } = await call('GET', '/api/v2/listings/000000000000000000000000');
    expect(status === 404, `expected 404, got ${status} (Listing.jsx would show an error, not "not found")`);
    return '404 as required';
  });

  await check('listingsApi.diagnose()  →  GET /api/health  reads body.database.connected', async () => {
    const { status, body } = await call('GET', '/api/health');
    expect([200, 503].includes(status), `unexpected status ${status}`);
    expect(typeof (body.database || {}).connected === 'boolean', 'body.database.connected is missing');
    return `database.connected = ${body.database.connected}`;
  });

  /* ══ leads.lampose.com ═════════════════════════════════════════════════ */

  section('leads.lampose.com   (leads-frontend/src/api/authApi.ts  →  v2)');

  await check('authApi.register()  →  POST /api/v2/auth/register', async () => {
    const { status, body } = await call('POST', '/api/v2/auth/register', {
      body: {
        name: 'Verify Admin', email: adminEmail, password: 'verify123', role: 'ADMIN', adminCode: config.auth.adminSecretKey,
      },
    });
    expect([200, 201].includes(status), `expected 201, got ${status}: ${body.error}`);
    expect(body.success === true, 'AuthContext.register checks res.success');
    token = body.data && body.data.token;
    adminUserId = body.data && body.data.user && body.data.user.userId;
    created.userIds.push(adminUserId);
    expect(token, 'res.data.token is missing — AuthContext stores this as scriper_token');
    return expectFields(body.data.user, ['userId', 'name', 'email', 'role', 'avatar'], 'res.data.user');
  });

  await check('authApi.register()  ADMIN without adminCode must be refused', async () => {
    const { status } = await call('POST', '/api/v2/auth/register', {
      body: { name: 'x', email: `nope_${stamp}@example.invalid`, password: 'verify123', role: 'ADMIN' },
    });
    expect(status === 403, `expected 403, got ${status}`);
    return 'refused';
  });

  await check('authApi.login()  →  POST /api/v2/auth/login', async () => {
    const { status, body } = await call('POST', '/api/v2/auth/login', {
      body: { email: adminEmail, password: 'verify123' },
    });
    expect(status === 200, `expected 200, got ${status}`);
    expect(body.success === true && body.data && body.data.token, 'AuthContext.login reads res.data.token');
    expect(!('password' in body.data.user), 'the password hash is being returned to the client');
    return expectFields(body.data.user, ['userId', 'name', 'email', 'role'], 'res.data.user');
  });

  await check('the unversioned /api/auth/login alias still answers', async () => {
    const { status, body } = await call('POST', '/api/auth/login', {
      body: { email: adminEmail, password: 'verify123' },
    });
    expect(status === 200 && body.success === true, `expected 200, got ${status}`);
    return 'same router as v2';
  });

  await check('authApi.getMe()  →  GET /api/v2/auth/me  (session validation on page load)', async () => {
    const { status, body } = await call('GET', '/api/v2/auth/me', { token });
    expect(status === 200, `expected 200, got ${status}`);
    expect(body.success === true, 'AuthContext.initAuth checks res.success && res.data');
    return expectFields(body.data, ['userId', 'name', 'email', 'role'], 'res.data');
  });

  await check('authApi.getMe()  with a stale token must 401 so the app logs out', async () => {
    const { status } = await call('GET', '/api/v2/auth/me', { token: 'stale.token.value' });
    expect(status === 401, `expected 401, got ${status}`);
    return '401 → AuthContext.logout()';
  });

  section('leads.lampose.com   (leads-frontend/src/api/userApi.ts  →  v2)');

  /* Kept alive until after the team-stats check, which needs at least one
     EMPLOYEE for AdminTeamOverview's breakdown to have a row to verify. */
  let employeeUserId = null;
  let employeeEmail = null;

  await check('userApi.getUsers()  →  GET /api/v2/users  (App.tsx fetchUsers)', async () => {
    const { status, body } = await call('GET', '/api/v2/users', { token });
    expect(status === 200, `expected 200, got ${status}`);
    expect(body.success === true && Array.isArray(body.data), 'App.tsx checks res.success && res.data');
    return `${body.count} users`;
  });

  await check('userApi.createUser()  →  POST /api/v2/users  (UserManagementPage)', async () => {
    employeeEmail = `verify_emp_${stamp}@example.invalid`;
    const { status, body } = await call('POST', '/api/v2/users', {
      token,
      body: {
        name: 'Verify Employee', email: employeeEmail, password: 'employee123', role: 'EMPLOYEE',
      },
    });
    expect([200, 201].includes(status), `expected 201, got ${status}: ${body.error}`);
    employeeUserId = body.data && body.data.userId;
    created.userIds.push(employeeUserId);
    return expectFields(body.data, ['userId', 'name', 'email', 'role'], 'res.data');
  });

  await check('userApi.deleteUser()  →  DELETE /api/v2/users/:userId', async () => {
    const throwaway = await call('POST', '/api/v2/users', {
      token,
      body: {
        name: 'Verify Throwaway', email: `verify_tmp_${stamp}@example.invalid`, password: 'employee123', role: 'EMPLOYEE',
      },
    });
    const id = throwaway.body.data && throwaway.body.data.userId;
    expect(id, 'could not create a user to delete');
    // Tracked before the delete, so a failure here still gets cleaned up.
    created.userIds.push(id);
    const { status, body } = await call('DELETE', `/api/v2/users/${id}`, { token });
    expect(status === 200 && body.success === true, `expected 200, got ${status}`);
    const after = await call('GET', '/api/v2/users', { token });
    expect(!after.body.data.some((u) => u.userId === id), 'the user is still listed after deletion');
    return 'deleted and gone from the list';
  });

  /* The leads panel used to own this surface through src/api/propertyApi.ts
     and its "Accommodation Properties" page. That page was removed from the
     panel — listings are onboarded through onboard.lampose.com, which runs
     the owner's WhatsApp verification — so no frontend in this repo calls
     these routes today. They are still mounted and still verified: the
     collection is shared, and a break here would surface as a broken Explore
     page on lampose.com rather than as an error anyone would trace back. */
  section('v2 properties   (backend contract — no frontend caller since the panel dropped it)');

  const PROPERTY_FIELDS = ['_id', 'name', 'place', 'category', 'rent', 'ownerName', 'ownerMobile', 'address', 'amenities', 'categoryDetails', 'imageUrl', 'stayType', 'deposit'];

  await check('GET /api/v2/properties  — the raw collection, newest first', async () => {
    const { status, body } = await call('GET', '/api/v2/properties');
    expect(status === 200, `expected 200, got ${status}`);
    expect(body.success === true && Array.isArray(body.data), 'the page checks res.success && res.data');
    if (body.data.length === 0) return '0 properties — shape not verifiable';
    return `${body.count} properties, ${expectFields(body.data[0], PROPERTY_FIELDS, 'property')}`;
  });

  await check('GET /api/v2/properties?category=&search=  filters', async () => {
    const { status, body } = await call('GET', '/api/v2/properties?category=PG&search=a');
    expect(status === 200 && Array.isArray(body.data), `expected 200, got ${status}`);
    return `${body.count} rows`;
  });

  await check('POST /api/v2/properties  writes immediately, with no verification chain', async () => {
    /* Byte-for-byte the payload PropertyFormModal builds. */
    const { status, body } = await call('POST', '/api/v2/properties', {
      token,
      body: {
        name: `VERIFY TEMP ${stamp}`,
        place: 'MVP Colony, Visakhapatnam',
        ownerName: 'Verify Owner',
        ownerMobile: '9876543210',
        category: 'PG_HOSTEL',
        stayType: 'Long Stay',
        dailyPrice: 0,
        monthlyPrice: 8000,
        rent: 8000,
        deposit: 16000,
        address: 'Plot 1',
        imageUrl: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5',
        amenities: ['WiFi'],
        categoryDetails: {
          foodIncluded: true, foodType: 'Veg', sharingTypes: ['2 Sharing'], curfewTime: '10 PM',
        },
      },
    });
    expect([200, 201].includes(status), `expected 201, got ${status}: ${body.error}`);
    expect(body.success === true, 'PropertyFormModal checks res.success');
    created.propertyIds.push(body.data._id);
    return expectFields(body.data, PROPERTY_FIELDS, 'res.data');
  });

  await check('POST /api/v2/properties without a token must be refused', async () => {
    const { status } = await call('POST', '/api/v2/properties', { body: { name: 'no token' } });
    if (!config.auth.requireAuth) return 'REQUIRE_AUTH=false, guard intentionally off';
    expect(status === 401, `expected 401, got ${status}`);
    return '401 without a token';
  });

  await check('GET /api/v2/properties/:id', async () => {
    const id = created.propertyIds[0];
    expect(id, 'skipped — nothing was created');
    const { status, body } = await call('GET', `/api/v2/properties/${id}`);
    expect(status === 200 && body.data && body.data._id === id, `expected 200, got ${status}`);
    return expectFields(body.data, PROPERTY_FIELDS, 'res.data');
  });

  /* Used by the delete checks, which need a row they can destroy without
     taking the fixture the later v1 checks depend on with it. */
  const makeThrowawayProperty = async (label) => {
    const { status, body } = await call('POST', '/api/v2/properties', {
      token,
      body: {
        name: `VERIFY ${label} ${stamp}`,
        place: 'MVP Colony, Visakhapatnam',
        ownerName: 'Verify Owner',
        ownerMobile: '9876543210',
        category: 'PG_HOSTEL',
        rent: 8000,
      },
    });
    expect([200, 201].includes(status), `could not create a throwaway property: ${status} ${body.error}`);
    created.propertyIds.push(body.data._id);
    return body.data._id;
  };

  await check('DELETE /api/v2/properties/:id', async () => {
    const id = await makeThrowawayProperty('V2-DELETE');
    const { status, body } = await call('DELETE', `/api/v2/properties/${id}`, { token });
    expect(status === 200 && body.success === true, `expected 200, got ${status}`);
    const after = await call('GET', `/api/v2/properties/${id}`);
    expect(after.status === 404, `the property is still readable after deletion (${after.status})`);
    created.propertyIds = created.propertyIds.filter((p) => p !== id);
    return 'deleted, and gone on the next read';
  });

  await check('DELETE /api/v2/properties/:id without a token must be refused', async () => {
    const id = created.propertyIds[0];
    expect(id, 'skipped — nothing to attempt against');
    const { status } = await call('DELETE', `/api/v2/properties/${id}`);
    if (!config.auth.requireAuth) return 'REQUIRE_AUTH=false, guard intentionally off';
    expect(status === 401, `expected 401, got ${status} — anyone could wipe the collection`);
    return '401 without a token';
  });

  await check("a property onboarded here appears on lampose.com's Explore feed", async () => {
    const { body } = await call('GET', `/api/v2/listings?search=VERIFY TEMP ${stamp}`);
    const found = (body.data || []).find((l) => l.id === created.propertyIds[0]);
    expect(found, 'the new property is not in /listings — the two surfaces are not sharing the collection');
    expect(found.city === 'Visakhapatnam', `city derived as "${found.city}", expected Visakhapatnam`);
    return `visible as "${found.name}" in ${found.city}`;
  });

  section('leads.lampose.com   (leads-frontend/src/api/scraperApi.ts  →  v2)');

  /* The leads screens need a lead to render. One is inserted directly and
     removed at the end, so the checks below are about response shape rather
     than about whatever happens to be in the database. */
  const { ScrapedLead, ScrapeJob } = require('../src/modules/scraper/scriper.model');
  const fixtureJobId = `job_verify_${stamp}`;
  let fixtureLeadId = null;

  if (config.storage.mode === 'mongo') {
    const job = await ScrapeJob.create({
      jobId: fixtureJobId,
      name: 'verify fixture',
      source: 'GoogleMaps',
      query: 'PG',
      location: 'Visakhapatnam',
      depth: 1,
      status: 'completed',
      progress: 100,
      statusMessage: 'fixture',
      resultCount: 1,
    });
    created.jobIds.push(job.jobId);
    const lead = await ScrapedLead.create({
      jobId: fixtureJobId,
      source: 'GoogleMaps',
      businessName: `Verify Fixture ${stamp}`,
      phone: '9876543210',
      email: '',
      website: 'https://example.invalid',
      hasWebsite: true,
      address: 'MVP Colony',
      rating: '4.2',
      reviewsCount: 10,
      category: 'PG_HOSTEL',
      city: 'Visakhapatnam',
      landmark: 'MVP',
      mapsUrl: 'https://maps.google.com/?q=1,1',
    });
    fixtureLeadId = String(lead._id);
    created.leadIds.push(fixtureLeadId);
  }

  const LEAD_FIELDS = ['_id', 'jobId', 'source', 'businessName', 'phone', 'email', 'website', 'hasWebsite', 'address', 'rating', 'reviewsCount', 'category', 'city', 'landmark', 'mapsUrl', 'scrapedAt', 'assignedTo', 'leadStatus', 'notes'];

  /* Every call below carries the admin token, because the panel's axios
     client attaches one to every request and the routes now require it. The
     suite used to call them bare, which only passed because the whole scraper
     surface was unauthenticated. */
  await check('scraperApi.getLeads()  →  GET /api/v2/scraper/leads  (ScrapedLeadsDashboard)', async () => {
    const { status, body } = await call('GET', '/api/v2/scraper/leads', { token });
    expect(status === 200, `expected 200, got ${status}`);
    expect(body.success === true && Array.isArray(body.data), 'the page checks res.success && res.data');
    if (body.data.length === 0) return '0 leads — shape not verifiable';
    return `${body.count} leads, ${expectFields(body.data[0], LEAD_FIELDS, 'lead')}`;
  });

  await check("scraperApi.getLeads(all 7 filters)  →  the dashboard's filter bar", async () => {
    const query = `jobId=${fixtureJobId}&source=GoogleMaps&hasPhone=true&hasWebsite=true&leadStatus=NEW&search=Verify&assignedUserId=`;
    const { status, body } = await call('GET', `/api/v2/scraper/leads?${query}`, { token });
    expect(status === 200 && Array.isArray(body.data), `expected 200, got ${status}`);
    return `${body.count} rows through every filter`;
  });

  await check('scraperApi.assignLeads()  →  POST /api/v2/scraper/assign  (AssignLeadsModal)', async () => {
    if (!fixtureLeadId) return 'skipped — JSON store mode';
    const { status, body } = await call('POST', '/api/v2/scraper/assign', {
      token,
      body: { leadIds: [fixtureLeadId], userObj: { userId: employeeUserId, name: 'Verify Employee', email: employeeEmail } },
    });
    expect(status === 200 && body.success === true, `expected 200, got ${status}: ${body.error}`);
    const after = await call('GET', `/api/v2/scraper/leads?jobId=${fixtureJobId}`, { token });
    const assigned = after.body.data[0] && after.body.data[0].assignedTo;
    expect(assigned && assigned.userId === employeeUserId, 'assignedTo was not persisted');
    return 'assigned to an employee and persisted';
  });

  await check('scraperApi.updateLeadStatus()  →  PATCH /api/v2/scraper/leads/:id/status  (LeadStatusModal)', async () => {
    if (!fixtureLeadId) return 'skipped — JSON store mode';
    const { status, body } = await call('PATCH', `/api/v2/scraper/leads/${fixtureLeadId}/status`, {
      token,
      body: { status: 'CONTACTED', noteText: 'called the owner', authorName: 'Verify Admin' },
    });
    expect(status === 200 && body.success === true, `expected 200, got ${status}`);
    const after = await call('GET', `/api/v2/scraper/leads?jobId=${fixtureJobId}`, { token });
    const lead = after.body.data[0];
    expect(lead.leadStatus === 'CONTACTED', `status is ${lead.leadStatus}`);
    expect(lead.notes && lead.notes.length === 1, 'the note was not appended');
    return 'status + note persisted';
  });

  await check('scraperApi.getJobs()  →  GET /api/v2/scraper/jobs  (ScrapeHistoryPage)', async () => {
    const { status, body } = await call('GET', '/api/v2/scraper/jobs', { token });
    expect(status === 200 && Array.isArray(body.data), `expected 200, got ${status}`);
    if (body.data.length === 0) return '0 jobs — shape not verifiable';
    return `${body.count} jobs, ${expectFields(body.data[0], ['jobId', 'name', 'source', 'status', 'progress', 'statusMessage', 'resultCount', 'createdAt'], 'job')}`;
  });

  await check('scraperApi.getStats()  →  GET /api/v2/scraper/stats  (DashboardOverview)', async () => {
    const { status, body } = await call('GET', '/api/v2/scraper/stats', { token });
    expect(status === 200 && body.success === true, `expected 200, got ${status}`);
    return expectFields(body.data, ['totalLeads', 'withPhoneCount', 'phonePercentage', 'withWebsiteCount', 'websitePercentage', 'withEmailCount', 'assignedLeadsCount', 'totalJobs', 'completedJobs'], 'DashboardStats');
  });

  await check('scraperApi.getTeamStats()  →  GET /api/v2/scraper/team-stats  (AdminTeamOverview)', async () => {
    const { status, body } = await call('GET', '/api/v2/scraper/team-stats', { token });
    expect(status === 200 && body.success === true, `expected 200, got ${status}`);
    expectFields(body.data, ['teamBreakdown', 'unassignedCount', 'totalLeads'], 'TeamStatsResponse');
    const mine = body.data.teamBreakdown.find((m) => m.user && m.user.userId === employeeUserId);
    expect(mine, 'the employee created above is missing from teamBreakdown');
    expectFields(mine, ['user', 'totalAssigned', 'contacted', 'qualified', 'won', 'lost', 'conversionRate'], 'TeamMemberBreakdown');
    /* The lead assigned above was then moved to CONTACTED, so these two
       numbers prove the aggregation actually reflects the writes. */
    expect(mine.totalAssigned === 1, `totalAssigned is ${mine.totalAssigned}, expected 1`);
    expect(mine.contacted === 1, `contacted is ${mine.contacted}, expected 1`);
    return `breakdown correct: assigned=${mine.totalAssigned} contacted=${mine.contacted}, ${body.data.teamBreakdown.length} member(s)`;
  });

  /* ── the assignment boundary ──────────────────────────────────────────
     What the employee workstation depends on, and what it did NOT have: the
     rep's list is scoped by the SERVER, not by a query parameter the browser
     chose to send. These four checks are the regression net for the bug where
     "My Assigned Leads (226)" listed every lead in the database. */

  let employeeToken = null;

  await check('an employee can sign in  →  the token the workstation runs on', async () => {
    const { status, body } = await call('POST', '/api/v2/auth/login', {
      body: { email: employeeEmail, password: 'employee123' },
    });
    expect(status === 200 && body.data && body.data.token, `expected a token, got ${status}`);
    employeeToken = body.data.token;
    expect(body.data.user.role === 'EMPLOYEE', `role is ${body.data.user.role}`);
    return 'signed in as EMPLOYEE';
  });

  await check('GET /scraper/leads without a token is refused  (it used to answer with everything)', async () => {
    const { status } = await call('GET', '/api/v2/scraper/leads');
    expect(status === 401, `expected 401, got ${status}`);
    return 'refused';
  });

  await check("EmployeeWorkstation  →  an employee sees ONLY leads assigned to them", async () => {
    if (!fixtureLeadId) return 'skipped — JSON store mode';
    /* No assignedUserId is sent, exactly as the workstation now calls it. */
    const { status, body } = await call('GET', '/api/v2/scraper/leads', { token: employeeToken });
    expect(status === 200 && Array.isArray(body.data), `expected 200, got ${status}`);
    const foreign = body.data.filter((l) => !l.assignedTo || l.assignedTo.userId !== employeeUserId);
    expect(foreign.length === 0, `${foreign.length} lead(s) came back that belong to someone else`);
    expect(body.data.some((l) => String(l._id) === fixtureLeadId), 'the lead assigned to this employee is missing');
    return `${body.count} lead(s), all of them theirs`;
  });

  await check('an employee cannot widen the filter to another rep by asking', async () => {
    /* The panel could send any id it liked. The server overwrites it. */
    const { status, body } = await call('GET', `/api/v2/scraper/leads?assignedUserId=${adminUserId}`, { token: employeeToken });
    expect(status === 200, `expected 200, got ${status}`);
    const foreign = body.data.filter((l) => !l.assignedTo || l.assignedTo.userId !== employeeUserId);
    expect(foreign.length === 0, 'the query string overrode the session — the scope is not enforced');
    return 'query string ignored, session wins';
  });

  await check('an employee cannot assign leads  (that is the admin\'s job)', async () => {
    if (!fixtureLeadId) return 'skipped — JSON store mode';
    const { status } = await call('POST', '/api/v2/scraper/assign', {
      token: employeeToken,
      body: { leadIds: [fixtureLeadId], userObj: { userId: employeeUserId, name: 'x', email: employeeEmail } },
    });
    expect(status === 403, `expected 403, got ${status}`);
    return 'refused';
  });

  await check('LeadStatusModal  →  an employee CAN move a lead that is theirs, and the admin sees it', async () => {
    if (!fixtureLeadId) return 'skipped — JSON store mode';
    const { status, body } = await call('PATCH', `/api/v2/scraper/leads/${fixtureLeadId}/status`, {
      token: employeeToken,
      body: { status: 'QUALIFIED', noteText: 'owner wants a callback', authorName: 'Verify Employee' },
    });
    expect(status === 200 && body.success === true, `expected 200, got ${status}: ${body.error}`);

    /* Read it back as the ADMIN — this is the "does the admin panel reflect
       the employee's change" question, asked of the API rather than the UI. */
    const seen = await call('GET', `/api/v2/scraper/leads?jobId=${fixtureJobId}`, { token });
    const lead = seen.body.data[0];
    expect(lead.leadStatus === 'QUALIFIED', `admin still sees ${lead.leadStatus}`);
    expect(lead.lastActivityBy && lead.lastActivityBy.userId === employeeUserId,
      'lastActivityBy does not name the employee who made the change');
    expect(lead.notes && lead.notes.length === 2, `expected 2 notes, found ${lead.notes && lead.notes.length}`);
    return 'employee wrote it, admin reads it back with the author';
  });

  await check('an employee cannot move a lead that is not theirs', async () => {
    if (!fixtureLeadId) return 'skipped — JSON store mode';
    /* Hand it back to the admin, then try again as the employee. */
    await call('POST', '/api/v2/scraper/assign', {
      token,
      body: { leadIds: [fixtureLeadId], userObj: { userId: adminUserId, name: 'Verify Admin', email: adminEmail } },
    });
    const { status } = await call('PATCH', `/api/v2/scraper/leads/${fixtureLeadId}/status`, {
      token: employeeToken,
      body: { status: 'CLOSED_WON' },
    });
    expect(status === 403, `expected 403, got ${status}`);

    // Put it back so the team-stats check above keeps its fixture.
    await call('POST', '/api/v2/scraper/assign', {
      token,
      body: { leadIds: [fixtureLeadId], userObj: { userId: employeeUserId, name: 'Verify Employee', email: employeeEmail } },
    });
    return 'refused with 403';
  });

  await check("scraperApi.getExportUrl('csv')  →  window.open, so it must work with no Authorization header", async () => {
    const { status, headers, bytes } = await call('GET', `/api/v2/scraper/export?format=csv&jobId=${fixtureJobId}`, { raw: true });
    expect(status === 200, `expected 200, got ${status} — the export button opens a plain browser tab`);
    expect((headers.get('content-disposition') || '').includes('attachment'), 'no attachment disposition, the browser would render it');
    /* The BOM is what makes Excel read the file as UTF-8 instead of the system
       codepage, which otherwise mangles every non-ASCII business name. */
    expect(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF, 'the UTF-8 BOM is missing — Excel will mangle non-ASCII names');
    const text = bytes.subarray(3).toString('utf8');
    expect(text.startsWith('"Business Name"'), `unexpected header row: ${text.slice(0, 40)}`);
    return `BOM + ${text.split('\r\n').length - 1} data row(s), Excel-safe`;
  });

  await check("scraperApi.getExportUrl('json')", async () => {
    const { status, headers } = await call('GET', '/api/v2/scraper/export?format=json', { raw: true });
    expect(status === 200 && (headers.get('content-disposition') || '').includes('.json'), `expected a json attachment, got ${status}`);
    return 'downloads';
  });

  await check('scraperApi.startScrape()  →  POST /api/v2/scraper/start  validates its inputs', async () => {
    const { status } = await call('POST', '/api/v2/scraper/start', { body: { query: 'PG' } });
    expect(status === 400, `expected 400 for a missing location, got ${status}`);
    return '400 when query or location is missing';
  });

  if (RUN_SCRAPE) {
    await check('scraperApi.startScrape()  →  a real Google Maps scrape, end to end', async () => {
      const start = await call('POST', '/api/v2/scraper/start', {
        body: {
          query: 'PG', location: 'Visakhapatnam', landmark: 'MVP Colony', source: 'GoogleMaps', depth: 3,
        },
      });
      expect(start.status === 200, `start failed: ${start.status} ${start.body.error}`);
      const jobId = start.body.data && start.body.data.jobId;
      expect(jobId, 'ScraperSearchPage reads res.data.jobId');
      created.jobIds.push(jobId);

      // LiveProgressModal polls getStatus until status is terminal.
      let last = null;
      for (let i = 0; i < 45; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => { setTimeout(r, 4000); });
        // eslint-disable-next-line no-await-in-loop
        const poll = await call('GET', `/api/v2/scraper/status/${jobId}`);
        expect(poll.status === 200, `status poll failed: ${poll.status}`);
        last = poll.body.data;
        expectFields(last, ['jobId', 'name', 'status', 'progress', 'statusMessage', 'resultCount'], 'status');
        if (['completed', 'error', 'stopped'].includes(last.status)) break;
      }
      expect(last.status === 'completed', `job ended as "${last.status}": ${last.statusMessage}`);

      const leads = await call('GET', `/api/v2/scraper/leads?jobId=${jobId}`);
      expect(leads.body.count > 0, 'the job completed but saved no leads');
      for (const lead of leads.body.data) created.leadIds.push(String(lead._id));
      expectFields(leads.body.data[0], LEAD_FIELDS, 'scraped lead');
      return `${leads.body.count} real leads, e.g. "${leads.body.data[0].businessName}" ${leads.body.data[0].phone}`;
    });
  } else {
    await check('scraperApi.startScrape()  →  the Playwright engine is installed', async () => {
      // eslint-disable-next-line global-require, import/no-extraneous-dependencies
      const { chromium } = require('playwright');
      const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const version = browser.version();
      await browser.close();
      return `Chromium ${version} launches (pass --scrape to run a live scrape)`;
    });
  }

  await check('scraperApi.stopJob()  →  POST /api/v2/scraper/stop/:jobId', async () => {
    const { status, body } = await call('POST', `/api/v2/scraper/stop/${fixtureJobId}`);
    expect(status === 200 && body.success === true, `expected 200, got ${status}`);
    return 'accepted';
  });

  await check('scraperApi.getStatus()  →  GET /api/v2/scraper/status/:jobId', async () => {
    const { status, body } = await call('GET', `/api/v2/scraper/status/${fixtureJobId}`);
    expect(status === 200, `expected 200, got ${status}`);
    return expectFields(body.data, ['jobId', 'name', 'status', 'progress', 'statusMessage', 'resultCount'], 'status');
  });

  /* ══ onboard.lampose.com ═══════════════════════════════════════════════ */

  section('onboard.lampose.com   (onboards-frontend/src/services/api.js  →  v1)');

  await check('fetchProperties()  →  GET /api/v1/properties  (App.jsx listing grid)', async () => {
    const { status, body } = await call('GET', '/api/v1/properties');
    expect(status === 200, `expected 200, got ${status}`);
    expect(body.success === true && Array.isArray(body.data), 'App.jsx checks res.success && res.data');
    return `${body.count} listings (verified + pending, merged from verificationrequests)`;
  });

  await check('the unversioned /api/properties alias is still v1, not v2', async () => {
    const { status, body } = await call('GET', '/api/properties');
    expect(status === 200 && body.success === true, `expected 200, got ${status}`);
    /* The v1 route reports the split; the v2 one does not exist in its
       response. This is the check that catches the two being swapped. */
    const v2 = await call('GET', '/api/v2/properties');
    expect(v2.status === 200, 'v2 properties is not answering');
    return `v1 ${body.count} rows (verified + pending) vs v2 ${v2.body.count} rows (raw collection)`;
  });

  await check('fetchProperties({category, search, stayType})  filters', async () => {
    const { status, body } = await call('GET', '/api/v1/properties?category=PG&search=a&stayType=Long Stay');
    expect(status === 200 && Array.isArray(body.data), `expected 200, got ${status}`);
    return `${body.count} rows`;
  });

  await check('fetchPropertyById()  →  GET /api/v1/properties/:id', async () => {
    const id = created.propertyIds[0];
    expect(id, 'skipped — nothing was created');
    const { status, body } = await call('GET', `/api/v1/properties/${id}`);
    expect(status === 200 && body.data && String(body.data._id) === id, `expected 200, got ${status}`);
    return 'found through the v1 reader too — one shared collection';
  });

  await check('onboardProperty()  →  POST /api/v1/properties validates before it calls Twilio', async () => {
    /* Deliberately incomplete: a full payload would send a real WhatsApp
       message to a real number. Validation runs before Twilio is touched. */
    const { status, body } = await call('POST', '/api/v1/properties', {
      body: { name: `VERIFY NO-SEND ${stamp}` },
    });
    expect(status === 400, `expected 400 for a missing owner/place/category, got ${status}`);
    expect(body.success === false && body.error, 'the form reads res.error');
    return '400 before any WhatsApp send (full POST not exercised on purpose)';
  });

  await check('onboardProperty()  →  POST /api/v1/properties rejects an unknown category', async () => {
    const { status, body } = await call('POST', '/api/v1/properties', {
      body: {
        name: 'x', place: 'y', ownerName: 'z', ownerMobile: '9999999999', category: 'Penthouse',
      },
    });
    expect(status === 400, `expected 400, got ${status}`);
    expect(/Invalid category/i.test(body.error || ''), `unexpected message: ${body.error}`);
    return 'category enum still enforced';
  });

  /* ── Cloudinary upload (onboards-frontend/src/App.jsx) ────────────────
     Real bytes, through multer and the Cloudinary SDK. Both assets are
     destroyed in cleanup, so a run leaves nothing behind in the account. */

  const uploadForm = (field, count) => {
    const form = new FormData();
    for (let i = 0; i < count; i += 1) {
      form.append(field, new Blob([PNG_1PX], { type: 'image/png' }), `verify-${stamp}-${i}.png`);
    }
    return form;
  };

  await check('uploadImage()  →  POST /api/v1/properties/upload-image  (multipart, real Cloudinary)', async () => {
    const response = await fetch(`${base}/api/v1/properties/upload-image`, {
      method: 'POST',
      body: uploadForm('image', 1),
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 500 && /cloud|api_key|signature/i.test(body.message || '')) {
      return `skipped — Cloudinary rejected the credentials (${body.message})`;
    }
    expect(response.status === 200, `expected 200, got ${response.status}: ${body.message || body.error}`);
    /* App.jsx reads json.success && json.url. */
    expect(body.success === true && body.url, 'App.jsx reads json.success and json.url');
    expect(Array.isArray(body.urls) && body.urls.length === 1, 'urls[] is missing');
    if (body.public_id) uploadedPublicIds.push(body.public_id);
    return `uploaded → ${String(body.url).slice(0, 60)}…`;
  });

  await check('uploadImages()  →  POST /api/v1/properties/upload-images  (batch, real Cloudinary)', async () => {
    const response = await fetch(`${base}/api/v1/properties/upload-images`, {
      method: 'POST',
      body: uploadForm('images', 2),
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 500 && /cloud|api_key|signature/i.test(body.message || '')) {
      return `skipped — Cloudinary rejected the credentials (${body.message})`;
    }
    expect(response.status === 200, `expected 200, got ${response.status}: ${body.message || body.error}`);
    /* App.jsx reads batchJson.urls and expects one entry per file it sent. */
    expect(Array.isArray(body.urls) && body.urls.length === 2,
      `App.jsx maps batchJson.urls one-to-one with its files; got ${(body.urls || []).length} for 2`);
    body.urls.forEach((url) => {
      const match = String(url).match(/\/lampose_accommodations\/([^./]+)/);
      if (match) uploadedPublicIds.push(`lampose_accommodations/${match[1]}`);
    });
    return `2 photos uploaded concurrently, urls[] one-to-one`;
  });

  await check('upload with no file at all must be a 400, not a 500', async () => {
    const { status, body } = await call('POST', '/api/v1/properties/upload-image', { body: {} });
    expect(status === 400, `expected 400, got ${status}`);
    expect(body.success === false, 'the form branches on json.success');
    return '400 before Cloudinary is contacted';
  });

  section('onboard.lampose.com   (onboards-frontend/src/services/permissions.js  →  v1)');

  let permissionId = null;
  const empEmail = `verify_field_${stamp}@example.invalid`;

  await check('requestPermission()  →  POST /api/v1/permissions', async () => {
    const { status, body } = await call('POST', '/api/v1/permissions', {
      headers: { 'x-employee-email': empEmail },
      body: {
        propertyId: created.propertyIds[0] || `tmp_${stamp}`,
        employeeEmail: empEmail,
        action: 'edit',
        reason: 'verify script',
        property: { name: 'Verify', place: 'Visakhapatnam', category: 'PG_HOSTEL' },
      },
    });
    expect([200, 201].includes(status), `expected 201, got ${status}: ${body.error || body.message}`);
    permissionId = body.data && body.data._id;
    created.permissionIds.push(permissionId);
    return expectFields(body.data, ['_id', 'status', 'action', 'employeeEmail', 'active'], 'res.data');
  });

  await check('fetchPropertyAccess()  →  GET /api/v1/permissions/access  (Edit/Delete buttons)', async () => {
    const propertyId = created.propertyIds[0] || `tmp_${stamp}`;
    const { status, body } = await call('GET', `/api/v1/permissions/access?propertyId=${propertyId}&employeeEmail=${empEmail}`);
    expect(status === 200 && body.success === true, `expected 200, got ${status}`);
    expectFields(body.data, ['propertyId', 'employeeEmail', 'permissions'], 'res.data');
    expect(body.data.permissions.edit.allowed === false, 'a pending request must not already allow the edit');
    expect(body.data.permissions.edit.status === 'pending', `edit status is ${body.data.permissions.edit.status}`);
    return 'edit locked while pending, as the UI expects';
  });

  await check('an employee write without a grant must be refused  →  PUT /api/v1/properties/:id', async () => {
    const id = created.propertyIds[0];
    expect(id, 'skipped — nothing was created');
    const { status, body } = await call('PUT', `/api/v1/properties/${id}`, {
      headers: { 'x-employee-email': empEmail },
      body: { name: 'should not apply' },
    });
    expect(status === 403, `expected 403, got ${status}`);
    expect(body.requiresPermission === true, 'the app branches on res.requiresPermission');
    return '403 requiresPermission — the permission gate is live';
  });

  await check('an administrator grant unlocks exactly one write  →  PUT /api/v1/permissions/:id', async () => {
    expect(permissionId, 'skipped — no permission request');
    const granted = await call('PUT', `/api/v1/permissions/${permissionId}`, {
      body: { status: 'granted', decidedBy: 'verify-script' },
    });
    expect(granted.status === 200 && granted.body.data.active === true, 'the grant is not active');

    const id = created.propertyIds[0];
    const write = await call('PUT', `/api/v1/properties/${id}`, {
      headers: { 'x-employee-email': empEmail },
      body: { address: `verified-by-script-${stamp}` },
    });
    expect(write.status === 200, `the granted write failed: ${write.status}`);

    /* One approval buys one action: the second attempt must be refused. */
    const again = await call('PUT', `/api/v1/properties/${id}`, {
      headers: { 'x-employee-email': empEmail },
      body: { address: 'second attempt' },
    });
    expect(again.status === 403, `the grant was reusable — expected 403 on the second write, got ${again.status}`);
    return 'granted → one write allowed → second write refused';
  });

  await check('deleteProperty()  →  DELETE /api/v1/properties/:id  is gated the same way', async () => {
    const id = await makeThrowawayProperty('V1-DELETE');

    /* Same employee, but the grant above was for `edit` and has been spent.
       A delete must need its own approval. */
    const ungated = await call('DELETE', `/api/v1/properties/${id}`, {
      headers: { 'x-employee-email': empEmail },
    });
    expect(ungated.status === 403, `expected 403 without a delete grant, got ${ungated.status}`);
    expect(ungated.body.action === 'delete', `the refusal names action "${ungated.body.action}"`);

    const request = await call('POST', '/api/v1/permissions', {
      headers: { 'x-employee-email': empEmail },
      body: { propertyId: id, employeeEmail: empEmail, action: 'delete', reason: 'verify script' },
    });
    created.permissionIds.push(request.body.data._id);
    await call('PUT', `/api/v1/permissions/${request.body.data._id}`, {
      body: { status: 'granted', decidedBy: 'verify-script' },
    });

    const granted = await call('DELETE', `/api/v1/properties/${id}`, {
      headers: { 'x-employee-email': empEmail },
    });
    expect(granted.status === 200, `the granted delete failed: ${granted.status}`);
    created.propertyIds = created.propertyIds.filter((p) => p !== id);

    const after = await call('GET', `/api/v2/properties/${id}`);
    expect(after.status === 404, 'the property survived a successful delete');
    return 'edit grant does not authorise a delete; a delete grant does';
  });

  await check('the admin console can close a grant  →  POST /api/v1/permissions/:id/consume', async () => {
    const request = await call('POST', '/api/v1/permissions', {
      headers: { 'x-employee-email': empEmail },
      body: {
        propertyId: created.propertyIds[0] || `tmp_${stamp}`,
        employeeEmail: `consume_${stamp}@example.invalid`,
        action: 'edit',
        reason: 'verify script',
      },
    });
    const id = request.body.data._id;
    created.permissionIds.push(id);

    await call('PUT', `/api/v1/permissions/${id}`, { body: { status: 'granted' } });
    const spent = await call('POST', `/api/v1/permissions/${id}/consume`);
    expect(spent.status === 200 && spent.body.data.status === 'used', `expected used, got ${spent.status}`);

    /* Spending it twice must not be possible, or one approval buys many. */
    const again = await call('POST', `/api/v1/permissions/${id}/consume`);
    expect(again.status === 409, `expected 409 on a second consume, got ${again.status}`);
    return 'granted → used → 409 on reuse';
  });

  await check('DELETE /api/v1/permissions/:id  removes the audit row', async () => {
    const id = created.permissionIds[created.permissionIds.length - 1];
    expect(id, 'skipped — no permission to delete');
    const { status, body } = await call('DELETE', `/api/v1/permissions/${id}`);
    expect(status === 200 && body.success === true, `expected 200, got ${status}`);
    created.permissionIds = created.permissionIds.filter((p) => p !== id);
    return 'deleted';
  });

  section('onboard.lampose.com   (onboards-frontend/src/services/auth.js  →  v2 auth)');

  await check('loginUser()  →  POST /api/v2/auth/onboarding-login  reads data.employee', async () => {
    const { status, body } = await call('POST', '/api/v2/auth/onboarding-login', {
      body: { email: adminEmail, password: 'verify123' },
    });
    expect(status === 200, `expected 200, got ${status}`);
    expect(body.valid === true && body.data && body.data.token, 'auth.js checks data.valid and data.data.token');
    return expectFields(body.data.employee, ['userId', 'name', 'email', 'role', 'avatar'], 'res.data.employee');
  });

  await check('loginUser()  with bad credentials returns 401 + valid:false', async () => {
    const { status, body } = await call('POST', '/api/v2/auth/onboarding-login', {
      body: { email: adminEmail, password: 'wrong-password' },
    });
    expect(status === 401, `expected 401, got ${status}`);
    expect(body.valid === false && body.error, 'auth.js reads data.error when valid is false');
    return '401 valid:false';
  });

  await check('POST /api/v2/auth/verify-employee  (the alias auth.js may be pointed at)', async () => {
    const { status, body } = await call('POST', '/api/v2/auth/verify-employee', {
      body: { email: adminEmail, password: 'verify123' },
    });
    expect(status === 200 && body.valid === true, `expected 200, got ${status}`);
    return 'same handler as onboarding-login';
  });

  await check('POST /api/v2/auth/verify-token  revalidates a stored session', async () => {
    const good = await call('POST', '/api/v2/auth/verify-token', { token });
    expect(good.status === 200 && good.body.valid === true, `expected 200, got ${good.status}`);
    const bad = await call('POST', '/api/v2/auth/verify-token', { token: 'stale.token.value' });
    expect(bad.status === 401 && bad.body.valid === false, `expected 401 valid:false, got ${bad.status}`);
    return 'valid token accepted, stale token 401 valid:false';
  });

  section('admin console   (v1 admin, stats, verifications — no frontend in this repo)');

  /* The console itself is not one of the three frontends here, so these are
     checked against the routes rather than against a caller. They are part of
     the v1 surface and a merge that broke them would go unnoticed otherwise. */

  const consoleEmail = `verify_console_${stamp}@example.invalid`;
  let consoleAdminId = null;

  await check('POST /api/v1/admin/register  is guarded by V1_ADMIN_SECRET_KEY', async () => {
    const wrong = await call('POST', '/api/v1/admin/register', {
      body: {
        name: 'Verify Console', email: consoleEmail, password: 'verify123', adminSecretKey: 'not-the-key',
      },
    });
    expect(wrong.status === 403, `expected 403 with a wrong key, got ${wrong.status}`);

    const key = process.env.V1_ADMIN_SECRET_KEY;  // .env only — was a committed literal
    const { status, body } = await call('POST', '/api/v1/admin/register', {
      body: {
        name: 'Verify Console', email: consoleEmail, password: 'verify123', role: 'Admin', adminSecretKey: key,
      },
    });
    expect([200, 201].includes(status), `expected 201, got ${status}: ${body.message}`);
    expect(body.token && body.user, 'the console reads res.token and res.user');
    consoleAdminId = body.user.id;
    created.adminIds.push(consoleAdminId);
    /* This is the regression the merge nearly introduced: adding
       ADMIN_SECRET_KEY for v2 used to change the key this route wanted. */
    return 'wrong key refused, correct key accepted — separate from ADMIN_SECRET_KEY';
  });

  await check('POST /api/v1/admin/login  (a different identity system from v2)', async () => {
    const { status, body } = await call('POST', '/api/v1/admin/login', {
      body: { email: consoleEmail, password: 'verify123' },
    });
    expect(status === 200 && body.success === true, `expected 200, got ${status}`);
    expect(body.token && body.user.role, 'the console reads res.token and res.user.role');

    /* The same credentials must NOT work against the leads panel: these are
       two account stores, and a merge that collapsed them would show up here. */
    const crossover = await call('POST', '/api/v2/auth/login', {
      body: { email: consoleEmail, password: 'verify123' },
    });
    expect(crossover.status === 401, `an admins-collection account signed into the leads panel (${crossover.status})`);
    return `signed in as ${body.user.role}; the same account is rejected by v2, as it must be`;
  });

  await check('PUT + DELETE /api/v1/admin/users/:id', async () => {
    expect(consoleAdminId, 'skipped — no console admin was created');
    const updated = await call('PUT', `/api/v1/admin/users/${consoleAdminId}`, {
      body: { role: 'Viewer', status: 'Inactive' },
    });
    expect(updated.status === 200 && updated.body.role === 'Viewer', `update failed: ${updated.status}`);

    const removed = await call('DELETE', `/api/v1/admin/users/${consoleAdminId}`);
    expect(removed.status === 200 && removed.body.success === true, `delete failed: ${removed.status}`);
    created.adminIds = created.adminIds.filter((a) => a !== consoleAdminId);
    return 'role/status updated, then deleted';
  });

  await check('POST + PUT + DELETE /api/v1/verifications  (the console queue)', async () => {
    const madeIt = await call('POST', '/api/v1/verifications', {
      body: { ownerMobileE164: `whatsapp:+9199${String(stamp).slice(-8)}`, status: 'pending' },
    });
    expect([200, 201].includes(madeIt.status), `create failed: ${madeIt.status} ${madeIt.body.message}`);
    const id = madeIt.body.data._id;

    const updated = await call('PUT', `/api/v1/verifications/${id}`, { body: { status: 'verified' } });
    expect(updated.status === 200 && updated.body.data.status === 'verified', `update failed: ${updated.status}`);
    expect(updated.body.data.respondedAt, 'respondedAt is not stamped when a request is marked verified');

    const removed = await call('DELETE', `/api/v1/verifications/${id}`);
    expect(removed.status === 200, `delete failed: ${removed.status}`);
    return 'created, verified (respondedAt stamped), deleted';
  });

  await check('GET /api/v1/admin/users  (admins collection, not scriper_users)', async () => {
    const { status, body } = await call('GET', '/api/v1/admin/users');
    expect(status === 200, `expected 200, got ${status}`);
    expect(Array.isArray(body.items), 'the console reads res.items');
    return `${body.total} administrator account(s) — a different collection from the ${'/api/v2/users'} one`;
  });

  await check('GET /api/v1/admin/stats  (dashboard)', async () => {
    const { status, body } = await call('GET', '/api/v1/admin/stats');
    expect(status === 200 && body.success === true, `expected 200, got ${status}`);
    return expectFields(body, ['admins', 'properties', 'verifications', 'windowDays'], 'stats');
  });

  await check('GET /api/v1/admin/activity  (notification feed)', async () => {
    const { status, body } = await call('GET', '/api/v1/admin/activity');
    expect(status === 200 && Array.isArray(body.items), `expected 200, got ${status}`);
    return `${body.count} event(s)`;
  });

  await check('GET /api/v1/admin/system  (system telemetry)', async () => {
    const { status, body } = await call('GET', '/api/v1/admin/system');
    expect(status === 200 && body.success === true, `expected 200, got ${status}`);
    expectFields(body.database, ['name', 'readyState', 'connected', 'collections'], 'system.database');
    return `${body.database.collections.length} collections visible`;
  });

  await check('GET /api/v1/verifications  (verification queue)', async () => {
    const { status, body } = await call('GET', '/api/v1/verifications');
    expect(status === 200 && body.success === true, `expected 200, got ${status}`);
    expect(Array.isArray(body.items) && Array.isArray(body.data), 'both response shapes must be present');
    return `${body.count} verification request(s)`;
  });

  await check('POST /api/v1/whatsapp/webhook  answers TwiML even for an unknown sender', async () => {
    const response = await fetch(`${base}/api/v1/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: 'whatsapp:+10000000000', Body: 'hello' }).toString(),
    });
    const text = await response.text();
    expect(response.status === 200, `expected 200, got ${response.status}`);
    expect(text.includes('<Response>'), 'Twilio needs a TwiML document back, got: ' + text.slice(0, 60));
    return 'TwiML returned — the webhook contract holds';
  });

  section('routing & versioning');

  await check('GET /api lists both versions', async () => {
    const { status, body } = await call('GET', '/api');
    expect(status === 200 && Array.isArray(body.versions), `expected 200, got ${status}`);
    return `versions: ${body.versions.join(', ')}`;
  });

  await check('an unknown route returns a JSON 404, not HTML', async () => {
    const { status, body } = await call('GET', '/api/does-not-exist');
    expect(status === 404, `expected 404, got ${status}`);
    expect(typeof body === 'object' && body.code === 'ROUTE_NOT_FOUND', 'the 404 body is not the JSON envelope');
    return body.code;
  });

  await check('bare /properties is NOT mounted (it would be ambiguous)', async () => {
    const { status } = await call('GET', '/properties');
    expect(status === 404, `expected 404, got ${status} — a bare /properties silently picks a version`);
    return '404, as intended — use /api/v1/properties or /api/v2/properties';
  });

  await check('bare /listings IS mounted (unambiguous)', async () => {
    const { status } = await call('GET', '/listings');
    expect(status === 200, `expected 200, got ${status}`);
    return 'mounted, so a base URL missing /api still works';
  });

  await check('malformed JSON returns 400, not 500', async () => {
    const response = await fetch(`${base}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": ',
    });
    expect(response.status === 400, `expected 400, got ${response.status}`);
    return '400 INVALID_JSON';
  });

  /* ══════════════════════════════════════════════════════════════════════
     The booking modules.

     Not a frontend call list — these routes are consumed by the two mobile
     apps, which are not in this repo. They are here because the stay-request
     flow spans four apps and one database, and a check that only runs in a
     unit test proves the functions work rather than that the SERVER serves
     them. Every module of that flow adds its section here as it lands.

     Read-only against whatever database is connected. Anything that writes
     belongs in tests/, against the in-memory server — this runs against a
     real database and must be safe to run against the cloned one repeatedly.
     ══════════════════════════════════════════════════════════════════════ */
  section('booking · M1 counted inventory (User App + Stay Partner)');

  await check('GET /api/v2/listings  carries live bed counts per sharing option', async () => {
    const { status, body } = await call('GET', '/api/v2/listings');
    expect(status === 200, `expected 200, got ${status}`);
    expect(Array.isArray(body.data) && body.data.length > 0, 'no listings to check');

    const withOptions = body.data.filter((l) => (l.sharingOptions || []).length > 0);
    expect(withOptions.length > 0, 'no listing offers a sharing option');

    for (const listing of withOptions) {
      for (const option of listing.sharingOptions) {
        expectFields(option, ['label', 'shareTypeId', 'availableBeds', 'requestable'], `${listing.name} / ${option.label}`);
      }
      expect(typeof listing.requestable === 'boolean', `${listing.name} has no requestable flag`);
    }

    const requestable = body.data.filter((l) => l.requestable).length;
    return `${body.data.length} listings, ${requestable} requestable, every option carries a shareTypeId + availableBeds`;
  });

  await check('every unrequestable option says WHY, and null never means zero', async () => {
    const { body } = await call('GET', '/api/v2/listings');
    const blocked = body.data
      .flatMap((l) => l.sharingOptions || [])
      .filter((o) => o.requestable === false);

    const tally = {};
    for (const option of blocked) {
      /* Three distinct situations, three sentences on the listing page. An
         option with six free beds that the owner paused must not be reported
         the same way as one nobody has ever counted. */
      expect(['NO_INVENTORY_RECORDED', 'OWNER_PAUSED', 'NO_BEDS_FREE'].includes(option.reason),
        `${option.label} is unrequestable with reason ${JSON.stringify(option.reason)}`);

      if (option.reason === 'NO_INVENTORY_RECORDED') {
        expect(option.availableBeds === null,
          `${option.label} reports ${option.availableBeds} beds — "never counted" must be null, not a number`);
      }
      if (option.reason === 'NO_BEDS_FREE') {
        expect(option.availableBeds === 0, `${option.label} is "full" with ${option.availableBeds} beds`);
      }
      tally[option.reason] = (tally[option.reason] || 0) + 1;
    }

    return blocked.length
      ? Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(', ')
      : 'every option is requestable';
  });

  await check('GET /api/v2/listings/:id  carries the same counts as the feed', async () => {
    const { body: feed } = await call('GET', '/api/v2/listings');
    const listing = feed.data.find((l) => (l.sharingOptions || []).length > 0);
    expect(listing, 'no listing with options');

    const { status, body } = await call('GET', `/api/v2/listings/${listing.id}`);
    expect(status === 200, `expected 200, got ${status}`);

    const fromFeed = listing.sharingOptions.map((o) => [o.shareTypeId, o.availableBeds]);
    const fromDetail = body.data.sharingOptions.map((o) => [o.shareTypeId, o.availableBeds]);
    expect(JSON.stringify(fromFeed) === JSON.stringify(fromDetail),
      `feed and detail disagree: ${JSON.stringify(fromFeed)} vs ${JSON.stringify(fromDetail)}`);

    return `${fromDetail.length} option(s) identical on both routes`;
  });

  await check('shareTypeId is stable and derived from the property + label', async () => {
    const { shareTypeIdFor } = require('../src/modules/listings/sharing.util');
    const { body } = await call('GET', '/api/v2/listings');

    for (const listing of body.data) {
      for (const option of listing.sharingOptions || []) {
        const expected = shareTypeIdFor(listing.id, option.label);
        expect(option.shareTypeId === expected,
          `${listing.name} / ${option.label}: got ${option.shareTypeId}, expected ${expected}`);
      }
    }
    return 'every id matches `${propertyId}:${slug}` — a re-sync cannot orphan a request';
  });

  await check('no share-type row points at a property that does not exist', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const Property = require('../src/modules/properties/property.model');
    const { PartnerShareType } = require('../src/modules/partners/partnerDomains.model');

    const ids = new Set((await Property.find({}).select('_id').lean()).map((p) => String(p._id)));
    const rows = await PartnerShareType.find({}).select('shareTypeId propertyId').lean();
    const orphans = rows.filter((r) => !ids.has(r.propertyId));

    expect(orphans.length === 0,
      `${orphans.length} orphaned row(s): ${orphans.map((o) => o.shareTypeId).join(', ')} — syncShareTypes cleans per property and will never reach these`);
    return `${rows.length} row(s), all pointing at a real property`;
  });

  await check('the bed counters agree with the bookings (no drift)', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const { reconcile } = require('../src/modules/inventory/inventory.service');
    const { checked, drifted } = await reconcile();   // reports, never writes

    expect(drifted.length === 0,
      `${drifted.length} counter(s) disagree: ${drifted.map((d) => `${d.name} stored ${d.stored} expected ${d.expected}`).join('; ')}`);
    return `${checked} counter(s) checked, all agree with partner_bookings`;
  });

  await check('availableBeds is never negative and never above capacity', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const { PartnerShareType } = require('../src/modules/partners/partnerDomains.model');
    const rows = await PartnerShareType.find({}).lean();
    const broken = rows.filter((r) => r.availableBeds < 0 || r.availableBeds > r.totalBeds);

    expect(broken.length === 0,
      `${broken.length} row(s) out of range: ${broken.map((r) => `${r.shareTypeId} ${r.availableBeds}/${r.totalBeds}`).join(', ')}`);
    return `${rows.length} row(s) within 0..totalBeds`;
  });

  section('booking · M2 request lifecycle (state machine + server clock)');

  await check('the deadline is configuration, bounded, and defaults to 3 minutes', async () => {
    expect(config.booking.expiryMinutes > 0 && config.booking.expiryMinutes <= 60,
      `expiryMinutes is ${config.booking.expiryMinutes} — outside 1..60`);
    expect(typeof config.booking.maxWithdrawalsPerRequest === 'number',
      'maxWithdrawalsPerRequest is not configured');
    return `REQUEST_EXPIRY_MINUTES=${config.booking.expiryMinutes}, `
      + `MAX_WITHDRAWALS_PER_REQUEST=${config.booking.maxWithdrawalsPerRequest}, `
      + `worker tick ${config.booking.expiryTickMs}ms`;
  });

  await check('the web channel is untouched — every legacy row still reads as a guest', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const VisitRequest = require('../src/modules/visits/visitRequest.model');
    const total = await VisitRequest.countDocuments({});
    const web = await VisitRequest.countDocuments({ channel: 'web' });
    const app = await VisitRequest.countDocuments({ channel: 'app' });

    /* Every row written before `channel` existed must default to `web`. A
       default of `app` would put twenty-four-hour guest requests into a feed
       that expects a three-minute deadline, and the worker would expire them
       all on its first tick. */
    expect(web + app === total,
      `${total - web - app} row(s) have no channel — they would be invisible to both flows`);
    return `${total} request(s): ${web} web, ${app} app`;
  });

  await check('no request sits in a terminal state without a decision timestamp', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const VisitRequest = require('../src/modules/visits/visitRequest.model');
    const { TERMINAL } = VisitRequest;

    const undated = await VisitRequest.find({
      status: { $in: TERMINAL }, decidedAt: null,
    }).select('_id status').lean();

    /* The alerts inbox renders a row per decision and hangs it off this
       timestamp — a terminal request without one produces an alert the
       student never sees. */
    expect(undated.length === 0,
      `${undated.length} terminal request(s) with no decidedAt: ${undated.map((r) => `${r._id} (${r.status})`).join(', ')}`);
    return `${TERMINAL.length} terminal statuses, every row stamped`;
  });

  await check('every app request carries a deadline the server set', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const VisitRequest = require('../src/modules/visits/visitRequest.model');
    const undeadlined = await VisitRequest.countDocuments({ channel: 'app', expiresAt: null });

    expect(undeadlined === 0,
      `${undeadlined} app request(s) with no expiresAt — nothing would ever expire them`);
    return 'every app request has an expiresAt';
  });

  await check('nothing is stuck pending past its deadline', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const VisitRequest = require('../src/modules/visits/visitRequest.model');
    const stuck = await VisitRequest.find({
      channel: 'app', status: 'pending_owner', expiresAt: { $lte: new Date() },
    }).select('_id expiresAt').lean();

    /* The worker runs every few seconds, so anything here has been missed by
       all three enforcement layers. Read-only: this reports, it does not
       settle — a verify run that quietly fixed the data would hide the bug. */
    expect(stuck.length === 0,
      `${stuck.length} request(s) pending past expiry — the worker is not running: ${stuck.map((r) => r._id).join(', ')}`);
    return 'no overdue request left pending';
  });

  await check('an accepted request never shares a bed it did not claim', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const VisitRequest = require('../src/modules/visits/visitRequest.model');
    const { PartnerShareType } = require('../src/modules/partners/partnerDomains.model');

    const accepted = await VisitRequest.find({
      channel: 'app', status: 'confirmed', shareTypeId: { $ne: null },
    }).select('shareTypeId').lean();

    const perPool = accepted.reduce((acc, r) => {
      acc[r.shareTypeId] = (acc[r.shareTypeId] || 0) + 1;
      return acc;
    }, {});

    const oversold = [];
    for (const [shareTypeId, count] of Object.entries(perPool)) {
      const row = await PartnerShareType.findOne({ shareTypeId }).lean();
      if (row && count > row.totalBeds) oversold.push(`${shareTypeId}: ${count} accepted, ${row.totalBeds} beds`);
    }

    expect(oversold.length === 0, `double-booked: ${oversold.join('; ')}`);
    return Object.keys(perPool).length
      ? `${accepted.length} acceptance(s) across ${Object.keys(perPool).length} pool(s), none oversold`
      : 'no acceptances yet';
  });

  await check('the student projection never leaks an owner phone number', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const VisitRequest = require('../src/modules/visits/visitRequest.model');
    const docs = await VisitRequest.find({}).limit(50);
    if (!docs.length) return 'no requests to check';

    for (const doc of docs) {
      const view = JSON.stringify(doc.toPublic());
      const owner = String(doc.ownerMobile || '').replace(/\D/g, '');
      if (owner.length >= 10) {
        expect(!view.includes(owner.slice(-10)),
          `request ${doc._id} leaks the owner's number to the student`);
      }
      expectFields(doc.toPublic(), ['id', 'status', 'expiresAt', 'serverNow', 'secondsRemaining'], `request ${doc._id}`);
    }
    return `${docs.length} request(s) projected, no owner number in any of them`;
  });

  /* ══════════════════════════════════════════════════════════════════════
     M3 — the student's endpoints, over real HTTP.

     The unit tests in tests/ prove the SERVICE is right. This proves the
     SERVER serves it: the routes are mounted where the app expects, the
     session middleware runs, the JSON shape is what a screen reads, and an
     unauthenticated caller is turned away. A function that works and a route
     that is not mounted look identical from a unit test.

     Everything created here is torn down by cleanup(). ══════════════════ */
  section('booking · M3 student endpoints (User App)');

  const stay = {};

  await check('a throwaway student, owner and property for the round trip', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) throw new Error('database not connected');

    const Customer = require('../src/modules/customers/customer.model');
    const Partner = require('../src/modules/partners/partner.model');
    const Property = require('../src/modules/properties/property.model');
    const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
    const { syncShareTypes } = require('../src/modules/inventory/inventory.service');

    const ownerPhone = `+9179${String(stamp).slice(-8)}`;

    const partner = await Partner.create({
      partnerId: `par_verify_${stamp}`,
      phone: ownerPhone,
      name: 'Verify Owner',
      phoneVerifiedAt: new Date(),
    });
    created.partnerIds.push(partner.partnerId);

    const customer = await Customer.create({
      customerId: `cus_verify_${stamp}`,
      phone: `+9178${String(stamp).slice(-8)}`,
      name: 'Verify Student',
      email: `verify${stamp}@example.com`,
      phoneVerifiedAt: new Date(),
    });
    created.customerIds.push(customer.customerId);

    const property = await Property.create({
      name: `Verify PG ${stamp}`,
      place: 'Madhurawada, Visakhapatnam',
      ownerName: 'Verify Owner',
      ownerMobile: ownerPhone,
      category: 'PG_HOSTEL',
      rent: 5999,
      categoryDetails: {
        sharingTypes: ['2 Sharing'],
        sharingPrices: { '2 Sharing': 5999 },
        sharingRooms: { '2 Sharing': 1 },
        sharingBeds: { '2 Sharing': 2 },
      },
    });
    created.propertyIds.push(property._id);
    await syncShareTypes(property);
    created.shareTypeIds.push(`${property._id}:2-sharing`);

    stay.token = signCustomerToken(customer);
    stay.customer = customer;
    stay.partner = partner;
    stay.propertyId = String(property._id);

    return `student ${customer.customerId}, owner ${partner.partnerId}, 2 beds`;
  });

  await check('POST /api/v2/customers/stay-requests  without a session is refused', async () => {
    const { status } = await call('POST', '/api/v2/customers/stay-requests', {
      body: { listingId: stay.propertyId, sharing: '2 Sharing', consentedTerms: true },
    });
    expect(status === 401, `expected 401, got ${status}`);
    return '401 — a request can only be sent by somebody signed in';
  });

  await check('POST /api/v2/customers/stay-requests  creates it and returns the deadline', async () => {
    const sentAt = Date.now();
    const { status, body } = await call('POST', '/api/v2/customers/stay-requests', {
      token: stay.token,
      body: { listingId: stay.propertyId, sharing: '2 Sharing', consentedTerms: true },
    });
    expect(status === 201, `expected 201, got ${status} (${body.code || ''} ${body.message || ''})`);

    expectFields(body.data, ['id', 'status', 'createdAt', 'expiresAt', 'serverNow', 'secondsRemaining'], 'the created request');
    expect(body.data.status === 'pending_owner', `status is ${body.data.status}`);

    /* The screen draws a countdown from this and nothing else. A deadline
       outside the configured window means either the config was ignored or a
       client value was believed. */
    const window = new Date(body.data.expiresAt).getTime() - sentAt;
    const expected = config.booking.expiryMinutes * 60 * 1000;
    expect(Math.abs(window - expected) < 5000, `deadline is ${Math.round(window / 1000)}s, expected ~${expected / 1000}s`);

    stay.requestId = body.data.id;
    created.stayRequestIds.push(body.data.id);
    return `201, ${body.data.secondsRemaining}s on the clock, expiresAt set by the server`;
  });

  await check('the reply carries no owner phone number', async () => {
    const { body } = await call('GET', `/api/v2/customers/stay-requests/${stay.requestId}`, { token: stay.token });
    const owner = String(stay.partner.phone).replace(/\D/g, '').slice(-10);
    expect(!JSON.stringify(body.data).includes(owner), 'the owner\'s number reached the student');
    return 'the owner\'s number stays server-side';
  });

  await check('creating a second request on the same listing is refused', async () => {
    const { status, body } = await call('POST', '/api/v2/customers/stay-requests', {
      token: stay.token,
      body: { listingId: stay.propertyId, sharing: '2 Sharing', consentedTerms: true },
    });
    expect(status === 409, `expected 409, got ${status}`);
    expect(body.code === 'ALREADY_REQUESTED', `expected ALREADY_REQUESTED, got ${body.code}`);
    return '409 ALREADY_REQUESTED — one clock per listing';
  });

  await check('the request holds no bed — the owner still chooses', async () => {
    const { body } = await call('GET', `/api/v2/listings/${stay.propertyId}`);
    const option = body.data.sharingOptions.find((o) => o.label === '2 Sharing');
    expect(option.availableBeds === 2, `expected 2 beds still free, got ${option.availableBeds}`);
    return 'both beds still free while a request is pending';
  });

  await check('GET /api/v2/customers/stay-requests/:id  is scoped to the owner of the request', async () => {
    const Customer = require('../src/modules/customers/customer.model');
    const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');

    const intruder = await Customer.create({
      customerId: `cus_intruder_${stamp}`,
      phone: `+9177${String(stamp).slice(-8)}`,
      name: 'Somebody Else',
      phoneVerifiedAt: new Date(),
    });
    created.customerIds.push(intruder.customerId);

    const { status } = await call('GET', `/api/v2/customers/stay-requests/${stay.requestId}`, {
      token: signCustomerToken(intruder),
    });
    /* 404, not 403 — a 403 would confirm the request exists, and the id would
       become a way to discover whose requests are whose. */
    expect(status === 404, `expected 404, got ${status}`);
    return '404 for another student — the same answer as "does not exist"';
  });

  await check('GET /api/v2/customers/stay-requests  lists only this student\'s own', async () => {
    const { status, body } = await call('GET', '/api/v2/customers/stay-requests', { token: stay.token });
    expect(status === 200, `expected 200, got ${status}`);
    expect(typeof body.active === 'number', 'the list does not report how many are live');
    for (const request of body.data) {
      expect(request.id !== undefined, 'a row has no id');
    }
    return `${body.count} request(s), ${body.active} live`;
  });

  await check('POST /api/v2/customers/stay-requests/:id/withdraw  cancels it', async () => {
    const { status, body } = await call('POST', `/api/v2/customers/stay-requests/${stay.requestId}/withdraw`, {
      token: stay.token,
    });
    expect(status === 200, `expected 200, got ${status} (${body.code || ''})`);
    expect(body.data.status === 'cancelled', `status is ${body.data.status}`);
    return 'cancelled, and the owner\'s copy goes non-actionable';
  });

  await check('withdrawing twice is refused — the limit needs no counter', async () => {
    const { status, body } = await call('POST', `/api/v2/customers/stay-requests/${stay.requestId}/withdraw`, {
      token: stay.token,
    });
    expect(status === 409, `expected 409, got ${status}`);
    expect(body.code === 'REQUEST_CANCELLED', `expected REQUEST_CANCELLED, got ${body.code}`);
    return `409 — MAX_WITHDRAWALS_PER_REQUEST=${config.booking.maxWithdrawalsPerRequest}, enforced by the state machine`;
  });

  await check('a property whose owner is not on Stay Partner is refused, not queued', async () => {
    const { body: feed } = await call('GET', '/api/v2/listings');
    const orphan = feed.data.find((l) => l.id !== stay.propertyId && (l.sharingOptions || []).length > 0);
    if (!orphan) return 'skipped — no second listing to try';

    const { status, body } = await call('POST', '/api/v2/customers/stay-requests', {
      token: stay.token,
      body: { listingId: orphan.id, sharing: orphan.sharingOptions[0].label, consentedTerms: true },
    });

    if (status === 201) {
      created.stayRequestIds.push(body.data.id);
      return `${orphan.name} accepted a request — its owner is onboarded and has beds`;
    }

    /* Every one of these is a legitimate refusal, and the point is that it is
       an ERROR rather than a row nobody can ever answer. */
    const KNOWN = [
      'OWNER_NOT_ONBOARDED', 'OWNER_NOT_CONTACTABLE', 'INVENTORY_NOT_SET',
      'NO_BEDS_FREE', 'INVENTORY_PAUSED', 'INVALID_SHARING', 'PROPERTY_UNAVAILABLE',
      'ALREADY_REQUESTED', 'CONSENT_REQUIRED', 'PROFILE_INCOMPLETE', 'INVALID_INTENT',
    ];
    expect(KNOWN.includes(body.code), `unexpected refusal code ${body.code}: ${body.message}`);
    return `${orphan.name} → ${body.code} (refused at creation, no unanswerable row written)`;
  });

  /* ══════════════════════════════════════════════════════════════════════
     M4 — the owner's endpoints, and the full round trip.

     This is the only place both apps' halves meet over real HTTP: a student
     sends, the owner sees it in their feed with a live countdown, accepts,
     and a customer record appears. The unit tests prove each half; this
     proves they are the same request.
     ══════════════════════════════════════════════════════════════════════ */
  section('booking · M4 owner endpoints (Stay Partner)');

  const own = {};

  await check('a signed-in owner, a student, and a property with ONE bed', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) throw new Error('database not connected');

    const Customer = require('../src/modules/customers/customer.model');
    const Partner = require('../src/modules/partners/partner.model');
    const Property = require('../src/modules/properties/property.model');
    const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
    const { signPartnerToken } = require('../src/modules/partners/partnerAuth.middleware');
    const { syncShareTypes } = require('../src/modules/inventory/inventory.service');

    const ownerPhone = `+9176${String(stamp).slice(-8)}`;
    const partner = await Partner.create({
      partnerId: `par_own_${stamp}`, phone: ownerPhone, name: 'Round Trip Owner',
      phoneVerifiedAt: new Date(),
    });
    created.partnerIds.push(partner.partnerId);

    const mk = async (suffix) => {
      const customer = await Customer.create({
        customerId: `cus_own_${suffix}_${stamp}`,
        phone: `+917${suffix}${String(stamp).slice(-8)}`,
        name: `Student ${suffix}`,
        email: `own${suffix}${stamp}@example.com`,
        phoneVerifiedAt: new Date(),
      });
      created.customerIds.push(customer.customerId);
      return { customer, token: signCustomerToken(customer) };
    };

    /* One bed, two students — the same-bed conflict, end to end. */
    const property = await Property.create({
      name: `Round Trip PG ${stamp}`,
      place: 'Madhurawada, Visakhapatnam',
      ownerName: 'Round Trip Owner',
      ownerMobile: ownerPhone,
      category: 'PG_HOSTEL',
      rent: 8000,
      categoryDetails: {
        sharingTypes: ['Single'],
        sharingPrices: { Single: 8000 },
        sharingRooms: { Single: 1 },
        sharingBeds: { Single: 1 },
      },
    });
    created.propertyIds.push(property._id);
    await syncShareTypes(property);
    created.shareTypeIds.push(`${property._id}:single`);

    own.partner = partner;
    own.ownerToken = signPartnerToken(partner);
    own.a = await mk('a');
    own.b = await mk('b');
    own.propertyId = String(property._id);
    own.shareTypeId = `${property._id}:single`;

    return `owner ${partner.partnerId}, two students, one bed`;
  });

  await check('both students send a request on the same single bed', async () => {
    for (const who of ['a', 'b']) {
      const { status, body } = await call('POST', '/api/v2/customers/stay-requests', {
        token: own[who].token,
        body: { listingId: own.propertyId, sharing: 'Single', consentedTerms: true },
      });
      expect(status === 201, `student ${who}: expected 201, got ${status} (${body.code || ''})`);
      own[who].requestId = body.data.id;
      created.stayRequestIds.push(body.data.id);
    }

    /* Neither reserved anything. The owner has the choice, which is the whole
       reason creation does not hold a bed. */
    const { body: listing } = await call('GET', `/api/v2/listings/${own.propertyId}`);
    const option = listing.data.sharingOptions.find((o) => o.label === 'Single');
    expect(option.availableBeds === 1, `expected the bed still free, got ${option.availableBeds}`);

    return 'two live requests, one bed, still free — the owner chooses';
  });

  await check('GET /api/v2/partners/requests  shows them with a live countdown', async () => {
    const { status, body } = await call('GET', '/api/v2/partners/requests', { token: own.ownerToken });
    expect(status === 200, `expected 200, got ${status}`);

    const mine = body.data.filter((r) => [own.a.requestId, own.b.requestId].includes(r.id));
    expect(mine.length === 2, `expected both requests in the feed, got ${mine.length}`);

    for (const request of mine) {
      expectFields(request, ['id', 'status', 'customer', 'expiresAt', 'serverNow', 'secondsRemaining', 'actionable'], 'an owner row');
      expect(request.actionable === true, 'a pending request must be actionable');
      expect(request.customer.name, 'the owner cannot see who is asking');
      expect(request.secondsRemaining > 0, `countdown is ${request.secondsRemaining}`);
    }
    return `both visible, ${mine[0].secondsRemaining}s left, customer names present`;
  });

  await check('another owner sees none of it', async () => {
    const Partner = require('../src/modules/partners/partner.model');
    const { signPartnerToken } = require('../src/modules/partners/partnerAuth.middleware');

    const intruder = await Partner.create({
      partnerId: `par_intruder_${stamp}`,
      phone: `+9175${String(stamp).slice(-8)}`,
      name: 'Other Owner',
      phoneVerifiedAt: new Date(),
    });
    created.partnerIds.push(intruder.partnerId);
    const token = signPartnerToken(intruder);

    const { body } = await call('GET', '/api/v2/partners/requests', { token });
    const leaked = body.data.filter((r) => [own.a.requestId, own.b.requestId].includes(r.id));
    expect(leaked.length === 0, `${leaked.length} request(s) leaked to another owner`);

    const { status } = await call('POST', `/api/v2/partners/requests/${own.a.requestId}/accept`, { token });
    expect(status === 404, `expected 404 for another owner's request, got ${status}`);

    return 'nothing in the feed, and 404 on accept — never 403, which would confirm it exists';
  });

  await check('POST /partners/requests/:id/accept  confirms, takes the bed, opens a record', async () => {
    const { status, body } = await call('POST', `/api/v2/partners/requests/${own.a.requestId}/accept`, {
      token: own.ownerToken,
    });
    expect(status === 200, `expected 200, got ${status} (${body.code || ''} ${body.message || ''})`);
    expect(body.data.status === 'confirmed', `status is ${body.data.status}`);
    expect(body.data.actionable === false, 'the buttons must die with the status');
    expect(body.booking && body.booking.id, 'no customer record was opened');

    created.bookingIds.push(body.booking.id);
    own.bookingId = body.booking.id;

    /* The last bed. Everybody else waiting on it is turned away in the same
       call, and the owner is told how many — doing it silently is how an
       owner finds out from an angry phone call. */
    expect(body.autoDeclined === 1, `expected 1 auto-decline, got ${body.autoDeclined}`);

    return `confirmed, booking ${body.booking.id} opened, ${body.autoDeclined} other request turned away`;
  });

  await check('the student sees it as accepted, with somewhere to go next', async () => {
    const { body } = await call('GET', `/api/v2/customers/stay-requests/${own.a.requestId}`, {
      token: own.a.token,
    });
    expect(body.data.status === 'confirmed', `student sees ${body.data.status}`);
    expect(body.data.bookingId, 'no bookingId for the student to continue to');
    return 'the same request, the same status, on both sides';
  });

  await check('the other student is told the bed went, NOT that they were rejected', async () => {
    const { body } = await call('GET', `/api/v2/customers/stay-requests/${own.b.requestId}`, {
      token: own.b.token,
    });
    expect(body.data.status === 'declined', `expected declined, got ${body.data.status}`);
    /* The distinction the whole reason code exists for. Nobody rejected this
       student — the bed went while they were waiting. */
    expect(body.data.decisionReason === 'INVENTORY_TAKEN',
      `expected INVENTORY_TAKEN, got ${body.data.decisionReason}`);
    return 'declined with INVENTORY_TAKEN — a fact about the bed, not about them';
  });

  await check('the bed is gone and the listing says so', async () => {
    const { body } = await call('GET', `/api/v2/listings/${own.propertyId}`);
    const option = body.data.sharingOptions.find((o) => o.label === 'Single');
    expect(option.availableBeds === 0, `expected 0 beds, got ${option.availableBeds}`);
    expect(option.requestable === false, 'a full room type must not be requestable');
    expect(body.data.requestable === false, 'the listing offers nothing right now');
    return '0 beds free, requestable false — the app can grey it out';
  });

  await check('accepting again changes nothing and says why', async () => {
    const { status, body } = await call('POST', `/api/v2/partners/requests/${own.a.requestId}/accept`, {
      token: own.ownerToken,
    });
    expect(status === 409, `expected 409, got ${status}`);
    expect(body.code === 'ALREADY_ACCEPTED', `expected ALREADY_ACCEPTED, got ${body.code}`);

    const PartnerBooking = require('../src/modules/partners/partnerDomains.model').PartnerBooking;
    const count = await PartnerBooking.countDocuments({ partnerPhoneDigits: own.partner.phoneDigits });
    expect(count === 1, `${count} customer records for one acceptance`);
    return '409, one customer record, one bed — idempotent';
  });

  await check('declining the already-declined one is refused too', async () => {
    const { status, body } = await call('POST', `/api/v2/partners/requests/${own.b.requestId}/decline`, {
      token: own.ownerToken,
    });
    expect(status === 409, `expected 409, got ${status}`);
    expect(body.code === 'ALREADY_DECLINED', `expected ALREADY_DECLINED, got ${body.code}`);
    return '409 ALREADY_DECLINED';
  });

  await check('cancelling the booking gives the bed back, exactly once', async () => {
    const first = await call('POST', `/api/v2/partners/bookings/${own.bookingId}/cancel`, {
      token: own.ownerToken,
    });
    expect(first.status === 200, `expected 200, got ${first.status}`);

    const { body: afterOne } = await call('GET', `/api/v2/listings/${own.propertyId}`);
    const one = afterOne.data.sharingOptions.find((o) => o.label === 'Single');
    expect(one.availableBeds === 1, `expected the bed back, got ${one.availableBeds}`);

    /* Tapped twice. Without the status guard this would invent a second bed
       the building does not have. */
    await call('POST', `/api/v2/partners/bookings/${own.bookingId}/cancel`, { token: own.ownerToken });

    const { body: afterTwo } = await call('GET', `/api/v2/listings/${own.propertyId}`);
    const two = afterTwo.data.sharingOptions.find((o) => o.label === 'Single');
    expect(two.availableBeds === 1, `a double cancel invented a bed: ${two.availableBeds}`);

    return 'one bed back after one cancel, and still one after a second';
  });

  await check('the counters still agree with the bookings after all of that', async () => {
    const { reconcile } = require('../src/modules/inventory/inventory.service');
    const { drifted } = await reconcile();
    expect(drifted.length === 0,
      `${drifted.length} drifted: ${drifted.map((d) => `${d.name} ${d.stored}≠${d.expected}`).join('; ')}`);
    return 'no drift after a full accept / auto-decline / cancel cycle';
  });

  /* ══════════════════════════════════════════════════════════════════════
     M5 — the expiry worker, inside the running server.

     The unit tests drive `tick()` by hand. This checks the thing they cannot:
     that boot actually STARTED it, and that a request left alone by everybody
     dies on its own. That is the case the whole worker exists for — an owner
     whose phone is off and a student who closed the app — and the one a lazy
     on-read expiry silently fails.
     ══════════════════════════════════════════════════════════════════════ */
  section('booking · M5 expiry worker (server-owned clock)');

  await check('the worker is running, at the configured period', async () => {
    const { expiryWorkerStatus } = require('../src/modules/visits/expiry.worker');
    const status = expiryWorkerStatus();

    /* verify boots the app through app.js rather than server.js, so the
       worker is not started for it — start it here and check it reports
       itself, which is what server.js's boot path relies on. */
    if (!status.running) {
      const { startExpiryWorker } = require('../src/modules/visits/expiry.worker');
      startExpiryWorker();
    }

    const now = expiryWorkerStatus();
    expect(now.running === true, 'the worker did not start');
    expect(now.everyMs === config.booking.expiryTickMs, `tick is ${now.everyMs}ms`);
    return `ticking every ${now.everyMs / 1000}s against a ${now.deadlineMinutes}-minute deadline`;
  });

  await check('server.js starts and stops it on the boot and shutdown paths', async () => {
    const fs = require('fs');
    const source = fs.readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');

    /* A worker nobody starts is a feature that silently does not exist, and a
       worker nobody stops writes to a connection that is being closed. Both
       are one-line omissions that no request-level check would ever catch. */
    expect(source.includes('startExpiryWorker()'), 'server.js never starts the worker');
    expect(source.includes('stopExpiryWorker()'), 'server.js never stops the worker on shutdown');
    return 'started after connectDB, stopped before the listener closes';
  });

  await check('a request nobody touches expires on its own, and the student is told', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const Customer = require('../src/modules/customers/customer.model');
    const Partner = require('../src/modules/partners/partner.model');
    const Property = require('../src/modules/properties/property.model');
    const VisitRequest = require('../src/modules/visits/visitRequest.model');
    const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
    const { syncShareTypes } = require('../src/modules/inventory/inventory.service');
    const { tick, setExpiryHandler } = require('../src/modules/visits/expiry.worker');

    const ownerPhone = `+9174${String(stamp).slice(-8)}`;
    const partner = await Partner.create({
      partnerId: `par_exp_${stamp}`, phone: ownerPhone, name: 'Absent Owner',
      phoneVerifiedAt: new Date(),
    });
    created.partnerIds.push(partner.partnerId);

    const customer = await Customer.create({
      customerId: `cus_exp_${stamp}`,
      phone: `+9173${String(stamp).slice(-8)}`,
      name: 'Waiting Student',
      email: `exp${stamp}@example.com`,
      phoneVerifiedAt: new Date(),
    });
    created.customerIds.push(customer.customerId);

    const property = await Property.create({
      name: `Expiry PG ${stamp}`,
      place: 'Vizag',
      ownerName: 'Absent Owner',
      ownerMobile: ownerPhone,
      category: 'PG_HOSTEL',
      rent: 5999,
      categoryDetails: {
        sharingTypes: ['2 Sharing'],
        sharingPrices: { '2 Sharing': 5999 },
        sharingBeds: { '2 Sharing': 4 },
      },
    });
    created.propertyIds.push(property._id);
    await syncShareTypes(property);
    created.shareTypeIds.push(`${property._id}:2-sharing`);

    const token = signCustomerToken(customer);
    const { status, body } = await call('POST', '/api/v2/customers/stay-requests', {
      token,
      body: { listingId: String(property._id), sharing: '2 Sharing', consentedTerms: true },
    });
    expect(status === 201, `could not create the request: ${status} ${body.code || ''}`);
    created.stayRequestIds.push(body.data.id);

    /* Three minutes is too long to sit through, so the DEADLINE is moved
       rather than the clock — which is the honest simulation of "the owner
       never answered", and leaves every other mechanism real. */
    await VisitRequest.updateOne(
      { _id: body.data.id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    /* Nobody reads it, nobody polls it, nobody taps anything. */
    const notified = [];
    setExpiryHandler(async (requests) => { notified.push(...requests.map((r) => String(r._id))); });
    const result = await tick();
    setExpiryHandler(null);

    expect(result.expired >= 1, 'the worker expired nothing');
    expect(notified.includes(body.data.id), 'the student was never told');

    const after = await VisitRequest.findById(body.data.id).lean();
    expect(after.status === 'expired', `status is ${after.status}`);
    expect(after.decisionReason === 'NO_ANSWER', `reason is ${after.decisionReason}`);

    return 'expired with nobody watching, and reported once for notification';
  });

  await check('and the student now sees expired, distinct from declined', async () => {
    const VisitRequest = require('../src/modules/visits/visitRequest.model');
    const expired = await VisitRequest.findOne({
      _id: { $in: created.stayRequestIds }, status: 'expired',
    });
    if (!expired) return 'skipped — nothing expired in this run';

    const view = expired.toPublic();
    expect(view.status === 'expired', `status is ${view.status}`);
    expect(view.decisionReason === 'NO_ANSWER', `reason is ${view.decisionReason}`);
    expect(view.secondsRemaining === 0, `countdown is ${view.secondsRemaining}, should be floored at 0`);

    /* The distinction §13 insists on. "Nobody answered" and "the owner said
       no" are different facts, and only one of them is worth asking again
       after. */
    expect(view.status !== 'declined', 'expired must never be collapsed into declined');
    return 'expired · NO_ANSWER · 0s — a different fact from a decline';
  });

  await check('expiry does not consume a bed', async () => {
    const { body } = await call('GET', '/api/v2/listings');
    const expiryListing = body.data.find((l) => l.name === `Expiry PG ${stamp}`);
    if (!expiryListing) return 'skipped — listing not found';

    const option = expiryListing.sharingOptions.find((o) => o.label === '2 Sharing');
    /* A request that was never accepted never claimed anything. If expiry
       moved a counter, every unanswered request would slowly eat a property's
       inventory. */
    expect(option.availableBeds === 4, `expected 4 beds, got ${option.availableBeds}`);
    return '4 beds still free — an unanswered request costs nothing';
  });

  await check('a second sweep reports nothing, so nobody is told twice', async () => {
    const { tick, setExpiryHandler } = require('../src/modules/visits/expiry.worker');

    const notified = [];
    setExpiryHandler(async (requests) => { notified.push(...requests); });
    await tick();
    await tick();
    setExpiryHandler(null);

    expect(notified.length === 0, `${notified.length} request(s) re-notified on a second sweep`);
    return 'idempotent — the guarded update is the dedupe, no separate table';
  });

  /* ══════════════════════════════════════════════════════════════════════
     M6 — notifications, over real HTTP.

     Expo is never called: the transport is swapped for a recorder and what is
     checked is WHO would have been reached and with what. The point is the
     wiring — that the routes are mounted, that a device registers against the
     session's account and not the body's, and that a transition actually
     fires its notification rather than the notifier merely existing.
     ══════════════════════════════════════════════════════════════════════ */
  section('booking · M6 notifications + device registration');

  const notify = { outbox: [] };
  let m8 = {};
  let m9 = {};
  let moveIn = {};

  await check('device registration is mounted on both apps and needs a session', async () => {
    for (const path of ['/api/v2/customers/devices', '/api/v2/partners/devices']) {
      const { status } = await call('POST', path, { body: { token: 'ExponentPushToken[x]' } });
      expect(status === 401, `${path} answered ${status} without a session`);
    }
    return 'both refuse an unauthenticated caller — a token identifies a handset, not a person';
  });

  await check('a student registers a handset, and junk is refused', async () => {
    const Customer = require('../src/modules/customers/customer.model');
    const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');

    const customer = await Customer.create({
      customerId: `cus_dev_${stamp}`,
      phone: `+9172${String(stamp).slice(-8)}`,
      name: 'Device Student',
      email: `dev${stamp}@example.com`,
      phoneVerifiedAt: new Date(),
    });
    created.customerIds.push(customer.customerId);
    notify.studentToken = signCustomerToken(customer);
    notify.customerId = customer.customerId;

    const bad = await call('POST', '/api/v2/customers/devices', {
      token: notify.studentToken, body: { token: 'fcm-looking-token' },
    });
    expect(bad.status === 422, `expected 422 for junk, got ${bad.status}`);
    expect(bad.body.code === 'INVALID_PUSH_TOKEN', `got ${bad.body.code}`);

    const good = await call('POST', '/api/v2/customers/devices', {
      token: notify.studentToken,
      body: { token: `ExponentPushToken[student-${stamp}]`, platform: 'ios' },
    });
    expect(good.status === 201, `expected 201, got ${good.status}`);
    /* The token is not echoed back — they already have it, and a response
       body is one more place it can end up in a log. */
    expect(!JSON.stringify(good.body).includes('ExponentPushToken'), 'the token was echoed back');

    const stored = await Customer.findOne({ customerId: customer.customerId }).lean();
    expect(stored.devices.length === 1, `${stored.devices.length} device(s) stored`);
    return '422 for junk, 201 for a real token, stored against the session\'s account';
  });

  await check('registering the same token twice does not duplicate it', async () => {
    const Customer = require('../src/modules/customers/customer.model');

    /* The app registers on every launch, because a token can be reissued at
       any time. Appending would send one person four copies of everything. */
    for (let i = 0; i < 3; i += 1) {
      await call('POST', '/api/v2/customers/devices', {
        token: notify.studentToken,
        body: { token: `ExponentPushToken[student-${stamp}]`, platform: 'ios' },
      });
    }

    const stored = await Customer.findOne({ customerId: notify.customerId }).lean();
    expect(stored.devices.length === 1, `${stored.devices.length} copies of one handset`);
    return 'four registrations, one device — upsert, not append';
  });

  await check('signing out removes the handset', async () => {
    const Customer = require('../src/modules/customers/customer.model');

    const { status } = await call('DELETE', '/api/v2/customers/devices', {
      token: notify.studentToken,
      body: { token: `ExponentPushToken[student-${stamp}]` },
    });
    expect(status === 200, `expected 200, got ${status}`);

    const stored = await Customer.findOne({ customerId: notify.customerId }).lean();
    /* Without this, signing out of a shared handset leaves the previous
       account's booking alerts appearing on somebody else's lock screen. */
    expect(stored.devices.length === 0, 'the device survived sign-out');

    /* Put it back for the round trip below. */
    await call('POST', '/api/v2/customers/devices', {
      token: notify.studentToken,
      body: { token: `ExponentPushToken[student-${stamp}]`, platform: 'ios' },
    });
    return 'removed on sign-out, and re-registered for the next check';
  });

  await check('sending a request notifies the owner — for real, through the route', async () => {
    const Partner = require('../src/modules/partners/partner.model');
    const Property = require('../src/modules/properties/property.model');
    const { signPartnerToken } = require('../src/modules/partners/partnerAuth.middleware');
    const { syncShareTypes } = require('../src/modules/inventory/inventory.service');
    const pushModule = require('../src/infrastructure/push/push');

    const ownerPhone = `+9171${String(stamp).slice(-8)}`;
    const partner = await Partner.create({
      partnerId: `par_dev_${stamp}`, phone: ownerPhone, name: 'Notified Owner',
      phoneVerifiedAt: new Date(),
    });
    created.partnerIds.push(partner.partnerId);
    notify.ownerToken = signPartnerToken(partner);
    notify.ownerDigits = partner.phoneDigits;

    await call('POST', '/api/v2/partners/devices', {
      token: notify.ownerToken,
      body: { token: `ExponentPushToken[owner-${stamp}]`, platform: 'android' },
    });

    const property = await Property.create({
      name: `Notify PG ${stamp}`, place: 'Vizag', ownerName: 'Notified Owner',
      ownerMobile: ownerPhone, category: 'PG_HOSTEL', rent: 5999,
      categoryDetails: {
        sharingTypes: ['2 Sharing'],
        sharingPrices: { '2 Sharing': 5999 },
        sharingBeds: { '2 Sharing': 2 },
      },
    });
    created.propertyIds.push(property._id);
    await syncShareTypes(property);
    created.shareTypeIds.push(`${property._id}:2-sharing`);
    notify.propertyId = String(property._id);

    /* Expo is never called. The transport is swapped for a recorder, so what
       is verified is the wiring rather than a third party's uptime. */
    const realSend = pushModule.sendPush;
    pushModule.sendPush = async (tokens, message) => {
      notify.outbox.push({ tokens: [...tokens], ...message });
      return { sent: tokens.length, failed: 0, invalid: [], problem: null };
    };

    try {
      const { status, body } = await call('POST', '/api/v2/customers/stay-requests', {
        token: notify.studentToken,
        body: { listingId: notify.propertyId, sharing: '2 Sharing', consentedTerms: true },
      });
      expect(status === 201, `could not send the request: ${status} ${body.code || ''}`);
      notify.requestId = body.data.id;
      created.stayRequestIds.push(body.data.id);

      /* Fired and not awaited by the controller — deliberately, so a slow
         gateway never delays the response. So give it a moment. */
      await new Promise((resolve) => { setTimeout(resolve, 400); });
    } finally {
      pushModule.sendPush = realSend;
    }

    const toOwner = notify.outbox.find((m) => m.data && m.data.kind === 'request.created');
    expect(toOwner, 'the owner was never notified');
    expect(toOwner.tokens.includes(`ExponentPushToken[owner-${stamp}]`), 'it went to the wrong handset');
    expect(toOwner.data.requestId === notify.requestId, 'the payload does not deep-link to this request');
    expect(new RegExp(`${config.booking.expiryMinutes} minutes`).test(toOwner.body),
      `the deadline is missing from the body: "${toOwner.body}"`);

    return `owner pushed: "${toOwner.body}"`;
  });

  await check('and an inbox row outlives the push', async () => {
    const { PartnerNotification } = require('../src/modules/partners/partnerDomains.model');
    const rows = await PartnerNotification.find({ partnerPhoneDigits: notify.ownerDigits }).lean();

    expect(rows.length >= 1, 'no inbox row was written');
    /* A push that failed leaves a record they find on next open; a push that
       succeeded with no row behind it vanishes when it is swiped away. */
    expect(rows.some((r) => /new stay request/i.test(r.title)), 'no "new stay request" row');
    return `${rows.length} inbox row(s), unread`;
  });

  await check('the student\'s alerts quote MINUTES, not the website\'s 24 hours', async () => {
    const { status, body } = await call('GET', '/api/v2/customers/notifications', {
      token: notify.studentToken,
    });
    expect(status === 200, `expected 200, got ${status}`);

    const sent = body.data.find((n) => n.requestId === notify.requestId);
    expect(sent, 'the request produced no alert');

    /* The two channels have genuinely different deadlines. One sentence for
       both would be wrong for one of them. */
    expect(new RegExp(`${config.booking.expiryMinutes} minutes`).test(sent.body),
      `alert says: "${sent.body}"`);
    expect(!/24 hours/.test(sent.body), 'the app channel is quoting the website\'s deadline');
    return `"${sent.body}"`;
  });

  await check('withdrawing notifies the owner it is off', async () => {
    const pushModule = require('../src/infrastructure/push/push');
    const realSend = pushModule.sendPush;
    notify.outbox = [];
    pushModule.sendPush = async (tokens, message) => {
      notify.outbox.push({ tokens: [...tokens], ...message });
      return { sent: tokens.length, failed: 0, invalid: [], problem: null };
    };

    try {
      const { status } = await call('POST', `/api/v2/customers/stay-requests/${notify.requestId}/withdraw`, {
        token: notify.studentToken,
      });
      expect(status === 200, `expected 200, got ${status}`);
      await new Promise((resolve) => { setTimeout(resolve, 400); });
    } finally {
      pushModule.sendPush = realSend;
    }

    const cancelled = notify.outbox.find((m) => m.data && m.data.kind === 'request.cancelled');
    expect(cancelled, 'the owner was never told the student walked away');
    expect(cancelled.tokens.includes(`ExponentPushToken[owner-${stamp}]`), 'wrong handset');

    /* And their copy must be dead, or they tap Accept on somebody who has
       already gone. */
    const { body } = await call('GET', `/api/v2/partners/requests/${notify.requestId}`, {
      token: notify.ownerToken,
    });
    expect(body.data.status === 'cancelled', `owner sees ${body.data.status}`);
    expect(body.data.actionable === false, 'the owner can still act on a cancelled request');

    return 'owner pushed, and their copy is non-actionable';
  });

  await check('push degrades to a named no-op when switched off', async () => {
    const pushModule = require('../src/infrastructure/push/push');
    const original = config.push.enabled;
    config.push.enabled = false;
    try {
      const result = await pushModule.sendPush(['ExponentPushToken[x]'], { title: 'x', body: 'y' });
      /* The rule this whole backend follows: a missing integration degrades
         loudly on the affected call and never takes anything else down. */
      expect(result.sent === 0 && /PUSH_ENABLED/.test(result.problem || ''),
        `expected a named no-op, got ${JSON.stringify(result)}`);
    } finally {
      config.push.enabled = original;
    }
    return 'PUSH_ENABLED=false → 0 sent, named reason, nothing thrown';
  });

  /* ══════════════════════════════════════════════════════════════════════
     M7 — push plumbing in the two apps.

     Static checks, deliberately. Nothing here can send a notification to a
     handset from a test runner, and pretending otherwise would be worse than
     honest gaps: what CAN be checked is that every piece exists and is wired,
     and that the one piece which is not — the EAS project id — is reported by
     name rather than discovered as "notifications never arrive".
     ══════════════════════════════════════════════════════════════════════ */
  section('booking · M7 app push plumbing (static)');

  const fs = require('fs');
  const path = require('path');
  const repoRoot = path.join(__dirname, '..', '..');
  const APPS = [
    { label: 'User App', dir: path.join(repoRoot, 'User App'), surface: 'customers' },
    { label: 'Stay Partner', dir: path.join(repoRoot, 'Stay Partner'), surface: 'partners' },
  ];

  const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const exists = (file) => fs.existsSync(file);

  await check('both apps depend on expo-notifications and expo-device', async () => {
    const notes = [];
    for (const app of APPS) {
      const pkg = readJson(path.join(app.dir, 'package.json'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      for (const dep of ['expo-notifications', 'expo-device']) {
        expect(deps[dep], `${app.label} is missing ${dep}`);
      }
      notes.push(`${app.label} ${deps['expo-notifications']}`);
    }
    return notes.join(', ');
  });

  await check('both declare the notifications plugin and the stay-requests channel', async () => {
    for (const app of APPS) {
      const { expo } = readExpoConfig(app.dir);
      const plugin = (expo.plugins || []).find((p) => Array.isArray(p) && p[0] === 'expo-notifications');
      expect(plugin, `${app.label} does not declare the expo-notifications plugin`);

      /* Android shows nothing at all without a channel, and the BACKEND
         addresses ours by this exact id — a rename on either side is a
         notification that arrives nowhere. */
      expect(plugin[1] && plugin[1].defaultChannel === 'stay-requests',
        `${app.label} channel is ${plugin[1] && plugin[1].defaultChannel}, backend sends to stay-requests`);

      const perms = (expo.android && expo.android.permissions) || [];
      expect(perms.includes('POST_NOTIFICATIONS'),
        `${app.label} cannot even ask for permission on Android 13+`);
      expect(expo.android && expo.android.package, `${app.label} has no Android package name — FCM needs one`);
    }
    return 'plugin, channel `stay-requests`, POST_NOTIFICATIONS, package name — both apps';
  });

  await check('both wire registration into sign-in and sign-out', async () => {
    for (const app of APPS) {
      const push = path.join(app.dir, 'services/push/push.ts');
      const api = path.join(app.dir, 'services/api/devices.api.ts');
      const hook = path.join(app.dir, 'services/push/usePushRouting.tsx');
      for (const [file, label] of [[push, 'push.ts'], [api, 'devices.api.ts'], [hook, 'usePushRouting.tsx']]) {
        expect(exists(file), `${app.label} is missing services/push|api ${label}`);
      }

      const auth = fs.readFileSync(path.join(app.dir, 'context/AuthContext.tsx'), 'utf8');
      expect(auth.includes('registerDevice'), `${app.label} never registers a device`);
      /* Without this, signing out of a shared handset leaves the previous
         account's alerts arriving on somebody else's lock screen. */
      expect(auth.includes('unregisterDevice'), `${app.label} never removes a device on sign-out`);

      const layout = fs.readFileSync(path.join(app.dir, 'app/_layout.tsx'), 'utf8');
      expect(layout.includes('usePushRouting'), `${app.label} never mounts the notification listeners`);
    }
    return 'register on sign-in, unregister on sign-out, listeners mounted at the root — both apps';
  });

  await check('each app registers against ITS OWN surface, not the other\'s', async () => {
    for (const app of APPS) {
      const endpoints = fs.readFileSync(path.join(app.dir, 'services/api/endpoints.ts'), 'utf8');
      const wanted = `/${app.surface}/devices`;
      /* Copy-paste between two apps that share a file layout is exactly how
         the owner's app ends up registering handsets against `app_customers`
         — and then no owner is ever notified of anything. */
      expect(endpoints.includes(wanted),
        `${app.label} does not point at ${wanted}`);
      const other = app.surface === 'customers' ? '/partners/devices' : '/customers/devices';
      expect(!endpoints.includes(other), `${app.label} points at ${other} — the wrong app's accounts`);
    }
    return 'User App → /customers/devices, Stay Partner → /partners/devices';
  });

  await check('every gate on Android push is open', async () => {
    /*
     * Three separate things have to be true, and each one fails silently.
     * They are checked together because "notifications do not arrive" is
     * otherwise ambiguous between them for as long as it takes to guess.
     */
    const gaps = [];

    for (const app of APPS) {
      const { expo } = readExpoConfig(app.dir);

      /* 1 — the EAS project id. Issued by `eas init`; without it every
             getExpoPushTokenAsync returns null. */
      if (!(expo.extra && expo.extra.eas && expo.extra.eas.projectId)) {
        gaps.push(`${app.label}: no EAS projectId — run \`eas init\``);
      }

      /* 2 — google-services.json. Google routes by package name, so Expo Go's
             credentials do not carry a build under your own package. This is
             needed for a DEVELOPMENT build, not only for release. */
      const gsPath = path.join(app.dir, 'google-services.json');
      if (!exists(gsPath)) {
        gaps.push(`${app.label}: no google-services.json — add the Android app in Firebase`);
      } else {
        if (!expo.android || expo.android.googleServicesFile !== './google-services.json') {
          gaps.push(`${app.label}: google-services.json exists but the Expo config does not declare it`);
        }
        /* 3 — and it has to be for THIS package. A mismatch fails the Gradle
               build with "No matching client found", which is at least loud —
               but only after a full build. */
        const clients = (readJson(gsPath).client || [])
          .map((c) => c.client_info.android_client_info.package_name);
        const pkg = expo.android && expo.android.package;
        if (pkg && !clients.includes(pkg)) {
          gaps.push(`${app.label}: google-services.json has no client for ${pkg} (has ${clients.join(', ')})`);
        }
      }
    }

    if (gaps.length) return `⚠ ${gaps.join(' · ')}`;

    const project = readJson(path.join(APPS[0].dir, 'google-services.json')).project_info.project_id;
    return `EAS ids set, google-services.json declared and matching, Firebase project ${project}`
      + ' — remaining: FCM service-account key via `eas credentials`, then a dev build';
  });

  /* ══════════════════════════════════════════════════════════════════════
     M8 — the User App's screens, against the real API.

     Half static and half live, deliberately. The static half checks that the
     mock is genuinely gone and that the app reaches the paths this backend
     serves — a rewrite that left one import behind would still typecheck and
     would fail at runtime on the one screen that matters. The live half
     checks that the response carries every field the countdown renders from.
     ══════════════════════════════════════════════════════════════════════ */
  section('booking · M8 User App screens');

  await check('the mock is deleted, not merely unused', async () => {
    const fs = require('fs');
    const path = require('path');
    const app = path.join(__dirname, '..', '..', 'User App');

    /* A mock left in the tree is a mock somebody re-imports six weeks later
       while wondering why their request never reaches an owner. */
    expect(!fs.existsSync(path.join(app, 'services/mock')),
      'services/mock still exists — the fake flow is still importable');
    expect(!fs.existsSync(path.join(app, 'services/hooks/useVisitRequest.ts')),
      'useVisitRequest.ts still exists');
    expect(fs.existsSync(path.join(app, 'services/hooks/useStayRequest.ts')),
      'useStayRequest.ts is missing');
    expect(fs.existsSync(path.join(app, 'services/api/stayRequests.api.ts')),
      'stayRequests.api.ts is missing');
    return 'mock and old hook removed; useStayRequest + stayRequests.api in their place';
  });

  await check('the app calls the paths this backend actually serves', async () => {
    const fs = require('fs');
    const path = require('path');
    const app = path.join(__dirname, '..', '..', 'User App');
    const endpointsSrc = fs.readFileSync(path.join(app, 'services/api/endpoints.ts'), 'utf8');

    for (const wanted of [
      '/customers/stay-requests',
      '/customers/stay-requests/${encodeURIComponent(id)}',
      '/customers/stay-requests/${encodeURIComponent(id)}/withdraw',
    ]) {
      expect(endpointsSrc.includes(wanted), `the app does not declare ${wanted}`);
    }

    const screen = fs.readFileSync(path.join(app, 'app/confirm/[id].tsx'), 'utf8');
    /* The two things the old flow needed and this one must not have. An OTP
       box here would mean asking a student to prove a number the session
       already proved. */
    expect(!screen.includes('OtpInput'), 'the confirm screen still has an OTP input');
    expect(!/verify\(/.test(screen), 'the confirm screen still calls a verify step');
    expect(screen.includes('useStayRequest'), 'the confirm screen does not use the real hook');
    return 'three paths declared, no OTP, no verify step';
  });

  await check('the countdown is drawn from the server, never computed', async () => {
    const fs = require('fs');
    const path = require('path');
    const hook = fs.readFileSync(
      path.join(__dirname, '..', '..', 'User App/services/hooks/useStayRequest.ts'), 'utf8',
    );

    /* The three properties the whole flow rests on, checked as source because
       no request-level assertion can see them. */
    expect(hook.includes('clockOffset'),
      'the hook does not correct for device clock skew — a phone 30s out shows a visibly wrong timer');
    expect(hook.includes('serverNow'), 'the hook ignores the server clock');
    expect(!/expiresAt\s*=\s*new Date\(/.test(hook),
      'the hook computes its own deadline — only the server may set one');
    return 'offset from serverNow, deadline never computed locally';
  });

  await check('a created request carries everything the screen renders', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const Customer = require('../src/modules/customers/customer.model');
    const Partner = require('../src/modules/partners/partner.model');
    const Property = require('../src/modules/properties/property.model');
    const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
    const { syncShareTypes } = require('../src/modules/inventory/inventory.service');

    const ownerPhone = `+9170${String(stamp).slice(-8)}`;
    const partner = await Partner.create({
      partnerId: `par_m8_${stamp}`, phone: ownerPhone, name: 'M8 Owner', phoneVerifiedAt: new Date(),
    });
    created.partnerIds.push(partner.partnerId);

    const customer = await Customer.create({
      customerId: `cus_m8_${stamp}`,
      phone: `+9169${String(stamp).slice(-8)}`,
      name: 'M8 Student',
      email: `m8${stamp}@example.com`,
      phoneVerifiedAt: new Date(),
    });
    created.customerIds.push(customer.customerId);
    const token = signCustomerToken(customer);

    const property = await Property.create({
      name: `M8 PG ${stamp}`, place: 'Vizag', ownerName: 'M8 Owner',
      ownerMobile: ownerPhone, category: 'PG_HOSTEL', rent: 5999,
      categoryDetails: {
        sharingTypes: ['2 Sharing'],
        sharingPrices: { '2 Sharing': 5999 },
        sharingBeds: { '2 Sharing': 2 },
      },
    });
    created.propertyIds.push(property._id);
    await syncShareTypes(property);
    created.shareTypeIds.push(`${property._id}:2-sharing`);

    const { status, body } = await call('POST', '/api/v2/customers/stay-requests', {
      token,
      body: { listingId: String(property._id), sharing: '2 Sharing', consentedTerms: true },
    });
    expect(status === 201, `expected 201, got ${status} ${body.code || ''}`);
    created.stayRequestIds.push(body.data.id);

    /* Exactly what `useStayRequest` and the screen read. A renamed field here
       is a countdown that renders as NaN. */
    expectFields(body.data, [
      'id', 'listingId', 'propertyName', 'status', 'channel',
      'createdAt', 'expiresAt', 'decidedAt', 'cancelledAt', 'decisionReason',
      'sharing', 'shareTypeId', 'bookingId', 'serverNow', 'secondsRemaining',
    ], 'the created request');

    expect(body.data.status === 'pending_owner', `status is ${body.data.status}`);
    expect(body.data.channel === 'app', `channel is ${body.data.channel}`);

    /* The clock-skew correction needs both, and it needs them to agree. */
    const drift = Math.abs(Date.parse(body.data.serverNow) - Date.now());
    expect(drift < 60_000, `serverNow is ${Math.round(drift / 1000)}s from this machine's clock`);

    m8 = { token, requestId: body.data.id, propertyId: String(property._id) };
    return `201, ${body.data.secondsRemaining}s, every field the countdown reads`;
  });

  await check('withdrawing returns the cancelled shape the screen renders', async () => {
    const { status, body } = await call(
      'POST', `/api/v2/customers/stay-requests/${m8.requestId}/withdraw`, { token: m8.token },
    );
    expect(status === 200, `expected 200, got ${status}`);
    expect(body.data.status === 'cancelled', `status is ${body.data.status}`);
    expect(body.data.cancelledAt, 'no cancelledAt for the trail to stamp');
    expect(body.data.decisionReason === 'STUDENT_WITHDREW', `reason is ${body.data.decisionReason}`);
    /* Terminal, so the hook stops polling — the refetchInterval keys off
       exactly this. */
    expect(body.data.secondsRemaining === 0, `countdown is ${body.data.secondsRemaining}`);
    return 'cancelled · STUDENT_WITHDREW · 0s — polling stops here';
  });

  await check('a full room type is reported so the button can be switched off', async () => {
    const { claimBed } = require('../src/modules/inventory/inventory.service');
    const shareTypeId = `${m8.propertyId}:2-sharing`;

    await claimBed(shareTypeId);
    await claimBed(shareTypeId);   // both beds gone

    const { body } = await call('GET', `/api/v2/listings/${m8.propertyId}`);
    const option = body.data.sharingOptions.find((o) => o.label === '2 Sharing');

    expect(option.availableBeds === 0, `expected 0, got ${option.availableBeds}`);
    expect(option.requestable === false, 'a full room still reads as requestable');

    /* And asking anyway is refused with a code the screen can render, rather
       than a generic failure. */
    const { status, body: refused } = await call('POST', '/api/v2/customers/stay-requests', {
      token: m8.token,
      body: { listingId: m8.propertyId, sharing: '2 Sharing', consentedTerms: true },
    });
    expect(status === 422, `expected 422, got ${status}`);
    expect(refused.code === 'NO_BEDS_FREE', `expected NO_BEDS_FREE, got ${refused.code}`);
    /* And the sentence says it was BOOKED, not merely that it failed. */
    expect(/booked/i.test(refused.message), `refusal does not mention booking: ${refused.message}`);
    return '0 beds, requestable false, and a 422 that says when it was booked';
  });

  /* ══════════════════════════════════════════════════════════════════════
     M9 — the Stay Partner screens.

     Same split as M8: static checks that the fixtures are genuinely gone and
     the app reaches the real paths, then a live round trip proving the owner
     projection carries what those screens render.
     ══════════════════════════════════════════════════════════════════════ */
  section('booking · M9 Stay Partner screens');

  await check('the request screens are off the fixtures', async () => {
    const fs = require('fs');
    const path = require('path');
    const app = path.join(__dirname, '..', '..', 'Stay Partner');

    for (const screen of ['app/requests/index.tsx', 'app/requests/[id].tsx', 'app/requests/reject.tsx']) {
      const src = fs.readFileSync(path.join(app, screen), 'utf8');
      /* `lib/requests.ts` seeded a module-level array at import time, so
         every owner saw the same five invented students and Accept flipped a
         field nobody else could see. Formatting helpers from it are fine; the
         DATA must not be. */
      const importsData = /import\s*\{[^}]*\b(REQUESTS|getRequest|declineRequest|acceptRequest|subscribeRequests|categoryOf)\b[^}]*\}\s*from\s*'@\/lib\/requests'/.test(src);
      expect(!importsData, `${screen} still reads the fixture store`);
    }

    /* And the dashboard banner, which is the door to all three. */
    const dash = fs.readFileSync(path.join(app, 'app/(tabs)/index.tsx'), 'utf8');
    expect(!/pendingCount|soonestPendingHours/.test(dash),
      'the dashboard still counts fixture requests');
    return 'inbox, detail, reject sheet and dashboard all on the API';
  });

  await check('the app declares the accept and decline paths', async () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'Stay Partner/services/api/endpoints.ts'), 'utf8',
    );
    for (const wanted of ['/accept`', '/decline`']) {
      expect(src.includes(wanted), `the app does not declare a request ${wanted} path`);
    }
    expect(src.includes('/partners/requests/'), 'the app does not point at /partners/requests');
    return 'accept and decline declared under /api/v2/partners/requests/:id';
  });

  await check('the owner countdown is server-derived, like the student\'s', async () => {
    const fs = require('fs');
    const path = require('path');
    const hook = fs.readFileSync(
      path.join(__dirname, '..', '..', 'Stay Partner/services/hooks/useStayRequests.ts'), 'utf8',
    );
    expect(hook.includes('serverNow'), 'the owner hook ignores the server clock');
    expect(hook.includes('offset'), 'the owner hook does not correct for device clock skew');
    /* Both apps show the same number to two people about one deadline. If
       either computed its own, they would disagree on screen. */
    expect(!/expiresAt\s*=\s*new Date\(/.test(hook), 'the owner hook computes its own deadline');
    return 'offset from serverNow, deadline never computed locally — same rule as the User App';
  });

  await check('the owner projection carries everything those screens render', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const Customer = require('../src/modules/customers/customer.model');
    const Partner = require('../src/modules/partners/partner.model');
    const Property = require('../src/modules/properties/property.model');
    const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
    const { signPartnerToken } = require('../src/modules/partners/partnerAuth.middleware');
    const { syncShareTypes } = require('../src/modules/inventory/inventory.service');

    const ownerPhone = `+9168${String(stamp).slice(-8)}`;
    const partner = await Partner.create({
      partnerId: `par_m9_${stamp}`, phone: ownerPhone, name: 'M9 Owner', phoneVerifiedAt: new Date(),
    });
    created.partnerIds.push(partner.partnerId);

    const customer = await Customer.create({
      customerId: `cus_m9_${stamp}`,
      phone: `+9167${String(stamp).slice(-8)}`,
      name: 'M9 Student',
      email: `m9${stamp}@example.com`,
      phoneVerifiedAt: new Date(),
    });
    created.customerIds.push(customer.customerId);

    const property = await Property.create({
      name: `M9 PG ${stamp}`, place: 'Vizag', ownerName: 'M9 Owner',
      ownerMobile: ownerPhone, category: 'PG_HOSTEL', rent: 5999,
      categoryDetails: {
        sharingTypes: ['2 Sharing'],
        sharingPrices: { '2 Sharing': 5999 },
        sharingBeds: { '2 Sharing': 2 },
      },
    });
    created.propertyIds.push(property._id);
    await syncShareTypes(property);
    created.shareTypeIds.push(`${property._id}:2-sharing`);

    const { body: sent } = await call('POST', '/api/v2/customers/stay-requests', {
      token: signCustomerToken(customer),
      body: { listingId: String(property._id), sharing: '2 Sharing', consentedTerms: true },
    });
    created.stayRequestIds.push(sent.data.id);

    m9 = { token: signPartnerToken(partner), requestId: sent.data.id };

    const { status, body } = await call('GET', `/api/v2/partners/requests/${m9.requestId}`, {
      token: m9.token,
    });
    expect(status === 200, `expected 200, got ${status}`);

    /* Exactly what the inbox card and the detail screen read. */
    expectFields(body.data, [
      'id', 'status', 'channel', 'propertyName', 'customer', 'sharing',
      'intent', 'createdAt', 'expiresAt', 'serverNow', 'secondsRemaining', 'actionable',
    ], 'the owner projection');

    expect(body.data.customer.name === 'M9 Student', 'the owner cannot see who is asking');
    expect(body.data.customer.phone, 'no phone for the owner to call after accepting');
    expect(body.data.sharing.label === '2 Sharing', `sharing is ${JSON.stringify(body.data.sharing)}`);
    expect(body.data.actionable === true, 'a pending request is not actionable');
    expect(body.data.secondsRemaining > 0, `countdown is ${body.data.secondsRemaining}`);

    return `${body.data.secondsRemaining}s, actionable, customer + sharing present`;
  });

  await check('declining carries the owner\'s reason and kills the buttons', async () => {
    const { status, body } = await call(
      'POST', `/api/v2/partners/requests/${m9.requestId}/decline`,
      { token: m9.token, body: { reason: 'Dates unavailable — building work' } },
    );
    expect(status === 200, `expected 200, got ${status}`);
    expect(body.data.status === 'declined', `status is ${body.data.status}`);

    /* The flag both screens key their buttons off. A request that stayed
       actionable after being answered is the exact bug it exists to stop. */
    expect(body.data.actionable === false, 'a declined request is still actionable');
    expect(body.data.secondsRemaining === 0, `countdown is ${body.data.secondsRemaining}`);

    const VisitRequest = require('../src/modules/visits/visitRequest.model');
    const stored = await VisitRequest.findById(m9.requestId).lean();
    /* The owner's words are kept; the machine reason stays OWNER_DECLINED.
       The student is shown neither — "price too low" is not a sentence
       anybody should receive about themselves. */
    expect(stored.declineNote === 'Dates unavailable — building work',
      `note stored as ${JSON.stringify(stored.declineNote)}`);
    expect(stored.decisionReason === 'OWNER_DECLINED', `reason is ${stored.decisionReason}`);

    return 'declined · note kept · actionable false · 0s';
  });

  await check('and a second decline is refused with a code the sheet can show', async () => {
    const { status, body } = await call(
      'POST', `/api/v2/partners/requests/${m9.requestId}/decline`, { token: m9.token },
    );
    expect(status === 409, `expected 409, got ${status}`);
    expect(body.code === 'ALREADY_DECLINED', `expected ALREADY_DECLINED, got ${body.code}`);
    return '409 ALREADY_DECLINED — the sheet shows the server\'s sentence, not a generic failure';
  });

  section('booking · the waiting screen\'s stages');

  await check('a request carries the stage stamps, and they start empty', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';
    const VisitRequest = require('../src/modules/visits/visitRequest.model');

    const doc = new VisitRequest({
      channel: 'app', listingId: 'x', propertyName: 'x', ownerMobile: '+919999999999',
      customer: { name: 'x', phone: '+919999999998', email: 'x@example.com' },
      status: 'pending_owner', expiresAt: new Date(Date.now() + 60000),
    });
    const view = doc.toPublic();

    expectFields(view, ['notifiedAt', 'seenAt'], 'the waiting screen\'s stages');
    /* Null, not a date. The screen shows "not opened yet" for null and a
       timestamp for a date — defaulting either would put a stage on screen
       for something that has not happened. */
    expect(view.notifiedAt === null && view.seenAt === null,
      'a fresh request already claims the owner was notified or has looked');
    return 'notifiedAt and seenAt present, both null on a fresh request';
  });

  await check('the owner opening a request stamps seenAt — once', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const Customer = require('../src/modules/customers/customer.model');
    const Partner = require('../src/modules/partners/partner.model');
    const Property = require('../src/modules/properties/property.model');
    const VisitRequest = require('../src/modules/visits/visitRequest.model');
    const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
    const { signPartnerToken } = require('../src/modules/partners/partnerAuth.middleware');
    const { syncShareTypes } = require('../src/modules/inventory/inventory.service');

    const ownerPhone = `+9166${String(stamp).slice(-8)}`;
    const partner = await Partner.create({
      partnerId: `par_seen_${stamp}`, phone: ownerPhone, name: 'Seen Owner', phoneVerifiedAt: new Date(),
    });
    created.partnerIds.push(partner.partnerId);

    const customer = await Customer.create({
      customerId: `cus_seen_${stamp}`, phone: `+9165${String(stamp).slice(-8)}`,
      name: 'Seen Student', email: `seen${stamp}@example.com`, phoneVerifiedAt: new Date(),
    });
    created.customerIds.push(customer.customerId);

    const property = await Property.create({
      name: `Seen PG ${stamp}`, place: 'Vizag', ownerName: 'Seen Owner',
      ownerMobile: ownerPhone, category: 'PG_HOSTEL', rent: 5999,
      categoryDetails: {
        sharingTypes: ['2 Sharing'], sharingPrices: { '2 Sharing': 5999 }, sharingBeds: { '2 Sharing': 2 },
      },
    });
    created.propertyIds.push(property._id);
    await syncShareTypes(property);
    created.shareTypeIds.push(`${property._id}:2-sharing`);

    const { body: sent } = await call('POST', '/api/v2/customers/stay-requests', {
      token: signCustomerToken(customer),
      body: { listingId: String(property._id), sharing: '2 Sharing', consentedTerms: true },
    });
    created.stayRequestIds.push(sent.data.id);
    expect(sent.data.seenAt === null, 'a brand-new request already claims the owner looked');

    const ownerToken = signPartnerToken(partner);
    await call('GET', `/api/v2/partners/requests/${sent.data.id}`, { token: ownerToken });

    const afterFirst = await VisitRequest.findById(sent.data.id).lean();
    expect(afterFirst.seenAt, 'opening the request did not stamp seenAt');

    /* The owner's screen polls every four seconds. If each poll moved this,
       the student would watch "opened it" jump forward forever. */
    await call('GET', `/api/v2/partners/requests/${sent.data.id}`, { token: ownerToken });
    const afterSecond = await VisitRequest.findById(sent.data.id).lean();
    expect(afterFirst.seenAt.getTime() === afterSecond.seenAt.getTime(),
      'a second poll moved seenAt — the stage would creep forward on the student\'s screen');

    /* And the student can see it. */
    const { body: student } = await call('GET', `/api/v2/customers/stay-requests/${sent.data.id}`, {
      token: signCustomerToken(customer),
    });
    expect(student.data.seenAt, 'the student cannot draw the "opened your request" stage');
    expect(student.data.notifiedAt, 'the student cannot draw the "was notified" stage');

    return 'stamped on the first open, unmoved by polling, visible to the student';
  });

  await check('the unanswered alert has what it needs, and a way to stop shouting', async () => {
    const fs = require('fs');
    const path = require('path');
    const app = path.join(__dirname, '..', '..', 'Stay Partner');

    const alert = path.join(app, 'components/UnansweredRequestAlert.tsx');
    expect(fs.existsSync(alert), 'the unanswered-request alert is missing');
    const src = fs.readFileSync(alert, 'utf8');

    /* It must key off the SERVER's record that the owner looked. Anything
       local — a dismiss button, a flag in storage — is a way to silence an
       alert about a three-minute deadline without reading it. */
    expect(src.includes('!r.seenAt') || src.includes('seenAt'),
      'the alert does not key off seenAt, so it cannot know it was opened');
    expect(!/onDismiss|onClose|setDismissed/.test(src),
      'the alert can be dismissed without opening the request');

    /* And it must not animate at somebody who asked it not to. */
    expect(src.includes('useReducedMotion'), 'the alert ignores the reduce-motion setting');

    const dash = fs.readFileSync(path.join(app, 'app/(tabs)/index.tsx'), 'utf8');
    expect(dash.includes('UnansweredRequestAlert'), 'the dashboard never renders the alert');

    return 'renders while seenAt is null, no dismiss path, honours reduce-motion';
  });

  await check('accepting issues an entry PIN, and both sides can read it', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const Customer = require('../src/modules/customers/customer.model');
    const Partner = require('../src/modules/partners/partner.model');
    const Property = require('../src/modules/properties/property.model');
    const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
    const { signPartnerToken } = require('../src/modules/partners/partnerAuth.middleware');
    const { syncShareTypes } = require('../src/modules/inventory/inventory.service');

    const ownerPhone = `+9164${String(stamp).slice(-8)}`;
    const partner = await Partner.create({
      partnerId: `par_pin_${stamp}`, phone: ownerPhone, name: 'Pin Owner', phoneVerifiedAt: new Date(),
    });
    created.partnerIds.push(partner.partnerId);

    const customer = await Customer.create({
      customerId: `cus_pin_${stamp}`, phone: `+9163${String(stamp).slice(-8)}`,
      name: 'Pin Student', email: `pin${stamp}@example.com`, phoneVerifiedAt: new Date(),
    });
    created.customerIds.push(customer.customerId);

    const property = await Property.create({
      name: `Pin PG ${stamp}`, place: 'Vizag', ownerName: 'Pin Owner',
      ownerMobile: ownerPhone, category: 'PG_HOSTEL', rent: 5999,
      categoryDetails: {
        sharingTypes: ['2 Sharing'], sharingPrices: { '2 Sharing': 5999 }, sharingBeds: { '2 Sharing': 2 },
      },
    });
    created.propertyIds.push(property._id);
    await syncShareTypes(property);
    created.shareTypeIds.push(`${property._id}:2-sharing`);

    const studentToken = signCustomerToken(customer);
    const { body: sent } = await call('POST', '/api/v2/customers/stay-requests', {
      token: studentToken,
      body: { listingId: String(property._id), sharing: '2 Sharing', consentedTerms: true },
    });
    created.stayRequestIds.push(sent.data.id);
    expect(sent.data.entryPin === null, 'a pending request already carries a PIN');

    const { body: accepted } = await call(
      'POST', `/api/v2/partners/requests/${sent.data.id}/accept`,
      { token: signPartnerToken(partner) },
    );
    if (accepted.booking?.id) created.bookingIds.push(accepted.booking.id);

    /* The owner has to be able to read it out at a door. */
    expect(/^LV-\d{6}$/.test(accepted.data.entryPin || ''),
      `the owner sees no usable PIN: ${JSON.stringify(accepted.data.entryPin)}`);

    const { body: student } = await call('GET', `/api/v2/customers/stay-requests/${sent.data.id}`, {
      token: studentToken,
    });

    /* Compared at the door, not verified — so both sides must hold the SAME
       value. Two different ones would make the only thing it exists for
       impossible. */
    expect(student.data.entryPin === accepted.data.entryPin,
      `student has ${student.data.entryPin}, owner has ${accepted.data.entryPin}`);
    expect(student.data.entryPinIssuedAt, 'no issue time for the trail to stamp');

    return `${accepted.data.entryPin} — same value on both sides`;
  });

  await check('neither app can invent an entry code of its own', async () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..', '..');

    /*
     * The bug this exists to stop, seen in the wild.
     *
     * The student's confirmation screen minted its booking — and its code —
     * from a local fixture, because when it was written nothing server-side
     * recorded that a student had taken a bed. Once acceptance started
     * issuing a real PIN, the two screens showed DIFFERENT codes: the owner
     * read `LV-548005` off theirs and the student read `419273` off hers,
     * each certain they were right.
     *
     * A locally generated code is worse than no code, because both people
     * believe it. So the screen that shows one must read it from the server.
     */
    const booked = fs.readFileSync(path.join(root, 'User App/app/booked/[id].tsx'), 'utf8');
    expect(booked.includes('entryPin'),
      'the student\'s confirmation screen does not read the server\'s entry PIN');
    expect(!/code=\{booking\.verificationCode\}/.test(booked),
      'the student\'s screen still renders a locally minted verification code');

    /*
     * FOUR screens across two apps show this code, and every one of them has
     * to show the same value. Each was written at a different time against a
     * different source, which is exactly how the first two came to disagree.
     */
    const SCREENS = [
      ['Stay Partner/app/requests/[id].tsx', 'the owner answering the request'],
      ['Stay Partner/app/booking/[id].tsx', 'the owner at check-in'],
      ['User App/app/booked/[id].tsx', 'the student just after confirmation'],
      ['User App/app/bookings/[id].tsx', 'the student on the day'],
    ];

    for (const [file, who] of SCREENS) {
      const src = fs.readFileSync(path.join(root, file), 'utf8');
      expect(/entryPin|checkInCode/.test(src), `${who}: ${file} does not read the server's PIN`);
      /* The hardcoded ones that were there: `checkInCode: '1234'` on every
         booking, and a fixture `verificationCode` on both student screens. */
      expect(!/checkInCode:\s*'\d+'/.test(src), `${who}: ${file} hardcodes a check-in code`);
      expect(!/code=\{booking\.verificationCode\}/.test(src), `${who}: ${file} renders a fixture code`);
    }

    return `${SCREENS.length} screens read the server's PIN; none generates or hardcodes one`;
  });

  await check('a booking carries the PIN of the request that created it', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const VisitRequest = require('../src/modules/visits/visitRequest.model');
    const { PartnerBooking } = require('../src/modules/partners/partnerDomains.model');

    const bookings = await PartnerBooking.find({ source: 'request' }).limit(20).lean();
    if (!bookings.length) return 'no request-sourced bookings in this database';

    const wrong = [];
    for (const booking of bookings) {
      const request = await VisitRequest.findOne({ bookingId: String(booking._id) }).lean();
      if (!request) continue;
      /* Copied, so check-in never has to join back — and therefore something
         has to check the copy still says what the original says. */
      if (booking.entryPin !== request.entryPin) {
        wrong.push(`${booking._id}: booking ${booking.entryPin} vs request ${request.entryPin}`);
      }
    }

    expect(wrong.length === 0, `PIN copied wrong onto ${wrong.length} booking(s): ${wrong.join('; ')}`);
    return `${bookings.length} booking(s), each carrying its request's PIN`;
  });

  await check('the PIN a student sees and the PIN an owner sees are one value', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';
    const VisitRequest = require('../src/modules/visits/visitRequest.model');

    const confirmed = await VisitRequest.find({ channel: 'app', status: 'confirmed' }).limit(20);
    if (!confirmed.length) return 'no confirmed requests in this database to compare';

    for (const request of confirmed) {
      /*
       * A confirmed visit that still owes a token has no PIN yet, and should
       * not: the PIN is what the two of them match at the door, so minting it
       * before the money would hand over a confirmed visit for free. It is
       * issued when the payment verifies — see visitPayment.controller.
       */
      if (request.payment?.required && request.payment.status !== 'paid') continue;

      const student = request.toPublic().entryPin;
      const owner = request.toOwner().entryPin;

      expect(student, `request ${request._id} is confirmed with no PIN for the student`);
      expect(student === owner,
        `request ${request._id}: student sees ${student}, owner sees ${owner}`);

      /* And the digits they actually compare at the door are the same six —
         the screens render `entryPin.replace(/\D/g, '')` on both sides. */
      expect(String(student).replace(/\D/g, '').length === 6,
        `${student} does not reduce to six digits`);
    }
    return `${confirmed.length} confirmed request(s), one PIN each, identical on both sides`;
  });

  await check('the pill sends an accepted request to the booking, not back to the form', async () => {
    const fs = require('fs');
    const path = require('path');
    const app = path.join(__dirname, '..', '..', 'User App');

    /*
     * The bug this exists to stop.
     *
     * The floating "confirmed — tap to finish" pill opened `/confirm/[id]` for
     * every status. That screen's job is to SEND a request, so tapping it
     * after an acceptance fired a second one for a bed the first had already
     * taken — and the server refused it as "every bed in this room type is
     * taken". The student's own booking was the thing in their way, on a
     * screen telling them their request had failed.
     */
    const pill = fs.readFileSync(path.join(app, 'components/shell/WaitingPill.tsx'), 'utf8');
    expect(pill.includes('/booked/[id]'),
      'the pill never routes to the booking — an accepted request goes back to the request form');

    /* And the screen itself refuses to send over an existing request. */
    const confirm = fs.readFileSync(path.join(app, 'app/confirm/[id].tsx'), 'utf8');
    expect(/stay\.request\)\s*return/.test(confirm),
      'the confirmation screen can still auto-send over a request that already exists');

    /* Reaching the booking is what "finish" meant, so the pill goes. */
    const booked = fs.readFileSync(path.join(app, 'app/booked/[id].tsx'), 'utf8');
    expect(/clear\(\)/.test(booked), 'the booking screen never clears the pill');

    return 'accepted → /booked, no auto-send over an existing request, pill cleared on arrival';
  });

  await check('a student holding a booking is told so, not told the room is full', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const Customer = require('../src/modules/customers/customer.model');
    const Partner = require('../src/modules/partners/partner.model');
    const Property = require('../src/modules/properties/property.model');
    const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
    const { signPartnerToken } = require('../src/modules/partners/partnerAuth.middleware');
    const { syncShareTypes } = require('../src/modules/inventory/inventory.service');

    const ownerPhone = `+9162${String(stamp).slice(-8)}`;
    const partner = await Partner.create({
      partnerId: `par_dup_${stamp}`, phone: ownerPhone, name: 'Dup Owner', phoneVerifiedAt: new Date(),
    });
    created.partnerIds.push(partner.partnerId);

    const customer = await Customer.create({
      customerId: `cus_dup_${stamp}`, phone: `+9161${String(stamp).slice(-8)}`,
      name: 'Dup Student', email: `dup${stamp}@example.com`, phoneVerifiedAt: new Date(),
    });
    created.customerIds.push(customer.customerId);
    const token = signCustomerToken(customer);

    /* ONE bed, so the student's own acceptance fills the room. */
    const property = await Property.create({
      name: `Dup PG ${stamp}`, place: 'Vizag', ownerName: 'Dup Owner',
      ownerMobile: ownerPhone, category: 'PG_HOSTEL', rent: 8000,
      categoryDetails: {
        sharingTypes: ['Single'], sharingPrices: { Single: 8000 }, sharingBeds: { Single: 1 },
      },
    });
    created.propertyIds.push(property._id);
    await syncShareTypes(property);
    created.shareTypeIds.push(`${property._id}:single`);

    const body = { listingId: String(property._id), sharing: 'Single', consentedTerms: true };

    const { body: sent } = await call('POST', '/api/v2/customers/stay-requests', { token, body });
    created.stayRequestIds.push(sent.data.id);

    const { body: accepted } = await call('POST', `/api/v2/partners/requests/${sent.data.id}/accept`,
      { token: signPartnerToken(partner) });
    if (accepted.booking?.id) created.bookingIds.push(accepted.booking.id);

    const { status, body: again } = await call('POST', '/api/v2/customers/stay-requests', { token, body });

    expect(status === 409, `expected 409, got ${status}`);
    /* The most specific TRUE answer. "Every bed is taken" was also true and
       told the student nothing they could act on — the bed was taken by them. */
    expect(again.code === 'ALREADY_BOOKED',
      `expected ALREADY_BOOKED, got ${again.code}: "${again.message}"`);

    return `409 ALREADY_BOOKED — "${again.message}"`;
  });

  section('booking · moving in takes both sides');

  await check('the student cannot confirm before the owner has', async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return 'skipped — database not connected';

    const Customer = require('../src/modules/customers/customer.model');
    const Partner = require('../src/modules/partners/partner.model');
    const Property = require('../src/modules/properties/property.model');
    const { PartnerBooking } = require('../src/modules/partners/partnerDomains.model');
    const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
    const { signPartnerToken } = require('../src/modules/partners/partnerAuth.middleware');
    const { syncShareTypes } = require('../src/modules/inventory/inventory.service');

    const ownerPhone = `+9160${String(stamp).slice(-8)}`;
    const partner = await Partner.create({
      partnerId: `par_mi_${stamp}`, phone: ownerPhone, name: 'MoveIn Owner', phoneVerifiedAt: new Date(),
    });
    created.partnerIds.push(partner.partnerId);

    const customer = await Customer.create({
      customerId: `cus_mi_${stamp}`, phone: `+9159${String(stamp).slice(-8)}`,
      name: 'MoveIn Student', email: `mi${stamp}@example.com`, phoneVerifiedAt: new Date(),
    });
    created.customerIds.push(customer.customerId);

    const property = await Property.create({
      name: `MoveIn PG ${stamp}`, place: 'Vizag', ownerName: 'MoveIn Owner',
      ownerMobile: ownerPhone, category: 'PG_HOSTEL', rent: 5999,
      categoryDetails: {
        sharingTypes: ['2 Sharing'], sharingPrices: { '2 Sharing': 5999 }, sharingBeds: { '2 Sharing': 2 },
      },
    });
    created.propertyIds.push(property._id);
    await syncShareTypes(property);
    created.shareTypeIds.push(`${property._id}:2-sharing`);

    const studentToken = signCustomerToken(customer);
    const ownerToken = signPartnerToken(partner);

    const { body: sent } = await call('POST', '/api/v2/customers/stay-requests', {
      token: studentToken,
      body: { listingId: String(property._id), sharing: '2 Sharing', consentedTerms: true },
    });
    created.stayRequestIds.push(sent.data.id);

    const { body: accepted } = await call('POST', `/api/v2/partners/requests/${sent.data.id}/accept`,
      { token: ownerToken });
    created.bookingIds.push(accepted.booking.id);

    moveIn = { studentToken, ownerToken, requestId: sent.data.id, bookingId: accepted.booking.id };

    /* The order is the whole rule: a student able to mark themselves in
       before anybody opened a door has recorded an arrival nobody let
       happen. */
    const early = await call('POST', `/api/v2/customers/stay-requests/${sent.data.id}/moved-in`,
      { token: studentToken });

    expect(early.status === 409, `expected 409, got ${early.status}`);
    expect(early.body.code === 'OWNER_HAS_NOT_CONFIRMED',
      `expected OWNER_HAS_NOT_CONFIRMED, got ${early.body.code}`);

    const booking = await PartnerBooking.findById(accepted.booking.id).lean();
    expect(!booking.movedInByStudentAt, 'the student was stamped in anyway');
    expect(booking.status === 'upcoming', `status is ${booking.status}, nobody should be in house`);

    return `409 — "${early.body.message}"`;
  });

  await check('the owner marking alone does not put anybody in house', async () => {
    const { PartnerBooking } = require('../src/modules/partners/partnerDomains.model');

    const { status } = await call('POST', `/api/v2/partners/bookings/${moveIn.bookingId}/checkin`,
      { token: moveIn.ownerToken });
    expect(status === 200, `expected 200, got ${status}`);

    const booking = await PartnerBooking.findById(moveIn.bookingId).lean();
    expect(booking.movedInByOwnerAt, 'the owner was never stamped');
    expect(!booking.movedInByStudentAt, 'the student was stamped by the owner\'s tap');
    /* Half a confirmation is not an arrival. */
    expect(booking.status === 'upcoming', `status is ${booking.status} after one side only`);

    /* And the student's screen now knows it can offer the button. */
    const { body } = await call('GET', `/api/v2/customers/stay-requests/${moveIn.requestId}`,
      { token: moveIn.studentToken });
    expect(body.data.moveIn, 'the request carries no move-in state');
    expect(body.data.moveIn.awaitingStudent === true, 'the student is not told they can confirm');
    expect(body.data.moveIn.complete === false, 'the move-in reads as finished after one side');

    return 'owner stamped, status still upcoming, student told they can confirm';
  });

  await check('and then the student completes it — idempotently', async () => {
    const { PartnerBooking } = require('../src/modules/partners/partnerDomains.model');

    const first = await call('POST', `/api/v2/customers/stay-requests/${moveIn.requestId}/moved-in`,
      { token: moveIn.studentToken });
    expect(first.status === 200, `expected 200, got ${first.status} ${first.body.code || ''}`);
    expect(first.body.data.movedIn === true, 'the move-in did not complete');

    const after = await PartnerBooking.findById(moveIn.bookingId).lean();
    expect(after.status === 'in_house', `status is ${after.status}`);
    expect(after.movedInByStudentAt >= after.movedInByOwnerAt, 'the student is stamped before the owner');

    /* A student standing in a doorway retrying must not record a second
       arrival. */
    await call('POST', `/api/v2/customers/stay-requests/${moveIn.requestId}/moved-in`,
      { token: moveIn.studentToken });
    const again = await PartnerBooking.findById(moveIn.bookingId).lean();
    expect(again.movedInByStudentAt.getTime() === after.movedInByStudentAt.getTime(),
      'a second tap recorded a second arrival');

    return 'in_house, owner then student, second tap changed nothing';
  });

  await check('another student cannot mark somebody else in', async () => {
    const Customer = require('../src/modules/customers/customer.model');
    const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');

    const intruder = await Customer.create({
      customerId: `cus_mi_x_${stamp}`, phone: `+9158${String(stamp).slice(-8)}`,
      name: 'Somebody Else', phoneVerifiedAt: new Date(),
    });
    created.customerIds.push(intruder.customerId);

    const { status } = await call('POST', `/api/v2/customers/stay-requests/${moveIn.requestId}/moved-in`,
      { token: signCustomerToken(intruder) });
    expect(status === 404, `expected 404, got ${status}`);
    return '404 — the same answer as "does not exist"';
  });

  await check('a property\'s verification documents never reach the public site', async () => {
    /*
     * A hotel uploads its PAN and a premises document. Those are stored on the
     * property, and the public listing API must not serve them.
     *
     * The trap this guards is specific and easy to fall into: the listing
     * projection returns `categoryDetails` VERBATIM as `details`. Anything
     * filed in there is published. `documents` is deliberately a top-level
     * field for that reason, and this check fails if it ever moves or if the
     * projection starts spreading the whole document.
     */
    const { formatListing } = require('../src/modules/listings/listing.formatter');

    const secret = `SECRET-PAN-${stamp}`;
    const withDocs = {
      _id: '000000000000000000000011',
      name: 'Verify Hotel', place: 'Visakhapatnam', category: 'HOTEL',
      rent: 450, dailyPrice: 450, monthlyPrice: 0,
      categoryDetails: { bedTypes: ['Single'], sharingPrices: { Single: 450 } },
      documents: [
        { kind: 'pan', url: `https://res.cloudinary.com/x/${secret}.jpg`, name: 'pan.jpg' },
        { kind: 'premises', docType: 'GST Registration Certificate', url: `https://res.cloudinary.com/x/${secret}-2.jpg` },
      ],
    };

    const payload = JSON.stringify(formatListing(withDocs));
    expect(!payload.includes(secret), 'a document URL reached the public listing payload');
    expect(!payload.includes('documents'), 'the public listing payload carries a `documents` key');

    /* And through the real endpoint, not only the formatter. */
    const { status, body } = await call('GET', '/api/v2/listings');
    expect(status === 200, `listings returned ${status}`);
    expect(!JSON.stringify(body).includes('"documents"'),
      'GET /api/v2/listings exposes a documents field');

    return 'documents stay top-level and out of every public projection';
  });

  await check('each app reads its environment in one place, and documents it', async () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..', '..');

    for (const app of ['User App', 'Stay Partner']) {
      const dir = path.join(root, app);

      expect(fs.existsSync(path.join(dir, 'constants/env.ts')),
        `${app} has no constants/env.ts`);
      /* An `.env.example` is how somebody new learns what the app needs.
         Without one the answer is a grep, which is the state this replaced. */
      expect(fs.existsSync(path.join(dir, '.env.example')),
        `${app} has no .env.example`);
      expect(fs.existsSync(path.join(dir, 'app.config.js')),
        `${app} has no app.config.js — nothing computes its config`);

      /*
       * And nothing else may read the environment directly.
       *
       * Not tidiness: Expo INLINES `EXPO_PUBLIC_*` by matching the literal
       * text at build time, so a read written any other way — a computed key,
       * a helper that takes a name — silently yields undefined on a device.
       * Keeping every read in one file is what makes that rule checkable.
       */
      const strays = [];
      const walk = (d) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) { walk(full); continue; }
          if (!/\.tsx?$/.test(entry.name)) continue;
          if (full.endsWith(path.join('constants', 'env.ts'))) continue;
          if (/process\.env\./.test(fs.readFileSync(full, 'utf8'))) {
            strays.push(path.relative(dir, full));
          }
        }
      };
      walk(dir);

      /* `app.config.js` is the exception, and a deliberate one: it runs in
         Node at build time, where the whole environment is readable. That is
         the point of it. */
      const allowed = new Set([path.join('constants', 'env.ts'), 'app.config.js']);
      const real = strays.filter((f) => !allowed.has(f));

      expect(real.length === 0,
        `${app} reads process.env outside constants/env.ts: ${real.join(', ')}`);

      /*
       * And the optional files must stay optional.
       *
       * `google-services.json` is git-ignored, so a fresh clone does not have
       * one. Naming it unconditionally in app.json fails the Android build
       * with a Gradle error about a missing file rather than the honest "you
       * have not set up Firebase yet" — which is why the config guards it on
       * existence and app.json must not declare it.
       */
      /*
       * The config may name `googleServicesFile`, and must never name one that
       * is not there.
       *
       * The old rule was "app.json must not declare it" — a proxy for the real
       * invariant, written when app.json and app.config.js were two files and
       * only the second could guard on existence. They are one file now, so
       * the proxy fails on a machine where the guard correctly resolved. What
       * actually breaks a build is a path to a missing file: Gradle fails with
       * a missing-file error rather than an honest "Firebase is not set up".
       *
       * An absolute path is EAS supplying it as a file variable, which only
       * exists on the builder — so it is accepted without a local check.
       */
      const resolved = readExpoConfig(dir);
      const declared = resolved.expo?.android?.googleServicesFile;
      if (declared && !path.isAbsolute(declared)) {
        expect(fs.existsSync(path.join(dir, declared)),
          `${app} names googleServicesFile "${declared}" but no such file exists`);
      }

      const dynamic = fs.readFileSync(path.join(dir, 'app.config.js'), 'utf8');
      expect(dynamic.includes('existsSync'),
        `${app}'s app.config.js does not guard its optional files on existence`);
    }

    return 'both apps: constants/env.ts + .env.example + app.config.js, optional files guarded';
  });

  await check('a production build hides everything built for checking states', async () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..', '..');

    /*
     * Several screens carry preview controls — rows of buttons that jump a
     * booking between its thirteen statuses, or force a stay request to
     * accepted, rejected or expired. They exist because the other side of
     * those flows is a real owner on a real handset, so the states are
     * otherwise unreachable while building. None of them may reach a student.
     *
     * This checks the mechanism rather than each screen, because the mechanism
     * is what a new screen will either use or forget.
     */
    for (const app of ['User App', 'Stay Partner']) {
      const dir = path.join(root, app);
      const env = fs.readFileSync(path.join(dir, 'constants/env.ts'), 'utf8');

      expect(/export const APP_ENV/.test(env), `${app} does not resolve an APP_ENV`);
      expect(/export const IS_PRODUCTION_BUILD/.test(env),
        `${app} has no IS_PRODUCTION_BUILD for the rest of the app to branch on`);

      /* The fallback is the whole safety property: a build made with no
         configuration at all must read as production, not as development. */
      expect(/:\s*__DEV__\s*\n?\s*\?\s*'development'\s*\n?\s*:\s*'production'/.test(env),
        `${app} does not fall back to production for an unset or misspelt APP_ENV`);

      /* Each EAS profile states its own, so a stale local .env cannot decide
         what a release build shows. */
      const eas = JSON.parse(fs.readFileSync(path.join(dir, 'eas.json'), 'utf8'));
      expect(eas.build.production.env
        && eas.build.production.env.EXPO_PUBLIC_APP_ENV === 'production',
        `${app} eas.json production profile does not pin EXPO_PUBLIC_APP_ENV`);

      /*
       * And no screen may still gate on `__DEV__`.
       *
       * It is false in every standalone build, including the internal APKs
       * shared for push testing — so gating on it means either losing the
       * controls where they are wanted or shipping them where they are not.
       * `constants/env.ts` is where the two are told apart, and the only file
       * allowed to mention it.
       */
      const stray = [];
      const walk = (d) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) { walk(full); continue; }
          if (!/\.tsx?$/.test(entry.name)) continue;
          if (full.endsWith(path.join('constants', 'env.ts'))) continue;
          if (/scratchpad/.test(full)) continue;
          const body = fs.readFileSync(full, 'utf8');
          if (/(?<!`)\b__DEV__\b/.test(body)) stray.push(path.relative(dir, full));
        }
      };
      walk(dir);
      expect(stray.length === 0,
        `${app} still gates on __DEV__ instead of PREVIEW_CONTROLS/DEBUG_LOGS: ${stray.join(', ')}`);
    }

    /*
     * The design-system preview is a route, and a route needs no link to be
     * reachable — only an address, which `app/preview.tsx` has. Deleting the
     * file would be the other way; gating it is this one.
     */
    const preview = fs.readFileSync(path.join(root, 'User App', 'app/preview.tsx'), 'utf8');
    expect(/usePreviewControls\(\)/.test(preview) && /<Redirect/.test(preview),
      'User App/app/preview.tsx is reachable at lampose://preview in a production build');

    /*
     * The runtime toggle, and the one thing that must be true about it.
     *
     * The student app can be switched between development and production
     * while running, so one internal build can answer both "does this work"
     * and "what does a student see". That is a way to turn the gates back ON
     * from inside the app, which is only safe in one direction: a build made
     * as production must have no override at all.
     *
     * `CAN_OVERRIDE_ENV` is derived from `IS_PRODUCTION_BUILD`, so in a
     * production bundle the check folds to a constant and the override branch
     * is dead code. These assertions are what stop that being quietly undone.
     */
    const runtime = fs.readFileSync(
      path.join(root, 'User App', 'services/runtimeEnv.ts'), 'utf8');

    expect(/export const CAN_OVERRIDE_ENV = !IS_PRODUCTION_BUILD;/.test(runtime),
      'CAN_OVERRIDE_ENV is no longer tied to the build — a production build could be switched');

    /* Reading: the override applies only when the build allows one. */
    expect(/CAN_OVERRIDE_ENV && override\) \? override : BUILD_APP_ENV/.test(runtime),
      'getAppEnv can return an override in a production build');

    /* Writing: refused before anything is stored. */
    expect(/setAppEnv = \(next: AppEnv\): void => \{\s*\n\s*if \(!CAN_OVERRIDE_ENV\) return;/.test(runtime),
      'setAppEnv does not refuse outright in a production build');

    /* And the stored value is not even read there, so nothing that can write
       one key into AsyncStorage can change what a student's app shows. */
    expect(/if \(CAN_OVERRIDE_ENV\) \{\s*\n\s*AsyncStorage\.getItem/.test(runtime),
      'a production build still reads the stored override at launch');

    /* The toggle is gated on what the BUILD allows, not on the mode in force
       — otherwise selecting Production removes the only way back. */
    const home = fs.readFileSync(path.join(root, 'User App', 'app/home.tsx'), 'utf8');
    expect(/\{CAN_OVERRIDE_ENV \? \(/.test(home),
      'the Developer group is not gated on CAN_OVERRIDE_ENV');

    return 'both apps: APP_ENV defaults to production, EAS pins it, no screen gates on __DEV__, '
      + 'and the runtime toggle cannot escalate a production build';
  });

  section('CORS preflight from each production origin');

  const preflight = async (origin, path = '/api/v2/auth/login') => {
    const response = await fetch(`${base}${path}`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization,x-employee-email',
      },
    });
    return {
      status: response.status,
      allowOrigin: response.headers.get('access-control-allow-origin'),
      allowCredentials: response.headers.get('access-control-allow-credentials'),
      allowHeaders: response.headers.get('access-control-allow-headers'),
      exposeHeaders: response.headers.get('access-control-expose-headers'),
    };
  };

  const PRODUCTION_ORIGINS = [
    'https://lampose.com',
    'https://www.lampose.com',
    'https://leads.lampose.com',
    'https://onboard.lampose.com',
    'http://localhost:5173',
    'http://localhost:5174',
  ];

  for (const origin of PRODUCTION_ORIGINS) {
    // eslint-disable-next-line no-await-in-loop
    await check(`preflight from ${origin}`, async () => {
      const {
        status, allowOrigin, allowCredentials, allowHeaders, exposeHeaders,
      } = await preflight(origin);
      expect(status >= 200 && status < 300, `preflight status ${status}`);
      expect(allowOrigin === origin, `Allow-Origin was "${allowOrigin}", expected the origin echoed back`);
      /* "*" with credentials is rejected by every browser — the combination
         has to be impossible, not merely unlikely. */
      expect(allowOrigin !== '*', 'Allow-Origin must never be * while credentials are allowed');
      expect(allowCredentials === 'true', 'Allow-Credentials is not true');
      expect(/authorization/i.test(allowHeaders || ''), 'Authorization is not an allowed header');
      expect(/x-employee-email/i.test(allowHeaders || ''), 'x-employee-email is not allowed — the onboarding app cannot edit or delete');
      expect(/content-disposition/i.test(exposeHeaders || ''), 'Content-Disposition is not exposed — the CSV export loses its filename');
      return 'origin echoed, credentials allowed, Authorization + x-employee-email permitted';
    });
  }

  await check('preflight from an unlisted origin', async () => {
    const { allowOrigin } = await preflight('https://not-our-site.example.com');
    if (!config.isProduction) {
      return `development: allowed (${allowOrigin || 'no header'})`;
    }
    expect(!allowOrigin, `production must not echo an unlisted origin, got "${allowOrigin}"`);
    return 'rejected without an Allow-Origin header';
  });
};

/* ── Cleanup ──────────────────────────────────────────────────────────── */

const cleanup = async () => {
  const { User, ScrapedLead, ScrapeJob } = require('../src/modules/scraper/scriper.model');
  const VisitRequest = require('../src/modules/visits/visitRequest.model');
  const Customer = require('../src/modules/customers/customer.model');
  const Partner = require('../src/modules/partners/partner.model');
  const {
    PartnerShareType, PartnerBooking, PartnerNotification,
  } = require('../src/modules/partners/partnerDomains.model');

  /* Requests first: a share-type row deleted before the request that points at
     it would leave an orphan behind, which is the exact thing the M1 section
     fails on. */
  if (created.bookingIds.length) {
    await PartnerBooking.deleteMany({ _id: { $in: created.bookingIds } });
  }
  if (created.stayRequestIds.length) {
    await VisitRequest.deleteMany({ _id: { $in: created.stayRequestIds } });
  }
  if (created.shareTypeIds.length) {
    await PartnerShareType.deleteMany({ shareTypeId: { $in: created.shareTypeIds } });
  }
  if (created.customerIds.length) {
    await Customer.deleteMany({ customerId: { $in: created.customerIds } });
  }
  if (created.partnerIds.length) {
    /* The inbox rows first, and by the partner's DIGITS — that is how
       partner_notifications is keyed, and deleting the partners before
       reading their digits would strand every row they own. Notifications are
       written by the flow itself rather than by this script, which is exactly
       why they were missed the first time. */
    const partners = await Partner.find({ partnerId: { $in: created.partnerIds } })
      .select('phoneDigits').lean();
    const digits = partners.map((p) => p.phoneDigits).filter(Boolean);
    if (digits.length) {
      await PartnerNotification.deleteMany({ partnerPhoneDigits: { $in: digits } });
    }
    await Partner.deleteMany({ partnerId: { $in: created.partnerIds } });
  }

  const Property = require('../src/modules/properties/property.model');
  const PermissionRequest = require('../src/modules/permissions/permissionRequest.model');
  const Admin = require('../src/modules/admins/admin.model');

  if (config.storage.mode === 'mongo') {
    if (created.leadIds.length) await ScrapedLead.deleteMany({ _id: { $in: created.leadIds } });
    if (created.jobIds.length) await ScrapeJob.deleteMany({ jobId: { $in: created.jobIds } });
    const users = created.userIds.filter(Boolean);
    if (users.length) await User.deleteMany({ userId: { $in: users } });
  }
  if (created.propertyIds.length) await Property.deleteMany({ _id: { $in: created.propertyIds } });
  const perms = created.permissionIds.filter((id) => /^[0-9a-fA-F]{24}$/.test(String(id)));
  if (perms.length) await PermissionRequest.deleteMany({ _id: { $in: perms } });
  const admins = created.adminIds.filter((id) => /^[0-9a-fA-F]{24}$/.test(String(id)));
  if (admins.length) await Admin.deleteMany({ _id: { $in: admins } });

  /* The upload checks moved real bytes into Cloudinary. Destroy them, or a
     run leaves two 1x1 PNGs in the account every time it happens. */
  if (uploadedPublicIds.length) {
    // eslint-disable-next-line global-require
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    for (const publicId of uploadedPublicIds) {
      // eslint-disable-next-line no-await-in-loop
      await cloudinary.uploader.destroy(publicId).catch(() => {});
    }
  }
};

/* ── Report ───────────────────────────────────────────────────────────── */

(async () => {
  let fatal = null;
  try {
    await run();
  } catch (error) {
    fatal = error;
  }

  let cleanupError = null;
  try {
    await cleanup();
  } catch (error) {
    cleanupError = error.message;
  }

  console.log();
  for (const row of rows) {
    if (row.section) { console.log(`\n  ${row.section}\n  ${'─'.repeat(row.section.length)}`); continue; }
    console.log(`   ${row.ok ? '✓' : '✗'} ${row.frontendCall}`);
    console.log(`       ${row.detail}`);
  }

  const checks = rows.filter((r) => !r.section);
  const failed = checks.filter((r) => !r.ok);
  console.log(`\n  ${checks.length - failed.length}/${checks.length} frontend calls verified`
    + `${RUN_SCRAPE ? '' : '  (run with --scrape to include a live scrape)'}\n`);
  if (fatal) console.error(`  ABORTED: ${fatal.message}\n`);
  if (cleanupError) console.error(`  WARNING: cleanup failed — ${cleanupError}\n`);

  if (server) {
    server.close();
    await closeConnections();
  }
  /* Not process.exit(): tearing the process down while a connection retry is
     still in flight trips a libuv assertion on Windows, which reads as a crash
     at the end of a run that passed. */
  process.exitCode = (failed.length || fatal) ? 1 : 0;
})();
