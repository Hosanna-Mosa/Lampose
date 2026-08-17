import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';
import type { BackendListing } from './types';

/**
 * The public listings feed.
 *
 * ## What this is not
 *
 * It is not "this owner's properties". The endpoint is the same public,
 * unscoped feed lampose.com reads, and there is no owner-scoped variant to
 * call because there is no owner session to scope it by — see the note in
 * `endpoints.ts`.
 *
 * That matters for how it may be used. Filtering the response client-side by
 * owner mobile would put every other owner's properties, rents and phone
 * numbers on the device first and hide them second, which is not privacy, it
 * is a longer path to the same leak. Scoping has to happen on the server, and
 * that needs the partner identity system that does not exist yet.
 *
 * So this exists to prove the transport works and to back read-only views of
 * the catalogue. Anything owner-specific waits for the endpoint.
 */

export type ListingsQuery = {
  /** `PG_HOSTEL`, `BACHELOR`, … Passed through; the server owns the vocabulary. */
  category?: string | null;
  city?: string | null;
  search?: string | null;
  maxPrice?: number | null;
};

export type ListingsResult = {
  listings: BackendListing[];
  /** The server's own count, which is not always the array length once it
      starts paginating. Read from the envelope rather than derived. */
  count: number;
};

export async function fetchListings(
  query: ListingsQuery = {},
  signal?: AbortSignal,
): Promise<ListingsResult> {
  const envelope = await api.get<ApiEnvelope<BackendListing[]>>(endpoints.listings, {
    signal,
    /* Empty, null and undefined values are dropped by the client rather than
       sent as blank query parameters, so an unset filter is genuinely absent
       from the URL instead of arriving as `category=`. */
    query: {
      category: query.category ?? undefined,
      city: query.city ?? undefined,
      search: query.search ?? undefined,
      maxPrice: query.maxPrice ?? undefined,
    },
  });

  const data = unwrap(envelope);
  const listings = Array.isArray(data) ? data : [];

  return {
    listings,
    count: typeof envelope.count === 'number' ? envelope.count : listings.length,
  };
}

export async function fetchListing(
  id: string,
  signal?: AbortSignal,
): Promise<BackendListing> {
  const envelope = await api.get<ApiEnvelope<BackendListing>>(endpoints.listing(id), { signal });
  return unwrap(envelope);
}
