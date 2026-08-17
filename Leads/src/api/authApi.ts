import { apiClient } from './apiClient';
import { User } from './userApi';

export interface AuthResponse {
  success: boolean;
  message?: string;
  data?: {
    token: string;
    user: User;
  };
  error?: string;
}

export const authApi = {
  async register(data: { name: string; email: string; password: string; role?: 'ADMIN' | 'EMPLOYEE'; adminCode?: string }): Promise<AuthResponse> {
    const res = await apiClient.post('/auth/register', data);
    return res.data;
  },

  async login(data: { email: string; password: string }): Promise<AuthResponse> {
    const res = await apiClient.post('/auth/login', data);
    return res.data;
  },

  async getMe(_token?: string): Promise<{ success: boolean; data: User }> {
    const res = await apiClient.get('/auth/me');
    return res.data;
  }
};
