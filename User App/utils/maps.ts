import { Linking } from 'react-native';

/**
 * Handing off to Google Maps, rather than drawing a map.
 *
 * There is no map inside this app. A map view would mean a native SDK, tile
 * costs, clustering work on mid-range Android, and a second-rate version of a
 * thing every user already has installed and already trusts for directions.
 *
 * What a student actually needs from a map here is "how do I get there" — and
 * the answer to that is Google Maps, with their own saved home, their own
 * transit preferences and their own live traffic. So we hand off.
 *
 * The URLs below are Google's documented universal links: they open the app
 * when it is installed and the website when it is not, on both platforms.
 */

export type Place = {
  /** Preferred when we have it — a pin is exact, an address is a guess. */
  coords?: { latitude: number; longitude: number };
  /** The full postal address, used when there are no coordinates. */
  address?: string;
  /** Falls back to the property name plus its locality. */
  label?: string;
};

function destination(place: Place): string {
  if (place.coords) return `${place.coords.latitude},${place.coords.longitude}`;
  return encodeURIComponent(place.address ?? place.label ?? '');
}

/** Drops a pin. Use when the user wants to see where a place is. */
export function googleMapsSearchUrl(place: Place): string {
  return `https://www.google.com/maps/search/?api=1&query=${destination(place)}`;
}

/**
 * Opens turn-by-turn directions from wherever the user is.
 *
 * No origin is supplied on purpose — Google fills it from the device, which is
 * both more accurate than anything we hold and not a location we have to ask
 * for, store or explain.
 */
export function googleMapsDirectionsUrl(place: Place): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${destination(place)}`;
}

/**
 * Returns false when nothing can open the link, so the caller can say so
 * instead of appearing to do nothing.
 */
export async function openInGoogleMaps(
  place: Place,
  intent: 'directions' | 'view' = 'directions',
): Promise<boolean> {
  const url = intent === 'directions' ? googleMapsDirectionsUrl(place) : googleMapsSearchUrl(place);
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
