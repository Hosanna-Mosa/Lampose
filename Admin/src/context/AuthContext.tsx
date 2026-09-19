/* ══════════════════════════════════════════════════════════════════════════
   Who is signed in — and which of the two consoles they signed in to.

   This app has two front doors:

     'admin'       Lampose staff. An `admins` account, `typ: 'admin'`, from
                   POST /api/v1/admin/login. Sees the whole platform,
                   narrowed by the role on the account.
     'restaurant'  a restaurant OWNER. A `food_restaurants` account,
                   `typ: 'restaurant_admin'`, from
                   POST /api/v1/restaurant-admin/login. Sees one shop — their
                   own orders and their own menu — and nothing else.

   The two are different identity systems on the backend with different
   guards, and neither token is accepted by the other's routes.

   ## Only one session at a time, and that is deliberate

   Signing in either way clears the other's keys before writing its own, and
   `lampose_session_kind` records which is live. `axiosInstance` reads that key
   to decide which token to attach.

   The alternative — letting both sit in `localStorage` and picking whichever
   is present — was the obvious shape and is the wrong one. A staff token left
   behind from this morning would be attached to an owner's request, the
   server would refuse it, and the 401 would sign the owner out of a console
   they had just signed in to. Worse in the other direction: an owner's stale
   token on a staff request produces the same 401, and the person reading the
   screen has no way to tell a broken session from an expired one. One session,
   named, and the ambiguity does not exist.

   ## `identity` is what the chrome renders

   The sidebar footer and the header menu show a name, a line under it and an
   avatar. Those exist for both kinds of session and mean different things —
   an administrator's role, a restaurant's trading status — so the chrome
   reads this one derived object rather than branching on `user` vs
   `restaurant` in two components. `user` stays exactly what it was for every
   page that reads a role off it; it is null on a restaurant session, which is
   the honest answer.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '../api/services/authService';
import { restaurantAdminService } from '../api/services/restaurantAdminService';
import type { RestaurantProfile } from '../api/services/restaurantAdminService';
import {
  ADMIN_TOKEN_KEY,
  RESTAURANT_TOKEN_KEY,
  SESSION_KIND_KEY,
} from '../api/axiosInstance';
import type { AdminRole, UserEntity } from '../api/types';
import { disconnectSupportSocket } from '../lib/supportSocket';

/** Which console this session belongs to. */
export type SessionKind = 'admin' | 'restaurant';

/** The name, subtitle and picture the chrome draws for either kind. */
export interface Identity {
  name: string;
  /** The administrator's email, or the restaurant's owner email. */
  email: string;
  /** The administrator's role, or the restaurant's trading status. */
  role: string;
  avatar?: string;
}

const ADMIN_USER_KEY = 'admin_user';
const RESTAURANT_PROFILE_KEY = 'restaurant_profile';

interface AuthContextType {
  /** Which door this session came through; null when signed out. */
  kind: SessionKind | null;
  /** The administrator — null on a restaurant session. */
  user: UserEntity | null;
  /** The restaurant — null on a staff session. */
  restaurant: RestaurantProfile | null;
  /** What the sidebar and header render. Null when signed out. */
  identity: Identity | null;
  isAuthenticated: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  loginAsRestaurant: (
    identifier: string,
    password: string
  ) => Promise<{ success: boolean; message?: string }>;
  register: (
    name: string,
    email: string,
    password: string,
    role: AdminRole,
    adminSecretKey: string
  ) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  /** Keep the stored restaurant profile in step after the owner changes it. */
  updateRestaurant: (patch: Partial<RestaurantProfile>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Read a JSON value that a previous session wrote, without trusting it. */
const readStored = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    /* A half-written or hand-edited value is not a session. Falling back to
       signed-out is right: the token is checked by the server on the next
       request anyway, and a crash in a state initialiser white-screens the
       whole app before anything can catch it. */
    return null;
  }
};

