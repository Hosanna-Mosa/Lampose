import axios, { type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from './types';

/** API Base URL read exclusively from environment configuration (.env) */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:8026/api';

/** Backward compatibility alias for API Base URL */
export const DEFAULT_BASE_URL = API_BASE_URL;

export const getBaseUrl = (): string => API_BASE_URL;

/**
 * Centralized Axios Instance setup
 */
export const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/*
 * The token for whichever console is signed in.
 *
 * Two different people sign in through this app now, against two different
 * identity systems on the backend:
 *
 *   'admin'       Lampose staff — an `admins` account, `typ: 'admin'`,
 *                 issued by /api/v1/admin/login. Reaches every /admin/* route.
 *   'restaurant'  a restaurant OWNER — a `food_restaurants` account,
 *                 `typ: 'restaurant_admin'`, issued by
 *                 /api/v1/restaurant-admin/login. Reaches /restaurant-admin/*
 *                 and nothing else.
 *
 * `lampose_session_kind` says which one is live, and only ever one is: signing
 * in as either clears the other (see AuthContext). Reading the kind rather
 * than preferring whichever key happens to hold a value is what stops a stale
 * token left behind by a previous session from being sent on behalf of the
 * current one — a staff token going out with an owner's request would be
 * refused, and the refusal would arrive as a 401 that signs the owner out of a
 * console they had just signed in to.
 *
 * The key defaults to the staff console when it is absent, so a tab opened
 * before this existed keeps working with the session it already has.
 */
export const SESSION_KIND_KEY = 'lampose_session_kind';
export const ADMIN_TOKEN_KEY = 'admin_access_token';
export const RESTAURANT_TOKEN_KEY = 'restaurant_access_token';

const getAuthToken = (): string | null => {
  const kind = localStorage.getItem(SESSION_KIND_KEY);
  return localStorage.getItem(kind === 'restaurant' ? RESTAURANT_TOKEN_KEY : ADMIN_TOKEN_KEY);
};

/**
 * REQUEST INTERCEPTOR
 * Attaches auth headers, correlation IDs, and logs outgoing calls.
 */
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAuthToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Attach correlation ID for request tracing
    if (config.headers) {
      config.headers['X-Correlation-ID'] = `admin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    if (import.meta.env.DEV) {
      // Method + URL only — never the body. A login POST's body is
      // { email, password }, and printing it would put a credential in the
      // console on every request made from this machine.
      console.log(`[API Request] [${config.method?.toUpperCase()}] ${config.url}`);
    }

    return config;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

/**
 * RESPONSE INTERCEPTOR
 * Intercepts responses and formats errors centrally.
 */
axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    if (import.meta.env.DEV) {
      // Status + URL only — a login/register response body carries the
      // session token (and a restaurant-profile response carries owner PII),
      // so the payload itself is never logged.
      console.log(`[API Response] [${response.status}] ${response.config.url}`);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Standardized ApiError construction
    const formattedError: ApiError = {
      message: 'An unexpected error occurred.',
      status: error.response?.status || 500,
      code: error.code || 'UNKNOWN_ERROR',
      timestamp: new Date().toISOString(),
    };

    if (error.response) {
      const { status, data } = error.response;
      formattedError.status = status;
      formattedError.message = data?.message || data?.error || `HTTP Error ${status}`;
      formattedError.errors = data?.errors;
      formattedError.data = data;

      // Handle specific HTTP Status Codes
      switch (status) {
        case 401: {
          // Token expired or invalid
          console.warn('[API Auth] 401 Unauthorized - Token expired or invalid.');
          // Event dispatch so AuthContext can handle logout / refresh smoothly
          window.dispatchEvent(new CustomEvent('api:unauthorized'));
          break;
        }
        case 403:
          console.warn('[API Auth] 403 Forbidden - Access denied.');
          break;
        case 404:
          console.warn('[API 404] Resource not found:', originalRequest.url);
          break;
        case 500:
        case 502:
        case 503:
          console.error('[API Server Error] Internal server error:', status);
          break;
        default:
          break;
      }
    } else if (error.request) {
      // Network failure or backend server offline
      formattedError.message = 'Backend server unreachable. Please check your network connection or API URL.';
      formattedError.code = 'NETWORK_ERROR';
      console.warn('[API Network Error] Backend server offline or request timed out.');
    } else {
      formattedError.message = error.message;
    }

    return Promise.reject(formattedError);
  }
);
