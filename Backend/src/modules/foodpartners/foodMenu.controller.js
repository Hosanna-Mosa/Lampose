/* ══════════════════════════════════════════════════════════════════════════
   The partner's own menu — five handlers behind a food-partner session.

   List, create, update, delete, and the one that matters most in a busy
   kitchen: switch a dish off. Every one of them is scoped to
   `req.foodPartner.restaurantId`, which `requireFoodPartner` put on the
   request after verifying a token carrying `typ: 'foodpartner'` AND loading
   the restaurant out of `food_restaurants`.

   ## Every lookup filters on restaurantId as well as productId

   Never on the productId alone. `FPI-` plus eight characters is short and
   readable BECAUSE it is read off a screen, put in a URL and pasted into a
   support chat, and that is exactly what makes it a poor secret — the same
   reasoning `support/ticket.controller.js` gives for its reference. Guessing
   one must not be enough to edit somebody else's menu, and "edit" here means
   changing the price of a dish that customers are ordering from right now.

   The restaurantId in the filter comes from the token, never from the body or
   the query. A client that names its own `restaurantId` names somebody else's
   restaurant, and that is the whole attack.

   ## The 404 is the same in both cases

   "There is no such dish" and "that dish is not yours" answer with the same
   words and the same code. Telling them apart would turn the id into an
   oracle for whether a given dish exists, which is a menu's worth of a
   competitor's catalogue for the cost of a loop.

   ## Why this file reads a body itself rather than calling the util

   `foodPartner.util.js` owns `sanitiseProduct`, and it is CREATE-shaped: it
   fills in every key, defaults `spiceLevel` to null and `displayOrder` to the
   item's position in the arriving list, because an application is a document
   being written from nothing. A PATCH is the opposite problem — it has to tell
   "the partner did not touch this field" from "the partner cleared it", and a
   reader that cannot tell those apart wipes a description every time somebody
   edits a price. The util's `pick` deliberately skips an empty string for that
   same create-shaped reason, so it cannot be borrowed here.

   So the difference between the two readers is the semantics, not the taste:
   `sent()` below answers "was this key in the body", where `pick()` answers
   "did this field arrive filled in". What is NOT restated is anything that
   could drift into being wrong — `IS_VEG_VALUES` and `SPICE_LEVELS` are
   imported from the model, so the values this file accepts and the values the
   schema will store cannot disagree. A whitelist that has its own copy of an
   enum is a `ValidationError` answered as a 500 the day one of them grows.

   Every value written is coerced to a string, a number or a boolean on the way
   in. That is not tidiness: it is what stops `{ "price": { "$gt": "" } }` in a
   JSON body from reaching a query or a document as an operator.

   ## What the app may never set

   `productId` and `restaurantId` are the server's to issue, and `ratingAvg`
   and `ratingCount` are derived from orders this process does not yet place.
   All four are absent from the whitelist rather than deleted from the body
   afterwards — a deny-list has to be updated every time the schema grows a
   field, and the day somebody forgets is the day a client can set it.

   ## displayOrder defaults to the END of its category

   Not 0. A new dish that silently jumps to the top of the menu is a partner
   adding a bottle of water and finding it above their biryani, and the only
   way back is dragging every row. So a create with no `displayOrder` reads the
   highest one in that category and adds one, which the
   `{ restaurantId, category, displayOrder }` index answers without touching a
   document body. Ties are ordinary and harmless: the read path breaks them by
   `createdAt`, so two dishes added in the same second stay in the order they
   were added.

   The same rule catches a MOVE. Changing a dish's category while keeping the
   display order it had in the old one drops it into an arbitrary position in
   the new one, so a category change with no explicit order sends it to the end
   as though it had just been added — which, in that section, it has.

   ## Availability is its own endpoint

   `PATCH /me/products/:productId/availability` exists because switching a dish
   off is the one thing a partner does mid-service, twenty times in an evening,
   from a list — and it must not require sending the whole product back. A full
   round-trip from a list screen carries whatever the list was holding, which
   at 8pm is the price from before somebody edited it on the till: a stale
   write dressed as a toggle. One field in, one field out, no chance of that.

   It is also the one place `findOneAndUpdate` is right. Everything else here
   loads the document and saves it, because `discountedPrice`'s validator needs
   to see `price` on the same document and cannot under a query update (the
   model header spells this out). `isAvailable` has no such neighbour, and four
   taps in two seconds through load-then-save is four documents racing to write
   back what each of them read.

   ## Deleting is a real delete

   `isAvailable` IS the soft delete, and a second, invisible one would leave
   rows nobody can order, nobody can see and nobody can find in order to remove
   them. What is deliberately NOT deleted is the Cloudinary asset: nothing in
   this process counts references to an image, a gallery photograph can have
   been copied onto another dish, and a wrongly deleted image is a broken card
   on a live menu, where an orphaned one is a few kilobytes. A sweeper that can
   see every reference is the right place for that, not a request handler.

   ## Failures carry all four keys

   `{ success, code, message, error }` on every one, matching the rest of this
   module: the website reads `message`, the apps switch on `code`, and older
   screens still render `error`. Any one of the three missing is a blank alert
   on somebody's phone.

   Every line printed goes through `foodPartner.log.js` rather than a bare
   `console.log`, so the whole module keeps one badge, one grep string and one
   `config.log.enabled` guard.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

const FoodProduct = require('./foodProduct.model');
const {
  logMenuChange, logRejected, logDependencyMissing, logError,
} = require('./foodPartner.log');

const { makeProductId, IS_VEG_VALUES, SPICE_LEVELS } = FoodProduct;

/* ── The numbers ──────────────────────────────────────────────────────────
   A menu is read whole, because the screen groups it by category and a
   "Beverages" heading on page three is not a menu. So there is no paging, and
   `MENU_LIMIT` is a ceiling on damage rather than a page size.

   It is enforced on the WRITE as well, and that pairing is the point: a read
   that truncates silently while creates carry on accepting items is how a
   partner loses dishes they can still see in their own till. Five hundred is
   several times the largest real menu and small enough that a runaway client
   loop is stopped before it fills a collection. */
