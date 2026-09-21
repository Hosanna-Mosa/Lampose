/* ══════════════════════════════════════════════════════════════════════════
   Move the real data into a clean database.

     npm run migrate:clean-db -- --to lampose_prod
         report only: what would move, what would be dropped, what is orphaned

     npm run migrate:clean-db -- --to lampose_prod --confirm-database lampose_prod
         actually copy

     …-- --drop-orphans        also leave behind rows whose parent never existed
     …-- --target-uri "…"      a different cluster entirely

   ## What decides

   `scripts/export-review-snapshot.js` wrote the evidence, a person read it
   and marked rows in the review page, and this reads those verdicts back.
   A row is left behind only when somebody marked it `test`.

   ## It is a deny-list, and that is the whole safety argument

   The client onboards listings while this work happens — `properties` grew
   by one during the conversation that produced this script. An allow-list
   ("copy these 28") silently loses every listing created after the review.
   So anything the verdicts do not mention is COPIED, and reported as
   "created since the snapshot" so the count is visible rather than implied.

   `unsure` counts as keep. A row somebody could not decide about is carried
   over and reported; deciding it by default in the other direction would
   destroy the thing they were unsure about.

   ## Children follow their parent, but only on evidence

   A share type whose property was marked `test` is dropped with it. A share
   type pointing at a property that does not exist AT ALL is an orphan: it is
   reported and still copied, unless `--drop-orphans` says otherwise. The
   difference matters — "its parent was judged fake" is a decision somebody
   made, "its parent is missing" is a mystery, and mysteries are not resolved
   by deletion. A link field this script does not know about simply never
   matches, so an incomplete LINKS table over-copies. That is the safe
   direction to be wrong in.

   ## The source is opened read-only, by construction

   Nothing here writes to the source: no update, no delete, no index build
   against it — only `find()`, `indexes()` and `listCollections()`. That is
   the one property worth checking if you ever edit this file.
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');

const config = require('../src/config/env');
const guard = require('../src/infrastructure/database/guard');

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const DECISIONS = path.resolve(arg('decisions', path.join(__dirname, '../review-decisions.json')));
const TARGET_DB = arg('to');
const TARGET_URI = arg('target-uri', config.db.uri);
const CONFIRM = arg('confirm-database');
const DROP_ORPHANS = flag('drop-orphans');
const BACKUP_DIR = path.resolve(arg('backup-dir', path.join(__dirname, '../.deleted')));
const BATCH = 500;

/* Collections that exist only as a misspelling or a false start. Not
   created in the clean database; `visitrequests` is the live one. */
const DEAD = ['visit_requests', 'products'];

/* Which rows follow which parent, and on what field. Every entry here was
   read off a real document rather than inferred from a model, because the
   field that matters is the one the data actually uses: `propertyId` holds a
   STRING of the property's `_id`, while `property` holds the ObjectId. Both
   are compared as strings below so the distinction cannot bite. */
const LINKS = [
  { child: 'partner_share_types', parent: 'properties', field: 'propertyId', on: '_id' },
  { child: 'visitrequests', parent: 'properties', field: 'listingId', on: '_id' },
  { child: 'verificationrequests', parent: 'properties', field: 'property', on: '_id' },
  { child: 'permissionrequests', parent: 'properties', field: 'property', on: '_id' },
  { child: 'partner_property_edit_logs', parent: 'properties', field: 'property', on: '_id' },
  { child: 'stay_coupons', parent: 'properties', field: 'propertyId', on: '_id' },

  { child: 'food_products', parent: 'food_restaurants', field: 'restaurantId', on: 'restaurantId' },
  { child: 'food_orders', parent: 'food_restaurants', field: 'restaurantId', on: 'restaurantId' },
  { child: 'food_payouts', parent: 'food_restaurants', field: 'restaurantId', on: 'restaurantId' },

  { child: 'partner_notifications', parent: 'app_partners', field: 'partnerPhoneDigits', on: 'phoneDigits' },
  { child: 'partner_referrals', parent: 'app_partners', field: 'partnerPhoneDigits', on: 'phoneDigits' },
  { child: 'partner_payouts', parent: 'app_partners', field: 'partnerPhoneDigits', on: 'phoneDigits' },
  { child: 'partner_payment_methods', parent: 'app_partners', field: 'partnerPhoneDigits', on: 'phoneDigits' },
  { child: 'partner_staff', parent: 'app_partners', field: 'partnerPhoneDigits', on: 'phoneDigits' },
  { child: 'partner_complaints', parent: 'app_partners', field: 'partnerPhoneDigits', on: 'phoneDigits' },
  { child: 'partner_reviews', parent: 'app_partners', field: 'partnerPhoneDigits', on: 'phoneDigits' },
  { child: 'partner_customer_referral_codes', parent: 'app_partners', field: 'partnerPhoneDigits', on: 'phoneDigits' },

  { child: 'food_coupons', parent: 'app_customers', field: 'customerId', on: 'customerId' },
];

const s = (v) => (v === null || v === undefined ? '' : String(v));

const die = (msg) => { console.error(`\n  ${msg}\n`); process.exit(1); };

