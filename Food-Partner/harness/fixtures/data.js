/* Fixture payloads, shaped to the exported server types in services/foodPartner.ts
   and services/support.ts. Deliberately rich enough that a screen renders its
   BODY, not an empty state — an empty screen matching an empty screen is not a
   pass (M6/F3). */

const RESTAURANT = {
  restaurantId: 'r_seed_1',
  restaurantName: 'Paradise Biryani',
  ownerName: 'Ravi Kumar Reddy',
  ownerEmail: 'ravi@paradisebiryani.in',
  ownerPhone: '9876543210',
  description: 'Dum biryani, kebabs and South Indian breakfast.',
  cuisineTypes: ['North Indian', 'Mughlai'],
  logoImage: { url: 'https://img.invalid.test/logo.jpg', publicId: 'logo_1' },
  coverBannerImage: { url: 'https://img.invalid.test/cover.jpg', publicId: 'cover_1' },
  address: { line1: '12-3-45, Main Road', landmark: 'Near Bus Stop', city: 'Guntur', state: 'Andhra Pradesh', pincode: '522001' },
  contactNumber: '9876543211',
  openingHours: [
    { day: 'Monday', openTime: '09:00', closeTime: '22:30' },
    { day: 'Tuesday', openTime: '09:00', closeTime: '22:30' },
  ],
  openState: 'auto',
  isCurrentlyOpen: true,
  avgPreparationTime: 25,
  deliveryRadiusKm: 6,
  minOrderValue: 120,
  packagingCharge: 15,
  deliveryFee: { type: 'flat', amount: 30 },
  acceptsOnlinePayment: true,
  acceptsCod: true,
  verificationStatus: 'approved',
  verificationNote: 'Everything checked out.',
  isActive: true,
  ratingAvg: 4.4,
  ratingCount: 218,
  payout: { accountLast4: '4821', ifscCode: 'HDFC0001234', accountHolderName: 'Ravi Kumar Reddy', upiId: 'ravi@okhdfc' },
  fssaiLicenseNumber: '12345678901234',
  gstNumber: '37ABCDE1234F1Z5',
  panNumber: 'ABCDE1234F',
  menuItemCount: 3,
};

const PRODUCTS = [
  { productId: 'prod_1', restaurantId: 'r_seed_1', productName: 'Chicken Dum Biryani', category: 'Rice & Biryani',
    description: 'Slow-cooked with long-grain rice.', price: 320, discountedPrice: 289, isVeg: 'non-veg',
    isAvailable: true, productImage: { url: 'https://img.invalid.test/biryani.jpg', publicId: 'p1' },
    variants: [{ name: 'Half', price: 220 }, { name: 'Full', price: 380 }],
    addOns: [{ name: 'Extra raita', price: 40 }], serves: 2, preparationTime: 30, displayOrder: 1, tags: ['Bestseller'] },
  { productId: 'prod_2', restaurantId: 'r_seed_1', productName: 'Paneer Tikka', category: 'Starters',
    description: 'Char-grilled, six pieces.', price: 240, discountedPrice: null, isVeg: 'veg',
    isAvailable: true, productImage: null, variants: [], addOns: [], serves: 1, preparationTime: 20, displayOrder: 2 },
  { productId: 'prod_3', restaurantId: 'r_seed_1', productName: 'Butter Naan', category: 'Breads',
    description: 'Tandoor-baked.', price: 45, isVeg: 'veg', isAvailable: false, productImage: null, displayOrder: 3 },
];

const line = (productName, quantity, unitPrice, extra) => Object.assign(
  { productName, quantity, unitPrice, lineTotal: quantity * unitPrice, isVeg: 'non-veg' }, extra || {});