const MENU_LIMIT = 500;

/* The schema caps none of these, so the cap lives where the sentence
   explaining it can be shown to the partner. They are far above any real
   value — a dish name is one line on a card — and the only body they refuse is
   one no kitchen typed. Worth knowing when reading a refusal: it fires only
   when the field is actually SENT, so an app PATCHing a price never meets it,
   and an app round-tripping a whole product with an over-long name is told
   which field to shorten. */
const NAME_MAX = 140;
const CATEGORY_MAX = 80;
const DESCRIPTION_MAX = 2000;

/* Named once so a log line and a 503 cannot describe different routes. */
const ROUTES = {
  list: 'GET /api/v2/food-partners/me/products',
  create: 'POST /api/v2/food-partners/me/products',
  update: 'PATCH /api/v2/food-partners/me/products/:productId',
  remove: 'DELETE /api/v2/food-partners/me/products/:productId',
  availability: 'PATCH /api/v2/food-partners/me/products/:productId/availability',
};

/* ══════════════════════════════════════════════════════════════════════════
   Replies
   ══════════════════════════════════════════════════════════════════════════ */

const fail = (res, status, code, message, extra = {}) => res.status(status).json({
  success: false, code, message, error: message, ...extra,
});

/* `fields` travels beside the sentence so the app can put a red border on the
   right input instead of a red banner over the whole form. */
const badInput = (res, message, fields = [], code = 'BAD_INPUT') => fail(
  res,
  400,
  code,
  message,
  fields.length ? { fields } : {},
);

const MISSING = 'We could not find that dish on your menu.';

const notFound = (res, restaurantId, productId) => {
  /* The id that missed is printed even though the reply will not say which of
     the two cases it was. The console is ours; the oracle is the client's. */
  logRejected('no such dish on this menu', {
    code: 'NOT_FOUND', field: `productId ${productId}`, restaurantId, status: 404,
  });
  return fail(res, 404, 'NOT_FOUND', MISSING);
};

/**
 * The named 503, printed as well as answered.
 *
 * The router mounts `requireLamposeDb` in front of every route in this module,
 * so this rarely fires — but the connection can drop between that guard and
 * this query, and a handler that assumes where it was mounted is a handler
 * that breaks the day it is mounted somewhere else. It costs one integer
 * comparison, and without it the query buffers for ten seconds and surfaces as
 * a generic 500 that reads as "the server is broken".
 */
const dbDown = (res, route) => {
  logDependencyMissing({
    dependency: 'MongoDB',
    code: 'DB_DISCONNECTED',
    route,
    hint: 'the menu lives in food_products; nothing is read or written until the connection is back',
  });
  return fail(
    res,
    503,
    'DB_DISCONNECTED',
    'The server is running but not connected to the database.',
  );
};

const dbUp = () => mongoose.connection.readyState === 1;

/* ══════════════════════════════════════════════════════════════════════════
   Reading a body

   `sent` is the whole difference between this file and the util's create-shaped
   whitelist: it answers "was this key in the body", which is what lets a PATCH
   tell an untouched field from a cleared one. An absent key is left alone; a
   `null` or an empty string is an instruction to clear, on the fields where the
   schema has somewhere empty to put.
   ══════════════════════════════════════════════════════════════════════════ */

