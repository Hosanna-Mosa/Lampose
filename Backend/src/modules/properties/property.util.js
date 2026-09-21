/* ══════════════════════════════════════════════════════════════════════════
   Where a property is, as the two write paths accept it.

   A listing has had a `place` (an area) and an `address` (words) since the
   beginning. Neither of them opens a map. What an agent standing outside a
   building can actually give us is one or both of:

     mapLink   the link their phone's share sheet produced — a full Google
               Maps URL, a short `maps.app.goo.gl` one, Apple Maps, anything.
               Stored as pasted, because what opens for the student who taps
               it is the point of it.
     location  a pin, taken by the browser's own geolocation. GeoJSON, so the
               same `$geoIntersects` and `$near` queries the delivery and the
               dispatcher already run work against it later.

   THEY ARE INDEPENDENT, and both optional. A short link carries no readable
   coordinates (they are behind a redirect a browser is not allowed to
   follow), and a pin taken at the doorway has no link until one is written
   for it. Requiring the pair would mean refusing most of what agents can
   actually supply — see Onboard/src/services/mapLink.js, which makes the same
   split on the other side.

   `[longitude, latitude]`, MongoDB's order, and the flip from the `{lat, lng}`
   a device hands back happens HERE — once, on the way in — so nothing
   downstream has to remember which way round it is. Getting it backwards does
   not throw; it puts the property in the Arctic Ocean.
   ══════════════════════════════════════════════════════════════════════════ */

/** Trimmed, and capped so a pasted page of text cannot become a link. */
const readMapLink = (value) => String(value === undefined || value === null ? '' : value)
  .trim()
  .slice(0, 500);

/**
 * A pin from whatever the client sent, or `undefined` when there isn't one.
 *
 * `undefined` rather than null: the field is optional GeoJSON, and a null
 * would have to be special-cased by every reader to avoid being taken for a
 * point with no coordinates.
 *
 * Accepts `{lat, lng}` (what a device returns and what both the apps and the
 * onboarding form send) and a `[lng, lat]` pair (what comes back out of
 * Mongo, so a document can be round-tripped through an edit). Anything out of
 * range is dropped rather than refused — the location is optional, and losing
 * a whole submission over a bad pin would cost a listing an agent filled in
 * standing in somebody's doorway.
 */
const readPin = (value) => {
  if (!value) return undefined;

  let lat;
  let lng;

  if (Array.isArray(value) && value.length === 2) {
    [lng, lat] = value.map(Number);
  } else if (Array.isArray(value.coordinates) && value.coordinates.length === 2) {
    [lng, lat] = value.coordinates.map(Number);
  } else {
    lat = Number(value.lat !== undefined ? value.lat : value.latitude);
    lng = Number(value.lng !== undefined ? value.lng : value.longitude);
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  /* [0, 0] is Null Island — the Gulf of Guinea. It is what an uninitialised
     pair looks like, never a Lampose property. */
  if (lat === 0 && lng === 0) return undefined;

  return { type: 'Point', coordinates: [lng, lat] };
};

module.exports = { readMapLink, readPin };
