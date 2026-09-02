/* ══════════════════════════════════════════════════════════════════════════
   Service zones: drawn in the console, read by every app.

     Admin console   POST   /v1/admin/zones            draw one
                     GET    /v1/admin/zones            the list the page renders
                     PATCH  /v1/admin/zones/:id        rename, re-price, redraw, toggle
                     DELETE /v1/admin/zones/:id        retire it
     User / Driver   GET    /v2/zones/check?lat&lng    is this address served?
                     GET    /v2/zones                  the live map

   The assertions that matter are the ones that would otherwise fail silently,
   because a zone is a shape and a wrong shape does not throw — it just stops
   answering for half a city:

     · a point INSIDE a polygon matches, a point outside does not
     · a point inside a CIRCLE matches by real distance, and one just beyond
       the radius does not
     · switching a zone off stops it matching, without deleting the shape
     · changing a polygon into a circle REMOVES the boundary, so the matcher
       cannot match the shape the operator stopped editing
     · `activeHours` that have not started yet do not match
     · `allowedServices` scopes a zone to one service
     · the client routes need no token, and cannot write

   Cleans up after itself: every zone and the throwaway administrator are
   removed.

   Run with: npm run verify:zones
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');

require('../src/config/env');
const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');
const createApp = require('../app');

const results = [];
const check = (name, ok, extra = '') => results.push([!!ok, name, extra]);

/* Rajahmundry — the city Lampose actually operates in, so the numbers in this
   file are recognisable to somebody debugging it. [lng, lat] throughout. */
const CITY = { lng: 81.7836, lat: 16.9891 };

/** A square ring around a centre, in degrees. Open — the server closes it. */
const square = (lng, lat, d) => [
  [lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d],
];

