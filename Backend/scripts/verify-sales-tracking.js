/* ══════════════════════════════════════════════════════════════════════════
   Sales tracking, end to end: an administrator creates a rep's account, the
   rep goes online with a starting fix, sends a heartbeat, goes offline, and
   an administrator reads the roster and the rep's path — including asking
   for a specific time window, a date, or nothing at all — the whole surface
   `verify-sales-login.js` doesn't cover.

     npm run verify:sales-tracking

   Same shape as every other verify script here: its own throwaway
   `mongodb-memory-server`, thrown away at the end.
   ══════════════════════════════════════════════════════════════════════════ */

const { MongoMemoryServer } = require('mongodb-memory-server');

const results = [];
const check = (name, ok, extra = '') => results.push([!!ok, name, extra]);

const EMAIL = 'verify-sales-tracking@example.test';
const PASSWORD = 'verify-sales-1234';
const NAME = 'Verify Tracker';

/* Visakhapatnam and a point a couple of streets over — real coordinates so a
   real map view would draw something sane, not that it matters to this
   script. */
const START = { lat: 17.6868, lng: 83.2185 };
const NEXT = { lat: 17.6901, lng: 83.2221 };

(async () => {
  const mongo = await MongoMemoryServer.create();

  process.env.MONGO_URI = mongo.getUri('lampose-verify');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'verify-only-secret-not-a-credential';

  require('../src/config/env');
  /* Refuse to run against production. See src/infrastructure/database/guard.js */
  require('../src/infrastructure/database/guard').assertDevTargetOrExit();
  const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');
  const createApp = require('../app');
  const Admin = require('../src/modules/admins/admin.model');
  const { signAdminToken } = require('../src/modules/admins/adminToken');
  const SalesLocationPing = require('../src/modules/sales/salesLocationPing.model');

  await connectDB().catch(() => {});
  for (let i = 0; i < 40 && !isLamposeUp(); i += 1) {
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!isLamposeUp()) { console.log('\nin-memory MongoDB did not come up\n'); process.exit(2); }

  const app = createApp({});
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client': 'sales-tracking-verify',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty body is fine */ }
    return { status: res.status, json };
  };

  try {
    /* ── 0. An administrator, and the account they create for the rep ────── */
    const admin = await Admin.create({
      name: 'Verify Admin',
      email: 'verify-sales-tracking-admin@example.test',
      password: 'irrelevant-hash-input',
      role: 'Super Admin',
      status: 'Active',
    });
    const adminToken = signAdminToken(admin);

    const created = await call('POST', '/api/v1/admin/sales-reps', { name: NAME, email: EMAIL, password: PASSWORD }, adminToken);
    check('an administrator creates the rep\'s account → 201', created.status === 201, `got ${created.status}`);
    const salesRepId = created.json?.data?.salesRep?.id;
    check('a salesRepId in the SR- shape', /^SR-[0-9A-F]{8}$/.test(salesRepId || ''));

    /* ── the rep's own side — signs in with exactly what the admin typed ─── */
    const signIn = await call('POST', '/api/v2/sales/auth/login', { email: EMAIL, password: PASSWORD });
    check('the rep signs in with the admin-issued credentials', signIn.status === 200, `got ${signIn.status}`);
    const token = signIn.json?.data?.token;

    const noLoc = await call('PATCH', '/api/v2/sales/me/duty', { onDuty: true }, token);
    check('going online with no location → 400', noLoc.status === 400, `got ${noLoc.status}`);
    check('…and no token issued to a half-formed session', noLoc.json?.code === 'LOCATION_REQUIRED', noLoc.json?.code);

    const heartbeatBeforeDuty = await call('PATCH', '/api/v2/sales/me/location', { lat: START.lat, lng: START.lng }, token);
    check('a location sent while off duty → 409', heartbeatBeforeDuty.status === 409, `got ${heartbeatBeforeDuty.status}`);

    const beforeStart = new Date();
    const goOnline = await call('PATCH', '/api/v2/sales/me/duty', { onDuty: true, lat: START.lat, lng: START.lng }, token);
    check('going online with a location → 200', goOnline.status === 200, `got ${goOnline.status}`);
    check('the rep comes back on duty', goOnline.json?.data?.salesRep?.onDuty === true);
    check('dutyStartedAt is set', Boolean(goOnline.json?.data?.salesRep?.dutyStartedAt));
    const betweenPings = new Date();

    const heartbeat = await call('PATCH', '/api/v2/sales/me/location', { lat: NEXT.lat, lng: NEXT.lng }, token);
    check('a heartbeat while on duty → 200', heartbeat.status === 200, `got ${heartbeat.status}`);
    const afterNext = new Date();

    const badCoords = await call('PATCH', '/api/v2/sales/me/location', { lat: 999, lng: NEXT.lng }, token);
    check('an out-of-range latitude → 400', badCoords.status === 400, `got ${badCoords.status}`);

    const pingCount = await SalesLocationPing.countDocuments({ salesRepId });
    check('two pings recorded (the start, and the heartbeat)', pingCount === 2, `got ${pingCount}`);

    /* ── the administrator's side ────────────────────────────────────────── */
    const noAuth = await call('GET', '/api/v1/admin/sales-reps');
    check('the roster refuses an unauthenticated read', noAuth.status === 401, `got ${noAuth.status}`);

    const repTokenOnAdminRoute = await call('GET', '/api/v1/admin/sales-reps', undefined, token);
    check(
      'a REP\'s own token cannot read the admin roster — no guard was widened',
      repTokenOnAdminRoute.status === 401,
      `got ${repTokenOnAdminRoute.status}`,
    );

    const roster = await call('GET', '/api/v1/admin/sales-reps', undefined, adminToken);
    check('an administrator reads the roster → 200', roster.status === 200, `got ${roster.status}`);
    const row = roster.json?.data?.salesReps?.find((r) => r.id === salesRepId);
    check('the rep we just put on duty is in it', Boolean(row));
    check('…shown as on duty', row?.onDuty === true);
    check(
      '…with [lng, lat] order, unswapped',
      row?.currentLocation?.coordinates?.[0] === NEXT.lng && row?.currentLocation?.coordinates?.[1] === NEXT.lat,
      JSON.stringify(row?.currentLocation),
    );

    /* ── the path, with no time window given — defaults to the live session ─ */
    const path = await call('GET', `/api/v1/admin/sales-reps/${salesRepId}/path`, undefined, adminToken);
    check('an administrator reads the rep\'s path → 200', path.status === 200, `got ${path.status}`);
    check('two points on it, oldest first', path.json?.data?.path?.length === 2, path.json?.data?.path?.length);
    check(
      'the first point is the START fix, as {lat, lng} — flipped back for the client',
      path.json?.data?.path?.[0]?.lat === START.lat && path.json?.data?.path?.[0]?.lng === START.lng,
      JSON.stringify(path.json?.data?.path?.[0]),
    );

    /* ── the path, asked for a specific window — "from this time to that
       time", and "a particular date", the console's own words for it ────── */
    const onlyStart = await call(
      'GET',
      `/api/v1/admin/sales-reps/${salesRepId}/path?from=${encodeURIComponent(beforeStart.toISOString())}&to=${encodeURIComponent(betweenPings.toISOString())}`,
      undefined, adminToken,
    );
    check('a window around only the START fix → 200', onlyStart.status === 200, `got ${onlyStart.status}`);
    check('…returns exactly that one point', onlyStart.json?.data?.path?.length === 1, onlyStart.json?.data?.path?.length);
    check(
      '…and it is the START fix',
      onlyStart.json?.data?.path?.[0]?.lat === START.lat && onlyStart.json?.data?.path?.[0]?.lng === START.lng,
    );

    const onlyNext = await call(
      'GET',
      `/api/v1/admin/sales-reps/${salesRepId}/path?from=${encodeURIComponent(betweenPings.toISOString())}&to=${encodeURIComponent(afterNext.toISOString())}`,
      undefined, adminToken,
    );
    check('a window around only the heartbeat fix → exactly one point', onlyNext.json?.data?.path?.length === 1, onlyNext.json?.data?.path?.length);
    check(
      '…and it is the NEXT fix',
      onlyNext.json?.data?.path?.[0]?.lat === NEXT.lat && onlyNext.json?.data?.path?.[0]?.lng === NEXT.lng,
    );

    const bothFixes = await call(
      'GET',
      `/api/v1/admin/sales-reps/${salesRepId}/path?from=${encodeURIComponent(beforeStart.toISOString())}&to=${encodeURIComponent(afterNext.toISOString())}`,
      undefined, adminToken,
    );
    check('a window around both fixes → both of them', bothFixes.json?.data?.path?.length === 2, bothFixes.json?.data?.path?.length);

    const future = new Date(Date.now() + 60 * 60 * 1000);
    const nothingYet = await call(
      'GET',
      `/api/v1/admin/sales-reps/${salesRepId}/path?from=${encodeURIComponent(future.toISOString())}`,
      undefined, adminToken,
    );
    check('a window that starts in the future → an empty path, not an error', nothingYet.status === 200 && nothingYet.json?.data?.path?.length === 0, nothingYet.json?.data?.path?.length);

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateOnly = await call(
      'GET',
      `/api/v1/admin/sales-reps/${salesRepId}/path?from=${encodeURIComponent(twoDaysAgo.toISOString())}&to=${encodeURIComponent(oneDayAgo.toISOString())}`,
      undefined, adminToken,
    );
    check('a whole past day with nothing recorded on it → an empty path', dateOnly.status === 200 && dateOnly.json?.data?.path?.length === 0, dateOnly.json?.data?.path?.length);

    const malformed = await call(
      'GET',
      `/api/v1/admin/sales-reps/${salesRepId}/path?from=not-a-real-date`,
      undefined, adminToken,
    );
    check(
      'a malformed "from" falls back to the default window rather than erroring',
      malformed.status === 200 && malformed.json?.data?.path?.length === 2,
      `status ${malformed.status}, ${malformed.json?.data?.path?.length} points`,
    );

    const unknownRep = await call('GET', '/api/v1/admin/sales-reps/SR-00000000/path', undefined, adminToken);
    check('an unknown rep id → 404', unknownRep.status === 404, `got ${unknownRep.status}`);

    /* ── going offline ────────────────────────────────────────────────────── */
    const goOffline = await call('PATCH', '/api/v2/sales/me/duty', { onDuty: false }, token);
    check('going offline → 200, no location required', goOffline.status === 200, `got ${goOffline.status}`);
    check('no longer on duty', goOffline.json?.data?.salesRep?.onDuty === false);
    check('dutyStartedAt is cleared', goOffline.json?.data?.salesRep?.dutyStartedAt === null);

    const heartbeatAfterOffline = await call('PATCH', '/api/v2/sales/me/location', { lat: NEXT.lat, lng: NEXT.lng }, token);
    check('a heartbeat after going offline → 409, not silently accepted', heartbeatAfterOffline.status === 409, `got ${heartbeatAfterOffline.status}`);
  } finally {
    server.close();
    await closeConnections().catch(() => {});
    await mongo.stop().catch(() => {});
  }

  const failed = results.filter(([ok]) => !ok);
  console.log('');
  results.forEach(([ok, name, extra]) => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && extra ? `  — ${extra}` : ''}`);
  });
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error('\nverify:sales-tracking blew up:', error);
  process.exit(2);
});
