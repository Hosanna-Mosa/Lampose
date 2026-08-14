/**
 * Centralized API Client for Lampose Frontend
 * Uses VITE_API_BASE_URL from environment variables (.env)
 */

const getBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) {
    // Trim trailing slashes for consistency
    return envUrl.replace(/\/+$/, '');
  }
  // Default fallback for development
  return 'http://localhost:5000/api';
};

export const API_BASE_URL = getBaseUrl();

/**
 * Core HTTP Request handler with error handling
 * @param {string} endpoint - API path (e.g. '/listings' or '/health')
 * @param {object} options - Fetch options (method, headers, body, etc.)
 */
export async function apiRequest(endpoint, options = {}) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${cleanEndpoint}`;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}),
    },
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(url, config);

    // Handle 204 No Content
    if (response.status === 204) {
      return { success: true, data: null };
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data?.message || data?.error || `HTTP ${response.status}: ${response.statusText}`;
      console.error(`[API Error] ${config.method || 'GET'} ${url} ->`, errorMsg);
      throw new Error(errorMsg);
    }

    return data;
  } catch (error) {
    console.error(`[API Network Error] ${config.method || 'GET'} ${url}:`, error.message);
    throw error;
  }
}

/**
 * Convenience methods
 */
export const apiClient = {
  baseUrl: API_BASE_URL,

  get(endpoint, params = {}) {
    let url = endpoint;
    const query = new URLSearchParams();
    
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        query.append(key, val);
      }
    });

    const queryString = query.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }

    return apiRequest(url, { method: 'GET' });
  },

  post(endpoint, body) {
    return apiRequest(endpoint, { method: 'POST', body });
  },

  put(endpoint, body) {
    return apiRequest(endpoint, { method: 'PUT', body });
  },

  delete(endpoint) {
    return apiRequest(endpoint, { method: 'DELETE' });
  },
};

export default apiClient;