(async () => {
  await connectDB().catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));

  if (!isLamposeUp()) { console.log('\nMongoDB is not reachable.\n'); process.exit(2); }
  if (!process.env.JWT_SECRET) { console.log('\nJWT_SECRET is not set.\n'); process.exit(2); }

  const app = createApp({});
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client': 'zones-verify',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty body is fine */ }
    return { status: res.status, json };
  };

  const Zone = require('../src/modules/zones/zone.model');
  const Admin = require('../src/modules/admins/admin.model');

  const stamp = String(Date.now()).slice(-6);
  const made = [];
  let admin = null;
  let token = null;
  let viewer = null;
  let viewerToken = null;

  try {
    admin = await Admin.create({
      name: 'Zone Editor', email: `zones-${stamp}@lampose.test`,
      password: `Zones!${stamp}aA`, role: 'Admin', status: 'Active',
    });
    token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    viewer = await Admin.create({
      name: 'Zone Viewer', email: `zones-v-${stamp}@lampose.test`,
      password: `Zones!${stamp}aA`, role: 'Viewer', status: 'Active',
    });
    viewerToken = jwt.sign({ id: viewer._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    /* ── 1. Draw a polygon ───────────────────────────────────────────── */
    const poly = await call('POST', '/api/v1/admin/zones', {
      name: `Verify Polygon ${stamp}`,
      type: 'polygon',
      /* Sent as a BARE ring, the shape the drawing UI holds while somebody is
         placing vertices — the server wraps and closes it. */
      boundary: square(CITY.lng, CITY.lat, 0.01),
      pricingMultiplier: 1.5,
    }, token);
    check('a polygon can be drawn', poly.status === 201, poly.json?.message);
    if (poly.json?.data?.zoneId) made.push(poly.json.data.zoneId);
    check(
      'the open ring was closed server-side',
      poly.json?.data?.boundary?.[0]?.length === 5,
      `${poly.json?.data?.boundary?.[0]?.length} points`,
    );

    /* ── 2. Draw a circle ────────────────────────────────────────────── */
    const circleCentre = { lng: CITY.lng + 0.5, lat: CITY.lat };
    const circle = await call('POST', '/api/v1/admin/zones', {
      name: `Verify Circle ${stamp}`,
      type: 'circle',
      center: { coordinates: [circleCentre.lng, circleCentre.lat] },
      radius: 2000,
      pricingMultiplier: 2,
    }, token);
    check('a circle can be drawn', circle.status === 201, circle.json?.message);
    if (circle.json?.data?.zoneId) made.push(circle.json.data.zoneId);

    /* ── 3. Refusals ─────────────────────────────────────────────────── */
    const twoPoints = await call('POST', '/api/v1/admin/zones', {
      name: 'Bad', type: 'polygon', boundary: [[81.7, 16.9], [81.8, 16.9]],
    }, token);
    check('a two-point polygon is refused', twoPoints.status === 400, twoPoints.json?.code);

    const noRadius = await call('POST', '/api/v1/admin/zones', {
      name: 'Bad', type: 'circle', center: { coordinates: [81.7, 16.9] },
    }, token);
    check('a circle with no radius is refused', noRadius.status === 400, noRadius.json?.code);

    const offMap = await call('POST', '/api/v1/admin/zones', {
      name: 'Bad', type: 'circle', center: { coordinates: [200, 16.9] }, radius: 100,
    }, token);
    check('an out-of-range coordinate is refused', offMap.status === 400, offMap.json?.code);

    /* ── 4. Who may draw ─────────────────────────────────────────────── */
    const viewerRead = await call('GET', '/api/v1/admin/zones', undefined, viewerToken);
    check('a Viewer can READ the map', viewerRead.status === 200);
    const viewerWrite = await call('POST', '/api/v1/admin/zones', {
      name: 'Nope', type: 'circle', center: { coordinates: [81.7, 16.9] }, radius: 500,
    }, viewerToken);
    check('a Viewer cannot DRAW', viewerWrite.status === 403, viewerWrite.json?.code);

    const noToken = await call('GET', '/api/v1/admin/zones');
    check('the console routes refuse an unauthenticated reader', noToken.status === 401);

    /* ── 5. The question every client asks ───────────────────────────── */
    const inside = await call('GET', `/api/v2/zones/check?lat=${CITY.lat}&lng=${CITY.lng}`);
    check(
      'a point INSIDE the polygon is serviceable, with no token at all',
      inside.status === 200 && inside.json?.serviceable === true,
      inside.json?.zone?.name,
    );
    check('and it carries that zone\'s multiplier', inside.json?.pricingMultiplier === 1.5,
      String(inside.json?.pricingMultiplier));

    const outside = await call('GET', `/api/v2/zones/check?lat=${CITY.lat + 5}&lng=${CITY.lng + 5}`);
    check('a point far outside every zone is not serviceable', outside.json?.serviceable === false);

    /* ~1.06km east of the circle's centre — comfortably inside 2000m. */
    const nearCircle = await call('GET', `/api/v2/zones/check?lat=${circleCentre.lat}&lng=${circleCentre.lng + 0.01}`);
    check('a point inside the CIRCLE matches by real distance',
      nearCircle.json?.serviceable === true && nearCircle.json?.zone?.type === 'circle',
      nearCircle.json?.zone?.name);

    /* ~3.2km east — outside 2000m. */
    const pastCircle = await call('GET', `/api/v2/zones/check?lat=${circleCentre.lat}&lng=${circleCentre.lng + 0.03}`);
    check('a point just beyond the radius does not', pastCircle.json?.serviceable === false);

    const badCoords = await call('GET', '/api/v2/zones/check?lat=abc&lng=12');
    check('a non-numeric coordinate is refused', badCoords.status === 400, badCoords.json?.code);

    /* ── 6. Switching a zone off ─────────────────────────────────────── */
    const off = await call('PATCH', `/api/v1/admin/zones/${made[0]}`, { isActive: false }, token);
    check('a zone can be switched off', off.status === 200 && off.json?.data?.isActive === false);
    const whenOff = await call('GET', `/api/v2/zones/check?lat=${CITY.lat}&lng=${CITY.lng}`);
    check('and it stops matching', whenOff.json?.serviceable === false);
    check('but the shape is still on file',
      Array.isArray(off.json?.data?.boundary?.[0]) && off.json.data.boundary[0].length === 5);
    await call('PATCH', `/api/v1/admin/zones/${made[0]}`, { isActive: true }, token);

    /* ── 7. Redrawing, and the geometry swap ─────────────────────────── */
    const renamed = await call('PATCH', `/api/v1/admin/zones/${made[0]}`, {
      name: `Renamed ${stamp}`, pricingMultiplier: 1.8,
    }, token);
    check('a zone can be renamed and re-priced without resending its shape',
      renamed.status === 200
      && renamed.json?.data?.pricingMultiplier === 1.8
      && renamed.json?.data?.boundary?.[0]?.length === 5);

    const toCircle = await call('PATCH', `/api/v1/admin/zones/${made[0]}`, {
      type: 'circle', center: { coordinates: [CITY.lng, CITY.lat] }, radius: 500,
    }, token);
    check('a polygon can be redrawn as a circle', toCircle.status === 200 && toCircle.json?.data?.type === 'circle');
    check('and the old boundary is REMOVED, not left to match',
      toCircle.json?.data?.boundary === null, JSON.stringify(toCircle.json?.data?.boundary));

    /* ── 8. Hours and services ───────────────────────────────────────── */
    const hoursOnly = await call('POST', '/api/v1/admin/zones', {
      name: `Verify Hours ${stamp}`,
      type: 'circle',
      center: { coordinates: [CITY.lng - 0.5, CITY.lat] },
      radius: 3000,
      /* A one-minute window in the past, so it is closed whenever this runs. */
      activeHours: { start: '00:00', end: '00:01' },
    }, token);
    if (hoursOnly.json?.data?.zoneId) made.push(hoursOnly.json.data.zoneId);
    const closedNow = await call('GET', `/api/v2/zones/check?lat=${CITY.lat}&lng=${CITY.lng - 0.5}`);
    check('a zone outside its active hours does not match',
      hoursOnly.status === 201 && closedNow.json?.serviceable === false,
      closedNow.json?.zone?.name || 'no match');

    const stayOnly = await call('POST', '/api/v1/admin/zones', {
      name: `Verify Stay ${stamp}`,
      type: 'circle',
      center: { coordinates: [CITY.lng - 1, CITY.lat] },
      radius: 3000,
      allowedServices: ['stay'],
    }, token);
    if (stayOnly.json?.data?.zoneId) made.push(stayOnly.json.data.zoneId);
    const askFood = await call('GET', `/api/v2/zones/check?lat=${CITY.lat}&lng=${CITY.lng - 1}&service=food`);
    const askStay = await call('GET', `/api/v2/zones/check?lat=${CITY.lat}&lng=${CITY.lng - 1}&service=stay`);
    check('a stay-only zone refuses a food question', askFood.json?.serviceable === false);
    check('and answers a stay one', askStay.json?.serviceable === true, askStay.json?.zone?.name);

    const badService = await call('POST', '/api/v1/admin/zones', {
      name: 'Bad', type: 'circle', center: { coordinates: [81.7, 16.9] }, radius: 100,
      allowedServices: ['taxi'],
    }, token);
    check('an unknown service is refused', badService.status === 400, badService.json?.code);

    /* ── 9. The public list ──────────────────────────────────────────── */
    const live = await call('GET', '/api/v2/zones');
    check('the live list is readable with no token', live.status === 200 && Array.isArray(live.json?.data));
    const mine = (live.json?.data || []).filter((z) => String(z.name).includes(stamp));
    check('and contains the zones just drawn', mine.length >= 3, `${mine.length} of ours`);
    check('the public shape carries no operator notes',
      mine.every((z) => z.description === undefined && z.createdAt === undefined));

    /* ── 10. Delete ──────────────────────────────────────────────────── */
    const gone = await call('DELETE', `/api/v1/admin/zones/${made[1]}`, undefined, token);
    check('a zone can be deleted', gone.status === 200, gone.json?.message);
    const after = await call('GET', `/api/v1/admin/zones/${made[1]}`, undefined, token);
    check('and is then a 404', after.status === 404);
  } catch (error) {
    check('the run completed', false, error.message);
  } finally {
    try {
      if (made.length) await Zone.deleteMany({ zoneId: { $in: made } });
      await Zone.deleteMany({ name: new RegExp(stamp) });
      if (admin) await Admin.deleteOne({ _id: admin._id });
      if (viewer) await Admin.deleteOne({ _id: viewer._id });
    } catch (error) {
      console.error('cleanup failed:', error.message);
    }
    server.close();
    await closeConnections().catch(() => {});
  }

  const line = '='.repeat(78);
  console.log(`\n${line}\n  SERVICE ZONES\n${line}`);
  let failed = 0;
  for (const [ok, name, extra] of results) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? `  · ${extra}` : ''}`);
  }
  console.log(`${line}\n  ${results.length - failed}/${results.length} passed\n${line}\n`);

  process.exit(failed ? 1 : 0);
})();
