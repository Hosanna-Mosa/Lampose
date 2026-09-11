import React, { useEffect, useState } from 'react';
import { scraperApi, ScrapeJob } from '../../../../api/scraperApi';
import { Loader2, Square, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { Box, Heading, Inline, PlainButton, Text } from '../../atoms';

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
      <Box className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <Box className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-slate-900">
          <Loader2 className="w-8 h-8 text-cyan-600 animate-spin mx-auto mb-3" />
          <Text className="text-xs text-slate-500">Connecting to live scraper engine...</Text>
        </Box>
      </Box>
    );
  }

  const isRunning = job.status === 'running' || job.status === 'started';
  const isCompleted = job.status === 'completed';
  const isStopped = job.status === 'stopped';
  const isError = job.status === 'error';

  return (
    <Box className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <Box className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-6">
        <Box className="flex items-center justify-between">
          <Box className="flex items-center gap-3">
            <Box className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              isRunning ? 'bg-cyan-100 text-cyan-600' : isCompleted ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
            }`}>
              {isRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : isCompleted ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </Box>
            <Box>
              <Heading level={3} className="text-base font-bold text-slate-900">{job.name}</Heading>
              <Text className="text-xs text-slate-500">Job ID: <Inline className="font-mono text-cyan-600">{job.jobId}</Inline></Text>
            </Box>
          </Box>
        </Box>

        {/* Progress Bar */}
        <Box className="space-y-2">
          <Box className="flex justify-between text-xs font-semibold">
            <Inline className="text-slate-600">{job.statusMessage || 'Processing...'}</Inline>
            <Inline className="text-cyan-600 font-mono">{job.progress}%</Inline>
          </Box>
          <Box className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-300">
            <Box
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </Box>
        </Box>

        {/* Scraped Stats Badge */}
        <Box className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <Box>
            <Inline className="text-2xs text-slate-500 uppercase tracking-wider font-semibold">Leads Extracted</Inline>
            <Box className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">{job.resultCount || 0}</Box>
          </Box>
          <Box>
            <Inline className="text-2xs text-slate-500 uppercase tracking-wider font-semibold">Status</Inline>
            <Box className="mt-1">
              <Inline className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                isRunning ? 'bg-cyan-100 text-cyan-600 border border-cyan-200' : isCompleted ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-600'
              }`}>
                {job.status}
              </Inline>
            </Box>
          </Box>
        </Box>

        {/* Action Controls */}
        <Box className="flex items-center justify-end gap-3 pt-2">
          {isRunning && (
            <PlainButton
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-semibold transition cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              <Inline>Stop Job</Inline>
            </PlainButton>
          )}

          {!isRunning && (
            <PlainButton
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition cursor-pointer"
            >
              Close
            </PlainButton>
          )}

          {job.resultCount && job.resultCount > 0 ? (
            <PlainButton
              onClick={onViewResults}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <Inline>View Scraped Data</Inline>
            </PlainButton>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
};
