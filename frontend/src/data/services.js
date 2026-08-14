/* Services page content.
   Rewritten to say what each thing concretely is, rather than naming the
   category and leaving the visitor to infer it. Same meaning, stated plainly. */

export const HEAD = {
  tag: 'What we offer',
  title: 'Three things,',
  em: 'done properly.',
  sub: 'A room that a person actually checked, food from kitchens near it, and a '
     + 'rider who tells you where they are. Tap a card to see how it works.',
};

export const CARDS = [
  {
    key: 'stay', color: '#17803d', icon: 'stay',
    iconBg: '#e9f5ed', iconHover: '#d3ecdd',
    title: 'Stay Booking', cta: 'How booking works',
    body: 'Hostels, PGs, co-living and bachelor flats — each one walked, '
        + 'photographed and signed off before it is listed. Book in the app, pay '
        + 'no brokerage, deal with nobody in between.',
  },
  {
    key: 'food', color: '#b8860b', icon: 'food',
    iconBg: '#fff8e6', iconHover: '#ffeeb8',
    title: 'Food Ordering', cta: 'How ordering works',
    body: 'A monthly mess plan, a single thali today, or a restaurant order at '
        + 'eleven at night. The kitchens sit near your stay, so the food arrives '
        + 'hot and the walk is short.',
  },
  {
    key: 'delivery', color: '#101312', icon: 'delivery',
    iconBg: '#eef0f3', iconHover: '#e2e5ea',
    title: 'Delivery Services', cta: 'How tracking works',
    body: 'You see the rider on the map from the moment the kitchen accepts. '
        + 'Every rider is vetted, and a scan at the door records exactly when it '
        + 'arrived.',
  },
];

export const PANELS = {
  stay: {
    icon: 'stay', title: 'Stay Booking',
    sub: 'Every listing is walked by a scout, photographed the same day, and signed off before it appears.',
    gridLabel: 'What you can book',
    items: [
      { icon: 'stay', h: 'Hostels & PGs', p: 'Long-stay beds with live availability, built around students and people who have just moved for work.' },
      { icon: 'grid', h: 'Hotels & resorts', p: 'Short stays for a night or a fortnight, and weekend places for when you want to leave the city.' },
      { icon: 'users', h: 'Co-living & bachelor', p: 'Shared homes and single rooms, filtered to what is genuinely near your office or campus.' },
      { icon: 'filters', h: 'Filters that matter', p: 'Budget, gender, Wi-Fi, AC, meals included, minutes on foot — not a wall of tick-boxes.' },
      { icon: 'track', h: 'Search around a pin', p: 'Drop a pin anywhere and see only what is actually within walking distance of it.' },
      { icon: 'qr', h: 'QR check-in', p: 'Scan the code at reception to check in without paperwork, and a food coupon lands in your wallet.' },
    ],
    flowLabel: 'From search to keys',
    flow: ['Search & shortlist', 'Send a request', 'Owner accepts', 'Scan to check in', 'Pay & review'],
    note: 'If a scout cannot sign the report, the room does not go on Lampose. That is the whole rule.',
    cta: 'Browse stays',
  },
  food: {
    icon: 'food', title: 'Food Ordering',
    sub: 'Mess kitchens, home cooks and restaurants — all within walking distance of the stays we list.',
    gridLabel: 'Ways to eat',
    items: [
      { icon: 'calendar', h: 'Monthly mess plans', p: 'Veg, non-veg or a mix, with fixed timings and a dashboard showing exactly how many meals are left.' },
      { icon: 'food', h: 'One meal at a time', p: 'No subscription needed. Browse today’s mess menu, add a plate, pay online or at the door.' },
      { icon: 'stay', h: 'Home kitchens', p: 'Tiffins and regional cooking from people cooking out of their own homes near your stay.' },
      { icon: 'orders', h: 'Restaurants', p: 'Full menus with live order status, from a ₹60 tiffin to a full biryani at eleven at night.' },
      { icon: 'users', h: 'Dine-in booking', p: 'Reserve a table, show the code on arrival, and use dine-in-only offers while you are there.' },
      { icon: 'tag', h: 'Offers that apply themselves', p: 'First-order discounts, festival offers and referral credit come off at checkout without a code.' },
    ],
    flowLabel: 'From cart to door',
    flow: ['Add to cart', 'Pay or pick COD', 'Kitchen accepts', 'Rider assigned', 'Delivered'],
    note: 'Checked in with a QR at your hostel? The ₹100 coupon is already on your next order.',
    cta: 'See today’s menus',
  },
  delivery: {
    icon: 'delivery', title: 'Delivery Services',
    sub: 'Vetted riders, a live map and a scan at the door — so nobody has to ring you asking where you are.',
    gridLabel: 'What you get',
    items: [
      { icon: 'track', h: 'Live on the map', p: 'Watch the rider move from the kitchen to your gate, with an ETA that updates as they go.' },
      { icon: 'route', h: 'Nearest rider, automatically', p: 'The moment a kitchen accepts, the closest free rider is assigned — no dispatcher, no delay.' },
      { icon: 'orders', h: 'Pickup confirmed', p: 'The rider confirms collection at the kitchen, so the status changes the second the food is in the bag.' },
      { icon: 'qr', h: 'Scan at the door', p: 'An optional scan at your hostel records the right drop point and the exact minute it arrived.' },
      { icon: 'verified', h: 'Riders we have checked', p: 'Every delivery partner is verified before their first order, so the person at your door is known to us.' },
      { icon: 'chart', h: 'Watched end to end', p: 'Location, delivery time and payment status are monitored on every order, not sampled.' },
    ],
    flowLabel: 'Order status, start to finish',
    flow: ['Order placed', 'Rider assigned', 'Picked up', 'On the way', 'Delivered'],
    note: 'Track any live order down to the minute — kitchen, road, doorstep.',
    cta: 'Track an order',
  },
};