const sent = (source, ...aliases) => {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias) && source[alias] !== undefined) {
      return { key: alias, value: source[alias] };
    }
  }
  return null;
};

const str = (value) => (value === undefined || value === null ? '' : String(value).trim());

/**
 * Three answers, not two: a number, `null` for a box that was cleared, and
 * `undefined` for something that is not a number at all.
 *
 * The last one is why this is not the util's `num`. In a bulk application an
 * unreadable price is one row of eighty and the run must not stop for it; in a
 * single edit it is the field the partner just typed, and quietly storing
 * "nothing" for "12.5o" would show them a dish priced at zero.
 *
 * Only strings and numbers are read. `Number([])` is 0 and `Number(true)` is 1,
 * so accepting anything else turns an empty array in a JSON body into a free
 * dish.
 */
const readNumber = (value) => {
  if (value === null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** A boolean, or undefined when what arrived is not one. */
const readBoolean = (value) => {
  if (value === true || value === false) return value;
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return undefined;
};

/**
 * The green/red dot. Same readings as the util's, for the same reason: the app
 * sends a string, older form code sends a boolean where `true` meant
 * vegetarian, and both are in the wild.
 *
 * Unrecognised is refused here rather than falling through to the schema
 * default, which is what the bulk path does. A single edit can afford to ask
 * again, and this is the one field where guessing wrong puts a non-vegetarian
 * dish behind a green dot.
 */
const readIsVeg = (value) => {
  if (value === true) return 'veg';
  if (value === false) return 'non-veg';
  const text = str(value).toLowerCase().replace(/[\s_]+/g, '-');
  if (IS_VEG_VALUES.includes(text)) return text;
  if (text === 'nonveg' || text === 'non-vegetarian') return 'non-veg';
  if (text === 'vegetarian') return 'veg';
  return undefined;
};

/**
 * A Cloudinary asset, however it was handed over — a bare URL, this module's
 * own `{ url, publicId }`, or the raw upload response (`secure_url` /
 * `public_id`), the last because an app that forwards what
 * `POST /uploads/images` gave it is doing the obvious thing.
 *
 * An object always yields something, and an empty one clears the field: a
 * round-tripped product whose image was never set arrives as `{ url: '' }`, and
 * refusing that would make "save" fail on a dish with no photograph. A number
 * or a boolean is not an image and returns undefined, which is refused by the
 * caller. A `publicId` with no URL is dropped — it names a file nothing can
 * show.
 */
const readImage = (value) => {
  if (value === null) return { url: '', publicId: '' };
  if (typeof value === 'string') return { url: value.trim(), publicId: '' };
  if (typeof value !== 'object') return undefined;
  const url = str(value.url ?? value.secure_url ?? value.uri);
  return { url, publicId: url ? str(value.publicId ?? value.public_id) : '' };
};

/** Trimmed, non-empty, de-duplicated. A bare string is one tag, not a list. */
const readStrings = (value) => {
  const items = Array.isArray(value) ? value : [value];
  const seen = new Set();
  return items.map(str).filter((item) => item && !seen.has(item) && seen.add(item));
};

/**
 * The whole body, reduced to what may be stored.
 *
 * Returns `{ set, problems }`. `set` holds only the fields that were actually
 * sent and are actually storable; `problems` is every reason a field was not,
 * as `{ field, message }` so the reply can carry both a sentence and the input
 * to highlight.
 *
 * Problems are AGGREGATED rather than thrown on the first one. A partner
 * fixing a form one refusal at a time is a partner making four round trips to
 * learn about four fields that were all wrong when they pressed save.
 *
 * `productId`, `restaurantId`, `ratingAvg` and `ratingCount` appear nowhere
 * below — see the header.
 */
const readMenuFields = (body) => {
  const source = body && typeof body === 'object' ? body : {};
  const set = {};
  const problems = [];
  const refuse = (field, message) => problems.push({ field, message });

  /* ── What it is ────────────────────────────────────────────────────────
     Name, category and price are the three a dish cannot be sold without, so
     an empty string here is a refusal rather than a clear. */

  const name = sent(source, 'productName', 'name', 'itemName');
  if (name) {
    const text = str(name.value);
    if (!text) refuse('productName', 'A dish needs a name.');
    else if (text.length > NAME_MAX) refuse('productName', `Please keep the dish name under ${NAME_MAX} characters.`);
    else set.productName = text;
  }

  const category = sent(source, 'category', 'categoryName', 'section');
  if (category) {
    const text = str(category.value);
    if (!text) refuse('category', 'A dish needs a section — "Starters", "Main Course", "Beverages".');
    else if (text.length > CATEGORY_MAX) refuse('category', `Please keep the section name under ${CATEGORY_MAX} characters.`);
    else set.category = text;
  }

  const description = sent(source, 'description');
  if (description) {
    const text = str(description.value);
    if (text.length > DESCRIPTION_MAX) refuse('description', `Please keep the description under ${DESCRIPTION_MAX} characters.`);
    else set.description = text;
  }

  const veg = sent(source, 'isVeg', 'foodType', 'type');
  if (veg) {
    const parsed = readIsVeg(veg.value);
    if (!parsed) refuse('isVeg', `Say whether this is ${IS_VEG_VALUES.join(', ')}.`);
    else set.isVeg = parsed;
  }

  /* ── Pictures ──────────────────────────────────────────────────────────
     Uploaded through `POST /uploads/images` first; what arrives here is what
     that route returned. Nothing in this file talks to Cloudinary. */

  const image = sent(source, 'productImage', 'image', 'photo');
  if (image) {
    const parsed = readImage(image.value);
    if (!parsed) refuse('productImage', 'That is not an image. Upload it first and send back what /uploads/images returned.');
    else set.productImage = parsed;
  }

  const gallery = sent(source, 'galleryImages', 'images', 'gallery');
  if (gallery) {
    if (!Array.isArray(gallery.value)) {
      refuse('galleryImages', 'The gallery must be a list of images.');
    } else {
      /* An empty list clears the gallery, which is the only way to remove the
         last photograph. Entries with no URL are dropped rather than refused:
         they are a form's empty rows, not a mistake worth stopping a save for. */
      set.galleryImages = gallery.value
        .map(readImage)
        .filter((entry) => entry && entry.url);
    }
  }

  /* ── Money ─────────────────────────────────────────────────────────────*/

  const price = sent(source, 'price', 'basePrice');
  if (price) {
    const parsed = readNumber(price.value);
    if (parsed === undefined) refuse('price', 'That price is not a number.');
    else if (parsed === null) refuse('price', 'A dish needs a price.');
    else if (parsed < 0) refuse('price', 'A price cannot be negative.');
    else set.price = parsed;
  }

  /*
   * `null` when there is no offer, never 0 — the model keeps those apart so
   * that a schema cannot give food away, and an empty numeric input from a
   * React Native form arrives as `''` or `0`.
   *
   * Whether it is BELOW the price is checked later, against the price the dish
   * will end up with, which on a PATCH may be one that is not in this body.
   */
  const discounted = sent(source, 'discountedPrice', 'offerPrice');
  if (discounted) {
    const parsed = readNumber(discounted.value);
    if (parsed === undefined) refuse('discountedPrice', 'That offer price is not a number.');
    else if (parsed === null || parsed <= 0) set.discountedPrice = null;
    else set.discountedPrice = parsed;
  }

  /* ── Choices and extras ────────────────────────────────────────────────
     A variant is a CHOICE that replaces the base price (Half / Full); an
     add-on is an EXTRA that is summed on top. Two arrays of the same shape, and
     the model header explains why they are not one array with a flag.

     A row that cannot be stored is REFUSED here, where the bulk application
     path drops it. On a menu of eighty items, stopping for one bad row loses
     the other seventy-nine; on a single dish, a silently vanishing "Half plate"
     is a partner who thinks they saved something they did not. */
  const readOptions = (field, label, value) => {
    if (!Array.isArray(value)) {
      refuse(field, `${label} must be a list.`);
      return undefined;
    }
    const rows = [];
    value.forEach((entry, index) => {
      const row = entry && typeof entry === 'object' ? entry : {};
      const optionName = str(row.name ?? row.label ?? row.title);
      const optionPrice = readNumber(row.price ?? row.amount);
      if (!optionName) {
        refuse(field, `${label} ${index + 1} has no name.`);
        return;
      }
      if (optionPrice === null || optionPrice === undefined || optionPrice < 0) {
        /* Absolute, not a delta — see the model. "-40" off a full plate reads
           as a discount, a refund or a typo depending on who is looking. */
        refuse(field, `"${optionName}" needs its own full price, zero or more.`);
        return;
      }
      rows.push({ name: optionName, price: optionPrice });
    });
    return rows;
  };

  const variants = sent(source, 'variants', 'portions');
  if (variants) {
    const rows = readOptions('variants', 'Every portion', variants.value);
    if (rows) set.variants = rows;
  }

  const addOns = sent(source, 'addOns', 'addons', 'extras');
  if (addOns) {
    const rows = readOptions('addOns', 'Every add-on', addOns.value);
    if (rows) set.addOns = rows;
  }

  /* ── The rest of the card ──────────────────────────────────────────────*/

  const spice = sent(source, 'spiceLevel', 'spice');
  if (spice) {
    const text = str(spice.value).toLowerCase();
    /* Empty is a real answer meaning "this dish has no heat level", which is
       not the same as mild. A dessert is not mild. */
    if (!text) set.spiceLevel = null;
    else if (!SPICE_LEVELS.includes(text)) {
      refuse('spiceLevel', `"${text}" is not a spice level. Use ${SPICE_LEVELS.join(', ')}, or leave it empty.`);
    } else set.spiceLevel = text;
  }

  const serves = sent(source, 'serves', 'servingSize');
  if (serves) {
    const parsed = readNumber(serves.value);
    if (parsed === undefined) refuse('serves', 'That serving size is not a number.');
    else if (parsed !== null && parsed < 0) refuse('serves', 'A serving size cannot be negative.');
    /* Cleared is left alone rather than written: the model's default is 1, and
       "serves nobody" is not something a partner means to say. */
    else if (parsed !== null) set.serves = parsed;
  }

  const tags = sent(source, 'tags');
  if (tags) set.tags = readStrings(tags.value);

  /* Declared by the partner and shown as declared — nothing in this process
     verifies it, and the app labels it as the restaurant's own information for
     the same reason a menu card does. */
  const allergens = sent(source, 'allergenInfo', 'allergens');
  if (allergens) set.allergenInfo = readStrings(allergens.value);

  /* These two share the model's `null` for "unspecified", so a cleared box is
     written as null rather than skipped. Zero calories and zero minutes are
     both real values — a bottle of water is taken off a shelf — which is
     exactly why the schema does not use 0 to mean "not answered". */
  const calories = sent(source, 'calories');
  if (calories) {
    const parsed = readNumber(calories.value);
    if (parsed === undefined) refuse('calories', 'That calorie count is not a number.');
    else if (parsed !== null && parsed < 0) refuse('calories', 'A calorie count cannot be negative.');
    else set.calories = parsed;
  }

  const prep = sent(source, 'preparationTime', 'prepTime');
  if (prep) {
    const parsed = readNumber(prep.value);
    if (parsed === undefined) refuse('preparationTime', 'That preparation time is not a number.');
    else if (parsed !== null && parsed < 0) refuse('preparationTime', 'A preparation time cannot be negative.');
    else set.preparationTime = parsed;
  }

  const available = sent(source, 'isAvailable', 'available', 'inStock');
  if (available) {
    const parsed = readBoolean(available.value);
    if (parsed === undefined) refuse('isAvailable', 'Say whether this dish is available, true or false.');
    else set.isAvailable = parsed;
  }

  const order = sent(source, 'displayOrder', 'order', 'position');
  if (order) {
    const parsed = readNumber(order.value);
    if (parsed === undefined) refuse('displayOrder', 'That position is not a number.');
    /* Cleared means "wherever you like", which is what the caller's
       end-of-category default already answers. */
    else if (parsed !== null) set.displayOrder = parsed;
  }

  return { set, problems };
};

/** The aggregated refusal, printed and answered in one place. */
const refuseWith = (res, problems, restaurantId) => {
  const message = problems.map((problem) => problem.message).join(' ');
  const fields = [...new Set(problems.map((problem) => problem.field))];
  logRejected(`the dish was refused — ${message}`, {
    code: 'BAD_INPUT',
    field: fields.join(', '),
    restaurantId,
    status: 400,
  });
  return badInput(res, message, fields);
};

/**
 * A discount has to BE a discount.
 *
 * Checked against the price the dish will END UP with, which on a PATCH may be
 * one that is not in this body at all: sending only `discountedPrice: 300` on a
 * ₹250 dish has to be refused, and so does sending only `price: 250` on a dish
 * already carrying a ₹300 offer.
 *
 * The schema's own path validator is the backstop and catches the same thing on
 * save. This exists because the validator can only report "discountedPrice must
 * be lower than price", where a partner needs the two numbers.
 */
const discountProblem = (price, discountedPrice) => {
  if (discountedPrice === null || discountedPrice === undefined) return null;
  if (typeof price !== 'number' || !Number.isFinite(price)) return null;
  if (discountedPrice < price) return null;
  return {
    field: 'discountedPrice',
    message: `An offer price of ${discountedPrice} is not below the price of ${price}. `
      + 'The offer price is what the customer pays; the price is what is struck through.',
  };
};

/**
 * The next position at the end of a category.
 *
 * One indexed read: `{ restaurantId: 1, category: 1, displayOrder: 1 }` answers
 * this from the index alone, sorted descending, first document. Matching on
 * `category` is case-sensitive, matching the model — a partner who capitalises
 * deliberately is not overruled, and the cost is that "Beverages" and
 * "beverages" order independently, which is visible on their own menu screen.
 */
const endOfCategory = async (restaurantId, category) => {
  const last = await FoodProduct.findOne({ restaurantId, category })
    .sort({ displayOrder: -1 })
    .select('displayOrder')
    .lean();

  const current = last && Number.isFinite(last.displayOrder) ? last.displayOrder : null;
  return current === null ? 0 : current + 1;
};

/**
 * Saves a new dish, retrying on an id collision.
 *
 * Eight characters out of a 32-letter alphabet is a million million, so nobody
 * will see this — but `productId` is a unique index, and an unhandled 11000
 * would reach a partner as "we could not add that" for a dish they have just
 * typed out.
 *
 * The key pattern is checked rather than retrying on any 11000. There is only
 * one unique index on `food_products` today; testing the key means that the day
 * a second one is added, this loop does not quietly retry a genuine duplicate
 * three times and then report it as a collision.
 */
const saveWithProductId = async (doc) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    doc.productId = makeProductId();
    try {
      return await doc.save();
    } catch (error) {
      const onProductId = error && error.code === 11000
        && Object.keys(error.keyPattern || error.keyValue || {}).includes('productId');
      if (!onProductId || attempt === 2) throw error;
    }
  }
  return null;
};

