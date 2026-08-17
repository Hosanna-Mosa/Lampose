import type { StayCategory } from '@/constants/tokens';

/**
 * The discovery data shapes.
 *
 * These are written against the developer-flow spec's entities, but only the
 * fields discovery actually renders. Everything here arrives from the server —
 * nothing in the UI derives a price or an availability count,
 * because a filter and a card that disagree is worse than either being wrong.
 */

/* ------------------------------------------------------------------ *
 * Gender
 * ------------------------------------------------------------------ */

export type Gender = 'BOYS' | 'GIRLS' | 'COED';

/**
 * The three carriers, none of which is colour.
 *
 * `letter` is the monogram, `shape` is the tile it sits in, and `label` is the
 * word — which is always spelled out. A gendered palette here would be both
 * crude and unreadable for the 8% of male users with red-green deficiency.
 */
export const genderMeta: Record<Gender, { letter: string; label: string; shape: 'square' | 'circle' }> = {
  BOYS: { letter: 'B', label: 'Boys only', shape: 'square' },
  GIRLS: { letter: 'G', label: 'Girls only', shape: 'circle' },
  COED: { letter: 'BG', label: 'Co-ed', shape: 'square' },
};

/* ------------------------------------------------------------------ *
 * Availability
 * ------------------------------------------------------------------ */

/**
 * Availability vocabulary is category-specific and never invented at the call
 * site. A bed count says "3 free"; a whole unit says "Vacant"; a dormitory
 * counts tonight. `availabilityLabel` below is the only place these strings
 * are produced.
 *
 * `UNSTATED` is the fifth, and it is the one the live API actually returns
 * today. The `properties` collection records no bed counts and no vacancy
 * flag — an owner is onboarded by a field agent who asks for rent, sharing
 * types and photographs, and nobody has ever been asked how many beds are
 * free this afternoon. Every other member of this union would put a number or
 * a word on screen that no owner ever said: "Vacant" is a claim, and "3 free"
 * is a claim with a figure attached.
 *
 * So it carries nothing, renders nothing, and is neither scarce nor gone. The
 * chip is absent rather than empty. When the panel starts recording occupancy
 * this becomes the fallback for listings that still have not, rather than
 * something to delete.
 */
export type Availability =
  | { kind: 'BEDS'; count: number }
  | { kind: 'UNIT'; vacant: boolean }
  | { kind: 'TONIGHT'; count: number }
  | { kind: 'FILLED'; minutesAgo: number }
  | { kind: 'UNSTATED' };

/** Two or fewer left is the point where the chip goes warning. */
export const SCARCE_AT = 2;

export function availabilityLabel(availability: Availability): string {
  switch (availability.kind) {
    case 'BEDS':
      // Batch 12 accessibility pass: "1 left" differed from "3 free" only in
      // hue. Scarcity now carries the *word*, so it survives greyscale, a
      // colour-blind reader and a phone in sunlight.
      return availability.count === 1 ? 'Last bed' : `${availability.count} free`;
    case 'UNIT':
      return availability.vacant ? 'Vacant' : 'Occupied';
    case 'TONIGHT':
      return availability.count === 1
        ? 'Last bed tonight'
        : `${availability.count} beds free tonight`;
    case 'FILLED':
      return `Filled ${availability.minutesAgo} min ago`;
    case 'UNSTATED':
      /* Empty on purpose, and every caller treats an empty label as "draw
         nothing". A placeholder — "availability unknown", a dash — would be a
         line of chrome saying we have no information, which is worse than the
         silence it replaces: it draws the eye to the absence on every card in
         the feed. */
      return '';
  }
}

export function isScarce(availability: Availability): boolean {
  return (
    (availability.kind === 'BEDS' || availability.kind === 'TONIGHT') &&
    availability.count <= SCARCE_AT &&
    availability.count > 0
  );
}

export function isGone(availability: Availability): boolean {
  return (
    availability.kind === 'FILLED' ||
    (availability.kind === 'UNIT' && !availability.vacant) ||
    ((availability.kind === 'BEDS' || availability.kind === 'TONIGHT') && availability.count === 0)
  );
}

/* ------------------------------------------------------------------ *
 * Amenities
 * ------------------------------------------------------------------ */

