/* ══════════════════════════════════════════════════════════════════════════
   The dishes — a kitchen's menu, one dish sheet, and the "popular" strip.

   Replaces the fixture's `DISHES`, `dishesOf`, `dishById` and
   `popularInBlock`.

     GET /kitchens/:kitchenId/dishes   the menu, grouped into its sections
     GET /dishes/popular               the strip on the feed
     GET /dishes/:dishId               one dish, for the sheet

   ## Why the menu arrives grouped

   The kitchen page renders a heading and then its dishes, repeatedly, in the
   kitchen's own order. Sending a flat array would have every one of those
   components group it again on the client — the same reduce, written once per
   page, drifting the first time somebody sorts one of them differently.

   So the grouping happens here, once, and `sections` on the kitchen row and
   `sections` in this reply are the same strings in the same order.

   ## Sold-out dishes are SENT, not filtered

   `isAvailable: false` means the kitchen has switched a dish off for today.
   It stays on the menu, greyed, because a diner looking for the thing they
   ordered last week needs to learn it is off today — a menu that silently
   omits it reads as though the kitchen stopped making it.

   The one exception is `/dishes/popular`, which is a recommendation strip:
   recommending something nobody can buy is not a recommendation.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodProduct = require('../foodpartners/foodProduct.model');
const FoodRestaurant = require('../foodpartners/foodRestaurant.model');
const { LISTED, dishCard } = require('./foodWeb.shape');

/*
 * The fields a dish card and a dish sheet need, named positively — the same
 * discipline as `CARD_FIELDS`, and for the same reason: these routes are
 * public. `costPrice` and any internal margin field must never appear here.
 */
const DISH_FIELDS = [
  'productId', 'restaurantId', 'productName', 'description',
  'productImage',
  'category', 'isVeg', 'tags',
  'price', 'discountedPrice',
  'ratingAvg', 'ratingCount',
  'serves', 'calories', 'spiceLevel', 'allergenInfo',
  'addOns', 'variants',
  'isAvailable', 'displayOrder',
].join(' ');

/**
 * Is this kitchen one the public may read at all?
 *
 * Called before a menu is served, because a dish carries no approval state of
 * its own — it inherits it from the kitchen. Without this, the menu of a
 * rejected application would stay readable to anybody who kept the URL.
 */
const kitchenIsListed = async (restaurantId) => Boolean(
  await FoodRestaurant.exists({ restaurantId, ...LISTED }),
);

const notFound = (res, code, message) => res.status(404).json({
  success: false, code, message, error: message,
});

/**
 * A kitchen's whole menu, grouped into its sections.
 *
 * @route   GET /api/v2/food-web/kitchens/:kitchenId/dishes
 * @access  public
 *
 * Query:
 *   veg   'on' drops every dish that is not veg. The DISHES are filtered,
 *         which is a different question from the feed's pure-veg filter over
 *         KITCHENS — the fixture's `dietAllowed` keeps them apart for exactly
 *         this reason and so does this.
 */
const listKitchenDishes = async (req, res, next) => {
  try {
    const kitchenId = String(req.params.kitchenId || '').trim();

    if (!await kitchenIsListed(kitchenId)) {
      return notFound(res, 'KITCHEN_NOT_FOUND', 'That kitchen is not available.');
    }

    const filter = { restaurantId: kitchenId };
    if (String(req.query.veg || '') === 'on') filter.isVeg = 'veg';

    const docs = await FoodProduct.find(filter)
      .select(DISH_FIELDS)
      /* The kitchen's own order first, then alphabetical so that a menu where
         nobody set `displayOrder` is still stable between requests rather
         than arriving in whatever order Mongo returned it. */
      .sort({ displayOrder: 1, productName: 1 })
      .lean();

    const dishes = docs.map(dishCard);

    /* Grouped in encounter order, so the sections come out in the kitchen's
       `displayOrder` rather than alphabetically — the kitchen decided that
       rice comes after biryani and the page should agree. */
    const bySection = new Map();
    dishes.forEach((dish) => {
      if (!bySection.has(dish.section)) bySection.set(dish.section, []);
      bySection.get(dish.section).push(dish);
    });

    const sections = [...bySection.entries()].map(([name, items]) => ({ name, dishes: items }));

    return res.json({
      success: true,
      data: { kitchenId, dishes, sections, count: dishes.length },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * The "popular near you" strip on the feed.
 *
 * Ranked by `ratingCount` — how many people have actually rated the dish —
 * which is the only ranking this data can honestly support. See the note on
 * `ordersInBlock` in `foodWeb.shape.js` for why this is NOT a per-hostel
 * count despite the fixture's name for it.
 *
 * Available dishes only: see the file header.
 *
 * @route   GET /api/v2/food-web/dishes/popular
 * @access  public
 *
 * Query:
 *   limit  1–12, default 4 — the fixture showed four
 */
const listPopularDishes = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 4, 1), 12);

    /* Only dishes belonging to a kitchen the public may see. Two queries
       rather than a `$lookup`, because the listed set is small and a lookup
       over `food_products` would scan the larger collection first. */
    const listedIds = (await FoodRestaurant.find(LISTED).select('restaurantId').lean())
      .map((row) => row.restaurantId);

    if (!listedIds.length) {
      return res.json({ success: true, data: { dishes: [], count: 0 } });
    }

    const docs = await FoodProduct.find({
      restaurantId: { $in: listedIds },
      isAvailable: true,
      ratingCount: { $gt: 0 },
    })
      .select(DISH_FIELDS)
      .sort({ ratingCount: -1, ratingAvg: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: { dishes: docs.map(dishCard), count: docs.length },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * One dish — everything the sheet shows.
 *
 * The sheet is where a diner reads the allergens and picks add-ons, so this
 * is the one reply that carries `addOns`, `variants` and `allergens` in full.
 *
 * @route   GET /api/v2/food-web/dishes/:dishId
 * @access  public
 */
const getDish = async (req, res, next) => {
  try {
    const dishId = String(req.params.dishId || '').trim();

    const doc = await FoodProduct.findOne({ productId: dishId }).select(DISH_FIELDS).lean();
    if (!doc) return notFound(res, 'DISH_NOT_FOUND', 'That dish is not available.');

    /* The dish exists, but its kitchen may not be listed — same 404, for the
       reason `getKitchen` gives. */
    if (!await kitchenIsListed(doc.restaurantId)) {
      return notFound(res, 'DISH_NOT_FOUND', 'That dish is not available.');
    }

    return res.json({ success: true, data: { dish: dishCard(doc) } });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listKitchenDishes, listPopularDishes, getDish, DISH_FIELDS };
