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
 */
export type Availability =
  | { kind: 'BEDS'; count: number }
  | { kind: 'UNIT'; vacant: boolean }
  | { kind: 'TONIGHT'; count: number }
  | { kind: 'FILLED'; minutesAgo: number };

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
  | 'bicycle';

/**
 * `unknown` is omitted from the UI entirely rather than drawn as a guess —
 * an absent amenity and an unreported one are different facts, and only one of
 * them is safe to show.
 */
export type AmenityState = 'present' | 'absent' | 'unknown';

export type Amenity = {
  name: AmenityName;
  state: AmenityState;
  /**
   * The qualifier is the whole value. "WiFi" is a claim; "WiFi · 40 Mbps" is
   * a fact; "Water · timed 6–9am" is the thing a student needs before signing.
   */
  qualifier?: string;
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
  mealsPerDay: number;
  /** "Veg only", "Veg and non-veg". */
  dietary: string;
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
  pricePerPerson: number;
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
  bedsLeft: number;
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
  gender: Gender;
  photoCount: number;
  /** Request at twice the layout size, never at full resolution. */
  photoUri?: string;

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