const main = async () => {
  if (!config.db.uri) die('MONGO_URI is missing from Backend/.env');
  if (!TARGET_DB) die('Name the target database:  npm run migrate:clean-db -- --to lampose_prod');

  if (!fs.existsSync(DECISIONS)) {
    die(`No verdicts at ${DECISIONS}\n  Export them from the review page first.`);
  }
  const decisions = JSON.parse(fs.readFileSync(DECISIONS, 'utf8'));
  const verdicts = decisions.verdicts || {};

  const sameCluster = TARGET_URI === config.db.uri;
  const sourceName = guard.resolveTarget({ uri: config.db.uri }).db;

  if (sameCluster && TARGET_DB === sourceName) die(`Refusing to migrate ${sourceName} onto itself.`);

  /* The clean database is ABOUT to become production, so the dev guard
     cannot judge it. What must never happen is writing over the database
     being read, or over any other protected one. */
  if (guard.protectedNames().includes(TARGET_DB.toLowerCase())
      && process.env.LAMPOSE_ALLOW_WRITES_TO !== TARGET_DB) {
    die(`"${TARGET_DB}" is on the protected list — pick a new, empty database name.`);
  }

  const APPLY = CONFIRM !== null;
  if (APPLY && CONFIRM !== TARGET_DB) {
    die(`--confirm-database "${CONFIRM}" does not match --to "${TARGET_DB}".`);
  }

  const source = await MongoClient.connect(config.db.uri);
  const target = sameCluster ? source : await MongoClient.connect(TARGET_URI);
  const from = source.db(sourceName || undefined);
  const to = target.db(TARGET_DB);

  console.log(`\n  ${from.databaseName}  →  ${TARGET_DB}${sameCluster ? '' : '  (different cluster)'}`);
  console.log(`  verdicts from ${path.basename(DECISIONS)}`
    + (decisions.snapshotGeneratedAt ? `, snapshot ${decisions.snapshotGeneratedAt.slice(0, 16).replace('T', ' ')}` : ''));
  console.log(APPLY ? '  MODE: copying for real\n' : '  MODE: report only — pass --confirm-database to copy\n');

  /* ── Load every collection once ─────────────────────────────────────── */
  const names = (await from.listCollections().toArray())
    .filter((c) => c.type !== 'view' && !c.name.startsWith('system.'))
    .map((c) => c.name)
    .sort();

  const docs = {};
  for (const name of names) docs[name] = await from.collection(name).find({}).toArray();

  /* ── Who is being left behind ───────────────────────────────────────── */
  const droppedIds = {};      // collection → Set of _id strings marked test
  const unsureCount = {};
  const newSinceSnapshot = {};

  for (const [collection, map] of Object.entries(verdicts)) {
    droppedIds[collection] = new Set(
      Object.keys(map).filter((id) => map[id] === 'test'),
    );
    unsureCount[collection] = Object.values(map).filter((v) => v === 'unsure').length;
    const known = new Set(Object.keys(map));
    newSinceSnapshot[collection] = (docs[collection] || [])
      .filter((d) => !known.has(String(d._id))).length;
  }

  /* The surviving parents, keyed the way each child references them. */
  const keptKeys = {};        // "parent:on" → Set of values kept
  const allKeys = {};         // "parent:on" → Set of every value present
  for (const { parent, on } of LINKS) {
    const k = `${parent}:${on}`;
    if (keptKeys[k]) continue;
    keptKeys[k] = new Set();
    allKeys[k] = new Set();
    for (const d of docs[parent] || []) {
      const value = s(d[on]);
      if (!value) continue;
      allKeys[k].add(value);
      if (!(droppedIds[parent] || new Set()).has(String(d._id))) keptKeys[k].add(value);
    }
  }

  const linksFor = (child) => LINKS.filter((l) => l.child === child);

  /** keep | drop | orphan, and why. */
  const judge = (collection, doc) => {
    const own = droppedIds[collection];
    if (own) {
      return own.has(String(doc._id))
        ? { verdict: 'drop', why: 'marked test in the review' }
        : { verdict: 'keep' };
    }
    const links = linksFor(collection);
    if (!links.length) return { verdict: 'keep' };

    let sawOrphan = null;
    for (const l of links) {
      const value = s(doc[l.field]);
      if (!value) continue;
      const k = `${l.parent}:${l.on}`;
      if (keptKeys[k].has(value)) continue;
      if (allKeys[k].has(value)) {
        return { verdict: 'drop', why: `its ${l.parent} row was marked test` };
      }
      sawOrphan = `${l.field} "${value}" matches no ${l.parent}`;
    }
    if (sawOrphan) return { verdict: 'orphan', why: sawOrphan };
    return { verdict: 'keep' };
  };

  /* ── Plan ───────────────────────────────────────────────────────────── */
  const plan = [];
  const leftBehind = {};

  for (const name of names) {
    if (DEAD.includes(name)) {
      plan.push({ name, total: docs[name].length, keep: 0, drop: 0, orphan: 0, note: 'not carried over — dead collection' });
      continue;
    }
    const keep = [];
    const drop = [];
    const orphan = [];
    for (const d of docs[name]) {
      const { verdict } = judge(name, d);
      if (verdict === 'drop') drop.push(d);
      else if (verdict === 'orphan') orphan.push(d);
      else keep.push(d);
    }
    const carried = DROP_ORPHANS ? keep : keep.concat(orphan);
    const held = DROP_ORPHANS ? drop.concat(orphan) : drop;
    if (held.length) leftBehind[name] = held;

    const notes = [];
    if (droppedIds[name]) notes.push('reviewed');
    else if (linksFor(name).length) notes.push(`follows ${[...new Set(linksFor(name).map((l) => l.parent))].join(' + ')}`);
    else notes.push('carried whole');
    if (unsureCount[name]) notes.push(`${unsureCount[name]} unsure → kept`);
    if (newSinceSnapshot[name]) notes.push(`${newSinceSnapshot[name]} new since snapshot → kept`);

    plan.push({
      name,
      total: docs[name].length,
      keep: carried.length,
      drop: drop.length,
      orphan: orphan.length,
      carried,
      note: notes.join(', '),
    });
  }

  /* ── Report ─────────────────────────────────────────────────────────── */
  const pad = Math.max(...plan.map((p) => p.name.length));
  console.log(`  ${'collection'.padEnd(pad)}  ${'total'.padStart(6)} ${'move'.padStart(6)} ${'drop'.padStart(6)} ${'orphan'.padStart(7)}   note`);
  console.log(`  ${'─'.repeat(pad + 36)}`);
  let totalKeep = 0;
  let totalDrop = 0;
  let totalOrphan = 0;
  for (const p of plan) {
    totalKeep += p.keep; totalDrop += p.drop; totalOrphan += p.orphan;
    console.log(`  ${p.name.padEnd(pad)}  ${String(p.total).padStart(6)} ${String(p.keep).padStart(6)} `
      + `${String(p.drop || '').padStart(6)} ${String(p.orphan || '').padStart(7)}   ${p.note}`);
  }
  console.log(`\n  ${totalKeep} documents move, ${totalDrop} left behind by a verdict, `
    + `${totalOrphan} orphaned (${DROP_ORPHANS ? 'also left behind' : 'carried — pass --drop-orphans to leave them'}).`);

  if (!APPLY) {
    console.log(`\n  Nothing was written. To copy:\n`
      + `      npm run migrate:clean-db -- --to ${TARGET_DB} --confirm-database ${TARGET_DB}\n`);
    await source.close();
    if (!sameCluster) await target.close();
    return;
  }

  /* ── Copy ───────────────────────────────────────────────────────────── */
  const existing = (await to.listCollections().toArray()).filter((c) => !c.name.startsWith('system.'));
  if (existing.length) {
    die(`"${TARGET_DB}" already holds ${existing.length} collection(s).\n`
      + '  Migrate into an empty database so a half-finished run is never mistaken for a whole one.');
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `not-migrated-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({
    migratedAt: new Date().toISOString(),
    from: from.databaseName,
    to: TARGET_DB,
    decisions: DECISIONS,
    collections: leftBehind,
  }, null, 2));
  console.log(`\n  Wrote everything left behind to ${backupFile}\n`);

  for (const p of plan) {
    if (DEAD.includes(p.name)) { console.log(`  ${p.name.padEnd(pad)}  skipped`); continue; }

    if (p.carried.length) {
      for (let i = 0; i < p.carried.length; i += BATCH) {
        await to.collection(p.name).insertMany(p.carried.slice(i, i + BATCH), { ordered: false });
      }
    } else {
      /* An empty collection is still a fact about the schema — and its
         indexes, including the TTL ones, belong in the clean database. */
      await to.createCollection(p.name).catch(() => {});
    }

    let indexNote = '';
    try {
      const indexes = (await from.collection(p.name).indexes()).filter((i) => i.name !== '_id_');
      for (const index of indexes) {
        const { key, name: indexName, v, ns, ...options } = index;
        try {
          await to.collection(p.name).createIndex(key, { name: indexName, ...options });
        } catch (error) {
          indexNote += `  ⚠ index ${indexName}: ${error.message.split('\n')[0]}`;
        }
      }
      if (indexes.length) indexNote = `${indexes.length} index(es)${indexNote}`;
    } catch (error) {
      indexNote = `⚠ indexes: ${error.message}`;
    }

    console.log(`  ${p.name.padEnd(pad)}  ${String(p.carried.length).padStart(6)} copied   ${indexNote}`);
  }

  console.log(`\n  ✅ ${totalKeep} documents in ${TARGET_DB}.`);
  console.log('\n  Next:');
  console.log(`      DB_NAME=${TARGET_DB} npm run inspect:db        check the counts`);
  console.log(`      add ${TARGET_DB} to PROTECTED_DATABASES everywhere`);
  console.log('      point /srv/lampose-api/.env at it and restart\n');

  await source.close();
  if (!sameCluster) await target.close();
};

main().catch(async (error) => {
  console.error('\nMigration failed:', error.message, '\n');
  process.exit(1);
});
