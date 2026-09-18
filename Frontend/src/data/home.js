/* Home page content. */

export const HERO_BADGE = 'Verified stays · Kitchens next door';

/* The last line renders in green, so it carries the point. */
export const HERO_LINES = ['Verified stays.', 'Local kitchens.', 'One app for both.'];

export const HERO_SUB =
  "Every room is walked and checked by a person before it's listed, and every "
  + 'kitchen we list is a short walk from it. Book the bed, order the meal, track '
  + 'the rider — one bill, zero brokerage.';

export const TOASTS = [
  "Arjun just booked a PG in Vizag's MVP Colony 🏠",
  'Pesarattu order placed · 18 min ETA 🍱',
  'Ravi completed a delivery in Vijayawada 🛵',
  'Priya listed a new hostel in Hyderabad 🏘️',
  'Complaint #CPL-1048 resolved in 2 hrs ✅',
  'Kiran checked in via QR at Sunrise PG 📱',
  '₹100 food coupon credited after check-in 🎁',
  'New subscription mess joined in Guntur 🍽️',
  'Suresh earned ₹840 delivering today in Vizag 🛵',
];

/* Row one states the promises; row two states where and how we operate. Both
   are claims a visitor can check, not slogans. */
export const TICKER_FWD = [
  'Every room walked in person',
  'Zero brokerage, always',
  'Kitchens within walking distance',
  'One bill for room and meals',
  'Live tracking on every order',
  'QR check-in earns a food coupon',
  'No stock photos, ever',
  'Support from 6am to midnight',
];

export const TICKER_REV = [
  'Visakhapatnam', 'Vijayawada', 'Guntur', 'Amaravati', 'Tirupati',
  'Kakinada', 'Instant UPI payouts', 'Meal subscriptions', 'Smart route tracking',
];

/* Each label says what the number actually counts. "% Satisfaction" under a
   figure reading "98+" was both ungrammatical and wrong — hence per-stat
   suffixes. */
export const STATS = [
  { target: 10000, suffix: '+', pct: 80, ring: '10K', label: 'Residents on Lampose' },
  { target: 500,   suffix: '+', pct: 65, ring: '500', label: 'Rooms verified in person' },
  { target: 200,   suffix: '+', pct: 55, ring: '200', label: 'Kitchens & messes listed' },
  { target: 5000,  suffix: '+', pct: 90, ring: '5K',  label: 'Orders delivered' },
  { target: 98,    suffix: '%', pct: 98, ring: '98%', label: 'Would book again' },
  { target: 8,     suffix: '',  pct: 40, ring: '8',   label: 'Cities live today' },
];

/*
 * The deck at the foot of the home page.
 *
 * `href`, not `to`. These used to be three routes; two of them are now
 * sections of the page the deck sits on, so a router link would re-render the
 * page somebody is already reading in order to land them a screen above.
 * An anchor scrolls, which is what the card promises.
 *
 * The third card was Our Cities, and it went with its page. Two cards rather
 * than an invented third: the deck is a shortcut back to what the page
 * already said, and there is no third thing it said.
 */
export const SERVICES = [
  {
    href: '#services', no: '01', color: '#17803d', icon: 'grid',
    iconBg: '#e9f5ed', iconHover: '#d3ecdd',
    title: 'Services', cta: 'See all services',
    body: 'Verified stays, mess and home-kitchen food, and tracked delivery — '
        + 'the three things Lampose actually runs.',
  },
  {
    href: '#how', no: '02', color: '#b8860b', icon: 'steps',
    iconBg: '#fff8e6', iconHover: '#ffeeb8',
    title: 'How It Works', cta: 'See the steps',
    body: 'Search, book, check in with a QR, then order your first meal — the '
        + 'whole flow in four steps.',
  },
];
