/* ══════════════════════════════════════════════════════════════════════════
   The `food_products` collection — one document per dish on a food partner's
   menu.

   Written in bulk by the application route (a partner types their whole menu
   during onboarding and it arrives in one body), then one at a time from the
   Menu screen. Read by the Restaurant Detail screen, which groups a menu by
   `category` and orders it by `displayOrder`, and by the Product Details
   screen, which reads exactly one.

   ## The collection name, and the collision it avoids

   `products` IS ALREADY TAKEN. `properties/product.model.js` declares a model
   called `Product` with no explicit collection name, so mongoose's pluraliser
   claims `products` for it — a leftover from the leads backend that nothing
   routes to, which is precisely what makes it dangerous: it is unused, so
   nobody would notice a second schema quietly writing into it, and the first
   symptom would be a menu item turning up in a leads-panel query with a
   `price` and no `inStock`.

   So the name is pinned as the third argument to `mongoose.model()` and
   prefixed, following the rule `scriper.model.js` sets out: several apps share
   one database and an unprefixed name is one careless rename from colliding.
   The name lives inside this file, so renaming the folder never touches the
   database. Its sibling `food_restaurants` avoids the matching collision with
   `partners`/`app_partners` — see the header of `foodRestaurant.model.js`.

   ## `restaurantId` is a STRING, not an ObjectId ref

   It holds `food_restaurants.restaurantId` — the `FP-XXXXXXXX` public id — and
   never the Mongo `_id`. Every id this module hands out is that string: the
   app stores it, the routes take it in the path, and the logger prints it.

   Mixing the two is how a join quietly returns nothing. `find({ restaurantId:
   someObjectId })` against a string field does not throw and does not warn; it
   matches zero documents, and a restaurant renders with an empty menu that
   looks exactly like a restaurant that has not added dishes yet. One id type,
   used everywhere, is what removes that failure rather than defending against
   it.

   A `populate()`-able ref was the alternative and was rejected for the same
   reason the string won elsewhere in this process: the two screens that read a
   menu already know their restaurant, so a populate would buy nothing, and it
   would make the ObjectId travel to a device that has no business holding one.

   ## What the app may never set

   `ratingAvg` and `ratingCount` are derived from orders that this process does
   not yet place, and are never settable from a request body. As with the
   restaurant's `verificationStatus`, that rule is ENFORCED in the controller's
   whitelist and restated here because this is where the next reader will look
   for it — a schema cannot tell who is writing.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');

const mongoose = require('mongoose');

/*
 * The green/red dot, as a three-valued field rather than a boolean.
 *
 * `isVeg: true|false` cannot say "egg", and in India that is not a detail: it
 * is the whole question for a large part of the customer base, and a dish
 * filed as non-veg because it contains egg is a dish that will not be shown to
 * people who would have ordered it. The name is kept as the spec has it, so
 * the app, the website and this collection all call it the same thing.
 */
const IS_VEG_VALUES = ['veg', 'non-veg', 'egg'];

/*
 * Optional, and `null` is a real answer meaning "this dish has no heat level",
 * which is not the same as mild. A dessert is not mild.
 */
const SPICE_LEVELS = ['mild', 'medium', 'hot'];

/* The same Crockford-ish alphabet as `foodRestaurant.model.js` and
   `support/ticket.model.js`: the full set minus I, O, 0 and 1, because those
   are the four that get read and typed as each other. 256 is a whole multiple
   of 32, so `byte % 32` is uniform. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * The public id: `FPI-` and eight characters. Food Partner Item.
 *
 * A different prefix from the restaurant's `FP-` on purpose. The two ids travel
 * together through every menu route, and a mixed-up pair is then visible at a
 * glance in a log line or a URL rather than being two opaque strings of the
 * same shape. The hyphen makes the test unambiguous: `FP-` and `FPI-` cannot be
 * confused for one another by a prefix check.
 */
