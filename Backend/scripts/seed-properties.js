/* ══════════════════════════════════════════════════════════════════════════
   Fills the areas already in the catalogue with enough properties to browse.

     node scripts/seed-properties.js --dry-run     show what it would write
     node scripts/seed-properties.js               write it
     node scripts/seed-properties.js --clean       remove every seeded row

   ## Read this before running it

   `properties` is not a development table. The same collection is read by
   lampose.com's public Explore page, by the onboarding console and by the
   leads panel, so anything written here is publicly visible on the website
   within one page load. That is the whole reason every row is tagged, the
   tag is the only thing `--clean` matches, and nothing here is ever written
   without the tag.

   ## The owner's number is the dangerous field

   A visit request reads `ownerMobile` off the property and sends a real
   WhatsApp message to it. A seeded property carrying a plausible-looking
   number would, the first time a tester pressed "Request a visit", message a
   stranger under Lampose's name. So the number is set once, from
   SEED_OWNER_MOBILE, and there is no default that looks real — the script
   refuses to run without one being chosen deliberately.

   ## Deterministic

   The generator is seeded from the property's own index, so a re-run
   produces byte-identical rows. That matters for a dataset people are
   comparing screenshots against: `Math.random()` would mean every re-seed
   silently changed every price.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const config = require('../src/config/env');
const Property = require('../src/modules/properties/property.model');
const { cityOf, localityOf } = require('../src/modules/listings/listing.formatter');

/* The tag. Every seeded row carries it, `--clean` deletes exactly what
   matches it, and nothing else in the collection uses the field this way. */
const SEED_TAG = 'seed@lampose.local';

const DRY_RUN = process.argv.includes('--dry-run');
const CLEAN = process.argv.includes('--clean');

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
};

const PER_AREA_MIN = Number(arg('min')) || 10;
const PER_AREA_MAX = Number(arg('max')) || 20;

/* No default, on purpose. See the header. */
const OWNER_MOBILE = arg('owner-mobile') || process.env.SEED_OWNER_MOBILE || '';

/* ── A deterministic generator ───────────────────────────────────────────
   mulberry32. Small, fast, and — the only property that matters here —
   identical on every run for the same seed. */
const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = (r, list) => list[Math.floor(r() * list.length)];
const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
/** Rounds to the nearest 100, the way a rent is actually quoted. */
const money = (value) => Math.round(value / 100) * 100;

/* ── Naming ─────────────────────────────────────────────────────────────── */

const PG_PREFIX = ['Sai Krishna', 'Sri Balaji', 'Anand', 'Lakshmi', 'Bhavana', 'Kalyan',
  'Sree Nilaya', 'Vasavi', 'Harsha', 'Ganesh', 'Trinity', 'Nest', 'Urban Roots',
  'Green Leaf', 'Comfort Stay', 'Sunrise', 'Vaishnavi', 'Manasa', 'Aditya', 'Prasad'];

const HOSTEL_PREFIX = ['Lakshmi', 'Sri Vidya', 'Balaji', 'Chaitanya', 'Anjali', 'Mahalakshmi',
  'Vidya', 'Sneha', 'Divya', 'Rakshita', 'Sharada', 'Padmavathi'];

const DORM_PREFIX = ['Backpackers', 'City Nest', 'Sri Sai', 'Zostel Style', 'Traveller’s',
  'Metro', 'Downtown', 'Bunk'];

const BACHELOR_PREFIX = ['Urban Nest', 'Green Park', 'Silver Oak', 'Sunshine', 'Lake View',
  'Palm Grove', 'Whitefield', 'Crest', 'Meadows', 'Maple'];

const OWNER_NAMES = ['Ramesh', 'Padma', 'Lakshmi', 'Suresh', 'Nikhil', 'Reshma', 'Venkat',
  'Anitha', 'Kiran', 'Sridhar', 'Bhavani', 'Mohan', 'Sunitha', 'Raju', 'Deepa'];

/* Unsplash, the same source the rows already in the collection use. Fixed
   ids rather than a random endpoint, so a re-seed does not reshuffle every
   photograph. */
const PHOTOS = [
  'photo-1522708323590-d24dbb6b0267', 'photo-1502672260266-1c1ef2d93688',
  'photo-1560448204-e02f11c3d0e2', 'photo-1505693416388-ac5ce068fe85',
  'photo-1540518614846-7eded433c457', 'photo-1522771739844-6a9f6d5f14af',
  'photo-1493809842364-78817add7ffb', 'photo-1586023492125-27b2c045efd7',
  'photo-1555854877-bab0e564b8d5', 'photo-1574362848149-11496d93a7c7',
  'photo-1484154218962-a197022b5858', 'photo-1600585154340-be6161a56a0c',
];
const photoUrl = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

