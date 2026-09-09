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
  /** A named area we cover, found in the geocoded text. */
  | { kind: 'area'; locality: Locality; placeLabel: string }
  /** We cover the city but could not place the block within it. */
  | { kind: 'city'; locality: Locality; placeLabel: string }
  /** A fix, and nothing in the catalogue near it. */
  | { kind: 'none'; placeLabel: string };

/** Lower-cased, collapsed whitespace. Comparison form, never display form. */
const norm = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Everything the geocoder named, as one haystack.
 *
 * Joined rather than searched field by field because the fields are not
 * consistent across platforms — iOS puts the neighbourhood in `subregion` and
 * Android in `district`, and `locateMe` has already folded both into
 * `landmark`. Searching the lot removes the need to care which one it landed
 * in.
 */
const haystackOf = (found: LocatedAddress): string =>
  norm([found.fields.line1, found.fields.landmark, found.fields.city, found.fields.state]
    .filter(Boolean)
    .join(' · '));

/** What to call the spot on screen. Falls back to the pin when unnamed. */
const labelOf = (found: LocatedAddress): string => {
  const named = [found.fields.landmark, found.fields.city].map((p) => p.trim()).filter(Boolean);
  if (named.length) return named.join(', ');
  return `${found.location.lat.toFixed(3)}, ${found.location.lng.toFixed(3)}`;
};

/** Between two candidates, the one with more listings. Ties keep the first. */
const busier = (a: Locality, b: Locality): Locality => (b.listingCount > a.listingCount ? b : a);

/**
 * Match an already-measured fix against a list of areas.
 *
 * Split out from `findMyLocality` below so it can be reasoned about — and
 * tested — without a device, a permission dialog or a geocoder.
 */
export function matchLocality(
  found: LocatedAddress,
  localities: readonly Locality[],
): LocalityMatch {
  const placeLabel = labelOf(found);
  const haystack = haystackOf(found);

  if (!haystack || !localities.length) return { kind: 'none', placeLabel };

  /* 1 — a locality's own name, anywhere in what the geocoder said. Short names
     are not excluded, but they are required to sit on a word boundary: without
     that, an area called "HSR" would match the word "hsrnagar" and a two-letter
     one would match almost anything. */
  let byName: Locality | null = null;
  let byAlias: Locality | null = null;
  let byCity: Locality | null = null;

  for (const locality of localities) {
    const name = norm(locality.name);
    if (name && new RegExp(`(^|[^a-z0-9])${escapeRe(name)}([^a-z0-9]|$)`).test(haystack)) {
      byName = byName ? busier(byName, locality) : locality;
      continue;
    }

    /* 2 — the aliases `places.adapter.ts` derives from the name, which is what
       lets a device that only said "HSR Layout" find "HSR Layout Sector 1". */
    const alias = (locality.aliases ?? []).find(
      (candidate) =>
        norm(candidate).length > 3
        && new RegExp(`(^|[^a-z0-9])${escapeRe(norm(candidate))}([^a-z0-9]|$)`).test(haystack),
    );
    if (alias) {
      byAlias = byAlias ? busier(byAlias, locality) : locality;
      continue;
    }

    /* 3 — the city. Weaker, and reported as such. */
    const city = norm(locality.city);
    if (city && haystack.includes(city)) {
      byCity = byCity ? busier(byCity, locality) : locality;
    }
  }

  if (byName) return { kind: 'area', locality: byName, placeLabel };
  if (byAlias) return { kind: 'area', locality: byAlias, placeLabel };
  if (byCity) return { kind: 'city', locality: byCity, placeLabel };
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
