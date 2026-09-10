import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Radar, RefreshCw, Trash2, X } from 'lucide-react';
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
import { filterBySearch } from '../components/common/utils';

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
  const [status, setStatus] = useState('All');
  const [toast, setToast] = useState<ToastState | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<JobForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<ScrapeJobEntity | null>(null);
  const [editForm, setEditForm] = useState<JobForm | null>(null);

  const [pendingDelete, setPendingDelete] = useState<ScrapeJobEntity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, loading, error, refreshing, reload } = useFetch(() => scraperJobService.getScrapeJobs(), []);

  const jobs = useMemo(() => {
    let list = data ?? [];
    if (status !== 'All') list = list.filter((j) => j.status === status);
    return filterBySearch(list, search, (j, q) => `${j.name} ${j.query} ${j.location}`.toLowerCase().includes(q));
  }, [data, search, status]);

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
        <Box className="flex flex-wrap items-center gap-2.5">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-36">
            <Option value="All">All statuses</Option>
            {SCRAPE_JOB_STATUSES.map((s) => (
              <Option key={s} value={s}>
                {s}
              </Option>
            ))}
          </Select>
          {status !== 'All' && (
            <Button size="sm" variant="ghost" icon={X} onClick={() => setStatus('All')}>
              Clear
            </Button>
          )}
          <Inline className="text-label text-ink-3 ml-auto tabular">
            {loading ? 'Loading…' : `${jobs.length} job${jobs.length === 1 ? '' : 's'}`}
          </Inline>
        </Box>
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
                      title={search || status !== 'All' ? 'No matching jobs' : 'No scrape jobs yet'}
                      description="Jobs started from the leads panel — or added here directly — will appear in this list."
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
