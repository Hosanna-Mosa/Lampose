import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { addPushListeners, getInitialPush, isFoodPush, type PushPayload } from './push';

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

         A food order needs nothing here: the tracking screen polls itself
         every eight seconds while an order is live, so it has already redrawn
         by the time this fires. */
      if (isFoodPush(payload)) return;
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
