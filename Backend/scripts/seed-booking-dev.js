/* ══════════════════════════════════════════════════════════════════════════
   Make a cloned database actually exercisable by the stay-request flow.

   A straight copy of production cannot test this feature, because production
   cannot run it yet: of twelve properties, three have no owner mobile at all,
   seven belong to owners who have never opened the Stay Partner app, and none
   has a bed count — the field did not exist until now. Every one of those is
   a legitimate refusal, so a clone as-is exercises nothing but the refusals.

   This fills the gaps, and deliberately leaves some in place: the point is a
   database with BOTH kinds of property in it, so a test can prove a request is
   created for a good one and refused for each flavour of bad one.

   After running, the clone holds:

     · properties with bed counts, owned by onboarded partners     REQUESTABLE
     · a property whose owner has never signed up                  refused
     · a property with no owner mobile at all                      refused
     · a property with no bed counts recorded                      refused
     · one share type with a single bed                            conflict case

     npm run seed:booking                       seeds lamp_booking_dev
     npm run seed:booking -- --db lamp_scratch  somewhere else

   ## The guard

   It refuses to touch the live database by name. That check is the reason this
   script may exist at all — everything below rewrites owner numbers and room
   counts, which would be vandalism against real listings.
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const mongoose = require('mongoose');

const config = require('../src/config/env');

/* Never these, whatever is passed. Extend the list, never shorten it. */
const PROTECTED = ['lamp_onboarding', 'lampose', 'production', 'prod'];

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const TARGET_DB = arg('db', 'lamp_booking_dev');

/** Rooms per sharing option, by how many share one. Plausible for a real PG. */
const ROOMS_FOR = { 1: 2, 2: 3, 3: 2, 4: 2 };