const AMENITIES = {
  PG: ['High-Speed Wi-Fi', 'Air Conditioning', 'Daily Housekeeping', 'Home-Cooked Food (3 Times)',
    'Washing Machine & Laundry', 'CCTV & 24/7 Security', 'Power Backup', 'RO Water',
    'Attached Bathroom', 'Study Table', 'Two-Wheeler Parking', 'Hot Water Geyser'],
  Hostel: ['Wi-Fi', 'Mess Canteen', 'Warden on Site', 'CCTV & 24/7 Security', 'RO Water',
    'Study Room', 'Daily Housekeeping', 'Hot Water Geyser', 'Power Backup', 'Lift'],
  Dormitory: ['Wi-Fi', 'Lockers', 'Hot Water Geyser', 'CCTV & 24/7 Security', 'RO Water',
    'Common TV Lounge', 'Daily Housekeeping'],
  'Bachelor Room': ['Air Conditioning', 'Two-Wheeler Parking', 'Lift', 'Power Backup',
    'Water Supply 24x7', 'Wardrobe', 'Modular Kitchen', 'Wi-Fi'],
};

/* ── The areas ───────────────────────────────────────────────────────────
   Read from the collection at run time rather than hardcoded, so this seeds
   the areas that actually exist. `band` is the local monthly rate the
   generator varies around; without it a Koramangala PG and an Anakapalli one
   would cost the same, and the median column on the entry screen would say
   nothing. */
const BANDS = [
  { match: /koramangala/i, band: 11000 },
  { match: /hsr layout/i, band: 13000 },
  { match: /indiranagar/i, band: 14000 },
  { match: /btm layout/i, band: 12000 },
  { match: /whitefield|marathahalli/i, band: 10000 },
  { match: /anakapalli|rajahmundry|rajahumdry/i, band: 6000 },
];
const bandFor = (area) => (BANDS.find((b) => b.match.test(area))?.band ?? 9000);

/* ── One property ────────────────────────────────────────────────────────── */

const MEAL_TIMINGS = {
  Breakfast: '7:30 AM - 9:30 AM',
  Lunch: '12:30 PM - 2:30 PM',
  Dinner: '8:00 PM - 10:00 PM',
};

/* `variant` is a fixture SHAPE, not a stored category — 'PG' and 'Hostel'
   are both written as PG_HOSTEL below, with the different categoryDetails
   the two forms produce. See MIX. */
