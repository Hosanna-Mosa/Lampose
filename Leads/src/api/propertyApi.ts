import { apiClient } from './apiClient';

export interface PropertyCategoryDetails {
  foodIncluded?: boolean;
  foodType?: string;
  sharingTypes?: string[];
  acAvailable?: boolean;
  curfewTime?: string;
  housekeeping?: boolean;
  hostelType?: string;
  roomTypes?: string[];
  canteenFacility?: boolean;
  wardenContact?: string;
  securityCCTV?: boolean;
  studyRoom?: boolean;
  totalBeds?: number;
  rateType?: string;
  bedType?: string;
  lockersAvailable?: boolean;
  washroomsCount?: number;
  checkInTime?: string;
  roomType?: string;
  furnishing?: string;
  allowedTenants?: string;
  kitchenAvailable?: boolean;
  waterSupply?: string;
  [key: string]: any;
}

export interface Property {
  _id: string;
  name: string;
  place: string;
  ownerName: string;
  ownerMobile: string;
  category: 'PG' | 'Hostel' | 'Dormitory' | 'Bachelor Room';
  stayType?: 'Short Stay' | 'Long Stay' | 'Both Short & Long Stay';
  shortStayDuration?: string;
  dailyPrice?: number;
  longStayDuration?: string;
  monthlyPrice?: number;
  rent: number;
  deposit?: number;
  address?: string;
  imageUrl?: string;
  amenities?: string[];
  categoryDetails?: PropertyCategoryDetails;
  createdAt?: string;
}

export interface FetchPropertiesFilters {
  category?: string;
  search?: string;
  place?: string;
  stayType?: string;
}

export const propertyApi = {
  // Get all properties with optional filters
  async getProperties(filters: FetchPropertiesFilters = {}): Promise<{ success: boolean; count: number; data: Property[] }> {
    const res = await apiClient.get('/properties', { params: filters });
    return res.data;
  },

  // Get single property by ID
  async getPropertyById(id: string): Promise<{ success: boolean; data: Property }> {
    const res = await apiClient.get(`/properties/${id}`);
    return res.data;
  },

  // Onboard new property
  async createProperty(propertyData: Partial<Property>): Promise<{ success: boolean; message: string; data: Property }> {
    const res = await apiClient.post('/properties', propertyData);
    return res.data;
  },

  // Delete property
  async deleteProperty(id: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.delete(`/properties/${id}`);
    return res.data;
  }
};
