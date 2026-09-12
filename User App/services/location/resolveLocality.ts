/* ══════════════════════════════════════════════════════════════════════════
   A GPS fix, turned into one of the areas we actually cover.

   ## Why this is a string match and not a distance

   The obvious way to answer "which of these areas am I in" is to measure the
   distance from the fix to each one and take the nearest. That is not
   available here: `GET /api/v2/listings/meta` derives its localities from the
   `place` field on the properties collection, and nothing in that collection
   stores a latitude or a longitude. There is no coordinate to measure
   against. `places.adapter.ts` says the same thing about `guessLocality`,
   which is why that function guesses the BUSIEST area rather than the closest
   one.

   So the fix is turned into words by the platform geocoder — the same
   `locateMe` every address form uses, no API key, no billing — and the words
   are matched against the names we have. That is a weaker answer than a
   distance and it is stated as one: the row reports what it matched, and
   choosing it is still a tap the student makes.

   ## What it matches, in order

   The geocoder gives back a street, a district or sub-locality, a city and a
   state, and which of those carries the neighbourhood name varies by device
   and by country. So all of them are searched, most specific first:

     1. a locality NAME appearing anywhere in the geocoded text — this is the
        hit that matters, because "Gachibowli" is what the panel recorded and
        "Gachibowli" is what Android puts in `district`
     2. one of that locality's search ALIASES, so "HSR Layout Sector 1" is
        found by a device that only said "HSR Layout"
     3. failing both, the CITY — which is a real answer worth offering
        ("we cover Hyderabad, but not your block") and is marked as the weaker
        match it is, so the caller can word it differently

   Ties are broken by listing count, matching `guessLocality`: between two
   plausible areas, the one with more in it is the more useful landing place.
   ══════════════════════════════════════════════════════════════════════════ */
import type { Locality } from '@/types/auth';
import { locateMe, type LocatedAddress } from './useMyLocation';

/** How confident the match is, so the caller can say so honestly. */
export type LocalityMatch =
  /** A named area we cover in the catalogue, matched via proximity or name. */
  | { kind: 'area'; locality: Locality; placeLabel: string }
  /**
   * The user's genuine original location detected from GPS, preserved as an
   * authentic Locality even when not directly in the catalogue.
   */
  | { kind: 'original'; locality: Locality; placeLabel: string }
  /** We cover the city, but only city level was identified. */
  | { kind: 'city'; locality: Locality; placeLabel: string }
  /** A fix, and nothing could be named. */
  | { kind: 'none'; placeLabel: string };

/** Lower-cased, collapsed whitespace. Comparison form, never display form. */
const norm = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Centroid coordinates for catalogue localities.
 * Allows instant GPS proximity matching rather than relying solely on geocoder text.
 */
