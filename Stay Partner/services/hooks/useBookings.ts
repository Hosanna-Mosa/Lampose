import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api/client';
import { API_BASE_URL_CONFIGURED } from '@/services/api/config';
import {
  cancelBookingApi,
  checkInBookingApi,
  checkOutBookingApi,
  devForceCheckInOwnerApi,
  fetchBookingById,
  fetchBookings,
} from '@/services/api/domain.api';
import { useAuth } from '@/context/AuthContext';
import { toBooking, type Booking } from '@/lib/bookings';
import { onBookingEvent } from '@/services/realtimeSocket';
import { queryKeys } from './keys';

/**
 * One booking, from the server, plus the three taps that move it.
 *
 * ## What this replaced
 *
 * `getBooking(id)` — a lookup in the module-level fixture array in
 * `lib/bookings.ts`, seeded at import time with ids like `LB-1182`. The
 * booking DETAIL screen fetched properly; the four screens behind it (cancel,
 * check-in, active stay, checkout) did not, so a real Mongo id matched nothing
 * and each of them rendered "Booking not found". That is why the Cancel
 * booking button looked dead and why nothing followed Start check-in: the
 * screens were all there, and all four were looking somebody up in a fixture.
 *
 * ## Why the mutations live here and not on the screens
 *
 * All three change the same row, and every one of them has to invalidate both
 * this booking AND the list behind it — a cancelled booking that stays in the
 * owner's Upcoming tab is the bug that made the last one look broken. Doing
 * that in one place is the only way the three stay in step.
 *
 * They also do NOT swallow their errors. The cancel screen used to be
 * `await cancelBookingApi(id).catch(() => {})` followed unconditionally by a
 * navigation back to the list — so a cancellation that never reached the
 * server, or was refused, looked exactly like one that worked. An owner who
 * believes a booking is cancelled and finds the guest at the door has been
 * lied to by the app.
 */

function useReady() {
  const { status } = useAuth();
  return API_BASE_URL_CONFIGURED && status === 'signedIn';
}

/**
 * The bookings that are half-done, for the strip on Today.
 *
 * Two lists. `ongoing` is the state nothing else in the app reports: the owner
 * has marked a guest in and the guest has not confirmed from their own phone
 * yet. `notCheckedIn` is every booking still waiting on an arrival, which the
 * Today screen narrows to the ones actually due.
 * `status` stays `upcoming` until both stamps exist, so this booking looks
 * ordinary in every list — and unless the owner happens to reopen it, nothing
 * tells them it is still waiting on somebody.
 *
 * It owns `queryKeys.bookings`, the key the three mutations below already
 * invalidate, so checking a guest in refreshes this without a second wire.
 */
export function useOngoingBookings() {
  const enabled = useReady();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return undefined;
    /* The student confirming is a socket event, not something this owner
       does — without this the strip would keep asking them to wait for
       somebody who has already answered. */
    return onBookingEvent(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings });
    });
  }, [enabled, queryClient]);

  const query = useQuery({
    queryKey: queryKeys.bookings,
    queryFn: async ({ signal }) => {
      const raw = await fetchBookings(undefined, signal);
      return (Array.isArray(raw) ? raw : []).map((row) => toBooking(row));
    },
    enabled,
    staleTime: 30_000,
  });

  const ongoing = useMemo(
    () => (query.data ?? []).filter((b) => b.movedInByOwnerAt && !b.movedInByStudentAt),
    [query.data],
  );

  /*
   * Everybody nobody has checked in yet — the CANDIDATES for "coming today".
   *
   * Which of them is actually due is not a question this hook can answer,
   * and it was wrong to try. It filtered on the server's `arriving` stage,
   * which is derived from `checkInDate` — and on a bachelor booking that
   * field is `acceptAndBook`'s `joining || today` fallback, because that
   * request never asks for a joining date. So every bachelor booking accepted
   * today read as "arriving today" the moment it was accepted, while the
   * student had not paid, had not scheduled a visit, and was not coming
   * anywhere.
   *
   * The Today screen makes that call instead, because it holds the REQUESTS
   * as well and the request is where the guest's side of the flow lives.
   * Overdue arrivals stay out either way: they need a decision, not a door
   * opened, and they would pile up in the strip for ever.
   */
  const notCheckedIn = useMemo(
    () => (query.data ?? []).filter(
      (b) => !b.movedInByOwnerAt && b.status !== 'completed' && b.status !== 'cancelled',
    ),
    [query.data],
  );

  return { ongoing, notCheckedIn, refetch: query.refetch };
}

