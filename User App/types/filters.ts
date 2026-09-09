import type { StayCategory } from '@/constants/tokens';
import type { AmenityName, Gender, Listing } from '@/types/listing';

/**
 * The search query, and what the app is allowed to say about it.
 *
 * Filtering fails in one specific way: the user narrows until nothing is left,
 * cannot tell which control did it, and gives up. Everything here exists to
 * make that impossible — a live count on the commit button, validation that
 * names the offending control, and a hard block on the one filter that wastes
 * a whole session when it is wrong.
 */

export type SortKey = 'recommended' | 'rentLow' | 'depositLow';

export const SORT_LABEL: Record<SortKey, string> = {
  recommended: 'Recommended',
  rentLow: 'Lowest rent',
  depositLow: 'Lowest deposit',
};

export type SearchQuery = {
  /**
   * Required on the categories where it is a real rule, and on those only.
   * Never pre-selected from anything we inferred — showing a boy a girls-only
   * hostel is not a bad recommendation, it is a wasted trip and a broken
   * promise. See `filterSpecFor` for which categories ask it.
   */
  gender: Gender | null;
  categories: readonly StayCategory[];
  /** A ceiling, never a range. No student excludes a place for being too cheap. */
  rentCeiling: number | null;
  /**
   * The bed, unit or room type, by the owner's own label.
   *
   * The values are whatever the panel recorded for the listings currently on
   * screen — "2 Sharing", "1 BHK", "Deluxe Double" — rather than a fixed set
   * this app invented. What the control is CALLED changes by category, because
   * the same field means a different thing in each: see `filterSpecFor`.
   */
  sharing: readonly string[];
  /**
   * "Fully furnished", "Semi-furnished", "Unfurnished" — `details.furnishing`
   * as the panel recorded it.
   *
   * Only asked where it is a decision. It is the first question about a whole
   * unit and a non-question about a PG bed, which comes furnished by
   * definition.
   */
  furnishing: readonly string[];
  /**
   * Meals included, or not asked.
   *
   * `null` is "does not matter" rather than "no" — the tri-state matters here,
   * because a student who has not answered must still be shown places without
   * a mess.
   */
  meals: boolean | null;
  amenities: readonly AmenityName[];
  sort: SortKey;
};

export const EMPTY_QUERY: SearchQuery = {
  gender: null,
  categories: [],
  rentCeiling: null,
  sharing: [],
  furnishing: [],
  meals: null,
  amenities: [],
  sort: 'recommended',
};

export function activeFilterCount(query: SearchQuery): number {
  return (
    (query.gender ? 1 : 0) +
    (query.categories.length ? 1 : 0) +
    (query.rentCeiling !== null ? 1 : 0) +
    (query.sharing.length ? 1 : 0) +
    (query.furnishing.length ? 1 : 0) +
    (query.meals !== null ? 1 : 0) +
    (query.amenities.length ? 1 : 0)
  );
}

/* ------------------------------------------------------------------ *
 * What each category is actually filtered by
 * ------------------------------------------------------------------ */

/**
 * The sheet asked every category the same five questions, and three of them
 * were wrong for at least one category.
 *
 * A PG is a bed in a shared room, so "how many share it" and "are meals
 * included" are the two questions that decide it. A bachelor unit is a whole
 * place — nobody shares it, so "sharing" is meaningless, and "furnished or
 * not" is the question a bed never has to ask. A hotel is sold by the night to
 * whoever walks in, so a boys-or-girls rule is not a fact about it at all.
 * Asking all five everywhere produced controls that filtered nothing and, in
 * gender's case, a REQUIRED control that filtered nothing and blocked Apply
 * until it was answered.
 *
 * So each category declares what it is filtered by. The values inside each
 * control still come from the inventory on screen — see `facetsFor` — so this
 * decides which questions are asked and the database decides what the answers
 * may be.
 */
