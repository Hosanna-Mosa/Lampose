import { apiClient } from './apiClient';

export interface User {
  userId: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE';
  avatar?: string;
}

export const userApi = {
  async getUsers(): Promise<{ success: boolean; count: number; data: User[] }> {
    const res = await apiClient.get('/users');
    return res.data;
  },

  async createUser(userData: { name: string; email: string; password?: string; role: 'ADMIN' | 'EMPLOYEE'; avatar?: string }): Promise<{ success: boolean; data: User }> {
    const res = await apiClient.post('/users', userData);
    return res.data;
  },

  /**
   * Edit an account. Every field is optional — send only what changed.
   *
   * `password` SETS a new one; there is no way to read the existing one. The
   * server stores a bcrypt hash and strips it from every response, so no read
   * path anywhere holds the plaintext. Resetting is the operation that
   * actually unblocks a locked-out employee.
   */
  async updateUser(
    userId: string,
    changes: { name?: string; email?: string; role?: 'ADMIN' | 'EMPLOYEE'; avatar?: string; password?: string },
  ): Promise<{ success: boolean; message?: string; data: User }> {
    const res = await apiClient.put(`/users/${userId}`, changes);
    return res.data;
  },

  async deleteUser(userId: string): Promise<{ success: boolean; message?: string }> {
    const res = await apiClient.delete(`/users/${userId}`);
    return res.data;
  }
};
