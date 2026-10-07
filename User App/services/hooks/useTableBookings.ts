import { useCallback, useEffect } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchMyTableBookings,
  fetchTableBooking,
  fetchTableSlots,
} from '@/services/api/tableBookings.api';
import { ApiError } from '@/services/api/client';
import { connectSupportSocket, onTableBookingEvent } from '@/services/support.socket';
import type { TableBooking } from '@/types/food';
import { queryKeys } from './keys';

/**
 * Dine-in, from the server: a day's slot grid, the diner's bookings, one
 * booking.
 *
 * ## Three ways a booking stays current, and none of them is required
 *
 * A request gives the restaurant fifteen minutes, so the one booking a diner
 * is most likely to be staring at is the one most likely to change. It is
 * kept current three ways, any one of which is enough:
 *
 *   the socket   `table_booking_updated` into `customer:<id>` — immediate,
 *                and optional: a deployment without it simply never fires.
 *   a poll       every ten seconds while the booking is `requested`, and
 *                not at all once it is anything else.
 *   focus        the screen re-reads on focus, and the list refetches when
 *                the app comes back to the front (`focusManager`).
 *
 * The same shape `useBookings` gives a stay — see its header.
 */

/** A refused read is not retried; an unreachable one already was. Same as `useFood`. */
const retry = (count: number, error: unknown) => {
  if (error instanceof ApiError && error.status > 0) return false;
  return count < 1;
};

/** While the restaurant has a request to answer, how often to ask again. */
const REQUESTED_POLL_MS = 10_000;

/**
 * One day's slots for one party size.
 *
 * The previous grid stays on screen while the next one loads
 * (`keepPreviousData`), and `isPlaceholderData` says so — the screen dims it
 * rather than blanking it, because a grid that vanishes on every tap of the
 * guest stepper reads as a restaurant with no tables.
 */
export function useTableSlots(restaurantId: string | null | undefined, date: string | null, guests: number) {
  return useQuery({
    queryKey: queryKeys.tableSlots(restaurantId ?? '', date, guests),
    queryFn: ({ signal }) => fetchTableSlots({ restaurantId: String(restaurantId), date, guests }, signal),
    enabled: !!restaurantId,
    /* Short: a slot taken by somebody else is the commonest way a booking
       fails, and every minute of staleness is a minute of offering it. */
    staleTime: 20_000,
    placeholderData: keepPreviousData,
    retry,
  });
}

/**
 * The tables a party may pick at one time, each with whether it is free.
 *
 * Its own query rather than a `time` on the grid's: picking a time must not
 * dim the whole grid while one more answer loads. Off until a time is picked.
 */
export function useTableChoices(
  restaurantId: string | null | undefined,
  date: string | null,
  guests: number,
  time: string | null,
) {
  return useQuery({
    queryKey: queryKeys.tableChoices(restaurantId ?? '', date ?? '', guests, time ?? ''),
    queryFn: ({ signal }) => fetchTableSlots({ restaurantId: String(restaurantId), date, guests, time }, signal),
    enabled: !!restaurantId && !!date && !!time,
    staleTime: 20_000,
    select: (data) => (data.time === time ? data.tables : []),
    retry,
  });
}

/** Put a booking the server just answered with into both caches. */
export function useRememberTableBooking() {
  const queryClient = useQueryClient();
  return useCallback(
    (booking: TableBooking) => {
      queryClient.setQueryData(queryKeys.tableBooking(booking.reference), booking);
      void queryClient.invalidateQueries({ queryKey: queryKeys.tableBookingList });
    },
    [queryClient],
  );
}

/**
 * The diner's bookings, newest sitting first, as the server sends them.
 *
 * `live: false` stops the poll without dropping the list — for a list that is
 * mounted but not on screen (the Food module stays mounted behind the stay
 * tabs; see `FoodPaused`).
 */
export function useTableBookings(enabled = true, live = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return undefined;
    connectSupportSocket();
    return onTableBookingEvent(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tableBookings });
    });
  }, [enabled, queryClient]);

  const query = useQuery({
    queryKey: queryKeys.tableBookingList,
    queryFn: ({ signal }) => fetchMyTableBookings(signal),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    /* A request in the list is being answered right now; the list follows it
       the way the detail does, and stops once nothing is waiting. */
    refetchInterval: (current) =>
      live && (current.state.data ?? []).some((booking) => booking.status === 'requested')
        ? REQUESTED_POLL_MS
        : false,
    retry,
  });

  return {
    bookings: query.data ?? [],
    loading: query.isPending && enabled,
    error: query.error,
    refetch: query.refetch,
    refreshing: query.isFetching && !query.isPending,
  };
}

/**
 * One booking, by reference.
 *
 * Seeded from the list when the list has it, so opening a row paints at once
 * and then corrects itself.
 */
export function useTableBooking(reference: string | null | undefined) {
  const queryClient = useQueryClient();
  const wanted = (reference ?? '').trim().toUpperCase();
  const enabled = !!wanted;

  useEffect(() => {
    if (!enabled) return undefined;
    connectSupportSocket();
    return onTableBookingEvent((event) => {
      if ((event?.reference ?? '').trim().toUpperCase() !== wanted) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.tableBooking(wanted) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tableBookingList });
    });
  }, [enabled, wanted, queryClient]);

  const query = useQuery<TableBooking | null>({
    queryKey: queryKeys.tableBooking(wanted),
    queryFn: ({ signal }) => fetchTableBooking(wanted, signal),
    enabled,
    staleTime: 15_000,
    placeholderData: (): TableBooking | undefined =>
      queryClient
        .getQueryData<TableBooking[]>(queryKeys.tableBookingList)
        ?.find((booking) => booking.reference.toUpperCase() === wanted),
    refetchInterval: (current) => (current.state.data?.status === 'requested' ? REQUESTED_POLL_MS : false),
    retry,
  });

  return {
    booking: query.data ?? undefined,
    loading: query.isPending && enabled,
    error: query.error,
    refetch: query.refetch,
  };
}
