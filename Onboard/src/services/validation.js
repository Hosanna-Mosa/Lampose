/**
 * What has to be true before a property may be sent to the backend.
 *
 * ## Why this is a file rather than a function inside App.jsx
 *
 * The onboarding form is the only way a property enters the platform, and what
 * it writes is read by four other clients that cannot fix it later: the public
 * site prices a room from `rent`, the visit-request flow WhatsApps the owner on
 * `ownerMobile`, and the admin console attributes the listing to
 * `employeeEmail`. A blank or half-typed value here is not a cosmetic problem —
 * it is a listing nobody can call, price or trace, discovered days later by
 * whoever tries.
 *
 * ## Two kinds of check, and both are here
 *
 * *Required* — the field is empty and the platform cannot work without it.
 * *Logical* — the field has something in it that cannot be true: a nine-digit
 * mobile number, a ₹0 rent, a deposit larger than a year of rent, an AC rate
 * cheaper than the same room without AC. The second kind is the one that used
 * to get through, because a non-empty string passed every test there was.
 *
 * Every message says what to do, not what went wrong: "Enter all 10 digits"
 * rather than "Invalid".
 *
 * ## The contract
 *
 * `validateOnboarding(formData)` returns a flat `{ [fieldKey]: message }` map.
 * Empty object means the form may be submitted. Keys are either a top-level
 * form field (`ownerMobile`), a namespaced category detail
 * (`categoryDetails.sharingTypes`), or a per-row key built by the helpers at the
 * bottom (`sharingPrice:2 Sharing`), so a message can be printed against the one
 * input it belongs to instead of in a list at the top of the page.
 */

/* ------------------------------------------------------------------ *
 * Limits
 * ------------------------------------------------------------------ */

/* Ceilings, not opinions about the market. They exist to catch a typed extra
   zero — ₹85,000 entered for a ₹8,500 room — which is the single most common
   number mistake on this form and the most expensive one, because the listing
   goes live at that price. */
const MAX_DAILY_PRICE = 50000;
const MAX_MONTHLY_PRICE = 1000000;
const MAX_DEPOSIT_MONTHS = 12;
const MAX_BEDS = 500;

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Digits only, with the country code and a leading trunk 0 taken off. */
export const phoneDigits = (value) => {
  let digits = text(value).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
};

/**
 * An Indian mobile number, which is the only kind this form collects.
 *
 * Ten digits opening 6-9. The repeated-digit test catches 9999999999 and
 * 8888888888 — placeholders an agent types to get past a required field, and
 * the reason a listing later has no reachable owner.
 */
export const isValidMobile = (value) => {
  const digits = phoneDigits(value);
  if (!/^[6-9]\d{9}$/.test(digits)) return false;
  if (/^(\d)\1{9}$/.test(digits)) return false;
  return true;
};

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text(value));

/** `''`/null/undefined → NaN, so "not filled in" and "not a number" differ. */
const amount = (value) => {
  const raw = typeof value === 'number' ? value : text(value);
  if (raw === '' || raw === null || raw === undefined) return NaN;
  return Number(raw);
};

const isHttpUrl = (value) => /^https?:\/\/\S+$/i.test(text(value));

/** Money for a message: 8500 → "₹8,500". */
const rupees = (value) => `₹${Number(value).toLocaleString('en-IN')}`;

/* ------------------------------------------------------------------ *
 * Per-row keys
 * ------------------------------------------------------------------ */

/** The error key for one sharing option's monthly rent. */
export const sharingPriceKey = (type) => `sharingPrice:${type}`;
/** The error key for one sharing option's AC rent. */
export const sharingAcPriceKey = (type) => `sharingAcPrice:${type}`;

/* ------------------------------------------------------------------ *
 * Where each message is printed
 * ------------------------------------------------------------------ */

/**
 * Error key → the DOM id to scroll to and focus.
 *
 * Only the fields that can be reached by id are listed. A per-row price lives
 * inside a repeated block, so those anchors are generated in `anchorFor` below
 * from the same key the input renders with.
 */
