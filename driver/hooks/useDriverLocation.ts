import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

export type Coords = { lat: number; lng: number };

/** Haversine distance, metres. Duplicated from `MapPanel.tsx`'s own
    `metresBetween` (no workspace tooling to share it from a hook) — used
    here only to decide whether two fixes are far enough apart to trust a
    bearing computed between them, not shown anywhere. */
function metresBetween(a: Coords, b: Coords): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True geographic bearing from `a` to `b`, in [0, 360). Duplicated from
    `MapPanel.tsx`'s own `bearingBetween` for the same reason as above. */
function bearingBetween(a: Coords, b: Coords): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Below this, two fixes are treated as "the same point" for bearing
    purposes rather than "moved this way" — plain GPS noise while nearly
    still is a few metres wide even locked to a chair, and a bearing
    computed across noise that small is closer to a random number than a
    direction. Comfortably under `distanceInterval` below, so a fix the
    watcher fired FOR actual movement is never itself discarded as noise. */
const MIN_BEARING_MOVE_METRES = 4;

/**
 * Watches GPS position and compass heading with explicit on-demand location refreshing & reverse geocoding.
 *
 * ## `heading` is "which way is this rider moving", not "which way is the
 * phone pointing" — and those are two different questions with two
 * different answers on this hardware.
 *
 * `watchHeadingAsync`'s compass answers the second one: it reports the
 * PHONE's own physical orientation, accurate regardless of whether the
 * rider is moving at all — a phone mounted sideways on a handlebar, lying
 * flat in a holder, or sitting in a pocket can face any which way while the
 * scooter underneath it moves in a straight line, so a marker driven by it
 * doesn't visibly track real movement. That was the first bug here: the
 * position watcher updated `location` on every fix but never read anything
 * else off it, so once the compass subscription came up it was the only
 * thing this hook ever set `heading` from again, moving vehicle or not.
 *
 * The first fix at that bug looked like the right one — GPS's own
 * `coords.heading` ("course over ground", the OS's own computed direction
 * of travel) answers the actual question instead of the compass's — but it
 * turned out to be a second, quieter version of the SAME problem: plenty of
 * Android location providers simply never populate `coords.heading` at
 * all, on any fix, moving or not, and there is no way for this hook to
 * detect that in advance — it would just silently keep falling back to the
 * compass forever, which is indistinguishable from the original bug still
 * being there.
 *
 * So `heading` is now computed HERE, directly, from two consecutive real
 * fixes this hook already has (`lastFixRef`) — the actual bearing the
 * rider travelled between them, `bearingBetween`, gated by
 * `MIN_BEARING_MOVE_METRES` so GPS jitter while standing still isn't
 * mistaken for a direction. This depends on nothing the OS might or might
 * not choose to report: it only needs two `{lat,lng}` pairs, which
 * `watchPositionAsync` always gives regardless of platform, provider or
 * device. `hasBearingRef` tracks whether a real, movement-derived bearing
 * has EVER been established; once it has, the compass is permanently done
 * for this session — a stopped rider keeps facing whichever way they were
 * last actually travelling (the same thing every ride-hailing app's own
 * vehicle icon does at a red light), not whichever way their phone happens
 * to be sitting. Before that first real bearing exists — the very first
 * fix, with nothing yet to compare it to — the compass is what fills the
 * gap, on the theory that a rough guess beats no facing at all for those
 * first few seconds. This is the one `heading` this hook produces, fed
 * straight into `pushLocation` and from there to both apps' maps — fixing
 * it here fixes the diner's view of the rider too, not just the rider's
 * own.
 */
