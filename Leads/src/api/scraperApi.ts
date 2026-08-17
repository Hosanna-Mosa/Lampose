import { apiClient, API_BASE_URL } from './apiClient';
import { User } from './userApi';

export interface LeadNote {
  id: string;
  text: string;
  authorName: string;
  createdAt: string;
}

export interface AssignedToUser {
  userId: string | null;
  name: string | null;
  email: string | null;
}

export interface ScrapedLead {
  _id: string;
  jobId: string;
  source: 'GoogleMaps' | 'JustDial' | 'Web';
  businessName: string;
  phone?: string;
  email?: string;
  website?: string;
  hasWebsite?: boolean;
  address?: string;
  rating?: string;
  reviewsCount?: number;
  category?: string;
  city?: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  mapsUrl?: string;
  scrapedAt?: string;
  assignedTo?: AssignedToUser;
  assignedAt?: string;
  leadStatus?: 'NEW' | 'CONTACTED' | 'INTERESTED' | 'QUALIFIED' | 'CALLBACK' | 'CLOSED_WON' | 'CLOSED_LOST';
  notes?: LeadNote[];
  lastActivityAt?: string;
}

export interface ScrapeJob {
  jobId: string;
  name: string;
  source: string;
  query?: string;
  location?: string;
  landmark?: string;
  depth?: number;
  status: 'started' | 'running' | 'completed' | 'stopped' | 'error';
  progress: number;
  statusMessage?: string;
  resultCount?: number;
  createdAt?: string;
  error?: string;
}

export interface DashboardStats {
  totalLeads: number;
  withPhoneCount: number;
  phonePercentage: number;
  withWebsiteCount: number;
  websitePercentage: number;
  withEmailCount: number;
  assignedLeadsCount?: number;
  totalJobs: number;
  completedJobs: number;
}

export interface TeamMemberBreakdown {
  user: User;
  totalAssigned: number;
  contacted: number;
  qualified: number;
  won: number;
  lost: number;
  conversionRate: number;
}

export interface TeamStatsResponse {
  teamBreakdown: TeamMemberBreakdown[];
  unassignedCount: number;
  totalLeads: number;
}

export interface StartScrapeParams {
  query: string;
  location: string;
  /** Optional specific area/landmark inside the city, e.g. "Andhra University" */
  landmark?: string;
  source: 'GoogleMaps' | 'JustDial' | 'Web';
  depth: number;
}

// Centralized API Caller Methods
export const scraperApi = {
  // Start scrape job
  async startScrape(params: StartScrapeParams) {
    const res = await apiClient.post('/scraper/start', params);
    return res.data;
  },

  // Get job status
  async getStatus(jobId: string) {
    const res = await apiClient.get(`/scraper/status/${jobId}`);
    return res.data;
  },

  // Stop job
  async stopJob(jobId: string) {
    const res = await apiClient.post(`/scraper/stop/${jobId}`);
    return res.data;
  },

  // Get leads with RBAC & jobId filters
  async getLeads(filters: { jobId?: string; source?: string; hasPhone?: string; hasWebsite?: string; assignedUserId?: string; leadStatus?: string; search?: string }) {
    const res = await apiClient.get('/scraper/leads', { params: filters });
    return res.data;
  },

  // Assign leads to an employee
  async assignLeads(leadIds: string[], userObj: { userId: string; name: string; email: string }) {
    const res = await apiClient.post('/scraper/assign', { leadIds, userObj });
    return res.data;
  },

  // Update lead status & add notes
  async updateLeadStatus(id: string, status: string, noteText?: string, authorName?: string) {
    const res = await apiClient.patch(`/scraper/leads/${id}/status`, { status, noteText, authorName });
    return res.data;
  },

  // Get team stats for Admin
  async getTeamStats() {
    const res = await apiClient.get('/scraper/team-stats');
    return res.data;
  },

  // Get job history
  async getJobs() {
    const res = await apiClient.get('/scraper/jobs');
    return res.data;
  },

  // Get stats
  async getStats() {
    const res = await apiClient.get('/scraper/stats');
    return res.data;
  },

  // Export URL
  getExportUrl(format: 'csv' | 'json', filters: { jobId?: string; source?: string; hasPhone?: string; hasWebsite?: string; assignedUserId?: string; leadStatus?: string; search?: string }) {
    const cleanFilters: Record<string, string> = {};
    Object.entries(filters).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        cleanFilters[key] = val;
      }
    });
    const params = new URLSearchParams({ format, ...cleanFilters });
    return `${API_BASE_URL}/scraper/export?${params.toString()}`;
  }
};