export type AmenityName =
  | 'wifi'
  | 'powerBackup'
  | 'waterSupply'
  | 'laundry'
  | 'mess'
  | 'ac'
  | 'attachedBath'
  | 'studyTable'
  | 'cupboard'
  | 'parking'
  | 'cctv'
  | 'housekeeping'
  | 'hotWater'
  | 'lift'
  | 'tv'
  | 'fridge'
  | 'gym'
  | 'warden'
  | 'visitors'
  | 'curfew'
  | 'drinkingWater'
  | 'bicycle'
  /**
   * An amenity the owner named that this set has no icon for.
   *
   * The panel's amenity field is free text — real rows carry "Gaming &
   * Community Lounge", "3-tier security", "RO Water". Twenty-two glyphs will
   * never cover that, and the alternatives were both bad: forcing a near
   * match puts the wrong icon beside a real fact, and dropping the string
   * silently deletes something the owner chose to advertise.
   *
   * So it keeps its own words. `Amenity.label` carries the raw text and the
   * glyph is a plain tick — "this is here", which is all we can honestly
   * claim about a string we do not recognise. It is deliberately absent from
   * the filter sheet: you cannot filter on a category whose contents are
   * whatever anybody typed.
   */
  | 'other';

/**
 * `unknown` is omitted from the UI entirely rather than drawn as a guess —
 * an absent amenity and an unreported one are different facts, and only one of
 * them is safe to show.
 */
export type AmenityState = 'present' | 'absent' | 'unknown';

/**
 * The word for each amenity.
 *
 * Here rather than beside the icon set, because it is vocabulary rather than
 * presentation: the adapter that turns an owner's free text into these names
 * needs to know what each one is called, in order to decide whether the
 * owner's own phrasing adds anything to it. Having that live in a React
 * component meant the data layer imported React Native to read a string map.
 *
 * `components/discovery/AmenityIcon` re-exports this, so nothing that already
 * imported it from there had to change.
 */
export const AMENITY_LABEL: Record<AmenityName, string> = {
  wifi: 'WiFi',
  powerBackup: 'Power backup',
  waterSupply: 'Water supply',
  laundry: 'Laundry',
  mess: 'Mess / food',
  ac: 'AC',
  attachedBath: 'Attached bathroom',
  studyTable: 'Study table',
  cupboard: 'Cupboard',
  parking: 'Two-wheeler parking',
  cctv: 'CCTV',
  housekeeping: 'Housekeeping',
  hotWater: 'Hot water',
  lift: 'Lift',
  tv: 'Common TV',
  fridge: 'Refrigerator',
  gym: 'Gym',
  warden: 'Warden on site',
  visitors: 'Visitor rules',
  curfew: 'Entry curfew',
  drinkingWater: 'Drinking water',
  bicycle: 'Bicycle stand',
  /* Only ever seen if an `other` amenity arrives without its text, which
     would be a bug in the adapter rather than a listing worth describing this
     way. It exists so the Record stays total. */
  other: 'Also included',
};

export type Amenity = {
  name: AmenityName;
  state: AmenityState;
  /**
   * The qualifier is the whole value. "WiFi" is a claim; "WiFi · 40 Mbps" is
   * a fact; "Water · timed 6–9am" is the thing a student needs before signing.
   */
  qualifier?: string;
  /**
   * Overrides the standard label for this amenity.
   *
   * Required for `other`, where the owner's own words are the only thing we
   * have. Available to the rest so a listing can say "Mess · 3 meals" in the
   * owner's phrasing rather than ours, but the standard label is the default
   * and should stay so: a consistent vocabulary is what lets two listings be
   * compared at a glance.
   */
  label?: string;
};

/* ------------------------------------------------------------------ *
 * Meals and rules
 * ------------------------------------------------------------------ */

export type MealSlot = {
  label: string;
  /** Absent means not served — which is stated, never left blank. */
  window?: string;
};

export type MealPlan = {
  included: boolean;
  /**
   * How many meals a day. Absent when the panel recorded that food is
   * included without saying how much of it — "0 meals a day included in
   * rent" is a sentence that contradicts itself, and it is what a required
   * field produced for every listing whose owner ticked the box and stopped.
   */
  mealsPerDay?: number;
  /** "Veg only", "Veg and non-veg". Absent when unrecorded. */
  dietary?: string;
  slots: readonly MealSlot[];
  note?: string;
};

export type HouseRule = {
  label: string;
  value: string;
  /** Carries the dotted underline and opens the glossary. */
  glossary?: { title: string; body: string };
};

