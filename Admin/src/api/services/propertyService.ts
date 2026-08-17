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
};
