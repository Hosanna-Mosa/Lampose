/*
 * The fixed lists behind the restaurant onboarding form.
 *
 * Kept out of the step components so that the four steps, the review summary
 * and the payload builder all read the same words. A cuisine that exists in
 * one of those places and not another is a restaurant filed under a category
 * nothing ever filters on.
 */

export const STEPS = [
  { num: 1, label: 'Restaurant Information', sub: 'Name, owner, location' },
  { num: 2, label: 'Operational Details', sub: 'Opening hours, menu' },
  { num: 3, label: 'Documents & Legal', sub: 'PAN, FSSAI, bank, refunds' },
  { num: 4, label: 'Contract & Review', sub: 'Terms and signature' },
];

export const CUISINE_OPTIONS = [
  'North Indian', 'South Indian', 'Chinese', 'Italian', 'Bakery',
  'Fast Food', 'Street Food', 'Continental', 'Mexican', 'Japanese',
  'Thai', 'Healthy', 'Desserts', 'Beverages', 'Mughlai',
];

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/*
 * The menu, as this form collects it.
 *
 * SIX fields per dish out of the thirty `foodProduct.model.js` carries, and
 * the cut is deliberate: the three the backend REFUSES an item without — a
 * name, a category and a price — plus the three an owner answers without
 * looking anything up. Variants, add-ons, allergens, calories, preparation
 * time, tags and the photographs are all real fields on that model and all of
 * them belong to the Food-Partner app, where the owner has their own menu card
 * in front of them and as long as it takes. An agent standing at a counter for
 * twenty minutes is not typing a photograph for sixty dishes.
 *
 * Which is also why the whole section is OPTIONAL: an application with no menu
 * is a valid application (see `validateApplication` in the backend), and a
 * restaurant with no menu is invisible to diners until it has one anyway.
 */

/** Suggestions, not a closed list — the input stays free text. */
export const MENU_CATEGORY_OPTIONS = [
  'Starters', 'Soups', 'Main Course', 'Biryani', 'Rice', 'Breads',
  'Curries', 'Rolls & Wraps', 'Snacks', 'Combos & Thalis',
  'Desserts', 'Beverages',
];

/** `foodProduct.model.js`'s own enum, in the order a card is usually read. */
export const IS_VEG_OPTIONS = [
  { id: 'veg', label: 'Veg' },
  { id: 'egg', label: 'Egg' },
  { id: 'non-veg', label: 'Non-veg' },
];

/* A client-side id, so a row keeps its identity while the list is edited.
   Keyed by array index instead, deleting the second of five dishes would
   re-key the three below it and hand them the wrong values mid-edit. */
let menuSeq = 0;

/** One empty dish. `isVeg` starts at the schema's own default. */
export const createMenuItem = () => {
  menuSeq += 1;
  return {
    uid: `dish-${menuSeq}`,
    name: '',
    category: '',
    price: '',
    discountedPrice: '',
    isVeg: 'veg',
    description: '',
    /* The picture, held as the File itself until submit — it is uploaded to
       Cloudinary there and becomes `productImage` on the row. */
    photoFile: null,
  };
};

/**
 * Has anybody put anything into this row? An untouched row is not a dish.
 *
 * A PHOTOGRAPH counts. Somebody who attached a picture and nothing else has
 * started a dish, and the rules then ask for the name and the price that
 * picture belongs to — which is better than silently dropping the row, and the
 * photograph with it, at submit.
 */
export const isMenuItemStarted = (item = {}) => Boolean(item.photoFile) || [
  item.name, item.category, item.price, item.discountedPrice, item.description,
].some((value) => String(value ?? '').trim() !== '');

/*
 * The states, as a CLOSED list, and the district as free text beside it.
 *
 * Both exist for one job: an FSSAI licence is looked up on FoSCoS by company
 * name, licence number, STATE and DISTRICT together, and a verifier with three
 * of those four cannot run the check at all. They are asked for on the FSSAI
 * step for that reason, and stored on the address, which is where a state and
 * a district actually belong — one home for the value, not two.
 *
 * The state is a dropdown because it is a genuinely closed list of 36 that
 * changes about once a decade, and because "Telengana" typed by hand returns
 * no licence on a portal that has never heard of it.
 *
 * The district is deliberately NOT a dropdown. FoSCoS's own district list is
 * around eight hundred entries, is not a list of revenue districts — it
 * carries municipal corporations like "Greater Hyderabad Municipal
 * Corporation" beside ordinary districts — and it changes without telling us.
 * A copy of it here would be wrong within a year, and a required dropdown
 * missing the right entry is an onboarding that cannot be completed at all.
 * Free text is checked for being present and plausible, and the verifier
 * reads it against the licence in front of them.
 */
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam',
  'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

/** Where a verifier checks the licence. Opened from the admin console too. */
export const FSSAI_PORTAL_URL = 'https://foscos.fssai.gov.in/';

/*
 * The two numbers in the refund rule, declared rather than typed into
 * sentences twice.
 *
 * The same rule is said in two places — the commercial summary on step 4 and
 * the policy the owner actually TICKS on step 3 — and a screen that promises
 * five minutes' grace while the acceptance beside it says ten is the one
 * disagreement in this form that ends up in front of a lawyer. Both read from
 * here.
 */
export const CANCELLATION_GRACE_MINUTES = 5;
export const LATE_CANCELLATION_PERCENT = 10;

