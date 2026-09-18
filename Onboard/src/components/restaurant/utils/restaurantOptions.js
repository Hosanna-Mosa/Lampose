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
  { num: 2, label: 'Operational Details', sub: 'Opening hours' },
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
 * The commercial terms, shown on step 4 and sent with the contract.
 *
 * `commission` and `platformFee` are the two the backend stores as numbers on
 * `contract`, so they are declared here as numbers and rendered into the
 * sentences below rather than typed twice — a screen that promises 15% while
 * the document records 18 is the one disagreement in this form that ends up
 * in front of a lawyer.
 */
export const CONTRACT_COMMISSION = 15;
export const CONTRACT_PLATFORM_FEE = 3;

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

export const COMMERCIAL_TERMS = [
  {
    label: 'Delivery Commission',
    value: `${CONTRACT_COMMISSION}% per order (negotiable for high-volume partners)`,
  },
  {
    label: 'Platform Fee',
    value: `₹${CONTRACT_PLATFORM_FEE} per order (capped at ₹10/month)`,
  },
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
 * The refund side of the agreement, shown on step 3 and ticked there.
 *
 * Printed in full rather than linked or summarised in one line, because the
 * tick underneath it is the record that the owner was told: an acceptance of
 * something the screen never said is worth nothing to the person who has to
 * defend a deduction three months later. Four points, because that is what
 * actually takes money off a settlement — and the last of them is what makes
 * the tick a fair one to ask for, since a refund caused by a late rider is
 * not the kitchen's fault and this says so.
 */
export const REFUND_POLICY_POINTS = [
  {
    label: 'Cancellations',
    value: `Free for the first ${CANCELLATION_GRACE_MINUTES} minutes after an order is placed. A cancellation by the restaurant after that is charged ${LATE_CANCELLATION_PERCENT}% of the order value.`,
  },
  {
    label: 'Wrong or missing items',
    value: 'Refunded to the customer in full and deducted from the restaurant\'s weekly settlement.',
  },
  {
    label: 'Quality complaints',
    value: 'Investigated case by case. A complaint that is upheld is refunded from the settlement; one that is not costs the restaurant nothing.',
  },
  {
    label: 'Late delivery',
    value: 'A refund caused by a rider or by the platform is borne by Lampose, never by the restaurant.',
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
  gstExemptLabel: 'This restaurant is exempt / Composition scheme',
  refundTitle: 'Refund & Cancellation Policy',
  refundIntro: 'Read this to the owner before ticking the box.',
  refundAcceptLabel: 'The owner accepts the refund and cancellation policy.',
  refundAcceptHelp: 'Refunds upheld under this policy come out of the weekly settlement — they are not invoiced separately.',
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

  /* Step 2 — operations. Hours only: the menu is added by the restaurant
     from the Food-Partner app once an admin approves the account. */
  selectedDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  activeTimingDay: 'Monday',
  dayTimeSlots: createDefaultDayTimeSlots(),

  /* Step 3 — tax and identity.
     Two scans are collected, the PAN card and the FSSAI certificate. The GST
     certificate and the cancelled cheque are recorded by NUMBER only — and the
     GSTIN is optional, because plenty of these kitchens have no registration
     to record. `validateRestaurant.js` has the reasoning. */
  panNumber: '',
  panFile: null,
  gstin: '',
  gstExempt: false,

  /* Step 3 — the refund and cancellation policy.
     Its own acceptance, deliberately not folded into `acceptedTos` on step 4:
     that one is the whole merchant agreement signed by name at the end, and
     this is the single rule that takes money off a settlement, ticked on the
     screen that prints it while the owner is still in the room. One tick
     covering both would make it impossible to say which was actually read. */
  refundPolicyAccepted: false,

  // Step 3 — safety
  fssaiNumber: '',
  fssaiExpiry: '',
  fssaiFile: null,

  // Step 3 — payout
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
