import React, { useEffect, useState } from 'react';
import { scraperApi, ScrapedLead } from '../api/scraperApi';
import { User } from '../api/userApi';
import { AssignLeadsModal } from './AssignLeadsModal';
import { MapLocationButton } from './MapLocationButton';
import { X, Sparkles, Download, Phone, Globe, Star, Building2, UserCheck, CheckSquare, Square, RefreshCw } from 'lucide-react';

interface NewlyExtractedModalProps {
  jobId: string;
  currentUser: User;
  usersList: User[];
  onClose: () => void;
  onGoToAllLeads: (jobId?: string) => void;
}

export const NewlyExtractedModal: React.FC<NewlyExtractedModalProps> = ({
  jobId,
  currentUser,
  usersList,
  onClose,
  onGoToAllLeads
}) => {
  const [leads, setLeads] = useState<ScrapedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const isAdmin = currentUser.role === 'ADMIN';
  const employeesList = usersList.filter(u => u.role === 'EMPLOYEE');

  const fetchJobLeads = async () => {
    setLoading(true);
    try {
      const res = await scraperApi.getLeads({ jobId });
      if (res.success) {
        setLeads(res.data || []);
      }
    } catch (err) {
      console.error('Error fetching job leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) {
      fetchJobLeads();
    }
  }, [jobId]);

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
    const url = scraperApi.getExportUrl('csv', { jobId });
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-cyan-200 rounded-3xl p-6 w-full max-w-4xl max-h-[90vh] shadow-2xl space-y-5 relative flex flex-col overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 pr-10">
          <div className="w-11 h-11 rounded-2xl bg-cyan-50 border border-cyan-200 text-cyan-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 animate-bounce" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-2xs font-bold mb-1">
              ✨ Fresh Scrape Mission Completed
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">Newly Generated Business Leads ({leads.length})</h2>
            <p className="text-xs text-slate-500">
              Extraction results for Job ID: <span className="font-mono text-cyan-600 font-bold">{jobId}</span>
            </p>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span>{selectedLeadIds.length} leads selected</span>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && selectedLeadIds.length > 0 && (
              <button
                onClick={() => setShowAssignModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-extrabold shadow-lg shadow-amber-500/20 transition cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Assign {selectedLeadIds.length} Leads</span>
              </button>
            )}

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Leads Table Container */}
        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white z-10 border-b border-slate-200">
              <tr className="text-slate-500 font-semibold uppercase tracking-wider">
                {isAdmin && (
                  <th className="py-3 px-4 w-10">
                    <button onClick={toggleSelectAll} className="text-slate-500 hover:text-cyan-600">
                      {selectedLeadIds.length > 0 && selectedLeadIds.length === leads.length ? (
                        <CheckSquare className="w-4 h-4 text-cyan-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                )}
                <th className="py-3 px-4">Business Name</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">City / Address</th>
                <th className="py-3 px-4">Rating</th>
                <th className="py-3 px-4">Assigned To</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    Loading fresh scraped leads...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No leads found for this job.
                  </td>
                </tr>
              ) : (
                leads.map((l) => (
                  <tr key={l._id} className="hover:bg-slate-50 transition">
                    {isAdmin && (
                      <td className="py-3 px-4">
                        <button onClick={() => toggleSelectLead(l._id)} className="text-slate-500 hover:text-cyan-600">
                          {selectedLeadIds.includes(l._id) ? (
                            <CheckSquare className="w-4 h-4 text-cyan-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    )}

                    <td className="py-3 px-4">
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

                    <td className="py-3 px-4">
                      {l.phone ? (
                        <span className="font-mono text-slate-800">{l.phone}</span>
                      ) : (
                        <span className="text-slate-400 italic">No Phone</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-600">
                      <div className="flex items-center gap-2">
                        <MapLocationButton lead={l} />
                        <span className="max-w-[180px] truncate">{l.address || l.city || '-'}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {l.rating ? (
                        <div className="flex items-center gap-1 text-amber-600 font-bold">
                          <Star className="w-3 h-3 fill-amber-400" />
                          <span>{l.rating}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {l.assignedTo && l.assignedTo.name ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-600 text-3xs font-bold border border-cyan-200">
                          👤 {l.assignedTo.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => {
              onClose();
              onGoToAllLeads(jobId);
            }}
            className="text-xs font-bold text-cyan-600 hover:underline cursor-pointer"
          >
            Open in Full Scraped Leads Explorer ➔
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer"
          >
            Close Dialogue
          </button>
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
            onSuccess={fetchJobLeads}
          />
        )}
      </div>
    </div>
  );
};
