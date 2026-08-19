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

/** Per-layout furnishing level and unit count, for the whole-property lets. */
export const furnishingKey = (layout) => `furnishing:${layout}`;
export const roomCountKey = (layout) => `roomCount:${layout}`;

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
  'categoryDetails.roomTypes': 'roomTypes',
  'categoryDetails.bedTypes': 'bedTypes',
  'documents.pan': 'hotelDocuments',
  'documents.premises': 'hotelDocuments',
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
  if (key.startsWith('furnishing:')) return `sharingPrice-${key.slice('furnishing:'.length)}`;
  if (key.startsWith('roomCount:')) return `sharingRooms-${key.slice('roomCount:'.length)}`;
  /* The optional hotel rate grids: `monthlyPrices:Single` → `monthlyPrices-Single`. */
  const rateGrid = key.match(/^((?:monthly|flexible)(?:Ac)?Prices):(.+)$/);
  if (rateGrid) return `${rateGrid[1]}-${rateGrid[2]}`;
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

  /* Whole-property lets: priced by the bed, with no stay-length ladder. */
  const isBachelor = category === 'BACHELOR' || category === 'COLIVE';
  const isShortStay = formData.stayType === 'Short Stay' && !isBachelor;

  /* A PG's monthly rent is not typed anywhere: it is derived from the cheapest
     selected sharing option. So the message for a missing one belongs on the
     sharing block, and asking for a monthly price here as well would be asking
     twice for the same number. */
  /* The headline rate is not typed for any category that prices its options
     individually: it is derived from the cheapest one — sharing for a PG,
     layout for a bachelor or co-live, bed type for a hotel. Asking again in
     step 4 would be asking twice for the same number, and the two could
     disagree.

     A hotel derives on the SHORT-stay path, because its rates are nightly;
     the others derive on the long-stay path, because theirs are monthly. */
  const isHotel = category === 'HOTEL';
  const pgDerivesRent = ((category === 'PG_HOSTEL' || isBachelor) && !isShortStay)
    || (isHotel && !isShortStay);
  const hotelDerivesDaily = isHotel && isShortStay;

  if (isShortStay && hotelDerivesDaily) {
    /* Derived from the bed rates above. The per-bed messages are where a
       missing number is reported, so nothing is added here — but a hotel with
       no priced bed at all still needs saying. */
    const daily = amount(formData.dailyPrice);
    if (isNaN(daily) || daily <= 0) {
      errs.dailyPrice = 'Price at least one bed type above — that is what sets the nightly rate';
    }
  } else if (isShortStay) {
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
    /*
     * A year of rent, and for a hotel that is not what `rent` holds.
     *
     * A nightly category quotes ₹450, so twelve times it is ₹5,400 and any
     * normal hostel deposit was rejected as absurd. The monthly equivalent is
     * what the ceiling was always reaching for; for a nightly rate that is the
     * price times thirty.
     */
    const nightly = amount(formData.dailyPrice);
    const monthlyForCheck = amount(formData.monthlyPrice)
      || (isHotel && !isNaN(nightly) && nightly > 0 ? nightly * 30 : amount(formData.rent));
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

  Object.assign(errs, validateCategory(category, details, { isShortStay, documents: formData.documents }));

  return errs;
}

/**
 * The per-category block.
 *
 * Split out because each category has its own idea of what a complete listing
 * is, and reading four sets of rules interleaved in one function is how a rule
 * ends up applied to the wrong category.
 */
