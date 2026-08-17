import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../api/userApi';
import { authApi } from '../api/authApi';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string, role?: 'ADMIN' | 'EMPLOYEE', adminCode?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('scriper_token'));
  const [loading, setLoading] = useState<boolean>(true);

  // Validate session on load
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('scriper_token');
      if (storedToken) {
        try {
          const res = await authApi.getMe(storedToken);
          if (res.success && res.data) {
            setUser(res.data);
            setToken(storedToken);
          } else {
            logout();
          }
        } catch (err) {
          console.error('Session validation error:', err);
          logout();
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await authApi.login({ email, password });
      if (res.success && res.data) {
        const { token: jwtToken, user: userProfile } = res.data;
        localStorage.setItem('scriper_token', jwtToken);
        setToken(jwtToken);
        setUser(userProfile);
        return { success: true };
      } else {
        return { success: false, error: res.error || 'Login failed.' };
      }
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error || err.message || 'Login failed.' };
    }
  };

  const register = async (name: string, email: string, password: string, role: 'ADMIN' | 'EMPLOYEE' = 'EMPLOYEE', adminCode?: string) => {
    try {
      const res = await authApi.register({ name, email, password, role, adminCode });
      if (res.success && res.data) {
        const { token: jwtToken, user: userProfile } = res.data;
        localStorage.setItem('scriper_token', jwtToken);
        setToken(jwtToken);
        setUser(userProfile);
        return { success: true };
      } else {
        return { success: false, error: res.error || 'Registration failed.' };
      }
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error || err.message || 'Registration failed.' };
    }
  };

  const logout = () => {
    localStorage.removeItem('scriper_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(user && token),
        loading,
        login,
        register,
        logout
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
