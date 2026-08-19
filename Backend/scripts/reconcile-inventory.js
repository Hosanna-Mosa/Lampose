/* ══════════════════════════════════════════════════════════════════════════
   Do the bed counters still agree with the bookings?

   `partner_share_types.availableBeds` is a stored number, moved by atomic
   increments as requests are accepted, bookings cancelled and tenants checked
   out. That is what makes the "last bed" conflict resolvable at all — you
   cannot put a conditional filter on a number you compute — but it also means
   a writer that forgets leaves the counter quietly wrong, and the symptom
   arrives weeks later as an owner saying "it says full and it isn't".

   This recomputes what availability SHOULD be from `partner_bookings` and
   reports every row that disagrees.

     npm run reconcile:inventory          report only, changes nothing
     npm run reconcile:inventory -- --fix write the recomputed numbers back

   Reporting is the default deliberately. A reconcile that silently repairs
   rows destroys the only evidence of which writer is broken — run it without
   --fix first, find out what drifted and why, then fix.

   Also the backfill tool: a catalogue whose properties are being given bed
   counts for the first time gets its rows from the property write itself,
   and this is how you check the seeding was right.
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const mongoose = require('mongoose');

const config = require('../src/config/env');
const { reconcile } = require('../src/modules/inventory/inventory.service');

const fix = process.argv.includes('--fix');

const main = async () => {
  if (!config.db.uri) {
    console.error('MONGO_URI is missing from Backend/.env');
    process.exit(1);
  }

  await mongoose.connect(config.db.uri, {
    ...config.db.options,
    ...(config.db.dbName ? { dbName: config.db.dbName } : {}),
  });

  const { checked, drifted, fixed } = await reconcile({ fix });

  console.log(`\n  Share-type rows checked: ${checked}`);

  if (!drifted.length) {
    console.log('  ✅ Every counter agrees with the bookings.\n');
    await mongoose.disconnect();
    return;
  }

  console.log(`  ⚠️  ${drifted.length} row(s) disagree:\n`);
  for (const row of drifted) {
    const direction = row.stored > row.expected ? 'too many free' : 'too few free';
    console.log(`    ${row.shareTypeId}`);
    console.log(`      ${row.name} — ${row.totalBeds} beds, ${row.occupied} occupied`);
    console.log(`      stored ${row.stored}, expected ${row.expected}  (${direction})\n`);
  }

  if (fix) {
    console.log(`  ✅ Wrote ${fixed} corrected row(s).\n`);
  } else {
    console.log('  Nothing was written. Re-run with --fix once you know why they drifted.\n');
  }

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('Reconcile failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
