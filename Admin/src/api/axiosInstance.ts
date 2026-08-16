import axios, { type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from './types';

/** API Base URL read exclusively from environment configuration (.env) */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:5001/api';

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

// Utility to fetch token
const getAuthToken = (): string | null => {
  return localStorage.getItem('admin_access_token');
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
      console.log(`[API Request] [${config.method?.toUpperCase()}] ${config.url}`, config.params || config.data || '');
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
      console.log(`[API Response] [${response.status}] ${response.config.url}`, response.data);
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
