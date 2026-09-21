/* ══════════════════════════════════════════════════════════════════════════
   The website's food shapers — the bugs that were found by hand, pinned.

   `foodweb/*` turns database documents into the cards lampose.com draws. It is
   all pure functions, so this file needs no database and no server — and every
   case below is one that was actually wrong at some point and was caught by
   looking at a screen or at real data rather than by anything automated:

     · a chicken biryani rendered in the veg colour ('non-veg' vs 'nonveg')
     · a biryani house marked pure-veg because one dish was veg ($max, not $min)
     · a kitchen with no timetable read OPEN while the order path said CLOSED
     · a dish ordered twice printed at four times its price
     · an unpaid cash order read "Paid"
     · a pickup order "collected at the counter" drawn as "on the way"
     · a refused order drawing a rider rail that ends in a hand-over

   Written against the same functions the controllers call, so a refactor that
   keeps the shapes keeps the tests.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const shape = require('../src/modules/foodweb/foodWeb.shape');
const { orderCard } = require('../src/modules/foodweb/orders.controller');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');

/* ── diet ─────────────────────────────────────────────────────────────── */

describe('diet spelling', () => {
  it('maps the database\'s hyphenated non-veg to the website\'s', () => {
    assert.equal(shape.dietOf('non-veg'), 'nonveg');
    assert.equal(shape.dietOf('nonveg'), 'nonveg');
    assert.equal(shape.dietOf('veg'), 'veg');
    assert.equal(shape.dietOf('egg'), 'egg');
  });

  it('treats an unrecognised diet as NON-veg, never as veg', () => {
    assert.equal(shape.dietOf('vegan-ish'), 'nonveg');
    assert.equal(shape.dietOf(undefined), 'nonveg');
    assert.equal(shape.dietOf(''), 'nonveg');
  });
});

/* ── opening hours ────────────────────────────────────────────────────── */

describe('is the kitchen open', () => {
  it('is the model\'s own rule, not a second copy of it', () => {
    assert.equal(shape.isOpenNow, FoodRestaurant.isOpenNow);
  });

  it('reads a kitchen with no timetable as CLOSED, as the order path does', () => {
    assert.equal(shape.isOpenNow({ openState: 'auto', openingHours: [] }), false);
  });

  it('judges in Indian time whatever the server clock says', () => {
    /* 07:00 UTC is 12:30 in India, inside Monday 11:00-15:30. */
    const monday = { openState: 'auto', openingHours: [{ day: 'Monday', openTime: '11:00', closeTime: '15:30' }] };
    assert.equal(shape.isOpenNow(monday, new Date('2026-09-21T07:00:00Z')), true);
    assert.equal(shape.isOpenNow(monday, new Date('2026-09-21T13:00:00Z')), false); // 18:30 IST
  });

  it('keeps a slot that crosses midnight open into the next morning', () => {
    const late = { openState: 'auto', openingHours: [{ day: 'Monday', openTime: '18:00', closeTime: '02:00' }] };
    assert.equal(shape.isOpenNow(late, new Date('2026-09-21T19:30:00Z')), true); // 01:00 IST Tuesday
  });

  it('lets the owner\'s switch beat the timetable', () => {
    const hours = [{ day: 'Monday', openTime: '00:00', closeTime: '23:59' }];
    assert.equal(shape.isOpenNow({ openState: 'closed', openingHours: hours }, new Date('2026-09-21T07:00:00Z')), false);
    assert.equal(shape.isOpenNow({ openState: 'open', openingHours: [] }), true);
  });
});

describe('when a closed kitchen opens', () => {
  const timetable = [
    { day: 'Monday', openTime: '11:00', closeTime: '15:30' },
    { day: 'Monday', openTime: '18:30', closeTime: '23:00' },
    { day: 'Tuesday', openTime: '11:00', closeTime: '15:30' },
  ];
  const kitchen = { openState: 'auto', openingHours: timetable };

  it('names a later slot today, then tomorrow', () => {
    assert.equal(shape.opensAtLabel(kitchen, new Date('2026-09-21T11:15:00Z')), '6:30 pm'); // 16:45 IST Mon
    assert.equal(shape.opensAtLabel(kitchen, new Date('2026-09-21T18:00:00Z')), 'tomorrow 11 am'); // 23:30 IST Mon
  });

  it('says nothing when it is open, or when the owner closed it by hand', () => {
    assert.equal(shape.opensAtLabel(kitchen, new Date('2026-09-21T07:00:00Z')), '');
    assert.equal(shape.opensAtLabel({ ...kitchen, openState: 'closed' }, new Date('2026-09-21T03:30:00Z')), '');
  });
});

/* ── the order card ───────────────────────────────────────────────────── */

