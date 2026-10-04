/* ══════════════════════════════════════════════════════════════════════════
   Rebuild `food_restaurants.ownerPhone_1` to match FOOD_ALLOW_DUPLICATE_OWNER_PHONE.

   TESTING ONLY. With the flag on, the schema stops declaring `ownerPhone`
   unique — but MongoDB will not alter an index in place and mongoose only
   creates indexes that are missing, so the old unique index keeps refusing
   the second restaurant on a number. This drops it and rebuilds it as a
   plain (non-unique) index. With the flag off, it rebuilds it unique again,
   and refuses if duplicates exist, since that rebuild would fail.

     npm run fix:owner-phone-index                 report what is there
     npm run fix:owner-phone-index -- --apply      rebuild it
     npm run fix:owner-phone-index -- --db lamp_booking_dev --apply

   Dry by default. `--apply` goes through the database guard, so it refuses a
   protected (production) database.
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
const INDEX = 'ownerPhone_1';
const WANT_UNIQUE = !config.food.allowDuplicateOwnerPhone;

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

  const existing = (await collection.indexes()).find((entry) => entry.name === INDEX);

  console.log(`\n  ${database}.food_restaurants`);
  console.log(`  FOOD_ALLOW_DUPLICATE_OWNER_PHONE → want unique=${WANT_UNIQUE}\n`);

  if (existing) {
    console.log(`  ${INDEX}: unique=${Boolean(existing.unique)}`);
    if (Boolean(existing.unique) === WANT_UNIQUE) {
      console.log('\n  ✅ Already matches. Nothing to do.\n');
      await mongoose.disconnect();
      return;
    }
  } else {
    console.log(`  No ${INDEX} yet.`);
  }

  if (WANT_UNIQUE) {
    const dupes = await collection.aggregate([
      { $group: { _id: '$ownerPhone', n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ]).toArray();
    if (dupes.length) {
      console.log(
        `\n  ⛔ ${dupes.length} phone number(s) are shared by several restaurants, so a`
        + '\n     unique index cannot be built. Remove the test duplicates first:'
        + `\n       ${dupes.map((d) => d._id).join(', ')}\n`,
      );
      await mongoose.disconnect();
      process.exitCode = 1;
      return;
    }
  }

  if (!APPLY) {
    console.log('\n  Nothing was changed. Re-run with --apply.\n');
    await mongoose.disconnect();
    return;
  }

  if (existing) await collection.dropIndex(INDEX);
  await collection.createIndex({ ownerPhone: 1 }, { unique: WANT_UNIQUE, name: INDEX });

  const rebuilt = (await collection.indexes()).find((entry) => entry.name === INDEX);
  console.log(`\n  ✅ ${INDEX}: unique=${Boolean(rebuilt.unique)}\n`);

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('\nIndex rebuild failed:', error.message, '\n');
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
