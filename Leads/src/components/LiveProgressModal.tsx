import React, { useEffect, useState } from 'react';
import { scraperApi, ScrapeJob } from '../api/scraperApi';
import { Loader2, Square, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';

interface LiveProgressModalProps {
  jobId: string;
  onClose: () => void;
  onViewResults: () => void;
}

export const LiveProgressModal: React.FC<LiveProgressModalProps> = ({ jobId, onClose, onViewResults }) => {
  const [job, setJob] = useState<ScrapeJob | null>(null);

  useEffect(() => {
    let interval: any;

    const fetchStatus = async () => {
      try {
        const res = await scraperApi.getStatus(jobId);
        if (res.success && res.data) {
          setJob(res.data);
          if (res.data.status === 'completed' || res.data.status === 'error' || res.data.status === 'stopped') {
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error('Error polling status:', err);
      }
    };

    fetchStatus();
    interval = setInterval(fetchStatus, 1500);

    return () => clearInterval(interval);
  }, [jobId]);

  const handleStop = async () => {
    try {
      await scraperApi.stopJob(jobId);
    } catch (e) {
      console.error(e);
    }
  };

  if (!job) {
    return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-slate-900">
          <Loader2 className="w-8 h-8 text-cyan-600 animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-500">Connecting to live scraper engine...</p>
        </div>
      </div>
    );
  }

  const isRunning = job.status === 'running' || job.status === 'started';
  const isCompleted = job.status === 'completed';
  const isStopped = job.status === 'stopped';
  const isError = job.status === 'error';

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              isRunning ? 'bg-cyan-100 text-cyan-600' : isCompleted ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
            }`}>
              {isRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : isCompleted ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{job.name}</h3>
              <p className="text-xs text-slate-500">Job ID: <span className="font-mono text-cyan-600">{job.jobId}</span></p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-600">{job.statusMessage || 'Processing...'}</span>
            <span className="text-cyan-600 font-mono">{job.progress}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-300">
            <div
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>

        {/* Scraped Stats Badge */}
        <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <div>
            <span className="text-2xs text-slate-500 uppercase tracking-wider font-semibold">Leads Extracted</span>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">{job.resultCount || 0}</div>
          </div>
          <div>
            <span className="text-2xs text-slate-500 uppercase tracking-wider font-semibold">Status</span>
            <div className="mt-1">
              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                isRunning ? 'bg-cyan-100 text-cyan-600 border border-cyan-200' : isCompleted ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-600'
              }`}>
                {job.status}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {isRunning && (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-semibold transition cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop Job</span>
            </button>
          )}

          {!isRunning && (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition cursor-pointer"
            >
              Close
            </button>
          )}

          {job.resultCount && job.resultCount > 0 ? (
            <button
              onClick={onViewResults}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>View Scraped Data</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
