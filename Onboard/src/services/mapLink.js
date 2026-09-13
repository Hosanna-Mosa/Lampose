/**
 * One address box, and the map link an agent may have pasted into it.
 *
 * ## One field on the form, three things in the database
 *
 * The form asks for the address ONCE — a second box asking for the same place
 * in a different notation is a box most people leave blank. What goes in it
 * may be words, a pasted link, or both, and the crosshair beside it may add a
 * pin. Those are stored apart (`address`, `mapLink`, `location`) because they
 * are read by different people: the words are printed to a student where the
 * door number belongs, and the link is what a verifier taps before driving
 * there. `splitAddress` at the bottom is where the one box becomes the three.
 *
 * ## A link and a pin are not the same answer
 *
 *   · A full Google Maps URL carries coordinates in its path or query, so a
 *     paste yields BOTH the link and a pin.
 *   · A SHORT link (`maps.app.goo.gl/xyz`) carries nothing readable — the
 *     coordinates are behind a redirect this page is not allowed to follow,
 *     because the browser will not let it read a cross-origin response. That
 *     is a perfectly good link with no pin, and it is still worth storing:
 *     whoever opens it lands on the right doorway.
 *   · The crosshair yields a pin and no link, so one is written for it.
 *
 * None of the three is required, and any combination of them is a real
 * answer — the same split the mobile apps make between what reverse geocoding
 * returned and what the GPS returned.
 *
 * ## Order
 *
 * Everything in and out of THIS file is `{ lat, lng }`, which is what a
 * device's geolocation API hands back and what the backend accepts. Mongo
 * stores it flipped to `[lng, lat]`; that flip happens once, on the server,
 * so nothing on this side has to remember it.
 */

/** Rejects a transposed pair here rather than putting a marker in the sea. */
const inRange = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng)
  && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/*
 * Where the coordinates hide in the links people actually paste. Latitude is
 * the first group in every one of them.
 *
 *   /maps/@12.9716,77.5946,17z            the map's centre
 *   ?q= / ?ll= / ?query= / ?daddr=        a marker or a destination
 *   !3d12.9716!4d77.5946                  a /place/ URL's own encoding, which
 *                                         is the ONLY pin in a place link —
 *                                         its @ centre can be miles off
 *   12.9716, 77.5946                      pasted out of the "copy coordinates"
 *                                         menu item, which is not a URL at all
 */
const PIN_PATTERNS = [
  /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
  /@(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
  /[?&](?:q|ll|query|daddr|saddr|sll|center|destination)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/i,
  /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/,
];

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * The pin inside a pasted link, or null when there isn't one to read.
 *
 * Null is not a failure. A short link and a plain `/place/Some+Hostel` URL
 * both legitimately return null, and the caller stores the link anyway.
 *
 * @param {string} value
 * @returns {{lat: number, lng: number} | null}
 */
const parsePin = (value) => {
  const raw = text(value);
  if (!raw) return null;

  for (const pattern of PIN_PATTERNS) {
    const match = raw.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (inRange(lat, lng)) return { lat, lng };
  }
  return null;
};

/** A link whose coordinates are behind a redirect we cannot follow from here. */
export const isShortMapLink = (value) =>
  /^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.[a-z.]+\/\?cid=)/i.test(text(value));

/** Six decimals is about 11cm — past that is noise from the GPS, not detail. */
const round = (value) => Number(Number(value).toFixed(6));

/**
 * The link written FOR a pin the browser gave us.
 *
 * `?q=lat,lng` rather than a `/place/` URL because it is the form every map
 * app understands: Google opens it, and on a phone the share sheet hands it
 * to whatever else is installed.
 */
const mapLinkForPin = (pin) => {
  if (!pin || !inRange(Number(pin.lat), Number(pin.lng))) return '';
  return `https://www.google.com/maps?q=${round(pin.lat)},${round(pin.lng)}`;
};

