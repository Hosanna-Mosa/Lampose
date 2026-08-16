import { api, unwrapList } from '../apiCaller';
import type { AdminRole, AdminStatus, ApiResponse, PaginatedResult, UserEntity } from '../types';

const normalize = (raw: any): UserEntity => ({
  id: raw._id || raw.id,
  name: raw.name || 'Unnamed administrator',
  email: raw.email || '',
  role: (raw.role || 'Admin') as AdminRole,
  status: (raw.status || 'Active') as AdminStatus,
  avatar: raw.avatar || '',
  createdAt: raw.createdAt || null,
  lastLogin: raw.lastLogin || 'Never',
});

export const userService = {
  /** Administrators from the `admins` collection. */
  async getUsers(params?: {
    search?: string;
    status?: string;
    role?: string;
  }): Promise<ApiResponse<PaginatedResult<UserEntity>>> {
    const res = await api.get<any>('/admin/users', params);

    if (!res.success) {
      return { ...res, data: { items: [], total: 0, page: 1, pageSize: 0, totalPages: 0 } };
    }

    const items = unwrapList(res.data).map(normalize);
    return {
      ...res,
      data: {
        items,
        total: res.data?.total ?? items.length,
        page: res.data?.page ?? 1,
        pageSize: res.data?.pageSize ?? items.length,
        totalPages: res.data?.totalPages ?? 1,
      },
    };
  },

  async createUser(userData: {
    name: string;
    email: string;
    role: AdminRole;
    status?: AdminStatus;
    password?: string;
  }): Promise<ApiResponse<UserEntity>> {
    const res = await api.post<any>('/admin/users', userData);
    return res.success ? { ...res, data: normalize(res.data) } : res;
  },

  async updateUser(
    id: string,
    changes: { name?: string; role?: AdminRole; status?: AdminStatus }
  ): Promise<ApiResponse<UserEntity>> {
    const res = await api.put<any>(`/admin/users/${id}`, changes);
    return res.success ? { ...res, data: normalize(res.data) } : res;
  },

  async deleteUser(userId: string): Promise<ApiResponse<{ success: boolean }>> {
    return api.delete<{ success: boolean }>(`/admin/users/${userId}`);
  },
};
