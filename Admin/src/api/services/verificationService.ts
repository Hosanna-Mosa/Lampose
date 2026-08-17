import { api, unwrapList } from '../apiCaller';
import type { ApiResponse, VerificationEntity, VerificationStatus } from '../types';

/**
 * The linked property, preferring the real populated document but falling
 * back to the snapshot every request is created with.
 *
 * `property` only resolves once verification succeeds and Property.create()
 * reuses the pre-generated id `pendingPropertyData._id` was stamped with
 * (see property.routes.v1.js's webhook) — until then the ref points at a
 * document that doesn't exist yet, so `.populate('property', ...)` leaves it
 * `null`. `pendingPropertyData` is the name/category/place/owner the
 * onboarding app actually submitted, captured at request creation and never
 * cleared, so it's what every pending/sent/rejected row has to show instead
 * of "Not linked".
 */
const propertyFrom = (raw: any): VerificationEntity['property'] => {
  if (raw.property && typeof raw.property === 'object') {
    return {
      _id: raw.property._id || '',
      name: raw.property.name || 'Untitled property',
      category: raw.property.category || '',
      place: raw.property.place || '',
      ownerName: raw.property.ownerName || '',
    };
  }
  const snapshot = raw.pendingPropertyData;
  if (snapshot && typeof snapshot === 'object' && (snapshot.name || snapshot.place)) {
    return {
      _id: snapshot._id || '',
      name: snapshot.name || 'Untitled property',
      category: snapshot.category || '',
      place: snapshot.place || '',
      ownerName: snapshot.ownerName || '',
    };
  }
  return null;
};

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
  assignedVerifierMobileE164: raw.assignedVerifierMobileE164 || '',
  property: propertyFrom(raw),
});

export const verificationService = {
  /** Requests from the `verificationrequests` collection. */
  async getVerifications(params?: {
    search?: string;
    status?: string;
    /** Every onboarding attempt by this employee, from `pendingPropertyData.employeeEmail`. */
    employeeEmail?: string;
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
