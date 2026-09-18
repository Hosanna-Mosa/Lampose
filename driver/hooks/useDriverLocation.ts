import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

export type Coords = { lat: number; lng: number };

/**
 * Watches GPS position and compass heading with explicit on-demand location refreshing & reverse geocoding.
 */
export function useDriverLocation() {
  const [location, setLocation] = useState<Coords | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [addressLabel, setAddressLabel] = useState<string>("");
  const [fetching, setFetching] = useState<boolean>(false);

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

      setLocation(coords);
      if (typeof fresh.coords.heading === "number" && fresh.coords.heading >= 0) {
        setHeading(fresh.coords.heading);
      }

      void updateAddressLabel(coords.lat, coords.lng);
      setFetching(false);
      return coords;
    } catch (err) {
      console.warn("[location] refreshLocation failed:", (err as Error).message);
      setFetching(false);
      return null;
    }
  }, [updateAddressLabel]);

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
          setLocation(initialCoords);
          void updateAddressLabel(initialCoords.lat, initialCoords.lng);

          if (typeof first.coords.heading === "number" && first.coords.heading >= 0) {
            setHeading(first.coords.heading);
          }
        } catch {
          // Silent fallback on initial fix
        }

        if (cancelled) return;

        try {
          positionSub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
            (next) => {
              const updatedCoords = { lat: next.coords.latitude, lng: next.coords.longitude };
              setLocation(updatedCoords);
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
  }, [updateAddressLabel]);

  return { location, heading, permissionDenied, addressLabel, fetching, refreshLocation };
}
