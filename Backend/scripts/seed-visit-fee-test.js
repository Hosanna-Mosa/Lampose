/* ══════════════════════════════════════════════════════════════════════════
   Test listings for the per-layout visit fee.

   Bachelor and House / Co-live properties for two owners, whose layouts
   between them hit every fee tier in `visitFees.service.js` — including the
   edge cases the rule has to get right:

     "Single Private Room"  → 1 RK        (₹299)
     "1 RK Studio"          → 1 RK, not Commercial — the number wins
     "Studio"               → Commercial  (₹1,999)
     "6 BHK Independent"    → 5 BHK+      (₹2,499)
     "Penthouse"            → unrecognised, charged 1 RK and logged

   Each owner gets a verified Stay Partner account so the APP flow works too
   (it refuses owners who are not on Stay Partner), and every property gets
   counted inventory via `syncShareTypes`.

   Re-runnable: it removes only the rows it wrote itself (SEED_TAG) and leaves
   anything else these numbers own alone.

     DB_NAME=lamp_booking_dev node scripts/seed-visit-fee-test.js
     DB_NAME=lamp_booking_dev node scripts/seed-visit-fee-test.js --remove
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');
const config = require('../src/config/env');

/* Refuse to run against production. See src/infrastructure/database/guard.js */
require('../src/infrastructure/database/guard').assertDevTargetOrExit();

const Property = require('../src/modules/properties/property.model');
const Partner = require('../src/modules/partners/partner.model');
const { PartnerShareType } = require('../src/modules/partners/partnerDomains.model');
const { syncShareTypes } = require('../src/modules/inventory/inventory.service');
const visitFees = require('../src/modules/visitFees/visitFees.service');

const SEED_TAG = 'visit-fee-test-seed@lampose.local';
const REMOVE_ONLY = process.argv.includes('--remove');

const OWNERS = [
  { name: 'Sunand', mobile: '+919704726252', digits: '9704726252' },
  { name: 'Fee Test Owner', mobile: '+919398334115', digits: '9398334115' },
];

const PHOTOS = [
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80',
];

/**
 * One listing. `layouts` is `{ label: monthlyRent }`; every layout gets three
 * units so a request can be accepted without the room reading full.
 */
