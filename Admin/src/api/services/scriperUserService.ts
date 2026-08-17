import { api, unwrapList } from '../apiCaller';
import type { ApiResponse, ScriperUserEntity, ScriperUserRole } from '../types';

/** Map a raw `scriper_users` document onto the shape the UI reads. Keyed by
 *  `userId`, not Mongo `_id` — that's what the store's routes take. */
const normalize = (raw: any): ScriperUserEntity => ({
  id: raw.userId || raw._id || raw.id,
  name: raw.name || 'Unnamed user',
  email: raw.email || '',
  role: (raw.role || 'EMPLOYEE') as ScriperUserRole,
  avatar: raw.avatar || '',
  createdAt: raw.createdAt || null,
});

export const scriperUserService = {
  /** Leads-panel accounts, from the `scriper_users` collection. Super Admin only. */
  async getScriperUsers(): Promise<ApiResponse<ScriperUserEntity[]>> {
    const res = await api.get<any>('/admin/scriper-users');
    return res.success ? { ...res, data: unwrapList(res.data).map(normalize) } : { ...res, data: [] };
  },

  async createScriperUser(payload: {
    name: string;
    email: string;
    role: ScriperUserRole;
    password?: string;
  }): Promise<ApiResponse<ScriperUserEntity | null>> {
    const res = await api.post<any>('/admin/scriper-users', payload);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async updateScriperUser(
    userId: string,
    changes: Partial<{ name: string; email: string; role: ScriperUserRole; password: string }>
  ): Promise<ApiResponse<ScriperUserEntity | null>> {
    const res = await api.put<any>(`/admin/scriper-users/${userId}`, changes);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async deleteScriperUser(userId: string): Promise<ApiResponse<{ success: boolean }>> {
    return api.delete<{ success: boolean }>(`/admin/scriper-users/${userId}`);
  },
};
