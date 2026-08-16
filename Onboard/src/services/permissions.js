// Permission requests — an employee asks an administrator for edit or delete
// rights on a listing, and every ask is recorded in the database.

import axios from 'axios';
import { API_ROOT, employeeHeaders } from './api.js';
import { getCurrentUser, getSavedEmployeeEmail } from './auth.js';

const PERMISSIONS_URL = `${API_ROOT}/permissions`;

export const ACTION_LABELS = {
  edit: 'Edit this listing',
  delete: 'Delete this listing',
};

/** Email of the employee whose rights are being resolved. */
export const activeEmployeeEmail = () =>
  getCurrentUser()?.email || getSavedEmployeeEmail() || '';

const readError = (error) => {
  if (error.response && error.response.data) {
    return { success: false, ...error.response.data };
  }
  return { success: false, error: error.message };
};

/**
 * What this employee may currently do with this listing. Returns a
 * `permissions` map keyed by action, each with `allowed` and the status of the
 * latest request so the UI can explain *why* a button is locked.
 */
export const fetchPropertyAccess = async (propertyId) => {
  const employeeEmail = activeEmployeeEmail();
  if (!propertyId || !employeeEmail) {
    return { success: false, error: 'Missing property or employee identity.' };
  }

  try {
    const response = await axios.get(`${PERMISSIONS_URL}/access`, {
      params: { propertyId, employeeEmail },
      headers: employeeHeaders(),
    });
    return response.data;
  } catch (error) {
    return readError(error);
  }
};

/** Ask an administrator for permission. The record starts life as pending. */
export const requestPermission = async ({ property, action, reason }) => {
  const employeeEmail = activeEmployeeEmail();
  if (!employeeEmail) {
    return { success: false, error: 'You must be signed in to request permission.' };
  }

  try {
    const response = await axios.post(
      PERMISSIONS_URL,
      {
        propertyId: property._id,
        employeeEmail,
        action,
        reason,
        property: {
          name: property.name,
          place: property.place,
          category: property.category,
          ownerName: property.ownerName,
          ownerMobile: property.ownerMobile,
        },
      },
      { headers: employeeHeaders() }
    );
    return response.data;
  } catch (error) {
    return readError(error);
  }
};