const listing = ({
  owner, category, name, place, coordinates, layouts, description, photo = 0,
}) => {
  const labels = Object.keys(layouts);
  const rents = Object.values(layouts);
  const lowest = Math.min(...rents);
  const counts = Object.fromEntries(labels.map((l) => [l, 3]));

  return {
    name,
    place,
    ownerName: owner.name,
    ownerMobile: owner.mobile,
    ownerAltMobile: owner.mobile,
    category,
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '1 Month+',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: lowest,
    rent: lowest,
    deposit: lowest * 2,
    address: `${name}, ${place}`,
    location: { type: 'Point', coordinates },
    description,
    imageUrl: PHOTOS[photo % PHOTOS.length],
    images: [0, 1, 2].map((i) => PHOTOS[(photo + i) % PHOTOS.length]),
    amenities: ['High-Speed Wi-Fi', 'Power Backup', 'Covered Parking', '24/7 Security'],
    categoryDetails: {
      roomTypes: labels,
      sharingPrices: layouts,
      sharingBeds: counts,
      sharingRooms: counts,
      furnishing: 'Semi-Furnished',
      allowedTenants: ['Bachelors'],
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  };
};

const [A, B] = OWNERS;

const PROPERTIES = [
  /* ── Owner A — 9704726252 ─────────────────────────────────────────── */
  listing({
    owner: A, category: 'BACHELOR', photo: 0,
    name: 'Fee Test · Sunand Compact Rooms',
    place: 'KPHB Colony, Hyderabad', coordinates: [78.3915, 17.4849],
    layouts: { '1 RK': 7500, 'Single Private Room': 6000, '1 RK Studio': 8000 },
    description: 'Fee test: 1 RK, Single Private Room and "1 RK Studio" — all three should cost ₹299 to visit.',
  }),
  listing({
    owner: A, category: 'BACHELOR', photo: 1,
    name: 'Fee Test · Sunand Family Flats',
    place: 'Madhapur, Hyderabad', coordinates: [78.3915, 17.4483],
    layouts: { '1 BHK': 12000, '2 BHK Apartment': 18000, '3 BHK Apartment': 26000 },
    description: 'Fee test: 1 BHK ₹499, 2 BHK ₹999 and 3 BHK ₹1,499 to visit.',
  }),
  listing({
    owner: A, category: 'BACHELOR', photo: 2,
    name: 'Fee Test · Sunand Large Homes',
    place: 'Kondapur, Hyderabad', coordinates: [78.3629, 17.4700],
    layouts: { '4 BHK Villa': 42000, '5 BHK Bungalow': 55000 },
    description: 'Fee test: 4 BHK ₹1,999 and 5 BHK ₹2,499 to visit.',
  }),
  listing({
    owner: A, category: 'BACHELOR', photo: 3,
    name: 'Fee Test · Sunand Odd Layouts',
    place: 'Gachibowli, Hyderabad', coordinates: [78.3489, 17.4401],
    layouts: { Studio: 11000, Penthouse: 60000 },
    description: 'Fee test: "Studio" is charged the Commercial fee (₹1,999); "Penthouse" matches no tier and is charged 1 RK (₹299) with a warning in the server log.',
  }),
  listing({
    owner: A, category: 'COLIVE', photo: 4,
    name: 'Fee Test · Sunand Co-live House',
    place: 'Hitec City, Hyderabad', coordinates: [78.3810, 17.4435],
    layouts: { '2 BHK': 9000, '3 BHK': 8000 },
    description: 'Fee test (House / Co-live): 2 BHK ₹999 and 3 BHK ₹1,499 to visit.',
  }),
  listing({
    owner: A, category: 'COLIVE', photo: 5,
    name: 'Fee Test · Sunand Single-Layout Co-live',
    place: 'Kukatpally, Hyderabad', coordinates: [78.4011, 17.4948],
    layouts: { '1 BHK': 10500 },
    description: 'Fee test (House / Co-live): one layout, so the page shows a single fee (₹499) and never "from".',
  }),

  /* ── Owner B — 9398334115 ─────────────────────────────────────────── */
  listing({
    owner: B, category: 'BACHELOR', photo: 1,
    name: 'Fee Test · Benz Circle Bachelor Rooms',
    place: 'Benz Circle, Vijayawada', coordinates: [80.6480, 16.4990],
    layouts: { '1RK Independent': 6500, '1 BHK Independent': 9500, '2 BHK': 14000 },
    description: 'Fee test: 1 RK ₹299, 1 BHK ₹499 and 2 BHK ₹999 to visit.',
  }),
  listing({
    owner: B, category: 'BACHELOR', photo: 2,
    name: 'Fee Test · Governorpet Big Homes',
    place: 'Governorpet, Vijayawada', coordinates: [80.6230, 16.5110],
    layouts: { '3 BHK': 22000, '4 BHK': 30000, '6 BHK Independent House': 48000 },
    description: 'Fee test: 3 BHK ₹1,499, 4 BHK ₹1,999, and 6 BHK — in the 5 BHK+ tier — ₹2,499.',
  }),
  listing({
    owner: B, category: 'COLIVE', photo: 3,
    name: 'Fee Test · Patamata Co-live Homes',
    place: 'Patamata, Vijayawada', coordinates: [80.6620, 16.4920],
    layouts: { '1 RK': 5500, '2 BHK': 8500 },
    description: 'Fee test (House / Co-live): 1 RK ₹299 and 2 BHK ₹999 to visit.',
  }),
  listing({
    owner: B, category: 'COLIVE', photo: 4,
    name: 'Fee Test · Labbipet Shared Villas',
    place: 'Labbipet, Vijayawada', coordinates: [80.6380, 16.5020],
    layouts: { '4 BHK': 9500, '5 BHK': 9000 },
    description: 'Fee test (House / Co-live): 4 BHK ₹1,999 and 5 BHK ₹2,499 to visit.',
  }),
];

const ensurePartner = async (owner) => {
  let partner = await Partner.findOne({ phoneDigits: owner.digits });
  if (!partner) {
    partner = await Partner.create({
      partnerId: `prt_${Math.random().toString(36).slice(2, 18)}`,
      name: owner.name,
      phone: owner.mobile,
      phoneDigits: owner.digits,
      phoneVerifiedAt: new Date(),
      profileCompletedAt: new Date(),
      acceptingBookings: true,
      status: 'active',
    });
    console.log(`   ✅ Created Stay Partner account for ${owner.mobile}`);
    return;
  }
  /* An existing account keeps its name and everything else; it only needs to
     be able to receive requests. */
  partner.phoneVerifiedAt = partner.phoneVerifiedAt || new Date();
  partner.acceptingBookings = true;
  if (partner.status === 'blocked') {
    console.warn(`   ⚠️  ${owner.mobile} is BLOCKED on Stay Partner — app requests to it will be refused. Left as is.`);
  }
  await partner.save();
  console.log(`   ✅ Stay Partner account for ${owner.mobile} is ready`);
};

(async () => {
  try {
    await mongoose.connect(config.db.uri, { dbName: config.db.dbName, ...config.db.options });
    console.log(`\n📍 Connected to ${mongoose.connection.name} on ${mongoose.connection.host}`);

    /* Remove this script's own earlier run, and only that. */
    const previous = await Property.find({ employeeEmail: SEED_TAG }).select('_id').lean();
    const previousIds = previous.map((p) => String(p._id));
    if (previousIds.length) {
      await PartnerShareType.deleteMany({ propertyId: { $in: previousIds } });
      await Property.deleteMany({ employeeEmail: SEED_TAG });
    }
    console.log(`🧹 Removed ${previousIds.length} listing(s) from an earlier run.`);
    if (REMOVE_ONLY) return;

    console.log('\n👤 Owners');
    for (const owner of OWNERS) await ensurePartner(owner);

    const inserted = await Property.insertMany(PROPERTIES);
    for (const property of inserted) await syncShareTypes(property);

    /* What each layout will cost, from the SAME rule and table the server
       charges from — so this printout is what the apps should show. */
    await visitFees.refresh();
    console.log(`\n🏠 ${inserted.length} listings, with the visit fee each layout will be charged:\n`);
    for (const property of inserted) {
      console.log(`   [${property.category.padEnd(8)}] ${property.name}  (owner ${property.ownerMobile})`);
      console.log(`              id ${property._id}`);
      for (const label of property.categoryDetails.roomTypes) {
        const fee = visitFees.feeFor(property.category, label);
        const note = fee.recognised ? '' : '  ← unrecognised, charged the lowest tier';
        console.log(`              ${label.padEnd(26)} ${fee.tier.padEnd(10)} ₹${(fee.amountPaise / 100).toLocaleString('en-IN')}${note}`);
      }
    }
    console.log('\n✅ Done. Remove them later with --remove.');
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