function buildProperty({ area, city, variant, index }) {
  const r = rng(
    /* Seeded from the row's identity, so this exact property regenerates
       identically no matter what order the areas are processed in. */
    [...`${area}|${variant}|${index}`].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261),
  );

  const band = bandFor(area);
  const place = city && city !== area ? `${area}, ${city}` : area;
  const ownerName = pick(r, OWNER_NAMES);

  const images = [
    photoUrl(PHOTOS[index % PHOTOS.length]),
    photoUrl(PHOTOS[(index + 4) % PHOTOS.length]),
    photoUrl(PHOTOS[(index + 8) % PHOTOS.length]),
  ];

  const common = {
    place,
    ownerName,
    ownerMobile: OWNER_MOBILE,
    address: `${between(r, 1, 120)}, ${pick(r, ['1st', '2nd', '3rd', '5th', '7th'])} Main Road, ${place}`,
    images,
    imageUrl: images[0],
    employeeEmail: SEED_TAG,
    /* A realistic mix rather than all-verified. The public site badges this,
       and a catalogue where every row is verified cannot show the difference
       the badge exists to show. */
    isVerified: r() > 0.35,
    status: 'active',
  };
  common.verificationStatus = common.isVerified ? 'verified' : 'pending';

  if (variant === 'PG') {
    const single = money(band * (1.35 + r() * 0.3));
    const double = money(band * (1 + r() * 0.15));
    const triple = money(band * (0.78 + r() * 0.1));
    const foodIncluded = r() > 0.25;

    return {
      ...common,
      name: `${pick(r, PG_PREFIX)} ${pick(r, ['PG', 'PG for Men', 'PG for Women', 'Residency', 'Co-Living'])}`,
      category: 'PG_HOSTEL',
      stayType: r() > 0.6 ? 'Both Short & Long Stay' : 'Long Stay',
      longStayDuration: pick(r, ['1 Month+', '3 months min', '6 months min']),
      shortStayDuration: '1-7 Days',
      dailyPrice: r() > 0.6 ? money(band / 22) : 0,
      monthlyPrice: double,
      rent: double,
      deposit: money(double * pick(r, [1, 2, 2])),
      description: `${common.isVerified ? 'Verified by our team. ' : ''}A ${pick(r, ['quiet', 'well-kept', 'newly renovated', 'centrally located'])} PG in ${area}, ${pick(r, ['walking distance from the metro', 'close to the tech park', 'near the main market', 'a short ride from the bus stand'])}. ${foodIncluded ? 'Home-cooked meals are included in the rent.' : 'A shared kitchen is available on every floor.'}`,
      amenities: AMENITIES.PG.slice(0, between(r, 6, 11)),
      categoryDetails: {
        sharingTypes: ['Single', '2 Sharing', '3 Sharing'],
        /* Per-option prices, which is what lets the sharing selector show a
           real comparison instead of "Price on request" on every row. */
        sharingPrices: { Single: single, '2 Sharing': double, '3 Sharing': triple },
        foodIncluded,
        ...(foodIncluded
          ? {
            foodType: pick(r, ['Veg Only', 'Both (Veg & Non-Veg)']),
            mealsProvided: ['Breakfast', 'Lunch', 'Dinner'],
            mealTimings: MEAL_TIMINGS,
          }
          : {}),
        curfewTime: pick(r, ['10:30 PM', '11:00 PM', '11:30 PM']),
        housekeeping: true,
      },
    };
  }

  if (variant === 'Hostel') {
    const double = money(band * (0.9 + r() * 0.15));
    const triple = money(band * (0.72 + r() * 0.1));
    const four = money(band * (0.6 + r() * 0.08));
    /* Hostels are the one category the panel records a gender for, and it is
       the field the app draws the boys/girls badge from. */
    const hostelType = pick(r, ['Boys', 'Girls']);

    return {
      ...common,
      name: `${pick(r, HOSTEL_PREFIX)} ${hostelType} Hostel`,
      category: 'PG_HOSTEL',
      stayType: 'Long Stay',
      longStayDuration: pick(r, ['1 Month+', '3 months min']),
      shortStayDuration: '1-7 Days',
      dailyPrice: 0,
      monthlyPrice: triple,
      rent: triple,
      deposit: money(triple * pick(r, [1, 1, 2])),
      description: `${hostelType === 'Girls' ? 'A girls-only' : 'A boys-only'} hostel in ${area} with a warden on site and three meals a day. ${pick(r, ['Close to the coaching centres.', 'Ten minutes from the metro.', 'Opposite the college gate.'])}`,
      amenities: AMENITIES.Hostel.slice(0, between(r, 5, 9)),
      categoryDetails: {
        hostelType,
        roomTypes: ['Double Sharing', 'Triple Sharing', '4 Sharing'],
        sharingPrices: { 'Double Sharing': double, 'Triple Sharing': triple, '4 Sharing': four },
        foodIncluded: true,
        foodType: pick(r, ['Veg Only', 'Both (Veg & Non-Veg)']),
        mealsProvided: ['Breakfast', 'Lunch', 'Dinner'],
        mealTimings: MEAL_TIMINGS,
        curfewTime: pick(r, ['9:30 PM', '10:00 PM', '10:30 PM']),
      },
    };
  }

  if (variant === 'Dormitory') {
    const nightly = money(band / 24);
    return {
      ...common,
      name: `${pick(r, DORM_PREFIX)} ${pick(r, ['Dormitory', 'Pod Stay', 'Bunk House'])}`,
      category: 'HOTEL',
      stayType: 'Short Stay',
      longStayDuration: '1 Month+',
      shortStayDuration: '1-7 Days',
      /* Nightly, and no monthly figure — which is what makes `pricePeriod`
         come back as "/day" and keeps this row out of the median. */
      dailyPrice: nightly,
      monthlyPrice: 0,
      rent: nightly,
      deposit: 0,
      description: `A ${between(r, 6, 16)}-bed dormitory in ${area}, priced by the night. Lockers at every bunk. ${pick(r, ['Two minutes from the station.', 'On the main road.', 'Above the cafe.'])}`,
      amenities: AMENITIES.Dormitory.slice(0, between(r, 4, 7)),
      categoryDetails: {
        rateType: 'Daily Rate',
        bedType: pick(r, ['Bunk Bed Pod', 'Single Bed in Hall']),
        foodIncluded: false,
      },
    };
  }

  // Bachelor Room
  const monthly = money(band * (1.3 + r() * 0.5));
  return {
    ...common,
    name: `${pick(r, BACHELOR_PREFIX)} ${pick(r, ['1BHK', '2BHK', 'Studio', '1RK'])}`,
    category: 'BACHELOR',
    stayType: 'Long Stay',
    longStayDuration: pick(r, ['6 months min', '11 months min']),
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: monthly,
    rent: monthly,
    deposit: money(monthly * 2),
    description: `An independent unit in ${area}, ${pick(r, ['semi-furnished', 'fully furnished'])}, with its own kitchen and no curfew. Maintenance is billed separately.`,
    amenities: AMENITIES['Bachelor Room'].slice(0, between(r, 5, 8)),
    categoryDetails: {
      roomType: pick(r, ['1 BHK Independent', '2 BHK Independent', 'Studio Apartment']),
      furnishing: pick(r, ['Semi-furnished', 'Fully furnished']),
      foodIncluded: false,
    },
  };
}

