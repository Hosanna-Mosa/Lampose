/**
 * The food pricing calculator — `src/modules/foodpartners/foodPricing.js`.
 *
 * Pure functions, no database: every figure a food bill can carry, checked
 * to the paisa against the launch model.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  FOOD_PRICING_CONFIG,
  calculateDeliveryFee,
  calculateOrderPricing,
  roundMoney,
} = require('../src/modules/foodpartners/foodPricing');

describe('delivery fee by distance slab', () => {
  const cases = [
    [0, 19], [1.2, 19], [2, 19],
    [2.01, 24], [2.4, 24], [3, 24],
    [3.01, 29], [3.5, 29], [5, 29],
    [5.01, 39], [6.2, 39], [7, 39],
    [7.01, 49], [9, 49],
    [9.01, 59], [12, 59],
    [12.01, 64], [12.3, 64], [13, 64], [14, 69], [20, 99],
  ];
  for (const [km, fee] of cases) {
    it(`${km} km → ₹${fee}`, () => assert.equal(calculateDeliveryFee(km), fee));
  }

  it('an unknown or nonsensical distance is the first slab', () => {
    for (const km of [null, undefined, NaN, -1, 'abc']) {
      assert.equal(calculateDeliveryFee(km), 19, String(km));
    }
  });
});

describe('the launch examples', () => {
  const examples = [
    /* food, km, packaging → delivery, payable */
    { food: 99, km: 1.2, packaging: 5, delivery: 19, payable: 148.17, small: 10 },
    { food: 199, km: 2.4, packaging: 5, delivery: 24, payable: 249.07, small: 0 },
    { food: 299, km: 3.5, packaging: 10, delivery: 29, payable: 365.87, small: 0 },
    { food: 499, km: 6.2, packaging: 10, delivery: 39, payable: 587.67, small: 0 },
  ];
  for (const ex of examples) {
    it(`₹${ex.food} at ${ex.km} km with ₹${ex.packaging} packaging → ₹${ex.payable}`, () => {
      const p = calculateOrderPricing({ foodSubtotal: ex.food, distanceKm: ex.km, packagingFee: ex.packaging });
      assert.equal(p.deliveryFee, ex.delivery);
      assert.equal(p.smallOrderFee, ex.small);
      assert.equal(p.customerPayable, ex.payable);
      assert.equal(p.lamposeGrossRevenue, ex.delivery + 5);
      assert.equal(p.restaurantCommission, 0);
      assert.equal(p.restaurantPayable, ex.food + ex.packaging);
    });
  }

  it('₹299 at 3.5 km, line by line', () => {
    const p = calculateOrderPricing({ foodSubtotal: 299, distanceKm: 3.5, packagingFee: 10 });
    assert.equal(p.foodGst, 14.95);
    assert.equal(p.deliveryFee, 29);
    assert.equal(p.deliveryGst, 5.22);
    assert.equal(p.serviceFee, 5);
    assert.equal(p.serviceFeeGst, 0.9);
    assert.equal(p.packagingFee, 10);
    assert.equal(p.packagingGst, 1.8);
    assert.equal(p.smallOrderFee, 0);
    assert.equal(p.grossAmount, 365.87);
    assert.equal(p.discount, 0);
    assert.equal(p.customerPayable, 365.87);
    assert.equal(p.gstCollected, 22.87);
  });
});

describe('small order fee', () => {
  const fee = (food) => calculateOrderPricing({ foodSubtotal: food, distanceKm: 1 }).smallOrderFee;
  it('₹149.99 pays it', () => assert.equal(fee(149.99), 10));
  it('₹150 does not', () => assert.equal(fee(150), 0));
  it('₹150.01 does not', () => assert.equal(fee(150.01), 0));
});

