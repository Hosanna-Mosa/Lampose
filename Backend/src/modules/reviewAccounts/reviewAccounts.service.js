/* ══════════════════════════════════════════════════════════════════════════
   The Google Play review accounts — real accounts, kept usable.

   The apps carry NO reviewer credentials. What a reviewer types is checked by
   the ordinary production sign-in against a real row in the database, and the
   credentials live only in the server's environment:

     User App      REVIEW_LOGIN_PHONE + REVIEW_LOGIN_OTP
                   the phone sign-in, with a fixed code and no SMS
                   (customer.controller.js#issueOtp)
     Stay Partner  REVIEW_PARTNER_EMAIL + REVIEW_PARTNER_PASSWORD
                   the ordinary email-and-password login
     Food-Partner  REVIEW_RESTAURANT_EMAIL + REVIEW_RESTAURANT_PASSWORD
                   the ordinary email-or-phone-and-password login
     Rider app     REVIEW_LOGIN_PHONE + REVIEW_LOGIN_OTP again — the rider
                   sign-in is phone-only (driver.controller.js#issueOtp)

   ## "Usable at all times"

   `ensureReviewAccounts` runs at every database connect and hourly after
   that (`keepReviewAccountsUsable`). Each run creates whatever is missing and
   undoes whatever would lock a reviewer out: a block, a stale password after
   the environment changed, a code lock. It changes nothing else — a reviewer's
   saved places, bookings or menu edits are left exactly as they are.
   Account deletion never erases them (accountDeletion.eraser.js).

   ## It never takes over a real account

   A Stay Partner or Food-Partner row is only ever adopted if it was CREATED
   here, which its id says (`par_review_…`, `FP-REVIEW…`). If a real account
   already holds the review email or phone, this logs a warning and leaves it
   alone rather than resetting a stranger's password. The User App account is
   identified by the review number itself, which exists for nothing else.

   ## Something to look at

   An empty dashboard is a review that cannot see the app, so each partner
   account also gets sample content, kept the same way:

     Stay Partner  one PG, owned through the review number, with sharing
                   prices so Rooms and Share types have rows. `status:
                   'review'` keeps it out of the feed, the area counts, the
                   listing page, saving, stay and visit requests
                   (listing.controller.js#HIDDEN_STATUSES). Put back to
                   'review' if the reviewer removes it.
     Food-Partner  four dishes (`FPI-REVIEW…`), re-added if the menu is
                   emptied. The kitchen itself is never listed, so neither
                   are they.

   ## A review rider is never sent an order

   `DR-REVIEW01` is approved with onboarding complete, so the reviewer reaches
   the tabs and the duty switch works. The rider matcher leaves it out of
   every search (driverMatch.service.js), and accepting needs an offer made to
   you, so it can go online and will only ever see "no orders".

   ## A review kitchen is not a kitchen

   It is approved, so its owner can sign in and see the dashboard, and never
   listed: `isActive: false` keeps it out of the diner app and the website
   (`foodDiscovery.controller.js#LISTED`), and an owner cannot set that flag.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const mongoose = require('mongoose');

const config = require('../../config/env');

const PARTNER_PREFIX = 'par_review_';
const RESTAURANT_ID = 'FP-REVIEW01';
/* Marks the sample listing in `properties` — the field the seed scripts use
   for the same purpose, so a staff screen can tell it from a real one. */
const REVIEW_LISTING_TAG = 'play-review@lampose';
const DISH_PREFIX = 'FPI-REVIEW';
const DRIVER_ID = 'DR-REVIEW01';
/* Stands in for the scans. Plainly not a document, so no approver or
   reviewer mistakes it for one. */
const PLACEHOLDER_SCAN = 'https://lampose.com/favicon.png';
const REVIEW_DOCUMENTS = ['licence', 'rc', 'aadhaar'].map((kind) => ({
  kind,
  number: `REVIEW-${kind.toUpperCase()}`,
  frontUrl: PLACEHOLDER_SCAN,
  status: 'verified',
  reviewedBy: 'Play review account',
}));

const photo = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;
const LISTING_PHOTOS = [
  'photo-1522708323590-d24dbb6b0267', 'photo-1560448204-e02f11c3d0e2', 'photo-1505693416388-ac5ce068fe85',
].map(photo);

