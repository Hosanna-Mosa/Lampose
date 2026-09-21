/* ══════════════════════════════════════════════════════════════════════════
   The kitchens the website's food feed draws.

   Replaces the fixture's `KITCHENS` export and its `kitchenById` lookup.

     GET /kitchens              the feed
     GET /kitchens/:kitchenId   one kitchen, for the kitchen page

   ## Unauthenticated, on purpose

   A student compares kitchens before they have an account, the same way they
   compare listings. Asking them to sign in to read a menu is how they leave.
   Nothing here needs to know who is asking — `?lat&lng` is the only thing
   that personalises a reply, and it is a pair of numbers rather than a
   session.

   ## Two aggregates the row cannot compute for itself

   `costForOne` and `pureVeg` are facts about a kitchen's MENU, not about its
   own document, and the feed shows thirty kitchens. Asking per row would be
   thirty round trips.

   So both are collected in ONE `$group` over `food_products`, keyed by
   restaurant, and handed to the shaper. `sections` comes out of the same
   pass, because the kitchen page wants the menu's headings and they are the
   distinct `category` values of exactly these documents.

   ## Why the menu pass filters on `isAvailable`

   A kitchen that has switched its only non-veg dish off for the evening is
   pure veg for the evening, and the badge should say so. The same reasoning
   applies to `costForOne`: an average over dishes nobody can order is an
   average of a menu that is not on sale.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodRestaurant = require('../foodpartners/foodRestaurant.model');
const FoodProduct = require('../foodpartners/foodProduct.model');
const { LISTED, kitchenCard, rupees } = require('./foodWeb.shape');

/*
 * The fields a kitchen card needs, named positively.
 *
 * What is deliberately absent: `ownerName`, `ownerPhone`, `ownerEmail`,
 * `passwordHash`, `payout`, `payoutAccounts`, `verificationDocuments`,
 * `aadhaar`, `gstNumber`, `panNumber` and `contract`. These routes are
 * public; see the header of `foodWeb.shape.js` for why this is a list of what
 * to include rather than a list of what to strip.
 */
const CARD_FIELDS = [
  'restaurantId', 'restaurantName', 'description', 'cuisineTypes',
  'logoImage', 'coverBannerImage',
  'address', 'location',
  'ratingAvg', 'ratingCount',
  'deliveryFee', 'packagingCharge', 'minOrderValue', 'avgPreparationTime',
  'openState', 'openingHours',
  'acceptsCod', 'acceptsOnlinePayment',
  'fssaiLicenseNumber',
  'createdAt',
].join(' ');

/**
 * Menu aggregates for a set of kitchens, in one pass.
 *
 * Returns a Map keyed by `restaurantId`. A kitchen with no menu is ABSENT
 * from the map rather than present with zeroes — the caller then leaves
 * `pureVeg` false, which is the honest answer for a kitchen whose menu nobody
 * has typed yet.
 *
 * @param {string[]} restaurantIds
 * @returns {Promise<Map<string, {costForOne: number, pureVeg: boolean, sections: string[]}>>}
 */
const menuAggregates = async (restaurantIds) => {
  if (!restaurantIds.length) return new Map();

  const rows = await FoodProduct.aggregate([
    { $match: { restaurantId: { $in: restaurantIds }, isAvailable: true } },
    {
      $group: {
        _id: '$restaurantId',
        /* The list price, not the discounted one: "cost for one" is what the
           menu asks, and a card that quoted today's offer would change every
           time a kitchen ran one. */
        avgPrice: { $avg: '$price' },
        /*
         * $MIN, and the choice is the whole correctness of the badge.
         *
         * The three stored values sort `'egg' < 'non-veg' < 'veg'`, so 'veg'
         * is the LARGEST. `$max` therefore returns 'veg' as soon as ONE veg
         * dish exists — which marked a biryani house pure veg in testing.
         * `$min` returns 'veg' only when there is nothing smaller on the
         * menu, which is the question actually being asked.
         */
        minDiet: { $min: '$isVeg' },
        sections: { $addToSet: '$category' },
      },
    },
  ]);

  return new Map(rows.map((row) => [
    row._id,
    {
      costForOne: rupees(row.avgPrice),
      pureVeg: row.minDiet === 'veg',
      sections: (row.sections || []).filter(Boolean).sort(),
    },
  ]));
};

