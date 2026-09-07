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
import { onStayRequestEvent } from '@/services/realtimeSocket';
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

/*
 * How often the list checks when NOTHING is waiting.
 *
 * It used to stop entirely, on the reasoning that an owner looking at last
 * month's history has nothing to refresh. That was right while this hook was
 * only ever mounted by a screen somebody was already reading — and wrong the
 * moment `IncomingRequestAlert` mounted it at the root, because "nothing is
 * pending" is precisely the state a NEW request has to be discovered from. A
 * hook that stops polling when the inbox is empty cannot notice the inbox
 * filling up, and the alert would only ever fire for a request that was
 * already there when the app was opened.
 *
 * Push covers this on a build that has it. This is the floor for the ones that
 * do not — Expo Go, a refused permission, a simulator, an owner who has not
 * registered a handset yet — which is the same gap the alert tone exists for.
 *
 * Five seconds, not twenty-five. The first version of this reasoned that
 * nothing is on a clock yet so the idle rate could be lazy — but the clock
 * starts the moment the request lands, and the owner is not told until the
 * next poll. Twenty-five seconds is fourteen per cent of their window gone
 * before they know anything, and it read as "the popup only appears when I
 * switch tabs" (a screen mounting refetched immediately; sitting still did
 * not).
 *
 * The cost is one request every five seconds per signed-in app, and only
 * while the app is FOREGROUNDED — `services/queryFocus.ts` wires AppState to
 * react-query's focus manager, so this stops entirely in a pocket and fires
 * once on the way back.
 */
const IDLE_POLL_MS = 5000;

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
  const queryClient = useQueryClient();

  /*
   * The live half. A socket event does not carry enough to patch the cache
   * directly — `payloadFor` on the backend is deliberately thin, sized for a
   * push notification, not a full row — so this just pulls the four-second
   * poll's NEXT tick forward to now rather than trying to merge a partial
   * shape into it. `IncomingRequestAlert` rings off `groups.pending`
   * reactively, so a fresher list is all a new request needs to be noticed
   * instantly instead of up to four seconds late.
   */
  useEffect(() => {
    if (!enabled) return undefined;
    return onStayRequestEvent(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requests });
    });
  }, [enabled, queryClient]);

  const query = useQuery({
    queryKey: queryKeys.requests,
    queryFn: ({ signal }) => fetchMyRequests(signal),
    enabled,
    /*
     * Two rates, never off. Four seconds is for a deadline that is actually
     * running; an owner sitting on last month's history does not need that and
     * polling it every four seconds forever is what the second rate avoids.
     */
    refetchInterval: (q) => {
      const anyPending = (q.state.data?.requests ?? []).some((r) => r.status === 'pending_owner');
      /* Four seconds while a deadline is running, a slow heartbeat otherwise —
         never off. See IDLE_POLL_MS. */
      return anyPending ? POLL_MS : IDLE_POLL_MS;
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