const REVIEW_DISHES = [
  { productName: 'Veg Hakka Noodles', category: 'Noodles', price: 140, isVeg: 'veg' },
  { productName: 'Paneer Butter Masala', category: 'Curries', price: 220, isVeg: 'veg' },
  { productName: 'Chicken Fried Rice', category: 'Rice', price: 180, isVeg: 'non-veg' },
  { productName: 'Masala Omelette', category: 'Breakfast', price: 90, isVeg: 'egg' },
];
const HOUR = 60 * 60 * 1000;

const reviewPhone = () => (config.auth.reviewLogin ? config.auth.reviewLogin.phone : null);
const tenDigits = (e164) => String(e164 || '').replace(/\D/g, '').slice(-10);

/** Whether `doc` is one of the review accounts — so deletion can leave it be. */
const isReviewAccount = (audienceKey, doc) => {
  if (!doc) return false;
  if (audienceKey === 'customer') return Boolean(reviewPhone() && doc.phone === reviewPhone());
  if (audienceKey === 'partner') return String(doc.partnerId || '').startsWith(PARTNER_PREFIX);
  if (audienceKey === 'restaurant') return doc.restaurantId === RESTAURANT_ID;
  if (audienceKey === 'driver') return doc.driverId === DRIVER_ID;
  return false;
};

/* A code lock is the one thing a stranger can do to the review number, so it
   is cleared on every run. */
const CLEAR_OTP_LOCK = { 'otp.attempts': 0, 'otp.lockedUntil': null };

const ensureCustomer = async () => {
  const phone = reviewPhone();
  if (!phone) return 'off';
  const Customer = require('../customers/customer.model');

  const found = await Customer.findOne({ phone });
  if (!found) {
    await Customer.create({
      customerId: `cus_review_${crypto.randomBytes(6).toString('hex')}`,
      phone,
      name: 'Play Review',
      phoneVerifiedAt: new Date(),
    });
    return 'created';
  }
  await Customer.updateOne({ _id: found._id }, {
    $set: { status: 'active', ...CLEAR_OTP_LOCK, ...(found.name ? {} : { name: 'Play Review' }) },
  });
  return 'kept';
};

const ensurePartner = async () => {
  const creds = config.auth.reviewPartner;
  const phone = reviewPhone();
  if (!creds || !phone) return 'off';
  const Partner = require('../partners/partner.model');

  const holders = await Partner.find({ $or: [{ email: creds.email }, { phone }] }).select('+passwordHash');
  const foreign = holders.find((doc) => !isReviewAccount('partner', doc));
  if (foreign) {
    console.warn(`⚠️  [Review Accounts] Stay Partner: ${creds.email} or the review number belongs to a real account — left untouched`);
    return 'conflict';
  }

  const passwordHash = await Partner.hashPassword(creds.password);
  const found = holders[0];
  if (!found) {
    await Partner.create({
      partnerId: `${PARTNER_PREFIX}${crypto.randomBytes(6).toString('hex')}`,
      phone,
      email: creds.email,
      name: 'Play Review',
      businessName: 'Play Review Properties',
      phoneVerifiedAt: new Date(),
      profileCompletedAt: new Date(),
      passwordHash,
    });
    return 'created';
  }

  const passwordMatches = await found.verifyPassword(creds.password);
  await Partner.updateOne({ _id: found._id }, {
    $set: {
      status: 'active',
      email: creds.email,
      ...CLEAR_OTP_LOCK,
      ...(found.phoneVerifiedAt ? {} : { phoneVerifiedAt: new Date() }),
      ...(found.profileCompletedAt ? {} : { profileCompletedAt: new Date() }),
      ...(passwordMatches ? {} : { passwordHash }),
    },
  });
  return 'kept';
};

/* The review owner's one listing. Owned the way every listing is — by the
   phone on it — and hidden by its status, never by special-casing the owner. */