/**
 * The feed.
 *
 * @route   GET /api/v2/food-web/kitchens
 * @access  public
 *
 * Query:
 *   lat, lng     the diner's point. Both or neither — one alone is ignored
 *                rather than guessed at, and without them `walkMinutes` is
 *                null and the order is newest-first.
 *   cuisine      one of `cuisineTypes`, exactly as the catalogue lists it
 *   veg          'on'   hide kitchens that cook anything but veg
 *   openNow      'true' hide kitchens that are not taking orders
 *   search       matches the kitchen's name
 *   limit        1–60, default 30
 */
const listKitchens = async (req, res, next) => {
  try {
    const filter = { ...LISTED };

    const cuisine = String(req.query.cuisine || '').trim();
    if (cuisine) filter.cuisineTypes = cuisine;

    const search = String(req.query.search || '').trim();
    if (search) {
      /* Escaped before it becomes a pattern — a diner pasting "Chai & Co."
         must not build a regex, and `(` alone would throw. */
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.restaurantName = new RegExp(safe, 'i');
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 60);

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const located = Number.isFinite(lat) && Number.isFinite(lng);

    let docs;
    if (located) {
      /* `$geoNear` must be the first stage of the pipeline and sorts by
         distance for free, which is the order a feed wants: the kitchen you
         can walk to is the one worth showing first. */
      docs = await FoodRestaurant.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [lng, lat] },
            distanceField: 'distanceMeters',
            query: filter,
            spherical: true,
          },
        },
        { $limit: limit },
      ]);
    } else {
      docs = await FoodRestaurant.find(filter)
        .select(CARD_FIELDS)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    }

    const aggregates = await menuAggregates(docs.map((doc) => doc.restaurantId));

    let kitchens = docs.map((doc) => kitchenCard(doc, {
      ...(aggregates.get(doc.restaurantId) || {}),
      distanceMeters: doc.distanceMeters,
    }));

    /* Filtered AFTER shaping rather than in the query, because both of these
       are answers the shaper computed: `pureVeg` came out of the menu pass and
       `openNow` out of the timetable. Re-expressing either as Mongo predicates
       would be a second implementation of the same rule. */
    if (String(req.query.veg || '') === 'on') kitchens = kitchens.filter((k) => k.pureVeg);
    if (String(req.query.openNow || '') === 'true') kitchens = kitchens.filter((k) => k.openNow);

    return res.json({ success: true, data: { kitchens, count: kitchens.length, located } });
  } catch (error) {
    return next(error);
  }
};

/**
 * One kitchen — the header of the kitchen page.
 *
 * Its menu is a SEPARATE call (`/kitchens/:kitchenId/dishes`). Two requests
 * rather than one nested reply, because the page renders its header while the
 * menu is still arriving, and because a diner reopening a kitchen from their
 * history wants the header instantly.
 *
 * @route   GET /api/v2/food-web/kitchens/:kitchenId
 * @access  public
 */
const getKitchen = async (req, res, next) => {
  try {
    const kitchenId = String(req.params.kitchenId || '').trim();

    const doc = await FoodRestaurant.findOne({ restaurantId: kitchenId, ...LISTED })
      .select(CARD_FIELDS)
      .lean();

    /* The same 404 for "no such kitchen" and "that kitchen is not listed".
       A different answer for the second would tell anybody holding a URL
       which applications exist and were refused. */
    if (!doc) {
      const message = 'That kitchen is not available.';
      return res.status(404).json({
        success: false, code: 'KITCHEN_NOT_FOUND', message, error: message,
      });
    }

    const aggregates = await menuAggregates([doc.restaurantId]);
    const kitchen = kitchenCard(doc, aggregates.get(doc.restaurantId) || {});

    return res.json({ success: true, data: { kitchen } });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listKitchens, getKitchen, menuAggregates, CARD_FIELDS };
