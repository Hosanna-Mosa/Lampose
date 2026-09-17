export const HEAD = {
  tag: 'How it works',
  title: 'Four steps,',
  em: 'search to dinner.',
  sub: 'Find the room, book it, scan in, eat. This is the whole thing — there is no fifth step.',
};

export const QR_HEAD = {
  tag: 'Smart features',
  title: 'One scan ties it',
  em: 'together.',
  sub: 'The same QR checks you in without paperwork, credits your food coupon, '
     + 'and later proves the rider reached the right door.',
};

export const CARDS = [
  {
    icon: 'qr', title: 'QR check-in',
    rows: [
      { k: 'Status', v: '✓ Verified', green: true },
      { k: 'Hostel', v: 'Sunrise PG, Vizag' },
      { k: 'Checked in', v: 'Today · 11:42 AM' },
      { k: 'Booking', v: '#BKG-20487' },
    ],
    note: '₹100 food credit added to your wallet',
  },
  {
    icon: 'delivery', title: 'Delivery verification',
    rows: [
      { k: 'Order', v: '#ORD-9812 · Biryani' },
      { k: 'Rider', v: 'Kiran · 0.4 km away' },
      { k: 'Drop', v: 'Sunrise PG · Room 204' },
      { k: 'Delivered', v: '✓ 12:09 PM', green: true },
    ],
  },
];
