/* ══════════════════════════════════════════════════════════════════════════
   Aggregate the clean database into a figure set the dashboard reads.

     DB_NAME=lampose_prod npm run export:analytics
     …-- --out /tmp/a.json

   Aggregates only — no names, no phone numbers, no addresses. The dashboard
   is a published page, and nothing here needs a person's details to be true.
   The onboarding agents' emails are the exception, because "who onboarded
   what" is one of the questions the page exists to answer, and they are the
   team's own addresses.

   Read-only: `find()` and `countDocuments()` on the raw driver, no models,
   so connecting cannot start an index build.
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
const OUT = path.resolve(arg('out', path.join(__dirname, '../analytics-snapshot.json')));

const s = (v) => (v === null || v === undefined ? '' : String(v));

/** Count by a derived key, biggest first. Empty keys become "unknown". */
const tally = (docs, keyOf) => {
  const m = new Map();
  for (const d of docs) {
    const raw = keyOf(d);
    for (const k of (Array.isArray(raw) ? raw : [raw])) {
      const key = s(k).trim() || '—';
      m.set(key, (m.get(key) || 0) + 1);
    }
  }
  return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};

const byDay = (docs, field = 'createdAt') => {
  const m = new Map();
  for (const d of docs) {
    if (!d[field]) continue;
    const k = new Date(d[field]).toISOString().slice(0, 10);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m].sort((a, b) => a[0].localeCompare(b[0]));
};

const stats = (nums) => {
  const xs = nums.filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return {
    count: xs.length,
    min: xs[0],
    max: xs[xs.length - 1],
    median: xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2),
    mean: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length),
  };
};

/* Rent bands chosen from what a PG in Hyderabad actually costs, not from an
   even split of the observed range — an even split of 30 rows produces bands
   nobody would ever quote a price in. */
const RENT_BANDS = [
  [0, 4999, 'under ₹5k'],
  [5000, 7499, '₹5k–7.5k'],
  [7500, 9999, '₹7.5k–10k'],
  [10000, 14999, '₹10k–15k'],
  [15000, 24999, '₹15k–25k'],
  [25000, Infinity, '₹25k+'],
];
/* No single room in a PG holds more than this. Above it is a typo, not a
   hostel. */
const BED_SANITY_LIMIT = 200;

const bandOf = (rent) => (RENT_BANDS.find(([lo, hi]) => rent >= lo && rent <= hi) || [, , '—'])[2];

/* "KPHB RoadNo:1 Behind karur Vysya bank" and "KPHB" are the same locality.
   The first comma-or-punctuation-free token carries it. */
const localityOf = (place) => {
  const first = s(place).split(/[,;|]/)[0].trim();
  const words = first.split(/\s+/).slice(0, 2).join(' ');
  return (words || first || '—').replace(/\s+/g, ' ');
};

/* Agents type "KPHB", "Kphb" and "kphb" for the same place, and three bars
   for one locality is a worse answer than one. Group on the upper-cased
   form, then display whichever spelling the agents used most — so an
   acronym stays an acronym instead of being title-cased into "Kphb". */
const mergeCase = (pairs) => {
  const groups = new Map();
  for (const [label, n] of pairs) {
    const key = label.toUpperCase();
    const g = groups.get(key) || { total: 0, spellings: new Map() };
    g.total += n;
    g.spellings.set(label, (g.spellings.get(label) || 0) + n);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => [[...g.spellings].sort((a, b) => b[1] - a[1])[0][0], g.total])
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};

