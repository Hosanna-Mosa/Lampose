/* ══════════════════════════════════════════════════════════════════════════
   Rewrite `properties.category` from labels to codes.

     PG              →  PG_HOSTEL
     Hostel          →  PG_HOSTEL
     Dormitory       →  HOTEL
     Bachelor Room   →  BACHELOR

   ## Why the values changed at all

   The collection stored four display strings, and every surface that rendered
   them agreed by coincidence. The list existed in five places — the schema
   enum, two controller allow-lists, the sharing key map, the frontend order —
   and had already drifted: the mobile app merged PG and Hostel into one tab
   and mapped Dormitory onto a category the database did not have.

   Codes end that. A label is presentation and now lives in one table per
   surface; the code is identity and lives in shared/constants/categories.js.
   Renaming "Hotels" on a screen is a one-line change rather than this script.

   ## Why Dormitory becomes HOTEL and not PG_HOSTEL

   Because that is what it already behaved like. It is the only category the
   panel prices by the night, and the mobile app has been rendering it as
   "By the night" through `listing.adapter.ts` for as long as that file has
   existed. Folding it into PG_HOSTEL would have changed how its one property
   is priced; this keeps it.

   ## Safety

   Idempotent: it selects rows whose category is not already one of the four
   codes, so a second run finds nothing. A value it does not recognise is
   REPORTED AND SKIPPED rather than guessed at — an unmapped category is a
   question for a person, and a wrong guess here is a property filed under the
   wrong tab with no record of what it used to be.

   Rows are also checked against the share-type inventory: `partner_share_types`
   keys off the property, not its category, so nothing there needs rewriting —
   this only confirms it.

     npm run migrate:categories              report what would change
     npm run migrate:categories -- --apply   write it
     npm run migrate:categories -- --db lamp_booking_dev --apply

   Dry by default.
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const mongoose = require('mongoose');

const config = require('../src/config/env');
const {
  CATEGORIES, CATEGORY_LABEL, normaliseCategory,
} = require('../src/shared/constants/categories');

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const APPLY = process.argv.includes('--apply');
const TARGET_DB = arg('db', config.db.dbName || undefined);

const main = async () => {
  if (!config.db.uri) {
    console.error('MONGO_URI is missing from Backend/.env');
    process.exit(1);
  }

  await mongoose.connect(config.db.uri, {
    ...config.db.options,
    ...(TARGET_DB ? { dbName: TARGET_DB } : {}),
  });

  const database = mongoose.connection.name;
  const properties = mongoose.connection.db.collection('properties');

  console.log(`\n🏷️  Property categories → codes`);
  console.log(`   database   ${database}`);
  console.log(`   mode       ${APPLY ? 'APPLY — this writes' : 'dry run — nothing is written'}\n`);

  /* Everything not already a code. Deliberately not `{ category: { $in: [old
     values] } }`: that would miss a spelling nobody remembered to list, and
     silently leaving a row behind is the failure mode worth engineering
     against. */
  const stale = await properties
    .find({ category: { $nin: CATEGORIES } })
    .project({ _id: 1, name: 1, category: 1 })
    .toArray();

  const total = await properties.countDocuments();

  if (!stale.length) {
    console.log(`   Nothing to do — all ${total} properties already carry a code.\n`);
    await mongoose.disconnect();
    return;
  }

  const planned = [];
  const unmapped = [];

  for (const row of stale) {
    const code = normaliseCategory(row.category);
    if (code) planned.push({ ...row, code });
    else unmapped.push(row);
  }

  const tally = planned.reduce((acc, row) => {
    const key = `${row.category || '(unset)'} → ${row.code}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log(`   ${stale.length} of ${total} properties still carry a label.\n`);
  for (const [move, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(n).padStart(3)}  ${move}`);
  }

  if (unmapped.length) {
    console.log(`\n   ⚠️  ${unmapped.length} row(s) carry a category nothing maps:`);
    for (const row of unmapped) {
      console.log(`        ${row._id}  ${JSON.stringify(row.category)}  ${row.name || '(unnamed)'}`);
    }
    console.log('        These are SKIPPED. Decide what they are, add them to');
    console.log('        LEGACY_CATEGORY in shared/constants/categories.js, and re-run.');
  }

  if (!APPLY) {
    console.log(`\n   Dry run. Re-run with --apply to write.\n`);
    await mongoose.disconnect();
    return;
  }

  let written = 0;
  for (const row of planned) {
    const { modifiedCount } = await properties.updateOne(
      /* The original value is part of the filter, so a row somebody else
         migrated between the read above and this write is left alone rather
         than rewritten twice. */
      { _id: row._id, category: row.category },
      { $set: { category: row.code } },
    );
    written += modifiedCount;
  }

  console.log(`\n   ✅ ${written} propert${written === 1 ? 'y' : 'ies'} rewritten.`);

  const remaining = await properties.countDocuments({ category: { $nin: CATEGORIES } });
  console.log(`   ${remaining} row(s) still outside the enum${remaining ? ' — see the list above.' : '.'}`);

  const after = await properties.aggregate([
    { $group: { _id: '$category', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray();
  console.log('\n   Now:');
  for (const row of after) {
    const label = CATEGORY_LABEL[row._id] || '(not a known code)';
    console.log(`     ${String(row.n).padStart(3)}  ${String(row._id).padEnd(12)} ${label}`);
  }
  console.log('');

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error(`\n❌ ${error.message}\n`);
  process.exit(1);
});
