import { api, unwrapList } from '../apiCaller';
import type {
  ApiResponse,
  PermissionAction,
  PermissionEntity,
  PermissionStatus,
} from '../types';

/** Map a raw `permissionrequests` document onto the shape the UI reads. */
const normalize = (raw: any): PermissionEntity => {
  const snapshot = raw.propertySnapshot || {};
  return {
    id: raw._id || raw.id,
    propertyRef: raw.propertyRef || '',
    propertyName: snapshot.name || 'Unnamed listing',
    propertyPlace: snapshot.place || '',
    propertyCategory: snapshot.category || '',
    ownerName: snapshot.ownerName || '',
    ownerMobile: snapshot.ownerMobile || '',
    employeeEmail: raw.employeeEmail || '',
    action: (raw.action || 'edit') as PermissionAction,
    reason: raw.reason || '',
    status: (raw.status || 'pending') as PermissionStatus,
    active: !!raw.active,
    decidedBy: raw.decidedBy || '',
    decidedAt: raw.decidedAt || null,
    usedAt: raw.usedAt || null,
    expiresAt: raw.expiresAt || null,
    requestedIp: raw.requestedIp || '',
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
};

export const permissionService = {
  /** Requests from the `permissionrequests` collection. */
  async getPermissions(params?: {
    status?: string;
    action?: string;
    employeeEmail?: string;
    propertyId?: string;
    search?: string;
  }): Promise<ApiResponse<PermissionEntity[]>> {
    const res = await api.get<any>('/permissions', params);
    return res.success ? { ...res, data: unwrapList(res.data).map(normalize) } : { ...res, data: [] };
  },

  /**
   * Record a decision. Granting opens a time-boxed window the employee can
   * spend once; every other status closes access immediately.
   */
  async decide(
    id: string,
    data: { status: PermissionStatus; decidedBy?: string; expiresInHours?: number }
  ): Promise<ApiResponse<PermissionEntity | null>> {
    const res = await api.put<any>(`/permissions/${id}`, data);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async deletePermission(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return api.delete<{ success: boolean }>(`/permissions/${id}`);
  },
};
