/* ══════════════════════════════════════════════════════════════════════════
   "Use my location" — one fix, turned into address fields.

   The crosshair on the Edit profile form, where an owner gives their own
   address. One measurement, taken because somebody pressed a button — nothing
   here watches, stores or reports a position, and the permission asked for is
   foreground only.

   ## No API key

   `reverseGeocodeAsync` goes to the PLATFORM geocoder — CoreLocation, or
   Android's own — not to a web service. No key, no billing, no network call we
   pay for, which matters because nothing in this repo has a Google Maps key
   configured and the rule here is that no credential lives in source.

   ## The pin is the answer; the words are a bonus

   A fix always yields coordinates. Reverse geocoding is the half that fails —
   a device without Play services returns nothing, a rural pin returns a
   district and no street. So the two are reported separately and a caller
   keeps the pin whatever the geocoder managed to name.
   ══════════════════════════════════════════════════════════════════════════ */
import * as Location from "expo-location";

export type LocatedAddress = {
  location: { lat: number; lng: number };
  fields: { line1: string; landmark: string; city: string; state: string; pincode: string };
  /** True when the geocoder named nothing, so a caller can say so. */
  namedNothing: boolean;
};

export class LocationRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationRefused";
  }
}

const clean = (...parts: (string | null | undefined)[]) =>
  parts
    .map((p) => (p || "").trim())
    .filter(Boolean)
    /* Android often returns `name` and `street` as the same string, and
       "Danavaipeta, Danavaipeta" is worse than either. */
    .filter((part, i, all) => all.indexOf(part) === i)
    .join(", ");

export async function locateMe(): Promise<LocatedAddress> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new LocationRefused(
      "Location permission is off. Turn it on in Settings, or type the address instead.",
    );
  }

  let fix: Location.LocationObject;
  try {
    fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    throw new LocationRefused(
      "We could not get a fix. Move somewhere more open, or type the address.",
    );
  }

  const location = { lat: fix.coords.latitude, lng: fix.coords.longitude };

  let named: Location.LocationGeocodedAddress[] = [];
  try {
    named = await Location.reverseGeocodeAsync({
      latitude: location.lat,
      longitude: location.lng,
    });
  } catch {
    named = [];
  }

  const first = named[0];
  if (!first) {
    return {
      location,
      fields: { line1: "", landmark: "", city: "", state: "", pincode: "" },
      namedNothing: true,
    };
  }

  return {
    location,
    fields: {
      line1: clean(first.name, first.street),
      landmark: clean(first.district || first.subregion),
      city: (first.city || first.subregion || "").trim(),
      state: (first.region || "").trim(),
      pincode: (first.postalCode || "").trim(),
    },
    namedNothing: false,
  };
}
