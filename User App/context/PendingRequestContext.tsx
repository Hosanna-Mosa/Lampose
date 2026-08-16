import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { SCREEN_WAIT_SECONDS } from '@/types/request';

/**
 * The one request that can be in flight, and how much of the bottom edge is
 * already spoken for.
 *
 * ## Why the app holds this rather than the screen
 *
 * A request runs for three minutes whether or not the student is looking at it.
 * If it lived in the confirmation screen's state it would die the moment they
 * wandered into another listing — and wandering into another listing while
 * waiting is the single most likely thing they will do.
 *
 * ## One at a time
 *
 * Not a list. A student can have five requests a week but only one in flight:
 * two live requests means two beds being held for one person, which is the
 * thing owners stop tolerating first. If a second request is started, it
 * replaces the first — the screen that starts it is responsible for asking.
 */

export type PendingRequestStatus = 'waiting' | 'accepted' | 'cancelled';

export type PendingRequest = {
  listingId: string;
  listingName: string;
  /** A first name. The pill says "Waiting for Padma", never "the owner". */
  owner: string;
  /** Absolute ISO timestamp. A duration would restart on every re-render. */
  deadline: string;
  status: PendingRequestStatus;
  /** The stay choices, carried through to payment. */
  params: Record<string, string>;
};

type PendingRequestValue = {
  request: PendingRequest | null;
  start: (request: Omit<PendingRequest, 'status' | 'deadline'> & { deadline?: string }) => void;
  settle: (status: Exclude<PendingRequestStatus, 'waiting'>) => void;
  /** Clears it entirely. Only a cancelled request may be dismissed this way. */
  clear: () => void;

  /**
   * How many points at the bottom of the screen are already occupied by
   * something pinned — the listing screen's action bar, a tab bar.
   *
   * The floating pill is global and has no way of knowing what the screen under
   * it is doing, so bottom-pinned chrome declares its height here and the pill
   * sits above it instead of on top of it.
   *
   * **Keyed, and the largest claim wins.** A single number looks sufficient
   * until two screens overlap during a transition: leaving a listing for home,
   * the tab bar mounts and claims its height, and then the outgoing action
   * bar's cleanup runs and sets it back to zero — dropping the pill onto the
   * tab labels. Which is exactly the bug this replaced. With a registry, a
   * claimant can only ever withdraw its own claim.
   */
  reservedBottom: number;
  reserveBottom: (key: string, height: number) => void;
  releaseBottom: (key: string) => void;
};

const PendingRequestContext = createContext<PendingRequestValue | null>(null);

export function PendingRequestProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [claims, setClaims] = useState<Record<string, number>>({});

  const start: PendingRequestValue['start'] = useCallback((next) => {
    setRequest({
      ...next,
      status: 'waiting',
      deadline: next.deadline ?? new Date(Date.now() + SCREEN_WAIT_SECONDS * 1000).toISOString(),
    });
  }, []);

  const settle: PendingRequestValue['settle'] = useCallback((status) => {
    setRequest((current) => (current ? { ...current, status } : current));
  }, []);

  const clear = useCallback(() => setRequest(null), []);

  const reserveBottom = useCallback((key: string, height: number) => {
    setClaims((current) => (current[key] === height ? current : { ...current, [key]: height }));
  }, []);

  const releaseBottom = useCallback((key: string) => {
    setClaims((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  /* The tallest thing currently pinned. Two claimants during a transition is
     the normal case, not the exception. */
  const reservedBottom = useMemo(
    () => Object.values(claims).reduce((tallest, height) => Math.max(tallest, height), 0),
    [claims],
  );

  const value = useMemo(
    () => ({ request, start, settle, clear, reservedBottom, reserveBottom, releaseBottom }),
    [request, start, settle, clear, reservedBottom, reserveBottom, releaseBottom],
  );

  return <PendingRequestContext.Provider value={value}>{children}</PendingRequestContext.Provider>;
}

export function usePendingRequest(): PendingRequestValue {
  const value = useContext(PendingRequestContext);
  if (!value) throw new Error('usePendingRequest must be used inside PendingRequestProvider');
  return value;
}