/* ══════════════════════════════════════════════════════════════════════════
   The handlers
   ══════════════════════════════════════════════════════════════════════════ */

// @route   GET /api/v2/food-partners/me/products
// @desc    This restaurant's whole menu, in the order the partner arranged it
// @access  Food-partner session
const listMyProducts = async (req, res, next) => {
  try {
    if (!dbUp()) return dbDown(res, ROUTES.list);

    const { restaurantId } = req.foodPartner;

    /*
     * Sold-out dishes are INCLUDED, unlike the customer-facing read. Switching
     * one back on is the whole reason a partner opens this screen, and a dish
     * that vanished when it sold out is one nobody can restore.
     *
     * Not `.lean()`: `toJSON` on the model is where `__v` is dropped and where
     * virtuals are attached, and a lean object skips both. A menu is tens of
     * documents, not thousands — the hydration is not the cost here.
     *
     * The `createdAt` tie-break is the model's stated read order and is the
     * part of this sort the index cannot serve, so Mongo sorts the result in
     * memory. At `MENU_LIMIT` documents that is nothing; it is worth knowing
     * before this file is copied somewhere with a million rows.
     */
    const products = await FoodProduct.find({ restaurantId })
      .sort({ category: 1, displayOrder: 1, createdAt: 1 })
      .limit(MENU_LIMIT);

    const unavailable = products.filter((product) => !product.isAvailable).length;

    return res.json({
      success: true,
      count: products.length,
      /* The headline the Menu screen shows above the list: "3 dishes are
         switched off" is what a partner wants to know on the way past, and
         counting it here means the app is not deriving the same number three
         times in three components. */
      unavailable,
      data: products,
    });
  } catch (error) {
    logError('reading the menu failed', error);
    return next(error);
  }
};

