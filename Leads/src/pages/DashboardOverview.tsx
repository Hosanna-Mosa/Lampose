import React, { useEffect, useState } from 'react';
import { scraperApi, DashboardStats, ScrapeJob } from '../api/scraperApi';
import { Database, Phone, Globe, Play, Sparkles, TrendingUp, CheckCircle, RefreshCw } from 'lucide-react';

interface DashboardOverviewProps {
  onNavigateToSearch: () => void;
  onNavigateToLeads: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigateToSearch, onNavigateToLeads }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<ScrapeJob[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sRes, jRes] = await Promise.all([
        scraperApi.getStats(),
        scraperApi.getJobs()
      ]);
      if (sRes.success) setStats(sRes.data);
      if (jRes.success) setRecentJobs(jRes.data.slice(0, 5));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="relative rounded-3xl p-8 bg-gradient-to-r from-cyan-50 via-blue-50 to-white border border-cyan-200 overflow-hidden shadow-lg shadow-slate-200/60">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-100/60 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-600 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Playwright Powered Web Scraper</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Scrape & Extract High-Value Business Data In Seconds
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Extract verified business contacts, phone numbers, websites, ratings, and locations directly from Google Maps and JustDial into a structured dashboard.
          </p>
          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={onNavigateToSearch}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/25 transition cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Launch Scraper Task</span>
            </button>
            <button
              onClick={onNavigateToLeads}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-300 transition cursor-pointer"
            >
              <Database className="w-4 h-4 text-cyan-600" />
              <span>Explore Scraped Leads</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-panel p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Scraped Leads</span>
            <div className="p-2.5 rounded-xl bg-cyan-50 text-cyan-600">
              <Database className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            {loading ? '...' : stats?.totalLeads || 0}
          </div>
          <p className="text-xs text-slate-500 font-medium">Extracted records in store</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Phone Numbers</span>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
              <Phone className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            {loading ? '...' : stats?.withPhoneCount || 0}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{stats?.phonePercentage || 0}% Coverage Rate</span>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Websites Discovered</span>
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
              <Globe className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            {loading ? '...' : stats?.withWebsiteCount || 0}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-semibold">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{stats?.websitePercentage || 0}% Coverage Rate</span>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Completed Jobs</span>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            {loading ? '...' : stats?.completedJobs || 0}
          </div>
          <p className="text-xs text-slate-500 font-medium">Out of {stats?.totalJobs || 0} total missions</p>
        </div>
      </div>

      {/* Recent Missions Table */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Recent Scrape Missions</h2>
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-600 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {recentJobs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No scrape missions run yet. Click "Launch Scraper Task" to get started!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Mission Name</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Progress</th>
                  <th className="py-3 px-4 text-right">Extracted Leads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {recentJobs.map((j) => (
                  <tr key={j.jobId} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-semibold text-slate-900">{j.name}</td>
                    <td className="py-3 px-4 text-slate-500 font-mono">{j.source}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-2xs font-bold capitalize ${
                        j.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                        j.status === 'running' ? 'bg-cyan-50 text-cyan-600 border border-cyan-200' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-cyan-600">{j.progress}%</td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">{j.resultCount || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
