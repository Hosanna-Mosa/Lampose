import { useQuery } from '@tanstack/react-query';

import { ApiError } from '@/services/api/client';
import { API_BASE_URL, API_BASE_URL_CONFIGURED } from '@/services/api/config';
import { fetchHealth } from '@/services/api/health.api';
import { queryKeys } from './keys';

/**
 * Whether this app can reach its backend, and whether that backend can reach
 * its database.
 *
 * The three failures a screen cannot otherwise tell apart:
 *
 *   not configured   no `EXPO_PUBLIC_API_URL` in this build
 *   unreachable      wrong host, no signal, server down
 *   degraded         API answering, Mongo disconnected — v2 routes 503
 *
 * All three produce an empty screen and none of them is the app's fault, so
 * this is the first thing to check when the partner app "has no data".
 */
export function useHealth(enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => fetchHealth(signal),
    /* Pointless to ask when there is nowhere to ask. The hook still returns a
       usable shape below, with `configured: false` saying why. */
    enabled: enabled && API_BASE_URL_CONFIGURED,
    staleTime: 30_000,
    /* A health check exists to fail fast. Retrying one turns "the backend is
       down" into forty seconds of spinner. */
    retry: false,
  });

  const error = query.error as ApiError | null;

  return {
    ...query,
    configured: API_BASE_URL_CONFIGURED,
    baseUrl: API_BASE_URL,
    /** The API answered at all. */
    reachable: Boolean(query.data),
    /** It answered AND it has a database behind it. */
    databaseConnected: Boolean(query.data?.database?.connected),
    error,
  };
}