// @route   POST /api/v2/food-partners/me/products
// @desc    Add one dish to this restaurant's menu
// @access  Food-partner session
const createProduct = async (req, res, next) => {
  try {
    if (!dbUp()) return dbDown(res, ROUTES.create);

    const { restaurantId, restaurantName } = req.foodPartner;
    const { set, problems } = readMenuFields(req.body);

    /*
     * The three a dish cannot be sold without.
     *
     * Tested for PRESENCE, not for truthiness: `price: 0` is a real answer and
     * must not be reported as a missing field. A field that was sent and
     * refused already carries its own sentence, and adding "a dish needs a
     * price" underneath "that price is not a number" is the same fault told
     * twice to somebody who only made it once.
     */
    const needs = (field, message) => {
      if (set[field] !== undefined) return;
      if (problems.some((problem) => problem.field === field)) return;
      problems.push({ field, message });
    };

    needs('productName', 'A dish needs a name.');
    needs('category', 'A dish needs a section — "Starters", "Main Course", "Beverages".');
    needs('price', 'A dish needs a price.');

    const discount = discountProblem(set.price, set.discountedPrice);
    if (discount) problems.push(discount);

    if (problems.length) return refuseWith(res, problems, restaurantId);

    /* The write half of MENU_LIMIT — see the note on the constant. The model
       indexes `restaurantId` on its own, so this is a counted index scan
       rather than a walk over the collection. */
    const existing = await FoodProduct.countDocuments({ restaurantId });
    if (existing >= MENU_LIMIT) {
      logRejected(`the menu is at its ceiling of ${MENU_LIMIT} dishes`, {
        code: 'MENU_FULL', status: 409, restaurantId,
      });
      return fail(
        res,
        409,
        'MENU_FULL',
        `This menu already has ${MENU_LIMIT} dishes, which is as many as we hold. `
          + 'Please remove something before adding more, or talk to us.',
      );
    }

    /* The end of its category unless the partner said otherwise. See the
       header: 0 would put a new bottle of water above the biryani. */
    const displayOrder = set.displayOrder === undefined
      ? await endOfCategory(restaurantId, set.category)
      : set.displayOrder;

    const product = new FoodProduct({
      ...set,
      /* From the token, never from the body. */
      restaurantId,
      displayOrder,
    });

    await saveWithProductId(product);

    logMenuChange({
      action: 'created',
      restaurantId,
      restaurantName,
      productId: product.productId,
      productName: product.productName,
      category: product.category,
      price: product.price,
      isAvailable: product.isAvailable,
      changes: { displayOrder, isVeg: product.isVeg, variants: product.variants.length, addOns: product.addOns.length },
    });

    return res.status(201).json({ success: true, data: product });
  } catch (error) {
    logError('adding a dish failed', error);
    return next(error);
  }
};

