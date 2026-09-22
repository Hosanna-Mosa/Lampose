import axios from 'axios';
import { API_URL_ROOT } from './config';

// Centralized Base URL - sourced from VITE_API_URL (frontend/.env)
export const API_BASE_URL = API_URL_ROOT;

// Centralized Axios Instance
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

// Centralized Request Interceptor - Attaches Authorization Bearer Token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('scriper_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Centralized Response Interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.code === 'ECONNABORTED') {
      console.warn('⚠️ API Request Timeout');
    }
    if (error.response && error.response.status === 401) {
      /*
       * A 401 here means one of two very different things, and only one of
       * them is a session going dead:
       *
       *   - The request carried a bearer token (the request interceptor
       *     above attached one) and the server refused it — expired,
       *     revoked, wrong-typed, whatever `code` in the body says. That is
       *     an in-session token dying, and the platform-wide contract is to
       *     show a blocking "Session expired" dialog rather than silently
       *     signing the person out from under whatever they were doing.
       *   - The request carried NO token — this is the login (or register)
       *     call itself, rejecting a wrong password with the same status
       *     code. That must fall straight through to the caller (LoginPage's
       *     own "Invalid credentials" message), not pop a dialog telling
       *     someone sitting at the login screen to log out.
       *
       * Checking the header that was actually attached, rather than matching
       * the URL against '/auth/login', keeps this correct for every present
       * and future anonymous endpoint without a hardcoded path list to keep
       * in sync.
       */
      const hadToken = Boolean(error.config?.headers?.Authorization);

      // Token expired or unauthorized
      localStorage.removeItem('scriper_token');

      if (hadToken) {
        // AuthContext listens for this and flags `sessionExpired` — it does
        // NOT clear the session itself. The dialog that flag drives is what
        // calls logout(), once a person clicks its Logout button.
        window.dispatchEvent(new CustomEvent('api:unauthorized'));
      }
    }
    return Promise.reject(error);
  }
);