export const FIELD_ANCHORS = {
  employeeEmail: 'employeeEmail',
  name: 'propertyName',
  place: 'propertyPlace',
  ownerName: 'ownerName',
  ownerMobile: 'ownerMobile',
  ownerAltMobile: 'ownerAltMobile',
  dailyPrice: 'dailyPriceInput',
  monthlyPrice: 'monthlyPriceInput',
  deposit: 'depositInput',
  address: 'addressInput',
  photos: 'propertyPhotos',
  'categoryDetails.sharingTypes': 'sharingOptions',
  'categoryDetails.mealsProvided': 'mealsProvided',
  'categoryDetails.wardenContact': 'wardenContact',
  'categoryDetails.totalBeds': 'totalBeds',
  'categoryDetails.washroomsCount': 'washroomsCount',
};

/**
 * The order errors are reported in, which is the order the fields appear on the
 * page. Without it the "jump to the first problem" scroll lands wherever
 * `Object.keys` happens to put things, which on a long form feels random.
 */
const FIELD_ORDER = [
  'employeeEmail',
  'name',
  'place',
  'ownerName',
  'ownerMobile',
  'ownerAltMobile',
  'categoryDetails.mealsProvided',
  'categoryDetails.sharingTypes',
  'categoryDetails.hostelType',
  'categoryDetails.wardenContact',
  'categoryDetails.totalBeds',
  'categoryDetails.washroomsCount',
  'dailyPrice',
  'monthlyPrice',
  'deposit',
  'address',
  'photos',
];

/** The id to scroll to for any error key, including the generated row keys. */
export const anchorFor = (key) => {
  if (FIELD_ANCHORS[key]) return FIELD_ANCHORS[key];
  if (key.startsWith('sharingPrice:')) return `sharingPrice-${key.slice('sharingPrice:'.length)}`;
  if (key.startsWith('sharingAcPrice:')) return `sharingAcPrice-${key.slice('sharingAcPrice:'.length)}`;
  return null;
};

/** The first error a human would meet reading down the page. */
export const firstErrorKey = (errors) => {
  const keys = Object.keys(errors);
  if (keys.length === 0) return null;
  const ordered = FIELD_ORDER.filter((key) => keys.includes(key));
  if (ordered.length > 0) return ordered[0];
  // Row-level keys (sharing prices) sit with the sharing block.
  return keys[0];
};

/* ------------------------------------------------------------------ *
 * The rules
 * ------------------------------------------------------------------ */

/**
 * @param {object} formData the whole onboarding form
 * @returns {Record<string,string>} field key → message; empty means valid
 */
