/**
 * The service zones, as the rider app reads them.
 *
 * `GET /api/v2/zones` and `GET /api/v2/zones/check` are deliberately
 * unauthenticated on the server — a boundary is something the product
 * advertises, not something to protect — so this needs no token and works
 * before sign-in.
 *
 * ## Coordinates are `[longitude, latitude]`
 *
 * GeoJSON's order, MongoDB's order, and the order this app already keeps
 * unswapped in `MapPanel` and every `pushLocation` call. `toLatLng` is the one
 * place it becomes the `{ latitude, longitude }` React Native maps want.
 */
import { api } from "./api";

export type ZoneType = "circle" | "polygon";

export type Zone = {
  zoneId: string;
  name: string;
  type: ZoneType;
  pricingMultiplier: number;
  /** `[longitude, latitude]`. Set on a circle. */
  center?: [number, number] | null;
  /** Metres. Set on a circle. */
  radius?: number | null;
  /** GeoJSON rings of `[longitude, latitude]`. Set on a polygon. */
  boundary?: [number, number][][] | null;
  allowedServices: string[];
  activeHours: { start: string; end: string };
};

export type ZoneCheck = {
  serviceable: boolean;
  pricingMultiplier: number;
  zone: Zone | null;
};

/** Every live zone. `service` narrows to zones that allow it. */
export async function fetchZones(service = "food"): Promise<Zone[]> {
  const res = await api<{ data?: Zone[] }>(`/api/v2/zones?service=${encodeURIComponent(service)}`);
  return Array.isArray(res?.data) ? res.data : [];
}

/** Is this point inside a live zone right now? */
export async function checkZone(lat: number, lng: number, service = "food"): Promise<ZoneCheck> {
  return api<ZoneCheck>(
    `/api/v2/zones/check?lat=${lat}&lng=${lng}&service=${encodeURIComponent(service)}`,
  );
}

/** `[lng, lat]` → what `react-native-maps` and the SVG panel both want. */
export const toLatLng = (pair: [number, number]) => ({
  latitude: pair[1],
  longitude: pair[0],
});

/**
 * Every point a zone covers, as a flat list — enough to frame it on a map.
 *
 * A circle is approximated by its bounding box corners rather than by a ring
 * of sampled points: the only caller wants a region to fit, and four corners
 * fit exactly the same box as thirty-six would.
 */
export function zoneExtent(zone: Zone): { latitude: number; longitude: number }[] {
  if (zone.type === "polygon" && zone.boundary?.[0]) {
    return zone.boundary[0].map(toLatLng);
  }
  if (zone.center && zone.radius) {
    const [lng, lat] = zone.center;
    /* Degrees per metre. Longitude narrows with latitude, which matters at
       Rajahmundry's 17°N by about 4% — small, and free to be right about. */
    const dLat = zone.radius / 111_320;
    const dLng = zone.radius / (111_320 * Math.cos((lat * Math.PI) / 180));
    return [
      { latitude: lat - dLat, longitude: lng - dLng },
      { latitude: lat + dLat, longitude: lng + dLng },
    ];
  }
  return [];
}