const ensureReviewListing = async () => {
  const Property = require('../properties/property.model');
  const phone = reviewPhone();

  const found = await Property.findOne({ employeeEmail: REVIEW_LISTING_TAG });
  if (found) {
    if (found.status !== 'review' || found.ownerMobile !== phone) {
      await Property.updateOne({ _id: found._id }, { $set: { status: 'review', ownerMobile: phone, removedAt: null } });
    }
    return 'kept';
  }

  const property = await Property.create({
    name: 'Lampose Review PG (test listing)',
    place: 'Madhapur',
    address: 'Review account — not a real address, Madhapur, Hyderabad',
    ownerName: 'Play Review',
    ownerMobile: phone,
    category: 'PG_HOSTEL',
    stayType: 'Long Stay',
    longStayDuration: '1 Month+',
    rent: 8000,
    monthlyPrice: 8000,
    deposit: 8000,
    description: 'A sample listing for app review. It is never shown to students and cannot be booked.',
    images: LISTING_PHOTOS,
    imageUrl: LISTING_PHOTOS[0],
    amenities: ['High-Speed Wi-Fi', 'Daily Housekeeping', 'Power Backup', 'RO Water'],
    categoryDetails: {
      sharingTypes: ['Single', '2 Sharing', '3 Sharing'],
      sharingPrices: { Single: 12000, '2 Sharing': 9000, '3 Sharing': 8000 },
      foodIncluded: true,
      foodType: 'Veg Only',
      mealsProvided: ['Breakfast', 'Lunch', 'Dinner'],
      housekeeping: true,
    },
    employeeEmail: REVIEW_LISTING_TAG,
    isVerified: false,
    verificationStatus: 'pending',
    status: 'review',
  });

  /* Rooms and share-type rows, derived exactly as for a real listing. */
  const { syncShareTypes } = require('../inventory/inventory.service');
  await syncShareTypes(property.toObject());
  return 'created';
};

/* The review kitchen's menu — only ever re-added when it is empty, so a
   reviewer's own edits are left alone. */
const ensureReviewMenu = async () => {
  const FoodProduct = require('../foodpartners/foodProduct.model');
  if (await FoodProduct.countDocuments({ restaurantId: RESTAURANT_ID })) return 'kept';
  await FoodProduct.insertMany(REVIEW_DISHES.map((dish, i) => ({
    ...dish,
    productId: `${DISH_PREFIX}${String(i + 1).padStart(2, '0')}`,
    restaurantId: RESTAURANT_ID,
    description: 'Sample dish on the review kitchen.',
    isAvailable: true,
  })));
  return 'created';
};

const ensureRestaurant = async () => {
  const creds = config.auth.reviewRestaurant;
  const phone = reviewPhone();
  if (!creds || !phone) return 'off';
  const FoodRestaurant = require('../foodpartners/foodRestaurant.model');

  const holders = await FoodRestaurant.find({
    $or: [{ ownerEmail: creds.email }, { phoneKey: tenDigits(phone) }, { restaurantId: RESTAURANT_ID }],
  }).select('+passwordHash');
  const foreign = holders.find((doc) => !isReviewAccount('restaurant', doc));
  if (foreign) {
    console.warn(`⚠️  [Review Accounts] Food-Partner: ${creds.email} or the review number belongs to a real kitchen — left untouched`);
    return 'conflict';
  }

  const passwordHash = await FoodRestaurant.hashPassword(creds.password);
  const found = holders[0];
  if (!found) {
    const { CUISINE_TYPES } = require('../foodpartners/foodRestaurant.model');
    await FoodRestaurant.create({
      restaurantId: RESTAURANT_ID,
      restaurantName: 'Lampose Review Kitchen',
      ownerName: 'Play Review',
      ownerPhone: phone,
      ownerEmail: creds.email,
      fssaiLicenseNumber: '00000000000000',
      cuisineTypes: [CUISINE_TYPES[0]],
      description: 'A test account for app review. Not a real kitchen and never shown to customers.',
      address: { line1: 'Review account — not a real address', city: 'Hyderabad' },
      verificationStatus: 'approved',
      verifiedAt: new Date(),
      isActive: false,
      openState: 'closed',
      passwordHash,
    });
    return 'created';
  }

  const passwordMatches = await found.verifyPassword(creds.password);
  await FoodRestaurant.updateOne({ _id: found._id }, {
    $set: {
      ownerEmail: creds.email,
      /* Signed in and never listed — see the header. */
      verificationStatus: 'approved',
      isActive: false,
      ...(passwordMatches ? {} : { passwordHash }),
    },
  });
  return 'kept';
};

