import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api/client';
import { addSaved, fetchSaved, removeSaved, type SavedListing } from '@/services/api/saved.api';
import { queryKeys } from './keys';

/**
 * The shortlist, and the bookmark on every card.
 *
 * One query behind both, so a listing saved from the feed is already saved
 * when the Saved tab is opened, without a refetch and without the two
 * disagreeing.
 *
 * ## The toggle is optimistic, and rolls back
 *
 * A bookmark that waits for a round trip before filling in feels broken on a
 * train — the tap is the whole interaction, and 400ms of nothing reads as a
 * dropped press, which produces a second tap and an unsave. So the cache is
 * written first and the request follows. If it fails, the cache is put back
 * exactly as it was and the bookmark visibly returns to where it started,
 * which is the honest outcome: the save did not happen.
 */
export function useSaved(enabled = true) {
  const client = useQueryClient();
  const [optimisticSaved, setOptimisticSaved] = useState<Record<string, boolean>>({});

  const query = useQuery({
    queryKey: queryKeys.saved,
    queryFn: ({ signal }) => fetchSaved(signal),
    enabled,
    staleTime: 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status > 0) && count < 1,
  });

  const saved = query.data ?? [];
  const savedIds = useMemo(() => new Set(saved.map((entry) => entry.listing.id)), [saved]);

  const mutation = useMutation({
    mutationFn: ({ listingId, next }: { listingId: string; next: boolean }) =>
      (next ? addSaved(listingId) : removeSaved(listingId)),

    onMutate: async ({ listingId, next }) => {
      /* In-flight fetches would land after the optimistic write and undo it. */
      await client.cancelQueries({ queryKey: queryKeys.saved });
      const previous = client.getQueryData<SavedListing[]>(queryKeys.saved);

      if (!next) {
        client.setQueryData<SavedListing[]>(
          queryKeys.saved,
          (current) => (current ?? []).filter((entry) => entry.listing.id !== listingId),
        );
      }

      return { previous };
    },

    onError: (_error, variables, context) => {
      if (context?.previous) client.setQueryData(queryKeys.saved, context.previous);
      setOptimisticSaved((prev) => {
        const copy = { ...prev };
        delete copy[variables.listingId];
        return copy;
      });
    },

    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.saved }),
  });

  /**
   * Whether a listing is on the shortlist, counting local optimistic state
   * and in-flight mutations so the bookmark fills immediately on tap.
   */
  const isSaved = useCallback(
    (listingId: string) => {
      if (typeof optimisticSaved[listingId] === 'boolean') {
        return optimisticSaved[listingId];
      }
      return savedIds.has(listingId);
    },
    [optimisticSaved, savedIds],
  );

  const toggleSaved = useCallback(
    (listingId: string) => {
      const next = !isSaved(listingId);
      setOptimisticSaved((prev) => ({ ...prev, [listingId]: next }));
      mutation.mutate({ listingId, next });
    },
    [isSaved, mutation],
  );

  return {
    ...query,
    saved,
    isSaved,
    toggleSaved,
    error: query.error as ApiError | null,
  };
}
