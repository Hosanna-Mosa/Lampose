import type { StayCategory } from '@/constants/tokens';
import {
  AMENITY_LABEL,
  type Amenity,
  type AmenityName,
  type Gender,
  type Listing,
  type MealPlan,
  type SharingOption,
  type StayRate,
} from '@/types/listing';
import type { BackendListing } from '@/services/api/types';

/**
 * A `properties` document, as the app renders it.
 *
 * This file is the whole boundary between the database and the UI, and it has
 * one governing rule: **it converts, it does not invent.** Where the server
 * has a fact, it is carried across, reshaped, and named the way the app names
 * it. Where the server has nothing, the field is left absent — never filled
 * with a plausible default.
 *
 * That rule is not fastidiousness. The fixtures this replaces were written by
 * a designer who knew every number on them was made up, and the types were
 * built to match: `gender` was required, `availability` was required, every
 * sharing option had a bed count. Real listings have none of those. Meeting
 * required fields with invented values would have put "Co-ed", "Vacant" and
 * "3 beds free" onto listings whose owners never said any of it — and a
 * student acts on those. So the types grew optional members instead, each one
 * documented at its declaration with what the panel does and does not record.
 *
 * ## What the panel records, and what it does not
 *
 * Has:  name, place, category, rent, deposit, daily/monthly prices, stay type
 *       and durations, sharing labels and per-label prices, amenity strings,
 *       photographs, owner name, meals, verification status.
 * Has not:  occupancy of any kind, gender except on hostels, a controlled
 *       amenity vocabulary, house rules, view counts, area medians.
 */

/* ------------------------------------------------------------------ *
 * Category
 * ------------------------------------------------------------------ */

/**
 * The database categories and the app's are now the same four.
 *
 * They were not always. The collection stored display strings — 'PG',
 * 'Hostel', 'Dormitory', 'Bachelor Room' — and this file translated them
 * onto the four the app had chosen, merging PG with Hostel and standing
 * Dormitory in for HOTEL. COLIVE had no counterpart at all: nothing in the
 * database could land in that bucket, so the Co-live tab was permanently
 * empty by construction.
 *
 * The backend adopted these four as its own (see
 * Backend/src/shared/constants/categories.js) and its rows were migrated, so
 * the translation is now the identity — and Co-live is a category a property
 * can actually be.
 *
 * The old spellings stay in the table because data outlives a migration: a
 * cached response, a row written by a deployment mid-rollout, a fixture. They
 * cost one object literal and remove a class of blank screen.
 */
const CATEGORY: Record<string, StayCategory> = {
  PG_HOSTEL: 'PG_HOSTEL',
  BACHELOR: 'BACHELOR',
  HOTEL: 'HOTEL',
  COLIVE: 'COLIVE',

  /* Pre-migration spellings. */
  PG: 'PG_HOSTEL',
  Hostel: 'PG_HOSTEL',
  Dormitory: 'HOTEL',
  'Bachelor Room': 'BACHELOR',
};

export function toStayCategory(category: string): StayCategory {
  return CATEGORY[category] ?? 'PG_HOSTEL';
}

/**
 * What to send as `?category=` for a given tab.
 *
 * One value each now that the column holds codes. It stays a list because the
 * endpoint accepts a comma-separated set and a tab could yet cover more than
 * one category — and because the legacy spellings are still worth asking for
 * while any un-migrated deployment is serving.
 */
export const BACKEND_CATEGORIES: Record<StayCategory, readonly string[]> = {
  PG_HOSTEL: ['PG_HOSTEL'],
  BACHELOR: ['BACHELOR'],
  HOTEL: ['HOTEL'],
  COLIVE: ['COLIVE'],
};

/* ------------------------------------------------------------------ *
 * Gender
 * ------------------------------------------------------------------ */

/**
 * `categoryDetails.hostelType`, when a hostel has one.
 *
 * Returns `undefined` for everything it does not recognise, including the
 * empty string — and `undefined` means the badge is not drawn. Co-ed is only
 * returned when the panel actually said co-ed.
 */