/** `{lat, lng}` from anything, or null. Trims the precision as it goes. */
export const readPin = (pin) => {
  if (!pin) return null;
  const lat = Number(pin.lat ?? pin.latitude);
  const lng = Number(pin.lng ?? pin.longitude);
  return inRange(lat, lng) ? { lat: round(lat), lng: round(lng) } : null;
};

/** For the screen: "12.971599, 77.594566". */
export const formatPin = (pin) => {
  const read = readPin(pin);
  return read ? `${read.lat.toFixed(6)}, ${read.lng.toFixed(6)}` : '';
};

/*
 * A map link sitting inside an address, and how to get it out again.
 *
 * There is ONE box on the form — "Complete Street Address" — and an agent may
 * put words in it, a pasted link, or both. That is the right number of boxes:
 * a second one asking for the same place in a different notation is a field
 * most people leave blank.
 *
 * It does mean the two have to be told apart before they are stored, because
 * they are read by different things. `address` is printed to a student as the
 * street address; `mapLink` is what a verifier taps before driving there. A
 * URL left sitting in `address` shows up on the public site where the door
 * number should be.
 *
 * A URL is taken from anywhere in the text. Bare coordinates are only taken
 * when they are the WHOLE text or sit at the very end with at least three
 * decimal places — "42, 1st Cross Road" is full of numbers and commas, and
 * mistaking a door number for a pin is worse than missing a pin.
 */
const URL_IN_TEXT = /https?:\/\/\S+/i;
const TRAILING_COORDS = /(?:^|[,\s])(-?\d{1,3}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})\s*$/;

/** Commas and dashes left dangling once the link is lifted out. */
const tidy = (value) => value
  .replace(/\s+/g, ' ')
  .replace(/(?:^|\s)[,\-–—]+(?=\s|$)/g, ' ')
  .replace(/\s*,\s*,\s*/g, ', ')
  .replace(/^[\s,\-–—]+|[\s,\-–—]+$/g, '')
  .trim();

/**
 * One typed line, split into the things that get stored.
 *
 * Returns `{ address, mapLink, pin }` — the words with the link lifted out,
 * the link itself, and the pin if one could be read from it. Any of the three
 * may be empty, and all the combinations are real: words only, a link only
 * (someone who pasted and moved on), or both.
 *
 * Never rewrites the link. What the agent pasted is what opens for whoever
 * taps it, and a `/place/` URL names the building in a way `?q=lat,lng`
 * cannot.
 */
export const splitAddress = (value) => {
  const raw = text(value);
  if (!raw) return { address: '', mapLink: '', pin: null };

  const url = raw.match(URL_IN_TEXT);
  if (url) {
    return {
      address: tidy(raw.replace(url[0], ' ')),
      mapLink: url[0],
      pin: parsePin(url[0]),
    };
  }

  const coords = raw.match(TRAILING_COORDS);
  if (coords) {
    const pin = readPin({ lat: coords[1], lng: coords[2] });
    if (pin) {
      return {
        /* The matched text may start at a comma or space that belongs to the
           address, so it is cut by index rather than replaced by value. */
        address: tidy(raw.slice(0, coords.index)),
        mapLink: mapLinkForPin(pin),
        pin,
      };
    }
  }

  return { address: raw, mapLink: '', pin: null };
};

/**
 * Why the browser could not take a fix, in a sentence that says what to do.
 *
 * The codes are the W3C ones. The message matters more here than elsewhere in
 * this form: the fix is usually made outside the page — in the browser's own
 * permission prompt, or by walking to a window — so "Location unavailable"
 * leaves an agent with nothing to try.
 */
export const geoErrorMessage = (error) => {
  switch (error && error.code) {
    case 1: // PERMISSION_DENIED
      return 'This browser blocked location. Allow it for this site in the padlock menu, then try again — or paste the link instead.';
    case 2: // POSITION_UNAVAILABLE
      return 'No fix right now — indoors it can take a moment. Try again near a window, or paste the link instead.';
    case 3: // TIMEOUT
      return 'Locating took too long. Try again, or paste the link instead.';
    default:
      return 'Could not read a location from this device. Paste the link instead.';
  }
};