const KNOWN_LOCALITY_COORDS: Record<string, { lat: number; lng: number }> = {
  // Hyderabad
  'gachibowli': { lat: 17.4401, lng: 78.3489 },
  'gachibowli outer ring road': { lat: 17.4350, lng: 78.3450 },
  'financial district': { lat: 17.4156, lng: 78.3425 },
  'nanakramguda': { lat: 17.4180, lng: 78.3510 },
  'hitec city': { lat: 17.4435, lng: 78.3772 },
  'madhapur': { lat: 17.4483, lng: 78.3915 },
  'madhapur 100ft road': { lat: 17.4490, lng: 78.3920 },
  'kondapur': { lat: 17.4699, lng: 78.3578 },
  'near rto kondapur': { lat: 17.4650, lng: 78.3620 },
  'kphb': { lat: 17.4938, lng: 78.3995 },
  'kphb colony': { lat: 17.4950, lng: 78.4010 },
  'kphb road no. 1': { lat: 17.4920, lng: 78.3980 },
  'kphb roadno:1 behind karur vysya bank': { lat: 17.4925, lng: 78.3985 },
  'kphb 6th phase nera nexus mall': { lat: 17.4870, lng: 78.3910 },
  'kukatpally': { lat: 17.4849, lng: 78.4138 },
  'jubilee hills': { lat: 17.4319, lng: 78.4073 },
  'jubilee hills road 45': { lat: 17.4340, lng: 78.4060 },
  'banjara hills': { lat: 17.4156, lng: 78.4350 },
  'ameerpet': { lat: 17.4375, lng: 78.4482 },
  'sr nagar': { lat: 17.4430, lng: 78.4440 },
  'bk guda park , sr nager': { lat: 17.4445, lng: 78.4460 },
  'koti': { lat: 17.3850, lng: 78.4867 },
  'shamshabad': { lat: 17.2403, lng: 78.4294 },
  'quthbullapur': { lat: 17.5025, lng: 78.4682 },
  'chinthal ganesh nagar': { lat: 17.5120, lng: 78.4550 },

  // Bangalore
  'hsr layout': { lat: 12.9121, lng: 77.6446 },
  'hsr layout sector 1': { lat: 12.9160, lng: 77.6520 },
  'hsr layout sector 3': { lat: 12.9110, lng: 77.6390 },
  'hsr layout sector 6': { lat: 12.9050, lng: 77.6380 },
  'koramangala': { lat: 12.9352, lng: 77.6245 },
  'koramangala 1st block': { lat: 12.9270, lng: 77.6320 },
  'koramangala 3rd block': { lat: 12.9300, lng: 77.6250 },
  'koramangala 7th block': { lat: 12.9360, lng: 77.6140 },
  'whitefield': { lat: 12.9698, lng: 77.7500 },
  'itpl main road': { lat: 12.9863, lng: 77.7338 },
  'phase 2 neeladri road': { lat: 12.8450, lng: 77.6620 },
  'mg road': { lat: 12.9756, lng: 77.6066 },

  // Visakhapatnam
  'mvp colony': { lat: 17.7447, lng: 83.3342 },
  'girijan bhavan, back building, sector 4, sector 5, mvp colony, andhra pradesh 530017': { lat: 17.7447, lng: 83.3342 },

  // Chennai
  't. nagar': { lat: 13.0418, lng: 80.2341 },
  'velachery': { lat: 12.9815, lng: 80.2180 },

  // Pune
  'viman nagar': { lat: 18.5679, lng: 73.9143 },
};

/** Common market aliases and neighborhood equivalents */
const AREA_SYNONYMS: Record<string, string[]> = {
  kukatpally: ['kphb', 'kphb colony', 'kukatpally', 'jntu'],
  kphb: ['kphb', 'kphb colony', 'kukatpally', 'jntu'],
  'kphb colony': ['kphb', 'kphb colony', 'kukatpally', 'jntu'],
  madhapur: ['madhapur', 'hitec city', 'cyber towers', 'ayyappa society', 'kavuri hills', '100ft road'],
  'hitec city': ['hitec city', 'cyber towers', 'madhapur', 'mindspace', 'cyber gateway'],
  gachibowli: ['gachibowli', 'iiit', 'dlf', 'telecom nagar', 'gachibowli stadium'],
  kondapur: ['kondapur', 'botanical garden', 'kothaguda', 'hafeezpet', 'rto kondapur'],
  'financial district': ['financial district', 'nanakramguda', 'waverock', 'isb'],
  nanakramguda: ['nanakramguda', 'financial district', 'waverock'],
  ameerpet: ['ameerpet', 'sr nagar', 'sanjeeva reddy nagar', 'maitrivanam', 'bk guda'],
  'sr nagar': ['sr nagar', 'ameerpet', 'bk guda'],
  'jubilee hills': ['jubilee hills', 'film nagar', 'road no 36', 'road no 45'],
  'banjara hills': ['banjara hills', 'road no 1', 'road no 12', 'panjagutta'],
};

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Everything the geocoder named, as one haystack.
 */
const haystackOf = (found: LocatedAddress): string =>
  norm(
    [
      found.fields.area,
      found.fields.line1,
      found.fields.landmark,
      found.fields.city,
      found.fields.state,
      found.fields.formattedAddress,
    ]
      .filter(Boolean)
      .join(' · '),
  );

/** What to call the spot on screen. */
const labelOf = (found: LocatedAddress): string => {
  const parts = [found.fields.area || found.fields.landmark, found.fields.city]
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .filter((part, i, all) => all.indexOf(part) === i);
  if (parts.length) return parts.join(', ');
  return `${found.location.lat.toFixed(3)}, ${found.location.lng.toFixed(3)}`;
};