const storedKind = (): SessionKind | null => {
  const raw = localStorage.getItem(SESSION_KIND_KEY);
  if (raw === 'restaurant') return 'restaurant';
  /* Absent means the staff console, so a tab opened before the restaurant
     door existed keeps the session it already has. */
  if (raw === 'admin' || localStorage.getItem(ADMIN_TOKEN_KEY)) return 'admin';
  return null;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [kind, setKind] = useState<SessionKind | null>(storedKind);
  const [token, setToken] = useState<string | null>(() => {
    const k = storedKind();
    if (!k) return null;
    return localStorage.getItem(k === 'restaurant' ? RESTAURANT_TOKEN_KEY : ADMIN_TOKEN_KEY);
  });
  const [user, setUser] = useState<UserEntity | null>(() => readStored<UserEntity>(ADMIN_USER_KEY));
  const [restaurant, setRestaurant] = useState<RestaurantProfile | null>(() =>
    readStored<RestaurantProfile>(RESTAURANT_PROFILE_KEY)
  );

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

  /**
   * Clear BOTH sessions.
   *
   * Called before either sign-in as well as on sign-out, so a new session
   * never starts beside the remains of an old one — see the file header on
   * why two tokens in `localStorage` is a bug rather than a convenience.
   */
  const clearSessions = () => {
    localStorage.removeItem(SESSION_KIND_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
    localStorage.removeItem(RESTAURANT_TOKEN_KEY);
    localStorage.removeItem(RESTAURANT_PROFILE_KEY);
    setUser(null);
    setRestaurant(null);
  };

  const login = async (email: string, password: string) => {
    const res = await authService.login(email, password);
    if (res.success && res.data) {
      clearSessions();
      localStorage.setItem(SESSION_KIND_KEY, 'admin');
      localStorage.setItem(ADMIN_TOKEN_KEY, res.data.token);
      localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(res.data.user));
      setKind('admin');
      setToken(res.data.token);
      setUser(res.data.user);
      return { success: true };
    }
    return { success: false, message: res.message || 'Login failed.' };
  };

  /**
   * The owner's door. Same shape as `login`, a different endpoint and a
   * different token type — see `restaurantAdminService`.
   *
   * A rejected application is refused at sign-in with ACCOUNT_REJECTED and
   * the reason in `message`, rather than being handed a session the next
   * request would throw out. That sentence is passed through untouched: it is
   * the only thing on the screen that tells the owner what to do next.
   */
  const loginAsRestaurant = async (identifier: string, password: string) => {
    const res = await restaurantAdminService.login(identifier, password);
    if (res.success && res.data?.token) {
      clearSessions();
      localStorage.setItem(SESSION_KIND_KEY, 'restaurant');
      localStorage.setItem(RESTAURANT_TOKEN_KEY, res.data.token);
      localStorage.setItem(RESTAURANT_PROFILE_KEY, JSON.stringify(res.data.restaurant));
      setKind('restaurant');
      setToken(res.data.token);
      setRestaurant(res.data.restaurant);
      return { success: true };
    }
    return { success: false, message: res.message || 'Sign-in failed.' };
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    role: AdminRole,
    adminSecretKey: string
  ) => {
    const res = await authService.register(name, email, password, role, adminSecretKey);
    if (res.success && res.data) {
      clearSessions();
      localStorage.setItem(SESSION_KIND_KEY, 'admin');
      localStorage.setItem(ADMIN_TOKEN_KEY, res.data.token);
      localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(res.data.user));
      setKind('admin');
      setToken(res.data.token);
      setUser(res.data.user);
      return { success: true };
    }
    return { success: false, message: res.message || 'Registration failed.' };
  };

  /** After the owner opens or closes the kitchen, so the header stops lying. */
  const updateRestaurant = (patch: Partial<RestaurantProfile>) => {
    setRestaurant((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(RESTAURANT_PROFILE_KEY, JSON.stringify(next));
      } catch {
        /* A full or blocked store is not a reason to leave the screen wrong;
           the value is re-read from /summary on the next load either way. */
      }
      return next;
    });
  };

  const logout = () => {
    /*
     * The socket goes FIRST, before the token is cleared.
     *
     * This console is a single-page app: signing out never reloads the page,
     * so a live socket survives it in module state and the next person to sign
     * in on the same workstation inherits the previous agent's connection —
     * which sits in the server's `support` room, the deliberate firehose
     * carrying every safety report and every requester's phone number on the
     * platform. Clearing `localStorage` does nothing to a connection that was
     * authenticated at its handshake and is never re-checked.
     *
     * Ordered first so that even if a later line throws, the stream is already
     * closed. `connectSupportSocket` also refuses to reuse a socket opened
     * with a different token, so this is one of two independent guards.
     *
     * It runs on a restaurant sign-out too. That session never opens the
     * support socket, so there is normally nothing to close — but this is the
     * one function that ends a session, and a close that is a no-op is
     * cheaper than remembering which kinds of session could have opened one.
     */
    disconnectSupportSocket();

    setToken(null);
    setKind(null);
    clearSessions();
  };

  const identity: Identity | null = (() => {
    if (kind === 'admin' && user) {
      return { name: user.name, email: user.email, role: user.role, avatar: user.avatar };
    }
    if (kind === 'restaurant' && restaurant) {
      return {
        name: restaurant.restaurantName,
        email: restaurant.ownerEmail || restaurant.ownerPhone,
        /* The line under the name answers "what am I signed in as", and for an
           owner the useful answer is whether the shop is trading — not the
           word "Restaurant", which they can see from the nav. */
        role: restaurant.isCurrentlyOpen ? 'Restaurant · Open' : 'Restaurant · Closed',
        avatar: restaurant.logoUrl,
      };
    }
    return null;
  })();

  /* A session is real only when the token AND the profile behind it are both
     present. Either one alone is a half-written sign-in, and letting it
     through renders a console with no name in the header and no id to query
     with. */
  const isAuthenticated = Boolean(
    token && ((kind === 'admin' && user) || (kind === 'restaurant' && restaurant))
  );

  return (
    <AuthContext.Provider
      value={{
        kind,
        user,
        restaurant,
        identity,
        isAuthenticated,
        token,
        login,
        loginAsRestaurant,
        register,
        logout,
        updateRestaurant,
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
