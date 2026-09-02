/* ══════════════════════════════════════════════════════════════════════════
   "Use my location" — one fix, turned into address fields.

   The crosshair on every address form. Tapping it asks for permission, takes a
   single position, and reverse-geocodes it into the boxes somebody would
   otherwise type.

   ## No API key, and that is why it is `expo-location` rather than Google

   `reverseGeocodeAsync` goes to the PLATFORM geocoder — CoreLocation on iOS,
   Android's own `Geocoder` — not to a web service. It needs no key, no billing
   account and no network call we pay for, which matters because this codebase
   has no Google Maps key configured anywhere and its stated rule is that no
   credential is hardcoded in source. Google's Geocoding API would be more
   consistent across devices and is the seam to swap in if that ever changes.

   ## The pin is the answer; the words are a bonus

   A fix always yields COORDINATES. Reverse geocoding is what can fail — an
   Android device without Play services returns nothing, a rural pin returns a
   district and no street, and a moving phone returns the road it is on rather
   than the building. So the two are reported separately: `location` is what
   was measured and `fields` is what could be named. A caller fills what it got
   and keeps the pin regardless, because the pin is the part a rider's map and
   `zones/check` actually use.

   ## Foreground, once, on a tap

   No watcher, no background permission, nothing stored. `Balanced` accuracy
   rather than `High`: filling an address form does not need the extra seconds
   and battery that a metre of precision costs, and a building is not a metre
   wide.
   ══════════════════════════════════════════════════════════════════════════ */
import * as Location from 'expo-location';

export type LocatedAddress = {
  /** Always present on success — the measured fix. */
  location: { lat: number; lng: number };
  /**
   * What the platform geocoder could name. Every field may be empty: a pin in
   * a field returns a district and nothing else, and that is a real answer
   * rather than a failure.
   */
  fields: {
    line1: string;
    landmark: string;
    city: string;
    state: string;
    pincode: string;
  };
  /** True when the geocoder gave nothing back, so a caller can say so. */
  namedNothing: boolean;
};

export class LocationRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocationRefused';
  }
}

const clean = (...parts: (string | null | undefined)[]) =>
  parts
    .map((p) => (p || '').trim())
    .filter(Boolean)
    /* De-duplicated: Android frequently returns `name` and `street` as the
       same string, and "Danavaipeta, Danavaipeta" is worse than either. */
    .filter((part, i, all) => all.indexOf(part) === i)
    .join(', ');

/**
 * Ask, measure, and name.
 *
 * Throws `LocationRefused` with a sentence worth showing when the person says
 * no or the device cannot get a fix. Every other failure — a geocoder that
 * returns nothing — comes back as a successful result with empty `fields`,
 * because the pin alone is still worth having.
 */
export async function locateMe(): Promise<LocatedAddress> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new LocationRefused(
      'Location permission is off. Turn it on in Settings, or type the address instead.',
    );
  }

  let fix: Location.LocationObject;
  try {
    fix = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
  } catch {
    throw new LocationRefused(
      'We could not get a fix. Move somewhere with a clearer view of the sky, or type the address.',
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
    /* A device with no geocoder. The pin still stands — see the header. */
    named = [];
  }

  const first = named[0];
  if (!first) {
    return {
      location,
      fields: { line1: '', landmark: '', city: '', state: '', pincode: '' },
      namedNothing: true,
    };
  }

  return {
    location,
    fields: {
      /* The door, as closely as the platform will say it. `name` is usually
         the building or house number and `street` the road. */
      line1: clean(first.name, first.street),
      /* `district` is the neighbourhood on Android; iOS puts it in
         `subregion`. Whichever came back is the landmark a rider recognises. */
      landmark: clean(first.district || first.subregion),
      city: (first.city || first.subregion || '').trim(),
      state: (first.region || '').trim(),
      pincode: (first.postalCode || '').trim(),
    },
    namedNothing: false,
  };
}
