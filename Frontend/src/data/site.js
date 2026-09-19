/* Shared chrome content — navigation and footer, used by every route. */

/*
 * Six links, down from ten.
 *
 * Services and How It Works are sections of the home page now, so they are
 * not routes to navigate to — anybody who lands on Home scrolls past both,
 * which is the whole reason they were moved. Cities and Download are gone
 * from the site.
 *
 * A bar listing ten destinations is a bar nobody reads, and half of these
 * pointed at pages that repeated what the home page already said.
 *
 * Order Food is the exception that came back, as a destination rather than a
 * description: it is a place a student goes to do something, which is what
 * earns a slot in a bar this short. It sits beside Explore because those two
 * are the only links here a diner or a tenant uses; the rest are for owners
 * and restaurants.
 */
export const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Explore', to: '/explore' },
  { label: 'Order Food', to: '/food' },
  { label: 'Partners', to: '/partners' },
  { label: 'Food Partner', to: '/food-partner' },
  { label: 'Contact', to: '/contact' },
];

export const FOOTER_COLS = [
  {
    title: 'Product',
    links: [
      /* The three things Lampose runs are one section of the home page, so
         all three point at it rather than at three pages that no longer
         exist. */
      { label: 'Stay Booking', to: '/#services' },
      { label: 'Food Ordering', to: '/food' },
      { label: 'Delivery', to: '/#services' },
      { label: 'Complaints', to: '/contact' },
      { label: 'Pricing', to: '/partners' },
    ],
  },
  {
    title: 'Partners',
    links: [
      { label: 'Hostel Owners', to: '/partners' },
      { label: 'Restaurants', to: '/food-partner' },
      { label: 'Delivery Partners', to: '/partners' },
      /* There is no download page any more, and the apps are not linked from
         the site yet. Partners are onboarded by talking to us. */
      { label: 'Partner Login', to: '/contact' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', to: '/contact' },
      { label: 'Careers', href: '#top' },
      { label: 'Blog', href: '#top' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms and Conditions', to: '/terms' },
      { label: 'Child Safety', to: '/child-safety' },
      /* Linked rather than only routed: a Play reviewer checking that account
         deletion is reachable from the web looks for a way to GET there, not
         just for a URL that answers. */
      { label: 'Delete Account', to: '/delete-account' },
    ],
  },
  {
    title: 'Contact',
    links: [
      { label: 'contact@lampose.com', href: 'mailto:contact@lampose.com' },
      // { label: '— 6302321942 —', href: 'tel:+916302321942' },
      { label: 'Visakhapatnam, AP', href: '#top' },
      { label: 'Hyderabad, TS', href: '#top' },
      { label: 'Send a Message', to: '/contact' },
    ],
  },
];

export const FOOTER_DESC =
  "India's all-in-one urban living platform. Find verified stays, order local "
  + 'food, get doorstep delivery, and raise support — one app, every city.';

export const SOCIALS = ['𝕏', 'in', '▶', '📸'];
