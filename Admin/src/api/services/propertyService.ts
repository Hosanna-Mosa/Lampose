import { api, unwrapList } from '../apiCaller';
import type { ApiResponse, PropertyEntity } from '../types';

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Map a raw `properties` document onto the shape the UI reads. */
const normalize = (raw: any): PropertyEntity => {
  const images: string[] = Array.isArray(raw.images) ? raw.images.filter(Boolean) : [];
  return {
    id: raw._id || raw.id,
    clickCount: typeof raw.clickCount === 'number' ? raw.clickCount : null,
    name: raw.name || 'Untitled property',
    place: raw.place || '',
    address: raw.address || '',
    category: raw.category || 'Unspecified',
    ownerName: raw.ownerName || '',
    ownerMobile: raw.ownerMobile || '',
    ownerAltMobile: raw.ownerAltMobile || '',
    employeeEmail: raw.employeeEmail || '',
    stayType: raw.stayType || 'Unspecified',
    shortStayDuration: raw.shortStayDuration || '',
    longStayDuration: raw.longStayDuration || '',
    dailyPrice: toNumber(raw.dailyPrice),
    monthlyPrice: toNumber(raw.monthlyPrice),
    rent: toNumber(raw.rent),
    deposit: toNumber(raw.deposit),
    imageUrl: raw.imageUrl || images[0] || '',
    images: images.length ? images : raw.imageUrl ? [raw.imageUrl] : [],
    amenities: Array.isArray(raw.amenities) ? raw.amenities.filter(Boolean) : [],
    description: raw.description || '',
    categoryDetails: raw.categoryDetails && typeof raw.categoryDetails === 'object' ? raw.categoryDetails : {},
    isVerified: raw.isVerified === true,
    verificationStatus: raw.verificationStatus || (raw.isVerified ? 'verified' : 'pending'),
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
};

/**
 * One room type on a verified listing: capacity next to what is FREE now.
 *
 * `totalBeds` is capacity (`categoryDetails.sharingBeds`, edited with the
 * property). `availableBeds` moves by itself with every booking and is what
 * students see as "N left". `recorded: false` means no total bed count exists
 * yet for this room type, so there is nothing to count.
 */
export interface PropertyInventoryItem {
  shareTypeId: string;
  label: string;
  capacity: number | null;
  recorded: boolean;
  totalBeds: number | null;
  availableBeds: number | null;
  /** Lampose bookings on a bed (upcoming / arriving / in-house / departing). */
  bookedInApp: number;
  /** Beds a person said are taken outside the app. */
  offlineOccupied: number;
  /** Lampose bookings a person marked vacant — tenant left, booking still open. */
  markedVacant?: number;
  /** Free beds possible WITHOUT overriding a Lampose booking: total − Lampose bookings. */
  maxFree: number | null;
  /** Set on a save that went above `maxFree`. */
  override?: boolean;
  isAvailable: boolean | null;
  freeBedsEditedAt: string | null;
  freeBedsEditedBy: string;
}

export const propertyService = {
  /** Listings from the `properties` collection. */
  async getProperties(params?: {
    search?: string;
    category?: string;
    stayType?: string;
    place?: string;
  }): Promise<ApiResponse<PropertyEntity[]>> {
    const res = await api.get<any>('/properties', params);
    return res.success ? { ...res, data: unwrapList(res.data).map(normalize) } : { ...res, data: [] };
  },

  async getProperty(id: string): Promise<ApiResponse<PropertyEntity | null>> {
    const res = await api.get<any>(`/properties/${id}`);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async createProperty(payload: {
    name: string;
    place: string;
    category: string;
    ownerName: string;
    ownerMobile: string;
    rent: number;
    deposit?: number;
    address?: string;
    stayType?: string;
  }): Promise<ApiResponse<PropertyEntity | null>> {
    const res = await api.post<any>('/properties', payload);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async updateProperty(
    id: string,
    changes: Partial<Record<string, unknown>>
  ): Promise<ApiResponse<PropertyEntity | null>> {
    const res = await api.put<any>(`/properties/${id}`, changes);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async deleteProperty(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return api.delete<{ success: boolean }>(`/properties/${id}`);
  },

  /**
   * Send the owner's WhatsApp approval message again, for a listing still
   * awaiting verification.
   *
   * Always restarts at the OWNER's stage, never the verification team's — the
   * team is only asked once the owner has replied YES, so resending to them
   * would ask somebody to confirm a listing its owner never agreed to. The
   * route re-reads the owner's number from the pending snapshot, which is what
   * makes "correct the number with Edit, then resend" work.
   *
   * `id` is the property id the grid already holds. An unverified listing has
   * no `properties` document behind it, so that id resolves to the snapshot on
   * its verification request — the same id Edit and Delete use.
   */
  async resendVerification(id: string): Promise<ApiResponse<{ attempts?: number; expiresAt?: string } | null>> {
    const res = await api.post<any>(`/properties/${id}/resend-verification`, {});
    return res.success
      ? { ...res, data: { attempts: res.data?.attempts, expiresAt: res.data?.expiresAt } }
      : { ...res, data: null };
  },

  /** Beds per room type — total, free now, Lampose bookings. Verified listings only. */
  async getInventory(id: string): Promise<ApiResponse<PropertyInventoryItem[]>> {
    const res = await api.get<any>(`/properties/${id}/inventory`);
    return res.success
      ? { ...res, data: Array.isArray(res.data?.data?.items) ? res.data.data.items : [] }
      : { ...res, data: [] };
  },

  /**
   * Set how many beds of one room type are free right now. Never touches the
   * total. Accepts 0 to the total; above total − Lampose bookings is an
   * override (tenant left, booking still open). Refusals carry `message`.
   */
  async setFreeBeds(
    id: string,
    shareTypeId: string,
    availableBeds: number
  ): Promise<ApiResponse<PropertyInventoryItem | null>> {
    const res = await api.patch<any>(
      `/properties/${id}/inventory/${encodeURIComponent(shareTypeId)}`,
      { availableBeds }
    );
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },
};