describe('packaging', () => {
  for (const [fee, gst] of [[0, 0], [5, 0.9], [10, 1.8]]) {
    it(`₹${fee} packaging carries ₹${gst} GST`, () => {
      const p = calculateOrderPricing({ foodSubtotal: 200, distanceKm: 1, packagingFee: fee });
      assert.equal(p.packagingFee, fee);
      assert.equal(p.packagingGst, gst);
    });
  }

  it('missing packaging is none', () => {
    const p = calculateOrderPricing({ foodSubtotal: 200, distanceKm: 1 });
    assert.equal(p.packagingFee, 0);
    assert.equal(p.packagingGst, 0);
  });

  it('is capped at the configured maximum', () => {
    const p = calculateOrderPricing({ foodSubtotal: 200, distanceKm: 1, packagingFee: 500 });
    assert.equal(p.packagingFee, FOOD_PRICING_CONFIG.maxPackagingFee);
  });
});

describe('discount', () => {
  it('comes off the total', () => {
    const p = calculateOrderPricing({ foodSubtotal: 299, distanceKm: 3.5, packagingFee: 10, discount: 50 });
    assert.equal(p.discount, 50);
    assert.equal(p.customerPayable, 315.87);
  });

  it('larger than the bill pays it to zero, never below', () => {
    const p = calculateOrderPricing({ foodSubtotal: 100, distanceKm: 1, discount: 10000 });
    assert.equal(p.customerPayable, 0);
    assert.equal(p.discount, p.grossAmount, 'only what was owed is applied');
  });

  it('does not reduce what the restaurant is owed', () => {
    const p = calculateOrderPricing({ foodSubtotal: 300, distanceKm: 1, packagingFee: 10, discount: 100 });
    assert.equal(p.restaurantPayable, 310);
  });
});

describe('bad input', () => {
  it('negative amounts are zero', () => {
    const p = calculateOrderPricing({ foodSubtotal: -100, distanceKm: -5, packagingFee: -10, discount: -20 });
    assert.equal(p.foodSubtotal, 0);
    assert.equal(p.foodGst, 0);
    assert.equal(p.packagingFee, 0);
    assert.equal(p.discount, 0);
    assert.equal(p.distanceKnown, false);
    assert.equal(p.deliveryFee, 19);
    assert.ok(p.customerPayable >= 0);
  });

  it('a missing distance is flagged and charged the first slab', () => {
    const p = calculateOrderPricing({ foodSubtotal: 200 });
    assert.equal(p.distanceKm, null);
    assert.equal(p.distanceKnown, false);
    assert.equal(p.deliveryFee, 19);
  });
});

describe('commission', () => {
  it('is always 0 at launch', () => {
    for (const food of [0, 1, 99, 150, 299, 4999.99]) {
      const p = calculateOrderPricing({ foodSubtotal: food, distanceKm: 4, packagingFee: 7 });
      assert.equal(p.restaurantCommissionRate, 0);
      assert.equal(p.restaurantCommission, 0);
    }
  });
});

describe('GST', () => {
  it('rounds to the paisa', () => {
    const p = calculateOrderPricing({ foodSubtotal: 123.45, distanceKm: 1 });
    assert.equal(p.foodGst, 6.17); // 6.1725
    assert.equal(p.deliveryGst, 3.42);
  });

  it('inclusive prices extract 5/105 and add nothing', () => {
    const p = calculateOrderPricing({ foodSubtotal: 210, distanceKm: 1, taxMode: 'inclusive' });
    assert.equal(p.foodGst, 10);
    assert.equal(p.foodGstIncluded, true);
    assert.equal(p.customerPayable, 238.32); // 210 + 19 + 3.42 + 5 + 0.90
    assert.equal(p.restaurantPayable, 200, 'the GST inside the price is not the kitchen\'s');
  });

  it('is kept out of Lampose revenue', () => {
    const p = calculateOrderPricing({ foodSubtotal: 299, distanceKm: 3.5, packagingFee: 10 });
    assert.equal(p.lamposeGrossRevenue, 34);
  });

  it('roundMoney does not drift', () => {
    assert.equal(roundMoney(0.1 + 0.2), 0.3);
    assert.equal(roundMoney(5.219999), 5.22);
  });
});
