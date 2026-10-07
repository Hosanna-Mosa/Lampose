/* ══════════════════════════════════════════════════════════════════════════
   Two ₹10 Bachelor rooms, for checking the visit-fee payment end to end.

   Owned by 9704726252 (Stay Partner "Sunand", sunandvemavarapu@gmail.com),
   placed beside that owner's other listings in HSR Layout, Bangalore. Rent is
   ₹10 and — what a student actually pays in the app for a Bachelor room — the
   assisted-visit fee is ₹10 too.

   ## Why the layout is "5 BHK"

   The visit fee is not per listing. It is ONE table, priced by layout tier
   (`visitFees.service.js`), shared by every listing in the database. Setting
   a tier to ₹10 reprices every listing in that tier. So these rooms use the
   "5 BHK and above" tier, which no other listing uses, and the script REFUSES
   to touch the fee if that stops being true. 1 RK is never used: it is also
   the fallback tier for every layout the rule does not recognise.

   The fee change goes through `visitFees.updateFees`, so it is written to the
   admin audit log (actor "Script · ₹10 payment test") with the value it
   replaced. `--remove` reads that value back and restores it — only if the
   tier still holds the ₹10 this script set, so a change somebody made in the
   console since is never overwritten.

   ## On the live database

   Run against production only on purpose, by naming it:

     LAMPOSE_ALLOW_WRITES_TO=lamp_onboarding node scripts/seed-payment-test-bachelor.js
     LAMPOSE_ALLOW_WRITES_TO=lamp_onboarding node scripts/seed-payment-test-bachelor.js --remove

   While seeded, these are real listings: students in Bangalore can see and
   request them, a request messages the owner's real WhatsApp, and Razorpay
   is in live mode, so the ₹10 is a real charge (refund it from the Razorpay
   dashboard). Remove them when the check is done.

   Re-runnable: it removes only the rows it wrote itself (SEED_TAG) and their
   inventory. The owner's Stay Partner account is used as it is.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

/* Refuse to run against production unless it is named. See guard.js. */
const { guardedConnect } = require('../src/infrastructure/database/guard');

const Property = require('../src/modules/properties/property.model');
const Partner = require('../src/modules/partners/partner.model');
const { PartnerShareType } = require('../src/modules/partners/partnerDomains.model');
const { syncShareTypes } = require('../src/modules/inventory/inventory.service');
const visitFees = require('../src/modules/visitFees/visitFees.service');
const { AdminAuditLog } = require('../src/modules/admins/adminAuditLog.model');

const SEED_TAG = 'payment-test-seed@lampose.local';
const REMOVE_ONLY = process.argv.includes('--remove');

const OWNER = {
  name: 'Sunand',
  mobile: '+919704726252',
  digits: '9704726252',
  email: 'sunandvemavarapu@gmail.com',
};

const TEST_TIER = '5BHK';
const TEST_FEE_PAISE = 1000; // ₹10
const RENT = 10;
const LAYOUT = '5 BHK Test Room';

/* Who the audit log names for the fee change and its restore. */
const SCRIPT_REQ = {
  admin: {
    _id: 'script:seed-payment-test-bachelor',
    name: 'Script · ₹10 payment test',
    email: OWNER.email,
    role: 'Script',
  },
  headers: { 'user-agent': 'scripts/seed-payment-test-bachelor.js' },
};

const PHOTOS = [
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
];

const room = ({ letter, coordinates, photo }) => ({
  name: `TEST · ₹10 Payment Room ${letter} (not a real listing)`,
  place: 'HSR Layout Sector 3, Bangalore',
  ownerName: OWNER.name,
  ownerMobile: OWNER.mobile,
  ownerAltMobile: OWNER.mobile,
  category: 'BACHELOR',
  employeeEmail: SEED_TAG,
  stayType: 'Long Stay',
  longStayDuration: '1 Month+',
  shortStayDuration: '1-7 Days',
  dailyPrice: 0,
  monthlyPrice: RENT,
  rent: RENT,
  deposit: 0,
  address: `TEST Payment Room ${letter}, HSR Layout Sector 3, Bangalore`,
  location: { type: 'Point', coordinates },
  description:
    'A test listing for checking the ₹10 visit-fee payment. It is not a real room — please do not request it.',
  imageUrl: PHOTOS[photo % PHOTOS.length],
  images: [0, 1, 2].map((i) => PHOTOS[(photo + i) % PHOTOS.length]),
  amenities: ['High-Speed Wi-Fi', 'Power Backup'],
  categoryDetails: {
    roomTypes: [LAYOUT],
    sharingPrices: { [LAYOUT]: RENT },
    sharingBeds: { [LAYOUT]: 3 },
    sharingRooms: { [LAYOUT]: 3 },
    furnishing: 'Semi-Furnished',
    allowedTenants: ['Bachelors'],
  },
  isVerified: true,
  verificationStatus: 'verified',
  status: 'active',
});

