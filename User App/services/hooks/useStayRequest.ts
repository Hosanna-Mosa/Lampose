import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api/client';
import {
  createStayRequest,
  fetchStayRequest,
  withdrawStayRequest,
  type CreateStayRequestInput,
} from '@/services/api/stayRequests.api';
import type { BackendStayRequest, StayRequestStatus } from '@/services/api/types';
import { queryKeys } from './keys';

/**
 * One stay request, as one state machine.
 *
 * ## The server owns the clock, and this hook never forgets it
 *
 * Three rules, and every awkward part of this file exists to keep one of them:
 *
 *   1. `expiresAt` comes from the server and is never computed here.
 *   2. The countdown is rendered from it, corrected by a clock OFFSET — the
 *      device's `Date.now()` is used only to measure elapsed time, never to
 *      say what time it is.
 *   3. Reaching zero does NOT mean expired. It means "ask the server". If an
 *      owner tapped Accept at 2:59.8 and won, the request is confirmed, and a
 *      screen that had decided for itself would show the wrong answer to
 *      somebody who actually got the bed.
 *
 * ## Why the id is stored and the status is not
 *
 * The id is written to AsyncStorage per listing, so a student who closes the
 * app mid-wait comes back to their request rather than to a fresh form. The
 * STATUS is never stored: it is refetched on mount and on every return to the
 * foreground, because the one thing that must never happen is the app
 * confidently rendering a wait that ended twenty minutes ago.
 */

export type StayPhase =
  | 'idle'
  | 'sending'
  | 'waiting'
  | 'confirmed'
  | 'declined'
  | 'expired'
  | 'cancelled'
  | 'failed';

const PHASE_FOR: Record<StayRequestStatus, StayPhase> = {
  pending_owner: 'waiting',
  confirmed: 'confirmed',
  declined: 'declined',
  expired: 'expired',
  cancelled: 'cancelled',
};

const TERMINAL: StayPhase[] = ['confirmed', 'declined', 'expired', 'cancelled'];
export const isTerminalPhase = (phase: StayPhase) => TERMINAL.includes(phase);

/** Per listing, so a student can have one request open on each of several. */
const storageKey = (listingId: string) => `@lampose/stay-request:${listingId}`;

/**
 * How often the waiting screen asks.
 *
 * Three seconds flat, for the whole window. The website's equivalent backed
 * off from four seconds to twenty because it was watching a twenty-four-hour
 * deadline; this one is watching three minutes, so the entire wait is about
 * sixty polls and backing off would only delay the one answer the screen
 * exists to show. Push arrives too, and whichever is first wins.
 */
const POLL_MS = 3000;

export type UseStayRequestResult = {
  phase: StayPhase;
  request: BackendStayRequest | null;
  /** True until the stored id for this listing has been read back. */
  isHydrating: boolean;
  isBusy: boolean;
  error: ApiError | null;

  /** Whole seconds left, from the server's deadline. Zero once it has passed. */
  secondsRemaining: number;
  /** `2:47`. Empty when there is no deadline to show. */
  countdown: string;

  /** Whether Withdraw should be offered at all. */
  canWithdraw: boolean;

  send: (input: Omit<CreateStayRequestInput, 'signal'>) => Promise<boolean>;
  withdraw: () => Promise<boolean>;
  /** Re-read from the server. For a screen that has just changed something. */
  refresh: () => Promise<void>;
  /** Forget it locally and start over. Does not touch the server. */
  reset: () => void;
};

