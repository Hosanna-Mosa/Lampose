import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { socketService } from "@/utils/socketService";

export type Coords = { lat: number; lng: number };

/** Bangalore city centre — only used when location permission is refused. */
const FALLBACK: Coords = { lat: 12.9716, lng: 77.5946 };

type Options = {
  /** Broadcast position/heading over the socket for live customer tracking. */
  broadcast?: boolean;
  driverId?: string | null;
  orderId?: string | null;
};

/**
 * Watches GPS position and compass heading, and (optionally) broadcasts both.
 * Broadcasts are throttled to at most one per second, and only when the driver
 * has actually moved or turned meaningfully.
 */
export function useDriverLocation({ broadcast, driverId, orderId }: Options = {}) {
  const [location, setLocation] = useState<Coords | null>(null);
  const [heading, setHeading] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Manual override lets the dev simulator drive the marker.
  const overrideRef = useRef<Coords | null>(null);

  useEffect(() => {
    let positionSub: Location.LocationSubscription | null = null;
    let headingSub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (status !== "granted") {
        setPermissionDenied(true);
        setLocation(FALLBACK);
        return;
      }

      try {
        const first = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (cancelled) return;
        setLocation({ lat: first.coords.latitude, lng: first.coords.longitude });
        if (typeof first.coords.heading === "number" && first.coords.heading >= 0) {
          setHeading(first.coords.heading);
        }
      } catch {
        if (!cancelled) setLocation(FALLBACK);
      }

      try {
        positionSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 5 },
          (next) => {
            if (overrideRef.current) return;
            setLocation({ lat: next.coords.latitude, lng: next.coords.longitude });
          },
        );
      } catch (err) {
        console.warn("[location] position watch failed:", (err as Error).message);
      }

      try {
        headingSub = await Location.watchHeadingAsync((data) => {
          if (overrideRef.current) return;
          const value = data.trueHeading >= 0 ? data.trueHeading : data.magHeading;
          if (typeof value === "number" && !Number.isNaN(value)) setHeading(value);
        });
      } catch {
        // Compass isn't available on every device — the marker just won't rotate.
      }
    })();

    return () => {
      cancelled = true;
      positionSub?.remove();
      headingSub?.remove();
    };
  }, []);

  // ── Throttled broadcast ────────────────────────────────────────────────────
  const lastSent = useRef({ lat: 0, lng: 0, heading: 0, at: 0 });

  useEffect(() => {
    if (!broadcast || !location || !driverId) return;

    const now = Date.now();
    const prev = lastSent.current;
    const movedEnough =
      Math.abs(location.lat - prev.lat) > 0.00005 || Math.abs(location.lng - prev.lng) > 0.00005;
    const turnedEnough = Math.abs(heading - prev.heading) > 10;

    if (now - prev.at < 1000) return;
    if (!movedEnough && !turnedEnough) return;

    lastSent.current = { lat: location.lat, lng: location.lng, heading, at: now };
    socketService.sendLocation({
      driverId,
      lat: location.lat,
      lng: location.lng,
      heading,
      orderId: orderId ?? undefined,
    });
  }, [broadcast, location, heading, driverId, orderId]);

  /** Used by the dev route simulator to take over the marker. */
  const setSimulated = (coords: Coords | null, simulatedHeading?: number) => {
    overrideRef.current = coords;
    if (coords) {
      setLocation(coords);
      if (typeof simulatedHeading === "number") setHeading(simulatedHeading);
    }
  };

  return { location, heading, permissionDenied, setSimulated };
}