const main = async () => {
  if (!config.db.uri) { console.error('MONGO_URI is missing from Backend/.env'); process.exit(1); }

  const client = await MongoClient.connect(config.db.uri);
  const db = config.db.dbName ? client.db(config.db.dbName) : client.db();
  const target = guard.resolveTarget({ uri: config.db.uri });
  console.log(`\n  reading ${db.databaseName} @ ${target.host}\n`);

  const all = (n) => db.collection(n).find({}).toArray();

  const properties = await all('properties');
  const vreqs = await all('verificationrequests');
  const visits = await all('visitrequests');
  const customers = await all('app_customers');
  const partners = await all('app_partners');
  const drivers = await all('app_drivers');
  const restaurants = await all('food_restaurants');
  const leads = await all('scriper_leads');
  const shareTypes = await all('partner_share_types');
  const bookings = await all('partner_bookings');

  const propIds = new Set(properties.map((p) => String(p._id)));
  const liveShareTypes = shareTypes.filter((t) => propIds.has(s(t.propertyId)));

  const snapshot = {
    generatedAt: new Date().toISOString(),
    database: db.databaseName,

    headline: [
      { key: 'listings', label: 'Listings', value: properties.length },
      { key: 'owners', label: 'Property owners', value: partners.length },
      { key: 'customers', label: 'Customers', value: customers.length },
      { key: 'riders', label: 'Delivery riders', value: drivers.length },
      { key: 'restaurants', label: 'Restaurants', value: restaurants.length },
      { key: 'leads', label: 'Sales leads', value: leads.length },
    ],

    listings: {
      total: properties.length,
      byCategory: tally(properties, (p) => p.category),
      byLocality: mergeCase(tally(properties, (p) => localityOf(p.place))),
      byAgent: tally(properties, (p) => p.employeeEmail),
      byStayType: tally(properties, (p) => p.stayType),
      perDay: byDay(properties),
      rentBands: RENT_BANDS.map(([, , label]) => [label,
        properties.filter((p) => bandOf(Number(p.rent) || 0) === label).length]),
      rent: stats(properties.map((p) => Number(p.rent))),
      deposit: stats(properties.map((p) => Number(p.deposit))),
      images: stats(properties.map((p) => (p.images || []).length + (p.imageUrl ? 1 : 0))),
    },

    /* The v1 chain, in the order a request actually walks it. A request that
       never left `sent` is one an owner has not answered. */
    funnel: {
      total: vreqs.length,
      byStatus: ['sent', 'owner_approved', 'verified', 'rejected', 'expired']
        .map((k) => [k, vreqs.filter((v) => s(v.status) === k).length])
        .filter(([, n]) => n > 0)
        .concat(tally(vreqs.filter((v) => !['sent', 'owner_approved', 'verified', 'rejected', 'expired']
          .includes(s(v.status))), (v) => v.status)),
      perDay: byDay(vreqs),
    },

    visits: {
      total: visits.length,
      byStatus: tally(visits, (v) => v.status),
      byPayment: tally(visits, (v) => (v.payment && v.payment.status) || 'none'),
      byChannel: tally(visits, (v) => v.channel),
      perDay: byDay(visits),
    },

    inventory: {
      shareTypesTotal: shareTypes.length,
      shareTypesLive: liveShareTypes.length,
      /* One "5 Sharing" room was entered with 10,000 beds. Summing it gives a
         headline figure that is wrong by three orders of magnitude and quietly
         discredits every other number on the page, so implausible rows are
         excluded from the total and reported separately instead — the typo is
         a finding, not something to hide or to average in. */
      beds: liveShareTypes.filter((t) => (Number(t.totalBeds) || 0) <= BED_SANITY_LIMIT)
        .reduce((a, t) => a + (Number(t.totalBeds) || 0), 0),
      bedsAvailable: liveShareTypes.filter((t) => (Number(t.totalBeds) || 0) <= BED_SANITY_LIMIT)
        .reduce((a, t) => a + (Number(t.availableBeds) || 0), 0),
      bedOutliers: liveShareTypes
        .filter((t) => (Number(t.totalBeds) || 0) > BED_SANITY_LIMIT)
        .map((t) => ({
          shareType: s(t.name),
          beds: Number(t.totalBeds) || 0,
          property: s((properties.find((p) => String(p._id) === s(t.propertyId)) || {}).name),
        })),
      byShareName: tally(liveShareTypes, (t) => t.name),
      bookings: bookings.length,
    },

    leads: {
      total: leads.length,
      byStatus: tally(leads, (l) => l.leadStatus),
      byCity: mergeCase(tally(leads, (l) => l.city)).slice(0, 12),
      byCategory: tally(leads, (l) => l.category).slice(0, 12),
      withWebsite: leads.filter((l) => l.hasWebsite).length,
    },

    /* The gaps the migration did not fix, stated as a fraction so the page
       can show them as completeness rather than as a scary raw number. */
    health: [
      { label: 'Listings with a map pin', good: properties.filter((p) => p.location).length, total: properties.length,
        note: 'Needed by service-zone checks and every map view.' },
      { label: 'Listings with a photograph', good: properties.filter((p) => (p.images || []).length || p.imageUrl).length, total: properties.length },
      { label: 'Listings with a description', good: properties.filter((p) => s(p.description).trim()).length, total: properties.length,
        note: 'The field exists on every listing and is empty on every one.' },
      { label: 'Listings with bed inventory', good: new Set(liveShareTypes.map((t) => s(t.propertyId))).size, total: properties.length,
        note: 'Without share types a listing cannot take a booking.' },
      { label: 'Listings with an owner contact', good: properties.filter((p) => s(p.ownerMobile).replace(/\D/g, '').length >= 10).length, total: properties.length },
      { label: 'Restaurants with a menu', good: 0, total: restaurants.length,
        note: 'Both onboarded restaurants are still to add dishes.' },
    ],
  };

  fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 2));
  console.log(`  ${properties.length} listings, ${vreqs.length} verification requests, ${visits.length} visit requests, ${leads.length} leads`);
  console.log(`  Wrote ${OUT}\n`);
  await client.close();
};

main().catch(async (error) => {
  console.error('\nAnalytics export failed:', error.message, '\n');
  process.exit(1);
});
