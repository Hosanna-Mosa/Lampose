/* ══════════════════════════════════════════════════════════════════════════
   The Sales Tracking page: creating an account, the roster, and one rep's
   path in a chosen time window.

   Reads and writes `/v1/admin/sales-reps` — a SEVENTH identity system in the
   backend (`app_sales_reps`), behind the same admin token every other
   service here uses. A rep signs in through `/api/v2/sales`, which this
   console never touches; nothing here can move a rep's own duty switch,
   matching the rule `driverAdminService.ts` follows for a rider's own
   account. `createSalesRep` is the one exception to "read-only": there is no
   self-registration in the Tracker app any more, so an administrator typing
   the account into existence here — and handing the rep that exact email and
   password — is the only way one gets made.

   `[lng, lat]`, unswapped — the backend's own comment on this is not a
   suggestion. `SalesTrackingPage.tsx`'s map is where it finally gets flipped,
   once, for `@react-google-maps/api`'s `{lat, lng}`.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from '../apiCaller';
import type { ApiResponse } from '../types';

const BASE = '/v1/admin/sales-reps';

export type SalesRepStatus = 'active' | 'inactive';

export type SalesRepRow = {
  id: string;
  name: string;
  email: string;
  status: SalesRepStatus;
  onDuty: boolean;
  dutyStartedAt: string | null;
  /** `[longitude, latitude]`, or null when this rep has never gone online. */
  currentLocation: [number, number] | null;
  locationUpdatedAt: string | null;
  createdAt: string;
};

export type SalesRepPathPoint = { lat: number; lng: number; at: string };

/** Either bound may be left out — the backend defaults an omitted `to` to
    now, and an omitted `from` (with no `to` either) to the rep's current
    duty session or today. ISO strings, `Date#toISOString()`'s own shape. */
export type SalesRepPathRange = { from?: string; to?: string };

const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const normalizeRow = (raw: any): SalesRepRow => ({
  id: str(raw?.id),
  name: str(raw?.name),
  email: str(raw?.email),
  status: (str(raw?.status) || 'active') as SalesRepStatus,
  onDuty: Boolean(raw?.onDuty),
  dutyStartedAt: raw?.dutyStartedAt ?? null,
  currentLocation: Array.isArray(raw?.currentLocation?.coordinates)
    && raw.currentLocation.coordinates.length === 2
    ? [num(raw.currentLocation.coordinates[0]), num(raw.currentLocation.coordinates[1])]
    : null,
  locationUpdatedAt: raw?.locationUpdatedAt ?? null,
  createdAt: raw?.createdAt ?? null,
});

export const salesTrackingService = {
  /** The whole roster, on duty first. */
  async getSalesReps(): Promise<ApiResponse<SalesRepRow[]>> {
    const res = await api.get<any>(BASE);
    if (!res.success) return { ...res, data: [] };
    const rows = res.data?.data?.salesReps;
    return { ...res, data: Array.isArray(rows) ? rows.map(normalizeRow) : [] };
  },

  /** A new rep's account — the only door left, now that the Tracker app has
      no sign-up screen. Hand the rep the exact email and password typed in
      here; the server never invents or emails a credential. */
  async createSalesRep(
    name: string,
    email: string,
    password: string,
  ): Promise<ApiResponse<SalesRepRow | null>> {
    const res = await api.post<any>(BASE, { name, email, password });
    if (!res.success) return { ...res, data: null };
    const row = res.data?.data?.salesRep;
    return { ...res, data: row ? normalizeRow(row) : null };
  },

  /** One rep's fixes in a chosen window, oldest first — a polyline is drawn
      in the order it was walked. With no `range`, the backend defaults to
      the rep's current duty session (or today, if they are offline). */
  async getSalesRepPath(
    salesRepId: string,
    range?: SalesRepPathRange,
  ): Promise<ApiResponse<{ salesRep: SalesRepRow | null; path: SalesRepPathPoint[]; since: string | null; until: string | null }>> {
    const params: Record<string, string> = {};
    if (range?.from) params.from = range.from;
    if (range?.to) params.to = range.to;
    const res = await api.get<any>(`${BASE}/${salesRepId}/path`, params);
    if (!res.success) return { ...res, data: { salesRep: null, path: [], since: null, until: null } };
    const payload = res.data?.data;
    const path = Array.isArray(payload?.path) ? payload.path : [];
    return {
      ...res,
      data: {
        salesRep: payload?.salesRep ? normalizeRow(payload.salesRep) : null,
        path: path.map((p: any) => ({ lat: num(p?.lat), lng: num(p?.lng), at: str(p?.at) })),
        since: payload?.since ?? null,
        until: payload?.until ?? null,
      },
    };
  },
};
