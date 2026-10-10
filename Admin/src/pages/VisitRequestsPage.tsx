import React, { useMemo, useState } from 'react';
import { CalendarCheck, Pencil, RefreshCw, Trash2 } from 'lucide-react';
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
import { visitRequestAdminService } from '../api/services/visitRequestAdminService';
import { useFetch } from '../lib/useFetch';
import { VISIT_STATUSES, visitStatusMeta } from '../lib/domain';
import { formatDateTime } from '../lib/format';
import type { VisitRequestEntity, VisitRequestStatus } from '../api/types';
import { Box } from '../components/common/atoms/Box';
import { Form } from '../components/common/atoms/Form';
import { Inline } from '../components/common/atoms/Inline';
import { Option } from '../components/common/atoms/Option';
import { PlainTd, PlainTr, TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Text } from '../components/common/atoms/Text';
import { filterBySearch } from '../components/common/utils';
import { FilterBar } from '../components/common/molecules/FilterBar';
import { FilterChips } from '../components/common/molecules/FilterChips';
import { ResultCount } from '../components/common/molecules/ResultCount';

interface VisitRequestsPageProps {
  search: string;
}

type EditForm = {
  status: VisitRequestStatus;
  propertyName: string;
  ownerName: string;
  ownerMobile: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  preferredDate: string;
  preferredTime: string;
};

/* When the ask was made. Windows rather than a date picker: the question
   here is "what came in lately", not "what came in on the 14th". */
type Age = 'All' | 'today' | 'week' | 'month';
const AGES: Array<{ id: Age; label: string; days: number }> = [
  { id: 'All', label: 'Any time', days: 0 },
  { id: 'today', label: 'Today', days: 1 },
  { id: 'week', label: '7 days', days: 7 },
  { id: 'month', label: '30 days', days: 30 },
];

const withinAge = (v: VisitRequestEntity, age: Age, now: number) => {
  if (age === 'All') return true;
  if (!v.createdAt) return false;
  const t = new Date(v.createdAt).getTime();
  if (age === 'today') return new Date(t).toDateString() === new Date(now).toDateString();
  const days = AGES.find((a) => a.id === age)?.days ?? 0;
  return now - t <= days * 86_400_000;
};

/* The server caps a list at 500 — past that, say so rather than let the
   counts pass for the whole collection. */
const SERVER_CAP = 500;

const toForm = (v: VisitRequestEntity): EditForm => ({
  status: v.status,
  propertyName: v.propertyName,
  ownerName: v.ownerName,
  ownerMobile: v.ownerMobile,
  customerName: v.customer.name,
  customerPhone: v.customer.phone,
  customerEmail: v.customer.email,
  preferredDate: v.preferredDate || '',
  preferredTime: v.preferredTime || '',
});

