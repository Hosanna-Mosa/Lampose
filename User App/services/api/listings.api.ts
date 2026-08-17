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
  signal?: AbortSignal;
};

export type ListingsResult = {
  listings: Listing[];
  /** What the server said it sent, before any device-side filtering. */
  count: number;
};

export async function fetchListings(query: ListingQuery = {}): Promise<ListingsResult> {
  const {
    category, city, locality, maxPrice, search, signal,
  } = query;

  /*
   * A category the collection cannot hold is asked for as itself.
   *
   * COLIVE has no counterpart in the schema's enum, so `BACKEND_CATEGORIES`
   * maps it to an empty list. Sending nothing would fetch everything and show
   * a Co-live tab full of PGs — the opposite of what was asked for. Sending
   * the app's own name matches no row and the tab is honestly empty.
   */
  const backendCategories = category ? BACKEND_CATEGORIES[category] : undefined;
  const categoryParam = category
    ? (backendCategories?.length ? backendCategories.join(',') : category)
    : undefined;

  const envelope = await api.get<ApiEnvelope<BackendListing[]>>(endpoints.listings, {
    query: {
      category: categoryParam,
      city: city ?? undefined,
      locality: locality ?? undefined,
      maxPrice: maxPrice ?? undefined,
      search: search?.trim() || undefined,
    },
    signal,
  });

  const data = unwrap(envelope);

  return {
    listings: toListings(Array.isArray(data) ? data : []),
    count: envelope.count ?? (Array.isArray(data) ? data.length : 0),
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
