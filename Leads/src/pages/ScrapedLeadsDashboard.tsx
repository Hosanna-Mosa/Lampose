import React, { useEffect, useState } from 'react';
import { scraperApi, ScrapedLead, ScrapeJob } from '../api/scraperApi';
import { User } from '../api/userApi';
import { AssignLeadsModal } from '../components/common/organisms/AssignLeadsModal';
import { LeadDetailModal } from '../components/scraped-leads/organisms/LeadDetailModal';
import { leadStatusMeta, timeAgo } from '../api/leadStatus';
import { Pagination } from '../components/common/molecules/Pagination';
import { MapLocationButton } from '../components/common/molecules/MapLocationButton';
import { Search, Download, Eye, RefreshCw, UserCheck, Filter } from 'lucide-react';
import { Box, Heading, Inline, Input, Option, PlainButton, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Text } from '../components/common/atoms';
import { SelectionToggle } from '../components/common/molecules/SelectionToggle';
import { useLeadSelection } from '../components/common/hooks/useLeadSelection';
import { LeadIdentity } from '../components/common/molecules/LeadIdentity';
import { LeadPhone, LeadRating, LeadAssignee } from '../components/common/molecules/LeadCells';

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
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [pageInfo, setPageInfo] = useState({ total: 0, pages: 1 });
  const { selectedLeadIds, setSelectedLeadIds, toggleSelectLead, toggleSelectAll } = useLeadSelection(leads);
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
        leadStatus: statusFilter !== 'ALL' ? statusFilter : undefined,
        page,
        limit
      });
      if (res.success) {
        setLeads(res.data || []);
        setPageInfo({ total: res.total ?? res.count ?? 0, pages: res.pages ?? 1 });
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
  }, [search, selectedJobId, sourceFilter, phoneFilter, websiteFilter, statusFilter, page, limit]);

  /* Any change to what is being asked for sends the reader back to page 1.
     Staying on page 7 of a filter that now has two pages shows an empty table
     and no reason for it. */
  useEffect(() => {
    setPage(1);
  }, [search, selectedJobId, sourceFilter, phoneFilter, websiteFilter, statusFilter, limit]);

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
    <Box className="space-y-6">
      {/* Header Controls */}
      <Box className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Box>
          <Heading level={1} className="text-2xl font-extrabold text-slate-900 tracking-tight">Scraped Leads Explorer</Heading>
          <Text className="text-xs text-slate-500">
            View all generated leads, assign them to employees, or export data.
          </Text>
        </Box>

        <Box className="flex items-center gap-2">
          {isAdmin && selectedLeadIds.length > 0 && (
            <PlainButton
              onClick={() => setShowAssignModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-extrabold shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <Inline>Assign {selectedLeadIds.length} Selected Leads</Inline>
            </PlainButton>
          )}

          <PlainButton
            onClick={fetchLeads}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </PlainButton>
          <PlainButton
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <Inline>Export CSV</Inline>
          </PlainButton>
          <PlainButton
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-300 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-600" />
            <Inline>JSON</Inline>
          </PlainButton>
        </Box>
      </Box>

      {/* Search & Filters */}
      <Box className="glass-panel p-4 rounded-2xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Search */}
        <Box className="relative col-span-1 sm:col-span-2 lg:col-span-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <Input
            type="text"
            placeholder="Search business, city, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition"
          />
        </Box>

        {/* Mission / Job Filter */}
        <Box>
          <Select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-cyan-600 font-semibold focus:outline-none focus:border-cyan-500 transition cursor-pointer"
          >
            <Option value="ALL">All Scrape Missions (Combined)</Option>
            {jobsList.map(j => (
              <Option key={j.jobId} value={j.jobId}>
                🎯 {j.name} ({j.resultCount || 0} leads)
              </Option>
            ))}
          </Select>
        </Box>

        {/* Source Filter */}
        <Box>
          <Select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition cursor-pointer"
          >
            <Option value="ALL">All Providers</Option>
            <Option value="GoogleMaps">Google Maps Only</Option>
            <Option value="JustDial">JustDial Only</Option>
            {/* Typed in by hand, from the onboarding site. Kept in step with
                the `source` enum in scriper.model.js — a value the server
                accepts and this list omits is a lead nobody can filter to. */}
            <Option value="Manual">Manually Added</Option>
          </Select>
        </Box>

        {/* Phone Filter */}
        <Box>
          <Select
            value={phoneFilter}
            onChange={(e) => setPhoneFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition cursor-pointer"
          >
            <Option value="ALL">All Leads (Phone)</Option>
            <Option value="YES">Has Phone Number</Option>
          </Select>
        </Box>

        {/* Lead Status Filter */}
        <Box>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition cursor-pointer"
          >
            <Option value="ALL">All Statuses</Option>
            <Option value="NEW">🆕 New Leads</Option>
            <Option value="CONTACTED">📞 Contacted</Option>
            <Option value="QUALIFIED">⭐ Qualified</Option>
            <Option value="CLOSED_WON">🎉 Closed Won</Option>
          </Select>
        </Box>
      </Box>

      {/* Leads Table */}
      <Box className="glass-panel rounded-2xl overflow-hidden shadow-2xl">
        <Box className="overflow-x-auto">
          <Table className="w-full text-left text-xs">
            <TableHead>
              <TableRow className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider bg-slate-50">
                {isAdmin && (
                  <TableHeaderCell className="py-3.5 px-4 w-10">
                    <SelectionToggle
                      checked={selectedLeadIds.length > 0 && selectedLeadIds.length === leads.length}
                      onToggle={toggleSelectAll}
                    />
                  </TableHeaderCell>
                )}
                <TableHeaderCell className="py-3.5 px-4">Business Name</TableHeaderCell>
                <TableHeaderCell className="py-3.5 px-4">Phone</TableHeaderCell>
                <TableHeaderCell className="py-3.5 px-4">City / Address</TableHeaderCell>
                <TableHeaderCell className="py-3.5 px-4">Assigned To</TableHeaderCell>
                <TableHeaderCell className="py-3.5 px-4">Status</TableHeaderCell>
                <TableHeaderCell className="py-3.5 px-4">Rating</TableHeaderCell>
                <TableHeaderCell className="py-3.5 px-4 text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody className="divide-y divide-slate-200">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-slate-500">
                    Loading extracted leads...
                  </TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-slate-400">
                    No leads found matching current search or filters.
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((l) => (
                  <TableRow key={l._id} className="hover:bg-slate-50 transition">
                    {isAdmin && (
                      <TableCell className="py-3.5 px-4">
                        <SelectionToggle
                          checked={selectedLeadIds.includes(l._id)}
                          onToggle={() => toggleSelectLead(l._id)}
                        />
                      </TableCell>
                    )}

                    <TableCell className="py-3.5 px-4">
                      <LeadIdentity businessName={l.businessName} category={l.category} />
                    </TableCell>

                    <TableCell className="py-3.5 px-4">
                      <LeadPhone phone={l.phone} />
                    </TableCell>

                    <TableCell className="py-3.5 px-4 text-slate-600">
                      <Box className="flex items-center gap-2">
                        <MapLocationButton lead={l} />
                        <Inline className="max-w-[180px] truncate">{l.address || l.city || '-'}</Inline>
                      </Box>
                    </TableCell>

                    <TableCell className="py-3.5 px-4">
                      <LeadAssignee name={l.assignedTo && l.assignedTo.name} />
                    </TableCell>

                    <TableCell className="py-3.5 px-4">
                      {/* The rep's own colour, not a generic grey one — this cell
                          is the admin's view of what the employee did. */}
                      <Inline className={`px-2 py-0.5 rounded-md border text-3xs font-bold whitespace-nowrap ${leadStatusMeta(l.leadStatus).chip}`}>
                        {leadStatusMeta(l.leadStatus).short}
                      </Inline>
                      {l.lastActivityAt && (
                        <Box className="mt-1 text-3xs text-slate-400 whitespace-nowrap">
                          {l.lastActivityBy?.name ? `by ${l.lastActivityBy.name} · ` : ''}
                          {timeAgo(l.lastActivityAt)}
                        </Box>
                      )}
                    </TableCell>

                    <TableCell className="py-3.5 px-4">
                      <LeadRating rating={l.rating} />
                    </TableCell>

                    <TableCell className="py-3.5 px-4 text-right">
                      <Box className="flex items-center justify-end gap-1.5">
                        {isAdmin && (
                          <PlainButton
                            onClick={() => {
                              setSelectedLeadIds([l._id]);
                              setShowAssignModal(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-amber-100 hover:text-amber-600 text-slate-500 transition cursor-pointer"
                            title="Assign to Employee"
                          >
                            <UserCheck className="w-4 h-4" />
                          </PlainButton>
                        )}
                        <PlainButton
                          onClick={() => setSelectedLead(l)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-cyan-100 hover:text-cyan-600 text-slate-500 transition cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </PlainButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Box>

        <Pagination
          page={page}
          pages={pageInfo.pages}
          total={pageInfo.total}
          count={leads.length}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={setLimit}
          noun="leads"
        />
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
          onSuccess={fetchLeads}
        />
      )}

      {/* Lead Inspector Modal */}
      {selectedLead && (
        <LeadDetailModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}
    </Box>
  );
};