export function useDriverLocation() {
  const [location, setLocation] = useState<Coords | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [addressLabel, setAddressLabel] = useState<string>("");
  const [fetching, setFetching] = useState<boolean>(false);
  /** The last fix `heading` was computed from (or, before any bearing has
      ever been established, just the last fix seen at all) — the anchor
      the NEXT fix's bearing is measured from. */
  const lastFixRef = useRef<Coords | null>(null);
  /** Whether a real, movement-derived bearing has EVER been computed this
      session — checked by the compass watcher below before it's allowed to
      set `heading`, so a real bearing permanently retires the compass the
      first time one exists, rather than the two fighting over every fix. */
  const hasBearingRef = useRef(false);

  /**
   * Reverse-geocodes latitude & longitude into a readable city/region label.
   */
  const updateAddressLabel = useCallback(async (lat: number, lng: number) => {
    try {
      const [res] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (res) {
        const city = res.city || res.subregion || res.district || res.name || "";
        const region = res.region || res.country || "";
        const combined = [city, region].filter(Boolean).join(", ");
        if (combined) {
          setAddressLabel(combined);
        }
      }
    } catch {
      // Ignore reverse-geocode errors gracefully
    }
  }, []);

  /** Records a fresh fix and, when there's a prior one far enough away to
      trust, computes the real bearing between them — see this file's own
      top comment. One function so `refreshLocation`, the initial fix and
      the ongoing watcher below all update `heading` the exact same way. */
  const applyFix = useCallback((next: Coords) => {
    setLocation(next);
    const prev = lastFixRef.current;
    lastFixRef.current = next;
    if (prev && metresBetween(prev, next) >= MIN_BEARING_MOVE_METRES) {
      hasBearingRef.current = true;
      setHeading(bearingBetween(prev, next));
    }
    // Not enough movement to trust a bearing from this fix (or no prior
    // fix yet to measure from) — leave `heading` exactly as it was.
  }, []);

  /**
   * Explicitly requests fresh real GPS coordinates directly from handset hardware.
   */
  const refreshLocation = useCallback(async (): Promise<Coords | null> => {
    setFetching(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPermissionDenied(true);
        setFetching(false);
        return null;
      }
      setPermissionDenied(false);

      const fresh = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords: Coords = {
        lat: fresh.coords.latitude,
        lng: fresh.coords.longitude,
      };

      applyFix(coords);

      void updateAddressLabel(coords.lat, coords.lng);
      setFetching(false);
      return coords;
    } catch (err) {
      console.warn("[location] refreshLocation failed:", (err as Error).message);
      setFetching(false);
      return null;
    }
  }, [applyFix, updateAddressLabel]);

  useEffect(() => {
    let positionSub: Location.LocationSubscription | null = null;
    let headingSub: Location.LocationSubscription | null = null;
    let cancelled = false;
    let asked = false;
    let starting = false;

    const start = async () => {
      if (cancelled || starting || positionSub) return;
      starting = true;
      try {
        const { status } = asked
          ? await Location.getForegroundPermissionsAsync()
          : await Location.requestForegroundPermissionsAsync();
        asked = true;
        if (cancelled) return;

        if (status !== "granted") {
          setPermissionDenied(true);
          return;
        }
        setPermissionDenied(false);

        try {
          const first = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          if (cancelled) return;
          const initialCoords = { lat: first.coords.latitude, lng: first.coords.longitude };
          /* Just seeds `lastFixRef` — nothing to compute a bearing FROM
             yet, so this never sets `heading`. The compass fills that gap
             below until a second fix arrives. */
          applyFix(initialCoords);
          void updateAddressLabel(initialCoords.lat, initialCoords.lng);
        } catch {
          // Silent fallback on initial fix
        }

        if (cancelled) return;

        try {
          positionSub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
            (next) => {
              applyFix({ lat: next.coords.latitude, lng: next.coords.longitude });
            },
          );
          if (cancelled) {
            positionSub.remove();
            positionSub = null;
            return;
          }
        } catch (err) {
          console.warn("[location] position watch failed:", (err as Error).message);
        }

        if (headingSub || cancelled) return;
        try {
          headingSub = await Location.watchHeadingAsync((data) => {
            /* A real, movement-derived bearing permanently retires the
               compass once one has ever been established — see this
               file's own top comment for why a phone's own orientation is
               the wrong signal for "which way is the vehicle moving" once
               an actual travelled direction exists to prefer instead. */
            if (hasBearingRef.current) return;
            const value = data.trueHeading >= 0 ? data.trueHeading : data.magHeading;
            if (typeof value === "number" && !Number.isNaN(value)) setHeading(value);
          });
          if (cancelled) {
            headingSub.remove();
            headingSub = null;
          }
        } catch {
          // Compass unavailable fallback
        }
      } finally {
        starting = false;
      }
    };

    void start();

    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next === "active") void start();
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      positionSub?.remove();
      headingSub?.remove();
    };
  }, [applyFix, updateAddressLabel]);

  return { location, heading, permissionDenied, addressLabel, fetching, refreshLocation };
}