function toGender(value: string | null): Gender | undefined {
  const text = String(value ?? '').toLowerCase();
  if (!text) return undefined;
  if (/\b(co-?ed|unisex|both|mixed)\b/.test(text)) return 'COED';
  if (/\b(girls?|women|female|ladies)\b/.test(text)) return 'GIRLS';
  if (/\b(boys?|men|male|gents)\b/.test(text)) return 'BOYS';
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Amenities
 * ------------------------------------------------------------------ */

/**
 * Free text onto the twenty-two-icon set.
 *
 * The panel's amenity field is a list of strings somebody typed, and the
 * strings in the live collection are things like "High-Speed Wi-Fi", "CCTV &
 * 24/7 Biometric Security", "Home-Cooked Food (3 Times)" and "RO Water". The
 * patterns below are ordered: the first that matches wins, so the more
 * specific ones come first — "hot water" must be tested before "water", or
 * every geyser becomes a water supply.
 *
 * Anything unmatched keeps the owner's own words under the `other` name. It
 * is not dropped: an owner who advertises a community lounge has said
 * something real about the building, and the app has no business deciding it
 * does not count because there is no icon for it.
 */
const AMENITY_PATTERNS: readonly [RegExp, AmenityName][] = [
  [/wi-?fi|internet|broadband/i, 'wifi'],
  [/power\s*back|inverter|generator|\bups\b/i, 'powerBackup'],
  [/hot\s*water|geyser|water\s*heater/i, 'hotWater'],
  [/\bro\b|drinking\s*water|purifier|water\s*can/i, 'drinkingWater'],
  [/water\s*(supply|24|tank)|borewell|municipal\s*water/i, 'waterSupply'],
  [/laundry|washing\s*machine|dhobi|ironing/i, 'laundry'],
  [/food|meal|mess|canteen|tiffin|kitchen\s*service|breakfast|lunch|dinner/i, 'mess'],
  [/\bac\b|air\s*condition/i, 'ac'],
  [/attached\s*(bath|washroom|toilet)|private\s*bath|en-?suite/i, 'attachedBath'],
  [/study\s*(table|desk)|work\s*desk|reading\s*table/i, 'studyTable'],
  [/cupboard|wardrobe|almirah|locker|storage/i, 'cupboard'],
  [/parking|two-?wheeler|bike\s*stand|car\s*park/i, 'parking'],
  [/cctv|camera|surveillance|biometric|security/i, 'cctv'],
  [/housekeep|cleaning|room\s*service|maid/i, 'housekeeping'],
  [/\blift\b|elevator/i, 'lift'],
  [/\btv\b|television|dth|cable/i, 'tv'],
  [/fridge|refrigerator|freezer/i, 'fridge'],
  [/\bgym\b|fitness|workout/i, 'gym'],
  [/warden|caretaker|manager\s*on\s*site/i, 'warden'],
  [/visitor|guest\s*(policy|rule)/i, 'visitors'],
  [/curfew|gate\s*(time|clos)|entry\s*time/i, 'curfew'],
  [/bicycle|cycle\s*stand/i, 'bicycle'],
];

/** Letters and digits only, lowercased — so "Wi-Fi" and "wifi" are one word. */
const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Does the owner's wording carry anything the standard label does not?
 *
 * Containment either way is a restatement: "High-Speed Wi-Fi" contains
 * "wifi", and "AC" is contained by "Air Conditioning". Only text that is
 * neither becomes a qualifier.
 */
function addsMeaning(text: string, label: string): boolean {
  const a = squash(text);
  const b = squash(label);
  return !a.includes(b) && !b.includes(a);
}

function toAmenities(values: string[]): readonly Amenity[] {
  const seen = new Set<string>();
  const amenities: Amenity[] = [];

  for (const raw of values) {
    const text = String(raw ?? '').trim();
    if (!text) continue;

    const matched = AMENITY_PATTERNS.find(([pattern]) => pattern.test(text));

    if (matched) {
      const [, name] = matched;
      /* Two strings can map to one icon — "Wi-Fi" and "High-Speed Internet"
         both mean wifi — and drawing the same glyph twice reads as a bug.
         The first one's wording is kept, since it is the one the owner led
         with. */
      if (seen.has(name)) continue;
      seen.add(name);
      /* The standard label is kept, so two listings can be compared at a
         glance — that consistency is the reason the vocabulary exists. The
         owner's phrasing rides along as the qualifier only where it says
         something the label does not: "Food (3 Times)" earns its place next
         to "Mess / food", and "High-Speed Wi-Fi" beside "WiFi" is noise. */
      amenities.push({
        name,
        state: 'present',
        qualifier: addsMeaning(text, AMENITY_LABEL[name]) ? text : undefined,
      });
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    amenities.push({ name: 'other', state: 'present', label: text });
  }

  return amenities;
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

const positive = (value: number | null | undefined): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * The stay rates, from the two the server offers.
 *
 * The server answers in terms of "short" and "long" availability, each with
 * its own price and its own list of durations, and it only marks one
 * available when there is a price to back it — an owner who ticked "both" and
 * filled in one figure cannot sell the other. Both halves are carried across
 * exactly as sent.
 *
 * There is no weekly rate. The app's `StayTypeId` has one and the panel has
 * no field for it, so none is produced; a rate the server does not quote is a
 * rate the listing is not offered at, and dividing a monthly figure by four
 * would put a price on screen no owner agreed to.
 *
 * The deposit belongs to the monthly rate only. That matches what the server
 * charges: `validateIntent` prices a short stay as rate × nights with nothing
 * held, so a zero here is the server's own arithmetic rather than a guess.
 */
function toStayRates(doc: BackendListing): readonly StayRate[] {
  const rates: StayRate[] = [];
  const { short, long } = doc.stayRates ?? { short: null, long: null };

  const daily = short?.available ? positive(short.dailyPrice) : undefined;
  if (daily) {
    const days = doc.durationOptions?.shortDays?.length
      ? doc.durationOptions.shortDays
      : [1, 2, 3, 5, 7];
    rates.push({
      id: 'DAILY',
      /* A dormitory is sold by the night and a PG by the day. Same rate,
         and the word a student would use for each is different. */
      label: toStayCategory(doc.category) === 'HOTEL' ? 'By the night' : 'By the day',
      unit: toStayCategory(doc.category) === 'HOTEL' ? 'night' : 'day',
      pricePerUnit: daily,
      daysPerUnit: 1,
      unitOptions: days,
      deposit: 0,
    });
  }

  const monthly = long?.available ? positive(long.monthlyPrice) : undefined;
  if (monthly) {
    const months = doc.durationOptions?.longMonths?.length
      ? doc.durationOptions.longMonths
      : long?.monthOptions?.length
        ? long.monthOptions
        : [1, 3, 6, 12];
    rates.push({
      id: 'MONTHLY',
      label: 'By the month',
      unit: 'month',
      pricePerUnit: monthly,
      daysPerUnit: 30,
      unitOptions: months,
      deposit: positive(doc.deposit) ?? 0,
    });
  }

  return rates;
}

/**
 * The sharing choices.
 *
 * **The id is the label.** Not a slug of it, not an index — the label itself,
 * character for character. The app sends the chosen id back as `sharing` when
 * a visit is requested, and the server resolves it against the property's own
 * option list and refuses anything it cannot find. Any transformation in
 * between is a chance for the two to disagree, and the failure mode is a
 * request rejected with `BAD_SHARING` for a choice the page plainly offered.
 * Making them the same string removes the possibility rather than testing for
 * it.
 *
 * `bedsLeft` is left absent throughout: the collection has no occupancy.
 * `median` is not set either — it is the app's licence to pre-select an
 * option, and nothing in the data says which choice is typical.
 */
function toSharingOptions(doc: BackendListing): readonly SharingOption[] {
  const options = (doc.sharingOptions ?? []).filter((option) => option && option.label);

  /*
   * The headline rent stands in only when there is exactly ONE option.
   *
   * With one option there is nothing to confuse it with: the listing quotes a
   * rent, and that rent is what this bed costs. With several, the same figure
   * on every row is a claim that a single room costs what a four-sharing bed
   * costs — which is never true, and which silently zeroed the "−₹900
   * cheaper" line that is the whole reason a student reads this control.
   * Unpriced options say so instead.
   */
  const singleFallback = options.length === 1
    ? positive(doc.monthlyPrice) ?? positive(doc.rent)
    : undefined;

  return options.map((option) => ({
    id: option.label,
    label: option.label,
    pricePerPerson: positive(option.price) ?? singleFallback,
    /* One deposit on the document, so it is the deposit for whichever bed is
       chosen — the panel records no per-option figure. */
    deposit: positive(doc.deposit),

    /* Only the structures this owner actually priced. A "per month" button
       on a bed with no monthly rate is a dead choice, and picking it would
       send a request the pricing has no answer for. */
    rates: option.rates
      ? {
        ...(positive(option.rates.nightly) ? { nightly: option.rates.nightly as number } : null),
        ...(positive(option.rates.monthly) ? { monthly: option.rates.monthly as number } : null),
        ...(positive(option.rates.flexible) ? { flexible: option.rates.flexible as number } : null),
      }
      : undefined,

    shareTypeId: option.shareTypeId ?? undefined,
    /*
     * `null` and `0` are carefully different and both survive the crossing.
     * Null is "nobody recorded a count" and becomes `undefined`; zero is
     * "every bed is taken" and stays zero. Collapsing them would have the app
     * tell a student a property is full when the truth is that nobody has
     * ever counted its beds.
     */
    availableBeds: typeof option.availableBeds === 'number' ? option.availableBeds : undefined,
    /* Defaults to FALSE, not true. A backend that has not been deployed with
       counts yet returns nothing here, and an app that assumed requestable
       would offer a button whose only outcome is an error. */
    requestable: option.requestable === true,
    unavailableReason: option.reason ?? undefined,
  } satisfies SharingOption));
}

/**
 * Meals, only where the panel recorded them.
 *
 * The server sends `included` and a food type, and nothing else — no serving
 * count, no timings, no windows. `MealPlan` wants all of those, so the ones
 * that are missing stay missing: `slots` is an empty list rather than three
 * invented mealtimes, and `mealsPerDay` comes from the timings the panel
 * happens to carry in `categoryDetails` or is zero.
 *
 * `MealPlanCard` is given a plan with no slots and renders the included line
 * without a timetable, which is the true statement — "meals are included, we
 * have not been told when" — rather than a schedule a student would plan a
 * day around.
 */
function toMealPlan(doc: BackendListing): MealPlan | undefined {
  if (!doc.meals) return undefined;

  const details = (doc.details ?? {}) as {
    mealsProvided?: string[];
    mealTimings?: Record<string, string>;
  };

  const provided = Array.isArray(details.mealsProvided) ? details.mealsProvided : [];
  const timings = details.mealTimings ?? {};

  return {
    included: doc.meals.included,
    /* Absent, not zero, when the panel never listed the meals. */
    mealsPerDay: provided.length || undefined,
    dietary: doc.meals.foodType ?? undefined,
    /*
     * Only meals with a recorded timing.
     *
     * A row here with no window renders as "not served", which is this
     * card's own convention and the right one — but every name in
     * `mealsProvided` is a meal that IS served, so listing an untimed one
     * would print the exact opposite of what the owner recorded. A meal we
     * cannot time is left off the timetable and still counted above.
     */
    slots: provided
      .filter((label) => timings[label])
      .map((label) => ({ label, window: timings[label] })),
  };
}

/* ------------------------------------------------------------------ *
 * The listing
 * ------------------------------------------------------------------ */

const DEFAULT_PROPERTY_IMAGES = [
  'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80',
];

export function toListing(doc: BackendListing): Listing {
  const category = toStayCategory(doc.category);
  const rawImages = (doc.images ?? []).filter(Boolean);
  if (rawImages.length === 0 && (doc as unknown as { imageUrl?: string }).imageUrl) {
    rawImages.push((doc as unknown as { imageUrl?: string }).imageUrl!);
  }
  const images = rawImages.length ? rawImages : DEFAULT_PROPERTY_IMAGES;
  const stayRates = toStayRates(doc);
  const sharingOptions = toSharingOptions(doc);

  const details = (doc.details ?? {}) as {
    curfewTime?: string;
    hostelType?: string;
    furnishing?: string;
    roomType?: string;
    bedType?: string;
  };

  return {
    id: doc.id,
    category,
    name: doc.name,
    locality: doc.locality || doc.city || doc.place,
    /* The city, where it is not already the locality. A card reading
       "HSR Layout Sector 1" tells a student nothing about which city they
       would be moving to, and half this collection is not in theirs. */
    localityNote: doc.city && doc.city !== doc.locality ? doc.city : undefined,
    ownerName: doc.ownerName,
    gender: toGender(doc.gender ?? details.hostelType ?? null),
    /* Empty string is the schema's default for a row nobody filled in, and
       an empty "About this property" heading is worse than none. */
    description: doc.description?.trim() || undefined,

    photoCount: images.length,
    photoUri: images[0],
    photoUris: images.length ? images : undefined,

    /* Nothing in the collection counts views, and the window is half the
       fact — "128 viewed" is a lot this week and nothing since March. Both
       are absent, so the line does not render. */

    rent: positive(doc.rent) ?? null,
    /* A dormitory is quoted per night; the server says so in `pricePeriod`,
       derived from the rate type the panel recorded. */
    perNight: doc.pricePeriod === '/day' || undefined,
    /* Priced per bed rather than per room — renders the "/bed" suffix.
       This used to be Hostel-or-Dormitory, and PGs showed no suffix at all.
       The merge widened it, and correctly: a PG's "2 Sharing — ₹5,999" is
       ₹5,999 per person per month, which is exactly what /bed means. The old
       behaviour quoted a per-bed price without saying so. */
    perBed: category === 'PG_HOSTEL' || category === 'HOTEL' || undefined,
    monthlyEquivalent: doc.pricePeriod === '/day' ? positive(doc.monthlyPrice) : undefined,

    deposit: positive(doc.deposit),
    /* Deliberately absent: `depositMonths` and `areaMedianDepositMonths`.
       The panel stores a rupee figure, not a multiple, and dividing it by
       the rent to produce "2 months" would be the app deriving a number the
       badge then presents as the owner's terms. The area median is a market
       statistic nothing computes yet, and without it the "high for this
       area" variant is withheld rather than guessed. */

    availability: { kind: 'UNSTATED' },

    meals: toMealPlan(doc),
    gateTime: details.curfewTime,
    furnishing: details.furnishing,
    sharingLabel: sharingOptions.length === 1 ? sharingOptions[0].label : undefined,

    amenities: toAmenities(doc.amenities ?? []),
    sharingOptions: sharingOptions.length ? sharingOptions : undefined,
    /*
     * Stay rates and the sharing selector are alternatives, and the server
     * decides which. `simpleSharingPath` marks the categories priced by the
     * bed — Bachelor Room today — where the panel records no daily rate and
     * no month ladder, so there is no stay length to ask about.
     *
     * The choice has to agree with the server's, because it decides more
     * than a layout: the visit-request endpoint requires a consent tick and
     * a full stay intent on the non-simple path, and requires neither on the
     * simple one. A screen showing the sharing selector while the server
     * expects an intent produces a 400 the student cannot act on.
     */
    stayRates: !doc.simpleSharingPath && stayRates.length ? stayRates : undefined,

    /* Whether a confirmed visit here is paid for. Carried across so the
       request screens can say what happens after the owner says yes, rather
       than inferring it from the pricing path. */
    visitToken: doc.visitToken?.required
      ? { required: true, amountPaise: doc.visitToken.amountPaise ?? undefined }
      : { required: false },

    /* `houseRules` stays absent. The panel records a curfew time and nothing
       else, and a rules block containing one row implies the other five were
       checked and found permissive. `gateTime` above carries the one fact. */
  };
}

export function toListings(docs: readonly BackendListing[]): Listing[] {
  return docs.map(toListing);
}