export type CategoryFilterSpec = {
  /** Is gender a rule at this kind of place, and therefore required? */
  gender: boolean;
  /** The heading over the bed/unit/room control, or null to omit it. */
  sharingLabel: string | null;
  /** Whether furnishing is a question here. */
  furnishing: boolean;
  /** Whether meals are a question here. */
  meals: boolean;
  /** What the rent ceiling is a ceiling ON. */
  rentLabel: string;
};

export function filterSpecFor(category: StayCategory | null): CategoryFilterSpec {
  switch (category) {
    case 'PG_HOSTEL':
      return {
        /* Every PG and hostel has a boys/girls/co-ed rule, and it is the one
           filter that saves a wasted journey rather than a scroll. */
        gender: true,
        sharingLabel: 'How many share the room?',
        /* A PG bed comes with a bed, a cupboard and a table. There is nothing
           to choose. */
        furnishing: false,
        meals: true,
        rentLabel: 'Monthly rent — up to',
      };
    case 'COLIVE':
      return {
        /* A co-live has house rules like a PG does — many are women-only. */
        gender: true,
        sharingLabel: 'Room or whole house?',
        furnishing: true,
        /* Some co-lives cater and most do not; it is worth asking and it is
           not the deciding question a PG's mess is. */
        meals: true,
        rentLabel: 'Monthly rent — up to',
      };
    case 'BACHELOR':
      return {
        /* A whole unit is let to a tenant, not to a gender. The panel records
           no `hostelType` for one, so this filtered nothing and blocked
           Apply. */
        gender: false,
        sharingLabel: 'Which unit?',
        /* The first question anybody asks about an empty flat, and the
           difference between moving in with a mattress and moving in with a
           van. */
        furnishing: true,
        meals: false,
        rentLabel: 'Monthly rent — up to',
      };
    case 'HOTEL':
      return {
        gender: false,
        sharingLabel: 'Which room?',
        /* A hotel room is furnished. Saying so as a filter would be a control
           with one answer. */
        furnishing: false,
        meals: false,
        /* Hotels are quoted per night — see `perNight` on the listing — so a
           "monthly rent" ceiling here would be a ceiling on the wrong number. */
        rentLabel: 'Price per night — up to',
      };
    default:
      return {
        gender: true,
        sharingLabel: 'Sharing',
        furnishing: false,
        meals: false,
        rentLabel: 'Monthly rent — up to',
      };
  }
}

/**
 * The values each control may offer, read off the listings on screen.
 *
 * This is what makes the sheet a filter over the CATALOGUE rather than over a
 * list of words somebody typed into this file. The old sheet offered
 * "1-sharing" … "4-sharing" and "Others" as constants; the panel records
 * "2 Sharing", "Single Occupancy", "1 BHK" and "Deluxe Double", none of which
 * match, so four of the five chips selected nothing and the fifth selected
 * everything.
 *
 * Sorted so the row is stable between renders — an option list that reorders
 * as the feed refetches is a control that moves under a thumb.
 */
export type Facets = {
  sharing: readonly string[];
  furnishing: readonly string[];
  /** Whether any listing here states a meal plan at all. */
  hasMeals: boolean;
};

export function facetsFor(inventory: readonly Listing[]): Facets {
  const sharing = new Set<string>();
  const furnishing = new Set<string>();
  let hasMeals = false;

  for (const listing of inventory) {
    for (const option of listing.sharingOptions ?? []) {
      if (option.label?.trim()) sharing.add(option.label.trim());
    }
    /* The single-option listings, whose one label lives here instead. */
    if (listing.sharingLabel?.trim()) sharing.add(listing.sharingLabel.trim());
    if (listing.furnishing?.trim()) furnishing.add(listing.furnishing.trim());
    if (listing.meals?.included) hasMeals = true;
  }

  return {
    sharing: [...sharing].sort((a, b) => a.localeCompare(b, 'en-IN')),
    furnishing: [...furnishing].sort((a, b) => a.localeCompare(b, 'en-IN')),
    hasMeals,
  };
}

/* ------------------------------------------------------------------ *
 * Matching
 * ------------------------------------------------------------------ */

