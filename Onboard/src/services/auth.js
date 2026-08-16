// Authentication Service for Lampose Employee Onboarding Login

const STORAGE_TOKEN_KEY = 'lampose_auth_token';
const STORAGE_USER_KEY = 'lampose_auth_user';
const STORAGE_EMP_EMAIL_KEY = 'lampose_employee_email';
const STORAGE_AUTH_URL_KEY = 'lampose_custom_auth_url';

// Default auth endpoint specified by backend team
export const DEFAULT_AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || 'https://api.leads.lampose.com/api/auth/onboarding-login';

/**
 * Get active auth backend URL (respects runtime custom URL or .env)
 */
export function getAuthApiUrl() {
  return localStorage.getItem(STORAGE_AUTH_URL_KEY) || DEFAULT_AUTH_API_URL;
}

/**
 * Update the auth backend URL at runtime
 */
export function setAuthApiUrl(url) {
  if (url && url.trim()) {
    localStorage.setItem(STORAGE_AUTH_URL_KEY, url.trim());
  } else {
    localStorage.removeItem(STORAGE_AUTH_URL_KEY);
  }
}

/**
 * Retrieve saved JWT/session token
 */
export function getAuthToken() {
  return localStorage.getItem(STORAGE_TOKEN_KEY) || null;
}

/**
 * Retrieve saved employee email string
 */
export function getSavedEmployeeEmail() {
  return localStorage.getItem(STORAGE_EMP_EMAIL_KEY) || '';
}

/**
 * Retrieve current logged-in employee profile
 */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(STORAGE_USER_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && !parsed.email) {
      parsed.email = localStorage.getItem(STORAGE_EMP_EMAIL_KEY) || '';
    }
    return parsed;
  } catch (e) {
    console.error('Failed to parse saved user profile:', e);
    return null;
  }
}

/**
 * Save auth token & employee profile
 */
export function setAuthSession(token, employee) {
  if (token) localStorage.setItem(STORAGE_TOKEN_KEY, token);
  if (employee) {
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(employee));
    if (employee.email) {
      localStorage.setItem(STORAGE_EMP_EMAIL_KEY, employee.email);
    }
  }
}

/**
 * Clear session on logout
 */
export function logout() {
  localStorage.removeItem(STORAGE_TOKEN_KEY);
  localStorage.removeItem(STORAGE_USER_KEY);
  localStorage.removeItem(STORAGE_EMP_EMAIL_KEY);
}

/**
 * Authenticate employee with email & password
 * POST to endpoint with:
 * Body: { "email": "employee_email", "password": "employee_password" }
 * Header: Content-Type: application/json
 */
export async function loginUser(credentials) {
  const endpoint = getAuthApiUrl();
  const inputEmail = credentials.email ? credentials.email.trim() : '';

  console.log(`🔐 [Employee Auth] POST -> ${endpoint}`);
  console.log(`   📧 Employee Login Email: "${inputEmail}"`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: inputEmail,
        password: credentials.password
      })
    });

    const data = await response.json().catch(() => ({}));

    // Success response: HTTP 200 with { success: true, valid: true, data: { token: "...", employee: { ... } } }
    if (response.ok && (data.success || data.valid || data.data?.token)) {
      const token = data.data?.token || data.token || 'session_token';
      
      const rawEmployee = data.data?.employee || data.employee || data.data?.user || data.user || {};
      
      const employee = {
        userId: rawEmployee.userId || rawEmployee.id || rawEmployee._id || 'emp_' + Date.now(),
        name: rawEmployee.name || (inputEmail ? inputEmail.split('@')[0] : 'Employee'),
        email: rawEmployee.email || inputEmail,
        role: rawEmployee.role || 'EMPLOYEE',
        avatar: rawEmployee.avatar || ''
      };

      console.log(`   ✅ [Auth Success] Authorized employee: "${employee.name}" (${employee.email})`);
      setAuthSession(token, employee);

      return {
        success: true,
        valid: true,
        token,
        user: employee,
        data: data.data || data
      };
    }

    // Error response: HTTP 401 with { success: false, valid: false, error: "Invalid email or password." }
    console.warn(`   ❌ [Auth Failed] Status: ${response.status} | Error:`, data.error || data.message);

    return {
      success: false,
      valid: false,
      error: data.error || data.message || 'Invalid email or password.'
    };
  } catch (err) {
    console.error(`   ❌ [Auth Network Error]:`, err);
    return {
      success: false,
      valid: false,
      error: `Could not connect to authentication endpoint (${endpoint}). Please verify server availability.`
    };
  }
}
