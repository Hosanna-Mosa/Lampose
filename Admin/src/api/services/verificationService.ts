import { api, unwrapList } from '../apiCaller';
import type { ApiResponse, VerificationEntity, VerificationStatus } from '../types';

const normalize = (raw: any): VerificationEntity => ({
  id: raw._id || raw.id,
  ownerMobileE164: raw.ownerMobileE164 || raw.ownerMobile || '',
  token: raw.token || '',
  status: (raw.status || 'pending') as VerificationStatus,
  contentSid: raw.contentSid || '',
  outboundMessageSid: raw.outboundMessageSid || '',
  lastDeliveryStatus: raw.lastDeliveryStatus || '',
  lastError: raw.lastError || '',
  attempts: Number.isFinite(Number(raw.attempts)) ? Number(raw.attempts) : 0,
  createdAt: raw.createdAt || null,
  updatedAt: raw.updatedAt || null,
  sentAt: raw.sentAt || null,
  respondedAt: raw.respondedAt || null,
  expiresAt: raw.expiresAt || null,
  property: raw.property && typeof raw.property === 'object' ? raw.property : null,
});

export const verificationService = {
  /** Requests from the `verificationrequests` collection. */
  async getVerifications(params?: {
    search?: string;
    status?: string;
  }): Promise<ApiResponse<VerificationEntity[]>> {
    const res = await api.get<any>('/verifications', params);
    return res.success ? { ...res, data: unwrapList(res.data).map(normalize) } : { ...res, data: [] };
  },

  async createVerification(data: {
    ownerMobileE164: string;
    status?: VerificationStatus;
    attempts?: number;
  }): Promise<ApiResponse<VerificationEntity | null>> {
    const res = await api.post<any>('/verifications', data);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async updateVerification(
    id: string,
    data: {
      status?: VerificationStatus;
      attempts?: number;
      lastError?: string;
      ownerMobileE164?: string;
    }
  ): Promise<ApiResponse<VerificationEntity | null>> {
    const res = await api.put<any>(`/verifications/${id}`, data);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async deleteVerification(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return api.delete<{ success: boolean }>(`/verifications/${id}`);
  },
};
