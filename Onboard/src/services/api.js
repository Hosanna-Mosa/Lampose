import axios from 'axios';
import { getCurrentUser, getSavedEmployeeEmail } from './auth.js';

const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  || (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL)
  || 'http://localhost:5000/api/properties';

/** Root of the API (…/api), derived from the properties endpoint. */
export const API_ROOT = API_BASE_URL.replace(/\/properties\/?$/, '');

/**
 * Identifies the signed-in employee on every write. The backend refuses an
 * edit or delete carrying this header unless an administrator has granted that
 * employee permission for that listing.
 */
export const employeeHeaders = () => {
  const email = getCurrentUser()?.email || getSavedEmployeeEmail() || '';
  return email ? { 'x-employee-email': email } : {};
};

/** Prefer the server's own explanation over a generic transport message. */
const readError = (error) => {
  if (error.response && error.response.data) {
    return { success: false, ...error.response.data };
  }
  return { success: false, error: error.message };
};

export const fetchProperties = async (params = {}) => {
  try {
    const response = await axios.get(API_BASE_URL, { params });
    return response.data;
  } catch (error) {
    console.warn('Backend API unreachable or offline, using fallback response:', error.message);
    return { success: false, error: error.message };
  }
};

export const fetchPropertyById = async (id) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/${id}`);
    return response.data;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const onboardProperty = async (propertyData) => {
  try {
    const response = await axios.post(API_BASE_URL, propertyData);
    return response.data;
  } catch (error) {
    console.error('Error in onboardProperty API:', error);
    if (error.response && error.response.data) {
      return error.response.data;
    }
    return { success: false, error: 'Network error or backend unavailable.' };
  }
};

export const updateProperty = async (id, changes) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/${id}`, changes, { headers: employeeHeaders() });
    return response.data;
  } catch (error) {
    return readError(error);
  }
};

export const deleteProperty = async (id) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/${id}`, { headers: employeeHeaders() });
    return response.data;
  } catch (error) {
    return readError(error);
  }
};
