/* ══════════════════════════════════════════════════════════════════════════
   Exports the onboarding panel's `properties` collection into the shape the
   Explore page reads, and writes it to frontend/src/data/listings.js.

     node scripts/export-listings.mjs              every property
     node scripts/export-listings.mjs --clean      skips obvious test rows

   Only fields that actually exist in the collection are carried across. The
   page had been showing ratings, review counts and a "verified" badge that
   the database has no column for, so those are gone rather than invented.

   Re-run this whenever the panel's data changes; it is a build-time snapshot,
   not a live feed.
   ══════════════════════════════════════════════════════════════════════════ */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../frontend/src/data/listings.js');
const CLEAN = process.argv.includes('--clean');

/* Cities we can name with confidence. `place` is free text from the panel and
   often has no comma, so a known name anywhere in the string beats splitting
   on punctuation and hoping. */
const KNOWN_CITIES = [
  'Visakhapatnam', 'Vizag', 'Vijayawada', 'Amaravati', 'Guntur', 'Tirupati',
  'Kakinada', 'Nellore', 'Kurnool', 'Hyderabad', 'Bangalore', 'Bengaluru',
  'Chennai', 'Mumbai', 'Pune', 'Delhi',
];
const CITY_ALIAS = { Vizag: 'Visakhapatnam', Bengaluru: 'Bangalore' };

const cityOf = place => {
  const hit = KNOWN_CITIES.find(c => new RegExp(`\\b${c}\\b`, 'i').test(place));
  if (hit) return CITY_ALIAS[hit] || hit;
  const parts = String(place).split(',').map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : String(place).trim();
};

const localityOf = (place, city) => {
  const stripped = String(place)
    .replace(new RegExp(`,?\\s*\\b${city}\\b`, 'i'), '')
    .replace(/,\s*$/, '')
    .trim();
  return stripped || String(place).trim();
};

/* ── Quality screen ──────────────────────────────────────────────────────
   Three independent signals, each reported so a drop can be argued with.
   None of them guesses at intent: a row is only suspect on hard evidence. */
const digitsOf = s => String(s || '').replace(/\D/g, '');
const badMobile = s => {
  const d = digitsOf(s);
  const n = d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
  return !(n.length === 10 && /^[6-9]/.test(n));
};
const TEST_WORDS = /\b(test|testing|sample|demo|dummy)\b/i;

function suspicions(doc) {
  const why = [];
  if (TEST_WORDS.test(doc.name) || TEST_WORDS.test(doc.place)) why.push('test/sample in name');
  if (badMobile(doc.ownerMobile)) why.push(`unusable mobile "${doc.ownerMobile}"`);
  if (doc.rent > 60000) why.push(`rent ${doc.rent} out of band`);
  if (doc.rent < 200) why.push(`rent ${doc.rent} out of band`);
  return why;
}

/* ── Mapping ─────────────────────────────────────────────────────────────
   Category drives the card's accent and glyph, so it is slugged here rather
   than in the component. */
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* Anything the panel adds later falls back to the room glyph rather than
   breaking the tab row. */
const CATEGORY_ICONS = {
  PG: 'stay',
  Hostel: 'users',
  Dormitory: 'grid',
  'Bachelor Room': 'stay',
};

/* Tab order, chosen rather than alphabetical: the filter row should lead with
   what people search for most, not with whatever starts with a B. A category
   the panel adds later is not in this list, so it sorts to the end by name
   instead of silently jumping to the front. */
const CATEGORY_ORDER = ['Hostel', 'PG', 'Bachelor Room', 'Dormitory'];

const byCategoryOrder = (a, b) => {
  const ia = CATEGORY_ORDER.indexOf(a);
  const ib = CATEGORY_ORDER.indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b);
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
};

/* Absolute URLs only. Some rows hold a path like "/lampose-logo-splash.png",
   which resolves against the onboarding panel's own origin — on this site it
   would be a 404, so it is dropped and the card falls back to its gradient. */
