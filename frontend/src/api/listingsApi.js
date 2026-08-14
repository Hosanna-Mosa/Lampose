import { apiClient } from './apiClient';
import { LISTINGS } from '../data/listings';

/**
 * Service for property and listing operations
 */
export const listingsApi = {
  /**
   * Fetch all listings with optional filtering
   * Falls back gracefully to local dataset if backend is unreachable
   */
  async getListings(params = {}) {
    try {
      const response = await apiClient.get('/listings', params);
      if (response && Array.isArray(response.data)) {
        return response.data;
      }
      if (Array.isArray(response)) {
        return response;
      }
    } catch (err) {
      console.warn('[ListingsAPI] Backend unreachable or returned error, using local fallback:', err.message);
    }
    return LISTINGS;
  },

  /**
   * Fetch a single listing by ID
   * Falls back gracefully to local dataset if backend is unreachable
   */
  async getListingById(id) {
    try {
      const response = await apiClient.get(`/listings/${id}`);
      if (response && response.data) {
        return response.data;
      }
      if (response && response.id) {
        return response;
      }
    } catch (err) {
      console.warn(`[ListingsAPI] Backend unreachable for ID ${id}, using local fallback:`, err.message);
    }
    return LISTINGS.find((item) => item.id === id) || null;
  },
};

export default listingsApi;
