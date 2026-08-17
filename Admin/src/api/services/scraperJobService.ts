import { api, unwrapList } from '../apiCaller';
import type { ApiResponse, ScrapeJobEntity, ScrapeJobStatus, ScrapeSource } from '../types';

/** Map a raw `scriper_jobs` document onto the shape the UI reads. Keyed by
 *  `jobId`, not Mongo `_id`. */
const normalize = (raw: any): ScrapeJobEntity => ({
  id: raw.jobId || raw._id || raw.id,
  name: raw.name || 'Untitled Scrape Mission',
  source: (raw.source || 'GoogleMaps') as ScrapeSource,
  query: raw.query || '',
  location: raw.location || '',
  landmark: raw.landmark || '',
  depth: Number(raw.depth) || 0,
  status: (raw.status || 'started') as ScrapeJobStatus,
  progress: Number(raw.progress) || 0,
  statusMessage: raw.statusMessage || '',
  resultCount: Number(raw.resultCount) || 0,
  error: raw.error || '',
  createdAt: raw.createdAt || null,
  updatedAt: raw.updatedAt || null,
});

export const scraperJobService = {
  /** Scrape job history, from the `scriper_jobs` collection. Super Admin only. */
  async getScrapeJobs(): Promise<ApiResponse<ScrapeJobEntity[]>> {
    const res = await api.get<any>('/admin/scriper-jobs');
    return res.success ? { ...res, data: unwrapList(res.data).map(normalize) } : { ...res, data: [] };
  },

  async createScrapeJob(payload: {
    name?: string;
    source?: ScrapeSource;
    query?: string;
    location?: string;
    landmark?: string;
    depth?: number;
    status?: ScrapeJobStatus;
  }): Promise<ApiResponse<ScrapeJobEntity | null>> {
    const res = await api.post<any>('/admin/scriper-jobs', payload);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async updateScrapeJob(
    jobId: string,
    changes: Partial<{
      name: string;
      source: ScrapeSource;
      query: string;
      location: string;
      landmark: string;
      depth: number;
      status: ScrapeJobStatus;
      progress: number;
      statusMessage: string;
      resultCount: number;
    }>
  ): Promise<ApiResponse<ScrapeJobEntity | null>> {
    const res = await api.put<any>(`/admin/scriper-jobs/${jobId}`, changes);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async deleteScrapeJob(jobId: string): Promise<ApiResponse<{ success: boolean }>> {
    return api.delete<{ success: boolean }>(`/admin/scriper-jobs/${jobId}`);
  },
};