// @route   PATCH /api/v2/food-partners/me/products/:productId
// @desc    Change one dish. Only the fields sent are touched.
// @access  Food-partner session (owner of the dish only)
const updateProduct = async (req, res, next) => {
  try {
    if (!dbUp()) return dbDown(res, ROUTES.update);

    const { restaurantId, restaurantName } = req.foodPartner;
    const productId = str(req.params.productId).toUpperCase();

    /*
     * Loaded and saved rather than updated in place, and that is not a style
     * choice: `discountedPrice`'s validator reads `this.price`, and under
     * `findOneAndUpdate` mongoose has a query rather than a document — `price`
     * may not even be in the update. The model header spells this out and
     * names this route as the reason. The document is also what the reply
     * carries, so a client sees exactly what was stored.
     *
     * `restaurantId` is in the filter, not merely checked afterwards. See the
     * header: an id short enough to read is a poor secret.
     */
    const product = await FoodProduct.findOne({ restaurantId, productId });
    if (!product) return notFound(res, restaurantId, productId);

    const { set, problems } = readMenuFields(req.body);

    /* Against the values the dish will END UP with, not the ones in the body. */
    const discount = discountProblem(
      set.price === undefined ? product.price : set.price,
      set.discountedPrice === undefined ? product.discountedPrice : set.discountedPrice,
    );
    if (discount) problems.push(discount);

    if (problems.length) return refuseWith(res, problems, restaurantId);

    if (!Object.keys(set).length) {
      /* Everything sent was either unknown or server-decided. Naming a few of
         the keys turns "nothing happened" into something a developer can act
         on — most often a field spelled the way the old website spelled it. */
      const offered = Object.keys(req.body && typeof req.body === 'object' ? req.body : {})
        .filter((key) => !['productId', 'restaurantId', 'ratingAvg', 'ratingCount'].includes(key))
        .slice(0, 6);
      const message = offered.length
        ? `Nothing in that request can be changed on a dish. We were sent: ${offered.join(', ')}.`
        : 'Send at least one field to change.';
      logRejected(message, {
        code: 'NOTHING_TO_UPDATE', field: `productId ${productId}`, restaurantId, status: 400,
      });
      return badInput(res, message, offered, 'NOTHING_TO_UPDATE');
    }

    /*
     * A move between categories goes to the end of the new one.
     *
     * Keeping the position it held in the old category drops it into an
     * arbitrary slot in the new one — a starter moved to Desserts landing
     * between two of them because it happened to be third in its old section.
     * An explicit `displayOrder` in the same body wins, because that is a
     * partner dragging it somewhere on purpose.
     */
    const movingCategory = set.category !== undefined && set.category !== product.category;
    if (movingCategory && set.displayOrder === undefined) {
      set.displayOrder = await endOfCategory(restaurantId, set.category);
    }

    /* Only what the log line compares against. A "before" of the whole
       document would be a second copy of it held for one console line. */
    const before = { price: product.price, category: product.category };

    Object.assign(product, set);
    await product.save();

    logMenuChange({
      action: 'updated',
      restaurantId,
      restaurantName,
      productId: product.productId,
      productName: product.productName,
      category: product.category,
      price: product.price,
      isAvailable: product.isAvailable,
      /* What was asked for, not what the document now holds — the two differ
         when a field was already at the value that was sent, and the useful
         line is the one that says what the partner touched. The logger
         redacts it on the way through. */
      changes: {
        ...set,
        ...(movingCategory ? { movedFrom: before.category } : {}),
        ...(set.price !== undefined && set.price !== before.price ? { priceWas: before.price } : {}),
      },
    });

    return res.json({ success: true, changed: Object.keys(set), data: product });
  } catch (error) {
    logError('changing a dish failed', error);
    return next(error);
  }
};

