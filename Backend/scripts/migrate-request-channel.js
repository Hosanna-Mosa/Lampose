/* ══════════════════════════════════════════════════════════════════════════
   Stamp `channel: 'web'` on every request written before the field existed.

   ## Why a schema default is not enough

   `visitRequestSchema` declares `channel` with `default: 'web'`, which covers
   every row written from now on and none of the rows already there. Mongoose
   applies a default when it CREATES a document and when it hydrates one for
   reading — so `doc.channel` answers `'web'` and the gap is invisible from the
   application. It is not invisible to the database:

     db.visitrequests.find({ channel: 'web' })     → misses every legacy row
     db.visitrequests.find({ channel: 'app' })     → correctly misses them too

   Reads are fine. Queries are not. That asymmetry is the trap: the expiry
   worker filters on `channel: 'app'` and is safe by luck rather than by
   design, and the first query written against `'web'` silently returns a
   partial answer.

   ## What it does and does not touch

   Only documents with NO `channel` at all. A row that already says `web` or
   `app` is left exactly as it is, so running this twice is a no-op and running
   it after the app channel is live cannot reclassify a real request.

     npm run migrate:channel              report what would change
     npm run migrate:channel -- --apply   write it
     npm run migrate:channel -- --db lamp_booking_dev --apply

   Dry by default. A migration that runs the moment you type it is one you
   cannot inspect first.
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const mongoose = require('mongoose');

const config = require('../src/config/env');

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

  const VisitRequest = require('../src/modules/visits/visitRequest.model');
  const database = mongoose.connection.name;

  const missing = { channel: { $exists: false } };

  const total = await VisitRequest.countDocuments({});
  const unstamped = await VisitRequest.countDocuments(missing);

  console.log(`\n  ${database}`);
  console.log(`  ${total} request(s), ${unstamped} without a channel\n`);

  if (!unstamped) {
    console.log('  ✅ Nothing to migrate.\n');
    await mongoose.disconnect();
    return;
  }

  /* Shown before anything is written, because "24 rows are about to be
     reclassified" is worth reading rather than being told afterwards. */
  const sample = await VisitRequest.find(missing)
    .select('_id status createdAt propertyName')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  console.log('  These would become channel: "web" —\n');
  for (const row of sample) {
    console.log(`    ${row._id}  ${String(row.status).padEnd(14)} ${String(row.propertyName || '').slice(0, 30)}`);
  }
  if (unstamped > sample.length) console.log(`    … and ${unstamped - sample.length} more`);

  if (!APPLY) {
    console.log('\n  Nothing was written. Re-run with --apply.\n');
    await mongoose.disconnect();
    return;
  }

  const result = await VisitRequest.updateMany(missing, { $set: { channel: 'web' } });
  const left = await VisitRequest.countDocuments(missing);

  console.log(`\n  ✅ Stamped ${result.modifiedCount} request(s). ${left} still unstamped.\n`);

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('\nMigration failed:', error.message, '\n');
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
