import { apiClient } from '../api/apiClient';

export const fetchProperties = async (params = {}) => {
  try {
    const response = await apiClient.get('/properties', { params });
    return response.data;
  } catch (error) {
    console.warn('Backend API unreachable or offline, using fallback response:', error.message);
    return { success: false, error: error.message };
  }
};

export const fetchPropertyById = async (id) => {
  try {
    const response = await apiClient.get(`/properties/${id}`);
    return response.data;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const onboardProperty = async (propertyData) => {
  try {
    const response = await apiClient.post('/properties', propertyData);
    return response.data;
  } catch (error) {
    console.error('Error in onboardProperty API:', error);
    if (error.response && error.response.data) {
      return error.response.data;
    }
    return { success: false, error: 'Network error or backend unavailable.' };
  }
};

export const deleteProperty = async (id) => {
  try {
    const response = await apiClient.delete(`/properties/${id}`);
    return response.data;
  } catch (error) {
    return { success: false, error: error.message };
  }
};
