import React, { useEffect, useState } from 'react';
import { scraperApi, ScrapeJob } from '../api/scraperApi';
import { History, Play, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Box, Heading, Inline, PlainButton, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Text } from '../components/common/atoms';

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
    <Box className="space-y-6">
      <Box className="flex items-center justify-between">
        <Box>
          <Heading level={1} className="text-2xl font-extrabold text-slate-900 tracking-tight">Scrape Mission History</Heading>
          <Text className="text-xs text-slate-500">
            Log of all executed web scraping tasks and results history.
          </Text>
        </Box>
        <PlainButton
          onClick={fetchJobs}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <Inline>Refresh</Inline>
        </PlainButton>
      </Box>

      <Box className="glass-panel rounded-2xl overflow-hidden shadow-2xl">
        <Box className="overflow-x-auto">
          <Table className="w-full text-left text-xs">
            <TableHead>
              <TableRow className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider bg-slate-50">
                <TableHeaderCell className="py-3.5 px-4">Mission ID & Name</TableHeaderCell>
                <TableHeaderCell className="py-3.5 px-4">Source Provider</TableHeaderCell>
                <TableHeaderCell className="py-3.5 px-4">Status</TableHeaderCell>
                <TableHeaderCell className="py-3.5 px-4">Progress</TableHeaderCell>
                <TableHeaderCell className="py-3.5 px-4">Results Count</TableHeaderCell>
                <TableHeaderCell className="py-3.5 px-4">Created Date</TableHeaderCell>
                <TableHeaderCell className="py-3.5 px-4 text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody className="divide-y divide-slate-200">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-slate-500">
                    Loading job history...
                  </TableCell>
                </TableRow>
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-slate-400">
                    No scrape jobs recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((j) => (
                  <TableRow key={j.jobId} className="hover:bg-slate-50 transition">
                    <TableCell className="py-3.5 px-4">
                      <Box>
                        <Text className="font-bold text-slate-900 leading-tight">{j.name}</Text>
                        <Inline className="text-3xs font-mono text-cyan-600">{j.jobId}</Inline>
                      </Box>
                    </TableCell>

                    <TableCell className="py-3.5 px-4">
                      <Inline className="px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-600 text-3xs font-bold border border-cyan-200">
                        {j.source}
                      </Inline>
                    </TableCell>

                    <TableCell className="py-3.5 px-4">
                      <Inline className={`px-2.5 py-0.5 rounded-full text-2xs font-bold capitalize ${
                        j.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                        j.status === 'running' ? 'bg-cyan-50 text-cyan-600 border border-cyan-200' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {j.status}
                      </Inline>
                    </TableCell>

                    <TableCell className="py-3.5 px-4 font-mono text-cyan-600">
                      {j.progress}%
                    </TableCell>

                    <TableCell className="py-3.5 px-4 font-bold text-slate-900">
                      {j.resultCount || 0} leads
                    </TableCell>

                    <TableCell className="py-3.5 px-4 text-slate-500">
                      {j.createdAt ? new Date(j.createdAt).toLocaleString() : 'Recent'}
                    </TableCell>

                    <TableCell className="py-3.5 px-4 text-right">
                      <PlainButton
                        onClick={() => onReRunJob(j)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-600 text-xs font-semibold transition cursor-pointer ml-auto"
                      >
                        <Play className="w-3 h-3 fill-cyan-400" />
                        <Inline>Re-Run</Inline>
                      </PlainButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
};
