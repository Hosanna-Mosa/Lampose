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
  /**
   * A `401` proved the stored token is dead, but nothing has been cleared
   * yet. `apiClient`'s response interceptor dispatches `api:unauthorized` for
   * exactly that case (and only that case — a failed login/register attempt
   * carries no token, so it never fires this), and the effect below is the
   * only thing listening for it. It sets this flag rather than calling
   * `logout()` on the spot, because the whole point of this contract is that
   * nobody gets signed out silently; `SessionExpiredModal` reads the flag and
   * is the one place that actually calls `logout()`, from its one Logout
   * button.
   */
  sessionExpired: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('scriper_token'));
  const [loading, setLoading] = useState<boolean>(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    /* Flags the session as dead rather than calling `logout()` from here —
       signing someone out from underneath them, mid-click, on whatever page
       they're looking at, is the silent-logout behaviour this event exists
       to replace. `SessionExpiredModal` (mounted in App.tsx, above/beside
       MainAppContent so it renders regardless of auth state) is what
       actually calls `logout()`, once the person clicks its Logout button. */
    const handleUnauthorized = () => setSessionExpired(true);
    window.addEventListener('api:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('api:unauthorized', handleUnauthorized);
  }, []);

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
    // This is the one function that ends a session, expired or not, so it is
    // also the one place that resets the flag — a normal sign-out must clear
    // it too, or the dialog would still be "open" the moment someone signed
    // back in.
    setSessionExpired(false);
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
        logout,
        sessionExpired
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
