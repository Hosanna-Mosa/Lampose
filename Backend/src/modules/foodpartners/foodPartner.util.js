/* ══════════════════════════════════════════════════════════════════════════
   The pure helpers every food-partner controller shares.

   One implementation of each, deliberately, because the callers must not be
   allowed to disagree. The application route, the login route, the menu
   routes and the public discovery routes all handle the same six awkward
   things — a phone number spelled three ways, a coordinate pair whose order
   is not obvious, a week of opening hours arriving in two shapes, a request
   body that must not be trusted, a set of field rules, and a count of what
   arrived — and a second copy of any of them is a copy that will drift. The
   one that drifts is always the one nobody was testing.

   Nothing here touches the database, the network or `res`. Everything takes
   values and returns values, which is what makes the awkward parts testable
   at all: `buildOpeningHours` and `validateApplication` between them encode
   most of what can go wrong with an application, and neither needs a running
   Mongo to be exercised.

   ## The whitelist is the point of this file

   `sanitiseApplication` is the only thing in this module that reads a raw
   request body, and it copies out named fields rather than filtering out bad
   ones. That direction matters: a deny-list has to be updated every time the
   schema grows a field, and the day somebody forgets is the day a client can
   set it. The fields it will never copy are `restaurantId`,
   `verificationStatus`, `verifiedAt`, `verificationNote`, `isActive`,
   `ratingAvg` and `ratingCount` — a client that decides its own validation
   rules is a client that can turn them off, and a partner who could PATCH
   `verificationStatus: 'approved'` would list an unverified kitchen at two in
   the morning. Same reasoning as `support/ticket.model.js`: a client that sets
   its own status can mark its own dispute resolved.

   ## Why this file imports the models

   For their enums and their weekday list, not for their collections. The
   alternative was a second copy of `WEEKDAYS`, `DELIVERY_FEE_TYPES` and
   friends here, and drift between a whitelist and the schema enum it is
   feeding is not a subtle failure — it is a `ValidationError` thrown out of
   `save()` and answered as a 500, on an application a partner spent twenty
   minutes typing. The require registers two mongoose models as a side effect;
   both are loaded by every controller that loads this file, so nothing new is
   pulled into the process.

   ## British spelling, and the one deliberate exception

   `normalisePhone`, `sanitiseApplication`. The schema field is
   `fssaiLicenseNumber` with an American "License" because that is what the
   licence itself is called on the certificate and what the spec names, and
   renaming a stored field for spelling would be a migration for nothing.
   ══════════════════════════════════════════════════════════════════════════ */
const {
  WEEKDAYS, DELIVERY_FEE_TYPES, OPEN_STATES, PARTNER_TYPES, DOCUMENT_KINDS,
} = require('./foodRestaurant.model');
const { IS_VEG_VALUES, SPICE_LEVELS } = require('./foodProduct.model');

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/* Only what a DLT SMS can reach. A restaurant's customer-facing number is
   frequently a landline and must NOT be held to this — see `normalisePhone`,
   which stays permissive for exactly that reason. */
const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;

/* An Aadhaar number is twelve digits. Only the LENGTH is checked, here and
   in `validateApplication`: nothing in this process can ask UIDAI whether a
   number exists, and the verification queue reads the scan beside it. A
   checksum would refuse the occasional real number typed correctly, which is
   a partner who cannot be onboarded at all. */
const AADHAAR_DIGITS = 12;

const ACCOUNT_TYPES = ['savings', 'current'];

/* ── Small readers ────────────────────────────────────────────────────────
   Every one of them answers "what did the client actually send", and every
   one of them tolerates the answer being nothing. A body arrives from a React
   Native form where an untouched numeric input is an empty string, an
   untouched switch is undefined, and a cleared date is null. */

const str = (value) => (value === undefined || value === null ? '' : String(value).trim());

/** A finite number, or null. `''` and `null` are "not answered", not zero. */
const num = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * A boolean, or undefined when the client said nothing.
 *
 * The distinction is load-bearing. `acceptsCod` and `acceptsOnlinePayment`
 * default to TRUE in the schema, so coercing a missing field to `false` would
 * switch off cash on delivery for every partner whose app build predates the
 * field — silently, and visibly only as orders not arriving.
 */
const bool = (value) => {
  if (value === true || value === false) return value;
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return undefined;
};

/** A Date, or null. An unparseable date is null rather than `Invalid Date`. */
const date = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const get = (source, path) => String(path).split('.').reduce(
  (node, key) => (node === null || node === undefined ? undefined : node[key]),
  source,
);

/**
 * The first of several spellings that carries anything.
 *
 * The alias lists below are not indulgence. The canonical names are the
 * schema's, and the aliases are what the website's food-partner form already
 * builds (`Frontend/src/pages/FoodPartnerOnboarding.jsx`, `payloadFor`) —
 * `businessName`, `cuisines`, `portalPassword`, `fssaiNumber`, `bankAccount`.
 * The same lists appear in `foodPartner.log.js`, on purpose: the block printed
 * to the console and the document written to the database must read the same
 * payload, or the log becomes a description of a submission that never
 * happened.
 */
