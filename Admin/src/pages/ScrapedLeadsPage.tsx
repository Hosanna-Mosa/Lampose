import React, { useState } from 'react';
import { ListChecks, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  TableSkeleton,
  Td,
  Th,
  Toast,
  Tr,
  type ToastState,
} from '../components/ui';
import { scraperLeadService } from '../api/services/scraperLeadService';
import { useFetch } from '../lib/useFetch';
import { LEAD_STATUSES, SCRAPE_SOURCES, leadStatusMeta } from '../lib/domain';
import type { LeadStatus, ScrapedLeadEntity, ScrapeSource } from '../api/types';

interface ScrapedLeadsPageProps {
  search: string;
}

interface LeadForm {
  businessName: string;
  source: ScrapeSource;
  phone: string;
  email: string;
  website: string;
  address: string;
  category: string;
  city: string;
  leadStatus: LeadStatus;
}

const EMPTY_FORM: LeadForm = {
  businessName: '',
  source: 'GoogleMaps',
  phone: '',
  email: '',
  website: '',
  address: '',
  category: '',
  city: '',
  leadStatus: 'NEW',
};

const toForm = (l: ScrapedLeadEntity): LeadForm => ({
  businessName: l.businessName,
  source: l.source,
  phone: l.phone,
  email: l.email,
  website: l.website,
  address: l.address,
  category: l.category,
  city: l.city,
  leadStatus: l.leadStatus,
});