/** Between two candidates, the one with more listings. Ties keep the first. */
const busier = (a: Locality, b: Locality): Locality => (b.listingCount > a.listingCount ? b : a);

/**
 * Match an already-measured fix against a list of areas.
 */
export function matchLocality(
  found: LocatedAddress,
  localities: readonly Locality[],
): LocalityMatch {
  const placeLabel = labelOf(found);
  const haystack = haystackOf(found);

  if (!haystack && !found.fields.area && !found.fields.city) {
    return { kind: 'none', placeLabel };
  }

  // 1. Exact or substring matching by locality name & aliases (High confidence)
  let byName: Locality | null = null;
  let byAlias: Locality | null = null;

  for (const locality of localities) {
    const name = norm(locality.name);
    if (name && new RegExp(`(^|[^a-z0-9])${escapeRe(name)}([^a-z0-9]|$)`).test(haystack)) {
      byName = byName ? busier(byName, locality) : locality;
      continue;
    }

    // Check alias list from the adapter
    const alias = (locality.aliases ?? []).find(
      (candidate) =>
        norm(candidate).length > 2
        && new RegExp(`(^|[^a-z0-9])${escapeRe(norm(candidate))}([^a-z0-9]|$)`).test(haystack),
    );
    if (alias) {
      byAlias = byAlias ? busier(byAlias, locality) : locality;
      continue;
    }

    // Check custom synonym mapping
    const synonyms = AREA_SYNONYMS[name] ?? [];
    const matchedSynonym = synonyms.find((syn) =>
      new RegExp(`(^|[^a-z0-9])${escapeRe(syn)}([^a-z0-9]|$)`).test(haystack),
    );
    if (matchedSynonym) {
      byAlias = byAlias ? busier(byAlias, locality) : locality;
    }
  }

  if (byName) return { kind: 'area', locality: byName, placeLabel };
  if (byAlias) return { kind: 'area', locality: byAlias, placeLabel };

  // 2. Proximity matching by GPS coordinates:
  // If user coordinates are within a tight neighborhood radius (<= 2.5 km) of a known catalog locality
  if (found.location?.lat && found.location?.lng && localities.length > 0) {
    let nearestByCoords: { locality: Locality; dist: number } | null = null;
    for (const loc of localities) {
      const coords = KNOWN_LOCALITY_COORDS[norm(loc.name)];
      if (coords) {
        const dist = distanceKm(found.location.lat, found.location.lng, coords.lat, coords.lng);
        if (dist <= 2.5) {
          if (!nearestByCoords || dist < nearestByCoords.dist) {
            nearestByCoords = { locality: loc, dist };
          }
        }
      }
    }

    if (nearestByCoords) {
      return { kind: 'area', locality: nearestByCoords.locality, placeLabel };
    }
  }

  // 3. User's ORIGINAL location:
  // When the user's area is not directly in the catalogue (e.g. Kukatpally, Miyapur, Nizampet,
  // Ameerpet, Banjara Hills, Begumpet, Secunderabad, or any other area):
  // DO NOT fall back to Gachibowli! Return their genuine detected original location!
  const detectedArea = (found.fields.area || found.fields.landmark || '').trim();
  const detectedCity = (found.fields.city || '').trim();

  if (detectedArea || detectedCity) {
    const originalName = detectedArea || detectedCity || 'My Location';
    const originalCity = detectedCity || (detectedArea ? '' : 'Hyderabad');

    const originalLocality: Locality = {
      id: `loc-original-${slugify(originalName)}-${slugify(originalCity)}`,
      name: originalName,
      city: originalCity,
      listingCount: 0,
      medianRent: null,
    };

    return {
      kind: 'original',
      locality: originalLocality,
      placeLabel: [originalName, originalCity].filter(Boolean).join(', '),
    };
  }

  return { kind: 'none', placeLabel };
}

/** Regex-safe. Area names contain full stops and hyphens. */
function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ask for a fix and place it.
 *
 * Throws whatever `locateMe` throws — `LocationRefused` carries a sentence
 * worth showing, and the caller renders it rather than paraphrasing.
 */
export async function findMyLocality(
  localities: readonly Locality[],
): Promise<LocalityMatch> {
  return matchLocality(await locateMe(), localities);
}
