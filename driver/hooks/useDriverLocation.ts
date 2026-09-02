import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

export type Coords = { lat: number; lng: number };

/**
 * Watches GPS position and compass heading.
 *
 * Reporting is deliberately NOT done here. There are two different reports and
 * they go to different places for different reasons:
 *
 *   `PATCH /me/location`   the fix the DISPATCHER matches on. Validated, rate
 *                          limited, and the thing that decides whether this
 *                          rider is offered work at all.
 *   `driver_location`      a relay over the socket that moves the marker on
 *                          the diner's tracking map, for one order.
 *
 * A hook that did both would have to know about duty state and the job in
 * hand, which is the store's business. So this returns coordinates and the
 * screens decide what to do with them.
 *
 * ## `location` is null until the device measures one, and stays null
 *
 * This used to fall back to Bangalore city centre whenever the permission was
 * refused or the first fix failed, and the home screen PATCHes whatever it
 * holds to `/me/location` every fifteen seconds. So a rider who declined the
 * permission was advertised to the dispatcher as standing in the middle of a
 * city Lampose does not even operate in, matched against restaurants 700km
 * away, and offered work they could not reach — while their own screen said
 * "waiting for orders" the whole time. A guessed position is worse than none:
 * no position takes the rider out of every search, which is true and visible,
 * and `permissionDenied` is what the home screen turns into a sentence about
 * it.
 *
 * ## The permission is asked once, but CHECKED every time the app comes back
 *
 * Refusing the permission used to be terminal for the life of the process.
 * The check ran inside a mount-once effect and returned before any watch was
 * established, so the rider read the "Location is off" notice, tapped "Open
 * location settings", granted "While using the app", and came back to an app
 * that neither iOS nor Android restarts on a grant — nothing re-ran the check,
 * no watch was ever started, `location` stayed null for the rest of the
 * session and the notice stayed on screen accusing a handset that was by then
 * perfectly willing to answer. The remedy the screen offers has to be a remedy.
 *
 * So starting up is a function rather than a one-shot, and it runs again on
 * every return to the foreground. It is idempotent — a live position watch
 * makes it a no-op — so the ordinary case of pocketing the phone between the
 * gate and the counter costs nothing, and the one case that matters, coming
 * back from Settings having just granted, starts the watch that should have
 * been running all along. The prompt itself is only raised the first time:
 * afterwards the state is READ, because a rider who has already answered must
 * not be asked again every time they switch apps.
 */
export function useDriverLocation() {
  const [location, setLocation] = useState<Coords | null>(null);
  /*
   * Null until a compass reading actually arrives, NOT 0.
   *
   * Zero is a real bearing — due north — so defaulting to it means every
   * handset without a magnetometer reports "facing north" forever, and the
   * rider marker on both maps points up regardless of where they are going.
   * Null lets the map fall back to pointing along the leg, which is a guess
   * that is usually right instead of one that is usually wrong.
   */
  const [heading, setHeading] = useState<number | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Manual override lets the dev simulator drive the marker.
  const overrideRef = useRef<Coords | null>(null);

  useEffect(() => {
    let positionSub: Location.LocationSubscription | null = null;
    let headingSub: Location.LocationSubscription | null = null;
    let cancelled = false;
    /* The OS prompt is a once-per-install event. After it has been raised, the
       answer is read rather than asked for again — on iOS a second request
       resolves silently with the standing answer, and on Android a rider who
       chose "Don't ask again" would be sent round the same dead loop. */
    let asked = false;
    /* Two "active" events in quick succession, or one arriving while the first
       attempt is still awaiting the OS, would otherwise open a second watch on
       top of the first and leave it running after unmount. */
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
          setLocation({ lat: first.coords.latitude, lng: first.coords.longitude });
          if (typeof first.coords.heading === "number" && first.coords.heading >= 0) {
            setHeading(first.coords.heading);
          }
        } catch {
          /* One failed fix is ordinary — indoors, at a basement counter, in the
             first seconds after a cold start. The watch below is still set up,
             so the next fix that does arrive fills this in; until then there is
             no position and nothing is reported. */
        }

        if (cancelled) return;

        try {
          positionSub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 5 },
            (next) => {
              if (overrideRef.current) return;
              setLocation({ lat: next.coords.latitude, lng: next.coords.longitude });
            },
          );
          /* Unmounted while the watch was being opened. Nothing else will ever
             remove this one, so it is removed here. */
          if (cancelled) {
            positionSub.remove();
            positionSub = null;
            return;
          }
        } catch (err) {
          /* Left null deliberately: the next return to the foreground tries
             again rather than treating one refusal as permanent. */
          console.warn("[location] position watch failed:", (err as Error).message);
        }

        if (headingSub || cancelled) return;
        try {
          headingSub = await Location.watchHeadingAsync((data) => {
            if (overrideRef.current) return;
            const value = data.trueHeading >= 0 ? data.trueHeading : data.magHeading;
            if (typeof value === "number" && !Number.isNaN(value)) setHeading(value);
          });
          if (cancelled) {
            headingSub.remove();
            headingSub = null;
          }
        } catch {
          // Compass isn't available on every device — the marker just won't rotate.
        }
      } finally {
        starting = false;
      }
    };

    void start();

    /*
      The one moment worth re-checking on.

      Granting a permission from the Settings app does not restart this process
      — the rider simply switches back — so "active" is the only signal the app
      gets that the answer it was given may no longer be the answer. Nothing
      else here is a poll: with the watch running this handler returns on its
      first line.
    */
    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next === "active") void start();
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      positionSub?.remove();
      headingSub?.remove();
    };
  }, []);

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
