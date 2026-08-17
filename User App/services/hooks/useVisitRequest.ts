import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';

import { ApiError } from '@/services/api/client';
import {
  createVisitRequest,
  pollVisitRequest,
  resendVisitOtp,
  verifyVisitRequest,
  type CreateVisitRequestInput,
} from '@/services/api/visits.api';
import type { BackendVisitRequest } from '@/services/api/types';
import { queryKeys } from './keys';

/**
 * The whole "request a visit" flow, as one state machine.
 *
 * The screen that drives this is the one where a student has committed —
 * their name and number are about to reach a property owner — so the
 * machinery is here rather than in the screen, where a re-render or a
 * navigation could drop it halfway.
 *
 * ## It is stored, not just held
 *
 * This used to live in React state alone, which the website's equivalent
 * never did (`Frontend/src/hooks/useVisitRequest.js` has kept it in
 * localStorage per listing from the start). The difference mattered more on
 * a phone than in a browser: the entire point of the flow is that somebody
 * waits, and waiting on a phone means backgrounding the app. State alone
 * meant closing it lost the request id, and reopening the listing offered the
 * button again — a second SMS to the student, and after verification a second
 * WhatsApp to the owner about the same bed.
 *
 * So it is written to AsyncStorage per listing, exactly as the site writes to
 * localStorage per listing, and terminal answers are kept too so a return
 * visit says what the owner said rather than starting over.
 *
 * ## The phases, and what each one means on the other end
 *
 *   idle          nothing sent.
 *   creating      the form is in flight.
 *   awaitingCode  an SMS is on its way to the STUDENT. The owner knows
 *                 nothing yet, and will not until a correct code comes back.
 *   verifying     the code is being checked, and if it is right the owner is
 *                 messaged on WhatsApp inside the same request.
 *   waitingOwner  the owner has been asked. This is the poll.
 *   confirmed     they replied AVAILABLE.
 *   declined      they said no.
 *   expired       24 hours passed with no answer.
 *   failed        the request never got off the ground — see `error`.
 *
 * ## Why `verifying` can fail without losing the request
 *
 * The verify call does two things: it checks the code and it messages the
 * owner. The second can fail on its own (`OWNER_NOTIFY_FAILED`), and when it
 * does the phone is already proven — so the machine stays on `awaitingCode`
 * with a `canRetryOwner` flag rather than throwing the request away. Calling
 * `verify()` again with no code at all is the correct retry, and the server
 * skips straight to the owner.
 */

export type VisitPhase =
  | 'idle'
  | 'creating'
  | 'awaitingCode'
  | 'verifying'
  | 'waitingOwner'
  | 'confirmed'
  | 'declined'
  | 'expired'
  | 'failed';

/** How the server's status maps onto a phase. */
const PHASE_FOR: Record<string, VisitPhase> = {
  otp_pending: 'awaitingCode',
  pending_owner: 'waitingOwner',
  confirmed: 'confirmed',
  declined: 'declined',
  expired: 'expired',
};

const TERMINAL: VisitPhase[] = ['confirmed', 'declined', 'expired'];

/** Per listing, matching the site's `lampose:visit:<id>` exactly in spirit. */
const storageKey = (listingId: string) => `@lampose/visit:${listingId}`;

/**
 * How often the waiting screen asks.
 *
 * Four seconds at first, because the answer usually arrives in the first
 * minute and a student is watching the screen for it, then backing off to
 * twenty — the endpoint is public, rate limited to sixty calls a minute per
 * address, and a phone left on this screen for an hour must not spend it.
 */
const POLL_FAST_MS = 4000;
const POLL_SLOW_MS = 20000;
const POLL_BACKOFF_AFTER_MS = 90_000;

/**
 * When to stop asking altogether.
 *
 * The owner has twenty-four hours; nobody watches a screen for that, and a
 * phone that keeps polling in the background is spending a battery on an
 * answer that will arrive as a push notification anyway. Fifteen minutes,
 * the same ceiling the website uses — and returning to the app restarts it,
 * because that is the moment a stale "waiting" looks worst.
 */
const GIVE_UP_MS = 15 * 60 * 1000;

