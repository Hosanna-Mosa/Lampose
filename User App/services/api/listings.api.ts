import type { Listing } from '@/types/listing';
import type { StayCategory } from '@/constants/tokens';
import { BACKEND_CATEGORIES, toListing, toListings } from '@/services/adapters/listing.adapter';
import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';
import type { BackendListing, BackendListingMeta } from './types';

/**
 * Listings, as the app asks for them.
 *
 * ## What the server filters, and what this app filters
 *
 * The server narrows on the four things the `properties` collection has a
 * column for — category, city, a rent ceiling and a text search. Those go
 * over the wire, so a phone on a train downloads six listings rather than
 * six hundred.
 *
 * Gender, sharing type and amenities are applied on the device, by
 * `applyQuery` in `types/filters.ts`. Not an oversight and not laziness:
 * there is nothing in the collection to filter them against. Gender lives in
 * a free-form `categoryDetails` blob and only hostels carry it; amenities are
 * a list of strings somebody typed. A server-side filter on either would be
 * matching a regex against prose and silently dropping listings whose owner
 * phrased it differently — the client-side pass at least works on the same
 * normalised values the cards display.
 *
 * ## The category is translated, not passed through
 *
 * The app's four tabs are not the collection's four categories. "PG / Hostel"
 * is one tab over two enum values. `BACKEND_CATEGORIES` holds that mapping
 * and the two are sent as a comma-separated list, which the controller reads
 * as a set. Sending the app's own name would match nothing at all.
 */

export type ListingQuery = {
  /** The app's category. Translated to the collection's names before sending. */
  category?: StayCategory | null;
  /** Matched against the server-derived city, exactly as the feed reports it. */
  city?: string | null;
  /**
   * The AREA — "HSR Layout Sector 1" — not the city it is in.
   *
   * This is what the entry screen actually asks for, and sending only the
   * city was the reason an area row saying "1 place" opened a feed of three:
   * the other two were elsewhere in Bangalore. Matched against the same
   * derivation the facets endpoint groups by, so a count and the feed behind
   * it are answers to the same question.
   */
  locality?: string | null;
  /** The app's rent ceiling. */
  maxPrice?: number | null;
  /** Name, place, owner or amenity. The server decides which. */
  search?: string | null;
  /**
   * A radius search instead of a named area — "Use my current location" on
   * the entry screen, with a chosen radius, rather than a locality string.
   * All three travel together: sending one without the other two is a
   * caller error the server refuses (`MISSING_COORDINATE`), so this type
   * requires them as a group rather than three independent optionals.
   */
  near?: { lat: number; lng: number; radiusKm: number } | null;
  signal?: AbortSignal;
};

export type ListingsResult = {
  listings: Listing[];
  /** What the server said it sent, before any device-side filtering. */
  count: number;
  /** Echoed back only on a radius search — the radius the server actually applied. */
  radiusKm?: number;
};

/**
 * Every category this app is willing to show, as the server wants them.
 *
 * Derived from `BACKEND_CATEGORIES` rather than typed out again, so a category
 * added to the app's own list is asked for here automatically — and one that
 * is NOT in the app's list is, correctly, never asked for at all.
 */
const STAY_CATEGORY_PARAM = Object.values(BACKEND_CATEGORIES).flat().join(',');

