import { api } from '../apiCaller';
import type { ApiResponse, UserEntity, AdminRole } from '../types';

export interface AuthResponseData {
  token: string;
  user: UserEntity;
}

export const authService = {
  /**
   * Login Admin with email & password
   */
  async login(email: string, password: string): Promise<ApiResponse<AuthResponseData>> {
    return api.post<AuthResponseData>('/admin/login', { email, password });
  },

  /**
   * Register a new Admin with Mandatory Backend Secret Key verification
   */
  async register(
    name: string,
    email: string,
    password: string,
    role: AdminRole,
    adminSecretKey: string
  ): Promise<ApiResponse<AuthResponseData>> {
    return api.post<AuthResponseData>('/admin/register', {
      name,
      email,
      password,
      role,
      adminSecretKey,
    });
  },
};
