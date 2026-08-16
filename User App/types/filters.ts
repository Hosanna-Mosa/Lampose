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
   * The one required field in the whole app. Never pre-selected from anything
   * we inferred — showing a boy a girls-only hostel is not a bad
   * recommendation, it is a wasted trip and a broken promise.
   */
  gender: Gender | null;
  categories: readonly StayCategory[];
  /** A ceiling, never a range. No student excludes a place for being too cheap. */
  rentCeiling: number | null;
  sharing: readonly string[];
  amenities: readonly AmenityName[];
  sort: SortKey;
};

export const EMPTY_QUERY: SearchQuery = {
  gender: null,
  categories: [],
  rentCeiling: null,
  sharing: [],
  amenities: [],
  sort: 'recommended',
};

export function activeFilterCount(query: SearchQuery): number {
  return (
    (query.gender ? 1 : 0) +
    (query.categories.length ? 1 : 0) +
    (query.rentCeiling !== null ? 1 : 0) +
    (query.sharing.length ? 1 : 0) +
    (query.amenities.length ? 1 : 0)
  );
}

/* ------------------------------------------------------------------ *
 * Matching
 * ------------------------------------------------------------------ */

export function matchesQuerySpec(listing: Listing, query: SearchQuery): boolean {
  if (query.gender && listing.gender !== query.gender && listing.gender !== 'COED') return false;
  if (query.categories.length && !query.categories.includes(listing.category)) return false;
  if (query.rentCeiling !== null && listing.rent !== null && listing.rent > query.rentCeiling) return false;
  if (query.sharing.length && !query.sharing.includes(listing.sharingLabel ?? '')) return false;
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
  field: 'gender' | 'rent' | 'deposit' | 'sharing' | 'combination';
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
): readonly FilterIssue[] {
  const issues: FilterIssue[] = [];

  if (!query.gender) {
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
  field: 'rent' | 'deposit' | 'sharing' | 'amenities' | 'categories';
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
  if (query.amenities.length) consider('amenities', 'Drop the amenity filters', { amenities: [] });
  if (query.categories.length) consider('categories', 'Show every kind of place', { categories: [] });

  return candidates.sort((a, b) => b.count - a.count).slice(0, 3);
}