function validateCategory(category, details, { isShortStay, documents }) {
  const errs = {};

  if (category === 'PG_HOSTEL') {
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

  /* The hostel half of the merged category. Both blocks run for PG_HOSTEL:
     the fields step renders the union, and the form seeds a hostelType for
     every row, so a plain PG satisfies this without the agent thinking
     about it. */
  if (category === 'PG_HOSTEL') {
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

  if (category === 'HOTEL') {
    /* Bed types are multi-select, each with its own nightly rate — and its own
       AC rate where AC is offered, because a hostel commonly runs AC and
       non-AC dorms in the same building at different prices. */
    const bedTypes = Array.isArray(details.bedTypes) ? details.bedTypes : [];

    if (bedTypes.length === 0) {
      errs['categoryDetails.bedTypes'] = 'Pick at least one bed type — this is how beds are priced and searched';
    } else {
      bedTypes.forEach((bed) => {
        const price = amount((details.sharingPrices || {})[bed]);
        if (isNaN(price) || price <= 0) {
          errs[sharingPriceKey(bed)] = `Enter the rate for ${bed}`;
        } else if (price > MAX_MONTHLY_PRICE) {
          errs[sharingPriceKey(bed)] = 'Check for an extra zero';
        }

        if ((details.sharingAC || {})[bed]) {
          const acPrice = amount((details.sharingAcPrices || {})[bed]);
          if (isNaN(acPrice) || acPrice <= 0) {
            errs[sharingAcPriceKey(bed)] = `AC is ticked for ${bed} — enter its nightly rate, or untick AC`;
          } else if (!isNaN(price) && price > 0 && acPrice < price) {
            errs[sharingAcPriceKey(bed)] = `AC costs less than the same bed without it (${rupees(price)}) — check both amounts`;
          }
        }

        /* The monthly and flexible rates are optional — plenty of hostels sell
           beds only by the night. A negative or absurd one is not. */
        ['monthlyPrices', 'monthlyAcPrices', 'flexiblePrices', 'flexibleAcPrices'].forEach((map) => {
          const raw = (details[map] || {})[bed];
          if (raw === '' || raw === undefined || raw === null) return;
          const value = amount(raw);
          if (isNaN(value) || value <= 0 || value > MAX_MONTHLY_PRICE) {
            errs[`${map}:${bed}`] = `Check the ${bed} rate — it has to be a number above zero`;
          }
        });
      });
    }

    /* Beds are counted per type now — a building renting four kinds of bed
       cannot say how many of each with one number, and the per-type count is
       what the request flow decrements. The property total is derived. */
    let stated = 0;
    bedTypes.forEach((bed) => {
      const count = amount((details.sharingBeds || {})[bed]);
      if (isNaN(count) || count <= 0) {
        errs[roomCountKey(bed)] = `Enter how many ${bed} beds there are`;
      } else if (!Number.isInteger(count)) {
        errs[roomCountKey(bed)] = 'Beds have to be a whole number';
      } else {
        stated += count;
      }
    });

    /*
     * The two documents a hotel has to produce.
     *
     * Required rather than encouraged: a hotel is a business taking money from
     * strangers for a bed, and these are the only two things that say who is
     * being paid and that they hold the premises. A PG is somebody's house and
     * the WhatsApp chain already ties the owner to the number.
     */
    /* Two places, because the same form is checked at two moments. While an
       agent is filling it in, the files sit unuploaded in
       `categoryDetails.localDocuments`. By the time anything re-validates a
       saved property they are uploaded URLs in the TOP-LEVEL `documents` —
       top-level because the public listing API returns `categoryDetails`
       verbatim and a PAN filed there would be published. */
    const localDocs = details.localDocuments || {};
    const uploaded = Array.isArray(documents) ? documents : [];
    const has = (kind) => Boolean(localDocs[kind]?.file)
      || uploaded.some((d) => d && d.kind === kind && d.url);

    if (!has('pan')) {
      errs['documents.pan'] = 'Attach the owner or business PAN';
    }
    if (!has('premises')) {
      errs['documents.premises'] = 'Attach one document establishing the premises';
    } else if (localDocs.premises?.file && !text(localDocs.premises.docType)) {
      /* Only asked once a file is there — the dropdown labels the attachment,
         and asking which document it is before one exists reads as a second
         required field rather than a label for the first. */
      errs['documents.premises'] = 'Choose which document this is';
    }

    if (stated > MAX_BEDS) {
      errs[roomCountKey(bedTypes[0])] = `${MAX_BEDS} beds is the most this form accepts — check the numbers`;
    }
  }

  if (category === 'BACHELOR' || category === 'COLIVE') {
    /* Layouts are multi-select and each carries its own rent, the same shape
       the PG sharing options use — because a building let to bachelors
       commonly has two layouts at two different rents, and the single-select
       this replaced silently lost the second one. */
    const roomTypes = Array.isArray(details.roomTypes)
      ? details.roomTypes
      : (text(details.roomType) ? [details.roomType] : []);

    if (roomTypes.length === 0) {
      errs['categoryDetails.roomTypes'] = 'Pick at least one layout — this is how the property is priced and searched';
    } else {
      roomTypes.forEach((layout) => {
        const price = amount((details.sharingPrices || {})[layout]);
        if (isNaN(price) || price <= 0) {
          errs[sharingPriceKey(layout)] = `Enter the monthly rent for ${layout}`;
        } else if (price > MAX_MONTHLY_PRICE) {
          errs[sharingPriceKey(layout)] = 'Check for an extra zero';
        }
      });
    }

    /* Furnishing is per layout now, so the check is per layout too. The flat
       `furnishing` is a derived summary and validating it would report a
       problem against a control that no longer exists. */
    roomTypes.forEach((layout) => {
      const level = (details.furnishingByLayout || {})[layout];
      if (!text(level)) {
        errs[furnishingKey(layout)] = `Choose the furnishing for ${layout}`;
      }

      /* Counts are optional — an agent outside a building does not always know
         — but a nonsense one is not. */
      const count = amount((details.sharingRooms || {})[layout]);
      if (!isNaN(count) && (count < 0 || !Number.isInteger(count))) {
        errs[roomCountKey(layout)] = `How many ${layout}s has to be a whole number`;
      }
    });
  }

  return errs;
}
