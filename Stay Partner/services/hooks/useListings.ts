import { useQuery } from '@tanstack/react-query';

import { ApiError } from '@/services/api/client';
import { API_BASE_URL_CONFIGURED } from '@/services/api/config';
import {
  fetchListing,
  fetchListings,
  type ListingsQuery,
} from '@/services/api/listings.api';
import { queryKeys } from './keys';

/**
 * The public catalogue.
 *
 * Unscoped — this is every listing, not the signed-in owner's, because there
 * is no signed-in owner. See `listings.api.ts` for why that must not be papered
 * over with a client-side filter.
 */
export function useListings(query: ListingsQuery = {}, enabled = true) {
  const result = useQuery({
    queryKey: queryKeys.listingList(query),
    queryFn: ({ signal }) => fetchListings(query, signal),
    enabled: enabled && API_BASE_URL_CONFIGURED,
    staleTime: 60_000,
    /* A rejection the server authored is final — a 404 does not become a 200
       by asking again. Only the network is worth a second try, and the client
       already retries GETs twice at the transport layer. */
    retry: (count, error) => !(error instanceof ApiError && error.status > 0) && count < 1,
  });

  return {
    ...result,
    listings: result.data?.listings ?? [],
    count: result.data?.count ?? 0,
    error: result.error as ApiError | null,
  };
}

export function useListing(id: string | undefined) {
  const result = useQuery({
    queryKey: queryKeys.listing(id ?? ''),
    queryFn: ({ signal }) => fetchListing(id as string, signal),
    enabled: Boolean(id) && API_BASE_URL_CONFIGURED,
    staleTime: 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status > 0) && count < 1,
  });

  return {
    ...result,
    listing: result.data ?? null,
    error: result.error as ApiError | null,
  };
}
