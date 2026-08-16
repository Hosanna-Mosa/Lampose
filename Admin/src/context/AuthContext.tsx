import React, { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '../api/services/authService';
import type { UserEntity } from '../api/types';

interface AuthContextType {
  user: UserEntity | null;
  isAuthenticated: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (
    name: string,
    email: string,
    password: string,
    role: 'Super Admin' | 'Admin' | 'Editor' | 'Viewer',
    adminSecretKey: string
  ) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('admin_access_token'));
  const [user, setUser] = useState<UserEntity | null>(() => {
    const savedUser = localStorage.getItem('admin_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  useEffect(() => {
    // Global event listener for API 401 unauthorized responses
    const handleUnauthorized = () => {
      console.warn('[AuthContext] Session expired or unauthorized response detected.');
      logout();
    };

    window.addEventListener('api:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('api:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authService.login(email, password);
    if (res.success && res.data) {
      setToken(res.data.token);
      setUser(res.data.user);
      localStorage.setItem('admin_access_token', res.data.token);
      localStorage.setItem('admin_user', JSON.stringify(res.data.user));
      return { success: true };
    }
    return { success: false, message: res.message || 'Login failed.' };
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    role: 'Super Admin' | 'Admin' | 'Editor' | 'Viewer',
    adminSecretKey: string
  ) => {
    const res = await authService.register(name, email, password, role, adminSecretKey);
    if (res.success && res.data) {
      setToken(res.data.token);
      setUser(res.data.user);
      localStorage.setItem('admin_access_token', res.data.token);
      localStorage.setItem('admin_user', JSON.stringify(res.data.user));
      return { success: true };
    }
    return { success: false, message: res.message || 'Registration failed.' };
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!token && !!user,
        token,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
