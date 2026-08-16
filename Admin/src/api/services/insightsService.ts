import { api, unwrapList } from '../apiCaller';
import type {
  ActivityEntity,
  ApiResponse,
  HealthEntity,
  OnboarderEntity,
  StatsEntity,
  SystemEntity,
  VerifierEntity,
} from '../types';

/**
 * Dashboard aggregates, the activity feed and runtime telemetry — all computed
 * server-side from the live collections.
 */
export const insightsService = {
  async getStats(days = 30): Promise<ApiResponse<StatsEntity | null>> {
    const res = await api.get<StatsEntity>('/admin/stats', { days });
    return res.success ? res : { ...res, data: null };
  },

  async getActivity(limit = 12): Promise<ApiResponse<ActivityEntity[]>> {
    const res = await api.get<{ items: ActivityEntity[] }>('/admin/activity', { limit });
    return res.success ? { ...res, data: res.data?.items ?? [] } : { ...res, data: [] };
  },

  async getSystem(): Promise<ApiResponse<SystemEntity | null>> {
    const res = await api.get<SystemEntity>('/admin/system');
    return res.success ? res : { ...res, data: null };
  },

  /** Every onboarding employee's funnel — total / verified / pending / rejected. */
  async getOnboarders(params?: { search?: string }): Promise<ApiResponse<OnboarderEntity[]>> {
    const res = await api.get<any>('/admin/onboarders', params);
    return res.success ? { ...res, data: unwrapList(res.data) } : { ...res, data: [] };
  },

  /** The verification team's workload — how many requests each verifier was
   *  handed, and how those turned out. */
  async getVerifiers(): Promise<ApiResponse<VerifierEntity[]>> {
    const res = await api.get<any>('/admin/verifiers');
    return res.success ? { ...res, data: unwrapList(res.data) } : { ...res, data: [] };
  },

  /**
   * Health probe. Measures the real round-trip and reports a degraded backend
   * honestly instead of always showing "Ready".
   */
  async getHealth(): Promise<ApiResponse<HealthEntity | null>> {
    const start = performance.now();
    const res = await api.get<HealthEntity>('/health');
    const latencyMs = Math.round(performance.now() - start);

    if (res.success && res.data) {
      return {
        ...res,
        data: { ...res.data, latencyMs },
      };
    }

    // A 503 still carries a usable body — the API is up but the database is not.
    const body = res.data as any;
    if (body?.database) {
      return {
        data: { ...body, latencyMs },
        status: res.status || 503,
        success: false,
        message: 'Backend reachable but degraded.',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      data: null,
      status: res.status || 0,
      success: false,
      message: res.message || 'Backend unreachable.',
      timestamp: new Date().toISOString(),
    };
  },
};
