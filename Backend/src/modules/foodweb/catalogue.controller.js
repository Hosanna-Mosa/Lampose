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

   ## Why the area is always null

   `AREA` in the fixture is one hard-coded locality — Gachibowli. It was the
   copy for "near you", answered by looking up the service zone containing
   the diner's point. Service zones are gone — there is no row anywhere that
   names a delivery area — so there is no honest locality to report. `area`
   stays `null` and `serviceable` stays `false` unconditionally; `located`
   only says whether the caller sent a point, not whether anything is known
   about it.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodRestaurant = require('../foodpartners/foodRestaurant.model');
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
 *   lat, lng   the diner's point, for the area. Both or neither.
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

    return res.json({
      success: true,
      data: {
        cuisines,
        dietLabels: DIET_LABEL,
        /* No service zones left to answer either of these from — see the
           header. `located` is honest about the request; `area` and
           `serviceable` cannot be, so they stay null/false always. */
        area: null,
        located,
        serviceable: false,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getCatalogue, DIET_LABEL };