// @route   DELETE /api/v2/food-partners/me/products/:productId
// @desc    Remove one dish from the menu, for good
// @access  Food-partner session (owner of the dish only)
const deleteProduct = async (req, res, next) => {
  try {
    if (!dbUp()) return dbDown(res, ROUTES.remove);

    const { restaurantId, restaurantName } = req.foodPartner;
    const productId = str(req.params.productId).toUpperCase();

    /* Filter and delete in one round trip, scoped to this restaurant. A delete
       by id alone with an ownership check afterwards is a delete that has
       already happened by the time the check runs. */
    const product = await FoodProduct.findOneAndDelete({ restaurantId, productId });

    /* The same words and the same code as "there is no such dish" — see the
       header. Nothing in this reply says which of the two it was. */
    if (!product) return notFound(res, restaurantId, productId);

    /* The Cloudinary asset is deliberately left behind. See the header: an
       orphaned image costs kilobytes, a wrongly deleted one breaks a live
       menu, and nothing here can tell the two apart. */
    logMenuChange({
      action: 'deleted',
      restaurantId,
      restaurantName,
      productId: product.productId,
      productName: product.productName,
      category: product.category,
      price: product.price,
      changes: {
        images: (product.productImage && product.productImage.url ? 1 : 0)
          + (product.galleryImages ? product.galleryImages.length : 0),
        note: 'images left in Cloudinary for the sweeper',
      },
    });

    /* Enough for the app to drop the row and say what went. Returning the
       whole document would invite a client to keep it. */
    return res.json({
      success: true,
      data: {
        productId: product.productId,
        productName: product.productName,
        category: product.category,
      },
    });
  } catch (error) {
    logError('removing a dish failed', error);
    return next(error);
  }
};

