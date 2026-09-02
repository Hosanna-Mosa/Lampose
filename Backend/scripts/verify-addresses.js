/* ══════════════════════════════════════════════════════════════════════════
   Addresses, for all three identities that have one.

     Diner    GET/POST   /v2/customers/me/addresses            a BOOK
              PATCH/DEL  /v2/customers/me/addresses/:id
              POST       /v2/customers/me/addresses/:id/default
     Rider    PATCH      /v2/drivers/me   { address }          ONE
     Owner    PATCH      /v2/partners/me  { address }          ONE

   One shape, one validator — `shared/utils/address.js` — so the three cannot
   drift. The assertions that matter are the list rules and the partial-edit
   rule, because both fail silently:

     · exactly one default, ALWAYS, including after the default is deleted
     · the first address saved becomes the default with nobody asking
     · a PATCH that changes one field does not clear the others
     · a pin is optional, and `null` CLEARS a stale one
     · a present-but-wrong pincode is refused; an absent one is fine
     · the rider's address is NOT part of onboarding completeness — adding it
       must not change whether an already-approved rider can work

   Nothing is texted: the rows are created the way the auth routes create them.
   Cleans up after itself.

   Run with: npm run verify:addresses
   ══════════════════════════════════════════════════════════════════════════ */
require('../src/config/env');
const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');
const createApp = require('../app');