const ROOMS = [
  room({ letter: 'A', coordinates: [77.6395, 12.911], photo: 0 }),
  room({ letter: 'B', coordinates: [77.637, 12.9095], photo: 2 }),
];

/** Listings OTHER than this script's that a change to TEST_TIER would reprice. */
const othersInTier = async () => {
  const rows = await Property.find(
    { employeeEmail: { $ne: SEED_TAG } },
    { name: 1, category: 1, categoryDetails: 1 },
  ).lean();
  return rows.filter((row) => {
    const labels = new Set([
      ...((row.categoryDetails && row.categoryDetails.roomTypes) || []),
      ...Object.keys((row.categoryDetails && row.categoryDetails.sharingPrices) || {}),
    ]);
    return [...labels].some((label) => {
      const hit = visitFees.tierForLayout(row.category, label);
      return hit && hit.tier === TEST_TIER;
    });
  });
};

const removeRooms = async () => {
  const previous = await Property.find({ employeeEmail: SEED_TAG }).select('_id').lean();
  const ids = previous.map((p) => String(p._id));
  if (ids.length) {
    await PartnerShareType.deleteMany({ propertyId: { $in: ids } });
    await Property.deleteMany({ employeeEmail: SEED_TAG });
  }
  console.log(`🧹 Removed ${ids.length} test room(s) and their inventory.`);
};

const restoreFee = async () => {
  await visitFees.refresh();
  const current = visitFees.describe().tiers.find((t) => t.key === TEST_TIER).amountPaise;
  if (current !== TEST_FEE_PAISE) {
    console.log(`💰 ${TEST_TIER} fee is ₹${current / 100}, not this script's ₹${TEST_FEE_PAISE / 100} — left as it is.`);
    return;
  }
  const lastChange = await AdminAuditLog.findOne({
    action: 'visit_fees.changed',
    adminId: SCRIPT_REQ.admin._id,
    [`after.${TEST_TIER}`]: TEST_FEE_PAISE,
  }).sort({ createdAt: -1 }).lean();
  const tierDefault = visitFees.TIERS.find((t) => t.key === TEST_TIER).defaultPaise;
  const original = Number(lastChange && lastChange.before && lastChange.before[TEST_TIER]) || tierDefault;
  await visitFees.updateFees({ [TEST_TIER]: original }, SCRIPT_REQ);
  console.log(`💰 Restored the ${TEST_TIER} visit fee to ₹${(original / 100).toLocaleString('en-IN')}.`);
};

(async () => {
  try {
    await guardedConnect({ verb: REMOVE_ONLY ? 'removing ₹10 payment-test rooms from' : 'seeding ₹10 payment-test rooms in' });

    if (REMOVE_ONLY) {
      await removeRooms();
      await restoreFee();
      return;
    }

    /* The whole premise: nobody else is in this tier. */
    const others = await othersInTier();
    if (others.length) {
      console.error(`❌ ${others.length} other listing(s) are in the ${TEST_TIER} tier — a ₹10 fee would reprice them:`);
      for (const row of others.slice(0, 10)) console.error(`   ${row._id}  ${row.name}`);
      process.exitCode = 1;
      return;
    }

    const partner = await Partner.findOne({ phoneDigits: OWNER.digits }).lean();
    if (!partner) {
      console.error(`❌ No Stay Partner account for ${OWNER.mobile} — the app cannot route a request to it.`);
      process.exitCode = 1;
      return;
    }
    console.log(`👤 Owner: ${partner.name} (${partner.partnerId}) · ${partner.email || 'no email'} · ${partner.status}${partner.acceptingBookings ? '' : ' · NOT accepting bookings'}`);
    if (partner.email !== OWNER.email) {
      console.warn(`   ⚠️  The account's email is "${partner.email}", not ${OWNER.email}. Left as it is.`);
    }

    await removeRooms();
    const inserted = await Property.insertMany(ROOMS);
    for (const property of inserted) await syncShareTypes(property);

    await visitFees.updateFees({ [TEST_TIER]: TEST_FEE_PAISE }, SCRIPT_REQ);
    await visitFees.refresh();

    console.log(`\n🏠 ${inserted.length} rooms — rent ₹${RENT}/month, and what a visit will be charged:\n`);
    for (const property of inserted) {
      const fee = visitFees.feeFor(property.category, LAYOUT);
      console.log(`   ${property.name}`);
      console.log(`      id ${property._id}`);
      console.log(`      ${LAYOUT} → ${fee.tier} tier → visit fee ₹${fee.amountPaise / 100}`);
    }
    console.log('\n✅ Done. Servers pick up the fee within a minute. Remove with --remove when the check is over.');
  } catch (error) {
    console.error('❌ Failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