const ensureDriver = async () => {
  const phone = reviewPhone();
  if (!phone) return 'off';
  const Driver = require('../drivers/driver.model');

  const holders = await Driver.find({ $or: [{ phone }, { driverId: DRIVER_ID }] });
  const foreign = holders.find((doc) => !isReviewAccount('driver', doc));
  if (foreign) {
    console.warn('⚠️  [Review Accounts] Rider app: the review number belongs to a real rider — left untouched');
    return 'conflict';
  }

  /* What gets a rider past onboarding and onto the tabs. Re-applied on every
     run, so a reviewer who resubmits a document or edits the profile is back
     to approved within the hour. */
  const working = {
    status: 'approved',
    statusReason: '',
    hasCompletedOnboarding: true,
    onboardingStep: 'done',
  };

  const found = holders[0];
  if (!found) {
    await Driver.create({
      driverId: DRIVER_ID,
      phone,
      name: 'Play Review',
      dateOfBirth: new Date('1995-01-01'),
      city: 'Hyderabad',
      vehicle: { type: 'bike', model: 'Review bike', plate: 'TS00RV0001' },
      documents: REVIEW_DOCUMENTS,
      payout: { accountHolderName: 'Play Review', upiId: 'playreview@lampose' },
      phoneVerifiedAt: new Date(),
      ...working,
    });
    return 'created';
  }

  const set = { ...working, ...CLEAR_OTP_LOCK };
  if (!found.name) set.name = 'Play Review';
  if (!found.dateOfBirth) set.dateOfBirth = new Date('1995-01-01');
  if (!found.city) set.city = 'Hyderabad';
  if (!found.vehicle || !found.vehicle.plate) {
    set.vehicle = { type: 'bike', model: 'Review bike', plate: 'TS00RV0001' };
  }
  const payout = found.payout || {};
  if (!payout.accountLast4 && !payout.upiId) set['payout.upiId'] = 'playreview@lampose';
  /* Every required document back to verified, keeping any optional ones the
     reviewer added. */
  const others = (found.documents || []).filter((doc) => !REVIEW_DOCUMENTS.some((d) => d.kind === doc.kind));
  const needsDocs = REVIEW_DOCUMENTS.some((d) => !(found.documents || [])
    .some((doc) => doc.kind === d.kind && doc.status === 'verified' && doc.frontUrl));
  if (needsDocs) set.documents = [...others.map((doc) => doc.toObject()), ...REVIEW_DOCUMENTS];

  await Driver.updateOne({ _id: found._id }, { $set: set });
  return 'kept';
};

/**
 * Create and repair the review accounts. Safe to run any number of
 * times; each account whose settings are missing is simply skipped ('off').
 */
const ensureReviewAccounts = async () => {
  if (mongoose.connection.readyState !== 1) return null;
  const result = {};
  const run = async (name, ensure) => {
    try {
      result[name] = await ensure();
    } catch (error) {
      result[name] = `failed: ${error.message}`;
      console.error(`⚠️  [Review Accounts] ${name}: ${error.message}`);
    }
    return result[name];
  };
  await run('user', ensureCustomer);
  await run('rider', ensureDriver);
  /* Sample content only behind an account that is ours — never after a
     conflict, and never when the account is switched off. */
  if (['created', 'kept'].includes(await run('stayPartner', ensurePartner))) {
    await run('stayPartnerListing', ensureReviewListing);
  }
  if (['created', 'kept'].includes(await run('foodPartner', ensureRestaurant))) {
    await run('foodPartnerMenu', ensureReviewMenu);
  }
  return result;
};

let timer = null;
let listening = false;

/** At every connect (and reconnect), and hourly. Never throws. */
const keepReviewAccountsUsable = () => {
  const run = () => ensureReviewAccounts()
    .then((result) => {
      if (result && Object.values(result).some((v) => v !== 'off' && v !== 'kept')) {
        console.log(`🧪 [Review Accounts] ${JSON.stringify(result)}`);
      }
    })
    .catch(() => {});

  if (!listening) {
    mongoose.connection.on('connected', run);
    listening = true;
  }
  if (mongoose.connection.readyState === 1) run();
  if (!timer) {
    timer = setInterval(run, HOUR);
    if (timer.unref) timer.unref();
  }
};

const stopReviewAccountKeeper = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = {
  ensureReviewAccounts, keepReviewAccountsUsable, stopReviewAccountKeeper, isReviewAccount,
  ensureDriver, PARTNER_PREFIX, RESTAURANT_ID, DRIVER_ID, REVIEW_LISTING_TAG,
};