export async function fetchListings(query: ListingQuery = {}): Promise<ListingsResult> {
  const {
    category, city, locality, maxPrice, search, near, signal,
  } = query;

  /*
   * A category the collection cannot hold is asked for as itself.
   *
   * COLIVE has no counterpart in the schema's enum, so `BACKEND_CATEGORIES`
   * maps it to an empty list. Sending nothing would fetch everything and show
   * a Co-live tab full of PGs — the opposite of what was asked for. Sending
   * the app's own name matches no row and the tab is honestly empty.
   *
   * ## And why "no category" is no longer "no filter"
   *
   * It used to be: an unset category sent nothing and the server returned the
   * lot, which was harmless while every row in the collection was a place to
   * live. It is not any more. The onboarding panel can now file a shop, an
   * office or a godown under COMMERCIAL, and this is a STAY app — a warehouse
   * has no rent per bed, no sharing, no gender rule and nothing this feed's
   * cards know how to draw.
   *
   * So an unset category asks for the four stay categories by name rather than
   * for everything. The filter is stated positively on purpose: a future fifth
   * non-stay category is then excluded by default, instead of appearing in a
   * student's feed until somebody remembers to add it to an exclusion list.
   */
  const backendCategories = category ? BACKEND_CATEGORIES[category] : undefined;
  const categoryParam = category
    ? (backendCategories?.length ? backendCategories.join(',') : category)
    : STAY_CATEGORY_PARAM;

  const envelope = await api.get<ApiEnvelope<BackendListing[]>>(endpoints.listings, {
    query: {
      category: categoryParam,
      city: city ?? undefined,
      locality: locality ?? undefined,
      maxPrice: maxPrice ?? undefined,
      search: search?.trim() || undefined,
      lat: near?.lat ?? undefined,
      lng: near?.lng ?? undefined,
      radiusKm: near?.radiusKm ?? undefined,
    },
    signal,
  });

  const data = unwrap(envelope);

  return {
    listings: toListings(Array.isArray(data) ? data : []),
    count: envelope.count ?? (Array.isArray(data) ? data.length : 0),
    radiusKm: envelope.radiusKm,
  };
}

/** One guest's review, with the owner's answer if they gave one. */
export type ListingReview = {
  id: string;
  author: string;
  rating: number;
  comment: string;
  /** `YYYY-MM-DD`, as the review was dated. */
  date: string;
  reply: { text: string; at: string | null } | null;
};

export type ListingReviews = {
  /** Null when nobody has reviewed the place. Never invented. */
  averageRating: number | null;
  count: number;
  reviews: ListingReview[];
};

/**
 * What guests said about a listing.
 *
 * Reviews are written from a completed booking and the owner may answer each
 * one; both halves come back here. The owner's reply used to live only in
 * their own app's memory — the student it was written for never saw it.
 */
export async function fetchListingReviews(id: string, signal?: AbortSignal): Promise<ListingReviews> {
  const res = await api.get<ApiEnvelope<ListingReview[]> & { averageRating?: number | null; count?: number }>(
    endpoints.listingReviews(id),
    { signal },
  );
  const reviews = unwrap(res) || [];
  return {
    averageRating: typeof res.averageRating === 'number' ? res.averageRating : null,
    count: typeof res.count === 'number' ? res.count : reviews.length,
    reviews,
  };
}

export async function fetchListing(id: string, signal?: AbortSignal): Promise<Listing> {
  const envelope = await api.get<ApiEnvelope<BackendListing>>(endpoints.listing(id), { signal });
  return toListing(unwrap(envelope));
}

/**
 * Which places and categories actually have something in them.
 *
 * Read by the two entry screens before the feed exists. Returned raw — the
 * shapes are already the ones those screens want, and `places.adapter.ts`
 * does the last step for the locality list.
 */
export async function fetchListingMeta(signal?: AbortSignal): Promise<BackendListingMeta> {
  const envelope = await api.get<ApiEnvelope<BackendListingMeta>>(endpoints.listingMeta, { signal });
  return unwrap(envelope);
}

/**
 * Count one tap on a property card — shown to the owner in Stay Partner and
 * to admins in the console as the property's click total.
 *
 * Fire-and-forget: never awaited by the caller, never throws, never retried.
 * Opening the listing must not wait on a counter, and a count lost to a bad
 * signal is not worth an error on screen. Guests count too, so no token is
 * needed; the server ignores ids it does not recognise.
 */
export function recordListingClick(id: string): void {
  if (!id) return;
  api.post(endpoints.listingClick(id), undefined, { retries: 0 }).catch(() => {});
}
