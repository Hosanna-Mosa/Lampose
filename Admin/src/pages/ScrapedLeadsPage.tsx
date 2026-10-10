import React, { useMemo, useState } from 'react';
import { ListChecks, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
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
import { scraperLeadService } from '../api/services/scraperLeadService';
import { useFetch } from '../lib/useFetch';
import { LEAD_STATUSES, SCRAPE_SOURCES, leadStatusMeta } from '../lib/domain';
import type { LeadStatus, ScrapedLeadEntity, ScrapeSource } from '../api/types';
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

type ContactFilter = 'All' | 'phone' | 'email' | 'website' | 'noPhone';

interface LeadFilters {
  leadStatus: string;
  source: string;
  city: string;
  category: string;
  contact: ContactFilter;
  /** 'All', 'none' for unassigned, or an assignee's userId. */
  assignee: string;
}

const NO_FILTERS: LeadFilters = {
  leadStatus: 'All',
  source: 'All',
  city: 'All',
  category: 'All',
  contact: 'All',
  assignee: 'All',
};

const CONTACT_OPTIONS: { id: ContactFilter; label: string }[] = [
  { id: 'All', label: 'Any contact' },
  { id: 'phone', label: 'Has phone' },
  { id: 'email', label: 'Has email' },
  { id: 'website', label: 'Has website' },
  { id: 'noPhone', label: 'No phone' },
];

const hasContact = (l: ScrapedLeadEntity, c: ContactFilter) => {
  if (c === 'phone') return !!l.phone;
  if (c === 'email') return !!l.email;
  if (c === 'website') return l.hasWebsite;
  if (c === 'noPhone') return !l.phone;
  return true;
};

/* Blank cities/categories share one bucket rather than vanishing from the
   counts — a lead with no city is still a lead someone may want to find. */
const NONE = '__none__';
const cityOf = (l: ScrapedLeadEntity) => l.city.trim() || NONE;
const categoryOf = (l: ScrapedLeadEntity) => l.category.trim() || NONE;
const assigneeOf = (l: ScrapedLeadEntity) => l.assignedTo.userId || 'none';

/* One predicate per dimension, so each control's counts are taken over the
   list narrowed by every OTHER control: "Interested 12" means twelve leads
   would show if that chip were picked, with city, source and the rest left
   as they are. */
const matches = (l: ScrapedLeadEntity, f: LeadFilters, skip?: keyof LeadFilters) =>
  (skip === 'leadStatus' || f.leadStatus === 'All' || l.leadStatus === f.leadStatus) &&
  (skip === 'source' || f.source === 'All' || l.source === f.source) &&
  (skip === 'city' || f.city === 'All' || cityOf(l) === f.city) &&
  (skip === 'category' || f.category === 'All' || categoryOf(l) === f.category) &&
  (skip === 'contact' || hasContact(l, f.contact)) &&
  (skip === 'assignee' || f.assignee === 'All' || assigneeOf(l) === f.assignee);

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
  const [filters, setFilters] = useState<LeadFilters>(NO_FILTERS);
  const setFilter = <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const [toast, setToast] = useState<ToastState | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<LeadForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ScrapedLeadEntity | null>(null);
  const [editForm, setEditForm] = useState<LeadForm | null>(null);

  const [pendingDelete, setPendingDelete] = useState<ScrapedLeadEntity | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* The whole collection, once: GET /admin/scriper-leads is not paged, so
     filtering here is exact and every control can carry a true count without
     a round trip per keystroke. Search covers the same fields the server's
     own `search` param does, plus the assignee. */
  const { data, loading, error, refreshing, reload } = useFetch(() => scraperLeadService.getLeads(), []);

  const searched = useMemo(
    () =>
      filterBySearch(data ?? [], search, (l, q) =>
        `${l.businessName} ${l.city} ${l.category} ${l.phone} ${l.email} ${l.address} ${l.landmark} ${l.assignedTo.name ?? ''}`
          .toLowerCase()
          .includes(q)
      ),
    [data, search]
  );

  const leads = useMemo(() => searched.filter((l) => matches(l, filters)), [searched, filters]);

  const counts = useMemo(() => {
    const tally = (skip: keyof LeadFilters, keys: (l: ScrapedLeadEntity) => string[]) => {
      const out: Record<string, number> = { All: 0 };
      for (const l of searched) {
        if (!matches(l, filters, skip)) continue;
        out.All += 1;
        for (const k of keys(l)) out[k] = (out[k] ?? 0) + 1;
      }
      return out;
    };
    return {
      leadStatus: tally('leadStatus', (l) => [l.leadStatus]),
      source: tally('source', (l) => [l.source]),
      city: tally('city', (l) => [cityOf(l)]),
      category: tally('category', (l) => [categoryOf(l)]),
      /* Not exclusive — a lead with a phone and an email counts under both. */
      contact: tally('contact', (l) => CONTACT_OPTIONS.filter((o) => o.id !== 'All' && hasContact(l, o.id)).map((o) => o.id)),
      assignee: tally('assignee', (l) => [assigneeOf(l)]),
    };
  }, [searched, filters]);

  /* Select choices come from the whole collection, not the narrowed list, so
     picking one never makes the others disappear from under the cursor. */
  const choices = useMemo(() => {
    const cities = new Set<string>();
    const categories = new Set<string>();
    const assignees = new Map<string, string>();
    for (const l of data ?? []) {
      cities.add(cityOf(l));
      categories.add(categoryOf(l));
      if (l.assignedTo.userId) assignees.set(l.assignedTo.userId, l.assignedTo.name || l.assignedTo.email || 'Unnamed');
    }
    const sorted = (set: Set<string>) =>
      [...set].sort((a, b) => (a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b)));
    return {
      cities: sorted(cities),
      categories: sorted(categories),
      assignees: [...assignees.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [data]);

  const total = data?.length ?? 0;
  const filtersActive = (Object.keys(NO_FILTERS) as (keyof LeadFilters)[]).some((k) => filters[k] !== NO_FILTERS[k]);
  const filtered = filtersActive || !!search.trim();
  const clearFilters = () => setFilters(NO_FILTERS);
  /* Unknown while loading — left off rather than shown as 0. */
  const countOf = (dim: keyof typeof counts, id: string) => (loading ? null : (counts[dim][id] ?? 0));
  const withCount = (label: string, n: number | null) => (n == null ? label : `${label} (${n.toLocaleString('en-IN')})`);

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
    <Box className="space-y-5">
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

      <Card padded={false} className="p-3 space-y-2.5">
        <FilterChips
          label="Lead status"
          value={filters.leadStatus}
          onChange={(v) => setFilter('leadStatus', v)}
          options={[
            { id: 'All', label: 'All', count: countOf('leadStatus', 'All') },
            ...LEAD_STATUSES.map((s) => ({
              id: s,
              label: leadStatusMeta(s).label,
              count: countOf('leadStatus', s),
              tone: leadStatusMeta(s).tone,
            })),
          ]}
        />
        <FilterBar
          summary={
            loading ? undefined : (
              <ResultCount
                shown={leads.length}
                total={total}
                noun="leads"
                filtered={filtered}
                onClear={filtersActive ? clearFilters : undefined}
              />
            )
          }
        >
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
            aria-label="City"
            value={filters.city}
            onChange={(e) => setFilter('city', e.target.value)}
            className={filterSelectClass}
          >
            <Option value="All">{withCount('All cities', countOf('city', 'All'))}</Option>
            {choices.cities.map((c) => (
              <Option key={c} value={c}>
                {withCount(c === NONE ? 'No city' : c, countOf('city', c))}
              </Option>
            ))}
          </Select>
          <Select
            aria-label="Category"
            value={filters.category}
            onChange={(e) => setFilter('category', e.target.value)}
            className={filterSelectClass}
          >
            <Option value="All">{withCount('All categories', countOf('category', 'All'))}</Option>
            {choices.categories.map((c) => (
              <Option key={c} value={c}>
                {withCount(c === NONE ? 'No category' : c, countOf('category', c))}
              </Option>
            ))}
          </Select>
          <Select
            aria-label="Contact details"
            value={filters.contact}
            onChange={(e) => setFilter('contact', e.target.value as ContactFilter)}
            className={filterSelectClass}
          >
            {CONTACT_OPTIONS.map((o) => (
              <Option key={o.id} value={o.id}>
                {withCount(o.label, countOf('contact', o.id))}
              </Option>
            ))}
          </Select>
          <Select
            aria-label="Assigned to"
            value={filters.assignee}
            onChange={(e) => setFilter('assignee', e.target.value)}
            className={filterSelectClass}
          >
            <Option value="All">{withCount('Anyone', countOf('assignee', 'All'))}</Option>
            <Option value="none">{withCount('Unassigned', countOf('assignee', 'none'))}</Option>
            {choices.assignees.map(([id, name]) => (
              <Option key={id} value={id}>
                {withCount(name, countOf('assignee', id))}
              </Option>
            ))}
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
                <Th>Business</Th>
                <Th>Contact</Th>
                <Th>City</Th>
                <Th>Status</Th>
                <Th>Assigned to</Th>
                <Th />
              </PlainTr>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : !leads.length ? (
                <PlainTr>
                  <PlainTd colSpan={6}>
                    <EmptyState
                      icon={ListChecks}
                      title={filtered ? 'No leads match these filters' : 'No leads yet'}
                      description={
                        filtered
                          ? 'Try a different search or loosen a filter.'
                          : 'Leads found by a scrape job — or added here directly — will appear in this list.'
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
                leads.map((l) => {
                  const meta = leadStatusMeta(l.leadStatus);
                  return (
                    <Tr key={l.id}>
                      <Td>
                        <Text className="text-sm font-medium text-ink truncate">{l.businessName}</Text>
                        <Text className="text-label text-ink-3 truncate">{l.category || l.source}</Text>
                      </Td>
                      <Td>
                        <Text className="text-sm text-ink truncate">{l.phone || '—'}</Text>
                        <Text className="text-label text-ink-3 truncate">{l.email || '—'}</Text>
                      </Td>
                      <Td>{l.city || '—'}</Td>
                      <Td>
                        <Badge tone={meta.tone} icon={meta.icon}>
                          {meta.label}
                        </Badge>
                      </Td>
                      <Td>{l.assignedTo.name || '—'}</Td>
                      <Td>
                        <Box className="flex items-center justify-end gap-0.5">
                          <IconButton icon={Pencil} label={`Edit ${l.businessName}`} onClick={() => openEdit(l)} />
                          <IconButton
                            icon={Trash2}
                            label={`Delete ${l.businessName}`}
                            tone="danger"
                            onClick={() => setPendingDelete(l)}
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
        <Form id="create-lead" onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <Text className="text-sm text-crit bg-crit-soft border border-crit-border rounded-control px-3 py-2">
              {formError}
            </Text>
          )}
          <Box className="grid grid-cols-2 gap-3">
            <Field label="Business name" required>
              <Input required value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} />
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
          <Box className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
          </Box>
          <Field label="Website">
            <Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
          </Field>
          <Field label="Address">
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </Field>
          <Box className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
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
          <Form id="edit-lead" onSubmit={handleUpdate} className="space-y-4">
            <Box className="grid grid-cols-2 gap-3">
              <Field label="Business name">
                <Input value={editForm.businessName} onChange={(e) => setEditForm((f) => f && { ...f, businessName: e.target.value })} />
              </Field>
              <Field label="Status">
                <Select
                  value={editForm.leadStatus}
                  onChange={(e) => setEditForm((f) => f && { ...f, leadStatus: e.target.value as LeadStatus })}
                >
                  {LEAD_STATUSES.map((s) => (
                    <Option key={s} value={s}>
                      {leadStatusMeta(s).label}
                    </Option>
                  ))}
                </Select>
              </Field>
            </Box>
            <Box className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <Input value={editForm.phone} onChange={(e) => setEditForm((f) => f && { ...f, phone: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => f && { ...f, email: e.target.value })} />
              </Field>
            </Box>
            <Field label="Website">
              <Input value={editForm.website} onChange={(e) => setEditForm((f) => f && { ...f, website: e.target.value })} />
            </Field>
            <Field label="Address">
              <Input value={editForm.address} onChange={(e) => setEditForm((f) => f && { ...f, address: e.target.value })} />
            </Field>
            <Box className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Input value={editForm.category} onChange={(e) => setEditForm((f) => f && { ...f, category: e.target.value })} />
              </Field>
              <Field label="City">
                <Input value={editForm.city} onChange={(e) => setEditForm((f) => f && { ...f, city: e.target.value })} />
              </Field>
            </Box>
          </Form>
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
        <Text className="text-body text-ink-2">
          <Inline className="text-ink font-medium">{pendingDelete?.businessName}</Inline> will be removed from the leads
          list. This cannot be undone.
        </Text>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