const imagesOf = (doc, drops) => {
  const all = [doc.imageUrl, ...(doc.images || [])].filter(Boolean);
  const usable = all.filter(u => /^https?:\/\//i.test(u));
  all.filter(u => !usable.includes(u)).forEach(u => drops.push(`${doc.name}: ${u}`));
  return [...new Set(usable)];
};

/* Dormitories and pods are quoted nightly. The panel says so two different
   ways depending on when the row was created, so both are honoured. */
const isDaily = doc => doc.categoryDetails?.rateType === 'Daily Rate'
  || (doc.dailyPrice > 0 && !(doc.monthlyPrice > 0));

const imageDrops = [];

const map = doc => {
  const city = cityOf(doc.place);
  return {
    id: String(doc._id),
    name: doc.name,
    category: doc.category,
    categorySlug: slug(doc.category),
    place: doc.place,
    city,
    locality: localityOf(doc.place, city),
    address: doc.address || null,
    rent: doc.rent,
    pricePeriod: isDaily(doc) ? '/day' : '/mo',
    deposit: doc.deposit ?? null,
    monthlyPrice: doc.monthlyPrice || null,
    dailyPrice: doc.dailyPrice || null,
    stayType: doc.stayType || null,
    longStayDuration: doc.longStayDuration || null,
    shortStayDuration: doc.shortStayDuration || null,
    ownerName: doc.ownerName,
    ownerMobile: doc.ownerMobile,
    amenities: doc.amenities || [],
    images: imagesOf(doc, imageDrops),
    details: doc.categoryDetails || null,
    listedAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
};

/* ── Run ─────────────────────────────────────────────────────────────── */
await mongoose.connect(process.env.MONGO_URI);
const docs = await mongoose.connection.db
  .collection('properties').find({}).sort({ createdAt: -1 }).toArray();
await mongoose.disconnect();

const flagged = docs.map(d => ({ doc: d, why: suspicions(d) }));
const suspect = flagged.filter(f => f.why.length);

if (suspect.length) {
  console.log(`\n${suspect.length} of ${docs.length} rows look like test data:`);
  for (const { doc, why } of suspect) {
    console.log(`  ${CLEAN ? 'DROP' : 'keep'}  ${String(doc.name).padEnd(24)} ${why.join('; ')}`);
  }
  console.log(CLEAN
    ? '\n  Dropped, because --clean was passed.'
    : '\n  All kept. Pass --clean to leave these out of the site.');
}

const kept = (CLEAN ? flagged.filter(f => !f.why.length) : flagged).map(f => map(f.doc));

if (imageDrops.length) {
  console.log(`\n${imageDrops.length} image path(s) skipped — not absolute URLs:`);
  imageDrops.forEach(d => console.log(`  ${d}`));
}

const withImages = kept.filter(l => l.images.length).length;
console.log(`\n${kept.length} listings exported — ${withImages} with at least one image,`
  + ` ${kept.filter(l => l.images.length > 1).length} with a gallery,`
  + ` ${kept.length - withImages} falling back to the category gradient.`);

/* Derived lists, so a filter can never offer a city or category that would
   land the visitor on an empty grid. */
const uniq = xs => [...new Set(xs)];
const cities = uniq(kept.map(l => l.city)).sort();
const categories = uniq(kept.map(l => l.category)).sort(byCategoryOrder);
const priceMax = Math.ceil(Math.max(...kept.map(l => l.rent)) / 500) * 500;

const json = v => JSON.stringify(v, null, 2).replace(/\n/g, '\n');

const file = `/* ══════════════════════════════════════════════════════════════════════════
   GENERATED FILE — do not edit by hand.

   Written by backend/scripts/export-listings.mjs from the \`properties\`
   collection of the onboarding panel's database. To refresh:

     cd backend && node scripts/export-listings.mjs${CLEAN ? ' --clean' : ''}

   Every field below exists in the collection. The page deliberately shows no
   rating, review count or verification badge, because the panel does not
   collect them.
   ══════════════════════════════════════════════════════════════════════════ */

export const LISTINGS = ${json(kept)};

/* Derived from the listings above, never hand-maintained. */
export const CITIES_LIST = ['All Cities', ${cities.map(c => JSON.stringify(c)).join(', ')}];

export const PRICE_MAX = ${priceMax};

/* Icon names must exist in components/Icon.jsx; an unknown name falls back to
   the grid glyph. The slug is what the stylesheet keys its accent off. */
export const CATEGORIES_LIST = [
  { id: 'all', label: 'All listings', icon: 'grid' },
${categories.map(c => `  { id: ${JSON.stringify(c)}, slug: ${JSON.stringify(slug(c))}, label: ${JSON.stringify(c)}, icon: ${JSON.stringify(CATEGORY_ICONS[c] || 'stay')} },`).join('\n')}
];

export const SORT_OPTIONS = [
  { id: 'recent', label: 'Recently listed' },
  { id: 'price-asc', label: 'Rent: low to high' },
  { id: 'price-desc', label: 'Rent: high to low' },
];
`;

fs.writeFileSync(OUT, file);
console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
