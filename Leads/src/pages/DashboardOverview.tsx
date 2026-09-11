import React, { useEffect, useState } from 'react';
import { scraperApi, DashboardStats, ScrapeJob } from '../api/scraperApi';
import { Database, Phone, Globe, Play, Sparkles, TrendingUp, CheckCircle, RefreshCw } from 'lucide-react';
import { Box, Heading, Inline, PlainButton, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Text } from '../components/common/atoms';

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
    <Box className="space-y-8">
      {/* Top Banner */}
      <Box className="relative rounded-3xl p-8 bg-gradient-to-r from-cyan-50 via-blue-50 to-white border border-cyan-200 overflow-hidden shadow-lg shadow-slate-200/60">
        <Box className="absolute top-0 right-0 w-96 h-96 bg-cyan-100/60 rounded-full blur-3xl pointer-events-none" />
        <Box className="relative z-10 space-y-3 max-w-2xl">
          <Box className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-600 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <Inline>Playwright Powered Web Scraper</Inline>
          </Box>
          <Heading level={1} className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Scrape & Extract High-Value Business Data In Seconds
          </Heading>
          <Text className="text-sm text-slate-600 leading-relaxed">
            Extract verified business contacts, phone numbers, websites, ratings, and locations directly from Google Maps and JustDial into a structured dashboard.
          </Text>
          <Box className="flex items-center gap-4 pt-2">
            <PlainButton
              onClick={onNavigateToSearch}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/25 transition cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              <Inline>Launch Scraper Task</Inline>
            </PlainButton>
            <PlainButton
              onClick={onNavigateToLeads}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-300 transition cursor-pointer"
            >
              <Database className="w-4 h-4 text-cyan-600" />
              <Inline>Explore Scraped Leads</Inline>
            </PlainButton>
          </Box>
        </Box>
      </Box>

      {/* Metrics Grid */}
      <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Box className="glass-panel p-5 rounded-2xl space-y-3">
          <Box className="flex items-center justify-between">
            <Inline className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Scraped Leads</Inline>
            <Box className="p-2.5 rounded-xl bg-cyan-50 text-cyan-600">
              <Database className="w-5 h-5" />
            </Box>
          </Box>
          <Box className="text-3xl font-extrabold text-slate-900">
            {loading ? '...' : stats?.totalLeads || 0}
          </Box>
          <Text className="text-xs text-slate-500 font-medium">Extracted records in store</Text>
        </Box>

        <Box className="glass-panel p-5 rounded-2xl space-y-3">
          <Box className="flex items-center justify-between">
            <Inline className="text-xs font-bold text-slate-500 uppercase tracking-wider">Phone Numbers</Inline>
            <Box className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
              <Phone className="w-5 h-5" />
            </Box>
          </Box>
          <Box className="text-3xl font-extrabold text-slate-900">
            {loading ? '...' : stats?.withPhoneCount || 0}
          </Box>
          <Box className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
            <TrendingUp className="w-3.5 h-3.5" />
            <Inline>{stats?.phonePercentage || 0}% Coverage Rate</Inline>
          </Box>
        </Box>

        <Box className="glass-panel p-5 rounded-2xl space-y-3">
          <Box className="flex items-center justify-between">
            <Inline className="text-xs font-bold text-slate-500 uppercase tracking-wider">Websites Discovered</Inline>
            <Box className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
              <Globe className="w-5 h-5" />
            </Box>
          </Box>
          <Box className="text-3xl font-extrabold text-slate-900">
            {loading ? '...' : stats?.withWebsiteCount || 0}
          </Box>
          <Box className="flex items-center gap-1.5 text-xs text-indigo-600 font-semibold">
            <TrendingUp className="w-3.5 h-3.5" />
            <Inline>{stats?.websitePercentage || 0}% Coverage Rate</Inline>
          </Box>
        </Box>

        <Box className="glass-panel p-5 rounded-2xl space-y-3">
          <Box className="flex items-center justify-between">
            <Inline className="text-xs font-bold text-slate-500 uppercase tracking-wider">Completed Jobs</Inline>
            <Box className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
              <CheckCircle className="w-5 h-5" />
            </Box>
          </Box>
          <Box className="text-3xl font-extrabold text-slate-900">
            {loading ? '...' : stats?.completedJobs || 0}
          </Box>
          <Text className="text-xs text-slate-500 font-medium">Out of {stats?.totalJobs || 0} total missions</Text>
        </Box>
      </Box>

      {/* Recent Missions Table */}
      <Box className="glass-panel rounded-2xl p-6 space-y-4">
        <Box className="flex items-center justify-between">
          <Heading level={2} className="text-base font-bold text-slate-900">Recent Scrape Missions</Heading>
          <PlainButton
            onClick={loadData}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-600 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <Inline>Refresh</Inline>
          </PlainButton>
        </Box>

        {recentJobs.length === 0 ? (
          <Box className="py-12 text-center text-slate-400 text-xs">
            No scrape missions run yet. Click "Launch Scraper Task" to get started!
          </Box>
        ) : (
          <Box className="overflow-x-auto">
            <Table className="w-full text-left text-xs">
              <TableHead>
                <TableRow className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <TableHeaderCell className="py-3 px-4">Mission Name</TableHeaderCell>
                  <TableHeaderCell className="py-3 px-4">Source</TableHeaderCell>
                  <TableHeaderCell className="py-3 px-4">Status</TableHeaderCell>
                  <TableHeaderCell className="py-3 px-4">Progress</TableHeaderCell>
                  <TableHeaderCell className="py-3 px-4 text-right">Extracted Leads</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody className="divide-y divide-slate-200">
                {recentJobs.map((j) => (
                  <TableRow key={j.jobId} className="hover:bg-slate-50 transition">
                    <TableCell className="py-3 px-4 font-semibold text-slate-900">{j.name}</TableCell>
                    <TableCell className="py-3 px-4 text-slate-500 font-mono">{j.source}</TableCell>
                    <TableCell className="py-3 px-4">
                      <Inline className={`px-2.5 py-0.5 rounded-full text-2xs font-bold capitalize ${
                        j.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                        j.status === 'running' ? 'bg-cyan-50 text-cyan-600 border border-cyan-200' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {j.status}
                      </Inline>
                    </TableCell>
                    <TableCell className="py-3 px-4 font-mono text-cyan-600">{j.progress}%</TableCell>
                    <TableCell className="py-3 px-4 text-right font-bold text-slate-900">{j.resultCount || 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Box>
    </Box>
  );
};
