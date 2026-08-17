import React, { useEffect, useState } from 'react';
import { scraperApi, TeamStatsResponse } from '../api/scraperApi';
import { Users, CheckCircle2, TrendingUp, RefreshCw, UserCheck, AlertCircle, Sparkles } from 'lucide-react';

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
    <div className="space-y-8">
      {/* Top Title Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-600 text-xs font-bold mb-2">
            <Users className="w-3.5 h-3.5" />
            <span>Admin Management Console</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Team Workload & Conversion Analytics</h1>
          <p className="text-xs text-slate-500">
            Monitor employee lead assignments, call activities, and closed deals across your sales team.
          </p>
        </div>

        <button
          onClick={fetchTeamStats}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Analytics</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="glass-panel p-5 rounded-2xl space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Scraped Leads</span>
          <div className="text-3xl font-extrabold text-slate-900">{teamStats?.totalLeads || 0}</div>
          <p className="text-xs text-slate-500 font-medium">All generated lead records</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unassigned Queue</span>
          <div className="text-3xl font-extrabold text-amber-600">{teamStats?.unassignedCount || 0}</div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onNavigateToLeads}
              className="text-xs font-bold text-cyan-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Assign Queue Now</span>
              <Sparkles className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Employees</span>
          <div className="text-3xl font-extrabold text-cyan-600">{teamStats?.teamBreakdown?.length || 0}</div>
          <p className="text-xs text-slate-500 font-medium">Sales representatives assigned</p>
        </div>
      </div>

      {/* Employee Cards */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900">Employee Workload Breakdown</h2>

        {loading ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            Loading team workload metrics...
          </div>
        ) : !teamStats?.teamBreakdown || teamStats.teamBreakdown.length === 0 ? (
          <div className="glass-panel p-8 rounded-2xl text-center text-slate-500 text-xs">
            No employee members found in team. Create employee accounts in "Manage Employees" tab!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teamStats.teamBreakdown.map((item) => (
              <div key={item.user.userId} className="glass-panel p-6 rounded-3xl space-y-5 shadow-2xl relative overflow-hidden">
                <div className="flex items-center gap-3">
                  <img
                    src={item.user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                    alt={item.user.name}
                    className="w-12 h-12 rounded-2xl object-cover border border-cyan-200"
                  />
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{item.user.name}</h3>
                    <p className="text-xs text-slate-500 font-mono">{item.user.email}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div>
                    <span className="text-3xs text-slate-500 uppercase font-bold">Assigned</span>
                    <p className="text-xl font-extrabold text-slate-900">{item.totalAssigned}</p>
                  </div>
                  <div>
                    <span className="text-3xs text-slate-500 uppercase font-bold">Conversion</span>
                    <p className="text-xl font-extrabold text-emerald-600">{item.conversionRate}%</p>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>📞 Contacted / Called:</span>
                    <span className="font-bold text-blue-600">{item.contacted}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>⭐ Qualified Deals:</span>
                    <span className="font-bold text-amber-600">{item.qualified}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>🎉 Closed Won:</span>
                    <span className="font-bold text-emerald-600">{item.won}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>❌ Closed Lost:</span>
                    <span className="font-bold text-rose-600">{item.lost}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
