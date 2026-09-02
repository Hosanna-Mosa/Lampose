/* ══════════════════════════════════════════════════════════════════════════
   The heart on a dish, and the heart on a kitchen.

   Two lists on `app_customers.foodFavourites`, and one screen that reads them.
   Until now the app kept both in React state — so a favourite did not survive
   backgrounding the app, let alone a reinstall or a second handset. Nothing
   was ever sent anywhere.

   ## Why the list comes back HYDRATED

   The obvious version returns ids and lets the app resolve them against the
   catalogue it has already loaded. That version has a bug the ids version
   cannot fix: the loaded catalogue is one locality's feed, filtered to listed
   restaurants, and a favourite from a kitchen that is closed, out of area, or
   simply not in today's feed resolves to nothing and vanishes from the screen.
   A favourites list that hides your favourites is worse than no list.

   So this reads the products and the restaurants and returns them in exactly
   the shapes `foodDiscovery.controller.js` already sends — its own `menuItem`
   and `listRow`, imported rather than re-derived, because the app has parsers
   for those two objects and a third spelling would fail silently as a blank
   line on a card.

   ## A favourite is kept even when its subject is gone

   A dish that has been delisted, or whose restaurant has been suspended, is
   dropped from the RESPONSE but not from the record. Two reasons: a suspension
   is usually temporary, and deleting somebody's favourites as a side effect of
   a moderation action we may reverse tomorrow is not a trade worth making
   silently. `unavailable` counts what was withheld so the screen can say so
   rather than just being short.

   ## Toggling is idempotent

   `POST` of something already hearted is a 200, not a 409. The client is a
   heart button on a scrolling list; a double tap, a retry after a dropped
   response, and two handsets are all ordinary, and none of them is an error
   worth showing somebody.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const Customer = require('./customer.model');
const FoodProduct = require('../foodpartners/foodProduct.model');
const FoodRestaurant = require('../foodpartners/foodRestaurant.model');
const {
  menuItem, listRow, LISTED, MENU_SELECT, LIST_SELECT,
} = require('../foodpartners/foodDiscovery.controller');

/**
 * A ceiling, so one account cannot grow an unbounded sub-document.
 *
 * Generous on purpose — a student who has eaten somewhere for two years may
 * genuinely have eighty favourites, and a limit that bites in normal use is a
 * limit that produces a support ticket rather than a saved dish.
 */
const MAX_FAVOURITES = 200;

const dbDown = (res) => res.status(503).json({
  success: false,
  code: 'DB_DISCONNECTED',
  message: 'The server is running but not connected to the database.',
});

const badInput = (res, message) => res.status(400).json({
  success: false, code: 'BAD_INPUT', message, error: message,
});

/** The two kinds a heart can be on. Anything else is refused by name. */
const KINDS = ['dish', 'kitchen'];

const cleanId = (value) => String(value || '').trim().slice(0, 64);

/**
 * Read both lists and turn them into things a screen can draw.
 *
 * One query per collection rather than one per favourite: eighty hearted
 * dishes must not be eighty round trips to Mongo on the opening of a tab.
 */
const hydrate = async (customer) => {
  const favourites = customer.foodFavourites || { dishes: [], kitchens: [] };
  const dishRows = Array.isArray(favourites.dishes) ? favourites.dishes : [];
  const kitchenRows = Array.isArray(favourites.kitchens) ? favourites.kitchens : [];

  const productIds = dishRows.map((row) => row.productId);
  /* Every restaurant we need: the ones hearted directly, plus the owners of
     every hearted dish — a dish card names its kitchen, and without this the
     name would be missing on exactly the dishes whose kitchen is not also a
     favourite. */
  const restaurantIds = Array.from(new Set([
    ...kitchenRows.map((row) => row.restaurantId),
    ...dishRows.map((row) => row.restaurantId),
  ].filter(Boolean)));

  const [products, restaurants] = await Promise.all([
    productIds.length
      ? FoodProduct.find({ productId: { $in: productIds } }).select(MENU_SELECT).lean()
      : [],
    restaurantIds.length
      ? FoodRestaurant.find({ restaurantId: { $in: restaurantIds }, ...LISTED })
        .select(LIST_SELECT).lean()
      : [],
  ]);

  const productBy = new Map(products.map((doc) => [doc.productId, doc]));
  const restaurantBy = new Map(restaurants.map((doc) => [doc.restaurantId, doc]));

  let unavailable = 0;

  /* Newest first. A favourites list is read as "what have I been meaning to
     order", and the thing hearted this morning is the likeliest answer. */
  const byNewest = (a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0);

  const dishes = [...dishRows].sort(byNewest).map((row) => {
    const product = productBy.get(row.productId);
    const restaurant = restaurantBy.get(row.restaurantId);
    /* Both are required to render a card: the dish for the price and the
       kitchen for the name and the link. A dish whose restaurant is no longer
       listed is withheld rather than drawn half-complete. */
    if (!product || !restaurant) {
      unavailable += 1;
      return null;
    }
    return {
      ...menuItem(product),
      /*
       * The WHOLE kitchen, nested, not just its id and name.
       *
       * The app derives a dish's meal windows from its kitchen's opening hours
       * — a dish is "lunch" because the kitchen is open at lunch, nothing on
       * the product says so. Sending only a name would leave every favourited
       * dish with no windows, which reads on screen as a dish that is never
       * being cooked.
       *
       * It is the same object the discovery list sends, so the app runs it
       * through the same adapter and there is no third spelling of a kitchen.
       * The repetition across dishes from one kitchen is real and is the
       * cheaper half of the trade: the list is capped at 200 and this removes
       * a whole class of "favourite renders half-dead" bug.
       */
      restaurant: listRow(restaurant, null),
      /* Kept alongside for the callers that only need to label a row. */
      restaurantId: restaurant.restaurantId,
      restaurantName: restaurant.restaurantName,
      savedAt: row.savedAt,
    };
  }).filter(Boolean);

  const kitchens = [...kitchenRows].sort(byNewest).map((row) => {
    const restaurant = restaurantBy.get(row.restaurantId);
    if (!restaurant) {
      unavailable += 1;
      return null;
    }
    return { ...listRow(restaurant, null), savedAt: row.savedAt };
  }).filter(Boolean);

  return { dishes, kitchens, unavailable };
};

