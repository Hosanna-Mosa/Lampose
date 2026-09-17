import React, { useEffect, useState } from 'react';
import { scraperApi, TeamStatsResponse } from '../api/scraperApi';
import { Users, CheckCircle2, TrendingUp, RefreshCw, UserCheck, AlertCircle, Sparkles } from 'lucide-react';
import { Box, Heading, Image, Inline, PlainButton, Text } from '../components/common/atoms';

interface AdminTeamOverviewProps {
  onNavigateToLeads: () => void;
}

export const AdminTeamOverview: React.FC<AdminTeamOverviewProps> = ({ onNavigateToLeads }) => {
  const [teamStats, setTeamStats] = useState<TeamStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTeamStats = async () => {
    setLoading(true);
    try {
      const res = await scraperApi.getTeamStats();
      if (res.success) {
        setTeamStats(res.data);
      }
    } catch (err) {
      console.error('Error fetching team stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamStats();
  }, []);

  return (
    <Box className="space-y-8">
      {/* Top Title Banner */}
      <Box className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Box>
          <Box className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-600 text-xs font-bold mb-2">
            <Users className="w-3.5 h-3.5" />
            <Inline>Admin Management Console</Inline>
          </Box>
          <Heading level={1} className="text-2xl font-extrabold text-slate-900 tracking-tight">Team Workload & Conversion Analytics</Heading>
          <Text className="text-xs text-slate-500">
            Monitor employee lead assignments, call activities, and closed deals across your sales team.
          </Text>
        </Box>

        <PlainButton
          onClick={fetchTeamStats}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          <Inline>Refresh Analytics</Inline>
        </PlainButton>
      </Box>

      {/* Summary Cards */}
      <Box className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Box className="glass-panel p-5 rounded-2xl space-y-2">
          <Inline className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Scraped Leads</Inline>
          <Box className="text-3xl font-extrabold text-slate-900">{teamStats?.totalLeads || 0}</Box>
          <Text className="text-xs text-slate-500 font-medium">All generated lead records</Text>
        </Box>

        <Box className="glass-panel p-5 rounded-2xl space-y-2">
          <Inline className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unassigned Queue</Inline>
          <Box className="text-3xl font-extrabold text-amber-600">{teamStats?.unassignedCount || 0}</Box>
          <Box className="flex items-center gap-2 pt-1">
            <PlainButton
              onClick={onNavigateToLeads}
              className="text-xs font-bold text-cyan-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Inline>Assign Queue Now</Inline>
              <Sparkles className="w-3 h-3" />
            </PlainButton>
          </Box>
        </Box>

        <Box className="glass-panel p-5 rounded-2xl space-y-2">
          <Inline className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Employees</Inline>
          <Box className="text-3xl font-extrabold text-cyan-600">{teamStats?.teamBreakdown?.length || 0}</Box>
          <Text className="text-xs text-slate-500 font-medium">Sales representatives assigned</Text>
        </Box>
      </Box>

      {/* Employee Cards */}
      <Box className="space-y-4">
        <Heading level={2} className="text-base font-bold text-slate-900">Employee Workload Breakdown</Heading>

        {loading ? (
          <Box className="py-12 text-center text-slate-500 text-xs">
            Loading team workload metrics...
          </Box>
        ) : !teamStats?.teamBreakdown || teamStats.teamBreakdown.length === 0 ? (
          <Box className="glass-panel p-8 rounded-2xl text-center text-slate-500 text-xs">
            No employee members found in team. Create employee accounts in "Manage Employees" tab!
          </Box>
        ) : (
          <Box className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teamStats.teamBreakdown.map((item) => (
              <Box key={item.user.userId} className="glass-panel p-6 rounded-3xl space-y-5 shadow-2xl relative overflow-hidden">
                <Box className="flex items-center gap-3">
                  <Image
                    src={item.user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                    alt={item.user.name}
                    className="w-12 h-12 rounded-2xl object-cover border border-cyan-200"
                  />
                  <Box>
                    <Heading level={3} className="text-base font-bold text-slate-900">{item.user.name}</Heading>
                    <Text className="text-xs text-slate-500 font-mono">{item.user.email}</Text>
                  </Box>
                </Box>

                <Box className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <Box>
                    <Inline className="text-3xs text-slate-500 uppercase font-bold">Assigned</Inline>
                    <Text className="text-xl font-extrabold text-slate-900">{item.totalAssigned}</Text>
                  </Box>
                  <Box>
                    <Inline className="text-3xs text-slate-500 uppercase font-bold">Conversion</Inline>
                    <Text className="text-xl font-extrabold text-emerald-600">{item.conversionRate}%</Text>
                  </Box>
                </Box>

                <Box className="space-y-2 text-xs">
                  <Box className="flex justify-between text-slate-600">
                    <Inline>📞 Contacted / Called:</Inline>
                    <Inline className="font-bold text-blue-600">{item.contacted}</Inline>
                  </Box>
                  <Box className="flex justify-between text-slate-600">
                    <Inline>⭐ Qualified Deals:</Inline>
                    <Inline className="font-bold text-amber-600">{item.qualified}</Inline>
                  </Box>
                  <Box className="flex justify-between text-slate-600">
                    <Inline>🎉 Closed Won:</Inline>
                    <Inline className="font-bold text-emerald-600">{item.won}</Inline>
                  </Box>
                  <Box className="flex justify-between text-slate-600">
                    <Inline>❌ Closed Lost:</Inline>
                    <Inline className="font-bold text-rose-600">{item.lost}</Inline>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};
