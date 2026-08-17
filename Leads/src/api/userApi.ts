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

  async deleteUser(userId: string): Promise<{ success: boolean; message?: string }> {
    const res = await apiClient.delete(`/users/${userId}`);
    return res.data;
  }
};
