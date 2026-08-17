import type { Locality } from '@/types/auth';
import type { BackendListingMeta } from '@/services/api/types';
import type { StayCategory } from '@/constants/tokens';
import { BACKEND_CATEGORIES } from './listing.adapter';

/**
 * The locality picker's rows, from what is actually in the collection.
 *
 * The screen used to read a hardcoded list of eight Hyderabad areas with
 * invented listing counts. The database holds Bangalore and Anakapalli, so
 * every row on that screen was an area with nothing in it, and every area we
 * cover was missing from it — a student was offered Gachibowli, tapped it,
 * and got an empty feed.
 *
 * The server already shapes these (`GET /api/v2/listings/meta`) with the same
 * `cityOf`/`localityOf` derivation the feed uses, so a locality offered here
 * is spelled exactly as the `?city=` filter will match. This adapter's only
 * real work is the search aliases, which the database has no field for.
 */

/**
 * Extra strings the search box should match, derived from the name itself.
 *
 * "HSR Layout Sector 1" is how the panel wrote it and not how anybody types
 * it: a student searching "hsr" or "sector 1" should find it. So each word
 * and each trailing pair of words becomes an alias.
 *
 * This is a search convenience and nothing else — it never reaches the wire,
 * and no filter is applied from it. The real aliases a market needs
 * ("triple it" for Gachibowli, "kphb" for Kukatpally) are local knowledge
 * that has to be recorded by a person; when there is a field for them, they
 * are added here alongside these.
 */
function aliasesFor(name: string): string[] {
  const words = name.split(/[^A-Za-z0-9]+/).filter((word) => word.length > 1);
  if (words.length < 2) return [];

  const aliases = new Set<string>();
  for (const word of words) aliases.add(word.toLowerCase());
  for (let i = 0; i < words.length - 1; i += 1) {
    aliases.add(`${words[i]} ${words[i + 1]}`.toLowerCase());
  }
  aliases.delete(name.toLowerCase());
  return [...aliases];
}

export function toLocalities(meta: BackendListingMeta, category?: StayCategory | null): Locality[] {
  return (meta.localities ?? []).map((row) => {
    let count = row.listingCount;
    if (category) {
      const backendCategories = BACKEND_CATEGORIES[category];
      if (backendCategories && backendCategories.length) {
        count = backendCategories.reduce((sum, cat) => sum + (row.categories?.[cat] ?? 0), 0);
      } else {
        count = row.categories?.[category] ?? 0;
      }
    }
    return {
      id: row.id,
      name: row.name,
      city: row.city,
      listingCount: count,
      medianRent: row.medianRent,
      /* `nearestLandmark` is deliberately absent. The panel records a postal
         address, not "opposite the water tank", and a landmark is exactly the
         kind of field that must come from somebody who has stood there. */
      aliases: aliasesFor(row.name),
    };
  });
}

/**
 * The area to offer as the current-location guess.
 *
 * The one with the most in it, which is the best answer available without
 * asking for location permission — and it is always labelled a guess on
 * screen, so being wrong costs a tap rather than a wasted search.
 *
 * Real GPS would be better and is a separate piece of work: `expo-location`
 * is already a dependency, but turning a coordinate into one of these rows
 * needs a distance, and the collection stores no latitude or longitude.
 */
export function guessLocality(meta: BackendListingMeta, category?: StayCategory | null): Locality | null {
  const localities = toLocalities(meta, category);
  if (!localities.length) return null;
  return localities.reduce((best, row) => (row.listingCount > best.listingCount ? row : best));
}
