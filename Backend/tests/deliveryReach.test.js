/* ══════════════════════════════════════════════════════════════════════════
   The delivery-area rule, which replaced the `zones` collection.

   `kitchenReaches` is arithmetic on two pins and a number, so it is tested
   here without a database. What is worth asserting is not the trigonometry —
   it is the three answers that are deliberately PERMISSIVE, because each of
   them is a way the food website could silently refuse every order:

     radius 0      not declared, not "delivers nowhere"
     no kitchen pin  nothing to measure from
     (and, separately, that a point genuinely far away IS refused — a rule
      that says yes to everything is not a rule)

   The coordinate order is asserted too. [lng, lat] read back the wrong way
   round does not throw; it puts the kitchen in the Arctic Ocean and every
   diner in Hyderabad is told they are out of range.
   ══════════════════════════════════════════════════════════════════════════ */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { kitchenReaches, haversineMeters } = require('../src/modules/foodweb/deliveryReach.util');

/* Gachibowli and a door about 1.2 km away, then one across the city. */
const KITCHEN = { location: { type: 'Point', coordinates: [78.3489, 17.4401] } };
const NEAR = { lat: 17.4498, lng: 78.3489 };
const FAR = { lat: 17.3850, lng: 78.4867 };

describe('a kitchen reaches a door', () => {
  it('measures from the stored [lng, lat] pair without swapping it', () => {
    const metres = haversineMeters(
      NEAR.lat, NEAR.lng,
      KITCHEN.location.coordinates[1], KITCHEN.location.coordinates[0],
    );
    assert.ok(metres > 900 && metres < 1500, `expected ~1.1 km, got ${Math.round(metres)} m`);
  });

  it('delivers inside the declared radius', () => {
    assert.equal(kitchenReaches({ ...KITCHEN, deliveryRadiusKm: 5 }, NEAR.lat, NEAR.lng), true);
  });

  it('refuses a door outside the declared radius', () => {
    assert.equal(kitchenReaches({ ...KITCHEN, deliveryRadiusKm: 5 }, FAR.lat, FAR.lng), false);
  });

  it('reads a radius of 0 as NOT DECLARED, so an old row still takes orders', () => {
    /* The field defaults to 0 and every restaurant onboarded before it was
       asked for still carries that default. Reading it literally would make
       those kitchens refuse every address on earth. */
    assert.equal(kitchenReaches({ ...KITCHEN, deliveryRadiusKm: 0 }, FAR.lat, FAR.lng), true);
    assert.equal(kitchenReaches({ ...KITCHEN }, FAR.lat, FAR.lng), true);
  });

  it('reaches when the kitchen has no pin, rather than punishing the diner for it', () => {
    assert.equal(kitchenReaches({ deliveryRadiusKm: 5 }, FAR.lat, FAR.lng), true);
    assert.equal(
      kitchenReaches({ location: { type: 'Point', coordinates: [] }, deliveryRadiusKm: 5 }, FAR.lat, FAR.lng),
      true,
    );
  });

  it('refuses when there is no door to measure to, and when there is no kitchen', () => {
    assert.equal(kitchenReaches({ ...KITCHEN, deliveryRadiusKm: 5 }, null, null), false);
    assert.equal(kitchenReaches({ ...KITCHEN, deliveryRadiusKm: 5 }, NaN, 78.3), false);
    assert.equal(kitchenReaches(null, NEAR.lat, NEAR.lng), false);
  });
});