// @route   GET /api/v2/customers/food-favourites
// @desc    Everything this diner has hearted, ready to draw
// @access  Customer session
const listFoodFavourites = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const customer = await Customer.findOne({ customerId: req.customer.customerId })
      .select('foodFavourites').lean();

    const data = await hydrate(customer || {});
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
};

// @route   POST /api/v2/customers/food-favourites
// @desc    Heart a dish or a kitchen
// @access  Customer session
const addFoodFavourite = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const kind = String((req.body || {}).kind || '').trim();
    if (!KINDS.includes(kind)) return badInput(res, 'Say whether this is a dish or a kitchen.');

    const id = cleanId((req.body || {}).id);
    if (!id) return badInput(res, 'Which one?');

    const customer = await Customer.findOne({ customerId: req.customer.customerId });
    if (!customer) return badInput(res, 'Please sign in again.');

    if (!customer.foodFavourites) customer.foodFavourites = { dishes: [], kitchens: [] };

    if (kind === 'kitchen') {
      /* The restaurant has to EXIST and be listed. Hearting an id nobody can
         see would put a permanent hole in the favourites screen — one row that
         is silently withheld on every load, with nothing telling the student
         why their tap did nothing. */
      const restaurant = await FoodRestaurant.findOne({ restaurantId: id, ...LISTED })
        .select('restaurantId').lean();
      if (!restaurant) {
        return res.status(404).json({
          success: false, code: 'NOT_FOUND', message: 'We could not find that kitchen.',
        });
      }

      const already = customer.foodFavourites.kitchens.some((row) => row.restaurantId === id);
      if (!already) {
        if (customer.foodFavourites.kitchens.length >= MAX_FAVOURITES) {
          return badInput(res, `You can keep up to ${MAX_FAVOURITES} kitchens.`);
        }
        customer.foodFavourites.kitchens.push({ restaurantId: id, savedAt: new Date() });
        await customer.save();
      }
    } else {
      /* The dish decides its own `restaurantId`. Taking it from the body would
         let a client file a dish under the wrong kitchen, and the favourites
         screen would then draw one restaurant's name over another's food. */
      const product = await FoodProduct.findOne({ productId: id })
        .select('productId restaurantId').lean();
      if (!product) {
        return res.status(404).json({
          success: false, code: 'NOT_FOUND', message: 'We could not find that dish.',
        });
      }

      const already = customer.foodFavourites.dishes.some((row) => row.productId === id);
      if (!already) {
        if (customer.foodFavourites.dishes.length >= MAX_FAVOURITES) {
          return badInput(res, `You can keep up to ${MAX_FAVOURITES} dishes.`);
        }
        customer.foodFavourites.dishes.push({
          productId: id,
          restaurantId: product.restaurantId,
          savedAt: new Date(),
        });
        await customer.save();
      }
    }

    const data = await hydrate(customer);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
};

// @route   DELETE /api/v2/customers/food-favourites/:kind/:id
// @desc    Take the heart off
// @access  Customer session
const removeFoodFavourite = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) return dbDown(res);

    const kind = String(req.params.kind || '').trim();
    if (!KINDS.includes(kind)) return badInput(res, 'Say whether this is a dish or a kitchen.');

    const id = cleanId(req.params.id);
    if (!id) return badInput(res, 'Which one?');

    const customer = await Customer.findOne({ customerId: req.customer.customerId });
    if (!customer) return badInput(res, 'Please sign in again.');

    if (!customer.foodFavourites) customer.foodFavourites = { dishes: [], kitchens: [] };

    /*
     * Removing something that is not there is a 200, not a 404.
     *
     * The caller is a heart button being un-tapped. A second tap, a retry after
     * a dropped response, or the same account on another handset all arrive
     * here, and every one of them wants the same end state: not hearted. An
     * error would be true and useless.
     *
     * Note this deliberately does NOT check the dish still exists — the whole
     * point of un-hearting is often that it does not.
     */
    if (kind === 'kitchen') {
      customer.foodFavourites.kitchens = customer.foodFavourites.kitchens
        .filter((row) => row.restaurantId !== id);
    } else {
      customer.foodFavourites.dishes = customer.foodFavourites.dishes
        .filter((row) => row.productId !== id);
    }

    await customer.save();

    const data = await hydrate(customer);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listFoodFavourites,
  addFoodFavourite,
  removeFoodFavourite,
  MAX_FAVOURITES,
};