const results = [];
const check = (name, ok, extra = '') => results.push([!!ok, name, extra]);

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
        'X-Client': 'addresses-verify',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty is fine */ }
    return { status: res.status, json };
  };

  const Customer = require('../src/modules/customers/customer.model');
  const Driver = require('../src/modules/drivers/driver.model');
  const Partner = require('../src/modules/partners/partner.model');
  const { signCustomerToken } = require('../src/modules/customers/customerAuth.middleware');
  const { signDriverToken } = require('../src/modules/drivers/driverAuth.middleware');
  const { signPartnerToken } = require('../src/modules/partners/partnerAuth.middleware');

  const stamp = String(Date.now()).slice(-6);
  let diner = null;
  let rider = null;
  let owner = null;

  try {
    /* ── The diner's BOOK ────────────────────────────────────────────── */
    diner = await Customer.create({
      customerId: `CU-VER${stamp}`, phone: `+919${stamp}101`, name: 'Address Diner',
    });
    const dinerToken = signCustomerToken(diner);

    const empty = await call('GET', '/api/v2/customers/me/addresses', undefined, dinerToken);
    check('a new diner has an empty book', empty.status === 200 && empty.json?.data?.length === 0);

    const first = await call('POST', '/api/v2/customers/me/addresses', {
      kind: 'room',
      label: 'Room',
      line1: 'Block C, Room 214',
      landmark: 'Opposite the mess',
      city: 'Rajahmundry',
      pincode: '533101',
      instructions: 'Ring twice, door left of the stairs',
      location: { lat: 16.9891, lng: 81.7836 },
    }, dinerToken);
    check('an address can be saved', first.status === 201, first.json?.message);
    check('the FIRST address is the default without asking', first.json?.data?.isDefault === true);
    check(
      'the pin is stored [lng, lat], unswapped',
      Array.isArray(first.json?.data?.location) && first.json.data.location[0] === 81.7836,
      JSON.stringify(first.json?.data?.location),
    );
    const firstId = first.json?.data?.addressId;

    const second = await call('POST', '/api/v2/customers/me/addresses', {
      kind: 'gate', label: 'Main gate', line1: 'Main gate, reception',
    }, dinerToken);
    check('a second address saves with no pin at all', second.status === 201, second.json?.message);
    check('and does NOT steal the default', second.json?.data?.isDefault === false);
    const secondId = second.json?.data?.addressId;

    /* Partial edit — the rule that fails silently. */
    const edited = await call('PATCH', `/api/v2/customers/me/addresses/${firstId}`, {
      label: 'My room',
    }, dinerToken);
    check('editing one field leaves the others alone',
      edited.json?.data?.label === 'My room'
      && edited.json?.data?.instructions === 'Ring twice, door left of the stairs'
      && edited.json?.data?.pincode === '533101',
      edited.json?.data?.instructions);

    const cleared = await call('PATCH', `/api/v2/customers/me/addresses/${firstId}`, {
      location: null,
    }, dinerToken);
    check('a stale pin can be cleared with null', cleared.json?.data?.location === null);

    const badPin = await call('POST', '/api/v2/customers/me/addresses', {
      line1: 'Somewhere', pincode: '12',
    }, dinerToken);
    check('a wrong pincode is refused', badPin.status === 400, badPin.json?.code);

    const noLine1 = await call('POST', '/api/v2/customers/me/addresses', { city: 'Rajahmundry' }, dinerToken);
    check('an address with no first line is refused', noLine1.status === 400, noLine1.json?.code);

    const swapped = await call('POST', '/api/v2/customers/me/addresses', {
      line1: 'Somewhere', location: { lat: 200, lng: 81 },
    }, dinerToken);
    check('an impossible pin is refused', swapped.status === 400, swapped.json?.code);

    /* Default handling. */
    const moved = await call('POST', `/api/v2/customers/me/addresses/${secondId}/default`, undefined, dinerToken);
    const defaults = (moved.json?.addresses || []).filter((a) => a.isDefault);
    check('the default can be moved, and there is exactly one',
      moved.status === 200 && defaults.length === 1 && defaults[0].addressId === secondId);
    check('the book comes back default-first', moved.json?.addresses?.[0]?.addressId === secondId);

    const removed = await call('DELETE', `/api/v2/customers/me/addresses/${secondId}`, undefined, dinerToken);
    const after = removed.json?.addresses || [];
    check('deleting the DEFAULT promotes the survivor',
      removed.status === 200 && after.length === 1 && after[0].isDefault === true,
      JSON.stringify(after.map((a) => [a.addressId, a.isDefault])));

    const ghost = await call('DELETE', '/api/v2/customers/me/addresses/AD-NOPE0000', undefined, dinerToken);
    check('deleting an address that is not there is a 404', ghost.status === 404);

    const noToken = await call('GET', '/api/v2/customers/me/addresses');
    check('the book needs a session', noToken.status === 401);

    /* ── The rider's ONE ─────────────────────────────────────────────── */
    rider = await Driver.create({
      driverId: `DR-VER${stamp}`, phone: `+919${stamp}202`, name: 'Address Rider',
      status: 'approved', hasCompletedOnboarding: true,
    });
    const riderToken = signDriverToken(rider);

    const riderSet = await call('PATCH', '/api/v2/drivers/me', {
      address: {
        kind: 'home', line1: '12-3-45, Danavaipeta', city: 'Rajahmundry', pincode: '533103',
      },
    }, riderToken);
    check('a rider can save their address', riderSet.status === 200, riderSet.json?.message);
    check('and it comes back on the profile',
      riderSet.json?.data?.address?.line1 === '12-3-45, Danavaipeta',
      riderSet.json?.data?.address?.line1);

    const riderEdit = await call('PATCH', '/api/v2/drivers/me', {
      address: { landmark: 'Near the temple' },
    }, riderToken);
    check('editing it keeps the rest',
      riderEdit.json?.data?.address?.landmark === 'Near the temple'
      && riderEdit.json?.data?.address?.city === 'Rajahmundry');

    /* The rule that protects everybody already on the road. */
    const stillOnline = await call('POST', '/api/v2/drivers/me/duty', { online: true }, riderToken);
    check(
      'an address is NOT required to work — an approved rider still goes online',
      stillOnline.status === 200,
      stillOnline.json?.code || 'online',
    );
    await call('POST', '/api/v2/drivers/me/duty', { online: false }, riderToken);

    const riderBad = await call('PATCH', '/api/v2/drivers/me', {
      address: { line1: 'x', pincode: 'abcdef' },
    }, riderToken);
    check('a bad pincode is refused on the rider too', riderBad.status === 400, riderBad.json?.code);

    /* ── The owner's ONE ─────────────────────────────────────────────── */
    /* `phoneVerifiedAt` is what `requirePartner` checks — an owner row without
       it is refused PHONE_NOT_VERIFIED, exactly as a real unverified one would
       be. Set here because the auth route that normally sets it is the one this
       script deliberately does not call (it texts). */
    owner = await Partner.create({
      partnerId: `PA-VER${stamp}`, phone: `+919${stamp}303`,
      phoneDigits: `9${stamp}303`, name: 'Address Owner',
      phoneVerifiedAt: new Date(),
    });
    const ownerToken = signPartnerToken(owner);

    const ownerSet = await call('PATCH', '/api/v2/partners/me', {
      address: { kind: 'work', line1: 'Sai Enclave, Morampudi', city: 'Rajahmundry' },
    }, ownerToken);
    check('an owner can save their address', ownerSet.status === 200, ownerSet.json?.message);
    check('and it comes back on the profile',
      ownerSet.json?.data?.address?.line1 === 'Sai Enclave, Morampudi',
      ownerSet.json?.data?.address?.line1);

    const ownerCleared = await call('PATCH', '/api/v2/partners/me', { address: null }, ownerToken);
    check('and can be cleared', ownerCleared.json?.data?.address === null);

    /* ── The crosshair's payload ─────────────────────────────────────────
       Every form now carries a "use my current location" control, and what it
       sends is `{lat, lng}` — what a device's location API returns. The server
       stores `[lng, lat]`. This is the boundary where a swap would be silent,
       so it is asserted on all three surfaces rather than just the diner's. */
    const pinned = await call('POST', '/api/v2/customers/me/addresses', {
      line1: 'Pinned by crosshair',
      location: { lat: 16.9891, lng: 81.7836 },
    }, dinerToken);
    check("the crosshair's {lat,lng} is stored as [lng, lat] for a diner",
      pinned.json?.data?.location?.[0] === 81.7836 && pinned.json?.data?.location?.[1] === 16.9891,
      JSON.stringify(pinned.json?.data?.location));

    const riderPinned = await call('PATCH', '/api/v2/drivers/me', {
      address: { line1: 'Pinned', location: { lat: 16.98, lng: 81.78 } },
    }, riderToken);
    check('and for a rider',
      riderPinned.json?.data?.address?.location?.[0] === 81.78,
      JSON.stringify(riderPinned.json?.data?.address?.location));

    const ownerPinned = await call('PATCH', '/api/v2/partners/me', {
      address: { line1: 'Pinned', location: { lat: 16.97, lng: 81.77 } },
    }, ownerToken);
    check('and for an owner',
      ownerPinned.json?.data?.address?.location?.[0] === 81.77,
      JSON.stringify(ownerPinned.json?.data?.address?.location));

    /* A pinned address is the whole reason the zone check can finally answer:
       before this, no address in the product carried coordinates at all. */
    const served = await call('GET', '/api/v2/zones/check?lat=16.9891&lng=81.7836&service=food');
    check('a pinned address can be asked about by the zone check',
      served.status === 200 && typeof served.json?.serviceable === 'boolean',
      `serviceable: ${served.json?.serviceable}`);

    /* ── One validator, three callers ────────────────────────────────── */
    const sameRefusal = [
      (await call('POST', '/api/v2/customers/me/addresses', { line1: 'x', pincode: '000000' }, dinerToken)).json?.code,
      (await call('PATCH', '/api/v2/drivers/me', { address: { line1: 'x', pincode: '000000' } }, riderToken)).json?.code,
      (await call('PATCH', '/api/v2/partners/me', { address: { line1: 'x', pincode: '000000' } }, ownerToken)).json?.code,
    ];
    check('all three refuse the same bad pincode with the same code',
      new Set(sameRefusal).size === 1 && sameRefusal[0] === 'BAD_PINCODE',
      sameRefusal.join(' / '));
  } catch (error) {
    check('the run completed', false, error.message);
  } finally {
    try {
      if (diner) await Customer.deleteOne({ _id: diner._id });
      if (rider) await Driver.deleteOne({ _id: rider._id });
      if (owner) await Partner.deleteOne({ _id: owner._id });
    } catch (error) {
      console.error('cleanup failed:', error.message);
    }
    server.close();
    await closeConnections().catch(() => {});
  }

  const line = '='.repeat(78);
  console.log(`\n${line}\n  ADDRESSES — DINER, RIDER, OWNER\n${line}`);
  let failed = 0;
  for (const [ok, name, extra] of results) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? `  · ${extra}` : ''}`);
  }
  console.log(`${line}\n  ${results.length - failed}/${results.length} passed\n${line}\n`);
  process.exit(failed ? 1 : 0);
})();