/* ── Run ─────────────────────────────────────────────────────────────────── */

(async () => {
  if (!config.db.uri) {
    console.error('MONGO_URI is missing from Backend/.env');
    process.exit(1);
  }

  await mongoose.connect(config.db.uri, { dbName: config.db.dbName, ...config.db.options });
  const dbName = mongoose.connection.name;
  const host = mongoose.connection.host;

  if (CLEAN) {
    const { deletedCount } = await Property.deleteMany({ employeeEmail: SEED_TAG });
    console.log(`🧹 Removed ${deletedCount} seeded properties from ${dbName} on ${host}.`);
    await mongoose.disconnect();
    return;
  }

  if (!OWNER_MOBILE) {
    console.error('\n✗ Refusing to seed without an owner mobile number.\n');
    console.error('  A visit request reads `ownerMobile` off the property and sends a real');
    console.error('  WhatsApp message to it. Seeded rows must point at a number you control,');
    console.error('  or the first person to press "Request a visit" messages a stranger.\n');
    console.error('    node scripts/seed-properties.js --owner-mobile=+919876543210\n');
    await mongoose.disconnect();
    process.exit(1);
  }

  /* The areas already in the catalogue, derived exactly as the app derives
     them, so a seeded row lands in an area the entry screen already lists
     rather than creating a new one beside it. */
  const existing = await Property.find({ employeeEmail: { $ne: SEED_TAG } }, { place: 1 }).lean();
  const areas = new Map();
  for (const row of existing) {
    const place = String(row.place || '');
    const city = cityOf(place) || 'Unknown';
    const area = localityOf(place, city) || city;
    areas.set(`${city}::${area}`, { area, city });
  }

  if (!areas.size) {
    console.error('No areas found — the collection has no unseeded properties to take them from.');
    await mongoose.disconnect();
    process.exit(1);
  }

  /*
   * A mix per area, weighted towards PGs because that is what the market is
   * and what the app's first tab shows.
   *
   * These are fixture SHAPES, not stored categories. PG and Hostel are one
   * category now (PG_HOSTEL) but they are still two different shapes — a PG
   * row carries meal timings and a hostel row carries a warden contact, and
   * the collection has both. Seeding only one shape would hide every bug that
   * lives in the difference.
   */
  const MIX = ['PG', 'PG', 'PG', 'PG', 'Hostel', 'Hostel', 'Bachelor Room', 'Dormitory'];

  const docs = [];
  let areaIndex = 0;
  for (const { area, city } of areas.values()) {
    const r = rng(1000 + areaIndex);
    const count = between(r, PER_AREA_MIN, PER_AREA_MAX);
    for (let i = 0; i < count; i += 1) {
      docs.push(buildProperty({
        area, city, variant: MIX[i % MIX.length], index: areaIndex * 100 + i,
      }));
    }
    areaIndex += 1;
  }

  const perArea = {};
  for (const d of docs) perArea[d.place] = (perArea[d.place] || 0) + 1;

  console.log(`\n📍 Database  ${dbName} on ${host}`);
  console.log(`👤 Owner     ${OWNER_MOBILE}  (every seeded property points here)`);
  console.log(`🏷️  Tag       employeeEmail = ${SEED_TAG}\n`);
  console.log(`${areas.size} areas, ${docs.length} properties:`);
  for (const [place, n] of Object.entries(perArea)) console.log(`   ${String(n).padStart(3)}  ${place}`);

  const byCategory = {};
  for (const d of docs) byCategory[d.category] = (byCategory[d.category] || 0) + 1;
  console.log('\nby category:', byCategory);

  console.log('\nsample row:');
  console.log(JSON.stringify(docs[0], null, 2).split('\n').map((l) => `   ${l}`).join('\n'));

  if (DRY_RUN) {
    console.log('\n— dry run, nothing written —\n');
    await mongoose.disconnect();
    return;
  }

  /* Replaces rather than appends: a second run without this would double the
     catalogue, and the tag is what makes "replace" mean only our own rows. */
  const { deletedCount } = await Property.deleteMany({ employeeEmail: SEED_TAG });
  if (deletedCount) console.log(`\n🧹 Cleared ${deletedCount} rows from an earlier seed.`);

  const inserted = await Property.insertMany(docs, { ordered: false });
  console.log(`\n✅ Wrote ${inserted.length} properties.`);
  console.log(`   Undo with:  node scripts/seed-properties.js --clean\n`);

  await mongoose.disconnect();
})().catch(async (error) => {
  console.error('Seed failed:', error);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
