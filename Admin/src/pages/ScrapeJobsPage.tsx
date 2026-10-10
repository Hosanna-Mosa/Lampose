import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Radar, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { IconButton } from '../components/common/atoms/IconButton';
import { Input } from '../components/common/atoms/Input';
import { Select } from '../components/common/atoms/Select';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { scraperJobService } from '../api/services/scraperJobService';
import { useFetch } from '../lib/useFetch';
import { SCRAPE_JOB_STATUSES, SCRAPE_SOURCES, scrapeJobStatusMeta } from '../lib/domain';
import { formatDateTime } from '../lib/format';
import type { ScrapeJobEntity, ScrapeJobStatus, ScrapeSource } from '../api/types';
import { Box } from '../components/common/atoms/Box';
import { Form } from '../components/common/atoms/Form';
import { Inline } from '../components/common/atoms/Inline';
import { Option } from '../components/common/atoms/Option';
import { PlainTd, PlainTr, TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Text } from '../components/common/atoms/Text';
import { FilterBar } from '../components/common/molecules/FilterBar';
import { FilterChips } from '../components/common/molecules/FilterChips';
import { ResultCount } from '../components/common/molecules/ResultCount';
import { filterBySearch, filterSelectClass } from '../components/common/utils';

interface ScrapeJobsPageProps {
  search: string;
}

interface JobForm {
  name: string;
  source: ScrapeSource;
  query: string;
  location: string;
  landmark: string;
  depth: string;
  status: ScrapeJobStatus;
  statusMessage: string;
  resultCount: string;
}

type ResultsFilter = 'All' | 'with' | 'none';

interface JobFilters {
  status: string;
  source: string;
  results: ResultsFilter;
}

const NO_FILTERS: JobFilters = { status: 'All', source: 'All', results: 'All' };

/* One predicate per dimension, so each control's counts can be taken over
   the list narrowed by every OTHER control — "Completed 4" then means four
   jobs would show if that chip were picked, with the source and results
   choices left as they are. */
const matches = (j: ScrapeJobEntity, f: JobFilters, skip?: keyof JobFilters) =>
  (skip === 'status' || f.status === 'All' || j.status === f.status) &&
  (skip === 'source' || f.source === 'All' || j.source === f.source) &&
  (skip === 'results' || f.results === 'All' || (f.results === 'with' ? j.resultCount > 0 : j.resultCount === 0));

const EMPTY_FORM: JobForm = {
  name: '',
  source: 'GoogleMaps',
  query: '',
  location: '',
  landmark: '',
  depth: '10',
  status: 'started',
  statusMessage: '',
  resultCount: '0',
};

const toForm = (j: ScrapeJobEntity): JobForm => ({
  name: j.name,
  source: j.source,
  query: j.query,
  location: j.location,
  landmark: j.landmark,
  depth: String(j.depth || 0),
  status: j.status,
  statusMessage: j.statusMessage,
  resultCount: String(j.resultCount || 0),
});

