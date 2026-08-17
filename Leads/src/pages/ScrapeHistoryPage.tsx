import React, { useEffect, useState } from 'react';
import { scraperApi, ScrapeJob } from '../api/scraperApi';
import { History, Play, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface ScrapeHistoryPageProps {
  onReRunJob: (job: ScrapeJob) => void;
}

export const ScrapeHistoryPage: React.FC<ScrapeHistoryPageProps> = ({ onReRunJob }) => {
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await scraperApi.getJobs();
      if (res.success) {
        setJobs(res.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Scrape Mission History</h1>
          <p className="text-xs text-slate-500">
            Log of all executed web scraping tasks and results history.
          </p>
        </div>
        <button
          onClick={fetchJobs}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider bg-slate-50">
                <th className="py-3.5 px-4">Mission ID & Name</th>
                <th className="py-3.5 px-4">Source Provider</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Progress</th>
                <th className="py-3.5 px-4">Results Count</th>
                <th className="py-3.5 px-4">Created Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Loading job history...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No scrape jobs recorded yet.
                  </td>
                </tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.jobId} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4">
                      <div>
                        <p className="font-bold text-slate-900 leading-tight">{j.name}</p>
                        <span className="text-3xs font-mono text-cyan-600">{j.jobId}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-600 text-3xs font-bold border border-cyan-200">
                        {j.source}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-2xs font-bold capitalize ${
                        j.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                        j.status === 'running' ? 'bg-cyan-50 text-cyan-600 border border-cyan-200' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {j.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-cyan-600">
                      {j.progress}%
                    </td>

                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {j.resultCount || 0} leads
                    </td>

                    <td className="py-3.5 px-4 text-slate-500">
                      {j.createdAt ? new Date(j.createdAt).toLocaleString() : 'Recent'}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => onReRunJob(j)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-600 text-xs font-semibold transition cursor-pointer ml-auto"
                      >
                        <Play className="w-3 h-3 fill-cyan-400" />
                        <span>Re-Run</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
