import type { SharingOption, StayRate, StayTypeId } from '@/types/listing';
import type { HotelIntent, HotelRateStructure } from './HotelStaySelector';
import type { StayIntent } from './StayIntentSelector';
import { defaultSharingSelection } from './SharingTypeSelector';

export { defaultSharingSelection };

/**
 * What a listing arrives with already chosen.
 *
 * A detail screen renders one of three controls depending on what the property
 * is, and each used to open with nothing selected — so every category showed a
 * priced list, a dead primary button, and nothing on screen explaining what was
 * missing. This module is the one place that answers "what is picked when the
 * page opens", for all of them, under one rule.
 *
 * ## The rule
 *
 * **Pick the most ordinary version of what this property is, and never pick
 * anything that is about the student rather than the property.**
 *
 * The first half is why a PG opens on its monthly rate rather than its cheapest
 * one, and why a bed is the first the owner listed rather than the lowest
 * priced: the order and the headline rate are how the owner described their
 * property, and re-sorting them to put the cheapest thing under a thumb would
 * be making a recommendation while looking like a list.
 *
 * The second half is the line this module will not cross. A move-in date, a
 * number of nights, a checkbox saying the dates are flexible — those are facts
 * about the student's plans, and a screen that fills them in has invented an
 * answer and put it on a request an owner will read as deliberate. Those stay
 * null and the action bar stays disabled until they are answered.
 *
 * So: the *structure* of the ask is pre-filled, the *commitments* are not.
 *
 * ## Seeded once, never moved
 *
 * Every function here takes the current value and returns `null` when there is
 * nothing to do. A default is for an untouched screen; re-applying one over a
 * student mid-decision would move a price they were reading.
 */

/** Available unless the count is a known zero. `undefined` means unrecorded. */
const available = (option: SharingOption) => option.bedsLeft !== 0;

/**
 * The first bed a listing actually offers.
 *
 * Shared by all three controls so "which bed is pre-picked" cannot drift into
 * three answers. Sold-out options are skipped — pre-selecting one would arm the
 * button for a bed that does not exist, which is worse than picking nothing.
 */
const firstAvailable = (options: readonly SharingOption[] | undefined): string | null => {
  if (!options?.length) return null;
  const median = options.find((option) => option.median && available(option));
  if (median) return median.id;
  return options.find(available)?.id ?? null;
};

/* ------------------------------------------------------------------ *
 * PG and hostel — `StayIntentSelector`
 * ------------------------------------------------------------------ */

/**
 * Monthly, if this property quotes it.
 *
 * The comment above `intent` on the listing screen has always said "defaults to
 * the monthly rate — this is a monthly-rental product and the short rates are
 * the exception, not the headline". It described behaviour that was never
 * implemented; the state initialised to all nulls. This makes the code do what
 * it already said it did.
 *
 * Weekly is deliberately not a candidate. `StayIntentSelector` offers two
 * tracks — short stay in days, long stay in months — and a weekly rate is
 * reachable through neither, so defaulting to it would select a track the
 * control cannot show.
 */
const headlineRate = (rates: readonly StayRate[]): StayRate | null =>
  rates.find((rate) => rate.id === 'MONTHLY')
  ?? rates.find((rate) => rate.id === 'DAILY')
  ?? null;

/**
 * The smallest count the rate offers.
 *
 * One month, or one night. The shortest commitment is the honest default: it is
 * the cheapest total on screen, and a student who wants longer is increasing a
 * number they can see rather than discovering they had agreed to six months.
 */
const smallestUnit = (rate: StayRate): number | null => {
  if (!rate.unitOptions?.length) return null;
  return rate.unitOptions.reduce((low, option) => (option < low ? option : low), rate.unitOptions[0]);
};

export function defaultStayIntent(
  rates: readonly StayRate[] | undefined,
  sharingOptions: readonly SharingOption[] | undefined,
  current: StayIntent,
): StayIntent | null {
  /* Touched already — a real answer, or a partial one somebody is mid-way
     through. Either way it is theirs. */
  if (current.stayType !== null || current.units !== null || current.sharingId !== null) return null;
  if (!rates?.length) return null;

  const rate = headlineRate(rates);
  if (!rate) return null;

  const units = smallestUnit(rate);
  if (units === null) return null;

  return {
    ...current,
    stayType: rate.id as StayTypeId,
    units,
    sharingId: firstAvailable(sharingOptions),
    /* Not ours to answer — see the rule at the top. */
    joinDate: current.joinDate,
    flexibleJoin: current.flexibleJoin,
  };
}

/* ------------------------------------------------------------------ *
 * Hotels — `HotelStaySelector`
 * ------------------------------------------------------------------ */

/**
 * How this bed is sold.
 *
 * Nightly first, because a hotel is a nightly product and it is the only
 * structure the control can complete from a pair of dates. Monthly and hourly
 * are the long-stay and day-use exceptions, offered when the bed carries no
 * nightly price.
 *
 * The same precedence already exists inside `hotelComplete` on the listing
 * screen, as a fallback for when nothing was chosen. Choosing it up front means
 * the screen and its validity check agree on what is selected instead of one
 * inferring what the other left blank.
 */
const structureFor = (bed: SharingOption | undefined): HotelRateStructure | null => {
  if (!bed?.rates) return null;
  if (bed.rates.nightly) return 'nightly';
  if (bed.rates.monthly) return 'monthly';
  if (bed.rates.flexible) return 'flexible';
  return null;
};

export function defaultHotelIntent(
  options: readonly SharingOption[] | undefined,
  current: HotelIntent,
): HotelIntent | null {
  if (current.sharingId !== null || current.rateStructure !== null) return null;
  if (!options?.length) return null;

  const sharingId = firstAvailable(options);
  if (!sharingId) return null;

  return {
    ...current,
    sharingId,
    rateStructure: structureFor(options.find((option) => option.id === sharingId)),
    /*
     * Dates and counts stay empty, and this is the category where that matters
     * most. A pre-filled check-in is a night somebody is asked to pay for on a
     * date they never picked, and "tonight" is a guess that is wrong for most
     * of the people reading it.
     */
    checkIn: current.checkIn,
    checkOut: current.checkOut,
    rateQuantity: current.rateQuantity,
  };
}