// @route   PATCH /api/v2/food-partners/me/products/:productId/availability
// @desc    Switch one dish on or off, mid-service, from the list
// @access  Food-partner session (owner of the dish only)
const setProductAvailability = async (req, res, next) => {
  try {
    if (!dbUp()) return dbDown(res, ROUTES.availability);

    const { restaurantId, restaurantName } = req.foodPartner;
    const productId = str(req.params.productId).toUpperCase();

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const asked = sent(body, 'isAvailable', 'available', 'inStock');
    const isAvailable = asked ? readBoolean(asked.value) : undefined;

    /*
     * The value is required rather than toggled.
     *
     * A toggle is decided by whatever the server holds at the moment it
     * arrives, so a double tap, a retry on a flaky connection or two devices in
     * one kitchen all land somewhere nobody chose. Sending the state that was
     * pressed makes the request idempotent: the same call twice leaves the same
     * dish in the same state.
     */
    if (isAvailable === undefined) {
      const message = 'Send isAvailable as true or false.';
      logRejected(message, {
        code: 'BAD_INPUT', field: 'isAvailable', restaurantId, status: 400,
      });
      return badInput(res, message, ['isAvailable']);
    }

    /*
     * The one place in this file that updates in place — see the header. One
     * boolean, no validator that needs a neighbouring path, and load-then-save
     * on a field a partner taps twenty times an evening is four documents
     * racing to write back what each of them read.
     *
     * No `runValidators`: the only validator on this schema is
     * `discountedPrice`'s, which cannot see `price` from a query and would pass
     * vacuously here anyway. Asking for it would imply a check that is not
     * happening.
     */
    const product = await FoodProduct.findOneAndUpdate(
      { restaurantId, productId },
      { $set: { isAvailable } },
      { new: true },
    );
    if (!product) return notFound(res, restaurantId, productId);

    logMenuChange({
      action: isAvailable ? 'back on' : 'sold out',
      restaurantId,
      restaurantName,
      productId: product.productId,
      productName: product.productName,
      category: product.category,
      isAvailable: product.isAvailable,
    });

    return res.json({
      success: true,
      data: {
        productId: product.productId,
        productName: product.productName,
        isAvailable: product.isAvailable,
      },
    });
  } catch (error) {
    logError('switching a dish on or off failed', error);
    return next(error);
  }
};

module.exports = {
  listMyProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  setProductAvailability,
};