const baseOrder = (over = {}) => ({
  orderNumber: 'L0000001',
  restaurantId: 'FP-TEST0001',
  restaurant: { name: 'Test Kitchen' },
  status: 'placed',
  statusHistory: [{ status: 'placed', at: new Date('2026-09-20T15:00:00Z') }],
  fulfilment: 'delivery',
  placedAt: new Date('2026-09-20T15:00:00Z'),
  deliveryAddress: 'Somewhere',
  lines: [
    { productId: 'P1', productName: 'Samosa', quantity: 5, unitPrice: 25, lineTotal: 125, isVeg: 'veg' },
    { productId: 'P2', productName: 'Chicken Roll', quantity: 1, unitPrice: 90, lineTotal: 90, isVeg: 'non-veg' },
  ],
  itemsTotal: 215,
  packagingCharge: 10,
  deliveryFee: 15,
  discount: 0,
  grandTotal: 240,
  paymentMode: 'cod',
  paymentStatus: 'pending',
  dispatch: { state: 'idle', candidateCount: 0 },
  delivery: {},
  deliveryOtp: '4321',
  // things that must never reach a diner's browser
  pickupCode: '9999',
  partnerPayout: 180,
  commissionRate: 15,
  customerPhone: '+919999900000',
  razorpay: { orderId: 'order_x', paymentId: 'pay_x' },
  ...over,
});

describe('the order card', () => {
  it('prices a line PER UNIT, so price x qty lands on what was charged', () => {
    const card = orderCard(baseOrder());
    const samosa = card.lines.find((l) => l.name === 'Samosa');
    assert.equal(samosa.price, 25);
    assert.equal(samosa.qty, 5);
    assert.equal(card.lines.reduce((sum, l) => sum + l.price * l.qty, 0), card.itemTotal);
  });

  it('spells non-veg the way the components switch on it', () => {
    const card = orderCard(baseOrder());
    assert.equal(card.lines.find((l) => l.name === 'Chicken Roll').diet, 'nonveg');
  });

  it('does not call an unpaid cash order paid', () => {
    const card = orderCard(baseOrder());
    assert.equal(card.paid, 0);
    assert.equal(card.dueOnDelivery, 240);
    assert.equal(card.grandTotal, 240);
  });

  it('calls a settled order paid, and owes nothing at the door', () => {
    const card = orderCard(baseOrder({ paymentMode: 'online', paymentStatus: 'paid' }));
    assert.equal(card.paid, 240);
    assert.equal(card.dueOnDelivery, 0);
  });

  it('draws a collected pickup order as collected, not on the way', () => {
    const card = orderCard(baseOrder({ fulfilment: 'pickup', status: 'picked_up' }));
    assert.equal(card.status, 'pickedUp');
    assert.equal(card.statusLabel, 'Collected');
    assert.equal(orderCard(baseOrder({ status: 'picked_up' })).status, 'onTheWay');
  });

  it('gives a refused or cancelled order no pending hand-over step', () => {
    for (const status of ['rejected', 'cancelled']) {
      const card = orderCard(baseOrder({
        status,
        statusHistory: [{ status: 'placed', at: new Date() }, { status, at: new Date() }],
        dispatch: { state: 'idle' },
      }), true);
      assert.equal(card.riderTrack.some((step) => step.label === 'Handed over'), false, status);
    }
  });

  it('gives a pickup order no rider track at all', () => {
    assert.deepEqual(orderCard(baseOrder({ fulfilment: 'pickup' }), true).riderTrack, []);
  });

  it('never carries anything internal, in the list or in the full card', () => {
    for (const full of [false, true]) {
      const card = orderCard(baseOrder(), full);
      for (const key of ['pickupCode', 'partnerPayout', 'commissionRate', 'customerPhone', 'razorpay']) {
        assert.equal(key in card, false, `${key} leaked (full=${full})`);
      }
    }
  });

  it('shows a live rider\'s distance and the age of the fix, and nothing when there is none', () => {
    const doc = baseOrder({
      status: 'picked_up',
      delivery: { driverId: 'DR-1', driverName: 'Test Rider', pickedUpAt: new Date(), vehicle: { model: 'Activa', plate: 'TS09' } },
      dropLocation: { type: 'Point', coordinates: [78.4867, 17.385] },
    });
    const near = { coordinates: [78.4867, 17.395], at: new Date(Date.now() - 8000) }; // ~1.1 km north
    const live = orderCard(doc, true, near);
    assert.match(live.distanceLabel, /^1\.\d km$/);
    assert.match(live.lastFixLabel, /seconds? ago$/);

    const dark = orderCard(doc, true, null);
    assert.equal(dark.distanceLabel, '');
    assert.equal(dark.lastFixLabel, '');
    /* The rider's own phone number is never part of what a diner's browser gets. */
    assert.equal(JSON.stringify(live).includes('driverPhone'), false);
  });
});

/* ── the kitchen and dish cards ───────────────────────────────────────── */

