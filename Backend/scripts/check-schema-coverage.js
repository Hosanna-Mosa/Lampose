/* ══════════════════════════════════════════════════════════════════════════
   Does the data carry the fields the models declare?

     npm run check:schema                     the kept rows, per review-decisions.json
     npm run check:schema -- --all            every row, verdicts ignored
     npm run check:schema -- --collection properties

   ## Why a field can be missing

   Fields were added to the schemas over months while documents were already
   in the database. Mongoose writes a default when a document is CREATED, not
   retroactively — so a listing onboarded in August has exactly the fields
   August's model declared, and nothing has filled in the rest since.

   ## Three tiers, because they are not equally bad

     required    a save() on this document would fail validation. Anything
                 that loads it, edits one field and saves — the admin console,
                 the partner app — breaks on a document it did not corrupt.
     no default  reads come back `undefined`. The API answers null, and the
                 screen shows an empty space, silently.
     defaulted   mongoose fills it in on hydration. Cosmetic: the document on
                 disk is thin, but nothing reading it through a model notices.

   Only the first two are worth a migration. The third is noise, and is
   counted rather than listed.

   ## Read-only

   `find()` and nothing else, and `autoIndex` is off before the connection
   opens — otherwise merely requiring 25 models and connecting would start
   building indexes, including the TTL ones, on whatever database is set.
   ══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const config = require('../src/config/env');
const guard = require('../src/infrastructure/database/guard');

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const ALL = process.argv.includes('--all');
const ONLY = arg('collection');
const DECISIONS = path.resolve(arg('decisions', path.join(__dirname, '../review-decisions.json')));

/** Every *.model.js, required so mongoose registers it. */
const loadModels = () => {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.model\.js$/.test(entry.name)) { require(p); found.push(p); }
    }
  };
  walk(path.join(__dirname, '../src/modules'));
  return found;
};

const get = (doc, dotted) => dotted.split('.')
  .reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), doc);

const isEmpty = (v) => v === '' || v === null
  || (Array.isArray(v) && v.length === 0)
  || (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && Object.keys(v).length === 0);

const main = async () => {
  if (!config.db.uri) { console.error('MONGO_URI is missing from Backend/.env'); process.exit(1); }

  loadModels();

  /* Before connect, not after. */
  mongoose.set('autoIndex', false);
  mongoose.set('strictQuery', false);
  await mongoose.connect(config.db.uri, { ...config.db.options, dbName: config.db.dbName });

  const target = guard.resolveTarget({ uri: config.db.uri });
  console.log(`\n  reading ${target.db} @ ${target.host}  (${guard.classify(target)})\n`);

  let dropped = {};
  if (!ALL && fs.existsSync(DECISIONS)) {
    const d = JSON.parse(fs.readFileSync(DECISIONS, 'utf8')).verdicts || {};
    for (const [k, map] of Object.entries(d)) {
      dropped[k] = new Set(Object.keys(map).filter((id) => map[id] === 'test'));
    }
    console.log(`  verdicts from ${path.basename(DECISIONS)} — rows marked test are excluded\n`);
  } else {
    console.log('  every row (no verdicts applied)\n');
  }

  const models = mongoose.modelNames()
    .map((n) => mongoose.model(n))
    .filter((m) => !ONLY || m.collection.name === ONLY)
    .sort((a, b) => a.collection.name.localeCompare(b.collection.name));

  const summary = [];

  for (const Model of models) {
    const name = Model.collection.name;
    const raw = await mongoose.connection.db.collection(name).find({}).toArray();
    const docs = raw.filter((d) => !(dropped[name] || new Set()).has(String(d._id)));
    if (!docs.length) continue;

    const paths = Object.entries(Model.schema.paths)
      .filter(([p]) => p !== '_id' && p !== '__v');

    const required = [];
    const noDefault = [];
    let defaulted = 0;

    for (const [p, type] of paths) {
      const missing = docs.filter((d) => get(d, p) === undefined).length;
      if (!missing) continue;
      const hasDefault = type.defaultValue !== undefined || type.options.default !== undefined;
      const isRequired = Boolean(type.isRequired || type.options.required);
      if (isRequired) required.push([p, missing]);
      else if (!hasDefault) noDefault.push([p, missing]);
      else defaulted += 1;
    }

    /* Present but carrying nothing — a different problem from absent, and
       invisible to a "does the key exist" check. */
    const blank = [];
    for (const [p, type] of paths) {
      if (type.instance === 'Boolean' || type.instance === 'Number') continue;
      const n = docs.filter((d) => { const v = get(d, p); return v !== undefined && isEmpty(v); }).length;
      if (n === docs.length && n > 0) blank.push([p, n]);
    }

    /* In the data, unknown to the schema. Usually a renamed or retired
       field; mongoose ignores them on read, so they are inert but they are
       also the only trace of what used to be there. */
    const known = new Set(paths.map(([p]) => p.split('.')[0]));
    const extra = new Map();
    for (const d of docs) {
      for (const k of Object.keys(d)) {
        if (k === '_id' || k === '__v' || known.has(k)) continue;
        extra.set(k, (extra.get(k) || 0) + 1);
      }
    }

    if (!required.length && !noDefault.length && !blank.length && !extra.size) {
      summary.push([name, docs.length, 'complete']);
      continue;
    }

    console.log(`══ ${name} — ${docs.length} document${docs.length === 1 ? '' : 's'} kept`);
    const line = (label, pairs) => {
      if (!pairs.length) return;
      console.log(`   ${label}`);
      pairs.sort((a, b) => b[1] - a[1]).forEach(([p, n]) => {
        console.log(`     ${p.padEnd(34)} ${String(n).padStart(4)}/${docs.length}`);
      });
    };
    line('REQUIRED by the schema, absent — a save() would fail:', required);
    line('no default, absent — reads come back undefined:', noDefault);
    line('present on every document but empty:', blank);
    if (extra.size) line('in the data, not in the schema:', [...extra]);
    if (defaulted) console.log(`   (${defaulted} more absent but defaulted — mongoose fills these in on read)`);
    console.log('');

    summary.push([name, docs.length,
      required.length ? `${required.length} REQUIRED missing` : `${noDefault.length} gap(s)`]);
  }

  console.log('── summary ' + '─'.repeat(52));
  summary.forEach(([n, c, s2]) => console.log(`  ${n.padEnd(34)} ${String(c).padStart(5)} docs   ${s2}`));
  console.log('');

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('\nSchema check failed:', error.message, '\n');
  process.exit(1);
});
