import { useQuery } from '@tanstack/react-query';

import { ApiError } from '@/services/api/client';
import { fetchAddresses, type SavedAddress } from '@/services/api/addresses.api';
import { queryKeys } from './keys';

/**
 * The address book, cached.
 *
 * `addresses/index.tsx` reads the book with a plain `fetchAddresses` on focus
 * because it owns the screen and mutates it. This hook exists for the readers
 * that only want to COUNT them — the profile row that says how many are saved
 * — and it is a query rather than a second fetch so the two cannot disagree
 * about the number, and so opening Profile twice is one request.
 */
export function useAddresses(enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.addresses,
    queryFn: () => fetchAddresses(),
    enabled,
    /* The book changes only when this person edits it, and the screen that
       edits it invalidates this key. A minute is plenty. */
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: (count, error) => !(error instanceof ApiError && error.status > 0) && count < 1,
  });

  const addresses: SavedAddress[] = query.data ?? [];

  return {
    ...query,
    addresses,
    count: addresses.length,
    error: query.error as ApiError | null,
  };
}
