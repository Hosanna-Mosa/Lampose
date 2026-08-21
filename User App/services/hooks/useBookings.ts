import { useQuery } from '@tanstack/react-query';

import {
  fetchBooking,
  fetchBookings,
  type CustomerBooking,
} from '@/services/api/bookings.api';
import { queryKeys } from './keys';

/**
 * The student's bookings, from the server.
 *
 * ## Why this refetches on focus, and the request hook does not need to
 *
 * A stay request is watched: the app is open, a clock is running, and the
 * screen is polling because an answer is expected in minutes. A booking is the
 * opposite — it changes when the OWNER does something, on their schedule, and
 * the student is usually not looking. The state that matters most (checked in,
 * checked out, cancelled) is therefore almost always something that happened
 * while the app was closed.
 *
 * So the list is treated as stale on every return to the app rather than
 * polled: `focusManager` in `app/_layout.tsx` makes that fire on real
 * foregrounding, which is exactly when the answer might have changed.
 */
export function useBookings(enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.bookings,
    queryFn: ({ signal }) => fetchBookings(signal),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
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
 * One booking.
 *
 * Seeded from whatever the list already holds, so opening a row paints
 * immediately and then corrects itself — the student tapping into a booking on
 * move-in day is the case that must not show a spinner over a gate code they
 * can already see.
 */
export function useBooking(id: string | null | undefined) {
  const query = useQuery({
    queryKey: queryKeys.booking(id ?? ''),
    queryFn: ({ signal }) => fetchBooking(id as string, signal),
    enabled: Boolean(id),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return {
    booking: query.data as CustomerBooking | undefined,
    loading: query.isPending && Boolean(id),
    error: query.error,
    refetch: query.refetch,
  };
}
