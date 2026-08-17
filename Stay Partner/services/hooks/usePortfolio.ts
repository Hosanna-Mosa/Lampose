import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api/client';
import { API_BASE_URL_CONFIGURED } from '@/services/api/config';
import {
  fetchMyProperties,
  fetchMyRequest,
  fetchMyRequests,
  fetchSummary,
  markRequestsRead,
} from '@/services/api/portfolio.api';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from './keys';

/**
 * What this partner owns, and who has asked about it.
 *
 * Every query here is gated on an actual session. Firing them while signed out
 * produces a wave of 401s on boot, and the client reports a rejected token to
 * `AuthContext` — so an ungated query is not merely wasteful, it can bounce a
 * partner back to the login screen for no reason.
 */

function useReady() {
  const { status } = useAuth();
  return API_BASE_URL_CONFIGURED && status === 'signedIn';
}

/** A rejection the server authored is final. Only the network is worth a retry. */
const retryNetworkOnly = (count: number, error: unknown) =>
  !(error instanceof ApiError && error.status > 0) && count < 1;

/**
 * The dashboard's counts.
 *
 * `linkedByPhone` is the field worth surfacing: three of the eight properties
 * in the catalogue have no owner mobile recorded at all, so "0 properties" is a
 * real and common answer that has nothing to do with the app being broken. A
 * dashboard that says WHICH number it matched on turns a mystery into a
 * support call somebody can actually make.
 */
export function useSummary() {
  const enabled = useReady();

  const query = useQuery({
    queryKey: queryKeys.summary,
    queryFn: ({ signal }) => fetchSummary(signal),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: retryNetworkOnly,
  });

  return {
    ...query,
    summary: query.data ?? null,
    error: query.error as ApiError | null,
  };
}

export function useMyProperties() {
  const enabled = useReady();

  const query = useQuery({
    queryKey: queryKeys.myProperties,
    queryFn: ({ signal }) => fetchMyProperties(signal),
    enabled,
    staleTime: 60_000,
    retry: retryNetworkOnly,
  });

  return {
    ...query,
    properties: query.data ?? [],
    error: query.error as ApiError | null,
  };
}

/**
 * Visit requests customers have sent to this partner's properties.
 *
 * Refreshed on focus and on a short stale time: the whole point of this screen
 * is a request that arrived while the owner was doing something else, and an
 * owner has 24 hours to answer before it expires by itself.
 */
export function useMyRequests() {
  const enabled = useReady();

  const query = useQuery({
    queryKey: queryKeys.requests,
    queryFn: ({ signal }) => fetchMyRequests(signal),
    enabled,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    retry: retryNetworkOnly,
  });

  return {
    ...query,
    requests: query.data?.requests ?? [],
    unread: query.data?.unread ?? 0,
    error: query.error as ApiError | null,
  };
}

export function useMyRequest(id: string | undefined) {
  const enabled = useReady();

  const query = useQuery({
    queryKey: queryKeys.request(id ?? ''),
    queryFn: ({ signal }) => fetchMyRequest(id as string, signal),
    enabled: enabled && Boolean(id),
    staleTime: 20_000,
    retry: retryNetworkOnly,
  });

  return {
    ...query,
    request: query.data ?? null,
    error: query.error as ApiError | null,
  };
}

/**
 * Clears the badge on the requests tab, once the list has actually loaded.
 *
 * Not on mount: marking something read before it arrived is a claim about a
 * screen nobody has seen. Fire-and-forget on failure — a watermark that did not
 * move leaves the badge up, which is harmless and self-correcting, and putting
 * an error banner over a list that loaded fine would not be.
 */
export function useMarkRequestsRead(unread: number, loaded: boolean) {
  const client = useQueryClient();
  const enabled = useReady();

  const mutation = useMutation({
    mutationFn: () => markRequestsRead(),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.requests }),
  });

  const { mutate } = mutation;

  useEffect(() => {
    if (!enabled || !loaded || unread <= 0) return;
    mutate();
  }, [enabled, loaded, unread, mutate]);
}