export function validateOnboarding(formData = {}) {
  const errs = {};
  const details = formData.categoryDetails || {};
  const category = formData.category;

  /* — who is onboarding this — */

  /* Not decoration: the backend's permission gate reads this employee on every
     later edit and delete. A listing saved without one can never be corrected
     by the person who created it. */
  const employeeEmail = text(formData.employeeEmail);
  if (!employeeEmail) {
    errs.employeeEmail = 'Sign in again — the employee email could not be read from your session';
  } else if (!isEmail(employeeEmail)) {
    errs.employeeEmail = 'This does not look like an email address';
  }

  /* — the property — */

  const name = text(formData.name);
  if (!name) errs.name = 'Property name is required';
  else if (name.length < 3) errs.name = 'Give the full name, at least 3 characters';
  else if (!/[a-zA-Z]/.test(name)) errs.name = 'A property name needs letters, not only numbers';

  const place = text(formData.place);
  if (!place) errs.place = 'Place / city / area is required';
  else if (place.length < 3) errs.place = 'Give the area and city, e.g. Koramangala 5th Block, Bangalore';

  /* — the owner — */

  const ownerName = text(formData.ownerName);
  if (!ownerName) errs.ownerName = 'Owner name is required';
  else if (ownerName.length < 3) errs.ownerName = 'Give the owner’s full name';
  else if (!/[a-zA-Z]/.test(ownerName)) errs.ownerName = 'A name needs letters, not only numbers';

  const ownerMobile = text(formData.ownerMobile);
  if (!ownerMobile) {
    errs.ownerMobile = 'Owner WhatsApp number is required';
  } else if (!isValidMobile(ownerMobile)) {
    errs.ownerMobile = phoneDigits(ownerMobile).length !== 10
      ? `Enter all 10 digits — you have typed ${phoneDigits(ownerMobile).length}`
      : 'Enter a real 10-digit mobile number starting 6, 7, 8 or 9';
  }

  /* The second number is optional, so an empty box is never an error. A
     half-typed one is: storing "98765" looks like a recorded contact and is
     useless to whoever calls it. */
  const altMobile = text(formData.ownerAltMobile);
  if (altMobile) {
    if (!isValidMobile(altMobile)) {
      errs.ownerAltMobile = 'Enter the full 10-digit number, or leave this blank';
    } else if (phoneDigits(altMobile) === phoneDigits(ownerMobile)) {
      errs.ownerAltMobile = 'Same as the WhatsApp number — leave this blank instead';
    }
  }

  /* — money — */

  const isBachelor = category === 'Bachelor Room';
  const isShortStay = formData.stayType === 'Short Stay' && !isBachelor;

  /* A PG's monthly rent is not typed anywhere: it is derived from the cheapest
     selected sharing option. So the message for a missing one belongs on the
     sharing block, and asking for a monthly price here as well would be asking
     twice for the same number. */
  const pgDerivesRent = category === 'PG' && !isShortStay;

  if (isShortStay) {
    const daily = amount(formData.dailyPrice);
    if (isNaN(daily)) errs.dailyPrice = 'Price per day is required for a short stay';
    else if (daily <= 0) errs.dailyPrice = 'Price per day must be more than 0';
    else if (daily > MAX_DAILY_PRICE) errs.dailyPrice = `That is over ${rupees(MAX_DAILY_PRICE)} a day — check for an extra zero`;
  } else if (!pgDerivesRent) {
    const monthly = amount(formData.monthlyPrice);
    if (isNaN(monthly)) errs.monthlyPrice = 'Monthly rent is required';
    else if (monthly <= 0) errs.monthlyPrice = 'Monthly rent must be more than 0';
    else if (monthly > MAX_MONTHLY_PRICE) errs.monthlyPrice = `That is over ${rupees(MAX_MONTHLY_PRICE)} a month — check for an extra zero`;
  }

  /* Deposit is optional; a nonsense deposit is not. The ceiling is a year of
     rent, which is well past anything a legitimate owner asks for and squarely
     where a mistyped rent lands. */
  const depositRaw = formData.deposit;
  if (depositRaw !== '' && depositRaw !== null && depositRaw !== undefined) {
    const deposit = amount(depositRaw);
    const monthlyForCheck = amount(formData.monthlyPrice) || amount(formData.rent);
    if (isNaN(deposit)) errs.deposit = 'Enter the deposit as a number, or leave it blank';
    else if (deposit < 0) errs.deposit = 'A deposit cannot be negative';
    else if (!isNaN(monthlyForCheck) && monthlyForCheck > 0 && deposit > monthlyForCheck * MAX_DEPOSIT_MONTHS) {
      errs.deposit = `That is more than a year of rent (${rupees(monthlyForCheck)}/month) — check the amount`;
    }
  }

  /* Address stays optional — `place` already carries the area, and an agent
     standing outside a building does not always have the door number. But a
     three-character address is someone starting to type and being interrupted,
     and that is worse than a blank. */
  const address = text(formData.address);
  if (address && address.length < 8) {
    errs.address = 'Give the full street address, or leave it blank';
  }

  /* — photos — */

  const localImages = Array.isArray(formData.localImages) ? formData.localImages : [];
  const badUrl = localImages.find((item) => item && !item.file && item.url && !isHttpUrl(item.url));
  if (badUrl) {
    errs.photos = 'One of the photo links is not a valid URL — it must start with http:// or https://';
  }

  /* — what makes this category a category — */

  Object.assign(errs, validateCategory(category, details, { isShortStay }));

  return errs;
}

