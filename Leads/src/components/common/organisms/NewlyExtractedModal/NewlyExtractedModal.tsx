import React, { useEffect, useState } from 'react';
import { scraperApi, ScrapedLead } from '../../../../api/scraperApi';
import { User } from '../../../../api/userApi';
import { AssignLeadsModal } from '../AssignLeadsModal/AssignLeadsModal';
import { MapLocationButton } from '../../molecules/MapLocationButton/MapLocationButton';
import { X, Sparkles, Download, Phone, Globe, UserCheck, RefreshCw } from 'lucide-react';
import { Box, Heading, Inline, PlainButton, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Text } from '../../atoms';
import { SelectionToggle } from '../../molecules/SelectionToggle';
import { useLeadSelection } from '../../hooks/useLeadSelection';
import { LeadIdentity } from '../../molecules/LeadIdentity';
import { LeadPhone, LeadRating, LeadAssignee } from '../../molecules/LeadCells';

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
  const { selectedLeadIds, setSelectedLeadIds, toggleSelectLead, toggleSelectAll } = useLeadSelection(leads);
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

  const handleExportCSV = () => {
    const url = scraperApi.getExportUrl('csv', { jobId });
    window.open(url, '_blank');
  };

  return (
    <Box className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <Box className="bg-white border border-cyan-200 rounded-3xl p-6 w-full max-w-4xl max-h-[90vh] shadow-2xl space-y-5 relative flex flex-col overflow-hidden">
        {/* Close Button */}
        <PlainButton
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </PlainButton>

        {/* Modal Header */}
        <Box className="flex items-center gap-3 pr-10">
          <Box className="w-11 h-11 rounded-2xl bg-cyan-50 border border-cyan-200 text-cyan-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 animate-bounce" />
          </Box>
          <Box>
            <Box className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-2xs font-bold mb-1">
              ✨ Fresh Scrape Mission Completed
            </Box>
            <Heading level={2} className="text-xl font-extrabold text-slate-900">Newly Generated Business Leads ({leads.length})</Heading>
            <Text className="text-xs text-slate-500">
              Extraction results for Job ID: <Inline className="font-mono text-cyan-600 font-bold">{jobId}</Inline>
            </Text>
          </Box>
        </Box>

        {/* Actions Bar */}
        <Box className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
          <Box className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <Inline>{selectedLeadIds.length} leads selected</Inline>
          </Box>

          <Box className="flex items-center gap-2">
            {isAdmin && selectedLeadIds.length > 0 && (
              <PlainButton
                onClick={() => setShowAssignModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-extrabold shadow-lg shadow-amber-500/20 transition cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <Inline>Assign {selectedLeadIds.length} Leads</Inline>
              </PlainButton>
            )}

            <PlainButton
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <Inline>Export CSV</Inline>
            </PlainButton>
          </Box>
        </Box>

        {/* Leads Table Container */}
        <Box className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl">
          <Table className="w-full text-left text-xs">
            <TableHead className="sticky top-0 bg-white z-10 border-b border-slate-200">
              <TableRow className="text-slate-500 font-semibold uppercase tracking-wider">
                {isAdmin && (
                  <TableHeaderCell className="py-3 px-4 w-10">
                    <SelectionToggle
                      checked={selectedLeadIds.length > 0 && selectedLeadIds.length === leads.length}
                      onToggle={toggleSelectAll}
                    />
                  </TableHeaderCell>
                )}
                <TableHeaderCell className="py-3 px-4">Business Name</TableHeaderCell>
                <TableHeaderCell className="py-3 px-4">Phone</TableHeaderCell>
                <TableHeaderCell className="py-3 px-4">City / Address</TableHeaderCell>
                <TableHeaderCell className="py-3 px-4">Rating</TableHeaderCell>
                <TableHeaderCell className="py-3 px-4">Assigned To</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody className="divide-y divide-slate-200">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-slate-500">
                    Loading fresh scraped leads...
                  </TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-slate-400">
                    No leads found for this job.
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((l) => (
                  <TableRow key={l._id} className="hover:bg-slate-50 transition">
                    {isAdmin && (
                      <TableCell className="py-3 px-4">
                        <SelectionToggle
                          checked={selectedLeadIds.includes(l._id)}
                          onToggle={() => toggleSelectLead(l._id)}
                        />
                      </TableCell>
                    )}

                    <TableCell className="py-3 px-4">
                      <LeadIdentity businessName={l.businessName} category={l.category} />
                    </TableCell>

                    <TableCell className="py-3 px-4">
                      <LeadPhone phone={l.phone} />
                    </TableCell>

                    <TableCell className="py-3 px-4 text-slate-600">
                      <Box className="flex items-center gap-2">
                        <MapLocationButton lead={l} />
                        <Inline className="max-w-[180px] truncate">{l.address || l.city || '-'}</Inline>
                      </Box>
                    </TableCell>

                    <TableCell className="py-3 px-4">
                      <LeadRating rating={l.rating} />
                    </TableCell>

                    <TableCell className="py-3 px-4">
                      <LeadAssignee name={l.assignedTo && l.assignedTo.name} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Box>

        {/* Modal Footer */}
        <Box className="flex items-center justify-between pt-2">
          <PlainButton
            onClick={() => {
              onClose();
              onGoToAllLeads(jobId);
            }}
            className="text-xs font-bold text-cyan-600 hover:underline cursor-pointer"
          >
            Open in Full Scraped Leads Explorer ➔
          </PlainButton>

          <PlainButton
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer"
          >
            Close Dialogue
          </PlainButton>
        </Box>

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
      </Box>
    </Box>
  );
};
