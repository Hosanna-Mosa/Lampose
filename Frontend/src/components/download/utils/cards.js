export const CARDS = [
  {
    key: 'user', icon: 'stay', iconBg: 'var(--green-t)',
    badge: 'Residents', badgeCls: 'dl-badge-user',
    title: 'The Lampose app',
    desc: 'Find a verified room, order from the kitchens around it, follow the '
        + 'rider to your door, and settle everything on one bill.',
    features: [
      'Browse rooms a scout has walked',
      'Mess plans, home kitchens and restaurants',
      'Live tracking from pickup to gate',
      'Vouchers and meal plans in one wallet',
      'QR check-in, and complaints that get answered',
    ],
    apkLabel: 'Android APK',
  },
  {
    key: 'partner', icon: 'chart', iconBg: 'var(--amber-t)', cardCls: 'dl-card-partner',
    badge: 'Owners & kitchens', badgeCls: 'dl-badge-partner',
    title: 'Lampose Partner',
    desc: 'Run your property or kitchen from one screen — requests, orders, '
        + 'menus, payouts and reviews, without a separate system for each.',
    features: [
      'Live bookings and orders as they arrive',
      'Daily payouts with the full history',
      'Tenants and customers with verified IDs',
      'Menus and subscription plans you control',
      'QR check-in and table reservations',
    ],
    apkLabel: 'Partner APK', popup: true,
  },
  {
    key: 'delivery', icon: 'delivery', iconBg: '#e8f2ec',
    badge: 'Riders', badgeCls: 'dl-badge-delivery',
    title: 'Lampose Rider',
    desc: 'Take the orders you want, follow a route worth riding, and watch the '
        + 'earnings add up through the day.',
    features: [
      'Orders pushed the moment they are ready',
      'Batched routes, less distance per drop',
      'Paid the same day, no minimum',
      'Weekly bonuses and a leaderboard',
      'Scan at the door to close the job',
    ],
    apkLabel: 'Rider APK',
  },
];
