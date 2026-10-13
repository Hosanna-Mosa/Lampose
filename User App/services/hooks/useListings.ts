import { useCallback, useEffect, useMemo } from 'react';
import { InteractionManager } from 'react-native';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import type { StayCategory } from '@/constants/tokens';
import type { Locality } from '@/types/auth';
import type { BackendListingMeta } from '@/services/api/types';
import { fetchListing, fetchListingReviews, fetchListingMeta, fetchListings, type ListingsResult } from '@/services/api/listings.api';
import type { Listing } from '@/types/listing';
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
 * How long a feed nobody is looking at stays cached. Longer than React
 * Query's five-minute default so the category tabs warmed by
 * `usePrefetchListings` are still there when somebody comes back to one —
 * shown at once and refreshed behind, instead of a skeleton.
 */
const LIST_GC_MS = 15 * 60_000;

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
  /** A radius around a fix instead of a named area — see `ListingQuery.near`. */
  near?: { lat: number; lng: number; radiusKm: number } | null;
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
    near = null,
    enabled = true,
  } = options;

  const query = useQuery({
    queryKey: queryKeys.listingList({ category, city, locality, maxPrice, search, near }),
    queryFn: ({ signal }) => fetchListings({ category, city, locality, maxPrice, search, near, signal }),
    staleTime: STALE_MS,
    gcTime: LIST_GC_MS,
    retry,
    enabled,
  });

  return {
    ...query,
    /* Never undefined, so a screen renders an empty feed rather than
       crashing on `.filter` during the first frame. */
    listings: query.data?.listings ?? [],
    count: query.data?.count ?? 0,
    /* Only meaningful on a radius search — see `ListingsResult.radiusKm`. */
    radiusKm: query.data?.radiusKm,
    error: query.error as ApiError | null,
  };
}

/** How many listings one page of the Explore feed holds. */
export const FEED_PAGE_SIZE = 10;

/** Where the next page starts, or undefined when the last one has arrived. */
const nextOffset = (last: ListingsResult, pages: ListingsResult[]) =>
  last.hasMore ? pages.reduce((sum, page) => sum + page.listings.length, 0) : undefined;

/** The paged feed's cache key: the plain feed's key plus its page size, so
    the two never answer for each other but `['listings']` still clears both. */
const feedKey = (
  filters: Parameters<typeof queryKeys.listingList>[0],
  pageSize: number | null,
) => [...queryKeys.listingList(filters), 'feed', pageSize] as const;

export type UseListingFeedOptions = UseListingsOptions & {
  /**
   * Listings per page, or null for the whole feed in one response.
   *
   * Null is for when the screen filters or sorts on the device — gender,
   * sharing, amenities, "price low to high" — because those can only be
   * right over every listing, not over the pages that happen to be loaded.
   */
  pageSize?: number | null;
};

/**
 * The Explore feed, a page at a time.
 *
 * A category tab used to download every listing in it before it could draw
 * one. Now it asks for `FEED_PAGE_SIZE` and the screen calls `fetchMore` as
 * the student nears the end. `count` is the server's total for the whole
 * feed, not what has been loaded.
 */