/**
 * The per-category block.
 *
 * Split out because each category has its own idea of what a complete listing
 * is, and reading four sets of rules interleaved in one function is how a rule
 * ends up applied to the wrong category.
 */
function validateCategory(category, details, { isShortStay }) {
  const errs = {};

  if (category === 'PG') {
    const sharingTypes = Array.isArray(details.sharingTypes) ? details.sharingTypes : [];

    if (sharingTypes.length === 0) {
      errs['categoryDetails.sharingTypes'] = 'Pick at least one sharing option — this is how rooms are priced and searched';
    } else if (!isShortStay) {
      /* Each selected option needs its own rent, because the public site shows
         a per-occupancy price and the cheapest one becomes the listing's
         headline rent. One blank leaves a room advertised at no price. */
      sharingTypes.forEach((type) => {
        const price = amount((details.sharingPrices || {})[type]);
        if (isNaN(price) || price <= 0) {
          errs[sharingPriceKey(type)] = `Enter the monthly rent for ${type}`;
        } else if (price > MAX_MONTHLY_PRICE) {
          errs[sharingPriceKey(type)] = 'Check for an extra zero';
        }

        if ((details.sharingAC || {})[type]) {
          const acPrice = amount((details.sharingAcPrices || {})[type]);
          if (isNaN(acPrice) || acPrice <= 0) {
            errs[sharingAcPriceKey(type)] = `AC is ticked for ${type} — enter its rent, or untick AC`;
          } else if (!isNaN(price) && price > 0 && acPrice < price) {
            errs[sharingAcPriceKey(type)] = `AC costs less than the same room without it (${rupees(price)}) — check both amounts`;
          }
        }
      });
    }

    if (details.foodIncluded) {
      const meals = Array.isArray(details.mealsProvided) ? details.mealsProvided : [];
      if (meals.length === 0) {
        errs['categoryDetails.mealsProvided'] = 'Food is marked as included — pick which meals, or set Food to “No Food”';
      }
    }
  }

  if (category === 'Hostel') {
    if (!text(details.hostelType)) {
      errs['categoryDetails.hostelType'] = 'Choose whether this is a boys, girls or co-ed hostel';
    }
    /* The warden number is who a parent rings at 11 pm. Optional, but a
       half-typed one is a number that will be dialled and fail. */
    const warden = text(details.wardenContact);
    if (warden && !isValidMobile(warden)) {
      errs['categoryDetails.wardenContact'] = 'Enter the full 10-digit warden number, or leave it blank';
    }
  }

  if (category === 'Dormitory') {
    const beds = amount(details.totalBeds);
    if (isNaN(beds) || beds <= 0) {
      errs['categoryDetails.totalBeds'] = 'Enter how many beds the dormitory has';
    } else if (!Number.isInteger(beds)) {
      errs['categoryDetails.totalBeds'] = 'Beds have to be a whole number';
    } else if (beds > MAX_BEDS) {
      errs['categoryDetails.totalBeds'] = `${MAX_BEDS} beds is the most this form accepts — check the number`;
    }

    const washrooms = amount(details.washroomsCount);
    if (isNaN(washrooms) || washrooms <= 0) {
      errs['categoryDetails.washroomsCount'] = 'Enter how many washrooms there are';
    } else if (!Number.isInteger(washrooms)) {
      errs['categoryDetails.washroomsCount'] = 'Washrooms have to be a whole number';
    }
  }

  if (category === 'Bachelor Room') {
    if (!text(details.roomType)) errs['categoryDetails.roomType'] = 'Choose the room type';
    if (!text(details.furnishing)) errs['categoryDetails.furnishing'] = 'Choose the furnishing';
  }

  return errs;
}
