import React, { useMemo, useState } from 'react';
import {
  Building2,
  Copy,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DataRow,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Modal,
  PageHeader,
  Select,
  Table,
  TableSkeleton,
  Td,
  Th,
  Toast,
  Tr,
  cx,
  type ToastState,
} from '../components/ui';
import { verificationService } from '../api/services/verificationService';
import { useFetch } from '../lib/useFetch';
import { verificationMeta } from '../lib/domain';
import { formatDateTime, relativeTime } from '../lib/format';
import type { VerificationEntity, VerificationStatus } from '../api/types';

interface VerificationsPageProps {
  search: string;
}

const STATUSES: VerificationStatus[] = [
  'pending',
  'sent',
  'delivered',
  'verified',
  'failed',
  'expired',
];

const isExpired = (v: VerificationEntity): boolean =>
  !!v.expiresAt && new Date(v.expiresAt).getTime() < Date.now() && v.status !== 'verified';

export const VerificationsPage: React.FC<VerificationsPageProps> = ({ search }) => {
  const [status, setStatus] = useState('All');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [selected, setSelected] = useState<VerificationEntity | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VerificationEntity | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<VerificationEntity | null>(null);
  const [editStatus, setEditStatus] = useState<VerificationStatus>('pending');

  const { data, loading, error, refreshing, reload } = useFetch(
    () => verificationService.getVerifications({ ...(status !== 'All' && { status }) }),
    [status]
  );

  const rows = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) =>
      [v.ownerMobileE164, v.token, v.lastError, v.property?.name, v.status]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q))
    );
  }, [data, search]);

  const summary = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      verified: list.filter((v) => v.status === 'verified').length,
      failed: list.filter((v) => v.status === 'failed').length,
      awaiting: list.filter((v) => ['pending', 'sent', 'delivered'].includes(v.status)).length,
    };
  }, [data]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast({ tone: 'good', message: `${label} copied to clipboard.` });
    } catch {
      setToast({ tone: 'crit', message: 'Clipboard is unavailable in this browser.' });
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    const res = await verificationService.updateVerification(editing.id, { status: editStatus });
    setBusy(false);

    if (res.success) {
      setToast({ tone: 'good', message: `Request marked ${editStatus}.` });
      setEditing(null);
      setSelected(null);
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Update failed.' });
    }
  };

  const handleRetry = async (v: VerificationEntity) => {
    setBusy(true);
    const res = await verificationService.updateVerification(v.id, {
      status: 'pending',
      attempts: v.attempts + 1,
      lastError: '',
    });
    setBusy(false);

    if (res.success) {
      setToast({ tone: 'good', message: `Request re-queued (attempt ${v.attempts + 1}).` });
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Could not re-queue the request.' });
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    const res = await verificationService.deleteVerification(pendingDelete.id);
    setBusy(false);

    if (res.success) {
      setToast({ tone: 'good', message: 'Verification request deleted.' });
      if (selected?.id === pendingDelete.id) setSelected(null);
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
        eyebrow="Records"
        title="Owner verifications"
        description="WhatsApp confirmation requests sent to property owners, from the verificationrequests collection."
        actions={
          <IconButton
            icon={RefreshCw}
            label="Reload requests"
            onClick={reload}
            spinning={refreshing || loading}
          />
        }
      />

      {/* Outcome summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total requests', value: summary.total, tone: 'text-ink' },
          { label: 'Verified', value: summary.verified, tone: 'text-good' },
          { label: 'Awaiting reply', value: summary.awaiting, tone: 'text-warn' },
          { label: 'Failed', value: summary.failed, tone: 'text-crit' },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-label text-ink-2">{s.label}</p>
            <p className={cx('text-metric figure mt-2', s.tone)}>{loading ? '—' : s.value}</p>
          </Card>
        ))}
      </div>

      <Card padded={false} className="p-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-36">
            <option value="All">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {verificationMeta(s).label}
              </option>
            ))}
          </Select>

          {status !== 'All' && (
            <Button size="sm" variant="ghost" icon={X} onClick={() => setStatus('All')}>
              Clear
            </Button>
          )}

          <span className="text-label text-ink-3 ml-auto tabular">
            {loading ? 'Loading…' : `${rows.length} request${rows.length === 1 ? '' : 's'}`}
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
                <Th>Owner mobile</Th>
                <Th>Property</Th>
                <Th>Status</Th>
                <Th className="text-right">Attempts</Th>
                <Th>Last update</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : !rows.length ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={ShieldCheck}
                      title={search || status !== 'All' ? 'No matching requests' : 'No verification requests'}
                      description={
                        search || status !== 'All'
                          ? 'Try clearing the filters above.'
                          : 'Requests are created when an owner is sent a confirmation message.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                rows.map((v) => {
                  const meta = verificationMeta(v.status);
                  const expired = isExpired(v);
                  return (
                    <Tr key={v.id}>
                      <Td>
                        <button
                          onClick={() => setSelected(v)}
                          className="text-sm font-mono tabular text-ink hover:text-brand-ink transition-colors"
                        >
                          {v.ownerMobileE164 || '—'}
                        </button>
                      </Td>
                      <Td className="max-w-52">
                        {v.property ? (
                          <>
                            <span className="block text-sm text-ink truncate">{v.property.name}</span>
                            <span className="block text-label text-ink-3 truncate">
                              {v.property.category} · {v.property.place}
                            </span>
                          </>
                        ) : (
                          <span className="text-ink-3">Not linked</span>
                        )}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Badge tone={meta.tone} icon={meta.icon}>
                            {meta.label}
                          </Badge>
                          {expired && v.status !== 'expired' && (
                            <Badge tone="neutral" icon={TriangleAlert}>
                              Window closed
                            </Badge>
                          )}
                        </div>
                      </Td>
                      <Td className="text-right tabular">{v.attempts}</Td>
                      <Td className="tabular">{relativeTime(v.updatedAt || v.createdAt)}</Td>
                      <Td>
                        <div className="flex items-center justify-end gap-0.5">
                          <IconButton
                            icon={RotateCw}
                            label="Re-queue request"
                            disabled={busy || v.status === 'verified'}
                            className={v.status === 'verified' ? 'opacity-35 pointer-events-none' : undefined}
                            onClick={() => handleRetry(v)}
                          />
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

      {/* Detail drawer */}
      {selected && (
        <>
          <div
            className="fixed inset-0 z-40 bg-[rgb(9_12_20/0.45)] backdrop-blur-[2px]"
            onClick={() => setSelected(null)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="Verification request detail"
            className="fixed top-0 bottom-0 right-0 z-50 w-full max-w-md bg-surface border-l border-line flex flex-col anim-slide-left"
          >
            <div className="h-14 px-4 border-b border-line flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h2 className="text-section text-ink font-mono tabular truncate">
                  {selected.ownerMobileE164}
                </h2>
                <p className="text-label text-ink-3">Verification request</p>
              </div>
              <IconButton icon={X} label="Close" onClick={() => setSelected(null)} />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div className="flex items-center gap-2">
                <Badge
                  tone={verificationMeta(selected.status).tone}
                  icon={verificationMeta(selected.status).icon}
                >
                  {verificationMeta(selected.status).label}
                </Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditing(selected);
                    setEditStatus(selected.status);
                  }}
                >
                  Change status
                </Button>
              </div>

              {selected.lastError && (
                <div className="p-3 rounded-panel bg-crit-soft border border-crit-border">
                  <p className="text-label text-crit mb-1 flex items-center gap-1.5">
                    <TriangleAlert className="size-3.5" strokeWidth={2} /> Last error
                  </p>
                  <p className="text-sm text-ink-2 leading-relaxed break-words">{selected.lastError}</p>
                </div>
              )}

              {selected.property && (
                <section>
                  <h3 className="text-micro uppercase text-ink-3 mb-1 flex items-center gap-1.5">
                    <Building2 className="size-3" strokeWidth={2} /> Linked property
                  </h3>
                  <DataRow label="Name" value={selected.property.name} />
                  <DataRow label="Category" value={selected.property.category} />
                  <DataRow label="Place" value={selected.property.place} />
                  <DataRow label="Owner" value={selected.property.ownerName} />
                </section>
              )}

              <section>
                <h3 className="text-micro uppercase text-ink-3 mb-1">Timeline</h3>
                <DataRow label="Created" value={formatDateTime(selected.createdAt)} />
                <DataRow label="Sent" value={formatDateTime(selected.sentAt)} />
                <DataRow label="Responded" value={formatDateTime(selected.respondedAt)} />
                <DataRow
                  label="Expires"
                  value={
                    <span className={isExpired(selected) ? 'text-crit' : undefined}>
                      {formatDateTime(selected.expiresAt)}
                    </span>
                  }
                />
                <DataRow label="Attempts" value={selected.attempts} mono />
              </section>

              <section>
                <h3 className="text-micro uppercase text-ink-3 mb-1">Delivery</h3>
                <DataRow label="Delivery status" value={selected.lastDeliveryStatus || '—'} />
                <DataRow label="Content SID" value={selected.contentSid || '—'} mono />
                <DataRow label="Message SID" value={selected.outboundMessageSid || '—'} mono />
              </section>

              <section>
                <h3 className="text-micro uppercase text-ink-3 mb-2">Token</h3>
                <div className="flex items-center gap-2 p-2.5 rounded-control bg-surface-inset border border-line">
                  <code className="text-sm font-mono text-ink-2 truncate flex-1">{selected.token}</code>
                  <IconButton
                    icon={Copy}
                    label="Copy token"
                    onClick={() => copy(selected.token, 'Token')}
                  />
                </div>
                <p className="text-label text-ink-3 mt-1.5">Document ID: {selected.id}</p>
              </section>
            </div>

            <div className="p-3 border-t border-line flex justify-between gap-2 shrink-0">
              <Button
                variant="secondary"
                icon={RotateCw}
                loading={busy}
                disabled={selected.status === 'verified'}
                onClick={() => handleRetry(selected)}
              >
                Re-queue
              </Button>
              <Button variant="danger" icon={Trash2} onClick={() => setPendingDelete(selected)}>
                Delete
              </Button>
            </div>
          </aside>
        </>
      )}

      {/* Change status */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Change request status"
        description={editing?.ownerMobileE164}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" form="edit-verification" type="submit" loading={busy}>
              Save status
            </Button>
          </>
        }
      >
        <form id="edit-verification" onSubmit={handleUpdate}>
          <Field
            label="Status"
            hint="Marking a request verified stamps the response time on the document."
          >
            <Select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as VerificationStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {verificationMeta(s).label}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>

      {/* Delete */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete verification request"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} loading={busy} onClick={handleDelete}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-body text-ink-2">
          The request for{' '}
          <span className="text-ink font-medium font-mono">{pendingDelete?.ownerMobileE164}</span> will be
          removed from the verificationrequests collection. This cannot be undone.
        </p>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