const ORDERS = [
  { orderNumber: 'LMP-100241', restaurantId: 'r_seed_1', customerName: 'Anitha S', customerPhone: '9000000001',
    deliveryAddress: 'Room 214, Sai Hostel, Main Road', lines: [line('Chicken Dum Biryani', 2, 289, { variantName: 'Full' }), line('Butter Naan', 3, 45, { isVeg: 'veg' })],
    itemsTotal: 713, packagingCharge: 15, deliveryFee: 30, grandTotal: 758, partnerPayout: 640,
    paymentMode: 'online', paymentStatus: 'paid', status: 'placed',
    dispatch: { state: 'searching', candidateCount: 4 }, rider: null, pickupCode: '4417',
    promisedMinutes: 30, placedAt: '2026-03-15T09:12:00.000Z' },
  { orderNumber: 'LMP-100240', restaurantId: 'r_seed_1', customerName: 'Kiran M', customerPhone: '9000000002',
    deliveryAddress: 'Flat 3B, Lotus Residency', lines: [line('Paneer Tikka', 1, 240, { isVeg: 'veg' })],
    itemsTotal: 240, packagingCharge: 15, deliveryFee: 30, grandTotal: 285, partnerPayout: 232,
    paymentMode: 'cod', paymentStatus: 'pending', status: 'preparing',
    dispatch: { state: 'assigned' },
    rider: { name: 'Suresh B', phone: '9000000090', vehicle: { type: 'bike', model: 'Splendor', plate: 'AP07 BC 1234' }, assignedAt: '2026-03-15T09:05:00.000Z', pickedUpAt: null },
    pickupCode: '8823', promisedMinutes: 25, placedAt: '2026-03-15T08:55:00.000Z' },
  { orderNumber: 'LMP-100239', restaurantId: 'r_seed_1', customerName: 'Divya R', customerPhone: '9000000003',
    deliveryAddress: 'Shop 4, Market Street', lines: [line('Chicken Dum Biryani', 1, 320, { variantName: 'Half' })],
    itemsTotal: 320, packagingCharge: 15, deliveryFee: 0, grandTotal: 335, partnerPayout: 300,
    paymentMode: 'online', paymentStatus: 'paid', status: 'ready',
    dispatch: { state: 'unassigned', candidateCount: 0, failureReason: 'no riders nearby' },
    rider: null, pickupCode: '1190', promisedMinutes: 20, placedAt: '2026-03-15T08:40:00.000Z' },
];

const ORDERS_PAGE = { data: ORDERS, counts: { placed: 1, accepted: 0, preparing: 1, ready: 1 } };

const TICKETS = [
  { reference: 'SUP-1001', kind: 'ticket', category: 'payouts', subject: 'Payout for 12 March has not arrived',
    status: 'open', createdAt: '2026-03-14T06:00:00.000Z', updatedAt: '2026-03-14T09:00:00.000Z', unreadForRequester: 1 },
  { reference: 'SUP-0994', kind: 'ticket', category: 'menu', subject: 'Cannot mark an item unavailable',
    status: 'resolved', createdAt: '2026-03-02T06:00:00.000Z', updatedAt: '2026-03-03T10:00:00.000Z', unreadForRequester: 0 },
];

const THREAD = Object.assign({}, TICKETS[0], {
  messages: [
    { id: 'm1', author: 'customer', body: 'The payout for 12 March has not reached the account yet.', at: '2026-03-14T06:00:00.000Z' },
    { id: 'm2', author: 'system', body: 'Assigned to the payouts desk.', at: '2026-03-14T06:05:00.000Z' },
    { id: 'm3', author: 'support', body: 'Thanks for flagging it — the settlement run is delayed by a day. It lands tomorrow.', at: '2026-03-14T09:00:00.000Z' },
  ],
});

/* SupportAudience.categories is string[] of ids — the screen looks each id up
   through the real CATEGORY_LABEL. Deriving the list from the app's own map (the
   same fallback fetchCategories itself uses) means the fixture cannot drift out
   of the enum. `reports: false` is the faithful value for a kitchen: safety
   reports are the diner's alone and this audience gets a 403. */
const TICKETS_PAGE = { tickets: TICKETS, unread: 1 };

function audience() {
  const { CATEGORY_LABEL, BODY_MAX_FALLBACK } = jest.requireActual('@/services/support');
  return { categories: Object.keys(CATEGORY_LABEL), bodyMax: BODY_MAX_FALLBACK, reports: false };
}

module.exports = { RESTAURANT, PRODUCTS, ORDERS, ORDERS_PAGE, TICKETS, TICKETS_PAGE, THREAD, audience };