export const ScrapedLeadsPage: React.FC<ScrapedLeadsPageProps> = ({ search }) => {
  const [leadStatus, setLeadStatus] = useState('All');
  const [toast, setToast] = useState<ToastState | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<LeadForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ScrapedLeadEntity | null>(null);
  const [editForm, setEditForm] = useState<LeadForm | null>(null);

  const [pendingDelete, setPendingDelete] = useState<ScrapedLeadEntity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, loading, error, refreshing, reload } = useFetch(
    () => scraperLeadService.getLeads({ ...(leadStatus !== 'All' && { leadStatus }), ...(search && { search }) }),
    [leadStatus, search]
  );

  const leads = data ?? [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const res = await scraperLeadService.createLead({
      businessName: form.businessName.trim(),
      source: form.source,
      phone: form.phone.trim(),
      email: form.email.trim(),
      website: form.website.trim(),
      address: form.address.trim(),
      category: form.category.trim(),
      city: form.city.trim(),
    });
    setSaving(false);

    if (res.success) {
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setToast({ tone: 'good', message: `"${form.businessName}" added.` });
      reload();
    } else {
      setFormError(res.message || 'Could not create the lead.');
    }
  };

  const openEdit = (l: ScrapedLeadEntity) => {
    setEditing(l);
    setEditForm(toForm(l));
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editForm) return;
    setSaving(true);

    const res = await scraperLeadService.updateLead(editing.id, {
      businessName: editForm.businessName.trim(),
      phone: editForm.phone.trim(),
      email: editForm.email.trim(),
      website: editForm.website.trim(),
      address: editForm.address.trim(),
      category: editForm.category.trim(),
      city: editForm.city.trim(),
      leadStatus: editForm.leadStatus,
    });
    setSaving(false);

    if (res.success) {
      setToast({ tone: 'good', message: `"${editForm.businessName}" updated.` });
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
    const res = await scraperLeadService.deleteLead(pendingDelete.id);
    setDeleting(false);

    if (res.success) {
      setToast({ tone: 'good', message: 'Lead deleted.' });
      setPendingDelete(null);
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Delete failed.' });
      setPendingDelete(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Database"
        title="Scraped Leads"
        description="Business records found by scrape jobs (or entered by hand), from the scriper_leads collection."
        actions={
          <>
            <IconButton icon={RefreshCw} label="Reload leads" onClick={reload} spinning={refreshing || loading} />
            <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
              Add lead
            </Button>
          </>
        }
      />

      <Card padded={false} className="p-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Select value={leadStatus} onChange={(e) => setLeadStatus(e.target.value)} className="w-auto min-w-40">
            <option value="All">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {leadStatusMeta(s).label}
              </option>
            ))}
          </Select>
          {leadStatus !== 'All' && (
            <Button size="sm" variant="ghost" icon={X} onClick={() => setLeadStatus('All')}>
              Clear
            </Button>
          )}
          <span className="text-label text-ink-3 ml-auto tabular">
            {loading ? 'Loading…' : `${leads.length} lead${leads.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </Card>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <Card padded={false}>
          <Table>
            <thead>
              <tr>
                <Th>Business</Th>
                <Th>Contact</Th>
                <Th>City</Th>
                <Th>Status</Th>
                <Th>Assigned to</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : !leads.length ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={ListChecks}
                      title={search || leadStatus !== 'All' ? 'No matching leads' : 'No leads yet'}
                      description="Leads found by a scrape job — or added here directly — will appear in this list."
                    />
                  </td>
                </tr>
              ) : (
                leads.map((l) => {
                  const meta = leadStatusMeta(l.leadStatus);
                  return (
                    <Tr key={l.id}>
                      <Td>
                        <p className="text-sm font-medium text-ink truncate">{l.businessName}</p>
                        <p className="text-label text-ink-3 truncate">{l.category || l.source}</p>
                      </Td>
                      <Td>
                        <p className="text-sm text-ink truncate">{l.phone || '—'}</p>
                        <p className="text-label text-ink-3 truncate">{l.email || '—'}</p>
                      </Td>
                      <Td>{l.city || '—'}</Td>
                      <Td>
                        <Badge tone={meta.tone} icon={meta.icon}>
                          {meta.label}
                        </Badge>
                      </Td>
                      <Td>{l.assignedTo.name || '—'}</Td>
                      <Td>
                        <div className="flex items-center justify-end gap-0.5">
                          <IconButton icon={Pencil} label={`Edit ${l.businessName}`} onClick={() => openEdit(l)} />
                          <IconButton
                            icon={Trash2}
                            label={`Delete ${l.businessName}`}
                            tone="danger"
                            onClick={() => setPendingDelete(l)}
                          />
                        </div>
                      </Td>
                    </Tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add lead"
        description="A manually-entered business record."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" form="create-lead" type="submit" loading={saving}>
              Create lead
            </Button>
          </>
        }
      >
        <form id="create-lead" onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <p className="text-sm text-crit bg-crit-soft border border-crit-border rounded-control px-3 py-2">
              {formError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Business name" required>
              <Input required value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} />
            </Field>
            <Field label="Source">
              <Select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as ScrapeSource }))}>
                {SCRAPE_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
          </div>
          <Field label="Website">
            <Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
          </Field>
          <Field label="Address">
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </Field>
          </div>
        </form>
      </Modal>

      {/* Edit */}
      <Modal
        open={!!editing && !!editForm}
        onClose={() => {
          setEditing(null);
          setEditForm(null);
        }}
        title={`Edit ${editing?.businessName ?? ''}`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" form="edit-lead" type="submit" loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        {editForm && (
          <form id="edit-lead" onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Business name">
                <Input value={editForm.businessName} onChange={(e) => setEditForm((f) => f && { ...f, businessName: e.target.value })} />
              </Field>
              <Field label="Status">
                <Select
                  value={editForm.leadStatus}
                  onChange={(e) => setEditForm((f) => f && { ...f, leadStatus: e.target.value as LeadStatus })}
                >
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {leadStatusMeta(s).label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <Input value={editForm.phone} onChange={(e) => setEditForm((f) => f && { ...f, phone: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => f && { ...f, email: e.target.value })} />
              </Field>
            </div>
            <Field label="Website">
              <Input value={editForm.website} onChange={(e) => setEditForm((f) => f && { ...f, website: e.target.value })} />
            </Field>
            <Field label="Address">
              <Input value={editForm.address} onChange={(e) => setEditForm((f) => f && { ...f, address: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Input value={editForm.category} onChange={(e) => setEditForm((f) => f && { ...f, category: e.target.value })} />
              </Field>
              <Field label="City">
                <Input value={editForm.city} onChange={(e) => setEditForm((f) => f && { ...f, city: e.target.value })} />
              </Field>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete lead"
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
        <p className="text-body text-ink-2">
          <span className="text-ink font-medium">{pendingDelete?.businessName}</span> will be removed from the leads
          list. This cannot be undone.
        </p>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
