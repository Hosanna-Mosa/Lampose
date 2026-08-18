/* ══════════════════════════════════════════════════════════════════════════
   Copy a database, so the destructive checks never run against the live one.

   `npm run verify` creates a temp admin, a temp employee, a temp lead, a temp
   property and a temp permission request, then deletes them again. That is
   fine on a database nobody depends on and is a real write to one people do.
   Every module of the booking flow is meant to be verified end to end, which
   means verify runs often — so it needs somewhere of its own to run.

     npm run clone:db                        lamp_onboarding → lamp_booking_dev
     npm run clone:db -- --to lamp_scratch   somewhere else
     npm run clone:db -- --fresh             drop the target first
     npm run clone:db -- --target-uri "..."  a different cluster entirely

   ## The source is opened read-only, by construction

   Nothing in this file writes to the source database. There is no update, no
   delete and no index build against it — only `find()` and `listCollections()`.
   That is the one property worth checking if you ever edit this script.

   ## Indexes come too

   A copy without them is a copy where a unique constraint silently does not
   apply, which is exactly the kind of difference that makes a test pass on the
   clone and fail in production. `_id_` is skipped because Mongo creates it.
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const { MongoClient } = require('mongodb');

const config = require('../src/config/env');

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const SOURCE_DB = arg('from', config.db.dbName || 'lamp_onboarding');
const TARGET_DB = arg('to', 'lamp_booking_dev');
const TARGET_URI = arg('target-uri', config.db.uri);
const FRESH = process.argv.includes('--fresh');

const BATCH = 500;

const main = async () => {
  if (!config.db.uri) {
    console.error('MONGO_URI is missing from Backend/.env');
    process.exit(1);
  }

  const sameCluster = TARGET_URI === config.db.uri;

  if (sameCluster && SOURCE_DB === TARGET_DB) {
    console.error(`Refusing to clone ${SOURCE_DB} onto itself.`);
    process.exit(1);
  }

  const source = await MongoClient.connect(config.db.uri);
  const target = sameCluster ? source : await MongoClient.connect(TARGET_URI);

  const from = source.db(SOURCE_DB);
  const to = target.db(TARGET_DB);

  console.log(`\n  ${SOURCE_DB}  →  ${TARGET_DB}${sameCluster ? '' : '  (different cluster)'}\n`);

  if (FRESH) {
    await to.dropDatabase();
    console.log('  dropped the target first (--fresh)\n');
  }

  const collections = (await from.listCollections().toArray())
    .filter((c) => c.type !== 'view' && !c.name.startsWith('system.'));

  let totalDocs = 0;

  for (const { name } of collections) {
    const docs = await from.collection(name).find({}).toArray();

    if (docs.length) {
      /* Replaced rather than appended: a second clone onto a target that was
         not dropped must not double every document. `_id` is preserved, so
         references between collections survive the copy. */
      const ops = docs.map((doc) => ({
        replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
      }));
      for (let i = 0; i < ops.length; i += BATCH) {
        await to.collection(name).bulkWrite(ops.slice(i, i + BATCH), { ordered: false });
      }
    } else {
      /* An empty collection is still a fact about the schema. Created so the
         clone's shape matches rather than silently having fewer collections. */
      await to.createCollection(name).catch(() => {});
    }

    /* Indexes, including the unique ones. Failures are reported rather than
       thrown: a unique index that cannot build because the SOURCE holds
       duplicates is a finding about production, not a reason to abandon the
       copy. */
    let indexNote = '';
    try {
      const indexes = (await from.collection(name).indexes()).filter((i) => i.name !== '_id_');
      for (const index of indexes) {
        const { key, name: indexName, v, ns, ...options } = index;
        try {
          await to.collection(name).createIndex(key, { name: indexName, ...options });
        } catch (error) {
          indexNote += `  ⚠ index ${indexName}: ${error.message.split('\n')[0]}`;
        }
      }
      if (indexes.length) indexNote = `${indexes.length} index(es)${indexNote}`;
    } catch (error) {
      indexNote = `⚠ indexes: ${error.message}`;
    }

    totalDocs += docs.length;
    console.log(`  ${name.padEnd(34)} ${String(docs.length).padStart(5)} docs   ${indexNote}`);
  }

  console.log(`\n  ✅ ${collections.length} collections, ${totalDocs} documents copied.`);
  console.log(`\n  Point the app at it with:  DB_NAME=${TARGET_DB} npm run dev`);
  console.log(`  Verify against it with:    DB_NAME=${TARGET_DB} npm run verify\n`);

  await source.close();
  if (!sameCluster) await target.close();
};

main().catch(async (error) => {
  console.error('\nClone failed:', error.message, '\n');
  process.exit(1);
});