export const VisitRequestsPage: React.FC<VisitRequestsPageProps> = ({ search }) => {
  const [status, setStatus] = useState<VisitRequestStatus | 'All'>('All');
  const [age, setAge] = useState<Age>('All');
  const [toast, setToast] = useState<ToastState | null>(null);

  const [editing, setEditing] = useState<VisitRequestEntity | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<VisitRequestEntity | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* The whole list, once, and every filter applied here — an admin-sized
     collection, and it is what lets each chip carry a true count. */
  const { data, loading, error, refreshing, reload } = useFetch(
    () => visitRequestAdminService.getVisitRequests(),
    []
  );

  const searched = useMemo(
    () => filterBySearch(data ?? [], search, (v, q) =>
      `${v.propertyName} ${v.ownerName} ${v.customer.name} ${v.customer.phone} ${v.customer.email} ${v.ownerMobile}`
        .toLowerCase()
        .includes(q)
    ),
    [data, search]
  );

  /* Each row of chips is counted over the search and the OTHER row, so a
     number is exactly what pressing that chip would show. */
  const { requests, statusCounts, ageCounts } = useMemo(() => {
    const now = Date.now();
    const byAge = searched.filter((v) => withinAge(v, age, now));
    const byStatus = status === 'All' ? searched : searched.filter((v) => v.status === status);
    const sc: Record<string, number> = { All: byAge.length };
    byAge.forEach((v) => {
      sc[v.status] = (sc[v.status] ?? 0) + 1;
    });
    const ac = Object.fromEntries(
      AGES.map((a) => [a.id, byStatus.filter((v) => withinAge(v, a.id, now)).length])
    ) as Record<Age, number>;
    return {
      requests: byAge.filter((v) => status === 'All' || v.status === status),
      statusCounts: sc,
      ageCounts: ac,
    };
  }, [searched, status, age]);

  const total = data?.length ?? 0;
  const filtered = Boolean(search.trim()) || status !== 'All' || age !== 'All';
  const clearFilters = () => {
    setStatus('All');
    setAge('All');
  };

  const openEdit = (v: VisitRequestEntity) => {
    setEditing(v);
    setForm(toForm(v));
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !form) return;
    setSaving(true);

    const res = await visitRequestAdminService.updateVisitRequest(editing.id, {
      status: form.status,
      propertyName: form.propertyName.trim(),
      ownerName: form.ownerName.trim(),
      ownerMobile: form.ownerMobile.trim(),
      preferredDate: form.preferredDate,
      preferredTime: form.preferredTime,
      customer: {
        name: form.customerName.trim(),
        phone: form.customerPhone.trim(),
        email: form.customerEmail.trim(),
      },
    });

    setSaving(false);

    if (res.success) {
      setToast({ tone: 'good', message: `"${form.propertyName}" request updated.` });
      setEditing(null);
      setForm(null);
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Update failed.' });
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await visitRequestAdminService.deleteVisitRequest(pendingDelete.id);
    setDeleting(false);

    if (res.success) {
      setToast({ tone: 'good', message: 'Visit request deleted.' });
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
        title="Visit Requests"
        description="Customer 'request a visit' asks, from the visitrequests collection. Created only through the public site's OTP flow — manageable here."
        actions={
          <IconButton icon={RefreshCw} label="Reload visit requests" onClick={reload} spinning={refreshing || loading} />
        }
      />

      <Card padded={false} className="p-3">
        <FilterBar
          summary={
            loading || error ? undefined : (
              <ResultCount
                shown={requests.length}
                total={total}
                noun={total >= SERVER_CAP ? 'requests (newest 500)' : 'requests'}
                filtered={filtered}
                onClear={status !== 'All' || age !== 'All' ? clearFilters : undefined}
              />
            )
          }
        >
          <FilterChips<VisitRequestStatus | 'All'>
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { id: 'All', label: 'All', count: loading ? null : statusCounts.All },
              ...VISIT_STATUSES.map((s) => ({
                id: s,
                label: visitStatusMeta(s).label,
                count: loading ? null : (statusCounts[s] ?? 0),
                tone: visitStatusMeta(s).tone,
              })),
            ]}
          />
          <Inline className="h-5 w-px bg-line" aria-hidden="true" />
          <FilterChips<Age>
            label="Requested"
            value={age}
            onChange={setAge}
            options={AGES.map((a) => ({ id: a.id, label: a.label, count: loading ? null : ageCounts[a.id] }))}
          />
        </FilterBar>
      </Card>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <Card padded={false}>
          <Table>
            <TableHead>
              <PlainTr>
                <Th>Property</Th>
                <Th>Customer</Th>
                <Th>Owner mobile</Th>
                <Th>Status</Th>
                <Th>Requested</Th>
                <Th />
              </PlainTr>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : !requests.length ? (
                <PlainTr>
                  <PlainTd colSpan={6}>
                    <EmptyState
                      icon={CalendarCheck}
                      title={filtered ? 'No visit requests match these filters' : 'No visit requests yet'}
                      description={
                        filtered
                          ? 'Try a different search, status or time window.'
                          : 'Requests submitted through the public "Request a visit" flow will appear here.'
                      }
                      action={
                        status !== 'All' || age !== 'All' ? (
                          <Button size="sm" variant="ghost" onClick={clearFilters}>
                            Clear filters
                          </Button>
                        ) : undefined
                      }
                    />
                  </PlainTd>
                </PlainTr>
              ) : (
                requests.map((v) => {
                  const meta = visitStatusMeta(v.status);
                  return (
                    <Tr key={v.id}>
                      <Td>
                        <Text className="text-sm font-medium text-ink truncate">{v.propertyName}</Text>
                        <Text className="text-label text-ink-3 truncate">{v.ownerName}</Text>
                      </Td>
                      <Td>
                        <Text className="text-sm text-ink truncate">{v.customer.name || '—'}</Text>
                        <Text className="text-label text-ink-3 truncate">{v.customer.phone}</Text>
                      </Td>
                      <Td className="tabular">{v.ownerMobile}</Td>
                      <Td>
                        <Badge tone={meta.tone} icon={meta.icon}>
                          {meta.label}
                        </Badge>
                      </Td>
                      <Td className="tabular">{formatDateTime(v.createdAt)}</Td>
                      <Td>
                        <Box className="flex items-center justify-end gap-0.5">
                          <IconButton icon={Pencil} label={`Edit request for ${v.propertyName}`} onClick={() => openEdit(v)} />
                          <IconButton
                            icon={Trash2}
                            label="Delete request"
                            tone="danger"
                            onClick={() => setPendingDelete(v)}
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

      {/* Edit */}
      <Modal
        open={!!editing && !!form}
        onClose={() => {
          setEditing(null);
          setForm(null);
        }}
        title="Edit visit request"
        description={editing?.propertyName}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" form="edit-visit-request" type="submit" loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        {form && (
          <Form id="edit-visit-request" onSubmit={handleUpdate} className="space-y-4">
            <Box className="grid grid-cols-2 gap-3">
              <Field label="Property name" required>
                <Input
                  required
                  value={form.propertyName}
                  onChange={(e) => setForm((f) => f && { ...f, propertyName: e.target.value })}
                />
              </Field>
              <Field label="Status">
                <Select
                  value={form.status}
                  onChange={(e) => setForm((f) => f && { ...f, status: e.target.value as VisitRequestStatus })}
                >
                  {VISIT_STATUSES.map((s) => (
                    <Option key={s} value={s}>
                      {visitStatusMeta(s).label}
                    </Option>
                  ))}
                </Select>
              </Field>
            </Box>

            <Box className="grid grid-cols-2 gap-3">
              <Field label="Owner name">
                <Input value={form.ownerName} onChange={(e) => setForm((f) => f && { ...f, ownerName: e.target.value })} />
              </Field>
              <Field label="Owner mobile (E.164)">
                <Input value={form.ownerMobile} onChange={(e) => setForm((f) => f && { ...f, ownerMobile: e.target.value })} />
              </Field>
            </Box>

            <Box className="grid grid-cols-3 gap-3">
              <Field label="Customer name">
                <Input value={form.customerName} onChange={(e) => setForm((f) => f && { ...f, customerName: e.target.value })} />
              </Field>
              <Field label="Customer phone">
                <Input value={form.customerPhone} onChange={(e) => setForm((f) => f && { ...f, customerPhone: e.target.value })} />
              </Field>
              <Field label="Customer email">
                <Input
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) => setForm((f) => f && { ...f, customerEmail: e.target.value })}
                />
              </Field>
            </Box>

            <Box className="grid grid-cols-2 gap-3">
              <Field label="Preferred date" hint="Free text, as submitted.">
                <Input value={form.preferredDate} onChange={(e) => setForm((f) => f && { ...f, preferredDate: e.target.value })} />
              </Field>
              <Field label="Preferred time">
                <Input value={form.preferredTime} onChange={(e) => setForm((f) => f && { ...f, preferredTime: e.target.value })} />
              </Field>
            </Box>
          </Form>
        )}
      </Modal>

      {/* Delete */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete visit request"
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
          The request from <Inline className="text-ink font-medium">{pendingDelete?.customer.name}</Inline> for{' '}
          <Inline className="text-ink font-medium">{pendingDelete?.propertyName}</Inline> will be removed. This cannot be
          undone.
        </Text>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
