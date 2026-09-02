/* ══════════════════════════════════════════════════════════════════════════
   Service zones — the console's side.

   Reads `/v1/admin/zones`, the v1 admin surface behind the same admin token
   every other service here uses. The apps read the same shapes through
   `/api/v2/zones`, which is a different router with no way to write — the
   console never touches that one.

   Versioned in the path for the reason `foodAdminService` gives: the
   unversioned aliases in `routes/index.js` exist to keep callers written before
   versioning working, not to hand new ones a second spelling to drift onto.

   ## Coordinates stay `[longitude, latitude]`

   Every array crossing this file is GeoJSON order, unchanged from Mongo. The
   Zones page converts to Google's `{lat, lng}` at the point it draws and
   converts back the moment a click becomes a stored point. Doing it here as
   well would be the second place a swap can happen, and a swap does not throw
   — it puts a Rajahmundry zone in the Arctic Ocean and every address in the
   city stops being serviceable.
   ══════════════════════════════════════════════════════════════════════════ */
import { api, unwrapList } from '../apiCaller';
import type {
  ApiResponse, ZoneCounts, ZoneInput, ZoneRow, ZoneService, ZoneType,
} from '../types';

const BASE = '/v1/admin/zones';

const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** A coordinate pair, or null. Rejects anything that is not two finite numbers. */
const pair = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [a, b] = [Number(value[0]), Number(value[1])];
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
};

const ring = (value: unknown): [number, number][][] | null => {
  if (!Array.isArray(value) || !value.length) return null;
  const rings = value
    .map((r) => (Array.isArray(r) ? r.map(pair).filter(Boolean) as [number, number][] : []))
    .filter((r) => r.length >= 3);
  return rings.length ? rings : null;
};

const normalize = (raw: any): ZoneRow => ({
  zoneId: String(raw?.zoneId ?? ''),
  name: String(raw?.name ?? 'Untitled zone'),
  description: String(raw?.description ?? ''),
  type: (raw?.type === 'circle' ? 'circle' : 'polygon') as ZoneType,
  center: pair(raw?.center),
  radius: raw?.radius == null ? null : num(raw.radius),
  boundary: ring(raw?.boundary),
  /* Defaulted to 1 rather than 0: a missing multiplier means "normal price",
     and a zero would silently make every order in the area free. */
  pricingMultiplier: num(raw?.pricingMultiplier, 1),
  isActive: raw?.isActive !== false,
  allowedServices: Array.isArray(raw?.allowedServices)
    ? (raw.allowedServices as ZoneService[])
    : [],
  activeHours: {
    start: String(raw?.activeHours?.start ?? ''),
    end: String(raw?.activeHours?.end ?? ''),
  },
  createdAt: raw?.createdAt ?? null,
  updatedAt: raw?.updatedAt ?? null,
});

export const zoneService = {
  /** Every zone, newest first. */
  async getZones(params?: {
    active?: 'true' | 'false';
    type?: ZoneType;
    search?: string;
  }): Promise<ApiResponse<ZoneRow[]> & { counts?: ZoneCounts }> {
    const res = await api.get<any>(BASE, params);
    if (!res.success) return { ...res, data: [] };
    return {
      ...res,
      data: unwrapList(res.data).map(normalize),
      counts: res.data?.counts as ZoneCounts | undefined,
    };
  },

  /** Draw a new one. */
  async createZone(input: ZoneInput): Promise<ApiResponse<ZoneRow | null>> {
    const res = await api.post<any>(BASE, input);
    return res.success && res.data?.data
      ? { ...res, data: normalize(res.data.data) }
      : { ...res, data: null };
  },

  /**
   * Change one. PARTIAL on purpose.
   *
   * The list's on/off switch sends `{ isActive }` and nothing else; the drawing
   * modal sends the whole shape. One endpoint serves both because the backend
   * takes a PATCH — a PUT would mean the toggle had to resend a geometry it
   * never loaded, and the first bug in that arrangement is a zone whose shape
   * is flattened by somebody turning it off.
   */
  async updateZone(zoneId: string, input: ZoneInput): Promise<ApiResponse<ZoneRow | null>> {
    const res = await api.patch<any>(`${BASE}/${zoneId}`, input);
    return res.success && res.data?.data
      ? { ...res, data: normalize(res.data.data) }
      : { ...res, data: null };
  },

  /** Retire one. Nothing holds a reference to a zone, so this is just a delete. */
  async deleteZone(zoneId: string): Promise<ApiResponse<null>> {
    const res = await api.delete<any>(`${BASE}/${zoneId}`);
    return { ...res, data: null, message: res.data?.message || res.message };
  },
};
