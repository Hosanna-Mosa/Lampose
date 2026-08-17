/* ══════════════════════════════════════════════════════════════════════════
   Food partner content — the landing page and the onboarding flow.

   One partner type is a restaurant, the other a meat centre. They walk the
   same four steps and differ only in wording and in whether a menu is built,
   so the difference lives here as copy rather than as a second flow.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Landing ─────────────────────────────────────────────────────────────── */

export const STATS = [
  ['200+', 'Kitchens & messes listed'],
  ['8', 'Cities live today'],
  ['24 hrs', 'From signed to serving'],
  ['0%', 'Brokerage, ever'],
];

export const BENEFITS = [
  {
    icon: 'chart', title: 'Orders from your own street',
    desc: 'Your kitchen is shown to the residents already living within walking '
        + 'distance of it — the people most likely to order twice.',
  },
  {
    icon: 'wallet', title: 'Money on a fixed day',
    desc: 'Weekly settlements straight to the account you enter below, with '
        + 'every deduction itemised before it is taken.',
  },
  {
    icon: 'calendar', title: 'Monthly plans, steady income',
    desc: 'Run mess subscriptions alongside single orders, so part of next '
        + "month's revenue is known before it starts.",
  },
  {
    icon: 'users', title: 'A named person to call',
    desc: 'Someone from our team walks your kitchen during onboarding and stays '
        + 'your contact afterwards. Not a helpline.',
  },
];

export const HOW_STEPS = [
  {
    step: '01', title: 'Tell us about the kitchen',
    desc: 'Name, cuisines, owner details and the exact spot on the map. Ten '
        + 'minutes, and you can save it half-finished.',
  },
  {
    step: '02', title: 'Set hours and menu',
    desc: 'Opening hours per day, then your dishes — typed in one by one or '
        + 'uploaded as a spreadsheet we read for you.',
  },
  {
    step: '03', title: 'Documents and payouts',
    desc: 'PAN, GST, FSSAI and the bank account we should settle into. '
        + 'Uploaded once, verified by a person.',
  },
  {
    step: '04', title: 'Sign and go live',
    desc: 'Read the commercial terms, sign digitally, and we come back within '
        + '24 hours to switch you on.',
  },
];

export const FAQS = [
  {
    q: 'What documents do I need before I start?',
    a: 'PAN, your FSSAI licence, GST registration (unless you are exempt or on '
     + 'the composition scheme) and a cancelled cheque for the payout account.',
  },
  {
    q: 'How long does onboarding take?',
    a: 'The form takes about ten minutes. Once it is submitted, most partners '
     + 'are live within 24 hours of our team verifying the documents.',
  },
  {
    q: 'What does Lampose charge?',
    a: 'Commission starts at 15% per delivered order and is negotiable at '
     + 'volume. There is no listing fee and no joining fee — the full '
     + 'commercial terms are shown to you before you sign.',
  },
  {
    q: 'Can I run a mess subscription as well as single orders?',
    a: 'Yes. Monthly plans and one-off orders run side by side from the same '
     + 'dashboard, and you set the prices for both.',
  },
  {
    q: 'Am I locked in for a period?',
    a: 'No. Either side can end the agreement with 30 days notice, and you can '
     + 'pause your listing from the dashboard at any time.',
  },
];

/* ── Onboarding ──────────────────────────────────────────────────────────── */

export const STEPS = [
  { num: 1, label: 'Restaurant Information', icon: 'store' },
  { num: 2, label: 'Menu & Operational Details', icon: 'menu' },
  { num: 3, label: 'Documents & Legal', icon: 'doc' },
  { num: 4, label: 'Contract & Review', icon: 'contract' },
];

export const CUISINE_OPTIONS = [
  'North Indian', 'South Indian', 'Chinese', 'Italian', 'Bakery',
  'Fast Food', 'Street Food', 'Continental', 'Mexican', 'Japanese',
  'Thai', 'Healthy', 'Desserts', 'Beverages', 'Mughlai',
];

export const MEAT_CATEGORY_OPTIONS = [
  'Chicken', 'Mutton', 'Fish', 'Prawns', 'Eggs', 'Ready to Cook',
];

export const DAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/* The sheet reader accepts a few spellings of each of these, but this is the
   set every uploaded menu has to carry. */
export const MENU_COLUMNS = [
  'category', 'itemName', 'price', 'description', 'type', 'isBestseller',
];

export const MENU_TEMPLATE_FILE = '/menu_items_reference_template.xlsx';

/* Shown on the contract step. Read from one place so the terms a partner
   signs and the terms we quote on the landing page cannot drift apart. */
export const COMMERCIALS = [
  { label: 'Delivery commission', value: '15% per order, negotiable for high-volume partners' },
  { label: 'Platform fee', value: '₹3 per order, capped at ₹10 a month' },
  { label: 'Payment cycle', value: 'Weekly settlements — every Monday, for the week before' },
  { label: 'Cancellation policy', value: 'Free up to 5 minutes. Later cancellations are charged 10% of order value.' },
  { label: 'Promotional contribution', value: 'Optional. Shared cost on discounts and free-delivery campaigns.' },
];

/* Everything that changes between a restaurant and a meat centre. */
export const PARTNER_COPY = {
  food: {
    railTitle: 'Restaurant onboarding',
    infoTitle: 'Restaurant Information',
    infoIntro: 'Tell us about your restaurant to get started.',
    detailsTitle: 'Restaurant Details',
    businessLabel: 'Restaurant Name',
    businessPlaceholder: 'e.g. Paradise Biryani',
    categoryLabel: 'Cuisine / Food Category',
    categoryHelp: 'Select everything that applies to your restaurant',
    operatingHelp: 'Add a second slot if your kitchen closes between meals.',
    menuTitle: 'Menu Setup',
    menuHelp: "Set your restaurant's opening hours and add your menu items.",
    manualEmptyTitle: 'No menu items yet',
    manualEmptyHelp: 'Add your first category to start building the menu',
    manualCategoryHelp: 'Add categories (Starters, Main Course) and the items inside them',
    gstExemptLabel: 'My restaurant is exempt / on the composition scheme',
    safetyTitle: 'Food Safety Licence',
    safetyUploadDescription: 'A clear scan or photo of your FSSAI licence',
    contractServiceText: 'the sale and delivery of food items',
    summaryLabel: 'Restaurant',
    noun: 'restaurant',
  },
  meat: {
    railTitle: 'Meat centre onboarding',
    infoTitle: 'Meat Centre Information',
    infoIntro: 'Tell us about your meat centre to get started.',
    detailsTitle: 'Meat Centre Details',
    businessLabel: 'Meat Centre Name',
    businessPlaceholder: 'e.g. Fresh Cuts Meat Centre',
    categoryLabel: 'Meat Categories',
    categoryHelp: 'Select the product categories your centre stocks',
    operatingHelp: 'Add a second slot if your counter closes during the day.',
    menuTitle: 'Meat Product Setup',
    menuHelp: "Set your meat centre's opening hours.",
    manualEmptyTitle: 'No meat products yet',
    manualEmptyHelp: 'Add your first product category to start the list',
    manualCategoryHelp: 'Add categories (Chicken, Mutton, Fish) and the products inside them',
    gstExemptLabel: 'My meat centre is exempt / on the composition scheme',
    safetyTitle: 'FSSAI Licence',
    safetyUploadDescription: 'A clear scan or photo of your FSSAI licence',
    contractServiceText: 'the sale and delivery of meat products',
    summaryLabel: 'Meat Centre',
    noun: 'meat centre',
  },
};
