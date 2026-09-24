/* ══════════════════════════════════════════════════════════════════════════
   Keeps position flowing to the server for as long as the rep is on duty.

   The real work is the background task in `services/backgroundLocation.ts`:
   it keeps sending with the app minimised or swiped away. This hook makes
   sure that task is running whenever the screen is up and the rep is on duty
   — including on a relaunch where they were already online — and falls back
   to a FOREGROUND-only watcher when the rep refused "Allow all the time", so
   a refused permission still reports while the app is open rather than not
   at all. Never both: two sources would double every ping.
   ══════════════════════════════════════════════════════════════════════════ */
import * as Location from "expo-location";
import { useEffect, useRef } from "react";
import { startDutyTracking } from "@/services/backgroundLocation";
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
      if (await startDutyTracking()) return;
      if (cancelled) return;

      /* Background refused — report while on screen, at least. */
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;

      const sub = await Location.watchPositionAsync(
        /* High for the same reason as the background task — see there. */
        { accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 30 },
        (fix) => pushLocation(fix.coords.latitude, fix.coords.longitude, fix.coords.accuracy),
      );
      if (cancelled) sub.remove();
      else subscription.current = sub;
    })();

    return () => {
      cancelled = true;
      subscription.current?.remove();
      subscription.current = null;
    };
  }, [onDuty, pushLocation]);
}
