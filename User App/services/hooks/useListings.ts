import { useQuery } from '@tanstack/react-query';

import type { StayCategory } from '@/constants/tokens';
import type { Locality } from '@/types/auth';
import type { BackendListingMeta } from '@/services/api/types';
import { fetchListing, fetchListingMeta, fetchListings } from '@/services/api/listings.api';
import { ApiError } from '@/services/api/client';
import { guessLocality, toLocalities } from '@/services/adapters/places.adapter';
import { queryKeys } from './keys';

/**
 * The feed, a listing, and the places we cover.
 *
 * ## Why these are queries rather than state in a screen
 *
 * Three screens read the same feed — home, results, and the "similar places"
 * block on a listing that has filled. Held in each screen's state, that is
 * three fetches of the same rows and three chances for them to disagree about
 * a rent. Keyed through React Query, the second and third are answered from
 * the cache and the rows are the same objects.
 *
 * ## Staleness is short, deliberately
 *
 * A minute. This app is about money that changes: an owner raises a rent in
 * the panel and a student holding a stale card requests a bed at last week's
 * figure. A long cache is comfortable on a train and wrong at the moment it
 * matters, so the feed re-fetches on focus and the detail screen re-fetches
 * when it is opened.
 */

const STALE_MS = 60_000;

/**
 * A refused request is not retried; an unreachable one already was.
 *
 * `apiRequest` retries network failures itself, with a backoff tuned to a
 * phone coming out of a tunnel. Anything that arrives here as an `ApiError`
 * with a real status is the server's considered answer — a 404 for a listing
 * that is gone, a 503 from a dropped database — and asking three more times
 * changes nothing except how long the spinner runs.
 */
const retry = (count: number, error: unknown) => {
  if (error instanceof ApiError && error.status > 0) return false;
  return count < 1;
};

export type UseListingsOptions = {
  category?: StayCategory | null;
  city?: string | null;
  /** The area. Narrower than `city`, and what the entry screen chose. */
  locality?: string | null;
  maxPrice?: number | null;
  search?: string | null;
  enabled?: boolean;
};

/**
 * The feed.
 *
 * Everything the server can narrow is narrowed by it. Gender, sharing and
 * amenity filters are applied by the caller through `applyQuery` — see the
 * note in `listings.api.ts` for why they cannot be sent.
 */
export function useListings(options: UseListingsOptions = {}) {
  const {
    category = null,
    city = null,
    locality = null,
    maxPrice = null,
    search = null,
    enabled = true,
  } = options;

  const query = useQuery({
    queryKey: queryKeys.listingList({ category, city, locality, maxPrice, search }),
    queryFn: ({ signal }) => fetchListings({ category, city, locality, maxPrice, search, signal }),
    staleTime: STALE_MS,
    retry,
    enabled,
  });

  return {
    ...query,
    /* Never undefined, so a screen renders an empty feed rather than
       crashing on `.filter` during the first frame. */
    listings: query.data?.listings ?? [],
    count: query.data?.count ?? 0,
    error: query.error as ApiError | null,
  };
}

/** One listing. Enabled only once there is an id to ask about. */
export function useListing(id: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.listing(id ?? ''),
    queryFn: ({ signal }) => fetchListing(id as string, signal),
    enabled: Boolean(id),
    staleTime: STALE_MS,
    retry,
  });

  return {
    ...query,
    listing: query.data,
    error: query.error as ApiError | null,
    /**
     * The listing does not exist, as opposed to not having loaded.
     *
     * The two need different screens — "no longer available, here is what is
     * nearby" against "we could not reach Lampose, try again" — and telling
     * them apart from a bare `undefined` is impossible.
     */
    notFound: query.error instanceof ApiError && query.error.status === 404,
  };
}

export type ListingMeta = {
  localities: Locality[];
  /** The area with the most in it, offered as the location guess. */
  guess: Locality | null;
  cities: BackendListingMeta['cities'];
  /** Which of the collection's categories have anything in them, catalogue-wide. */
  categories: { name: string; slug: string; count: number }[];
  /**
   * The same breakdown per area and per city, keyed `"City::Area"` and
   * `"City"`.
   *
   * A lookup rather than a field on `Locality`, because `Locality` is the
   * entry screen's model and has no business carrying the collection's
   * internal category names. The one caller is the empty state that has to
   * say how many places of a DIFFERENT kind are in the area currently on
   * screen — a question the catalogue-wide list above cannot answer.
   */
  categoriesIn: (scope: string) => Record<string, number>;
  /** Monthly only — nightly listings are excluded server-side. */
  monthlyRent: { min: number | null; max: number | null; median: number | null };
  total: number;
};

/**
 * Which cities, areas and categories the collection actually holds.
 *
 * Read by the two entry screens, before any feed exists.
 *
 * ## Cached for a minute, not ten
 *
 * It was ten, on the reasoning that a rent changes daily and the set of areas
 * Lampose covers does not. That is true of a mature catalogue and wrong for
 * this one: properties are being onboarded through the panel right now, and
 * an area is created the moment the first property in it is saved. A
 * ten-minute cache meant somebody adding a property and immediately opening
 * the app saw the old list with the old counts — which is indistinguishable
 * from the counts being broken, and was reported as exactly that.
 *
 * A minute, and a refetch whenever the app comes back to the foreground, so
 * switching from the panel to the app shows what was just saved.
 */
export function useListingMeta(category?: StayCategory | null) {
  const query = useQuery({
    queryKey: queryKeys.listingMeta,
    queryFn: ({ signal }) => fetchListingMeta(signal),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry,
  });

  const byScope = new Map<string, Record<string, number>>();
  for (const city of query.data?.cities ?? []) byScope.set(city.name, city.categories ?? {});
  for (const area of query.data?.localities ?? []) {
    byScope.set(`${area.city}::${area.name}`, area.categories ?? {});
  }

  const meta: ListingMeta | undefined = query.data
    ? {
        localities: toLocalities(query.data, category),
        guess: guessLocality(query.data, category),
        cities: query.data.cities ?? [],
        categories: query.data.categories ?? [],
        categoriesIn: (scope: string) => byScope.get(scope) ?? {},
        monthlyRent: query.data.monthlyRent ?? { min: null, max: null, median: null },
        total: query.data.total ?? 0,
      }
    : undefined;

  return { ...query, meta, error: query.error as ApiError | null };
}
