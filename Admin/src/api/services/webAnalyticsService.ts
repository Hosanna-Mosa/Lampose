import { api } from '../apiCaller';
import type {
  ApiResponse,
  GaEventsEntity,
  GaOverviewEntity,
  GaPagesEntity,
  GaRangePreset,
  GaTrafficEntity,
  GaUsersEntity,
} from '../types';

/** Query params shared by every GA4 endpoint — a preset, or `custom` with an
 *  explicit start/end. */
export interface GaQuery {
  range: GaRangePreset;
  startDate?: string;
  endDate?: string;
}

/**
 * GA4 website analytics, proxied through the backend's Google Analytics Data
 * API integration (GET /api/admin/analytics/*, admin-only). The service
 * account's credentials never reach the browser — every call here only ever
 * sees the aggregated report the backend already computed.
 */
export const webAnalyticsService = {
  async getOverview(query: GaQuery): Promise<ApiResponse<GaOverviewEntity | null>> {
    const res = await api.get<GaOverviewEntity>('/admin/analytics/overview', query);
    return res.success ? res : { ...res, data: null };
  },

  async getTraffic(query: GaQuery): Promise<ApiResponse<GaTrafficEntity | null>> {
    const res = await api.get<GaTrafficEntity>('/admin/analytics/traffic', query);
    return res.success ? res : { ...res, data: null };
  },

  async getPages(query: GaQuery, limit = 10): Promise<ApiResponse<GaPagesEntity | null>> {
    const res = await api.get<GaPagesEntity>('/admin/analytics/pages', { ...query, limit });
    return res.success ? res : { ...res, data: null };
  },

  async getUsers(query: GaQuery): Promise<ApiResponse<GaUsersEntity | null>> {
    const res = await api.get<GaUsersEntity>('/admin/analytics/users', query);
    return res.success ? res : { ...res, data: null };
  },

  async getEvents(query: GaQuery, limit = 10): Promise<ApiResponse<GaEventsEntity | null>> {
    const res = await api.get<GaEventsEntity>('/admin/analytics/events', { ...query, limit });
    return res.success ? res : { ...res, data: null };
  },
};
