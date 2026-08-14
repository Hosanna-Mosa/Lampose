/* Shared chrome content — navigation and footer, used by every route. */

export const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Services', to: '/services' },
  { label: 'How It Works', to: '/how' },
  { label: 'Cities', to: '/cities' },
  { label: 'Partners', to: '/partners' },
  { label: 'Food', to: '/food' },
  { label: 'Download', to: '/download' },
  { label: 'Contact', to: '/contact' },
];

export const FOOTER_COLS = [
  {
    title: 'Product',
    links: [
      { label: 'Stay Booking', to: '/services' },
      { label: 'Food Ordering', to: '/food' },
      { label: 'Delivery', to: '/services' },
      { label: 'Complaints', to: '/contact' },
      { label: 'Pricing', to: '/partners' },
    ],
  },
  {
    title: 'Partners',
    links: [
      { label: 'Hostel Owners', to: '/partners' },
      { label: 'Restaurants', to: '/partners' },
      { label: 'Delivery Partners', to: '/partners' },
      { label: 'Partner Login', to: '/download' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', to: '/cities' },
      { label: 'Careers', href: '#top' },
      { label: 'Blog', href: '#top' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms and Conditions', to: '/terms' },
    ],
  },
  {
    title: 'Contact',
    links: [
      { label: 'hello@lampose.com', href: 'mailto:hello@lampose.com' },
      { label: '— 6302321942 —', href: 'tel:+916302321942' },
      { label: 'Visakhapatnam, AP', href: '#top' },
      { label: 'Send a Message', to: '/contact' },
    ],
  },
];

export const FOOTER_DESC =
  "India's all-in-one urban living platform. Find verified stays, order local "
  + 'food, get doorstep delivery, and raise support — one app, every city.';

export const SOCIALS = ['𝕏', 'in', '▶', '📸'];