export function useListingFeed(options: UseListingFeedOptions = {}) {
  const {
    category = null,
    city = null,
    locality = null,
    maxPrice = null,
    search = null,
    near = null,
    enabled = true,
    pageSize = FEED_PAGE_SIZE,
  } = options;
  const filters = { category, city, locality, maxPrice, search, near };

  const query = useInfiniteQuery({
    queryKey: feedKey(filters, pageSize),
    queryFn: ({ pageParam, signal }) =>
      fetchListings({ ...filters, limit: pageSize, offset: pageParam, signal }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (pageSize ? nextOffset(last, pages) : undefined),
    staleTime: STALE_MS,
    gcTime: LIST_GC_MS,
    retry,
    enabled,
  });

  const pages = query.data?.pages;
  /* De-duplicated by id: a listing added while somebody scrolls shifts every
     offset by one, and the row on the edge would otherwise arrive twice. */
  const listings = useMemo(() => {
    if (!pages) return EMPTY_LISTINGS;
    const seen = new Set<string>();
    const all: Listing[] = [];
    for (const page of pages) {
      for (const listing of page.listings) {
        if (seen.has(listing.id)) continue;
        seen.add(listing.id);
        all.push(listing);
      }
    }
    return all;
  }, [pages]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const fetchMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    ...query,
    listings,
    count: pages?.[0]?.count ?? 0,
    radiusKm: pages?.[0]?.radiusKm,
    fetchMore,
    error: query.error as ApiError | null,
  };
}

const EMPTY_LISTINGS: Listing[] = [];

/**
 * The feeds for the OTHER category tabs, fetched in the background once the
 * one on screen has arrived.
 *
 * Switching Bachelor → PG used to start a cold request on the tap, so the tab
 * changed, the skeleton showed, and the feed arrived a round trip later. With
 * the first page of each warmed in the identical query key `useListingFeed`
 * builds when paging, the tap paints from cache — and warming ten listings
 * per tab is cheap where warming every listing in four tabs was not.
 * `prefetchInfiniteQuery` honours `staleTime`, so a feed already
 * fresh is not asked for again; it waits for interactions so it never competes
 * with the frame that is drawing the current feed.
 */
export function usePrefetchListings(
  categories: readonly StayCategory[],
  scope: Omit<UseListingsOptions, 'category' | 'enabled'>,
  enabled: boolean,
) {
  const client = useQueryClient();
  const { city = null, locality = null, maxPrice = null, search = null, near = null } = scope;
  const nearKey = near ? `${near.lat},${near.lng},${near.radiusKm}` : '';
  const categoriesKey = categories.join(',');

  useEffect(() => {
    if (!enabled || !categories.length) return undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      for (const category of categories) {
        const filters = { category, city, locality, maxPrice, search, near };
        void client.prefetchInfiniteQuery({
          queryKey: feedKey(filters, FEED_PAGE_SIZE),
          queryFn: ({ pageParam, signal }) =>
            fetchListings({ ...filters, limit: FEED_PAGE_SIZE, offset: pageParam, signal }),
          initialPageParam: 0,
          getNextPageParam: nextOffset,
          staleTime: STALE_MS,
          gcTime: LIST_GC_MS,
          retry,
        });
      }
    });
    return () => task.cancel();
    // `near` is read through `nearKey`; the array through `categoriesKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, client, categoriesKey, city, locality, maxPrice, search, nearKey]);
}

/** One listing. Enabled only once there is an id to ask about. */
/**
 * What guests said about one listing, with the owner's replies.
 *
 * Separate from `useListing` rather than folded into it: the listing itself
 * is read on every card and every detail open, while reviews are read on the
 * detail page only, and a place with two hundred reviews should not make the
 * feed heavier.
 */
export function useListingReviews(id: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.listingReviews(id ?? ''),
    queryFn: ({ signal }) => fetchListingReviews(id as string, signal),
    enabled: Boolean(id),
    staleTime: STALE_MS,
    retry,
  });

  return {
    ...query,
    reviews: query.data?.reviews ?? [],
    averageRating: query.data?.averageRating ?? null,
    count: query.data?.count ?? 0,
    error: query.error as ApiError | null,
  };
}

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
  /** Category counts within a scope. `''` is the whole catalogue. */
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

  const data = query.data;
  /* Built once per response rather than on every render of the screen reading
     it — Home re-renders on every tap, and each fresh `meta` object re-ran the
     memos keyed on it. */
  const meta = useMemo<ListingMeta | undefined>(() => {
    const byScope = new Map<string, Record<string, number>>();

    /*
     * The empty scope is the WHOLE catalogue.
     *
     * Registered explicitly rather than left to fall through to `{}`, because
     * "All locations" is a real answer on the locality screen and the feed's
     * empty state has to be able to count the other categories under it. Built
     * from `meta.categories`, which is the server's own catalogue-wide facet, so
     * it is the same tally the per-area maps below are slices of rather than a
     * sum this client computed.
     */
    byScope.set(
      '',
      Object.fromEntries((data?.categories ?? []).map((row) => [row.name, row.count])),
    );

    for (const city of data?.cities ?? []) byScope.set(city.name, city.categories ?? {});
    for (const area of data?.localities ?? []) {
      byScope.set(`${area.city}::${area.name}`, area.categories ?? {});
    }

    return data
      ? {
          localities: toLocalities(data, category),
          guess: guessLocality(data, category),
          cities: data.cities ?? [],
          categories: data.categories ?? [],
          categoriesIn: (scope: string) => byScope.get(scope) ?? {},
          monthlyRent: data.monthlyRent ?? { min: null, max: null, median: null },
          total: data.total ?? 0,
        }
      : undefined;
  }, [data, category]);

  return { ...query, meta, error: query.error as ApiError | null };
}