export function matchesQuerySpec(listing: Listing, query: SearchQuery): boolean {
  /* A listing whose gender rule was never recorded is NOT excluded.
     Hiding it would be the app inventing a rule on the owner's behalf and
     then enforcing it — a girls-only hostel that nobody tagged would become
     invisible to the only people who can stay in it. Shown, unbadged, and
     the truth arrives on the visit. `COED` passes for the same reason it
     always did: it is a stated rule that excludes nobody. */
  if (query.gender && listing.gender && listing.gender !== query.gender && listing.gender !== 'COED') {
    return false;
  }
  if (query.categories.length && !query.categories.includes(listing.category)) return false;
  if (query.rentCeiling !== null && listing.rent !== null && listing.rent > query.rentCeiling) return false;

  /*
   * ANY of the listing's options may satisfy the filter, not just its headline
   * one.
   *
   * This used to compare against `listing.sharingLabel` alone, which the
   * adapter only sets when a listing offers exactly ONE option — so a place
   * offering two-, three- and four-sharing had no label at all and was
   * excluded by every sharing filter, including "2 Sharing", which it plainly
   * had. A filter for a room type is a question about what the property
   * OFFERS, and a property offering it should match.
   */
  if (query.sharing.length) {
    const offered = [
      ...(listing.sharingOptions ?? []).map((option) => option.label),
      listing.sharingLabel,
    ].filter((label): label is string => Boolean(label));
    if (!offered.some((label) => query.sharing.includes(label))) return false;
  }

  /* An unrecorded furnishing is NOT excluded, for the same reason an
     unrecorded gender is not: the panel does not require the field, and
     hiding a listing because nobody filled it in is the app enforcing a rule
     the owner never stated. A listing that HAS one and does not match is. */
  if (query.furnishing.length && listing.furnishing && !query.furnishing.includes(listing.furnishing)) {
    return false;
  }

  /* Only ever applied when the student answered it — `null` is "does not
     matter", not "no". A listing with no meal plan recorded counts as not
     included, which is the honest reading: we were not told there is one. */
  if (query.meals !== null && Boolean(listing.meals?.included) !== query.meals) return false;

  if (query.amenities.length) {
    const present = new Set(
      (listing.amenities ?? []).filter((a) => a.state === 'present').map((a) => a.name),
    );
    if (!query.amenities.every((name) => present.has(name))) return false;
  }
  return true;
}

export function applyQuery(listings: readonly Listing[], query: SearchQuery): readonly Listing[] {
  const matched = listings.filter((listing) => matchesQuerySpec(listing, query));
  const sorted = [...matched];
  switch (query.sort) {
    case 'rentLow':
      sorted.sort((a, b) => (a.rent ?? Infinity) - (b.rent ?? Infinity));
      break;
    case 'depositLow':
      sorted.sort((a, b) => (a.deposit ?? Infinity) - (b.deposit ?? Infinity));
      break;
    default:
      break;
  }
  return sorted;
}

/* ------------------------------------------------------------------ *
 * Validation — three levels, never a modal
 * ------------------------------------------------------------------ */

export type IssueLevel = 'blocking' | 'advisory';

export type FilterIssue = {
  /** Which control the message renders under. Never a banner at the top. */
  field: 'gender' | 'rent' | 'deposit' | 'sharing' | 'furnishing' | 'meals' | 'combination';
  level: IssueLevel;
  message: string;
  /** A one-tap correction, where a correct value can be computed. */
  fix?: { label: string; patch: Partial<SearchQuery> };
};

/**
 * Validation runs against the real inventory, so it can only ever say things
 * that are true of it.
 *
 * Blocking is reserved for two cases: gender, which is a hard rule at every
 * property, and a rent ceiling below the cheapest place in the area — an empty
 * result set we can predict should never be reachable.
 */
