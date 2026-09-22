/* ══════════════════════════════════════════════════════════════════════════
   The feed's chrome — the cuisine filters, the diet labels and the area.

   Replaces the fixture's `CUISINES`, `DIET_LABEL` and `AREA`.

     GET /catalogue

   ## Why the cuisines are READ rather than listed

   The fixture hard-codes seven cuisines. A constant here would go stale the
   first afternoon somebody approved a kitchen that cooks something else — the
   filter row would have no chip for it, and those kitchens would be reachable
   only by scrolling.

   So the chips are the DISTINCT `cuisineTypes` of the kitchens actually on
   the feed. A cuisine appears when a kitchen serving it is approved and
   active, and disappears when the last one closes. There is nothing to keep
   in step.

   ## Why the area is not a constant either, and why it is no longer a NAME

   `AREA` in the fixture is one hard-coded locality — Gachibowli. It is the
   copy for "near you", and near-you is a question about the person asking.

   It used to be answered by the service zone containing the visitor's point.
   Zones are gone, and nothing else in the database knows what a visitor's
   own suburb is called, so this endpoint no longer names one: naming the
   nearest KITCHEN's locality would print "we deliver to Gachibowli" at
   somebody who is not in Gachibowli, and a delivery promise is the last
   thing to invent.

   What it answers instead is the question the name was standing in for —
   HOW MANY listed kitchens actually reach this point, by each kitchen's own
   `deliveryRadiusKm` (see `deliveryReach.util.js`). Without a point there is
   nothing to measure, so the reply says `located: false` and counts nothing.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodRestaurant = require('../foodpartners/foodRestaurant.model');
const { countKitchensReaching } = require('./deliveryReach.util');
const { LISTED } = require('./foodWeb.shape');

/*
 * The three diets, and the words the website puts on each.
 *
 * A CONSTANT rather than a read, because these are not data — they are the
 * enum on `food_products.isVeg` plus its copy. A fourth diet would be a
 * schema change, a migration and a decision about what the badge says, and
 * this object is where that decision would be written down.
 */
const DIET_LABEL = { veg: 'Veg', egg: 'Contains egg', nonveg: 'Non-veg' };

/**
 * Everything the feed needs before it draws a single card.
 *
 * One call rather than three, because the page cannot render its filter row
 * until it has all of this and three requests would be three chances to see a
 * half-drawn header.
 *
 * @route   GET /api/v2/food-web/catalogue
 * @access  public
 *
 * Query:
 *   lat, lng   the diner's point, for the delivery verdict. Both or neither.
 */
const getCatalogue = async (req, res, next) => {
  try {
    /* `distinct` over an indexed array field — `cuisineTypes` carries
       `index: true` on the model, so this is served from the index rather
       than by scanning the collection. */
    const cuisines = (await FoodRestaurant.distinct('cuisineTypes', LISTED))
      .filter(Boolean)
      .sort();

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const located = Number.isFinite(lat) && Number.isFinite(lng);

    /*
     * The same rule the checkout applies per address, from the same file, so
     * the feed and the checkout cannot disagree about where Lampose
     * delivers. A kitchen that reaches this point here is one that will not
     * refuse the address there.
     */
    const kitchensReaching = located ? await countKitchensReaching(lat, lng) : 0;

    return res.json({
      success: true,
      data: {
        cuisines,
        dietLabels: DIET_LABEL,
        located,
        /* How many kitchens reach the visitor. Sent as the number rather than
           only as the verdict below, because "4 kitchens deliver to you" is
           worth printing and a boolean cannot carry it. */
        kitchensReaching,
        /* Said out loud so the page can draw "we are not here yet" rather
           than an empty feed that looks like a loading failure. Only ever
           true when the caller sent a point — an unlocated visitor gets
           `false` and the page asks for their location instead of promising
           delivery it cannot check. */
        serviceable: kitchensReaching > 0,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getCatalogue, DIET_LABEL };
