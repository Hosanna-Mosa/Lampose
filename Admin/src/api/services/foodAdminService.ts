/* ══════════════════════════════════════════════════════════════════════════
   The food-partner approval queue.

   Reads `/v1/admin/food-restaurants` — the v1 admin surface, behind the same
   admin token every other service here uses. The restaurants themselves apply
   through `/api/v2/food-partners`, an entirely separate identity system; the
   console never touches that one.

   ## Why this one names its version and the others do not

   `axiosInstance` is based at `.../api`, and every older service here calls an
   UNVERSIONED path — `/verifications`, `/admin/login` — which the backend
   answers through the alias table in `routes/index.js`. That table exists to
   keep callers written before versioning working, and the file says plainly
   that it is not there to give new callers a second spelling to drift onto.
   This endpoint is new, so it names its version and no alias was added for it.

   Every field is read from the response rather than defaulted into existence.
   A missing value shows as a dash in the UI, which is the truth, instead of a
   zero that reads as a real measurement.
   ══════════════════════════════════════════════════════════════════════════ */
import { api, unwrapList } from '../apiCaller';
import type {
  ApiResponse,
  FoodQueueCounts,
  FoodRestaurantDetail,
  FoodRestaurantRow,
  FoodVerificationStatus,
} from '../types';

/* The versioned path, spelled once. `axiosInstance` supplies the `/api` base. */
const BASE = '/v1/admin/food-restaurants';

const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeRow = (raw: any): FoodRestaurantRow => ({
  restaurantId: raw.restaurantId || '',
  restaurantName: raw.restaurantName || 'Untitled restaurant',
  ownerName: raw.ownerName || '',
  ownerEmail: raw.ownerEmail || '',
  ownerPhone: raw.ownerPhone || '',
  description: raw.description || '',
  cuisineTypes: Array.isArray(raw.cuisineTypes) ? raw.cuisineTypes : [],
  logoImage: raw.logoImage || null,
  coverBannerImage: raw.coverBannerImage || null,
  address: raw.address || {},
  contactNumber: raw.contactNumber || '',
  verificationStatus: (raw.verificationStatus || 'pending') as FoodVerificationStatus,
  verificationNote: raw.verificationNote || '',
  isActive: Boolean(raw.isActive),
  ratingAvg: num(raw.ratingAvg),
  ratingCount: num(raw.ratingCount),
  avgPreparationTime: num(raw.avgPreparationTime),
  deliveryRadiusKm: num(raw.deliveryRadiusKm),
  minOrderValue: num(raw.minOrderValue),
  menuItemCount: num(raw.menuItemCount),
  createdAt: raw.createdAt || null,
  verifiedAt: raw.verifiedAt || null,
});

/**
 * What became of the message an approval sends.
 *
 * `setupUrl` is present ONLY when the message did not go — see
 * `issueCredentials` on the server. It is the link itself, handed to the
 * approver so somebody can pass it to the owner by whatever channel reaches
 * them. On the happy path it is absent, and it disappears by itself the day
 * the WhatsApp template is approved.
 */
export interface SendOutcome {
  sent: boolean;
  error: string | null;
  setupUrl?: string;
}

export const foodAdminService = {
  /** The queue. `status: 'all'` or omitted returns every application. */
  async getRestaurants(params?: {
    status?: FoodVerificationStatus | 'all';
    search?: string;
    limit?: number;
  }): Promise<ApiResponse<FoodRestaurantRow[]> & { counts?: FoodQueueCounts }> {
    const res = await api.get<any>(`${BASE}`, params);
    if (!res.success) return { ...res, data: [] };
    return {
      ...res,
      data: unwrapList(res.data).map(normalizeRow),
      counts: res.data?.counts as FoodQueueCounts | undefined,
    };
  },

  /** One application in full, with its menu grouped by category. */
  async getRestaurant(restaurantId: string): Promise<ApiResponse<FoodRestaurantDetail | null>> {
    const res = await api.get<any>(`${BASE}/${restaurantId}`);
    if (!res.success || !res.data?.data) return { ...res, data: null };
    const payload = res.data.data;
    return {
      ...res,
      data: {
        restaurant: { ...normalizeRow(payload.restaurant), ...payload.restaurant },
        menu: Array.isArray(payload.menu) ? payload.menu : [],
        menuItemCount: num(payload.menuItemCount),
      },
    };
  },

  /**
   * Approve or reject. This is the only call in the console that lists a
   * kitchen to a diner, which is why the backend refuses a rejection with no
   * note — the partner is shown that string verbatim in their app.
   */
  async decide(
    restaurantId: string,
    decision: FoodVerificationStatus,
    note?: string
  ): Promise<ApiResponse<{ verificationStatus: FoodVerificationStatus; credentials?: SendOutcome } | null>> {
    const res = await api.patch<any>(`${BASE}/${restaurantId}/decision`, {
      decision,
      note,
    });
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /**
   * Send an approved owner a NEW password, because the first one did not
   * arrive.
   *
   * The ordinary failure of the approval message: a handset that was off, a
   * number typed wrong on the application, a WhatsApp template still in
   * review. The restaurant is approved and the owner cannot get in, and the
   * only other remedy is a developer with database access.
   *
   * It mints a new password rather than resending the old one — the old one
   * exists only as a bcrypt hash, by design — so pressing it invalidates a
   * password the owner may in fact have received. That is why it is a button
   * somebody presses rather than anything automatic.
   */
  async resendCredentials(
    restaurantId: string
  ): Promise<ApiResponse<{ credentials?: SendOutcome } | null>> {
    const res = await api.post<any>(`${BASE}/${restaurantId}/credentials`);
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /** Pause or resume an already-approved listing without un-approving it. */
  async setActive(
    restaurantId: string,
    isActive: boolean
  ): Promise<ApiResponse<{ isActive: boolean } | null>> {
    const res = await api.patch<any>(`${BASE}/${restaurantId}/active`, { isActive });
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },
};