const pick = (source, ...paths) => {
  for (const path of paths) {
    const value = get(source, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

/**
 * Was this field answered?
 *
 * `false` and `0` count as answered: a partner who ticked "we do not take
 * cash" or set a ₹0 packaging charge has told us something, and counting that
 * as missing sends somebody chasing a field that is already filled in. The
 * rule is identical to the one `foodPartner.log.js` uses for its boxed tally,
 * and the two must stay identical — a console saying "filled 7 of 10" and an
 * admin queue saying 8 of 10 about the same application is worse than neither.
 */
const isFilled = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    if (typeof value.url === 'string' || typeof value.uri === 'string') {
      return Boolean(value.url || value.uri);
    }
    return Object.values(value).some(isFilled);
  }
  return true;
};

/* ══════════════════════════════════════════════════════════════════════════
   Phone numbers
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A phone number as E.164, or null if it cannot be one.
 *
 * Hand-typed numbers reach this backend spelled several ways — `+91 98765
 * 43210`, `9876543210`, `09876543210`, `919876543210` — and every one of them
 * has to collapse to `+919876543210` or the same handset ends up as two
 * accounts, one of which cannot sign in. This is the one place in the module
 * that decides, so comparing two numbers means normalising both and comparing
 * the results: that is what makes the application route's check of
 * `req.verifiedPhone` against the body's `ownerPhone` reliable rather than a
 * string comparison of two spellings.
 *
 * Returns null rather than a best guess. Sending a one-time code to a
 * wrongly-padded number is worse than refusing the request, because the
 * partner then waits for an SMS that went somewhere else.
 *
 * Deliberately NOT strict about mobiles: a restaurant's `contactNumber` is
 * frequently a landline or a counter phone, and refusing those here would
 * refuse the number printed in the app. `isIndianMobile` below is the strict
 * test, applied only where an SMS has to arrive.
 *
 * ## Why this is not `infrastructure/twilio/twilio.js`'s `toE164`
 *
 * It agrees with it for every input this module can see, and that agreement is
 * required — the OTP goes out through `sendOtpSms`, which normalises with
 * `toE164`, so a number stored differently from the one messaged would be a
 * code that verifies against nothing. It is reimplemented rather than imported
 * because requiring that module constructs a Twilio SDK client and prints a
 * credentials warning as a side effect of loading a pure string helper, and
 * this file is loaded by the public discovery routes, which have nothing to do
 * with WhatsApp. The same trade, for the same reason, as `phoneKey` being
 * copied into `foodRestaurant.model.js` rather than imported from
 * `partners/partner.model.js`. If the two ever disagree, `toE164` decides: it
 * is what the gateway is actually handed.
 */
const normalisePhone = (value) => {
  if (value === undefined || value === null) return null;

  /* Twilio hands inbound numbers back as `whatsapp:+9198…`. Nothing in this
     module reads a webhook today, but a number copied from one into a support
     tool is exactly how that spelling arrives. */
  const raw = String(value).replace(/^whatsapp:/i, '').trim();
  const hasPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');

  if (!digits) return null;
  if (hasPlus) return `+${digits}`;

  /* A domestic trunk prefix — "09876543210". */
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  /* The country code typed without the plus — "919876543210". */
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;

  /* A bare national number, which is how nine in ten of them are typed. */
  if (digits.length === 10) return `+91${digits}`;

  /* Long enough to already carry a country code this module does not know. */
  if (digits.length > 10 && digits.length <= 15) return `+${digits}`;

  return null;
};

/**
 * An Indian mobile specifically — the only thing that can receive a DLT SMS.
 *
 * Applied to `ownerPhone`, which is both the login identity and the number the
 * one-time code goes to, and to nothing else.
 */
const isIndianMobile = (e164) => typeof e164 === 'string' && INDIAN_MOBILE.test(e164);

/* ══════════════════════════════════════════════════════════════════════════
   Coordinates
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A GeoJSON point, or null.
 *
 * THIS IS THE ONE PLACE THE ORDER IS DECIDED. The arguments are `(lat, lng)`
 * because that is the order a person says them, a map library returns them and
 * a form labels them; the output is `[lng, lat]` because that is MongoDB's
 * order. The flip happens here, once, and nowhere else in the module.
 *
 * Getting it backwards is the classic bug in this file's neighbourhood and it
 * does not throw — it silently returns nothing. A `$near` built around a point
 * 500km out to sea matches no restaurant, and the listing screen renders an
 * empty state that looks exactly like "no restaurants near you" rather than
 * like a fault. Note what the range check below cannot catch: Hyderabad is lng
 * 78.4, lat 17.4, and swapped that is lng 17.4, lat 78.4 — both legal, both
 * accepted, and the kitchen is now in the Arctic Ocean. Anywhere in India both
 * numbers sit inside each other's valid range, so validation buys nothing
 * against the swap. Naming the arguments and centralising the flip is the
 * defence; there is no other one.
 *
 * `0, 0` is refused. It is in range, it is in the Gulf of Guinea, and it is
 * what a form produces when two empty numeric inputs are coerced — a partner
 * who never dropped a pin should have no `location` at all rather than a pin
 * off the coast of Africa, because a document with no location is simply not
 * in the 2dsphere index and cannot be near anybody, which is the truth.
 */
const toGeoPoint = (lat, lng) => {
  const latitude = num(lat);
  const longitude = num(lng);

  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;

  return { type: 'Point', coordinates: [longitude, latitude] };
};

/* ══════════════════════════════════════════════════════════════════════════
   Opening hours
   ══════════════════════════════════════════════════════════════════════════ */

/* "mon", "Mon", "MONDAY" all mean Monday. The stored form is the full name,
   because that is the schema's enum and because an opening-hours row is read
   by a person in three consoles — see the model, where the choice is
   recorded. */
const WEEKDAY_BY_PREFIX = WEEKDAYS.reduce((map, day) => {
  map[day.toLowerCase()] = day;
  map[day.slice(0, 3).toLowerCase()] = day;
  return map;
}, {});

const toWeekday = (value) => WEEKDAY_BY_PREFIX[str(value).toLowerCase()] || null;

/**
 * "9:5" and "09:05" are the same time; "25:00" is not a time at all.
 *
 * A single-digit hour is what a text input produces when somebody types the
 * time rather than picking it, so it is padded rather than refused. Anything
 * that is not two numbers separated by a colon is refused, because a slot with
 * an unreadable time is a slot that would decide when a kitchen is open.
 */
const toHhmm = (value) => {
  const text = str(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const padded = `${match[1].padStart(2, '0')}:${match[2]}`;
  return HHMM.test(padded) ? padded : null;
};

/**
 * The week, however it was sent, as the flat array the schema stores.
 *
 * Two shapes arrive and both are legitimate:
 *
 *   the app's     { days: ['Monday', …], slots: { Monday: [{ open, close }] } }
 *                 — also accepted as { selectedDays, dayTimeSlots }, which is
 *                 what the website's form builds
 *   a flat array  [{ day, openTime, closeTime }] — also { day, open, close }
 *
 * and both collapse to `[{ day, openTime, closeTime }]`. A day may appear more
 * than once and that is the normal case rather than an edge one: a kitchen
 * serving 11:00–15:00 and 19:00–23:00 closes between meals, and one open and
 * one close per day would show it serving at four in the afternoon.
 *
 * Malformed rows are DROPPED and reported. `problems` is an array the caller
 * passes in to collect a human-readable line per refused row; it is an
 * argument rather than a `{ hours, errors }` return because every caller wants
 * the array and a caller that wants nothing else should not have to unwrap a
 * tuple. What is not acceptable is dropping a row in silence — a mistyped
 * closing time that simply vanishes shows up weeks later as a kitchen
 * mysteriously shut on Thursdays, with nothing anywhere to say why.
 *
 * Note what is NOT validated here: a `closeTime` earlier than its `openTime`
 * is legal and means the slot crosses midnight. A kitchen serving until 01:00
 * is ordinary, and `foodRestaurant.model.isOpenNow` is the one place that rule
 * is implemented.
 */
const buildOpeningHours = (input, problems = []) => {
  const hours = [];

  const addSlot = (dayValue, openValue, closeValue, label) => {
    const day = toWeekday(dayValue);
    if (!day) {
      problems.push(`"${str(dayValue) || label}" is not a day of the week, so those hours were not saved.`);
      return;
    }

    const openTime = toHhmm(openValue);
    const closeTime = toHhmm(closeValue);
    if (!openTime || !closeTime) {
      problems.push(
        `${day} ${str(openValue) || '—'} to ${str(closeValue) || '—'} is not a readable 24-hour time, so that slot was not saved.`,
      );
      return;
    }

    hours.push({ day, openTime, closeTime });
  };

  /* Shape 1 — a flat array of slots. */
  if (Array.isArray(input)) {
    input.forEach((slot, index) => {
      if (!slot || typeof slot !== 'object') {
        problems.push(`Opening hours row ${index + 1} was not readable and was not saved.`);
        return;
      }
      addSlot(
        pick(slot, 'day', 'weekday'),
        pick(slot, 'openTime', 'open', 'from', 'start'),
        pick(slot, 'closeTime', 'close', 'to', 'end'),
        `row ${index + 1}`,
      );
    });
    return hours;
  }

  if (!input || typeof input !== 'object') return hours;

  /* Shape 2 — the selected days, plus a map of slots per day. The days list is
     what decides: a `slots` map keeps every day a partner ever touched, and
     honouring the rows for a day they later unticked would reopen a kitchen on
     a day it told us it is shut. */
  const days = pick(input, 'days', 'selectedDays');
  const slots = pick(input, 'slots', 'dayTimeSlots', 'hours') || {};

  if (Array.isArray(days)) {
    days.forEach((dayValue) => {
      const day = toWeekday(dayValue);
      if (!day) {
        problems.push(`"${str(dayValue)}" is not a day of the week, so those hours were not saved.`);
        return;
      }
      const rows = slots[day] || slots[str(dayValue)] || [];
      if (!Array.isArray(rows) || rows.length === 0) {
        problems.push(`${day} was selected as an open day but carried no hours, so it was not saved.`);
        return;
      }
      rows.forEach((row) => addSlot(
        day,
        pick(row || {}, 'openTime', 'open', 'from', 'start'),
        pick(row || {}, 'closeTime', 'close', 'to', 'end'),
        day,
      ));
    });
    return hours;
  }

  /* Shape 3 — a bare map, `{ Monday: [{ open, close }] }`, with no days list.
     Every key present is taken as an open day, because with nothing to say
     otherwise the rows themselves are the statement. */
  Object.keys(input).forEach((key) => {
    const day = toWeekday(key);
    if (!day) return;
    const rows = Array.isArray(input[key]) ? input[key] : [input[key]];
    rows.forEach((row) => addSlot(
      day,
      pick(row || {}, 'openTime', 'open', 'from', 'start'),
      pick(row || {}, 'closeTime', 'close', 'to', 'end'),
      day,
    ));
  });

  return hours;
};

/* ══════════════════════════════════════════════════════════════════════════
   The whitelist
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A Cloudinary asset, however it was handed over.
 *
 * A bare URL string, this module's own `{ url, publicId }`, or the raw
 * Cloudinary upload response (`secure_url` / `public_id`) — the last because
 * an app that uploads through `POST /uploads/images` and forwards what it got
 * back is doing the obvious thing, and refusing it would be a rule nobody
 * could guess. Anything with no URL returns undefined: a document row naming a
 * file that was never uploaded promises a scan nobody can open.
 */
const toImage = (value) => {
  if (!value) return undefined;
  if (typeof value === 'string') {
    const url = value.trim();
    return url ? { url, publicId: '' } : undefined;
  }
  if (typeof value !== 'object') return undefined;
  const url = str(pick(value, 'url', 'secure_url', 'uri'));
  if (!url) return undefined;
  return { url, publicId: str(pick(value, 'publicId', 'public_id')) };
};

const toImageList = (value) => (Array.isArray(value) ? value.map(toImage).filter(Boolean) : []);

/** Trimmed, non-empty, de-duplicated — a cuisine list, a tag list, allergens. */
const toStringList = (value) => {
  const items = Array.isArray(value) ? value : [value];
  const seen = new Set();
  return items
    .map(str)
    .filter((item) => item && !seen.has(item) && seen.add(item));
};

/* The green/red dot arrives as a string from the app and as a boolean from
   older form code, where `true` meant vegetarian. Both are read; anything
   unrecognised falls through to the schema default rather than guessing, since
   guessing wrong here shows a non-vegetarian dish behind a green dot. */
const toIsVeg = (value) => {
  if (value === true) return 'veg';
  if (value === false) return 'non-veg';
  const text = str(value).toLowerCase().replace(/[\s_]+/g, '-');
  if (IS_VEG_VALUES.includes(text)) return text;
  if (text === 'nonveg') return 'non-veg';
  if (text === 'veg' || text === 'vegetarian') return 'veg';
  return undefined;
};

/**
 * One menu item, whitelisted.
 *
 * `productId`, `restaurantId`, `ratingAvg` and `ratingCount` are never copied.
 * The first two are the server's to issue — a client that names its own
 * `restaurantId` names somebody else's restaurant, and that is the whole
 * attack — and the last two are derived from orders this process does not yet
 * place.
 */
const sanitiseProduct = (input, index) => {
  const raw = input && typeof input === 'object' ? input : {};
  const product = {
    productName: str(pick(raw, 'productName', 'name', 'itemName')),
    description: str(pick(raw, 'description')),
    category: str(pick(raw, 'category', 'categoryName', 'section')),
  };

  const image = toImage(pick(raw, 'productImage', 'image', 'photo'));
  if (image) product.productImage = image;

  const gallery = toImageList(pick(raw, 'galleryImages', 'images', 'gallery'));
  if (gallery.length) product.galleryImages = gallery;

  const isVeg = toIsVeg(pick(raw, 'isVeg', 'foodType', 'type'));
  if (isVeg) product.isVeg = isVeg;

  /* Kept as sent, negatives included. `num` already refused anything that is
     not a number; a negative one is a partner's typo and belongs in
     `validateApplication`, which can say "a price of zero or more for the
     Chicken Biryani" — where the schema's `min: 0` would only throw a
     ValidationError that reaches the app as a 500. */
  product.price = num(pick(raw, 'price', 'basePrice'));

  /*
   * A discount is only stored when it is a real one, above zero.
   *
   * An empty numeric input arrives as `''` or `0`, and `0` here means the dish
   * is free — see the model, which keeps `null` and `0` apart precisely so
   * that a schema cannot give food away. `null` is the honest reading of an
   * untouched box.
   */
  const discounted = num(pick(raw, 'discountedPrice', 'offerPrice'));
  product.discountedPrice = discounted !== null && discounted > 0 ? discounted : null;

  const available = bool(pick(raw, 'isAvailable', 'available', 'inStock'));
  if (available !== undefined) product.isAvailable = available;

  const options = (value) => (Array.isArray(value) ? value : [])
    .map((option) => ({
      name: str(pick(option || {}, 'name', 'label', 'title')),
      price: num(pick(option || {}, 'price', 'amount')),
    }))
    .filter((option) => option.name && option.price !== null && option.price >= 0);

  const variants = options(pick(raw, 'variants', 'portions'));
  if (variants.length) product.variants = variants;

  const addOns = options(pick(raw, 'addOns', 'addons', 'extras'));
  if (addOns.length) product.addOns = addOns;

  const spice = str(pick(raw, 'spiceLevel')).toLowerCase();
  product.spiceLevel = SPICE_LEVELS.includes(spice) ? spice : null;

  const serves = num(pick(raw, 'serves', 'servingSize'));
  if (serves !== null) product.serves = serves;

  /* "Bestseller" is a tag in this schema and a checkbox on the website's menu
     builder. One shape wins, and it is the schema's, so the checkbox becomes
     the tag it was always displayed as. */
  const tags = toStringList(pick(raw, 'tags') || []);
  if (bool(pick(raw, 'isBestseller', 'bestseller')) === true && !tags.includes('Bestseller')) {
    tags.push('Bestseller');
  }
  if (tags.length) product.tags = tags;

  const allergens = toStringList(pick(raw, 'allergenInfo', 'allergens') || []);
  if (allergens.length) product.allergenInfo = allergens;

  const calories = num(pick(raw, 'calories'));
  if (calories !== null) product.calories = calories;

  const prep = num(pick(raw, 'preparationTime', 'prepTime'));
  if (prep !== null) product.preparationTime = prep;

  /* The order the menu was typed in is the order the partner will look for it
     in, so an unordered menu keeps its arrival order rather than collapsing to
     a wall of zeroes that the read path then sorts by creation time. */
  const order = num(pick(raw, 'displayOrder', 'order', 'position'));
  product.displayOrder = order === null ? index : order;

  return product;
};

/**
 * Every shape a menu arrives in, as one flat list.
 *
 * The app sends `products`. The website's form builds `menuCategories`
 * (categories, each with their items) when the menu is typed and
 * `menuUploadRows` when it is read out of an uploaded sheet. All three are
 * read, because all three exist in code today and a partner cannot be told
 * that the menu they typed was the wrong sort of menu.
 */
const readProducts = (root, restaurant) => {
  const direct = pick(root, 'products', 'menu', 'menuItems')
    || pick(restaurant, 'products', 'menu', 'menuItems');
  if (Array.isArray(direct)) return direct;

  const categories = pick(root, 'menuCategories') || pick(restaurant, 'menuCategories');
  if (Array.isArray(categories)) {
    return categories.flatMap((category) => {
      const name = str(pick(category || {}, 'name', 'category'));
      const items = Array.isArray((category || {}).items) ? category.items : [];
      return items.map((item) => ({ category: name, ...(item || {}) }));
    });
  }

  const rows = pick(root, 'menuUploadRows') || pick(restaurant, 'menuUploadRows');
  if (Array.isArray(rows)) return rows;

  return [];
};

/**
 * The whole onboarding payload, reduced to what may be stored.
 *
 * Returns:
 *
 *   restaurant  a plain object ready to hand to `new FoodRestaurant(…)`, with
 *               no id, no verification state and no ratings on it
 *   products    plain objects ready for `FoodProduct`, with no ids on them
 *   documents   the verification documents, returned separately because the
 *               controller and the logger both want to count them — and set on
 *               `restaurant` as the same array, so that a controller which
 *               spreads `restaurant` into the model cannot lose them
 *   password    THE PLAINTEXT, returned on its own key and never on
 *               `restaurant`. The controller hashes it with
 *               `FoodRestaurant.hashPassword` and assigns `passwordHash`;
 *               keeping it off the restaurant object is what makes it
 *               impossible to spread the plaintext into a document by accident
 *   errors      what could not be read, in whole sentences
 *
 * The two error lists in this file are deliberately in different voices.
 * These are sentences about a payload — a day that is not a day, a time that
 * is not a time — because they describe something that was sent and dropped.
 * `validateApplication` returns fragments in the app's own gate voice, about
 * something that was never sent at all. A controller refuses on either.
 *
 * `verificationStatus`, `verifiedAt`, `verificationNote`, `isActive`,
 * `ratingAvg`, `ratingCount` and `restaurantId` appear nowhere below. That is
 * the whole point of the function.
 */
const sanitiseApplication = (body) => {
  const errors = [];
  const root = body && typeof body === 'object' ? body : {};

  /* The same fallback chain as `foodPartner.log.js`, so the block printed to
     the console describes the payload that was actually read. A client may
     nest the restaurant or send it flat; both are ordinary. */
  const r = root.restaurant || root.restaurantDetails || root;
  const addressIn = r.address || root.address || {};
  const payoutIn = r.payout || root.payout || root.bank || root.bankDetails || {};
  const contractIn = r.contract || root.contract || {};
  const deliveryIn = r.deliveryFee || root.deliveryFee || {};

  const restaurant = {};

  /* ── A. Basic ─────────────────────────────────────────────────────────── */

  restaurant.restaurantName = str(pick(r, 'restaurantName', 'name', 'businessName'));
  restaurant.ownerName = str(pick(r, 'ownerName', 'owner.name'));

  const ownerPhoneRaw = pick(r, 'ownerPhone', 'owner.phone', 'phone');
  restaurant.ownerPhone = normalisePhone(ownerPhoneRaw) || '';
  if (ownerPhoneRaw && !restaurant.ownerPhone) {
    errors.push(`"${str(ownerPhoneRaw)}" could not be read as a phone number.`);
  }

  /*
   * OPTIONAL, and ABSENT rather than empty when it was not given.
   *
   * `ownerEmail` carries a unique index. An empty string is a value like any
   * other to that index, so writing '' would let the first restaurant without
   * an email through and refuse every one after it with a duplicate-key error
   * naming a field nobody filled in. The key is therefore left off the object
   * entirely, which a sparse unique index skips.
   *
   * Why it may be missing at all: the Onboard console signs up owners who do
   * not use email, and an address typed in to get past a required box —
   * `na@na.com`, or the agent's own — is a login identity belonging to
   * somebody else and a settlement notice sent into the dark. The MOBILE
   * number is the identity this module actually uses.
   */
  const ownerEmail = str(pick(r, 'ownerEmail', 'owner.email', 'email')).toLowerCase();
  if (ownerEmail) restaurant.ownerEmail = ownerEmail;

  const logo = toImage(pick(r, 'logoImage', 'logo'));
  if (logo) restaurant.logoImage = logo;

  const cover = toImage(pick(r, 'coverBannerImage', 'coverImage', 'banner'));
  if (cover) restaurant.coverBannerImage = cover;

  restaurant.description = str(pick(r, 'description', 'tagline'));
  restaurant.cuisineTypes = toStringList(pick(r, 'cuisineTypes', 'cuisines', 'cuisine', 'categories') || []);

  const partnerType = str(pick(r, 'partnerType', 'type')).toLowerCase();
  if (PARTNER_TYPES.includes(partnerType)) restaurant.partnerType = partnerType;
  else if (partnerType) {
    errors.push(`"${partnerType}" is not a partner type; this was filed as a food partner.`);
  }

  restaurant.fssaiLicenseNumber = str(pick(r, 'fssaiLicenseNumber', 'fssaiNumber', 'fssai'));
  restaurant.fssaiExpiry = date(pick(r, 'fssaiExpiry'));
  restaurant.fssaiCompanyName = str(pick(r, 'fssaiCompanyName', 'licenceCompanyName'));
  restaurant.gstNumber = str(pick(r, 'gstNumber', 'gstin', 'gst')).toUpperCase();
  const gstExempt = bool(pick(r, 'gstExempt'));
  if (gstExempt !== undefined) restaurant.gstExempt = gstExempt;
  restaurant.panNumber = str(pick(r, 'panNumber', 'pan')).toUpperCase();

  /*
   * The Aadhaar, read but never TRUSTED.
   *
   * `number` and `phone` are what was typed; `verifiedAt` is deliberately not
   * read here at all. The controller sets it from the proof token that
   * `/auth/otp/verify` issued, which is the only thing that can say the code
   * actually reached that handset. A body claiming `aadhaar.verifiedAt` is
   * ignored the same way `verificationStatus` and `isActive` are.
   *
   * `last4` is derived rather than accepted, so it cannot disagree with the
   * number it is supposed to be the tail of.
   */
  const aadhaarIn = r.aadhaar || root.aadhaar || {};
  const aadhaarDigits = str(pick(aadhaarIn, 'number', 'aadhaarNumber')).replace(/\D/g, '');
  const aadhaarPhone = normalisePhone(str(pick(aadhaarIn, 'phone', 'aadhaarPhone')));

  if (aadhaarDigits && aadhaarDigits.length !== AADHAAR_DIGITS) {
    errors.push(`"${aadhaarDigits}" is not a ${AADHAAR_DIGITS}-digit Aadhaar number; it was not stored.`);
  }

  restaurant.aadhaar = {
    number: aadhaarDigits.length === AADHAAR_DIGITS ? aadhaarDigits : '',
    last4: aadhaarDigits.length === AADHAAR_DIGITS ? aadhaarDigits.slice(-4) : '',
    phone: aadhaarPhone || '',
    verifiedAt: null,
  };

  /* ── B. Location & contact ────────────────────────────────────────────── */

  /* Four boxes on the website's form (shop number, floor, area, city) against
     two address lines in the schema. A shop number and a floor are one line of
     an address as anybody writes it, and the area is the second. */
  restaurant.address = {
    line1: str(pick(addressIn, 'line1', 'addressLine1', 'street'))
      || [str(addressIn.shopNo), str(addressIn.floor)].filter(Boolean).join(', '),
    line2: str(pick(addressIn, 'line2', 'addressLine2', 'area')),
    city: str(pick(addressIn, 'city')),
    state: str(pick(addressIn, 'state')),
    district: str(pick(addressIn, 'district')),
    pincode: str(pick(addressIn, 'pincode', 'pin', 'postalCode')),
    landmark: str(pick(addressIn, 'landmark')),
  };

  /* A pin may arrive as GeoJSON already, as `{ lat, lng }`, or as two fields on
     the root. Everything funnels through `toGeoPoint`, which is where the
     order is decided — including the GeoJSON case, which is unpacked back into
     lat and lng rather than trusted, because a client that built the array
     itself is exactly the client most likely to have built it backwards. */
  const locationIn = r.location || root.location || addressIn.location || root.coordinates;
  let point = null;
  if (locationIn && Array.isArray(locationIn.coordinates) && locationIn.coordinates.length === 2) {
    point = toGeoPoint(locationIn.coordinates[1], locationIn.coordinates[0]);
  } else if (locationIn && typeof locationIn === 'object') {
    point = toGeoPoint(
      pick(locationIn, 'lat', 'latitude'),
      pick(locationIn, 'lng', 'lon', 'longitude'),
    );
  }
  if (!point) {
    point = toGeoPoint(pick(r, 'lat', 'latitude'), pick(r, 'lng', 'lon', 'longitude'));
  }
  if (point) restaurant.location = point;

  /* `sameAsOwner` is the website's tick-box for "the shop answers the owner's
     phone". Honoured, because a partner who ticked it and then typed nothing
     means the owner's number, not a blank. */
  const sameAsOwner = bool(pick(r, 'sameAsOwner')) === true;
  const contactRaw = pick(r, 'contactNumber', 'primaryContact', 'publicPhone', 'restaurantPhone');
  restaurant.contactNumber = sameAsOwner
    ? restaurant.ownerPhone
    : (normalisePhone(contactRaw) || '');
  if (contactRaw && !sameAsOwner && !restaurant.contactNumber) {
    errors.push(`"${str(contactRaw)}" could not be read as a contact number.`);
  }

  /* ── C. Operations ────────────────────────────────────────────────────── */

  const hoursIn = pick(r, 'openingHours', 'hours', 'timings')
    || pick(root, 'openingHours', 'hours', 'timings')
    /* The website sends the days and the slot map as two sibling fields, so
       they are rejoined into the one shape `buildOpeningHours` reads. */
    || (pick(r, 'days', 'selectedDays')
      ? { days: pick(r, 'days', 'selectedDays'), slots: pick(r, 'slots', 'dayTimeSlots') }
      : null);
  restaurant.openingHours = buildOpeningHours(hoursIn, errors);

  const openState = str(pick(r, 'openState')).toLowerCase();
  if (OPEN_STATES.includes(openState)) restaurant.openState = openState;
  else if (openState) {
    errors.push(`"${openState}" is not an availability state; the schedule will decide instead.`);
  }

  restaurant.avgPreparationTime = num(pick(r, 'avgPreparationTime', 'prepTime')) ?? 0;
  restaurant.deliveryRadiusKm = num(pick(r, 'deliveryRadiusKm', 'radiusKm')) ?? 0;
  restaurant.minOrderValue = num(pick(r, 'minOrderValue')) ?? 0;
  restaurant.packagingCharge = num(pick(r, 'packagingCharge')) ?? 0;

  const feeType = str(pick(deliveryIn, 'type')).toLowerCase();
  restaurant.deliveryFee = {
    type: DELIVERY_FEE_TYPES.includes(feeType) ? feeType : 'flat',
    amount: num(pick(deliveryIn, 'amount', 'fee')) ?? 0,
    perKm: num(pick(deliveryIn, 'perKm')) ?? 0,
    freeAboveValue: num(pick(deliveryIn, 'freeAboveValue', 'freeAbove')) ?? 0,
  };
  if (feeType && !DELIVERY_FEE_TYPES.includes(feeType)) {
    errors.push(`"${feeType}" is not a delivery fee type; a flat fee was stored instead.`);
  }

  const online = bool(pick(r, 'acceptsOnlinePayment'));
  if (online !== undefined) restaurant.acceptsOnlinePayment = online;
  const cod = bool(pick(r, 'acceptsCod', 'acceptsCOD'));
  if (cod !== undefined) restaurant.acceptsCod = cod;

  /* ── D. Payout ────────────────────────────────────────────────────────── */

  const accountNumber = str(pick(payoutIn, 'bankAccountNumber', 'accountNumber', 'bankAccount', 'account'));
  const accountType = str(pick(payoutIn, 'accountType')).toLowerCase();
  restaurant.payout = {
    accountHolderName: str(pick(payoutIn, 'accountHolderName', 'holderName', 'accountHolder')),
    bankAccountNumber: accountNumber,
    /* Derived here and NEVER taken from the body. It is the one part of the
       account number every ordinary screen shows, so a client that could set
       it could show a partner four digits belonging to a different account. */
    accountLast4: accountNumber.replace(/\D/g, '').slice(-4),
    ifscCode: str(pick(payoutIn, 'ifscCode', 'ifsc')).toUpperCase(),
    accountType: ACCOUNT_TYPES.includes(accountType) ? accountType : 'current',
    upiId: str(pick(payoutIn, 'upiId', 'upi', 'vpa')),
  };

  /* ── E. Verification documents ────────────────────────────────────────── */

  /* Only rows that carry a URL. The website's draft payload names its files
     (`{ name: 'fssai.png' }`) without uploading them, and a document row
     naming a file nobody can open is worse than no row: it tells the
     verification queue a scan exists. The app uploads through
     `POST /uploads/images` first and sends what came back. */
  const documentsIn = pick(r, 'verificationDocuments')
    || pick(root, 'verificationDocuments', 'documents')
    || [];
  const documents = (Array.isArray(documentsIn) ? documentsIn : [])
    .map((entry) => {
      const doc = entry && typeof entry === 'object' ? entry : {};
      const kind = str(pick(doc, 'kind', 'type')).toLowerCase();
      const url = str(pick(doc, 'url', 'secure_url'));
      if (!DOCUMENT_KINDS.includes(kind)) {
        errors.push(`"${str(pick(doc, 'kind', 'type')) || 'a document'}" is not a document Lampose collects, so it was not saved.`);
        return null;
      }
      if (!url) {
        errors.push(`The ${kind} document carried no uploaded file, so it was not saved.`);
        return null;
      }
      return {
        kind,
        number: str(pick(doc, 'number')),
        expiry: date(pick(doc, 'expiry')),
        url,
        publicId: str(pick(doc, 'publicId', 'public_id')),
        fileName: str(pick(doc, 'fileName', 'name')),
        /* Server clock. A client-set upload time is a client deciding when a
           licence was produced. */
        uploadedAt: new Date(),
      };
    })
    .filter(Boolean);

  /* The same array on both keys, not a copy: the controller may assign either
     and cannot end up with two that disagree. */
  restaurant.verificationDocuments = documents;

  /* ── Contract ─────────────────────────────────────────────────────────── */

  const accepted = bool(pick(contractIn, 'accepted')) === true
    || bool(pick(r, 'acceptedTos')) === true;

  /* Ticked on the documents step of the Onboard console, against the policy
     printed in full on that screen. Read from either place a client might put
     it, and timestamped on the server clock for the same reason `acceptedAt`
     is: a client-set date is a client deciding when it agreed. */
  const refundAccepted = bool(pick(contractIn, 'refundPolicyAccepted')) === true
    || bool(pick(r, 'refundPolicyAccepted')) === true;

  restaurant.contract = {
    accepted,
    signature: str(pick(contractIn, 'signature') || pick(r, 'signature')),
    /* Server clock again, and only when it was accepted. A client-set
       `acceptedAt` is a client deciding when it agreed to the commission. */
    acceptedAt: accepted ? new Date() : null,
    commission: num(pick(contractIn, 'commission')) ?? 0,
    platformFee: num(pick(contractIn, 'platformFee')) ?? 0,
    refundPolicyAccepted: refundAccepted,
    refundPolicyAcceptedAt: refundAccepted ? new Date() : null,
  };

  /* ── Products ─────────────────────────────────────────────────────────── */

  const products = readProducts(root, r).map(sanitiseProduct);

  /* ── The password ─────────────────────────────────────────────────────── */

  /* Read once, returned on its own key, and never written onto `restaurant`.
     Nothing else in this module may hold the plaintext, and the moment it
     lives on the object that gets spread into a mongoose document it is one
     careless `strict: false` from being stored. */
  const password = String(pick(r, 'password', 'portalPassword') || '');

  return {
    restaurant, products, documents, password, errors,
  };
};

/* ══════════════════════════════════════════════════════════════════════════
   The field rules
   ══════════════════════════════════════════════════════════════════════════ */

const FSSAI_DIGITS = 14;
const IFSC_LENGTH = 11;
const PAN_LENGTH = 10;
const GSTIN_LENGTH = 15;
const MIN_PASSWORD = 6;

/** "the Chicken Biryani, the Paneer Tikka and 4 more". */
const nameList = (names) => {
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  const joined = shown.length > 1
    ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
    : shown[0];
  return rest > 0 ? `${joined} and ${rest} more` : joined;
};

/**
 * What is still wrong with an application, in the app's own voice.
 *
 * Takes the output of `sanitiseApplication` and returns a list of fragments,
 * every one of which completes the sentence "We still need …" — deliberately
 * the same voice as the onboarding form's own step gates ("a 14-digit FSSAI
 * number", "the owner's name", "both passwords to match"), because a partner
 * who was told on screen what a step wanted should be told the same words when
 * the server refuses. The controller joins them; it should not rewrite them.
 *
 * An empty list means the application may be written. It does NOT mean the
 * application is correct — an FSSAI number of the right length can still
 * belong to somebody else, which is what `verificationStatus: 'pending'` and a
 * human reading the documents are for. Everything checked here is a shape a
 * machine can check, and nothing here is a judgement about a business.
 *
 * ## What is deliberately NOT enforced
 *
 * The internal structure of an IFSC (four letters, a zero, six characters) and
 * of a PAN (five letters, four digits, a letter). Both are real conventions,
 * and both would turn a legitimate outlier into a refusal a partner cannot act
 * on at ten at night. Length is the part that catches the actual mistake — a
 * half-typed field — and a genuinely wrong IFSC is caught by the bank at the
 * first payout, where a human is already looking.
 *
 * This validates an APPLICATION. The PATCH routes validate their own, much
 * narrower, whitelists: nothing here should be read as the rule for an edit,
 * because an edit that had to re-supply a password and a contract would be an
 * edit nobody could make.
 */
const validateApplication = (sanitised = {}) => {
  const problems = [];
  const restaurant = sanitised.restaurant || {};
  const products = Array.isArray(sanitised.products) ? sanitised.products : [];
  const payout = restaurant.payout || {};
  const contract = restaurant.contract || {};
  const isMeat = restaurant.partnerType === 'meat';

  /* ── Basic ────────────────────────────────────────────────────────────── */

  if (!restaurant.restaurantName) problems.push("the restaurant's name");
  if (!restaurant.ownerName) problems.push("the owner's name");

  if (!restaurant.ownerPhone) {
    problems.push("the owner's phone number");
  } else if (!isIndianMobile(restaurant.ownerPhone)) {
    /* Not pedantry: this number is sent the one-time code, and a landline is a
       code that never arrives and an account that can never be recovered. */
    problems.push("an Indian mobile number for the owner — it has to receive the one-time code");
  }

  /* Checked for SHAPE only when one was given — see the sanitiser above for
     why an application may carry none. A malformed one is still refused: it is
     a typo somebody can fix now rather than a login that never works. */
  const ownerEmail = String(restaurant.ownerEmail || '').trim();
  if (ownerEmail && !ownerEmail.includes('@')) {
    problems.push('an email address that looks like one, or none at all');
  }

  /* A password is optional, and only checked when one was actually sent.
     The Food-Partner app asks the owner for one; the Onboard console, which a
     Lampose employee fills in beside the owner, does not ask at all — and an
     application refused for lacking a credential nobody in that room should be
     choosing is a refusal with no correct answer. The account is then written
     without a hash, which `verifyPassword` treats as "cannot sign in yet". */
  const password = String(sanitised.password || '');
  if (password && password.length < MIN_PASSWORD) {
    problems.push(`a password of at least ${MIN_PASSWORD} characters`);
  }

  if (!restaurant.cuisineTypes || !restaurant.cuisineTypes.length) {
    problems.push(isMeat ? 'a meat category' : 'a cuisine');
  }

  /* ── Documents & legal ────────────────────────────────────────────────── */

  const fssaiDigits = String(restaurant.fssaiLicenseNumber || '').replace(/\D/g, '');
  if (fssaiDigits.length !== FSSAI_DIGITS) {
    problems.push(`a ${FSSAI_DIGITS}-digit FSSAI number`);
  }
  if (!restaurant.fssaiExpiry) {
    problems.push('the FSSAI expiry date');
  } else if (restaurant.fssaiExpiry.getTime() < Date.now()) {
    problems.push('an FSSAI licence that has not already expired');
  }

  /*
   * A GSTIN is OPTIONAL, and only its SHAPE is checked.
   *
   * It used to be one or the other — a number, or the exempt box ticked — and
   * that reads as a complete rule until you stand at a counter with the owner.
   * The composition scheme and small turnovers are ordinary, plenty of
   * kitchens have not registered at all, and a partner who does not know
   * which of those describes them has no true answer to give: what the rule
   * actually bought was a made-up fifteen characters, which is the one thing
   * the verification queue cannot tell from a real registration. So an absent
   * GSTIN is accepted and recorded as absent.
   *
   * Both at once is still refused, because that is a contradiction rather than
   * a gap — `gstExempt` says there is no registration and the number says
   * there is, and nothing downstream can decide which to believe.
   *
   * The Onboard console's `validateRestaurant.js` says exactly this, in the
   * same words; the two have to agree or the agent meets a 400 at the end of a
   * twenty-minute form.
   */
  const gstNumber = String(restaurant.gstNumber || '');
  if (restaurant.gstExempt === true && gstNumber) {
    problems.push('either a GSTIN or the GST-exempt box ticked, not both');
  } else if (gstNumber && gstNumber.length !== GSTIN_LENGTH) {
    problems.push(`a ${GSTIN_LENGTH}-character GSTIN, or no GSTIN at all`);
  }

  /* Optional by the field spec, so only its shape is checked, and only when
     something was typed. */
  const panNumber = String(restaurant.panNumber || '');
  if (panNumber && panNumber.length !== PAN_LENGTH) {
    problems.push(`a ${PAN_LENGTH}-character PAN number`);
  }

  /*
   * The Aadhaar, checked for SHAPE and never for PRESENCE.
   *
   * The Onboard console requires it and verifies the registered mobile with a
   * one-time code before it will let the agent past that step — that console
   * is where it is asked for, so that is where it is insisted on. A presence
   * rule HERE would refuse every application from the Food-Partner app, whose
   * own signup has no Aadhaar field at all. The same division `panNumber` and
   * `refundPolicyAccepted` already use.
   *
   * The phone is checked only when one was sent, and only as a mobile: a
   * number that could not receive the code it was supposed to have received
   * is a number typed into the wrong box.
   */
  const aadhaar = restaurant.aadhaar || {};
  const aadhaarDigits = String(aadhaar.number || '').replace(/\D/g, '');
  if (aadhaarDigits && aadhaarDigits.length !== AADHAAR_DIGITS) {
    problems.push(`a ${AADHAAR_DIGITS}-digit Aadhaar number`);
  }
  if (aadhaar.phone && !isIndianMobile(aadhaar.phone)) {
    problems.push('an Indian mobile number for the Aadhaar — it has to receive the one-time code');
  }

  /* ── Payout ───────────────────────────────────────────────────────────── */

  /* A partner may finish the bank details later — settlement is weekly and the
     first one is a week away — so an empty payout is not a refusal. A HALF
     one is: an account number with no IFSC is money that cannot be sent. */
  const accountDigits = String(payout.bankAccountNumber || '').replace(/\D/g, '');
  const ifscCode = String(payout.ifscCode || '');
  const payoutStarted = Boolean(accountDigits || ifscCode || payout.accountHolderName);
  if (payoutStarted) {
    if (accountDigits.length < 9 || accountDigits.length > 18) {
      problems.push('a bank account number of 9 to 18 digits');
    }
    if (ifscCode.length !== IFSC_LENGTH) {
      problems.push(`an ${IFSC_LENGTH}-character IFSC`);
    }
    if (!payout.accountHolderName) problems.push("the account holder's name");
  }

  /* ── Operations ───────────────────────────────────────────────────────── */

  if (!restaurant.openingHours || !restaurant.openingHours.length) {
    problems.push('the days you are open');
  }

  /* Every one of these has `min: 0` in the schema, where a negative throws a
     ValidationError that reaches the app as a 500. Said here instead, in words
     a partner can act on. */
  [
    ['minOrderValue', 'a minimum order value of zero or more'],
    ['packagingCharge', 'a packaging charge of zero or more'],
    ['avgPreparationTime', 'a preparation time of zero minutes or more'],
    ['deliveryRadiusKm', 'a delivery radius of zero or more'],
  ].forEach(([key, fragment]) => {
    if (typeof restaurant[key] === 'number' && restaurant[key] < 0) problems.push(fragment);
  });

  const fee = restaurant.deliveryFee || {};
  if ([fee.amount, fee.perKm, fee.freeAboveValue].some((value) => typeof value === 'number' && value < 0)) {
    problems.push('delivery charges of zero or more');
  }

  /* ── Menu ─────────────────────────────────────────────────────────────── */

  /*
   * AN EMPTY MENU IS A VALID APPLICATION.
   *
   * This used to demand at least one item, on the assumption that whoever
   * filled the form in was the person who knew the prices. That is not how a
   * restaurant is signed up through the Onboard console: a Lampose employee
   * sits with the owner, records who they are and where they cook, and the
   * menu — sixty dishes, each with a photograph — is not something either of
   * them is going to type on a phone at the counter. So that form sends no
   * products at all, and the restaurant enters its own menu from the
   * Food-Partner app once the account is approved.
   *
   * Nothing downstream is harmed by the gap. A restaurant with no products is
   * `isActive: false` until an admin approves it, and the discovery feed
   * already skips a kitchen with nothing to sell — an empty menu shows an
   * empty restaurant to nobody.
   *
   * The partner app's own signup is unaffected: it still sends a menu, and
   * items that ARE sent are still checked one by one below. Sending none is
   * allowed; sending a nameless or unpriced one is not.
   */

  /* Aggregated rather than reported per item: an eighty-line menu pasted
     without categories would otherwise produce eighty fragments and a refusal
     nobody reads. Three names and a count is enough to find them. */
  const named = (product, index) => product.productName || `menu item ${index + 1}`;
  const unnamed = products.filter((product) => !product.productName).length;
  const uncategorised = products
    .map(named)
    .filter((_, index) => !products[index].category);
  const unpriced = products
    .map(named)
    .filter((_, index) => products[index].price === null || products[index].price < 0);
  const badDiscount = products
    .map(named)
    .filter((_, index) => {
      const product = products[index];
      return product.discountedPrice !== null
        && typeof product.price === 'number'
        && product.discountedPrice >= product.price;
    });

  if (unnamed) problems.push(`a name for ${unnamed} menu item${unnamed === 1 ? '' : 's'}`);
  if (uncategorised.length) problems.push(`a category for ${nameList(uncategorised)}`);
  if (unpriced.length) problems.push(`a price of zero or more for ${nameList(unpriced)}`);
  if (badDiscount.length) problems.push(`a discount below the full price for ${nameList(badDiscount)}`);

  /* ── Contract ─────────────────────────────────────────────────────────── */

  if (contract.accepted !== true) problems.push('the terms accepted');
  if (String(contract.signature || '').trim().length < 2) problems.push('your signature');

  return problems;
};

/* ══════════════════════════════════════════════════════════════════════════
   The tally
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The seven sections of the field spec, in the spec's own order, with the
 * fields each of them holds.
 *
 * One list, used by anything that needs to say how complete an application is.
 * `foodPartner.log.js` draws its own tally inline because it is already
 * walking rows to draw a box, and a box that had to look fields up twice would
 * be two lists to keep in step; this is the same arithmetic for every caller
 * that is not drawing a box — the verification queue deciding which
 * applications to chase, a completeness figure on the partner dashboard.
 *
 * `password` is in the logger's BASIC section and not here, deliberately: the
 * logger counts a raw request body, where a password exists. This counts a
 * sanitised restaurant, where it never does.
 */
const APPLICATION_SECTIONS = {
  basic: {
    title: 'Basic info',
    fields: [
      'restaurantName', 'ownerName', 'ownerPhone', 'ownerEmail', 'logoImage',
      'coverBannerImage', 'description', 'cuisineTypes', 'partnerType',
    ],
  },
  location: {
    title: 'Location & contact',
    fields: [
      'address.line1', 'address.line2', 'address.city', 'address.state',
      'address.district', 'address.pincode', 'address.landmark', 'location', 'contactNumber',
    ],
  },
  operations: {
    title: 'Operations',
    fields: [
      'openingHours', 'openState', 'avgPreparationTime', 'deliveryRadiusKm',
      'minOrderValue', 'packagingCharge', 'deliveryFee', 'acceptsOnlinePayment',
      'acceptsCod',
    ],
  },
  documents: {
    title: 'Documents & legal',
    fields: [
      'fssaiLicenseNumber', 'fssaiExpiry', 'fssaiCompanyName', 'gstNumber', 'gstExempt',
      'panNumber', 'aadhaar.number', 'aadhaar.phone', 'verificationDocuments',
    ],
  },
  payout: {
    title: 'Payout',
    fields: [
      'payout.accountHolderName', 'payout.bankAccountNumber', 'payout.ifscCode',
      'payout.accountType', 'payout.upiId',
    ],
  },
  /* Counted in items rather than fields — see `fieldTally`. */
  menu: { title: 'Menu', fields: [] },
  contract: {
    title: 'Contract',
    fields: [
      'contract.accepted', 'contract.signature', 'contract.acceptedAt',
      'contract.commission', 'contract.platformFee',
      'contract.refundPolicyAccepted',
    ],
  },
};

/**
 * How much of one section arrived: `{ section, title, filled, total, missing }`.
 *
 * `values` is the sanitised restaurant for six of the seven sections, and the
 * products array for `menu`. The sanitised object rather than the raw body, on
 * purpose: a tally of the raw body counts fields the server threw away, and
 * "filled 10 of 10" on an application that stored six of them is a number that
 * makes things worse.
 *
 * The menu is counted in COMPLETE ITEMS rather than in fields, because a menu
 * has no fixed number of anything. An item is complete when it could be listed
 * — a name, a category and a price — which is the same test the logger's menu
 * section applies, and `missing` names the dishes that fail it.
 *
 * An unknown section name returns a zero tally rather than throwing. This is
 * counting for a console and a queue; nothing it can do is worth a 500.
 */
const fieldTally = (section, values) => {
  const key = String(section || '').toLowerCase();
  const spec = APPLICATION_SECTIONS[key];

  if (!spec) return { section: key, title: key, filled: 0, total: 0, missing: [] };

  if (key === 'menu') {
    const products = Array.isArray(values) ? values : [];
    const incomplete = products
      .map((product, index) => ({ product, index }))
      .filter(({ product }) => !(product
        && String(product.productName || '').trim()
        && String(product.category || '').trim()
        && Number.isFinite(Number(product.price))))
      .map(({ product, index }) => String(product && product.productName).trim() || `item ${index + 1}`);

    return {
      section: key,
      title: spec.title,
      filled: products.length - incomplete.length,
      total: products.length,
      missing: incomplete,
    };
  }

  const missing = spec.fields.filter((path) => !isFilled(get(values, path)));

  return {
    section: key,
    title: spec.title,
    filled: spec.fields.length - missing.length,
    total: spec.fields.length,
    missing,
  };
};

module.exports = {
  /* Phone numbers. */
  normalisePhone,
  isIndianMobile,

  /* Coordinates — the one place [lng, lat] is decided. */
  toGeoPoint,

  /* Opening hours. */
  buildOpeningHours,

  /* The whitelist, and the rules. */
  sanitiseApplication,
  validateApplication,

  /* Completeness. */
  fieldTally,
  APPLICATION_SECTIONS,
  isFilled,
};