const main = async () => {
  if (!config.db.uri) {
    console.error('MONGO_URI is missing from Backend/.env');
    process.exit(1);
  }

  if (PROTECTED.includes(TARGET_DB.toLowerCase())) {
    console.error(`\n  Refusing to seed "${TARGET_DB}" — it is on the protected list.`);
    console.error('  Clone it first:  npm run clone:db\n');
    process.exit(1);
  }

  await mongoose.connect(config.db.uri, { ...config.db.options, dbName: TARGET_DB });
  console.log(`\n  Seeding ${TARGET_DB}\n`);

  /* Required after the connection, so the models bind to this database. */
  const Property = require('../src/modules/properties/property.model');
  const Partner = require('../src/modules/partners/partner.model');
  const { PartnerShareType } = require('../src/modules/partners/partnerDomains.model');
  const { syncShareTypes } = require('../src/modules/inventory/inventory.service');
  const { sharingOptionsFor, occupancyOf } = require('../src/modules/listings/sharing.util');

  const { phoneKey } = Partner;

  /* ── 1. Clear the hand-seeded fixtures ────────────────────────────────
     Two rows on `propertyId: "prop_1"`, which is not a property id. They
     predate the inventory service and point at nothing, so `syncShareTypes`
     — which cleans orphans per property — will never reach them. */
  const orphans = await PartnerShareType.deleteMany({
    propertyId: { $nin: (await Property.find({}).select('_id').lean()).map((p) => String(p._id)) },
  });
  console.log(`  Removed ${orphans.deletedCount} orphaned share-type row(s)`);

  /* ── 2. Who can actually receive a request ────────────────────────────── */
  const partners = await Partner.find({ phoneVerifiedAt: { $ne: null } }).lean();
  if (!partners.length) {
    console.error('  No verified partners in this database — nothing can receive a request.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`  ${partners.length} onboarded partner(s): ${partners.map((p) => `${p.name || '?'} (${p.phoneDigits})`).join(', ')}\n`);

  const properties = await Property.find({}).sort({ createdAt: 1 });
  const onboarded = new Set(partners.map((p) => p.phoneDigits));

  /* Kept deliberately broken, so the refusal paths have something to refuse.
     Chosen by position rather than by name so a reseed is stable. */
  const KEEP_UNOWNED = 1;      // no owner mobile
  const KEEP_UNLINKED = 1;     // owner never signed up
  const KEEP_UNCOUNTED = 1;    // no bed counts

  let unownedKept = 0; let unlinkedKept = 0; let uncountedKept = 0;
  /* The same-bed conflict needs a share type with exactly one bed, and it has
     to be given to the first property that actually RECEIVES counts — not the
     first property in the loop, which may be one deliberately left uncounted. */
  let singleBedMade = false;
  const summary = [];

  for (const property of properties) {
    const key = phoneKey(property.ownerMobile);
    const options = sharingOptionsFor(property);
    const note = [];
    /* Tracked separately from `note`, because "kept unowned" is a note about
       a property that must NOT be written: three of these have no owner name
       either, and the schema requires one — saving an untouched invalid
       document would fail validation on a row we deliberately left alone. */
    let mutated = false;

    /* ── Owner ─────────────────────────────────────────────────────────── */
    if (!key) {
      if (unownedKept < KEEP_UNOWNED) {
        unownedKept += 1;
        note.push('kept unowned');
      } else {
        /* Round-robin across the real partners, so more than one owner has
           inventory and the "two owners cannot see each other's requests"
           check has something to check. */
        const partner = partners[summary.length % partners.length];
        property.ownerMobile = partner.phone;
        /* Required by the schema and absent on exactly these rows — the same
           gap that left them without a number left them without a name. */
        property.ownerName = property.ownerName || partner.name || 'Property Owner';
        note.push(`owner → ${partner.phoneDigits}`);
        mutated = true;
      }
    } else if (!onboarded.has(key)) {
      if (unlinkedKept < KEEP_UNLINKED) {
        unlinkedKept += 1;
        note.push('kept unlinked');
      } else {
        const partner = partners[summary.length % partners.length];
        property.ownerMobile = partner.phone;
        property.ownerName = property.ownerName || partner.name || 'Property Owner';
        note.push(`owner → ${partner.phoneDigits}`);
        mutated = true;
      }
    }

    /* ── Beds ──────────────────────────────────────────────────────────── */
    const counted = options.filter((o) => o.totalBeds).length;
    if (!counted && options.length) {
      if (uncountedKept < KEEP_UNCOUNTED) {
        uncountedKept += 1;
        note.push('kept uncounted');
      } else {
        const rooms = {};
        const beds = {};
        options.forEach((option, index) => {
          const occupancy = occupancyOf(option.label);
          if (occupancy) {
            /* One room holding one person — a single bed, which is the only
               way the same-bed conflict is reachable without contriving it in
               a test. Given once, to the first option that can hold exactly
               one person on the first property to be counted. */
            const wantsSingle = !singleBedMade && occupancy === 1;
            if (wantsSingle) singleBedMade = true;
            const roomCount = wantsSingle ? 1 : (ROOMS_FOR[occupancy] || 2);
            rooms[option.label] = roomCount;
            beds[option.label] = roomCount * occupancy;
          } else {
            beds[option.label] = 12;
          }
        });
        property.categoryDetails = { ...(property.categoryDetails || {}), sharingRooms: rooms, sharingBeds: beds };
        property.markModified('categoryDetails');
        note.push(`beds ${Object.values(beds).join('/')}`);
        mutated = true;
      }
    }

    if (mutated) await property.save();
    const result = await syncShareTypes(property);

    summary.push({ name: property.name, note, result });
  }

  for (const row of summary) {
    const { created, synced, skipped } = row.result;
    console.log(
      `  ${String(row.name).slice(0, 34).padEnd(36)}`
      + `${(row.note.join(', ') || '—').padEnd(28)}`
      + `${created ? `${created} row(s) created` : ''}${synced ? `${synced} synced` : ''}${!created && !synced ? `${skipped} skipped` : ''}`,
    );
  }

  /* ── 3. What the flow can now see ─────────────────────────────────────── */
  const rows = await PartnerShareType.find({}).sort({ propertyId: 1, name: 1 }).lean();
  console.log(`\n  ${rows.length} claimable share type(s):\n`);
  for (const row of rows) {
    console.log(`    ${row.shareTypeId.padEnd(38)} ${row.name.padEnd(18)} ${row.availableBeds}/${row.totalBeds} free`);
  }

  const single = rows.find((r) => r.totalBeds === 1);
  console.log(single
    ? `\n  Same-bed conflict case: ${single.shareTypeId} has exactly one bed.`
    : '\n  ⚠ No single-bed share type — the conflict case is not reachable.');

  console.log(`\n  ✅ Seeded. Verify with:  DB_NAME=${TARGET_DB} npm run verify\n`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('\nSeed failed:', error.message, '\n');
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
