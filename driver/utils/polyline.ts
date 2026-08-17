export type LatLng = { latitude: number; longitude: number };

/**
 * Decode a Google encoded-polyline string into map coordinates.
 * Returns an empty array for malformed input rather than throwing.
 */
export function decodePolyline(encoded: string | null | undefined): LatLng[] {
  if (!encoded) return [];

  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  try {
    while (index < encoded.length) {
      let result = 0;
      let shift = 0;
      let byte: number;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      lat += result & 1 ? ~(result >> 1) : result >> 1;

      result = 0;
      shift = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      lng += result & 1 ? ~(result >> 1) : result >> 1;

      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
  } catch {
    return points;
  }

  return points;
}

/** Initial bearing in degrees from one coordinate to another. */
export function bearingBetween(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const rad = Math.PI / 180;
  const phi1 = fromLat * rad;
  const phi2 = toLat * rad;
  const deltaLambda = (toLng - fromLng) * rad;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

/** A region that fits every supplied point, with headroom for the bottom sheet. */
export function regionForCoordinates(
  coords: LatLng[],
  { bottomBias = 0.15, minDelta = 0.02 } = {},
) {
  if (coords.length === 0) return null;
  if (coords.length === 1) {
    return {
      latitude: coords[0].latitude,
      longitude: coords[0].longitude,
      latitudeDelta: minDelta,
      longitudeDelta: minDelta,
    };
  }

  const lats = coords.map((c) => c.latitude);
  const lngs = coords.map((c) => c.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const spanLat = maxLat - minLat;
  const spanLng = maxLng - minLng;

  return {
    // Shift the centre up so the bottom sheet doesn't cover the route.
    latitude: (minLat + maxLat) / 2 - spanLat * bottomBias,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(minDelta, spanLat * 1.9),
    longitudeDelta: Math.max(minDelta, spanLng * 1.9),
  };
}