const makeProductId = () => {
  const bytes = crypto.randomBytes(8);
  let body = '';
  for (let i = 0; i < 8; i += 1) body += ALPHABET[bytes[i] % ALPHABET.length];
  return `FPI-${body}`;
};

/* Cloudinary's two halves, as on the restaurant: the public id is kept beside
   the URL because deleting an image needs it, and a URL a controller has to
   parse a public id back out of is a URL that breaks the day the folder layout
   changes. */
const imageSchema = new mongoose.Schema(
  {
    url: { type: String, default: '', trim: true },
    publicId: { type: String, default: '', trim: true },
  },
  { _id: false },
);

/*
 * A variant is a CHOICE (Half / Full, 250g / 500g); an add-on is an EXTRA
 * (extra cheese, a raita). Two arrays of the same shape rather than one array
 * with a `kind`, because a checkout treats them differently — exactly one
 * variant is picked and it replaces the base price, while any number of add-ons
 * are picked and they are summed on top. One array would leave that difference
 * to a flag that a caller could get wrong, and getting it wrong means charging
 * somebody twice for a full plate.
 *
 * `price` here is the absolute price of the option, not a delta. A delta is
 * cheaper to store and impossible to check: a "-40" on a half plate reads as a
 * discount, a refund or a typo depending on who is looking.
 */
const optionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const foodProductSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, unique: true, index: true },

    /* `food_restaurants.restaurantId` — the `FP-` string. See the header: never
       an ObjectId, and never the parent's `_id`. */
    restaurantId: { type: String, required: true, index: true },

    productName: { type: String, required: true, trim: true },

    productImage: { type: imageSchema, default: () => ({}) },

    /* The extra shots on the Product Details screen. Separate from
       `productImage` because the card, the list row and the cart all show one
       image and must all show the SAME one — deriving "the first of the
       gallery" would let a partner reorder their photos and silently change
       every thumbnail in the app. */
    galleryImages: { type: [imageSchema], default: [] },

    description: { type: String, default: '', trim: true },

    /*
     * "Starters", "Main Course", "Beverages" — a free string, not an enum.
     *
     * It is the partner's own section heading, typed on the menu screen, and it
     * is what the Restaurant Detail screen groups by. An enum would refuse
     * "Biryanis" and "Tandoor" from the kitchens that sell nothing else. The
     * cost is that "Beverages" and "beverages" are two groups; the controller
     * trims, and matching is left case-sensitive so a partner who capitalises
     * deliberately is not overruled.
     */
    category: { type: String, required: true, trim: true },

    isVeg: { type: String, enum: IS_VEG_VALUES, default: 'veg', index: true },

    price: { type: Number, required: true, min: 0 },

    /*
     * The struck-through original is `price`; this is what is charged. Null
     * rather than 0 when there is no offer — 0 is a free dish, and a schema that
     * cannot tell those apart will eventually give one away.
     *
     * A discount has to BE a discount. A `discountedPrice` at or above `price`
     * renders as a struck-through number lower than the one beside it, which
     * reads as a price rise dressed up as an offer. Cheaper to refuse here than
     * to explain to a customer later.
     *
     * A path validator rather than a `pre('validate')` hook, deliberately: a
     * hook can only report the failure as a plain `Error`, and every controller
     * in this process branches on `err.name === 'ValidationError'` to decide
     * between a 400 and a 500 — so the hook version answers "server error" for
     * a partner's typo. This reports the path by name, and it runs under
     * `validateSync()` as well as `save()`.
     *
     * `this` is the document during document validation and is NOT the document
     * under `findOneAndUpdate` with `runValidators`, where mongoose has only a
     * query and `price` may not even be in the update. The guard below passes in
     * that case rather than throwing on `this.price`, which is why the PATCH
     * route loads the document and saves it instead of updating in place.
     */
    discountedPrice: {
      type: Number,
      default: null,
      min: 0,
      validate: {
        validator: function belowPrice(value) {
          if (value === null || value === undefined) return true;
          const price = this && typeof this.price === 'number' ? this.price : null;
          if (price === null) return true;
          return value < price;
        },
        message: 'discountedPrice must be lower than price.',
      },
    },

    /* The kitchen's own "sold out" switch, per item. Default true: a dish that
       has just been added is one somebody intends to sell. */
    isAvailable: { type: Boolean, default: true },

    variants: { type: [optionSchema], default: [] },
    addOns: { type: [optionSchema], default: [] },

    /* `null` means the dish has no heat level at all — see SPICE_LEVELS. The
       enum includes null explicitly because mongoose validates an enum against
       a value that is present, and `default: null` makes it present. */
    spiceLevel: { type: String, enum: [...SPICE_LEVELS, null], default: null },

    /* How many people one order feeds. Shown as "Serves 2" beside the price,
       which is the number that decides whether a ₹340 biryani is expensive. */
    serves: { type: Number, default: 1, min: 0 },

    /* "Bestseller", "Chef's Special", "New" — the badges on the card. Free
       strings and deliberately not an enum: the list is a marketing decision
       that changes faster than a schema migration, and an unknown tag renders
       as a plain chip rather than breaking the screen. */
    tags: { type: [String], default: [] },

    /* Declared by the partner, and shown as declared. Nothing in this process
       verifies it and nothing should imply that it has: the app labels it as
       the restaurant's own information for the same reason a menu card does. */
    allergenInfo: { type: [String], default: [] },

    calories: { type: Number, default: null, min: 0 },

    /* Derived from orders that do not exist yet — there is no ordering module
       in this process — so both stay 0 until one writes them. Zero means "no
       ratings", and the app shows no stars rather than a nought-star dish.
       Never settable from a request body; see the header. */
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },

    /*
     * Minutes, and it OVERRIDES the restaurant's `avgPreparationTime` when set.
     *
     * Null rather than 0 for "no override", because 0 is a legitimate number of
     * minutes for a bottle of water taken off a shelf, and an ETA that cannot
     * tell "instant" from "unspecified" is an ETA that will one day promise a
     * biryani in no time at all.
     */
    preparationTime: { type: Number, default: null, min: 0 },

    /*
     * Where the dish sits inside its category. Partner-controlled, because a
     * menu is ordered the way its kitchen wants it read and neither
     * alphabetical nor newest-first is that order.
     *
     * Ties are ordinary: everything defaults to 0 until somebody drags
     * something. The read path sorts by `displayOrder` and then by `createdAt`
     * so that an unordered menu still comes back in a stable, sensible order
     * rather than in whatever order the storage engine happened to walk.
     */
    displayOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'food_products',
    /* On, matching the restaurant. The menu routes hand a whitelisted object to
       the document, but a whitelist is a controller's promise and this is the
       schema's. */
    strict: true,
  },
);

/* The Restaurant Detail screen's query, exactly: one restaurant's menu, grouped
   by category, in the partner's own order. */
foodProductSchema.index({ restaurantId: 1, category: 1, displayOrder: 1 });

/* The customer-facing read, which additionally drops what is sold out. A
   separate index rather than a prefix of the one above because `isAvailable` is
   not `category`, and a query filtering on availability cannot use an index
   that puts category first. */
foodProductSchema.index({ restaurantId: 1, isAvailable: 1 });

/**
 * The wire shape.
 *
 * Nothing here is secret — a menu is public by definition — so this drops only
 * `__v`, which is mongoose's own bookkeeping and means nothing to a client that
 * would try to send it back.
 */
foodProductSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const FoodProduct = mongoose.models.FoodProduct
  || mongoose.model('FoodProduct', foodProductSchema, 'food_products');

module.exports = FoodProduct;

module.exports.makeProductId = makeProductId;
module.exports.IS_VEG_VALUES = IS_VEG_VALUES;
module.exports.SPICE_LEVELS = SPICE_LEVELS;
