/* ══════════════════════════════════════════════════════════════════════════
   Rebuild `food_restaurants.ownerEmail_1` as a SPARSE unique index.

   ## Why a script and not a schema change

   The schema now says `unique: true, sparse: true`, and that is enough for a
   database that has never seen this collection. It is not enough for one that
   has: MongoDB will not alter an index in place, and mongoose's `autoIndex`
   only CREATES an index that is missing — it looks at the name, finds
   `ownerEmail_1` already there, and leaves the old unique non-sparse
   definition exactly as it is. Nothing warns. The first restaurant onboarded
   without an email saves fine; the second fails with

     E11000 duplicate key error … index: ownerEmail_1 dup key: { ownerEmail: null }

   — a duplicate-key error naming a field neither owner filled in.

   ## What it does

   Drops `ownerEmail_1` and creates it again with `sparse: true`. Both
   statements are about an index, so no document is read or written and no
   restaurant changes; the collection is unavailable for the fraction of a
   second between the two, which on this collection's size is a rebuild of a
   few milliseconds.

     npm run fix:owner-email-index                 report what is there
     npm run fix:owner-email-index -- --apply      rebuild it
     npm run fix:owner-email-index -- --db lampose_dev --apply

   Dry by default, and safe to run twice: an index that is already sparse is
   reported and left alone.

   ## Before you run it against production

   An `ownerEmail: ''` written by an older build would collide on the new index
   just as null did — a sparse index skips a MISSING field, not an empty
   string. This checks for those first and refuses rather than dropping an
   index it then cannot rebuild, which would leave the collection with no
   uniqueness on the email at all.
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const mongoose = require('mongoose');

const config = require('../src/config/env');

/* Reporting is harmless anywhere; dropping an index is not. */
if (process.argv.includes('--apply')) require('../src/infrastructure/database/guard').assertDevTargetOrExit();

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const APPLY = process.argv.includes('--apply');
const TARGET_DB = arg('db', config.db.dbName || undefined);
const INDEX = 'ownerEmail_1';

const main = async () => {
  if (!config.db.uri) {
    console.error('MONGO_URI is missing from Backend/.env');
    process.exit(1);
  }

  await mongoose.connect(config.db.uri, {
    ...config.db.options,
    ...(TARGET_DB ? { dbName: TARGET_DB } : {}),
  });

  const collection = mongoose.connection.collection('food_restaurants');
  const database = mongoose.connection.name;

  const indexes = await collection.indexes();
  const existing = indexes.find((entry) => entry.name === INDEX);

  console.log(`\n  ${database}.food_restaurants\n`);

  if (!existing) {
    console.log(`  No ${INDEX} to rebuild — mongoose will create it sparse on next boot.\n`);
    await mongoose.disconnect();
    return;
  }

  console.log(`  ${INDEX}: unique=${Boolean(existing.unique)} sparse=${Boolean(existing.sparse)}`);

  if (existing.sparse && existing.unique) {
    console.log('\n  ✅ Already a sparse unique index. Nothing to do.\n');
    await mongoose.disconnect();
    return;
  }

  /* An empty string is a value, and a sparse index would still refuse the
     second one. Found now, while the old index is still standing. */
  const blanks = await collection.countDocuments({ ownerEmail: '' });
  if (blanks > 1) {
    console.log(
      `\n  ⛔ ${blanks} restaurant(s) hold ownerEmail: "" — a sparse index cannot`
      + '\n     skip an empty string, so the rebuild would fail and leave the'
      + '\n     collection with no unique index at all. Unset those fields first:'
      + '\n       db.food_restaurants.updateMany({ ownerEmail: "" }, { $unset: { ownerEmail: 1 } })\n',
    );
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }

  const withoutEmail = await collection.countDocuments({
    $or: [{ ownerEmail: { $exists: false } }, { ownerEmail: null }],
  });
  console.log(`  ${withoutEmail} restaurant(s) currently carry no email\n`);

  if (!APPLY) {
    console.log('  Nothing was changed. Re-run with --apply.\n');
    await mongoose.disconnect();
    return;
  }

  await collection.dropIndex(INDEX);
  await collection.createIndex({ ownerEmail: 1 }, { unique: true, sparse: true, name: INDEX });

  const [rebuilt] = (await collection.indexes()).filter((entry) => entry.name === INDEX);
  console.log(`  ✅ ${INDEX}: unique=${Boolean(rebuilt.unique)} sparse=${Boolean(rebuilt.sparse)}\n`);

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('\nIndex rebuild failed:', error.message, '\n');
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
