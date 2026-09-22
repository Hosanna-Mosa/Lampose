/* ══════════════════════════════════════════════════════════════════════════
   "Use my location", in a browser.

   The crosshair on the address form. One foreground fix, reverse-geocoded
   into the boxes somebody would otherwise type.

   ## The pin is the answer; the words are a bonus

   A fix always yields COORDINATES. Naming them is the half that can come back
   with nothing — a laptop located from its network sits a kilometre away with
   no street, and a rural pin gives a district. So the two are reported
   separately: `location` is what was measured, `fields` is what could be
   named, and a caller keeps the pin whatever the geocoder said. An address
   with a pin and no street is still useful to a rider's map.

   ## Why Nominatim and not Google

   The same reason the apps use the platform geocoder: no key, no billing, no
   credential in source. OpenStreetMap's reverse endpoint is already what the
   food partner's `LocationPicker` uses on this site, so the website has one
   answer to "what is at this point" rather than two. It is best-effort by
   design — every failure here is a successful fix with empty `fields`.

   ## Nothing is stored and nothing is watched

   One `getCurrentPosition`, on a click. No watcher, no background permission.
   ══════════════════════════════════════════════════════════════════════════ */

/** Thrown when there is no fix to be had — permission, hardware, or a timeout. */
export class LocationRefused extends Error {
  constructor(message) {
    super(message);
    this.name = 'LocationRefused';
  }
}

const first = (...parts) => parts.map(p => String(p || '').trim()).find(Boolean) || '';

/** Joined, trimmed, and de-duplicated — OSM often repeats a name as the road. */
const join = (...parts) => parts
  .map(p => String(p || '').trim())
  .filter(Boolean)
  .filter((part, i, all) => all.indexOf(part) === i)
  .join(', ');

/** Nominatim's fields, mapped onto the ones the address form asks for. */
const fieldsFromOsm = (data) => {
  const a = (data && data.address) || null;
  if (!a) return null;

  const fields = {
    /* The door, as best it can be named: a house number and a road. The flat
       or room number is the part no geocoder knows, which is why the form
       says to add it. */
    line1: join(a.house_number, a.road || a.pedestrian || a.residential),
    landmark: first(a.amenity, a.building, a.shop, a.neighbourhood, a.suburb),
    city: first(a.city, a.town, a.village, a.municipality, a.county),
    state: first(a.state),
    pincode: first(a.postcode),
  };

  return Object.values(fields).some(Boolean) ? fields : null;
};

const EMPTY = {
  line1: '', landmark: '', city: '', state: '', pincode: '',
};

/** The browser's own reason, in a sentence worth showing. */
const refusal = (error) => {
  if (error && error.code === 1) {
    return 'Location is blocked for this site. Allow it in your browser, or type the address instead.';
  }
  if (error && error.code === 3) {
    return 'That took too long. Try again, or type the address instead.';
  }
  return 'We could not get your location. Type the address instead — it works just as well.';
};

/**
 * Ask, measure, and name.
 *
 * Resolves `{ location, fields, namedNothing }`. Throws `LocationRefused` —
 * and only that — when there is no fix at all.
 */
export async function locateMe() {
  if (!navigator.geolocation) {
    throw new LocationRefused('This browser cannot share a location. Type the address instead.');
  }

  const fix = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      error => reject(new LocationRefused(refusal(error))),
      /* A minute-old fix is fine for filling a form and saves a cold start;
         a form being filled in does not need a fresh satellite lock. */
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });

  const location = { lat: fix.coords.latitude, lng: fix.coords.longitude };

  let fields = null;
  try {
    const res = await fetch(
      'https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1'
      + `&lat=${location.lat}&lon=${location.lng}`,
      { headers: { Accept: 'application/json' } },
    );
    fields = fieldsFromOsm(await res.json());
  } catch {
    /* No geocoder, no network, a rate limit. The pin still stands. */
    fields = null;
  }

  return {
    location,
    fields: fields || EMPTY,
    namedNothing: !fields,
  };
}

export default locateMe;
