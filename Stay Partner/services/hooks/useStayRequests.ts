import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api/client';
import { API_BASE_URL_CONFIGURED } from '@/services/api/config';
import {
  acceptRequest,
  declineRequest,
  fetchMyRequest,
  fetchMyRequests,
} from '@/services/api/portfolio.api';
import type { BackendPartnerRequest } from '@/services/api/types';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from './keys';

/**
 * The requests waiting on this owner, and the two taps that answer them.
 *
 * ## Three minutes is the whole design constraint
 *
 * A student's request lives for minutes, not days. That changes what this hook
 * has to do compared with every other list in the app:
 *
 *   · it polls, because an answer arriving thirty seconds late is an answer
 *     that arrived after the deadline;
 *   · it renders a countdown from the SERVER's `expiresAt`, corrected for
 *     device clock skew, never from a number computed here;
 *   · it stops offering the buttons the moment a request is no longer
 *     actionable, which the server decides and sends as one flag.
 *
 * ## Why the countdown is recomputed rather than decremented
 *
 * A ticking counter that subtracts one per second drifts, and freezes
 * entirely while the app is backgrounded — so an owner who glanced away for a
 * minute would come back to a timer claiming they still had two. Recomputing
 * from the deadline on every tick costs nothing and cannot drift.
 */

const POLL_MS = 4000;

/** How far this device's clock is from the server's. */
function useClockOffset() {
  const offset = useRef(0);
  const apply = useCallback((serverNow?: string | null) => {
    if (!serverNow) return;
    const server = Date.parse(serverNow);
    if (Number.isFinite(server)) offset.current = server - Date.now();
  }, []);
  return { offset, apply };
}

/** Seconds left on a request, from the server's deadline. */
export function secondsLeft(request: BackendPartnerRequest | null | undefined, offsetMs = 0): number {
  if (!request?.expiresAt) return 0;
  if (request.status !== 'pending_owner') return 0;
  const deadline = Date.parse(request.expiresAt);
  if (!Number.isFinite(deadline)) return 0;
  return Math.max(0, Math.ceil((deadline - (Date.now() + offsetMs)) / 1000));
}

/** `2:47`. */
export const formatCountdown = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function useReady() {
  const { status } = useAuth();
  return API_BASE_URL_CONFIGURED && status === 'signedIn';
}

/** A rejection the server authored is final. Only the network is worth a retry. */
const retryNetworkOnly = (count: number, error: unknown) =>
  !(error instanceof ApiError && error.status > 0) && count < 1;

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

export type RequestGroups = {
  pending: BackendPartnerRequest[];
  answered: BackendPartnerRequest[];
};

export function useStayRequests() {
  const enabled = useReady();
  const { offset, apply } = useClockOffset();

  const query = useQuery({
    queryKey: queryKeys.requests,
    queryFn: ({ signal }) => fetchMyRequests(signal),
    enabled,
    /*
     * Polled only while something is actually waiting. An owner sitting on a
     * history list of last month's requests has nothing to refresh, and
     * polling it would be a query every four seconds forever.
     */
    refetchInterval: (q) => {
      const anyPending = (q.state.data?.requests ?? []).some((r) => r.status === 'pending_owner');
      return anyPending ? POLL_MS : false;
    },
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    /* A dropped poll is not an empty inbox. The list keeps what it had. */
    retry: retryNetworkOnly,
    staleTime: 0,
  });

  useEffect(() => {
    if (query.data?.requests?.length) apply(query.data.requests[0].serverNow);
  }, [query.data, apply]);

  const requests = query.data?.requests ?? [];

  /*
   * Pending first, and separately.
   *
   * Not a sort — a partition. A pending request has a deadline and two
   * buttons; everything else is history with neither, and mixing them in one
   * list is how an owner scrolls past the only row that needed them.
   */
  const groups: RequestGroups = {
    pending: requests.filter((r) => r.status === 'pending_owner'),
    answered: requests.filter((r) => r.status !== 'pending_owner'),
  };

  return {
    ...query,
    requests,
    groups,
    unread: query.data?.unread ?? 0,
    clockOffset: offset,
    error: query.error as ApiError | null,
  };
}

/* ------------------------------------------------------------------ *
 * One request, with a live clock
 * ------------------------------------------------------------------ */

export function useStayRequest(id?: string | null) {
  const enabled = useReady() && Boolean(id);
  const { offset, apply } = useClockOffset();

  const query = useQuery({
    queryKey: queryKeys.request(id ?? ''),
    queryFn: ({ signal }) => fetchMyRequest(id as string, signal),
    enabled,
    refetchInterval: (q) => (q.state.data?.status === 'pending_owner' ? POLL_MS : false),
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    retry: retryNetworkOnly,
    staleTime: 0,
  });

  const request = query.data ?? null;

  useEffect(() => { apply(request?.serverNow); }, [request?.serverNow, apply]);

  /* Recomputed every second from the deadline — see the header. */
  const [seconds, setSeconds] = useState(() => secondsLeft(request, offset.current));

  useEffect(() => {
    const compute = () => setSeconds(secondsLeft(request, offset.current));
    compute();
    if (request?.status !== 'pending_owner') return undefined;
    const timer = setInterval(compute, 1000);
    return () => clearInterval(timer);
  }, [request, offset]);

  const queryClient = useQueryClient();

  /*
   * Zero on the clock is a question, not an answer.
   *
   * The server decides when a request has expired, and it may be about to say
   * the student's request was accepted at 2:59.8 by this very owner. So
   * running out triggers one more fetch rather than a local verdict.
   */
  useEffect(() => {
    if (seconds > 0 || request?.status !== 'pending_owner' || !id) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.request(id) });
  }, [seconds, request?.status, id, queryClient]);

  return {
    ...query,
    request,
    secondsRemaining: seconds,
    countdown: formatCountdown(seconds),
    /* The server's flag, not four comparisons repeated per screen. */
    actionable: request?.actionable === true,
    error: query.error as ApiError | null,
  };
}

/* ------------------------------------------------------------------ *
 * Answering
 * ------------------------------------------------------------------ */

export function useAnswerRequest(id?: string | null) {
  const queryClient = useQueryClient();

  /* Both lists and the dashboard count change on either answer. */
  const settle = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.requests });
    queryClient.invalidateQueries({ queryKey: queryKeys.summary });
    if (id) queryClient.invalidateQueries({ queryKey: queryKeys.request(id) });
  };

  const accept = useMutation({
    mutationFn: () => acceptRequest(id as string),
    /* No retry. A retry is a second attempt to take a bed, and that has to be
       a person pressing again rather than a library deciding. */
    retry: false,
    onSettled: settle,
  });

  const decline = useMutation({
    mutationFn: (reason?: string | null) => declineRequest(id as string, reason ?? null),
    retry: false,
    onSettled: settle,
  });

  return {
    accept,
    decline,
    isBusy: accept.isPending || decline.isPending,
    /* Whichever failed last, as the server worded it. `ALREADY_ACCEPTED`,
       `REQUEST_EXPIRED`, `REQUEST_CANCELLED` and `INVENTORY_GONE` are four
       different things to tell an owner and the reason each is a separate
       code. */
    error: (accept.error ?? decline.error) as ApiError | null,
  };
}