/* ------------------------------------------------------------------ *
 * Stay intent — PG and hostel
 * ------------------------------------------------------------------ */

/**
 * How long, and therefore at what rate.
 *
 * PGs and hostels now quote by the day, the week or the month rather than
 * monthly only. The three are separate *rates*, not one rate divided — a place
 * charging ₹450 a night is not charging ₹13,500 a month, and dividing one into
 * the other would invent a number the owner never agreed to.
 */
export type StayTypeId = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type StayRate = {
  id: StayTypeId;
  /** "By the day". Said the way a student would say it. */
  label: string;
  /** "day" / "week" / "month" — the unit the price is per. */
  unit: string;
  /** Per person, per unit. Always per person, never a room price. */
  pricePerUnit: number;
  /** How many days one unit is. Drives the total and the day options. */
  daysPerUnit: number;
  /** The counts offered, in units. A stepper would invite 137 days. */
  unitOptions: readonly number[];
  /**
   * Refundable deposit for this rate.
   *
   * Zero on short stays, and **shown as ₹0 rather than hidden** — the same rule
   * the refund stepper follows. Seeing "Deposit ₹0" is what tells a student
   * that a two-night stay does not carry a two-month deposit, which is
   * otherwise the thing they assume and the reason they do not book.
   */
  deposit: number;
};

/**
 * Meals, as a paid choice rather than a property of the building.
 *
 * A PG with a mess still lets a student opt out — most do, and the ones living
 * on instant noodles are exactly the ones counting rupees. Priced per day so it
 * scales with whatever stay length was chosen.
 */
export type MessChoice =
  | {
      available: true;
      /** Per person, per day. */
      pricePerDay: number;
      /** "2 meals · veg only". What the money buys. */
      summary: string;
    }
  | {
      available: false;
      /**
       * Said out loud instead of hiding the control. A missing mess row reads
       * as a missing feature of the app; "no mess here, shared kitchen
       * instead" is a fact about the building.
       */
      unavailableNote: string;
    };

/* ------------------------------------------------------------------ *
 * Sharing
 * ------------------------------------------------------------------ */

export type SharingOption = {
  id: string;
  label: string;
  /** Always per person per month. Never a room price. */
  /**
   * Per person, per month. Never a room price.
   *
   * Optional, because the panel prices sharing options separately from the
   * listing and very often does not. Where it did not, the honest rendering
   * is "ask the owner" — the alternative was falling back to the headline
   * rent for every option, which put Single and Four-sharing on screen at the
   * same figure. A single room is never the price of a bed in a four, so that
   * fallback was not a rough answer but a wrong one, and it flattened the
   * cheaper-by comparison this control exists for to zero on every row.
   */
  pricePerPerson?: number;
  /**
   * What this sharing costs at each stay rate the listing quotes, per person
   * per unit — a single room by the night, four-sharing by the month.
   *
   * Server-supplied and never derived. A four-sharing bed is not a fixed
   * fraction of a single room, and a nightly rate is not a monthly one divided
   * by thirty; both of those are numbers the owner never agreed to. A rate the
   * server does not send is a rate this sharing is not offered at, and the
   * option is withheld rather than priced by inference.
   *
   * Absent entirely on listings that price by bed rather than by stay length.
   */
  ratePerUnit?: Partial<Record<StayTypeId, number>>;
  deposit?: number;
  depositMonths?: number;
  /**
   * How many beds are free in this sharing option.
   *
   * Optional, because the live API cannot answer it — the `properties`
   * collection records which sharing types a place offers and what each
   * costs, and nothing about occupancy. Absent means unknown: the row says
   * nothing about beds rather than "0 free", which would grey out and
   * un-select every option on every listing in the app.
   *
   * Zero still means zero and still reads as sold out. The difference between
   * "none left" and "we were never told" is the whole reason this is
   * `number | undefined` rather than defaulting to a figure.
   */
  bedsLeft?: number;
  /** The median choice for this listing — the only thing that may pre-select. */
  median?: boolean;
};

/* ------------------------------------------------------------------ *
 * The listing
 * ------------------------------------------------------------------ */

