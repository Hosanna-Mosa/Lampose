import { useQuery } from '@tanstack/react-query';

import { fetchHealth } from '@/services/api/health.api';
import { ApiError } from '@/services/api/client';
import { queryKeys } from './keys';

/**
 * Whether the backend is up, and whether it can see the database.
 *
 * Used by the dev banner and by the empty-feed screens, because an empty feed
 * has three completely different causes that look identical:
 *
 *   the API is unreachable            wrong host, no signal, server down
 *   the API is up, Mongo is not       every data route answers 503
 *   both are fine, nothing matched    the filters are too narrow
 *
 * Only the third is the student's problem, and only this call can tell them
 * apart. It is not retried and not polled — one answer settles the question,
 * and a health check that runs on a timer is a health check nobody reads.
 */
export function useHealth(enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => fetchHealth(signal),
    enabled,
    staleTime: 30_000,
    retry: false,
  });

  const error = query.error as ApiError | null;

  return {
    ...query,
    health: query.data,
    error,
    /** Nothing answered at all. */
    unreachable: Boolean(error?.isNetwork),
    /** The process answered, but it is not connected to Mongo. */
    databaseDown: query.data ? query.data.database?.connected === false : false,
  };
}
