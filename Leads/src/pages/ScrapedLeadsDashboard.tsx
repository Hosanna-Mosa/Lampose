import React, { useEffect, useState } from 'react';
import { scraperApi, ScrapedLead, ScrapeJob } from '../api/scraperApi';
import { User } from '../api/userApi';
import { AssignLeadsModal } from '../components/AssignLeadsModal';
import { LeadDetailModal } from '../components/LeadDetailModal';
import { MapLocationButton } from '../components/MapLocationButton';
import { Search, Download, Star, Eye, RefreshCw, Building2, UserCheck, CheckSquare, Square, Filter } from 'lucide-react';

interface ScrapedLeadsDashboardProps {
  currentUser: User;
  usersList: User[];
  initialJobId?: string | null;
}

export const ScrapedLeadsDashboard: React.FC<ScrapedLeadsDashboardProps> = ({ currentUser, usersList, initialJobId }) => {
  const [leads, setLeads] = useState<ScrapedLead[]>([]);
  const [jobsList, setJobsList] = useState<ScrapeJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string>(initialJobId || 'ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [phoneFilter, setPhoneFilter] = useState('ALL');
  const [websiteFilter, setWebsiteFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<ScrapedLead | null>(null);

  const isAdmin = currentUser.role === 'ADMIN';
  const employeesList = usersList.filter(u => u.role === 'EMPLOYEE');

  const fetchJobs = async () => {
    try {
      const res = await scraperApi.getJobs();
      if (res.success && res.data) {
        setJobsList(res.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await scraperApi.getLeads({
        jobId: selectedJobId !== 'ALL' ? selectedJobId : undefined,
        search,
        source: sourceFilter !== 'ALL' ? sourceFilter : undefined,
        hasPhone: phoneFilter === 'YES' ? 'true' : undefined,
        hasWebsite: websiteFilter === 'YES' ? 'true' : undefined,
        leadStatus: statusFilter !== 'ALL' ? statusFilter : undefined
      });
      if (res.success) {
        setLeads(res.data || []);
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (initialJobId) {
      setSelectedJobId(initialJobId);
    }
  }, [initialJobId]);

  useEffect(() => {
    fetchLeads();
  }, [search, selectedJobId, sourceFilter, phoneFilter, websiteFilter, statusFilter]);

  const toggleSelectLead = (id: string) => {
    if (selectedLeadIds.includes(id)) {
      setSelectedLeadIds(selectedLeadIds.filter(i => i !== id));
    } else {
      setSelectedLeadIds([...selectedLeadIds, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map(l => l._id));
    }
  };

  const handleExportCSV = () => {
    const url = scraperApi.getExportUrl('csv', {
      jobId: selectedJobId !== 'ALL' ? selectedJobId : undefined,
      search,
      source: sourceFilter !== 'ALL' ? sourceFilter : undefined,
      hasPhone: phoneFilter === 'YES' ? 'true' : undefined,
      hasWebsite: websiteFilter === 'YES' ? 'true' : undefined
    });
    window.open(url, '_blank');
  };

  const handleExportJSON = () => {
    const url = scraperApi.getExportUrl('json', {
      jobId: selectedJobId !== 'ALL' ? selectedJobId : undefined,
      search,
      source: sourceFilter !== 'ALL' ? sourceFilter : undefined,
      hasPhone: phoneFilter === 'YES' ? 'true' : undefined,
      hasWebsite: websiteFilter === 'YES' ? 'true' : undefined
    });
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Scraped Leads Explorer</h1>
          <p className="text-xs text-slate-500">
            View all generated leads, assign them to employees, or export data.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && selectedLeadIds.length > 0 && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-extrabold shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>Assign {selectedLeadIds.length} Selected Leads</span>
            </button>
          )}

          <button
            onClick={fetchLeads}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-300 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-600" />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="glass-panel p-4 rounded-2xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Search */}
        <div className="relative col-span-1 sm:col-span-2 lg:col-span-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search business, city, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition"
          />
        </div>

        {/* Mission / Job Filter */}
        <div>
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-cyan-600 font-semibold focus:outline-none focus:border-cyan-500 transition cursor-pointer"
          >
            <option value="ALL">All Scrape Missions (Combined)</option>
            {jobsList.map(j => (
              <option key={j.jobId} value={j.jobId}>
                🎯 {j.name} ({j.resultCount || 0} leads)
              </option>
            ))}
          </select>
        </div>

        {/* Source Filter */}
        <div>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition cursor-pointer"
          >
            <option value="ALL">All Providers</option>
            <option value="GoogleMaps">Google Maps Only</option>
            <option value="JustDial">JustDial Only</option>
          </select>
        </div>

        {/* Phone Filter */}
        <div>
          <select
            value={phoneFilter}
            onChange={(e) => setPhoneFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition cursor-pointer"
          >
            <option value="ALL">All Leads (Phone)</option>
            <option value="YES">Has Phone Number</option>
          </select>
        </div>

        {/* Lead Status Filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="NEW">🆕 New Leads</option>
            <option value="CONTACTED">📞 Contacted</option>
            <option value="QUALIFIED">⭐ Qualified</option>
            <option value="CLOSED_WON">🎉 Closed Won</option>
          </select>
        </div>
      </div>

      {/* Leads Table */}
      <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider bg-slate-50">
                {isAdmin && (
                  <th className="py-3.5 px-4 w-10">
                    <button onClick={toggleSelectAll} className="text-slate-500 hover:text-cyan-600">
                      {selectedLeadIds.length > 0 && selectedLeadIds.length === leads.length ? (
                        <CheckSquare className="w-4 h-4 text-cyan-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                )}
                <th className="py-3.5 px-4">Business Name</th>
                <th className="py-3.5 px-4">Phone</th>
                <th className="py-3.5 px-4">City / Address</th>
                <th className="py-3.5 px-4">Assigned To</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Rating</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Loading extracted leads...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No leads found matching current search or filters.
                  </td>
                </tr>
              ) : (
                leads.map((l) => (
                  <tr key={l._id} className="hover:bg-slate-50 transition">
                    {isAdmin && (
                      <td className="py-3.5 px-4">
                        <button onClick={() => toggleSelectLead(l._id)} className="text-slate-500 hover:text-cyan-600">
                          {selectedLeadIds.includes(l._id) ? (
                            <CheckSquare className="w-4 h-4 text-cyan-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    )}

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
                          <Building2 className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 leading-tight">{l.businessName}</p>
                          <span className="text-3xs text-slate-500">{l.category || 'Business'}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {l.phone ? (
                        <span className="font-mono text-slate-800">{l.phone}</span>
                      ) : (
                        <span className="text-slate-400 italic">No Phone</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">
                      <div className="flex items-center gap-2">
                        <MapLocationButton lead={l} />
                        <span className="max-w-[180px] truncate">{l.address || l.city || '-'}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {l.assignedTo && l.assignedTo.name ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-600 text-3xs font-bold border border-cyan-200">
                          👤 {l.assignedTo.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-3xs font-bold">
                        {l.leadStatus || 'NEW'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      {l.rating ? (
                        <div className="flex items-center gap-1 text-amber-600 font-bold">
                          <Star className="w-3 h-3 fill-amber-400" />
                          <span>{l.rating}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setSelectedLeadIds([l._id]);
                              setShowAssignModal(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-amber-100 hover:text-amber-600 text-slate-500 transition cursor-pointer"
                            title="Assign to Employee"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedLead(l)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-cyan-100 hover:text-cyan-600 text-slate-500 transition cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <AssignLeadsModal
          leadIds={selectedLeadIds}
          employeesList={employeesList}
          onClose={() => {
            setShowAssignModal(false);
            setSelectedLeadIds([]);
          }}
          onSuccess={fetchLeads}
        />
      )}

      {/* Lead Inspector Modal */}
      {selectedLead && (
        <LeadDetailModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}
    </div>
  );
};