export type Listing = {
  id: string;
  category: StayCategory;
  name: string;
  locality: string;
  /** "near station" — appended to the locality, never replacing it. */
  localityNote?: string;
  /**
   * What the owner wrote about the place, in their own words.
   *
   * The panel has had this field since the leads backend was merged in and
   * nothing in the app has ever shown it — a paragraph an owner took the
   * trouble to write, invisible to every student who opened the listing.
   * Rendered verbatim and never truncated to a preview: it is prose, and the
   * useful half is rarely the first sentence.
   */
  description?: string;
  /**
   * How people here navigate the last 200 metres — "Opp. Ratnadeep, lane 3".
   *
   * This is the *most* precise location a public listing carries. A landmark
   * is usually a shop, so it gets somebody to the street without identifying
   * the building.
   *
   * The full postal address and the map pin are deliberately NOT on this type.
   * They arrive with a paid booking and live on `BookingSummary` — see
   * `addressVisible()` in `data/bookings.ts`. Keeping them off the listing is
   * what makes the rule structural rather than a display convention: a screen
   * that renders a listing cannot leak an address it was never given.
   */
  landmark?: string;
  /**
   * Who a visitor asks for at the gate.
   *
   * A first name, not "the management". A nervous first-timer standing outside
   * an unfamiliar building needs somebody to ask for, and "ask for Padma" is
   * the difference between walking in and walking away.
   */
  ownerName?: string;
  /**
   * Boys, girls or co-ed — and `undefined` when nobody recorded it.
   *
   * This was required, and it could not stay that way once the data was
   * real: only hostels carry a `hostelType` in the panel, so a PG has no
   * gender field at all. Defaulting the gap to `COED` would have printed
   * "Co-ed" under a listing whose owner never said so — on this particular
   * fact that is not a cosmetic error but a wasted trip across a city.
   *
   * Absent means the badge is not drawn, and `matchesQuerySpec` does not
   * exclude the listing: an unknown rule is not a rule against you, and a
   * girl filtering for girls-only should see the place and find out on the
   * visit rather than never see it at all.
   */
  gender?: Gender;
  photoCount: number;
  /** Request at twice the layout size, never at full resolution. */
  photoUri?: string;
  /**
   * The gallery, in the order the owner uploaded it.
   *
   * `photoUri` is the cover and stays the single source for a card that shows
   * one image. This is what makes the card's swipe real: it used to page
   * through the same cover repeated, because a mock listing had a photo count
   * and no photos. Cloudinary URLs from the onboarding upload land here.
   */
  photoUris?: readonly string[];

  /**
   * How many people have opened this listing.
   *
   * It replaced the stay-total and price-age lines under the rent. Those two
   * restated things already on screen; this is the one thing the screen cannot
   * otherwise tell you — whether anybody else is looking.
   */
  viewCount?: number;
  /**
   * The window `viewCount` was counted over — "the last 7 days".
   *
   * A bare count is unreadable: 128 views is a lot this week and nothing at all
   * since the listing went up in March. The number means nothing without the
   * period, so the period travels with it and is never assumed by the UI.
   */
  viewWindow?: string;
  /** `null` when the owner has not set one. Rendered as a sentence. */
  rent: number | null;
  /** Hostels and dormitories quote per bed. */
  perBed?: boolean;
  /** Dormitories quote per night, with the monthly equivalent alongside. */
  perNight?: boolean;
  monthlyEquivalent?: number;
  minNights?: number;

  deposit?: number;
  depositMonths?: number;
  /**
   * Server-computed. Without it, the "high for this area" DepositBadge variant
   * is cut rather than guessed — a comparison the client invents is a lie.
   */
  areaMedianDepositMonths?: number;

  availability: Availability;
  /** How old the quoted rent is, already formatted. */
  freshness?: string;
  saved?: boolean;

  /* Category-specific facts. Each category promotes exactly one of these. */
  meals?: MealPlan;
  gateTime?: string;
  sharingLabel?: string;
  furnishing?: string;
  noticePeriodDays?: number;
  ownKitchen?: boolean;
  noCurfew?: boolean;
  hallSize?: string;
  lockers?: boolean;
  wardenOnSite?: boolean;

  amenities?: readonly Amenity[];
  houseRules?: readonly HouseRule[];
  sharingOptions?: readonly SharingOption[];
  /**
   * PG and hostel only. Present means the listing prices by stay length, and
   * the detail screen shows "Are you looking for" instead of the sharing
   * selector — bed choice moves to the request, where it is being committed to.
   */
  stayRates?: readonly StayRate[];
  mess?: MessChoice;
};

