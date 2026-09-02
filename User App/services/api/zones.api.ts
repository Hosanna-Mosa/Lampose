/**
 * Service zones — where Lampose operates.
 *
 * Drawn in the admin console, stored in `service_zones`, and read here to
 * answer one question the app asks at exactly one moment: does Lampose deliver
 * to this address?
 *
 * ## Unauthenticated, on purpose
 *
 * Neither call carries a token. The server states why: a student deciding
 * whether Lampose reaches their block is asking before they have an account,
 * and a boundary is something the product advertises rather than protects.
 *
 * ## Coordinates are `[longitude, latitude]`
 *
 * GeoJSON's order, MongoDB's, and the order this app already keeps unswapped
 * in `DeliveryMap` and in the `pickupLocation`/`dropLocation` it reads off an
 * order. Nothing here reorders them; `zoneRingToLatLng` is the one helper that
 * does, at the point something is drawn.
 */
import { api } from './client';
import { endpoints } from './endpoints';

export type ZoneType = 'circle' | 'polygon';

export interface ServiceZone {
  zoneId: string;
  name: string;
  type: ZoneType;
  pricingMultiplier: number;
  /** `[longitude, latitude]`. Present on a circle. */
  center?: [number, number] | null;
  /** Metres. Present on a circle. */
  radius?: number | null;
  /** GeoJSON rings of `[longitude, latitude]`. Present on a polygon. */
  boundary?: [number, number][][] | null;
  allowedServices: string[];
  activeHours: { start: string; end: string };
}

export interface ZoneCheckResult {
  serviceable: boolean;
  /** 1 when nothing applies, so a caller can multiply unconditionally. */
  pricingMultiplier: number;
  zone: ServiceZone | null;
}

/**
 * Is this point inside a live zone right now?
 *
 * Answered by the server, which owns the rule — active hours, allowed
 * services and the geometry all live in `zone.service.js`. The app does not
 * reimplement any of it, because a second implementation of "are we open" is a
 * second implementation that drifts.
 */
export async function checkZone(
  lat: number,
  lng: number,
  service = 'food',
): Promise<ZoneCheckResult> {
  const res = await api.get<ZoneCheckResult>(endpoints.zoneCheck(lat, lng, service));
  return {
    serviceable: !!res?.serviceable,
    pricingMultiplier:
      typeof res?.pricingMultiplier === 'number' && Number.isFinite(res.pricingMultiplier)
        ? res.pricingMultiplier
        : 1,
    zone: res?.zone ?? null,
  };
}

/** Every live zone — for a screen that wants to say where we deliver at all. */
export async function fetchZones(service = 'food'): Promise<ServiceZone[]> {
  const res = await api.get<{ data?: ServiceZone[] }>(
    `${endpoints.zones}?service=${encodeURIComponent(service)}`,
  );
  return Array.isArray(res?.data) ? res.data : [];
}

/** `[lng, lat][]` → `{latitude, longitude}[]`, at the point of drawing. */
export const zoneRingToLatLng = (ring: [number, number][]) =>
  ring.map(([longitude, latitude]) => ({ latitude, longitude }));