/* The commercial terms, shown on step 4 of the form. */
export const COMMERCIAL_TERMS = [
  {
    label: 'Payment Cycle',
    value: 'Weekly settlements — every Monday for the prior week',
  },
  {
    label: 'Cancellation Policy',
    value: `Free cancellation up to ${CANCELLATION_GRACE_MINUTES} mins. Late cancellations charged ${LATE_CANCELLATION_PERCENT}% of order value.`,
  },
  {
    label: 'Promotional Contribution',
    value: 'Optional. Shared cost for discounts & free delivery campaigns.',
  },
];

/*
 * The form's wording, in one place.
 *
 * This used to be a two-branch map keyed by `partnerType`, because the form it
 * was ported from onboarded meat centres as well as restaurants. Lampose does
 * not, so there is one voice and no branch to pick it with.
 *
 * `partnerType: 'food'` is still SENT — the backend's `food_restaurants`
 * carries that field with its own enum and other clients read it, so the
 * application says what it is rather than leaning on a server-side default.
 */
export const COPY = {
  infoTitle: 'Restaurant Information',
  infoIntro: 'Tell us about the restaurant to get started.',
  detailsTitle: 'Restaurant Details',
  businessLabel: 'Restaurant Name',
  businessPlaceholder: 'e.g. Paradise Biryani',
  categoryLabel: 'Cuisine / Food Category',
  categoryHelp: 'Select all that apply to this restaurant',
  operatingHelp: 'Add multiple time slots if the restaurant has break times.',
  logoHelp: 'Optional. The shop front, the sign, or the owner’s own logo — it is the picture a diner sees first. JPG or PNG, up to 10MB.',
  menuHelp: 'Optional. Add a few dishes now if the owner has their card to hand — the rest are added from the Food-Partner app after approval.',
  gstExemptLabel: 'This restaurant is exempt / Composition scheme',
  safetyTitle: 'Food Safety License',
  safetyUploadDescription: 'Upload a clear scan or photo of the FSSAI license',
  contractServiceText: 'the sale and delivery of food items',
  summaryLabel: 'Restaurant',
};

/** Every day open 09:00–22:00, which is the shape the timings editor edits. */
export const createDefaultDayTimeSlots = () =>
  DAYS.reduce((acc, day) => {
    acc[day] = [{ open: '09:00', close: '22:00' }];
    return acc;
  }, {});

/** The whole wizard, empty. One object so a reset is one assignment. */
export const INITIAL_RESTAURANT_STATE = {
  // Step 1 — restaurant
  restaurantName: '',
  cuisines: [],

  /* Step 1 — owner.
     No password: the account is created without one and the owner sets it
     before their first sign-in. Nobody in the room when this form is filled
     in should be choosing the owner's credential. */
  ownerName: '',
  ownerEmail: '',
  ownerPhone: '',
  primaryContact: '',
  sameAsOwner: true,

  // Step 1 — location
  gpsLat: '',
  gpsLng: '',
  mapLink: '',
  shopNo: '',
  floor: '',
  area: '',
  city: '',
  landmark: '',

  /* Step 2 — operations. The hours, and a menu the agent may skip: an empty
     list is submitted as no products at all, and the owner types their own
     from the Food-Partner app once the account is approved. */
  selectedDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  activeTimingDay: 'Monday',
  dayTimeSlots: createDefaultDayTimeSlots(),

  /* Step 2 — the shop's own picture, and the dishes. Both optional, both held
     as Files until submit uploads them: `logoFile` becomes `logoImage` on the
     restaurant and a dish's `photoFile` becomes its `productImage`. */
  logoFile: null,
  menuItems: [],

  /* Step 3 — tax and identity.
     Two scans are collected, the PAN card and the FSSAI certificate. The GST
     certificate and the cancelled cheque are recorded by NUMBER only — and the
     GSTIN is optional, because plenty of these kitchens have no registration
     to record. `validateRestaurant.js` has the reasoning. */
  panNumber: '',
  panFile: null,
  gstin: '',
  gstExempt: false,

  /* Step 3 — the owner's Aadhaar, and the mobile it is registered against.

     Seven fields for one question, because "is this number proven?" cannot be
     one boolean. `aadhaarToken` is the signed proof the backend issued and the
     only thing that actually convinces it — the booleans beside it exist to
     drive the screen. `aadhaarVerifiedPhone` records WHICH number was proven,
     so that editing the number after verifying it silently un-verifies it
     rather than carrying a proof for a handset nobody typed. */
  aadhaarNumber: '',
  aadhaarPhone: '',
  aadhaarOtp: '',
  aadhaarOtpSent: false,
  aadhaarVerified: false,
  aadhaarVerifiedPhone: '',
  aadhaarToken: '',

  // Step 3 — safety
  fssaiNumber: '',
  fssaiExpiry: '',
  fssaiFile: null,

  /* Asked for on the FSSAI step because that is the check they exist for —
     FoSCoS needs the state and district alongside the licence number — but
     SENT as `address.state` and `address.district`, which is the one place a
     state and a district live. See INDIAN_STATES for why one is a dropdown
     and the other is not. */
  fssaiCompanyName: '',
  state: '',
  district: '',

  /* Step 3 — payout. All of it OPTIONAL, and all-or-nothing: the backend
     accepts an application with no bank details at all (the first settlement
     is a week away) but refuses a HALF one, because an account number with no
     IFSC is money that cannot be sent. `validateRestaurant.js` enforces the
     same pair of rules so the two cannot disagree. */
  accountHolderName: '',
  bankAccount: '',
  bankConfirm: '',
  accountType: 'savings',
  ifsc: '',
  ifscFetched: false,

  // Step 4 — contract
  acceptedTos: false,
  signature: '',
};
