/* ══════════════════════════════════════════════════════════════════════════
   MOCK FOOD CATALOGUE — the whole food surface runs on this file.

   Nothing here is fetched. The ordering pages were designed and built ahead
   of the API being wired up, so every kitchen, dish, coupon, address and past
   order below is a fixture written by hand. The shapes deliberately match
   what the backend already stores (`food_restaurants`, `food_products`,
   `food_orders`) so that swapping this module for `foodApi` is a change of
   source, not a change of every component:

     • a kitchen is a restaurant row plus the two figures the card shows
     • `diet` is 'veg' | 'egg' | 'nonveg', the same three the apps use
     • an order carries the KITCHEN's `status` and the RIDER's `dispatch`
       state side by side, because an order is cooked and looked for at the
       same time and the tracking page draws both

   Money is whole rupees everywhere — no paise, no floats to round.
   ══════════════════════════════════════════════════════════════════════════ */

export const rupees = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/* "1:28 pm" from minutes past midnight — the one clock formatter for food. */
export const clockLabel = minute => {
  const wrapped = ((Math.round(minute) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  const suffix = hour24 < 12 ? 'am' : 'pm';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minutes === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

/* Ready-by, from the clock in the visitor's own browser plus the kitchen's
   prep time. Recomputed on render rather than baked in, so a fixture opened
   at midnight does not promise lunch. */
export const readyLabel = prepMinutes => {
  const now = new Date();
  return clockLabel(now.getHours() * 60 + now.getMinutes() + prepMinutes);
};

export const DIET_LABEL = { veg: 'Veg', egg: 'Contains egg', nonveg: 'Non-veg' };

/* Veg-only hides DISHES. Pure-veg mode additionally hides kitchens that cook
   anything else — two different questions, which is why the feed keeps them
   as two states of one control rather than one checkbox. */
export const dietAllowed = (diet, mode) => {
  if (mode === 'off') return true;
  return diet === 'veg';
};

export const CUISINES = [
  'Thali & meals', 'Biryani', 'Tiffins', 'Rolls & shawarma', 'Chinese', 'Chai & snacks', 'Desserts',
];

/* The student's own area. Everything that says "near you" says it about this. */
export const AREA = { locality: 'Gachibowli', city: 'Hyderabad', openFrom: '7 am', openTo: '11 pm' };

/* ── Kitchens ────────────────────────────────────────────────────────────
   `openNow` is the kitchen's own answer, not something derived from a clock
   here: a closed kitchen still lists, still opens, and still takes a
   pre-order — it just cannot be ordered from right now. */
export const KITCHENS = [
  {
    id: 'annapurna-mess',
    name: 'Annapurna Mess',
    cuisine: 'South Indian · Thali',
    cuisineTypes: ['Thali & meals', 'Tiffins'],
    tagline: 'Home-style meals cooked twice a day',
    landmark: 'Beside Vignan college gate',
    walkMinutes: 12,
    costForOne: 120,
    rating: 4.5,
    ratingCount: 312,
    deliveryFee: 19,
    packagingCharge: 10,
    minOrder: 99,
    prepMinutes: 18,
    deliveryMinutes: 28,
    deliveryWindow: '25–30 min',
    pureVeg: true,
    openNow: true,
    hours: 'Open 7:00 am – 11:00 pm, all days',
    closesAt: '11 pm',
    fssai: '13624011000456',
    tone: 'stone',
    offer: '₹20 off over ₹149',
    sections: ['Recommended', 'Meals & thali', 'Tiffins', 'Curries', 'Rice bowls', 'Sweets', 'Drinks'],
  },
  {
    id: 'hotel-sitara',
    name: 'Hotel Sitara',
    cuisine: 'Andhra · Biryani',
    cuisineTypes: ['Biryani', 'Thali & meals'],
    tagline: 'Dum biryani from a 40-year-old counter',
    landmark: 'Opp. DLF flyover',
    walkMinutes: 18,
    costForOne: 220,
    rating: 4.3,
    ratingCount: 1204,
    deliveryFee: 25,
    packagingCharge: 15,
    minOrder: 149,
    prepMinutes: 26,
    deliveryMinutes: 38,
    deliveryWindow: '30–40 min',
    pureVeg: false,
    openNow: true,
    hours: 'Open 11:00 am – 11:30 pm, all days',
    closesAt: '11:30 pm',
    fssai: '13618022000871',
    tone: 'clay',
    offer: null,
    sections: ['Recommended', 'Biryani', 'Starters', 'Curries', 'Breads', 'Drinks'],
  },
  {
    id: 'ziyas-kebab-corner',
    name: 'Ziya’s Kebab Corner',
    cuisine: 'Hyderabadi · Kebabs',
    cuisineTypes: ['Rolls & shawarma'],
    tagline: 'Charcoal grill, opens with the evening',
    landmark: 'Lane 3, Kondapur road',
    walkMinutes: 9,
    costForOne: 180,
    rating: 4.1,
    ratingCount: 486,
    deliveryFee: 19,
    packagingCharge: 12,
    minOrder: 120,
    prepMinutes: 22,
    deliveryMinutes: 34,
    deliveryWindow: '30–35 min',
    pureVeg: false,
    openNow: false,
    opensAt: '5 pm',
    hours: 'Open 5:00 pm – 1:00 am, all days',
    closesAt: '1 am',
    fssai: '13620031000233',
    tone: 'stone',
    offer: null,
    sections: ['Recommended', 'Kebabs', 'Rolls', 'Biryani', 'Drinks'],
  },
  {
    id: 'green-leaf-tiffins',
    name: 'Green Leaf Tiffins',
    cuisine: 'Tiffins · Idli, dosa',
    cuisineTypes: ['Tiffins', 'Chai & snacks'],
    tagline: 'Batter ground every morning at four',
    landmark: 'Near Indira Nagar bus stop',
    walkMinutes: 6,
    costForOne: 90,
    rating: 4.6,
    ratingCount: 907,
    deliveryFee: 0,
    packagingCharge: 8,
    minOrder: 79,
    prepMinutes: 12,
    deliveryMinutes: 22,
    deliveryWindow: '20–25 min',
    pureVeg: true,
    openNow: true,
    hours: 'Open 6:30 am – 10:00 pm, all days',
    closesAt: '10 pm',
    fssai: '13611044000109',
    tone: 'sage',
    offer: 'Free delivery today',
    sections: ['Recommended', 'Tiffins', 'Dosa', 'Chutneys & sides', 'Drinks'],
  },
  {
    id: 'rolls-and-bowls',
    name: 'Rolls & Bowls',
    cuisine: 'Rolls · Shawarma',
    cuisineTypes: ['Rolls & shawarma', 'Chinese'],
    tagline: 'Late-night counter by the Aparna gate',
    landmark: 'Beside Aparna gate',
    walkMinutes: 4,
    costForOne: 140,
    rating: 4.2,
    ratingCount: 233,
    deliveryFee: 15,
    packagingCharge: 10,
    minOrder: 99,
    prepMinutes: 14,
    deliveryMinutes: 24,
    deliveryWindow: '15–20 min',
    pureVeg: false,
    openNow: true,
    hours: 'Open 12:00 pm – 2:00 am, all days',
    closesAt: '2 am',
    fssai: '13629055000642',
    tone: 'sand',
    offer: null,
    sections: ['Recommended', 'Rolls', 'Shawarma', 'Bowls', 'Drinks'],
  },
  {
    id: 'chai-point-corner',
    name: 'Chai Point Corner',
    cuisine: 'Chai · Snacks',
    cuisineTypes: ['Chai & snacks', 'Desserts'],
    tagline: 'Two minutes from the library steps',
    landmark: 'Inside campus lane',
    walkMinutes: 2,
    costForOne: 60,
    rating: 4.4,
    ratingCount: 1540,
    deliveryFee: 12,
    packagingCharge: 5,
    minOrder: 49,
    prepMinutes: 8,
    deliveryMinutes: 16,
    deliveryWindow: '10–15 min',
    pureVeg: true,
    openNow: true,
    hours: 'Open 6:30 am – 12:30 am, all days',
    closesAt: '12:30 am',
    fssai: '13617066000318',
    tone: 'lilac',
    offer: null,
    sections: ['Recommended', 'Chai & coffee', 'Snacks', 'Desserts'],
  },
];

/* ── Dishes ──────────────────────────────────────────────────────────────
   `addOns` and `spiceFixed` are what the dish sheet asks about; a dish with
   neither opens the sheet all the same, because the note and the quantity
   are always worth asking for. */
export const DISHES = [
  /* Annapurna Mess */
  {
    id: 'am-thali', kitchenId: 'annapurna-mess', name: 'Full meals thali', price: 110, diet: 'veg',
    section: 'Meals & thali', recommended: true, bestseller: true, rating: 4.6, ratingCount: 188,
    serves: 'Serves 1 · about 650 g', ordersInBlock: 64, tone: 'stone',
    description: 'Unlimited rice, two curries of the day, sambar, rasam, curd, pickle and a sweet. Served on a steel plate at the counter; packed into three boxes for delivery.',
    allergens: ['Dairy'],
    addOns: [
      { id: 'curd', label: 'Extra curd', price: 10 },
      { id: 'ghee', label: 'Ghee spoon', price: 15 },
      { id: 'papad', label: 'Papad (2)', price: 12 },
      { id: 'bobbatlu', label: 'Bobbatlu (1)', price: 30, soldOut: true },
    ],
  },
  {
    id: 'am-podi-idli', kitchenId: 'annapurna-mess', name: 'Ghee podi idli (4 pieces)', price: 70, diet: 'veg',
    section: 'Tiffins', recommended: true, rating: 4.4, ratingCount: 96, serves: 'Serves 1 · about 320 g', tone: 'sage',
    description: 'Soft idlis tossed in home-ground gunpowder and warm ghee, with coconut chutney on the side.',
    allergens: ['Dairy'],
    addOns: [{ id: 'chutney', label: 'Extra chutney', price: 10 }],
  },
  {
    id: 'am-gongura', kitchenId: 'annapurna-mess', name: 'Gongura pappu with rice', price: 95, diet: 'veg',
    section: 'Curries', recommended: true, rating: 4.5, ratingCount: 74, serves: 'Serves 1 · about 450 g',
    spiceFixed: true, tone: 'stone',
    description: 'Sorrel-leaf dal cooked the Andhra way, with a spoon of ghee, steamed rice and raw onion.',
  },
  {
    id: 'am-ragi', kitchenId: 'annapurna-mess', name: 'Ragi sangati with natu kodi pulusu', price: 160, diet: 'nonveg',
    section: 'Meals & thali', recommended: true, soldOut: true, soldOutNote: 'Back tomorrow at 7 pm', tone: 'stone',
    description: 'Finger-millet mudda with a thin country-style stew. Cooked in one batch each evening.',
  },
  {
    id: 'am-curd-rice', kitchenId: 'annapurna-mess', name: 'Curd rice with pickle', price: 60, diet: 'veg',
    section: 'Rice bowls', recommended: true, rating: 4.7, ratingCount: 142, serves: 'Serves 1 · about 300 g', tone: 'blush',
    description: 'Set curd folded through soft rice with curry leaf tempering. The 11 pm order this hostel lives on.',
    allergens: ['Dairy'],
  },
  {
    id: 'am-mini-meals', kitchenId: 'annapurna-mess', name: 'Mini meals (no sweet)', price: 85, diet: 'veg',
    section: 'Meals & thali', recommended: true, serves: 'Serves 1 · about 420 g', tone: 'stone',
    description: 'Rice, one curry, sambar, curd and pickle. The lunch most students take between classes.',
  },
  {
    id: 'am-festival', kitchenId: 'annapurna-mess', name: 'Festival special thali', price: 180, diet: 'veg',
    section: 'Meals & thali', serves: 'Serves 1 · about 800 g', tone: 'sand',
    description: 'Nine items with pulihora, bobbatlu and payasam. Available Sundays and festival days only.',
  },
  {
    id: 'am-buttermilk', kitchenId: 'annapurna-mess', name: 'Buttermilk (300 ml)', price: 25, diet: 'veg',
    section: 'Drinks', goesWellWith: true, tone: 'sage', description: 'Salted, with curry leaf and ginger.',
  },
  {
    id: 'am-meetha', kitchenId: 'annapurna-mess', name: 'Double ka meetha', price: 45, diet: 'veg',
    section: 'Sweets', goesWellWith: true, tone: 'sand', description: 'Bread soaked in saffron milk, served warm.',
  },
  {
    id: 'am-papad', kitchenId: 'annapurna-mess', name: 'Papad (2)', price: 12, diet: 'veg',
    section: 'Sweets', goesWellWith: true, tone: 'stone', description: 'Fried to order.',
  },

  /* Hotel Sitara */
  {
    id: 'hs-chicken-biryani', kitchenId: 'hotel-sitara', name: 'Chicken dum biryani', price: 190, diet: 'nonveg',
    section: 'Biryani', recommended: true, bestseller: true, rating: 4.4, ratingCount: 902,
    serves: 'Serves 1 · about 600 g', ordersInBlock: 51, tone: 'clay',
    description: 'Sealed and cooked on dum with long-grain rice, bone-in chicken, mirchi ka salan and raita.',
    addOns: [
      { id: 'raita', label: 'Extra raita', price: 20 },
      { id: 'salan', label: 'Extra salan', price: 25 },
      { id: 'leg', label: 'Extra leg piece', price: 60 },
    ],
  },
  {
    id: 'hs-veg-biryani', kitchenId: 'hotel-sitara', name: 'Vegetable dum biryani', price: 150, diet: 'veg',
    section: 'Biryani', recommended: true, rating: 4.1, ratingCount: 219, serves: 'Serves 1 · about 550 g', tone: 'sage',
    description: 'The same dum pot, with seasonal vegetables and fried onion.',
  },
  {
    id: 'hs-chicken-65', kitchenId: 'hotel-sitara', name: 'Chicken 65', price: 170, diet: 'nonveg',
    section: 'Starters', recommended: true, rating: 4.3, ratingCount: 380, serves: 'Serves 1 · 8 pieces', tone: 'clay',
    description: 'Boneless, curry-leaf tempered, hot enough to need the raita.',
  },
  {
    id: 'hs-egg-curry', kitchenId: 'hotel-sitara', name: 'Egg curry with rice', price: 120, diet: 'egg',
    section: 'Curries', rating: 4.0, ratingCount: 88, serves: 'Serves 1 · 2 eggs', tone: 'sand',
    description: 'Two boiled eggs in a thin onion-tomato gravy with steamed rice.',
  },

  /* Ziya’s Kebab Corner */
  {
    id: 'zk-seekh', kitchenId: 'ziyas-kebab-corner', name: 'Mutton seekh kebab (4)', price: 210, diet: 'nonveg',
    section: 'Kebabs', recommended: true, bestseller: true, rating: 4.4, ratingCount: 260, tone: 'clay',
    description: 'Minced mutton on the charcoal grill, with onion and lime.',
  },
  {
    id: 'zk-paneer-tikka', kitchenId: 'ziyas-kebab-corner', name: 'Paneer tikka (6)', price: 180, diet: 'veg',
    section: 'Kebabs', recommended: true, rating: 4.2, ratingCount: 140, tone: 'sand',
    description: 'Thick cubes marinated overnight in curd and ajwain.',
  },

  /* Green Leaf Tiffins */
  {
    id: 'gl-podi-idli', kitchenId: 'green-leaf-tiffins', name: 'Ghee podi idli (4)', price: 70, diet: 'veg',
    section: 'Tiffins', recommended: true, bestseller: true, rating: 4.6, ratingCount: 410,
    serves: 'Serves 1 · about 320 g', ordersInBlock: 47, tone: 'sage',
    description: 'The tiffin this hostel wakes up for. Gunpowder, ghee and coconut chutney.',
    addOns: [{ id: 'chutney', label: 'Extra chutney', price: 10 }, { id: 'sambar', label: 'Extra sambar', price: 15 }],
  },
  {
    id: 'gl-masala-dosa', kitchenId: 'green-leaf-tiffins', name: 'Masala dosa', price: 80, diet: 'veg',
    section: 'Dosa', recommended: true, rating: 4.5, ratingCount: 366, serves: 'Serves 1', tone: 'sand',
    description: 'Crisp all the way to the middle, with potato masala, chutney and sambar.',
  },
  {
    id: 'gl-filter-coffee', kitchenId: 'green-leaf-tiffins', name: 'Filter coffee', price: 30, diet: 'veg',
    section: 'Drinks', recommended: true, goesWellWith: true, tone: 'clay',
    description: 'Decoction from the morning’s brew, in a steel tumbler.',
  },

  /* Rolls & Bowls */
  {
    id: 'rb-egg-chicken-roll', kitchenId: 'rolls-and-bowls', name: 'Egg chicken roll', price: 120, diet: 'egg',
    section: 'Rolls', recommended: true, bestseller: true, rating: 4.3, ratingCount: 190,
    ordersInBlock: 39, tone: 'sand',
    description: 'Egg-coated paratha, chicken tikka, onion and green chutney.',
    addOns: [{ id: 'cheese', label: 'Cheese slice', price: 25 }, { id: 'double', label: 'Double filling', price: 55 }],
  },
  {
    id: 'rb-paneer-roll', kitchenId: 'rolls-and-bowls', name: 'Paneer kathi roll', price: 110, diet: 'veg',
    section: 'Rolls', recommended: true, rating: 4.1, ratingCount: 122, tone: 'sage',
    description: 'Paneer, capsicum and onion in a flaky paratha.',
  },
  {
    id: 'rb-shawarma', kitchenId: 'rolls-and-bowls', name: 'Chicken shawarma', price: 130, diet: 'nonveg',
    section: 'Shawarma', recommended: true, rating: 4.2, ratingCount: 205, tone: 'clay',
    description: 'From the vertical grill, with garlic sauce and pickle.',
  },

  /* Chai Point Corner */
  {
    id: 'cp-irani-chai', kitchenId: 'chai-point-corner', name: 'Irani chai', price: 20, diet: 'veg',
    section: 'Chai & coffee', recommended: true, bestseller: true, rating: 4.5, ratingCount: 880, tone: 'lilac',
    description: 'Thick, sweet, and poured from a height.',
  },
  {
    id: 'cp-osmania', kitchenId: 'chai-point-corner', name: 'Osmania biscuits (4)', price: 30, diet: 'veg',
    section: 'Snacks', recommended: true, goesWellWith: true, rating: 4.4, ratingCount: 512, tone: 'sand',
    description: 'Salted-sweet, made for dunking.',
  },
  {
    id: 'cp-samosa', kitchenId: 'chai-point-corner', name: 'Samosa (2)', price: 30, diet: 'veg',
    section: 'Snacks', recommended: true, rating: 4.2, ratingCount: 340, tone: 'stone',
    description: 'Potato and peas, fried through the evening.',
  },
];

/* ── Coupons ─────────────────────────────────────────────────────────────
   `minimum` is read against the ITEM total, never the payable — a coupon
   that counts the delivery fee towards its own threshold is a coupon that
   pays for itself. */
export const COUPONS = [
  {
    code: 'MESS20', headline: '₹20 off', body: '₹20 off on item totals over ₹149',
    discount: 20, minimum: 149, kitchenId: 'annapurna-mess',
  },
  {
    code: 'FIRST50', headline: '₹50 off', body: 'Your first order over ₹299',
    discount: 50, minimum: 299,
  },
  {
    code: 'PICKUP10', headline: '₹10 off', body: '₹10 off when you collect it yourself',
    discount: 10, minimum: 0, pickupOnly: true,
  },
];

/* ── Saved addresses ─────────────────────────────────────────────────────
   One is out of the delivery zone on purpose: the checkout has to be able to
   say so in words before anybody pays. */
export const ADDRESSES = [
  {
    id: 'block-c-214',
    title: 'Block C · Room 214',
    detail: 'Vignan Hostel, Indira Nagar lane, Gachibowli, Hyderabad 500032',
    instructions: 'Gate closes at 10 pm, call from outside',
    fromBooking: true,
    isDefault: true,
    serviceable: true,
    hasPin: true,
  },
  {
    id: 'hostel-gate',
    title: 'Hostel main gate',
    detail: 'Security desk, Vignan Hostel · hand over at the gate',
    serviceable: true,
    hasPin: true,
  },
  {
    id: 'kondapur-pg',
    title: 'Kondapur PG · Room 4B',
    detail: 'Kondapur Sector 4, Hyderabad 500084',
    serviceable: false,
    unserviceableNote: 'Outside this kitchen’s delivery zone. Pickup is still available, or order from a Kondapur kitchen.',
  },
];

export const PAYMENT_METHODS = [
  {
    id: 'upi', label: 'UPI · GPay, PhonePe, Paytm', icon: 'verified', tag: 'Fastest',
    note: 'Opens Razorpay. The kitchen is told once the payment is signed and verified.',
  },
  {
    id: 'card', label: 'Card', icon: 'card',
    note: 'Credit, debit or RuPay · saved cards live with Razorpay, never with us',
  },
  {
    id: 'cod', label: 'Cash on delivery', icon: 'rupee',
    note: 'Keep the exact amount ready. The rider carries no change above ₹100.',
  },
];

/* ── Orders ──────────────────────────────────────────────────────────────
   The first one is live: its kitchen track has finished and its rider track
   has not, which is the state the tracking page was drawn for. The rest are
   history, and they carry the four endings a diner can actually meet —
   delivered, refused by the kitchen, collected, and called off. */
export const ORDERS = [
  {
    reference: 'LMP-4821',
    kitchenId: 'annapurna-mess',
    kitchenName: 'Annapurna Mess',
    live: true,
    status: 'onTheWay',
    statusLabel: 'On the way',
    fulfilment: 'delivery',
    placedLabel: 'Today, 1:02 pm',
    monthLabel: 'September 2026',
    addressTitle: 'Block C · Room 214',
    lines: [
      { name: 'Full meals thali', qty: 1, price: 120, diet: 'veg', note: 'Medium · extra curd · curd packed apart' },
      { name: 'Curd rice with pickle', qty: 1, price: 60, diet: 'veg' },
    ],
    itemTotal: 180,
    packagingCharge: 10,
    deliveryFee: 19,
    discount: 20,
    couponCode: 'MESS20',
    paid: 189,
    paymentLabel: 'UPI · paid',
    paymentStatus: 'paid',
    deliveryOtp: '4827',
    etaLabel: '1:36 pm',
    distanceLabel: '1.4 km',
    lastFixLabel: '12 seconds ago',
    pickedUpLabel: '1:26 pm',
    rider: { name: 'Rahul K.', initial: 'R', vehicle: 'Honda Activa · TS 09 EZ 4471', rating: 4.8 },
    dispatch: { state: 'assigned', candidateCount: 4 },
    kitchenTrack: [
      { label: 'Order placed & paid', at: '1:02 pm', note: 'UPI ₹189 verified', done: true },
      { label: 'Accepted by the kitchen', at: '1:04 pm', done: true },
      { label: 'Cooking', at: '1:05 pm – 1:24 pm', done: true },
      { label: 'Ready & packed', at: '1:24 pm', note: 'three boxes', done: true },
    ],
    riderTrack: [
      { label: 'Looking for a rider', at: '1:06 pm', note: '4 riders asked', done: true },
      { label: 'Rahul accepted', at: '1:09 pm', note: 'waited at the counter', done: true },
      { label: 'Picked up · on the way', at: '1:26 pm', note: 'happening now', current: true },
      { label: 'Handed over', note: 'Needs code 4827' },
    ],
  },
  {
    reference: 'LMP-4790',
    kitchenId: 'green-leaf-tiffins',
    kitchenName: 'Green Leaf Tiffins',
    status: 'delivered',
    statusLabel: 'Delivered',
    fulfilment: 'delivery',
    placedLabel: 'Sat 14 Sep, 8:12 am',
    monthLabel: 'September 2026',
    addressTitle: 'Block C · Room 214',
    lines: [
      { name: 'Ghee podi idli (4)', qty: 1, price: 70, diet: 'veg' },
      { name: 'Filter coffee', qty: 2, price: 30, diet: 'veg' },
    ],
    itemTotal: 130,
    packagingCharge: 8,
    deliveryFee: 0,
    discount: 0,
    paid: 138,
    paymentLabel: 'UPI',
    paymentStatus: 'paid',
  },
  {
    reference: 'LMP-4772',
    kitchenId: 'hotel-sitara',
    kitchenName: 'Hotel Sitara',
    status: 'rejected',
    statusLabel: 'Kitchen refused',
    fulfilment: 'delivery',
    placedLabel: 'Thu 12 Sep, 9:41 pm',
    monthLabel: 'September 2026',
    lines: [{ name: 'Chicken dum biryani', qty: 2, price: 190, diet: 'nonveg' }],
    itemTotal: 380,
    packagingCharge: 15,
    deliveryFee: 25,
    discount: 0,
    paid: 420,
    paymentLabel: 'UPI',
    paymentStatus: 'refunded',
    rejectionReason: 'Biryani finished for the night.',
    refund: { amount: 420, destination: 'the same UPI ID', creditedLabel: '13 Sep', status: 'credited' },
  },
  {
    reference: 'LMP-4751',
    kitchenId: 'annapurna-mess',
    kitchenName: 'Annapurna Mess',
    status: 'pickedUp',
    statusLabel: 'Picked up',
    fulfilment: 'pickup',
    placedLabel: 'Wed 11 Sep, 1:20 pm',
    monthLabel: 'September 2026',
    lines: [{ name: 'Full meals thali', qty: 1, price: 110, diet: 'veg' }],
    itemTotal: 110,
    packagingCharge: 0,
    deliveryFee: 0,
    discount: 0,
    paid: 110,
    paymentLabel: 'Cash at the counter',
    paymentStatus: 'paid',
    pickupCode: '3390',
  },
  {
    reference: 'LMP-4610',
    kitchenId: 'rolls-and-bowls',
    kitchenName: 'Rolls & Bowls',
    status: 'cancelled',
    statusLabel: 'You cancelled',
    fulfilment: 'delivery',
    placedLabel: 'Fri 29 Aug, 10:02 pm',
    monthLabel: 'August 2026',
    lines: [
      { name: 'Egg chicken roll', qty: 1, price: 120, diet: 'egg' },
      { name: 'Coke (300 ml)', qty: 1, price: 40, diet: 'veg' },
    ],
    itemTotal: 160,
    packagingCharge: 0,
    deliveryFee: 0,
    discount: 0,
    paid: 0,
    paymentLabel: 'Nothing was charged',
    paymentStatus: 'cancelled',
    cancelNote: 'Cancelled before the kitchen accepted · nothing was charged',
  },
];

/* What this diner reaches for. Ordered by how often, which is the only
   ranking a "usual" list can honestly claim. */
export const USUALS = [
  { dishId: 'am-thali', times: 9 },
  { dishId: 'gl-podi-idli', times: 6 },
  { dishId: 'am-curd-rice', times: 5 },
];

export const SPEND = { monthLabel: 'this month', total: 1247, orders: 11, average: 113 };

/* ── Lookups ─────────────────────────────────────────────────────────── */
export const kitchenById = id => KITCHENS.find(k => k.id === id) || null;
export const dishById = id => DISHES.find(d => d.id === id) || null;
export const dishesOf = kitchenId => DISHES.filter(d => d.kitchenId === kitchenId);
export const orderByReference = reference => ORDERS.find(o => o.reference === reference) || null;

/* A kitchen is pure veg when it says so, and the feed trusts that flag rather
   than scanning the menu: a kitchen with no dishes loaded yet is not
   accidentally "pure veg". */
export const isPureVeg = kitchen => Boolean(kitchen?.pureVeg);

/* Popular in your PG — dishes with a block count, biggest first. */
export const popularInBlock = () => DISHES
  .filter(d => d.ordersInBlock)
  .sort((a, b) => b.ordersInBlock - a.ordersInBlock)
  .slice(0, 4);
