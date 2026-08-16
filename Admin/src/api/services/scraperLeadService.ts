import { api, unwrapList } from '../apiCaller';
import type { ApiResponse, LeadStatus, ScrapedLeadEntity, ScrapeSource } from '../types';

/** Map a raw `scriper_leads` document onto the shape the UI reads. */
const normalize = (raw: any): ScrapedLeadEntity => ({
  id: raw._id || raw.id,
  jobId: raw.jobId || '',
  source: (raw.source || 'GoogleMaps') as ScrapeSource,
  businessName: raw.businessName || 'Unnamed business',
  phone: raw.phone || '',
  email: raw.email || '',
  website: raw.website || '',
  hasWebsite: Boolean(raw.hasWebsite || raw.website),
  address: raw.address || '',
  rating: raw.rating || '',
  reviewsCount: Number(raw.reviewsCount) || 0,
  category: raw.category || '',
  city: raw.city || '',
  landmark: raw.landmark || '',
  mapsUrl: raw.mapsUrl || '',
  leadStatus: (raw.leadStatus || 'NEW') as LeadStatus,
  assignedTo: {
    userId: raw.assignedTo?.userId || null,
    name: raw.assignedTo?.name || null,
    email: raw.assignedTo?.email || null,
  },
  scrapedAt: raw.scrapedAt || null,
  createdAt: raw.createdAt || null,
});

export const scraperLeadService = {
  /** Scraped business records, from the `scriper_leads` collection. Super Admin only. */
  async getLeads(params?: {
    search?: string;
    jobId?: string;
    source?: string;
    leadStatus?: string;
  }): Promise<ApiResponse<ScrapedLeadEntity[]>> {
    const res = await api.get<any>('/admin/scriper-leads', params);
    return res.success ? { ...res, data: unwrapList(res.data).map(normalize) } : { ...res, data: [] };
  },

  async createLead(payload: {
    businessName: string;
    source: ScrapeSource;
    phone?: string;
    email?: string;
    website?: string;
    address?: string;
    category?: string;
    city?: string;
  }): Promise<ApiResponse<ScrapedLeadEntity | null>> {
    const res = await api.post<any>('/admin/scriper-leads', payload);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async updateLead(
    id: string,
    changes: Partial<{
      businessName: string;
      phone: string;
      email: string;
      website: string;
      address: string;
      category: string;
      city: string;
      leadStatus: LeadStatus;
    }>
  ): Promise<ApiResponse<ScrapedLeadEntity | null>> {
    const res = await api.put<any>(`/admin/scriper-leads/${id}`, changes);
    return res.success ? { ...res, data: normalize(res.data?.data || res.data) } : { ...res, data: null };
  },

  async deleteLead(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return api.delete<{ success: boolean }>(`/admin/scriper-leads/${id}`);
  },
};