export type UseVisitRequestResult = {
  phase: VisitPhase;
  request: BackendVisitRequest | null;
  /** True until the stored request for this listing has been read back. */
  isHydrating: boolean;
  /** "+91••••••5084" — what the code screen shows above the input. */
  phoneMasked: string | null;
  /** Seconds until another code may be asked for. Zero means it is allowed. */
  resendIn: number;
  /** Attempts remaining on the current code, once one has been got wrong. */
  attemptsLeft: number | null;
  /** The last failure, for the screen to render. Cleared on the next attempt. */
  error: ApiError | null;
  /**
   * The code was accepted but the owner could not be reached. Retrying is
   * `verify('')` — the server does not re-check a code it has destroyed.
   */
  canRetryOwner: boolean;
  isBusy: boolean;
  /** True once polling has given up. Coming back to the app restarts it. */
  pollingStopped: boolean;

  start: (input: Omit<CreateVisitRequestInput, 'signal'>) => Promise<boolean>;
  verify: (otp: string) => Promise<boolean>;
  resend: () => Promise<boolean>;
  /** Forgets the request, here and on the device. It stays alive on the server. */
  reset: () => void;
};

export function useVisitRequest(listingId?: string | null): UseVisitRequestResult {
  const [phase, setPhase] = useState<VisitPhase>('idle');
  const [request, setRequest] = useState<BackendVisitRequest | null>(null);
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [canRetryOwner, setCanRetryOwner] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isHydrating, setIsHydrating] = useState(Boolean(listingId));
  const [pollingStopped, setPollingStopped] = useState(false);

  /* When the owner was asked. Drives the poll's backoff and its give-up, and
     is a ref rather than state because changing it must not re-render the
     waiting screen on every tick. */
  const askedAt = useRef<number | null>(null);
  const pollStartedAt = useRef<number>(0);

  /* ── Storage ───────────────────────────────────────────────────────────
     Fire-and-forget: a device that cannot write is a device that loses the
     resumption, which is a degraded flow rather than a broken one. The site
     takes the same line — see the try/catch around its localStorage. */
  const store = useCallback(
    (next: BackendVisitRequest | null) => {
      if (!listingId) return;
      const key = storageKey(listingId);
      if (next) AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
      else AsyncStorage.removeItem(key).catch(() => {});
    },
    [listingId],
  );

  const apply = useCallback(
    (next: BackendVisitRequest, persist = true) => {
      setRequest(next);
      const mapped = PHASE_FOR[next.status];
      if (mapped) setPhase(mapped);
      if (next.status === 'pending_owner' && askedAt.current === null) {
        askedAt.current = Date.now();
      }
      if (next.phoneMasked) setPhoneMasked(next.phoneMasked);
      if (typeof next.resendInSeconds === 'number') setResendIn(next.resendInSeconds);
      if (persist) store(next);
    },
    [store],
  );

  /* ── Hydrate ───────────────────────────────────────────────────────────
     A different listing is a different question, so the previous one's
     answer is dropped rather than carried across. */
  useEffect(() => {
    let active = true;

    if (!listingId) {
      setIsHydrating(false);
      return () => { active = false; };
    }

    setIsHydrating(true);
    AsyncStorage.getItem(storageKey(listingId))
      .then((raw) => {
        if (!active || !raw) return;
        const stored = JSON.parse(raw) as BackendVisitRequest;
        if (!stored?.id) return;
        /* Not re-persisted: this IS what was persisted, and writing it back
           would be a pointless disk touch on every screen open. */
        apply(stored, false);
        askedAt.current = stored.status === 'pending_owner' ? Date.now() : null;
      })
      .catch(() => {
        /* Corrupt JSON, or storage disabled. Neither is fatal — the screen
           starts a fresh request, which the server deduplicates. */
      })
      .finally(() => {
        if (active) setIsHydrating(false);
      });

    return () => { active = false; };
  }, [listingId, apply]);

  /* ── The resend cooldown ──────────────────────────────────────────────
     Driven from the send, never from a wrong code. A cooldown that punishes
     a typing mistake is the fastest way to make somebody give up. */
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  /* ── Polling ──────────────────────────────────────────────────────────
     Only while the owner has actually been asked. Enabled off `phase`
     rather than the presence of an id, so the poll cannot run during the
     code step — at that point the server has nothing new to say and every
     call is a rate-limit slot spent on a known answer. */
  const pollId = phase === 'waitingOwner' ? request?.id : undefined;

  useEffect(() => {
    if (pollId) {
      pollStartedAt.current = Date.now();
      setPollingStopped(false);
    }
  }, [pollId]);

  const poll = useQuery({
    queryKey: queryKeys.visitRequest(pollId ?? ''),
    queryFn: ({ signal }) => pollVisitRequest(pollId as string, signal),
    enabled: Boolean(pollId) && !pollingStopped,
    refetchInterval: () => {
      if (Date.now() - pollStartedAt.current > GIVE_UP_MS) {
        /* Stopped, not paused: the owner's window is a day long, the answer
           arrives as an alert either way, and a phone polling all afternoon
           is spending a battery on a screen nobody is looking at. */
        setPollingStopped(true);
        return false;
      }
      const since = askedAt.current ? Date.now() - askedAt.current : 0;
      return since > POLL_BACKOFF_AFTER_MS ? POLL_SLOW_MS : POLL_FAST_MS;
    },
    refetchOnWindowFocus: true,
    /* A dropped poll is not a failed request. The screen keeps the last
       status it knew and the next tick tries again — showing an error
       because one poll missed would tell a student their request had failed
       when the owner may already have said yes. */
    retry: false,
    gcTime: 0,
  });

  useEffect(() => {
    if (poll.data) apply(poll.data);
  }, [poll.data, apply]);

  /*
   * A request the server no longer has.
   *
   * An id kept on a device for long enough that the row is gone. Forgotten
   * rather than polled forever — the same thing the site does on a 404.
   */
  useEffect(() => {
    const failure = poll.error;
    if (failure instanceof ApiError && failure.status === 404) {
      store(null);
      setRequest(null);
      setPhase('idle');
      askedAt.current = null;
    }
  }, [poll.error, store]);

  /* Coming back to the app restarts a poll that had given up. This is the
     moment a stale "waiting for Ramesh" looks worst, and the moment an
     answer is most likely to have arrived. */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;
      if (phase !== 'waitingOwner') return;
      pollStartedAt.current = Date.now();
      setPollingStopped(false);
    });
    return () => subscription.remove();
  }, [phase]);

  /* ── Actions ─────────────────────────────────────────────────────────── */

  const start = useCallback(
    async (input: Omit<CreateVisitRequestInput, 'signal'>) => {
      setError(null);
      setIsBusy(true);
      setPhase('creating');
      try {
        const { request: created, alreadyPending } = await createVisitRequest(input);
        apply(created);

        /* Already in flight from an earlier attempt — another device, or this
           one before it was closed. The phone is long since verified and the
           owner already has it, so straight to the wait without asking for a
           code nobody sent. */
        if (alreadyPending) {
          askedAt.current = Date.now();
          setPhase('waitingOwner');
        }
        return true;
      } catch (caught) {
        const failure = caught as ApiError;
        setError(failure);
        setPhase('failed');
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [apply],
  );

  const verify = useCallback(
    async (otp: string) => {
      if (!request?.id) return false;
      setError(null);
      setAttemptsLeft(null);
      setIsBusy(true);
      setPhase('verifying');
      try {
        const verified = await verifyVisitRequest(request.id, otp);
        apply(verified);
        setCanRetryOwner(false);
        return true;
      } catch (caught) {
        const failure = caught as ApiError;
        setError(failure);

        /* The code was right; only the WhatsApp message failed. The phone
           stays verified server-side, so this is a retry rather than a
           restart — and the code the student typed has already been
           destroyed, which is why the retry sends none. */
        if (failure.code === 'OWNER_NOTIFY_FAILED') {
          setCanRetryOwner(true);
        }

        const payload = failure.payload as { attemptsLeft?: number } | null;
        if (typeof payload?.attemptsLeft === 'number') setAttemptsLeft(payload.attemptsLeft);

        /* Back to the code, not to failure: a wrong digit is the most likely
           thing to happen here and it is entirely recoverable. Only a code
           that can no longer be used at all ends the attempt. */
        setPhase(failure.code === 'OTP_LOCKED' || failure.code === 'OTP_EXPIRED' ? 'failed' : 'awaitingCode');
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [request?.id, apply],
  );

  const resend = useCallback(async () => {
    if (!request?.id || resendIn > 0) return false;
    setError(null);
    setIsBusy(true);
    try {
      const refreshed = await resendVisitOtp(request.id);
      apply(refreshed);
      setAttemptsLeft(null);
      return true;
    } catch (caught) {
      const failure = caught as ApiError;
      setError(failure);
      /* The server owns the cooldown and says how much of it is left. */
      const payload = failure.payload as { retryAfter?: number } | null;
      if (typeof payload?.retryAfter === 'number') setResendIn(payload.retryAfter);
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [request?.id, resendIn, apply]);

  const reset = useCallback(() => {
    setPhase('idle');
    setRequest(null);
    setPhoneMasked(null);
    setResendIn(0);
    setAttemptsLeft(null);
    setError(null);
    setCanRetryOwner(false);
    setPollingStopped(false);
    askedAt.current = null;
    store(null);
  }, [store]);

  return {
    phase,
    request,
    isHydrating,
    phoneMasked,
    resendIn,
    attemptsLeft,
    error,
    canRetryOwner,
    isBusy,
    pollingStopped,
    start,
    verify,
    resend,
    reset,
  };
}

/** The three answers that end a request. Exported so screens agree on it. */
export const isTerminalPhase = (phase: VisitPhase) => TERMINAL.includes(phase);