export const ScrapeJobsPage: React.FC<ScrapeJobsPageProps> = ({ search }) => {
  const [filters, setFilters] = useState<JobFilters>(NO_FILTERS);
  const setFilter = <K extends keyof JobFilters>(key: K, value: JobFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const [toast, setToast] = useState<ToastState | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<JobForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<ScrapeJobEntity | null>(null);
  const [editForm, setEditForm] = useState<JobForm | null>(null);

  const [pendingDelete, setPendingDelete] = useState<ScrapeJobEntity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, loading, error, refreshing, reload } = useFetch(() => scraperJobService.getScrapeJobs(), []);

  const searched = useMemo(
    () =>
      filterBySearch(data ?? [], search, (j, q) =>
        `${j.name} ${j.query} ${j.location} ${j.landmark} ${j.source} ${j.statusMessage}`.toLowerCase().includes(q)
      ),
    [data, search]
  );

  const jobs = useMemo(() => searched.filter((j) => matches(j, filters)), [searched, filters]);

  const counts = useMemo(() => {
    const tally = (skip: keyof JobFilters, key: (j: ScrapeJobEntity) => string) => {
      const out: Record<string, number> = {};
      let all = 0;
      for (const j of searched) {
        if (!matches(j, filters, skip)) continue;
        all += 1;
        const k = key(j);
        out[k] = (out[k] ?? 0) + 1;
      }
      return { ...out, All: all };
    };
    return {
      status: tally('status', (j) => j.status),
      source: tally('source', (j) => j.source),
      results: tally('results', (j) => (j.resultCount > 0 ? 'with' : 'none')),
    };
  }, [searched, filters]);

  const total = data?.length ?? 0;
  const filtersActive = filters.status !== 'All' || filters.source !== 'All' || filters.results !== 'All';
  const filtered = filtersActive || !!search.trim();
  const clearFilters = () => setFilters(NO_FILTERS);
  /* Unknown while loading — left off rather than shown as 0. */
  const countOf = (dim: keyof typeof counts, id: string) => (loading ? null : (counts[dim] as Record<string, number>)[id] ?? 0);
  const withCount = (label: string, n: number | null) => (n == null ? label : `${label} (${n.toLocaleString('en-IN')})`);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await scraperJobService.createScrapeJob({
      name: form.name.trim() || 'Scrape Mission',
      source: form.source,
      query: form.query.trim(),
      location: form.location.trim(),
      landmark: form.landmark.trim(),
      depth: Number(form.depth) || 0,
      status: form.status,
    });
    setSaving(false);

    if (res.success) {
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setToast({ tone: 'good', message: 'Scrape job created.' });
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Could not create the job.' });
    }
  };

  const openEdit = (j: ScrapeJobEntity) => {
    setEditing(j);
    setEditForm(toForm(j));
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editForm) return;
    setSaving(true);

    const res = await scraperJobService.updateScrapeJob(editing.id, {
      name: editForm.name.trim(),
      source: editForm.source,
      query: editForm.query.trim(),
      location: editForm.location.trim(),
      landmark: editForm.landmark.trim(),
      depth: Number(editForm.depth) || 0,
      status: editForm.status,
      statusMessage: editForm.statusMessage.trim(),
      resultCount: Number(editForm.resultCount) || 0,
    });
    setSaving(false);

    if (res.success) {
      setToast({ tone: 'good', message: `"${editForm.name}" updated.` });
      setEditing(null);
      setEditForm(null);
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Update failed.' });
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await scraperJobService.deleteScrapeJob(pendingDelete.id);
    setDeleting(false);

    if (res.success) {
      setToast({ tone: 'good', message: 'Job deleted.' });
      setPendingDelete(null);
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Delete failed.' });
      setPendingDelete(null);
    }
  };

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="Database"
        title="Scrape Jobs"
        description="Google Maps / JustDial scrape runs, from the scriper_jobs collection."
        actions={
          <>
            <IconButton icon={RefreshCw} label="Reload jobs" onClick={reload} spinning={refreshing || loading} />
            <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
              Add job
            </Button>
          </>
        }
      />

      <Card padded={false} className="p-3">
        <FilterBar
          summary={
            loading ? undefined : (
              <ResultCount
                shown={jobs.length}
                total={total}
                noun="jobs"
                filtered={filtered}
                onClear={filtersActive ? clearFilters : undefined}
              />
            )
          }
        >
          <FilterChips
            label="Status"
            value={filters.status}
            onChange={(v) => setFilter('status', v)}
            options={[
              { id: 'All', label: 'All', count: countOf('status', 'All') },
              ...SCRAPE_JOB_STATUSES.map((s) => ({
                id: s,
                label: s.charAt(0).toUpperCase() + s.slice(1),
                count: countOf('status', s),
                tone: scrapeJobStatusMeta(s).tone,
              })),
            ]}
          />
          <Select
            aria-label="Source"
            value={filters.source}
            onChange={(e) => setFilter('source', e.target.value)}
            className={filterSelectClass}
          >
            <Option value="All">{withCount('All sources', countOf('source', 'All'))}</Option>
            {SCRAPE_SOURCES.map((s) => (
              <Option key={s} value={s}>
                {withCount(s, countOf('source', s))}
              </Option>
            ))}
          </Select>
          <Select
            aria-label="Results"
            value={filters.results}
            onChange={(e) => setFilter('results', e.target.value as ResultsFilter)}
            className={filterSelectClass}
          >
            <Option value="All">{withCount('Any results', countOf('results', 'All'))}</Option>
            <Option value="with">{withCount('Found leads', countOf('results', 'with'))}</Option>
            <Option value="none">{withCount('No leads found', countOf('results', 'none'))}</Option>
          </Select>
        </FilterBar>
      </Card>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <Card padded={false}>
          <Table>
            <TableHead>
              <PlainTr>
                <Th>Job</Th>
                <Th>Location</Th>
                <Th>Status</Th>
                <Th>Results</Th>
                <Th>Created</Th>
                <Th />
              </PlainTr>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : !jobs.length ? (
                <PlainTr>
                  <PlainTd colSpan={6}>
                    <EmptyState
                      icon={Radar}
                      title={filtered ? 'No jobs match these filters' : 'No scrape jobs yet'}
                      description={
                        filtered
                          ? 'Try a different search, status, source or results filter.'
                          : 'Jobs started from the leads panel — or added here directly — will appear in this list.'
                      }
                      action={
                        filtersActive ? (
                          <Button size="sm" variant="ghost" onClick={clearFilters}>
                            Clear filters
                          </Button>
                        ) : undefined
                      }
                    />
                  </PlainTd>
                </PlainTr>
              ) : (
                jobs.map((j) => {
                  const meta = scrapeJobStatusMeta(j.status);
                  return (
                    <Tr key={j.id}>
                      <Td>
                        <Text className="text-sm font-medium text-ink truncate">{j.name}</Text>
                        <Text className="text-label text-ink-3 truncate">{j.query || '—'} · {j.source}</Text>
                      </Td>
                      <Td>{j.location || '—'}</Td>
                      <Td>
                        <Badge tone={meta.tone} icon={meta.icon}>
                          {j.status}
                        </Badge>
                      </Td>
                      <Td className="tabular">{j.resultCount}</Td>
                      <Td className="tabular">{formatDateTime(j.createdAt)}</Td>
                      <Td>
                        <Box className="flex items-center justify-end gap-0.5">
                          <IconButton icon={Pencil} label={`Edit ${j.name}`} onClick={() => openEdit(j)} />
                          <IconButton
                            icon={Trash2}
                            label={`Delete ${j.name}`}
                            tone="danger"
                            onClick={() => setPendingDelete(j)}
                          />
                        </Box>
                      </Td>
                    </Tr>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add scrape job"
        description="A manually-entered job record — not a live scrape."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" form="create-scrape-job" type="submit" loading={saving}>
              Create job
            </Button>
          </>
        }
      >
        <Form id="create-scrape-job" onSubmit={handleCreate} className="space-y-4">
          <Box className="grid grid-cols-2 gap-3">
            <Field label="Name" required>
              <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Source">
              <Select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as ScrapeSource }))}>
                {SCRAPE_SOURCES.map((s) => (
                  <Option key={s} value={s}>
                    {s}
                  </Option>
                ))}
              </Select>
            </Field>
          </Box>
          <Field label="Search query">
            <Input value={form.query} onChange={(e) => setForm((f) => ({ ...f, query: e.target.value }))} />
          </Field>
          <Box className="grid grid-cols-2 gap-3">
            <Field label="Location">
              <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            </Field>
            <Field label="Landmark">
              <Input value={form.landmark} onChange={(e) => setForm((f) => ({ ...f, landmark: e.target.value }))} />
            </Field>
          </Box>
          <Box className="grid grid-cols-2 gap-3">
            <Field label="Depth">
              <Input type="number" min={0} value={form.depth} onChange={(e) => setForm((f) => ({ ...f, depth: e.target.value }))} />
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ScrapeJobStatus }))}>
                {SCRAPE_JOB_STATUSES.map((s) => (
                  <Option key={s} value={s}>
                    {s}
                  </Option>
                ))}
              </Select>
            </Field>
          </Box>
        </Form>
      </Modal>

      {/* Edit */}
      <Modal
        open={!!editing && !!editForm}
        onClose={() => {
          setEditing(null);
          setEditForm(null);
        }}
        title={`Edit ${editing?.name ?? ''}`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" form="edit-scrape-job" type="submit" loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        {editForm && (
          <Form id="edit-scrape-job" onSubmit={handleUpdate} className="space-y-4">
            <Box className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <Input value={editForm.name} onChange={(e) => setEditForm((f) => f && { ...f, name: e.target.value })} />
              </Field>
              <Field label="Source">
                <Select
                  value={editForm.source}
                  onChange={(e) => setEditForm((f) => f && { ...f, source: e.target.value as ScrapeSource })}
                >
                  {SCRAPE_SOURCES.map((s) => (
                    <Option key={s} value={s}>
                      {s}
                    </Option>
                  ))}
                </Select>
              </Field>
            </Box>
            <Field label="Search query">
              <Input value={editForm.query} onChange={(e) => setEditForm((f) => f && { ...f, query: e.target.value })} />
            </Field>
            <Box className="grid grid-cols-2 gap-3">
              <Field label="Location">
                <Input value={editForm.location} onChange={(e) => setEditForm((f) => f && { ...f, location: e.target.value })} />
              </Field>
              <Field label="Landmark">
                <Input value={editForm.landmark} onChange={(e) => setEditForm((f) => f && { ...f, landmark: e.target.value })} />
              </Field>
            </Box>
            <Box className="grid grid-cols-3 gap-3">
              <Field label="Status">
                <Select
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => f && { ...f, status: e.target.value as ScrapeJobStatus })}
                >
                  {SCRAPE_JOB_STATUSES.map((s) => (
                    <Option key={s} value={s}>
                      {s}
                    </Option>
                  ))}
                </Select>
              </Field>
              <Field label="Depth">
                <Input type="number" min={0} value={editForm.depth} onChange={(e) => setEditForm((f) => f && { ...f, depth: e.target.value })} />
              </Field>
              <Field label="Result count">
                <Input
                  type="number"
                  min={0}
                  value={editForm.resultCount}
                  onChange={(e) => setEditForm((f) => f && { ...f, resultCount: e.target.value })}
                />
              </Field>
            </Box>
            <Field label="Status message">
              <Input value={editForm.statusMessage} onChange={(e) => setEditForm((f) => f && { ...f, statusMessage: e.target.value })} />
            </Field>
          </Form>
        )}
      </Modal>

      {/* Delete */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete scrape job"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} loading={deleting} onClick={handleDelete}>
              Delete permanently
            </Button>
          </>
        }
      >
        <Text className="text-body text-ink-2">
          <Inline className="text-ink font-medium">{pendingDelete?.name}</Inline> and its job history will be removed.
          The leads it found are not deleted with it. This cannot be undone.
        </Text>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
