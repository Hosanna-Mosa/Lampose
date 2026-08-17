import React, { useEffect, useState } from 'react';
import { User } from '../api/userApi';
import { scraperApi, ScrapedLead } from '../api/scraperApi';
import { LeadStatusModal } from '../components/LeadStatusModal';
import { MapLocationButton } from '../components/MapLocationButton';
import { Search, Phone, Globe, Star, RefreshCw, CheckCircle2, MessageSquare, Tag, Building2, MapPin } from 'lucide-react';

interface EmployeeWorkstationProps {
  currentUser: User;
}

export const EmployeeWorkstation: React.FC<EmployeeWorkstationProps> = ({ currentUser }) => {
  const [leads, setLeads] = useState<ScrapedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedLead, setSelectedLead] = useState<ScrapedLead | null>(null);

  const fetchMyLeads = async () => {
    setLoading(true);
    try {
      const res = await scraperApi.getLeads({
        assignedUserId: currentUser.userId,
        search,
        leadStatus: statusFilter !== 'ALL' ? statusFilter : undefined
      });
      if (res.success) {
        setLeads(res.data || []);
      }
    } catch (err) {
      console.error('Error fetching assigned leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyLeads();
  }, [currentUser.userId, search, statusFilter]);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'CONTACTED':
        return <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-600 border border-blue-200 text-2xs font-bold">📞 Contacted</span>;
      case 'INTERESTED':
        return <span className="px-2.5 py-0.5 rounded-full bg-cyan-100 text-cyan-600 border border-cyan-200 text-2xs font-bold">🔥 Interested</span>;
      case 'QUALIFIED':
        return <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-600 border border-amber-200 text-2xs font-bold">⭐ Qualified</span>;
      case 'CLOSED_WON':
        return <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 border border-emerald-200 text-2xs font-bold">🎉 Closed Won</span>;
      case 'CLOSED_LOST':
        return <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200 text-2xs font-bold">❌ Closed Lost</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-300 text-2xs font-bold">🆕 New Lead</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-600 text-xs font-bold mb-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Employee Workstation</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">My Assigned Leads ({leads.length})</h1>
          <p className="text-xs text-slate-500">
            Assigned business leads for <strong className="text-cyan-600">{currentUser.name}</strong>. Call, update status, and log notes.
          </p>
        </div>

        <button
          onClick={fetchMyLeads}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Leads</span>
        </button>
      </div>

      {/* Filters */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search business, city, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition cursor-pointer"
        >
          <option value="ALL">All Statuses</option>
          <option value="NEW">🆕 New Leads</option>
          <option value="CONTACTED">📞 Contacted</option>
          <option value="INTERESTED">🔥 Interested</option>
          <option value="QUALIFIED">⭐ Qualified</option>
          <option value="CLOSED_WON">🎉 Closed Won</option>
          <option value="CLOSED_LOST">❌ Closed Lost</option>
        </select>
      </div>

      {/* Assigned Leads Grid */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 text-xs font-semibold">
          Loading assigned leads...
        </div>
      ) : leads.length === 0 ? (
        <div className="glass-panel p-12 rounded-3xl text-center space-y-3">
          <Building2 className="w-12 h-12 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">No Assigned Leads Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            You currently have no leads assigned matching your filter. Ask your Admin manager to assign scraped leads to your queue!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {leads.map((lead) => (
            <div key={lead._id} className="glass-panel p-5 rounded-2xl space-y-4 flex flex-col justify-between hover:border-cyan-300 transition shadow-xl">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-slate-900 leading-snug">{lead.businessName}</h3>
                  <div className="shrink-0">{getStatusBadge(lead.leadStatus)}</div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-slate-600 font-mono">
                    <Phone className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                    <span>{lead.phone || 'No phone listed'}</span>
                  </div>

                  {lead.website ? (
                    <div className="flex items-center gap-2 text-cyan-600">
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      <a href={lead.website} target="_blank" rel="noreferrer" className="hover:underline truncate font-mono">
                        {lead.website}
                      </a>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2 text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{lead.address || lead.city}</span>
                    <MapLocationButton lead={lead} className="ml-auto shrink-0" />
                  </div>
                </div>

                {lead.notes && lead.notes.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-2xs text-slate-600 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-cyan-600">
                      <MessageSquare className="w-3 h-3" />
                      <span>Latest Activity Note</span>
                    </div>
                    <p className="line-clamp-2 text-slate-500 italic">"{lead.notes[0].text}"</p>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <span className="text-3xs text-slate-400 font-mono">
                  {lead.rating ? `★ ${lead.rating}` : 'No rating'}
                </span>

                <button
                  onClick={() => setSelectedLead(lead)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-600 text-xs font-bold border border-cyan-200 transition cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Update Status & Notes</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lead Status Update Modal */}
      {selectedLead && (
        <LeadStatusModal
          lead={selectedLead}
          currentUser={currentUser}
          onClose={() => setSelectedLead(null)}
          onSuccess={fetchMyLeads}
        />
      )}
    </div>
  );
};
