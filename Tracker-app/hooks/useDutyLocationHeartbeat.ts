/* ══════════════════════════════════════════════════════════════════════════
   Watches position while the rep is on duty, and pushes every fix to the
   server — the half of "where he goes" that runs for the length of a shift
   rather than once, when the switch is first pressed.

   Foreground only, deliberately. This app has no background location task —
   see `driver/services/backgroundLocation.ts` for the size of that feature
   (a foreground service notification, a headless relaunch, a separate token
   read from raw storage) done properly for an active delivery, where a
   dropped fix can strand an order. A sales visit has no such deadline: the
   rep keeping the app open while they are out is a reasonable ask for a
   first version, and adding background tracking later is additive, not a
   rewrite of this hook.
   ══════════════════════════════════════════════════════════════════════════ */
import * as Location from "expo-location";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/authStore";

export function useDutyLocationHeartbeat() {
  const onDuty = useAuthStore((s) => s.session?.salesRep?.onDuty ?? false);
  const pushLocation = useAuthStore((s) => s.pushLocation);
  const subscription = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!onDuty) {
      subscription.current?.remove();
      subscription.current = null;
      return undefined;
    }

    let cancelled = false;

    (async () => {
      /* Permission was already granted the moment duty turned on — see
         `authStore.ts`'s `setDuty` — but this hook can also mount fresh on a
         relaunch where the rep was already on duty, so it checks rather
         than assumes. */
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;

      subscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 30 },
        (fix) => pushLocation(fix.coords.latitude, fix.coords.longitude),
      );
    })();

    return () => {
      cancelled = true;
      subscription.current?.remove();
      subscription.current = null;
    };
  }, [onDuty, pushLocation]);
}
