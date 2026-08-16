import { api, unwrapList } from '../apiCaller';
import type { ApiResponse, VisitRequestEntity, VisitRequestStatus } from '../types';

/** Map a raw `visitrequests` document onto the shape the UI reads. */
const normalize = (raw: any): VisitRequestEntity => ({
  id: raw._id || raw.id,
  listingId: raw.listingId || '',
  propertyName: raw.propertyName || 'Untitled property',
  ownerName: raw.ownerName || 'Property Owner',
  ownerMobile: raw.ownerMobile || '',
  customer: {
    name: raw.customer?.name || '',
    phone: raw.customer?.phone || '',
    email: raw.customer?.email || '',
  },
  preferredDate: raw.preferredDate || null,
  preferredTime: raw.preferredTime || null,
  status: (raw.status || 'otp_pending') as VisitRequestStatus,
  createdAt: raw.createdAt || null,
  decidedAt: raw.decidedAt || null,
  expiresAt: raw.expiresAt || null,
});

export const visitRequestAdminService = {
  /** Every "request a visit" ask, from the `visitrequests` collection. Super Admin only. */
  async getVisitRequests(params?: { status?: string; search?: string }): Promise<ApiResponse<VisitRequestEntity[]>> {
    const res = await api.get<any>('/admin/visit-requests', params);
    return res.success ? { ...res, data: unwrapList(res.data).map(normalize) } : { ...res, data: [] };
  },

  async updateVisitRequest(
    id: string,
    changes: Partial<{
      status: VisitRequestStatus;
      propertyName: string;
      ownerName: string;
      ownerMobile: string;
      preferredDate: string;
      preferredTime: string;
      customer: { name?: string; phone?: string; email?: string };
    }>
  ): Promise<ApiResponse<VisitRequestEntity | null>> {
    const res = await api.put<any>(`/admin/visit-requests/${id}`, changes);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async deleteVisitRequest(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return api.delete<{ success: boolean }>(`/admin/visit-requests/${id}`);
  },
};
