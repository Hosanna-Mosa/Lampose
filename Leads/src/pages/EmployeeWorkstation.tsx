import React, { useEffect, useState } from 'react';
import { User } from '../api/userApi';
import { scraperApi, ScrapedLead } from '../api/scraperApi';
import { LEAD_STATUSES, leadStatusMeta, timeAgo } from '../api/leadStatus';
import { Pagination } from '../components/Pagination';
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
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [pageInfo, setPageInfo] = useState({ total: 0, pages: 1 });

  /* The name is only ever decoration here — it is the session's `userId` the
     server matches on, and it does that itself. Falling back keeps the
     sentence readable when a session comes back without a name rather than
     printing "Assigned business leads for ." */
  const displayName = currentUser.name || currentUser.email || 'you';

  /**
   * The rep's queue.
   *
   * No `assignedUserId` is sent. The server reads it off the session and
   * ignores anything the client claims — which is the point: this screen used
   * to pass `currentUser.userId`, and on a session where that was missing the
   * parameter vanished and the API answered with EVERY lead in the database.
   * Asking for "my leads" and being handed all 226 is not a filter, it is a
   * leak, and it cannot be fixed anywhere but the server.
   */
  const fetchMyLeads = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await scraperApi.getLeads({
        search,
        leadStatus: statusFilter !== 'ALL' ? statusFilter : undefined,
        page,
        limit
      });
      if (res.success) {
        setLeads(res.data || []);
        setPageInfo({ total: res.total ?? res.count ?? 0, pages: res.pages ?? 1 });
      } else {
        setError(res.error || res.message || 'Could not load your assigned leads.');
      }
    } catch (err: any) {
      console.error('Error fetching assigned leads:', err);
      setError(
        err?.response?.status === 401
          ? 'Your session has expired. Sign in again to see your leads.'
          : 'Could not reach the leads server. Nothing has been lost — try Refresh.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyLeads();
  }, [currentUser.userId, search, statusFilter, page, limit]);

  // A new search starts at the top of its own results, not on page 7 of the old ones.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, limit]);

  /* One table for all seven, shared with the admin's view — CALLBACK used to
     fall through this switch and render as "New Lead", so a rep who set a
     call-back saw their own card deny it. */
  const getStatusBadge = (status?: string) => {
    const meta = leadStatusMeta(status);
    return (
      <span className={`px-2.5 py-0.5 rounded-full border text-2xs font-bold whitespace-nowrap ${meta.chip}`}>
        {meta.label}
      </span>
    );
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
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">My Assigned Leads ({pageInfo.total})</h1>
          <p className="text-xs text-slate-500">
            Assigned business leads for <strong className="text-cyan-600">{displayName}</strong>. Call, update status, and log notes.
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
          {/* Driven by the shared list, so the filter can never offer fewer
              statuses than the modal can set — Call Back was missing here. */}
          {LEAD_STATUSES.map((entry) => (
            <option key={entry.value} value={entry.value}>{entry.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          {error}
        </div>
      )}

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
                  {lead.lastActivityAt ? ` · touched ${timeAgo(lead.lastActivityAt)}` : ''}
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

      <Pagination
        page={page}
        pages={pageInfo.pages}
        total={pageInfo.total}
        count={leads.length}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
        noun="assigned leads"
      />

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
