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

   ## Why the area is not a constant either

   `AREA` in the fixture is one hard-coded locality — Gachibowli. It is the
   copy for "near you", and near-you is a question about the person asking.

   With `?lat&lng` the answer is the service zone that contains that point,
   which is a real row in `zones` drawn by an administrator. Without them
   there is no honest answer, so the reply says `located: false` and carries
   no locality at all rather than naming a suburb the visitor may be nowhere
   near.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodRestaurant = require('../foodpartners/foodRestaurant.model');
const { findZoneFor } = require('../zones/zone.service');
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

    let area = null;
    if (located) {
      /*
       * The same lookup the address screen uses to answer "do you deliver
       * here". Reused rather than re-implemented, so the feed and the
       * checkout cannot disagree about where Lampose operates.
       *
       * The third argument does the work: `findZoneFor` filters to zones that
       * allow FOOD and are inside their active hours, so a zone drawn for
       * stays only — or one that closes at 11pm — simply does not come back.
       * A non-null answer therefore IS the serviceability answer, and there
       * is nothing left here to re-check.
       */
      const zone = await findZoneFor(lat, lng, 'food');
      if (zone) {
        area = {
          locality: zone.name || '',
          zoneId: zone.zoneId || '',
          note: zone.description || '',
        };
      }
    }

    return res.json({
      success: true,
      data: {
        cuisines,
        dietLabels: DIET_LABEL,
        area,
        located,
        /* Said out loud so the page can draw "we are not here yet" rather
           than an empty feed that looks like a loading failure. Only ever
           true when the caller sent a point — an unlocated visitor gets
           `false` and the page asks for their location instead of promising
           delivery it cannot check. */
        serviceable: Boolean(area),
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getCatalogue, DIET_LABEL };