export const FEAT_HEAD = {
  tag: 'Features',
  title: 'Different people,',
  em: 'different app.',
  sub: 'What Lampose gives you depends on which side of it you are on. Pick yours.',
};

export const TABS = [
  { key: 'user', label: 'Residents' },
  { key: 'hostel', label: 'Property owners' },
  { key: 'food', label: 'Kitchens' },
  { key: 'delivery', label: 'Riders' },
];

export const TAB_FEATURES = {
  user: [
    { icon: 'search', h: 'Search that narrows', p: 'Budget, area, Wi-Fi, AC, meals included — filter down to the handful of rooms that actually fit.' },
    { icon: 'verified', h: 'Nothing unverified', p: 'A person stood in every room on this app. No stock photos, no listings that quietly vanished.' },
    { icon: 'calendar', h: 'Meals sorted monthly', p: 'Subscribe to a nearby kitchen once and stop deciding what to eat every single day.' },
    { icon: 'track', h: 'Know where it is', p: 'Live GPS on the rider from pickup to your gate, with an ETA that keeps up.' },
    { icon: 'bell', h: 'Told, not guessed', p: 'Booking confirmed, order accepted, rider close by — the phone tells you before you check.' },
    { icon: 'tag', h: 'Discounts that apply', p: 'Student rates, referral credit and check-in coupons come off automatically at checkout.' },
  ],
  hostel: [
    { icon: 'chart', h: 'Occupancy at a glance', p: 'Bookings, revenue, empty beds and reviews on one screen instead of four notebooks.' },
    { icon: 'users', h: 'Tenants who show up', p: 'Reach thousands of people already searching for a room in your city this week.' },
    { icon: 'wallet', h: 'Paid within a day', p: 'Money reaches your account within 24 hours of check-in, not on a monthly cycle.' },
    { icon: 'megaphone', h: 'Promote without paying', p: 'Run an offer or get featured on the home page at no cost while you are filling up.' },
  ],
  food: [
    { icon: 'reach', h: 'A street full of customers', p: 'Serve every Lampose resident within walking distance, with nothing to set up.' },
    { icon: 'orders', h: 'One screen for orders', p: 'Accept, cook, dispatch. The whole queue in one place, on a phone or a laptop.' },
    { icon: 'calendar', h: 'Guaranteed monthly income', p: 'Offer subscription plans and know what you are cooking, and earning, before the month starts.' },
    { icon: 'card', h: 'Settled daily by UPI', p: 'Your takings land in your bank every day, itemised, with nothing to chase.' },
  ],
  delivery: [
    { icon: 'rupee', h: 'Paid the same day', p: 'Each day’s earnings reach you that day. No week-long hold, no minimum payout.' },
    { icon: 'clock', h: 'Your hours', p: 'Mornings only, evenings only, weekends only — you decide when you are online.' },
    { icon: 'trophy', h: 'Bonuses on top', p: 'Weekly incentives for consistent riders, plus referral income for anyone you bring on.' },
    { icon: 'route', h: 'Routes that make sense', p: 'Batched, ordered drops so you cover less road and finish more deliveries a shift.' },
  ],
};