export function useBooking(id?: string | null) {
  const enabled = useReady() && Boolean(id);
  const queryClient = useQueryClient();

  /* The live half — see the note in `useStayRequests`. A cancellation from
     the student's own app must reach whichever owner has this exact booking
     open, not just the next time they happen to refetch it. */
  useEffect(() => {
    if (!enabled || !id) return undefined;
    return onBookingEvent((event) => {
      if (event.bookingId && event.bookingId !== id) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.booking(id) });
    });
  }, [enabled, id, queryClient]);

  const query = useQuery({
    queryKey: queryKeys.booking(id ?? ''),
    queryFn: async ({ signal }) => {
      const raw = await fetchBookingById(id as string, signal);
      /* A 200 with no row is "gone", not an empty booking — the screens tell
         those apart and only one of them is an error state. */
      return raw ? toBooking(raw, id as string) : null;
    },
    enabled,
    /* Refetched on focus so a screen coming back from a mutation elsewhere —
       the student confirming their own move-in, say — is not showing what the
       row said a minute ago. */
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    /* A rejection the server authored is final; only the network is worth a
       retry. Same rule as `useStayRequests`. */
    retry: (count, error) => !(error instanceof ApiError && error.status > 0) && count < 1,
    staleTime: 0,
  });

  return {
    ...query,
    booking: (query.data ?? null) as Booking | null,
    /* `null` data is a real answer (the row is gone); `undefined` is "still
       asking". Only the second should hold a spinner. */
    notFound: query.isSuccess && query.data === null,
    error: query.error as ApiError | null,
  };
}

/**
 * Check in, check out, cancel.
 *
 * `retry: false` on all three: every one of them is a state transition, and a
 * library deciding to send it again is a second attempt at moving somebody
 * into a room or handing a bed back. That has to be a person pressing again.
 */
export function useBookingActions(id?: string | null) {
  const queryClient = useQueryClient();

  const settle = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.bookings });
    queryClient.invalidateQueries({ queryKey: queryKeys.summary });
    /* The bed that just came back changes what the listing can take. */
    queryClient.invalidateQueries({ queryKey: queryKeys.myProperties });
    if (id) queryClient.invalidateQueries({ queryKey: queryKeys.booking(id) });
  };

  const checkIn = useMutation({
    mutationFn: (code?: string) => checkInBookingApi(id as string, code),
    retry: false,
    onSettled: settle,
  });

  /* DEVELOPMENT ONLY — see `devForceCheckInOwnerApi`. A separate mutation
     from `checkIn` rather than a parameter on it: the real check-in and the
     bypass are two different requests to two different routes, and keeping
     them apart is what stops a slipped default ever reaching the bypass by
     accident. */
  const devForceCheckIn = useMutation({
    mutationFn: () => devForceCheckInOwnerApi(id as string),
    retry: false,
    onSettled: settle,
  });

  const checkOut = useMutation({
    mutationFn: () => checkOutBookingApi(id as string),
    retry: false,
    onSettled: settle,
  });

  const cancel = useMutation({
    mutationFn: (input: { reason: string; note?: string }) =>
      cancelBookingApi(id as string, input),
    retry: false,
    onSettled: settle,
  });

  return {
    checkIn,
    devForceCheckIn,
    checkOut,
    cancel,
    isBusy: checkIn.isPending || devForceCheckIn.isPending || checkOut.isPending || cancel.isPending,
    error: (checkIn.error ?? devForceCheckIn.error ?? checkOut.error ?? cancel.error) as ApiError | null,
  };
}