export function validateQuery(
  query: SearchQuery,
  inventory: readonly Listing[],
  /**
   * Which category's sheet this is. Decides whether gender is asked at all —
   * see `filterSpecFor`. Omitted, it keeps the old always-required behaviour,
   * so a caller that has not been updated cannot silently lose the gate.
   */
  category: StayCategory | null = null,
): readonly FilterIssue[] {
  const issues: FilterIssue[] = [];
  const spec = filterSpecFor(category);

  /* Blocking only where the sheet actually asks it. A required control that a
     category does not draw is a button that can never be enabled — which is
     what a bachelor or hotel search used to hit. */
  if (spec.gender && !query.gender) {
    issues.push({
      field: 'gender',
      level: 'blocking',
      message: 'Pick who this is for. Every place has a rule about it, and guessing wastes your search.',
    });
  }

  const rents = inventory.map((l) => l.rent).filter((r): r is number => r !== null);
  const cheapest = rents.length ? Math.min(...rents) : null;

  if (query.rentCeiling !== null && cheapest !== null && query.rentCeiling < cheapest) {
    issues.push({
      field: 'rent',
      level: 'blocking',
      message: `Nothing here is under ₹${query.rentCeiling.toLocaleString('en-IN')}. The cheapest place in this area is ₹${cheapest.toLocaleString('en-IN')}.`,
      fix: { label: `Raise to ₹${cheapest.toLocaleString('en-IN')}`, patch: { rentCeiling: cheapest } },
    });
  }

  const count = applyQuery(inventory, query).length;
  if (count > 0 && count < 5 && !issues.some((i) => i.level === 'blocking')) {
    issues.push({
      field: 'combination',
      level: 'advisory',
      message: `${count} ${count === 1 ? 'place matches' : 'places match'} everything you have picked. Loosening one filter usually brings back several.`,
    });
  }

  return issues;
}

export function hasBlockingIssue(issues: readonly FilterIssue[]): boolean {
  return issues.some((issue) => issue.level === 'blocking');
}

/* ------------------------------------------------------------------ *
 * No-results recovery
 * ------------------------------------------------------------------ */

export type Relaxation = {
  /** Which control this loosens, for tinting it in the query summary. */
  field: 'rent' | 'deposit' | 'sharing' | 'furnishing' | 'meals' | 'amenities' | 'categories';
  label: string;
  /** How many places this one change brings back. Never a guess. */
  count: number;
  patch: Partial<SearchQuery>;
};

/**
 * The three single-filter changes that would bring back the most places.
 *
 * A no-results screen that only says "no results" makes the user guess which
 * of six controls did it. Each suggestion here names its exact count, so the
 * choice is a trade-off the user can weigh rather than a hunt.
 *
 * Gender is never suggested. It is a hard rule at every property, not a knob —
 * loosening it would send someone to a place that cannot take them.
 *
 * In production this is computed server-side, because only the server knows the
 * full inventory. The client version below is exact for the mock.
 */
export function relaxationSuggestions(
  query: SearchQuery,
  inventory: readonly Listing[],
): readonly Relaxation[] {
  const base = applyQuery(inventory, query).length;
  const candidates: Relaxation[] = [];

  const consider = (field: Relaxation['field'], label: string, patch: Partial<SearchQuery>) => {
    const count = applyQuery(inventory, { ...query, ...patch }).length;
    if (count > base) candidates.push({ field, label, count, patch });
  };

  if (query.rentCeiling !== null) {
    const rents = inventory.map((l) => l.rent).filter((r): r is number => r !== null);
    const next = rents.filter((r) => r > query.rentCeiling!).sort((a, b) => a - b)[0];
    if (next !== undefined) {
      consider('rent', `Raise rent to ₹${next.toLocaleString('en-IN')}`, { rentCeiling: next });
    }
  }

  if (query.sharing.length) consider('sharing', 'Any sharing type', { sharing: [] });
  if (query.furnishing.length) consider('furnishing', 'Any furnishing', { furnishing: [] });
  if (query.meals !== null) consider('meals', 'With or without meals', { meals: null });
  if (query.amenities.length) consider('amenities', 'Drop the amenity filters', { amenities: [] });
  if (query.categories.length) consider('categories', 'Show every kind of place', { categories: [] });

  return candidates.sort((a, b) => b.count - a.count).slice(0, 3);
}