describe('the kitchen card', () => {
  const restaurant = {
    restaurantId: 'FP-TEST0001',
    restaurantName: 'Test Kitchen',
    cuisineTypes: ['Chinese'],
    description: 'Wok food',
    address: { line1: 'Opposite the park', landmark: '' },
    ratingAvg: 0,
    ratingCount: 0,
    deliveryFee: 30,
    packagingCharge: 10,
    minOrderValue: 100,
    avgPreparationTime: 20,
    openState: 'open',
    openingHours: [],
    fssaiLicenseNumber: '12345678901234',
    // things a public card must never carry
    ownerName: 'Secret Owner',
    ownerPhone: '+919999900001',
    ownerEmail: 'owner@example.invalid',
    passwordHash: 'x',
    gstNumber: '29ABCDE1234F1Z5',
    payout: { bankAccountNumber: '000' },
  };

  it('keeps the owner and the money out of a public card', () => {
    const card = shape.kitchenCard(restaurant, { costForOne: 120, pureVeg: false });
    const text = JSON.stringify(card);
    for (const secret of ['Secret Owner', '+919999900001', 'owner@example.invalid', '29ABCDE1234F1Z5', 'bankAccountNumber']) {
      assert.equal(text.includes(secret), false, secret);
    }
    assert.equal(card.id, 'FP-TEST0001');
    assert.equal(card.fssai, '12345678901234');
  });

  it('sends a null walk time, not a made-up one, when no location was shared', () => {
    assert.equal(shape.kitchenCard(restaurant, {}).walkMinutes, null);
    assert.equal(shape.kitchenCard(restaurant, { distanceMeters: 750 }).walkMinutes, 10);
  });

  it('is pure-veg only when the menu pass said so', () => {
    assert.equal(shape.kitchenCard(restaurant, {}).pureVeg, false);
    assert.equal(shape.kitchenCard(restaurant, { pureVeg: true }).pureVeg, true);
  });
});

describe('the dish card', () => {
  const product = {
    productId: 'FPI-TEST0001',
    restaurantId: 'FP-TEST0001',
    productName: 'Hyderabadi Chicken Biryani',
    category: 'Rice & Biryani',
    isVeg: 'non-veg',
    price: 320,
    discountedPrice: 289,
    isAvailable: true,
    addOns: [{ name: 'Raita', price: 20, isAvailable: false }],
    ratingCount: 0,
  };

  it('charges the discounted price and keeps the list price for the strike-through', () => {
    const dish = shape.dishCard(product);
    assert.equal(dish.price, 289);
    assert.equal(dish.mrp, 320);
    assert.equal(dish.diet, 'nonveg');
  });

  it('marks an unavailable dish and add-on sold out, and claims no local popularity', () => {
    const dish = shape.dishCard({ ...product, isAvailable: false });
    assert.equal(dish.soldOut, true);
    assert.equal(dish.addOns[0].soldOut, true);
    assert.equal('ordersInBlock' in dish, false);
  });
});

/* ── what a real order needs from the website's data ──────────────────── */

const { addressRow } = require('../src/modules/foodweb/checkout.controller');

describe('the address row, as the order needs it', () => {
  const verdict = { serviceable: true, note: '' };

  it('sends the pin as NAMED lat and lng - never as the stored [lng, lat] pair', () => {
    const row = addressRow({
      addressId: 'A1', line1: '12 Test Lane',
      /* MongoDB order: LONGITUDE first. */
      location: { type: 'Point', coordinates: [78.4867, 17.385] },
    }, verdict);
    assert.equal(row.lat, 17.385);
    assert.equal(row.lng, 78.4867);
    assert.equal(row.hasPin, true);
    assert.equal('coordinates' in row, false, 'the raw pair does not reach the website, so it cannot be swapped');
  });

  it('sends null, not 0, when the address has no pin', () => {
    const row = addressRow({ addressId: 'A2', line1: 'No pin here' }, verdict);
    assert.equal(row.lat, null);
    assert.equal(row.lng, null);
    assert.equal(row.hasPin, false);
  });
});

describe('free delivery above a threshold', () => {
  const base = {
    restaurantId: 'FP-TEST0001', restaurantName: 'Test Kitchen', cuisineTypes: [],
    openState: 'open', openingHours: [], minOrderValue: 0,
  };

  it('carries the threshold only for a kitchen that has that rule', () => {
    assert.equal(shape.kitchenCard({ ...base, deliveryFee: { type: 'free_above', amount: 30, freeAboveValue: 299 } }).freeDeliveryAbove, 299);
    assert.equal(shape.kitchenCard({ ...base, deliveryFee: { type: 'flat', amount: 30 } }).freeDeliveryAbove, 0);
    assert.equal(shape.kitchenCard({ ...base, deliveryFee: { type: 'free_above', amount: 30 } }).freeDeliveryAbove, 0);
    assert.equal(shape.kitchenCard(base).freeDeliveryAbove, 0);
  });
});
