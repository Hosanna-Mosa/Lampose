import { useRouter } from 'expo-router';
import { announceFoodOrdersChanged } from '@/services/push/foodRefresh';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  addPushListeners,
  getInitialPush,
  isBookingPush,
  isFoodPush,
  isSupportPush,
  isTableBookingPush,
  type PushPayload,
} from './push';

/**
 * What happens when a notification arrives, and when one is tapped.
 *
 * Mounted once, at the root. Two behaviours that are deliberately different:
 *
 *   arrived while the app is open   refresh quietly, navigate NOWHERE
 *   tapped                          go to the request
 *
 * Navigating on arrival would yank somebody out of whatever they were doing
 * because an owner answered — which is the correct information delivered in
 * the most disruptive way available. The banner tells them; the tap is them
 * deciding to look.
 *
 * ## The cold start is a third case, and it is easy to miss
 *
 * When the process was dead, the tap that launched the app has already
 * happened before any listener can exist. `getInitialPush` reads it back.
 * Without it, tapping "your request was accepted" on a killed app lands on the
 * home screen — which reads, correctly, as the notification being broken.
 */
export function usePushRouting() {
  const router = useRouter();
  const queryClient = useQueryClient();

  /* A cold-start payload must be routed once. Without this guard a re-render
     replays the navigation and traps somebody on a screen they backed out of. */
  const handledColdStart = useRef(false);

  useEffect(() => {
    const open = (payload: PushPayload) => {
      /* TWO flows notify this app, and the branch is on `kind` rather than on
         which id happens to be present — a food order opening a room-booking
         screen is the failure this exists to prevent.

         Within each flow there is still ONE destination: the request screen
         renders every ending (accepted, declined, taken, expired), and the
         order screen renders every stage (searching, a rider, delivered). The
         server's status decides what is drawn, never the payload. */
      if (isFoodPush(payload)) {
        router.push({
          pathname: '/food/order/[id]',
          params: { id: payload.orderNumber },
        } as never);
        return;
      }

      /* A table booking: the booking itself, which draws every ending
         (confirmed, declined, expired, cancelled) from the server's status.
         Ahead of support, which also carries a `reference`. */
      if (isTableBookingPush(payload)) {
        router.push({
          pathname: '/food/table-booking/[reference]',
          params: { reference: payload.reference },
        } as never);
        return;
      }

      /* Support: the thread itself. These used to fall through to the
         request screen with no id, which drew nothing useful. */
      if (isSupportPush(payload)) {
        router.push({ pathname: '/support/[id]', params: { id: payload.reference } } as never);
        return;
      }

      /* A refund sent: the refund screen for that booking, not the request
         screen with an empty id. */
      if (payload.kind === 'refund.paid' && payload.bookingId) {
        router.push(`/bookings/refund?id=${payload.bookingId}` as never);
        return;
      }

      /* A coupon earned has no screen of its own; it is spent from the
         request flow, so home is where the next request starts. */
      if (payload.kind === 'coupon.earned') {
        router.push('/home' as never);
        return;
      }

      /* "Pick your visit slot" — the slot picker, not the confirm screen. */
      if (payload.kind === 'visit.slot_reminder' && payload.requestId) {
        router.push({
          pathname: '/visit/slot',
          params: { requestId: payload.requestId, id: payload.listingId ?? '' },
        } as never);
        return;
      }

      /* The booking half — a check-in, a check-out or a cancellation the
         OWNER just made. Not the request screen: the request has been
         terminal since it was accepted, and none of these three change it.
         A checkout goes straight to the review prompt, since that is the one
         actionable thing the notification is telling them they can now do;
         the other two land on the booking itself, in the fixture-id shape
         `app/bookings/[id].tsx` still reads — see the note there on
         `realBookingId` for why that screen's real actions (cancel, review)
         work from a fixture-shaped route. */
      if (isBookingPush(payload)) {
        if (payload.kind === 'booking.checkedOut' && payload.bookingId) {
          router.push(`/bookings/review?id=${payload.bookingId}` as never);
        } else if (payload.listingId) {
          router.push(`/bookings/bkg-${payload.listingId}` as never);
        }
        return;
      }

      router.push({
        pathname: '/confirm/[id]',
        params: { id: payload.listingId ?? '', requestId: payload.requestId ?? '' },
      } as never);
    };

    const refresh = (payload: PushPayload) => {
      /* The screen may already be showing this request with a countdown on
         it. Invalidating is enough — the query refetches and renders whatever
         the server now says, which is the rule everywhere: the backend is the
         status, never the notification payload.

         A food order's tracking screen polls itself while it is open — but the
         order card pinned to Home does not, and stayed stale. So the orders
         are read again (see `foodRefresh.ts`). */
      if (isFoodPush(payload)) {
        announceFoodOrdersChanged();
        return;
      }
      if (isTableBookingPush(payload)) {
        queryClient.invalidateQueries({ queryKey: ['table-bookings'] });
        return;
      }
      if (isSupportPush(payload)) {
        queryClient.invalidateQueries({ queryKey: ['tickets'] });
        return;
      }
      if (isBookingPush(payload)) {
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
        if (payload.bookingId) queryClient.invalidateQueries({ queryKey: ['bookings', payload.bookingId] });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['stay-requests', payload.requestId] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    const detach = addPushListeners({ onReceived: refresh, onTapped: open });

    (async () => {
      if (handledColdStart.current) return;
      const initial = await getInitialPush();
      if (!initial) return;
      handledColdStart.current = true;
      open(initial);
    })();

    /* Removed on unmount, or a hot reload stacks listeners and one
       notification fires four times. */
    return detach;
  }, [router, queryClient]);
}
