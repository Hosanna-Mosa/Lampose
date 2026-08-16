import React, { useMemo, useState } from 'react';
import { CalendarCheck, Pencil, RefreshCw, Trash2, X } from 'lucide-react';
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
import { visitRequestAdminService } from '../api/services/visitRequestAdminService';
import { useFetch } from '../lib/useFetch';
import { VISIT_STATUSES, visitStatusMeta } from '../lib/domain';
import { formatDateTime } from '../lib/format';
import type { VisitRequestEntity, VisitRequestStatus } from '../api/types';

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
  const [status, setStatus] = useState('All');
  const [toast, setToast] = useState<ToastState | null>(null);

  const [editing, setEditing] = useState<VisitRequestEntity | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<VisitRequestEntity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, loading, error, refreshing, reload } = useFetch(
    () => visitRequestAdminService.getVisitRequests({ ...(status !== 'All' && { status }) }),
    [status]
  );

  const requests = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) =>
      `${v.propertyName} ${v.customer.name} ${v.customer.phone} ${v.ownerMobile}`.toLowerCase().includes(q)
    );
  }, [data, search]);

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
    <div className="space-y-5">
      <PageHeader
        eyebrow="Database"
        title="Visit Requests"
        description="Customer 'request a visit' asks, from the visitrequests collection. Created only through the public site's OTP flow — manageable here."
        actions={
          <IconButton icon={RefreshCw} label="Reload visit requests" onClick={reload} spinning={refreshing || loading} />
        }
      />

      <Card padded={false} className="p-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-40">
            <option value="All">All statuses</option>
            {VISIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {visitStatusMeta(s).label}
              </option>
            ))}
          </Select>

          {status !== 'All' && (
            <Button size="sm" variant="ghost" icon={X} onClick={() => setStatus('All')}>
              Clear
            </Button>
          )}

          <span className="text-label text-ink-3 ml-auto tabular">
            {loading ? 'Loading…' : `${requests.length} request${requests.length === 1 ? '' : 's'}`}
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
                <Th>Property</Th>
                <Th>Customer</Th>
                <Th>Owner mobile</Th>
                <Th>Status</Th>
                <Th>Requested</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : !requests.length ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={CalendarCheck}
                      title={search || status !== 'All' ? 'No matching requests' : 'No visit requests yet'}
                      description={
                        search || status !== 'All'
                          ? 'Try clearing the filters above.'
                          : 'Requests submitted through the public "Request a visit" flow will appear here.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                requests.map((v) => {
                  const meta = visitStatusMeta(v.status);
                  return (
                    <Tr key={v.id}>
                      <Td>
                        <p className="text-sm font-medium text-ink truncate">{v.propertyName}</p>
                        <p className="text-label text-ink-3 truncate">{v.ownerName}</p>
                      </Td>
                      <Td>
                        <p className="text-sm text-ink truncate">{v.customer.name || '—'}</p>
                        <p className="text-label text-ink-3 truncate">{v.customer.phone}</p>
                      </Td>
                      <Td className="tabular">{v.ownerMobile}</Td>
                      <Td>
                        <Badge tone={meta.tone} icon={meta.icon}>
                          {meta.label}
                        </Badge>
                      </Td>
                      <Td className="tabular">{formatDateTime(v.createdAt)}</Td>
                      <Td>
                        <div className="flex items-center justify-end gap-0.5">
                          <IconButton icon={Pencil} label={`Edit request for ${v.propertyName}`} onClick={() => openEdit(v)} />
                          <IconButton
                            icon={Trash2}
                            label="Delete request"
                            tone="danger"
                            onClick={() => setPendingDelete(v)}
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
          <form id="edit-visit-request" onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
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
                    <option key={s} value={s}>
                      {visitStatusMeta(s).label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Owner name">
                <Input value={form.ownerName} onChange={(e) => setForm((f) => f && { ...f, ownerName: e.target.value })} />
              </Field>
              <Field label="Owner mobile (E.164)">
                <Input value={form.ownerMobile} onChange={(e) => setForm((f) => f && { ...f, ownerMobile: e.target.value })} />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Preferred date" hint="Free text, as submitted.">
                <Input value={form.preferredDate} onChange={(e) => setForm((f) => f && { ...f, preferredDate: e.target.value })} />
              </Field>
              <Field label="Preferred time">
                <Input value={form.preferredTime} onChange={(e) => setForm((f) => f && { ...f, preferredTime: e.target.value })} />
              </Field>
            </div>
          </form>
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
        <p className="text-body text-ink-2">
          The request from <span className="text-ink font-medium">{pendingDelete?.customer.name}</span> for{' '}
          <span className="text-ink font-medium">{pendingDelete?.propertyName}</span> will be removed. This cannot be
          undone.
        </p>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