export function useStayRequest(listingId?: string | null): UseStayRequestResult {
  const queryClient = useQueryClient();

  const [requestId, setRequestId] = useState<string | null>(null);
  const [local, setLocal] = useState<BackendStayRequest | null>(null);
  const [phase, setPhase] = useState<StayPhase>('idle');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [isHydrating, setIsHydrating] = useState(Boolean(listingId));

  /*
   * How far this device's clock is from the server's, in milliseconds.
   *
   * A ref rather than state: it changes on every poll by a millisecond or two
   * and re-rendering for that would be pointless. Measured once per response
   * and applied to every tick.
   */
  const clockOffset = useRef(0);

  const applyOffset = useCallback((doc: BackendStayRequest) => {
    if (!doc.serverNow) return;
    const server = Date.parse(doc.serverNow);
    if (Number.isFinite(server)) clockOffset.current = server - Date.now();
  }, []);

  /* ── Hydrate ─────────────────────────────────────────────────────────
     Only the id is stored. A different listing is a different question, so
     the previous one's answer is dropped rather than carried across. */
  useEffect(() => {
    let active = true;
    if (!listingId) { setIsHydrating(false); return () => { active = false; }; }

    setIsHydrating(true);
    setRequestId(null);
    setLocal(null);
    setPhase('idle');

    AsyncStorage.getItem(storageKey(listingId))
      .then((stored) => {
        if (!active) return;
        if (stored) {
          setRequestId(stored);
          /*
           * Still hydrating.
           *
           * Reading the ID is not the same as knowing the request. Clearing
           * the flag here left a window where `phase` was `idle` and
           * `isHydrating` was false — and the confirmation screen's auto-send
           * fires on exactly that combination. It sent a SECOND request for a
           * bed the first one had already taken, and the student was told
           * their own acceptance had filled the room.
           *
           * The flag is cleared by the effect below, once the request has
           * actually arrived or been found to be gone.
           */
          return;
        }
        setIsHydrating(false);
      })
      .catch(() => {
        /* Storage disabled or corrupt. Not fatal: the screen offers a fresh
           request, and the server refuses a duplicate while one is live. */
        if (active) setIsHydrating(false);
      });

    return () => { active = false; };
  }, [listingId]);

  /* ── The live status ─────────────────────────────────────────────────
     Polled while waiting; fetched once and left alone after that, because a
     terminal answer cannot change. */
  const poll = useQuery({
    queryKey: queryKeys.stayRequest(requestId ?? ''),
    queryFn: ({ signal }) => fetchStayRequest(requestId as string, signal),
    enabled: Boolean(requestId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && status !== 'pending_owner' ? false : POLL_MS;
    },
    /* Coming back to the app refetches immediately. This is the moment a
       stale "waiting for Ramesh" looks worst and the moment an answer is most
       likely to have arrived. */
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    /* A dropped poll is not a failed request. The screen keeps the last
       status it knew and the next tick tries again — showing an error because
       one poll missed would tell a student their request had failed when the
       owner may already have said yes. */
    retry: false,
    gcTime: 0,
  });

  const request = poll.data ?? local;

  useEffect(() => {
    if (!poll.data) return;
    applyOffset(poll.data);
    setLocal(poll.data);
    setPhase(PHASE_FOR[poll.data.status] ?? 'idle');
    /* The request is here, so hydration is genuinely over — see the note in
       the effect above. */
    setIsHydrating(false);
  }, [poll.data, applyOffset]);

  /*
   * A request the server no longer has.
   *
   * An id kept on a device long enough for the row to be gone. Forgotten
   * rather than polled forever.
   */
  useEffect(() => {
    const failure = poll.error;
    if (!(failure instanceof ApiError) || !listingId) return;

    if (failure.status === 404) {
      AsyncStorage.removeItem(storageKey(listingId)).catch(() => {});
      setRequestId(null);
      setLocal(null);
      setPhase('idle');
    }
    /* Hydration is over either way — the request is gone, or it could not be
       fetched. Leaving the flag set would hold the screen on a spinner for a
       student who is offline. */
    setIsHydrating(false);
  }, [poll.error, listingId]);

  /* Returning to the app refetches even if the interval had stopped. */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !requestId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.stayRequest(requestId) });
    });
    return () => subscription.remove();
  }, [requestId, queryClient]);

  /* ── The countdown ───────────────────────────────────────────────────
     Recomputed on a one-second tick from `expiresAt` and the offset — never
     decremented from a previous value, which would drift and would freeze
     while the app was backgrounded. */
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    const deadline = request?.expiresAt ? Date.parse(request.expiresAt) : NaN;

    if (!Number.isFinite(deadline) || request?.status !== 'pending_owner') {
      setSecondsRemaining(0);
      return;
    }

    const compute = () => {
      const serverNow = Date.now() + clockOffset.current;
      setSecondsRemaining(Math.max(0, Math.ceil((deadline - serverNow) / 1000)));
    };

    compute();
    const timer = setInterval(compute, 1000);
    return () => clearInterval(timer);
  }, [request?.expiresAt, request?.status]);

  /*
   * Zero on the clock is a question, not an answer.
   *
   * The moment the local countdown runs out, the server is asked once more.
   * It may say `confirmed` — an owner who tapped at 2:59.8 and won — and a
   * screen that had marked itself expired would be showing the wrong thing to
   * a student who actually got the bed.
   */
  useEffect(() => {
    if (secondsRemaining > 0) return;
    if (request?.status !== 'pending_owner' || !requestId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.stayRequest(requestId) });
  }, [secondsRemaining, request?.status, requestId, queryClient]);

  /* ── Actions ─────────────────────────────────────────────────────────── */

  const send = useCallback(async (input: Omit<CreateStayRequestInput, 'signal'>) => {
    setError(null);
    setIsBusy(true);
    setPhase('sending');
    try {
      const created = await createStayRequest(input);
      applyOffset(created);
      setLocal(created);
      setRequestId(created.id);
      setPhase(PHASE_FOR[created.status] ?? 'waiting');
      /* Written after the server confirmed it, never before — an id stored
         for a request that failed to create is an id that 404s forever. */
      if (listingId) AsyncStorage.setItem(storageKey(listingId), created.id).catch(() => {});
      return true;
    } catch (caught) {
      setError(caught as ApiError);
      setPhase('failed');
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [listingId, applyOffset]);

  const withdraw = useCallback(async () => {
    if (!requestId) return false;
    setError(null);
    setIsBusy(true);
    try {
      const cancelled = await withdrawStayRequest(requestId);
      applyOffset(cancelled);
      setLocal(cancelled);
      setPhase('cancelled');
      queryClient.setQueryData(queryKeys.stayRequest(requestId), cancelled);
      return true;
    } catch (caught) {
      const failure = caught as ApiError;
      setError(failure);
      /* Losing this race is a GOOD outcome badly timed: the owner accepted
         while the cancel was in flight. Refetch so the screen shows the
         acceptance rather than an error about it. */
      queryClient.invalidateQueries({ queryKey: queryKeys.stayRequest(requestId) });
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [requestId, queryClient, applyOffset]);

  const refresh = useCallback(async () => {
    if (!requestId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.stayRequest(requestId) });
  }, [requestId, queryClient]);

  const reset = useCallback(() => {
    if (listingId) AsyncStorage.removeItem(storageKey(listingId)).catch(() => {});
    setRequestId(null);
    setLocal(null);
    setPhase('idle');
    setError(null);
    setSecondsRemaining(0);
  }, [listingId]);

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  return {
    phase,
    request: request ?? null,
    isHydrating: isHydrating || (Boolean(requestId) && !request && poll.isPending),
    isBusy,
    error,
    secondsRemaining,
    countdown: request?.expiresAt ? `${minutes}:${String(seconds).padStart(2, '0')}` : '',
    /* Offered only while the request is genuinely live. A button that can
       only fail is worse than no button. */
    canWithdraw: phase === 'waiting' && !isBusy,
    send,
    withdraw,
    refresh,
    reset,
  };
}
