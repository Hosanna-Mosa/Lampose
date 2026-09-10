import React, { useMemo, useState } from 'react';
import {
  Building2,
  Copy,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserCheck,
  X,
} from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { IconButton } from '../components/common/atoms/IconButton';
import { Select } from '../components/common/atoms/Select';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { CardHeader } from '../components/common/molecules/CardHeader';
import { DataRow } from '../components/common/molecules/DataRow';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { cx, filterBySearch } from '../components/common/utils';
import { verificationService } from '../api/services/verificationService';
import { insightsService } from '../api/services/insightsService';
import { useFetch } from '../lib/useFetch';
import { VERIFICATION_STATUSES, verificationMeta } from '../lib/domain';
import { formatDateTime, percent, relativeTime } from '../lib/format';
import type { VerificationEntity, VerificationStatus } from '../api/types';
import { Aside } from '../components/common/atoms/Aside';
import { Box } from '../components/common/atoms/Box';
import { Code } from '../components/common/atoms/Code';
import { Form } from '../components/common/atoms/Form';
import { Heading } from '../components/common/atoms/Heading';
import { Inline } from '../components/common/atoms/Inline';
import { Option } from '../components/common/atoms/Option';
import { PlainButton } from '../components/common/atoms/PlainButton';
import { PlainTd, PlainTr, TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Region } from '../components/common/atoms/Region';
import { Text } from '../components/common/atoms/Text';

interface VerificationsPageProps {
  search: string;
}

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

  const verifiers = useFetch(() => insightsService.getVerifiers(), []);

  const rows = useMemo(
    () => filterBySearch(data ?? [], search, (v, q) =>
      [v.ownerMobileE164, v.token, v.lastError, v.property?.name, v.status]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q))
    ),
    [data, search]
  );

  const summary = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      verified: list.filter((v) => v.status === 'verified').length,
      failed: list.filter((v) => v.status === 'failed').length,
      // owner_approved means a verifier now has to reply — still in flight, not done.
      awaiting: list.filter((v) => ['pending', 'sent', 'delivered', 'owner_approved'].includes(v.status)).length,
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
    <Box className="space-y-5">
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
      <Box className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total requests', value: summary.total, tone: 'text-ink' },
          { label: 'Verified', value: summary.verified, tone: 'text-good' },
          { label: 'Awaiting reply', value: summary.awaiting, tone: 'text-warn' },
          { label: 'Failed', value: summary.failed, tone: 'text-crit' },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <Text className="text-label text-ink-2">{s.label}</Text>
            <Text className={cx('text-metric figure mt-2', s.tone)}>{loading ? '—' : s.value}</Text>
          </Card>
        ))}
      </Box>

      {/* Verification team workload — which verifier gets sent how many
          requests, and how those turned out. */}
      <Card padded={false}>
        <Box className="p-4 pb-3">
          <CardHeader
            icon={UserCheck}
            title="Verification team"
            description="Every WhatsApp number in VERIFICATION_TEAM_NUMBERS, and how the requests randomly forwarded to them turned out."
            action={
              <IconButton
                icon={RefreshCw}
                label="Reload verification team"
                onClick={verifiers.reload}
                spinning={verifiers.refreshing || verifiers.loading}
              />
            }
          />
        </Box>
        {verifiers.error ? (
          <Box className="px-4 pb-4">
            <ErrorState message={verifiers.error} onRetry={verifiers.reload} />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <PlainTr>
                <Th>Verifier</Th>
                <Th className="text-right">Assigned</Th>
                <Th className="text-right">Verified</Th>
                <Th className="text-right">Rejected</Th>
                <Th className="text-right">Awaiting reply</Th>
                <Th className="text-right">Success rate</Th>
                <Th>Last decision</Th>
              </PlainTr>
            </TableHead>
            <TableBody>
              {verifiers.loading ? (
                <TableSkeleton cols={7} />
              ) : !verifiers.data?.length ? (
                <PlainTr>
                  <PlainTd colSpan={7}>
                    <EmptyState
                      icon={UserCheck}
                      title="No verification team configured"
                      description="Set VERIFICATION_TEAM_NUMBERS in the backend .env to put a verifier in the loop — without it, an owner's YES auto-verifies with no second pair of eyes."
                    />
                  </PlainTd>
                </PlainTr>
              ) : (
                verifiers.data.map((v) => (
                  <Tr key={v.verifierMobileE164}>
                    <Td>
                      <Box className="flex items-center gap-1.5">
                        <Inline className="text-sm font-mono tabular text-ink">
                          {v.verifierMobileE164.replace(/^whatsapp:/, '')}
                        </Inline>
                        {!v.onRoster && <Badge tone="neutral">Removed from roster</Badge>}
                      </Box>
                    </Td>
                    <Td className="text-right tabular">{v.totalAssigned}</Td>
                    <Td className="text-right tabular text-good">{v.verified}</Td>
                    <Td className="text-right tabular text-crit">{v.rejected}</Td>
                    <Td className="text-right tabular text-warn">{v.awaiting}</Td>
                    <Td className="text-right tabular">
                      {v.successRate === null ? '—' : percent(v.successRate, 0)}
                    </Td>
                    <Td className="tabular">{relativeTime(v.lastDecisionAt)}</Td>
                  </Tr>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card padded={false} className="p-3">
        <Box className="flex flex-wrap items-center gap-2.5">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-36">
            <Option value="All">All statuses</Option>
            {VERIFICATION_STATUSES.map((s) => (
              <Option key={s} value={s}>
                {verificationMeta(s).label}
              </Option>
            ))}
          </Select>

          {status !== 'All' && (
            <Button size="sm" variant="ghost" icon={X} onClick={() => setStatus('All')}>
              Clear
            </Button>
          )}

          <Inline className="text-label text-ink-3 ml-auto tabular">
            {loading ? 'Loading…' : `${rows.length} request${rows.length === 1 ? '' : 's'}`}
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
                <Th>Owner mobile</Th>
                <Th>Property</Th>
                <Th>Assigned verifier</Th>
                <Th>Status</Th>
                <Th className="text-right">Attempts</Th>
                <Th>Last update</Th>
                <Th />
              </PlainTr>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableSkeleton cols={7} />
              ) : !rows.length ? (
                <PlainTr>
                  <PlainTd colSpan={7}>
                    <EmptyState
                      icon={ShieldCheck}
                      title={search || status !== 'All' ? 'No matching requests' : 'No verification requests'}
                      description={
                        search || status !== 'All'
                          ? 'Try clearing the filters above.'
                          : 'Requests are created when an owner is sent a confirmation message.'
                      }
                    />
                  </PlainTd>
                </PlainTr>
              ) : (
                rows.map((v) => {
                  const meta = verificationMeta(v.status);
                  const expired = isExpired(v);
                  return (
                    <Tr key={v.id}>
                      <Td>
                        <PlainButton
                          onClick={() => setSelected(v)}
                          className="text-sm font-mono tabular text-ink hover:text-brand-ink transition-colors"
                        >
                          {v.ownerMobileE164 || '—'}
                        </PlainButton>
                      </Td>
                      <Td className="max-w-52">
                        {v.property ? (
                          <>
                            <Inline className="block text-sm text-ink truncate">{v.property.name}</Inline>
                            <Inline className="block text-label text-ink-3 truncate">
                              {v.property.category} · {v.property.place}
                            </Inline>
                          </>
                        ) : (
                          <Inline className="text-ink-3">Not linked</Inline>
                        )}
                      </Td>
                      <Td>
                        {v.assignedVerifierMobileE164 ? (
                          <Inline className="text-sm font-mono tabular text-ink flex items-center gap-1.5">
                            <UserCheck className="size-3.5 text-ink-3 shrink-0" strokeWidth={1.75} />
                            {v.assignedVerifierMobileE164.replace(/^whatsapp:/, '')}
                          </Inline>
                        ) : (
                          <Inline className="text-ink-3">Not yet assigned</Inline>
                        )}
                      </Td>
                      <Td>
                        <Box className="flex items-center gap-1.5">
                          <Badge tone={meta.tone} icon={meta.icon}>
                            {meta.label}
                          </Badge>
                          {expired && v.status !== 'expired' && (
                            <Badge tone="neutral" icon={TriangleAlert}>
                              Window closed
                            </Badge>
                          )}
                        </Box>
                      </Td>
                      <Td className="text-right tabular">{v.attempts}</Td>
                      <Td className="tabular">{relativeTime(v.updatedAt || v.createdAt)}</Td>
                      <Td>
                        <Box className="flex items-center justify-end gap-0.5">
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

      {/* Detail drawer */}
      {selected && (
        <>
          <Box
            className="fixed inset-0 z-40 bg-[rgb(9_12_20/0.45)] backdrop-blur-[2px]"
            onClick={() => setSelected(null)}
            aria-hidden
          />
          <Aside
            role="dialog"
            aria-label="Verification request detail"
            className="fixed top-0 bottom-0 right-0 z-50 w-full max-w-md bg-surface border-l border-line flex flex-col anim-slide-left"
          >
            <Box className="h-14 px-4 border-b border-line flex items-center justify-between gap-3 shrink-0">
              <Box className="min-w-0">
                <Heading level={2} className="text-section text-ink font-mono tabular truncate">
                  {selected.ownerMobileE164}
                </Heading>
                <Text className="text-label text-ink-3">Verification request</Text>
              </Box>
              <IconButton icon={X} label="Close" onClick={() => setSelected(null)} />
            </Box>

            <Box className="flex-1 overflow-y-auto p-4 space-y-5">
              <Box className="flex items-center gap-2">
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
              </Box>

              {selected.lastError && (
                <Box className="p-3 rounded-panel bg-crit-soft border border-crit-border">
                  <Text className="text-label text-crit mb-1 flex items-center gap-1.5">
                    <TriangleAlert className="size-3.5" strokeWidth={2} /> Last error
                  </Text>
                  <Text className="text-sm text-ink-2 leading-relaxed break-words">{selected.lastError}</Text>
                </Box>
              )}

              {selected.property && (
                <Region>
                  <Heading level={3} className="text-micro uppercase text-ink-3 mb-1 flex items-center gap-1.5">
                    <Building2 className="size-3" strokeWidth={2} /> Linked property
                  </Heading>
                  <DataRow label="Name" value={selected.property.name} />
                  <DataRow label="Category" value={selected.property.category} />
                  <DataRow label="Place" value={selected.property.place} />
                  <DataRow label="Owner" value={selected.property.ownerName} />
                </Region>
              )}

              <Region>
                <Heading level={3} className="text-micro uppercase text-ink-3 mb-1 flex items-center gap-1.5">
                  <UserCheck className="size-3" strokeWidth={2} /> Verification team
                </Heading>
                <DataRow
                  label="Assigned verifier"
                  value={
                    selected.assignedVerifierMobileE164
                      ? selected.assignedVerifierMobileE164.replace(/^whatsapp:/, '')
                      : 'Not yet assigned'
                  }
                  mono={!!selected.assignedVerifierMobileE164}
                />
                <Text className="text-label text-ink-3 mt-1.5 leading-relaxed">
                  {selected.assignedVerifierMobileE164
                    ? 'Randomly picked from VERIFICATION_TEAM_NUMBERS once the owner replied YES. This member\'s own YES/NO on WhatsApp decides the outcome below.'
                    : 'Set once the owner approves — picked at random from the configured verification team.'}
                </Text>
              </Region>

              <Region>
                <Heading level={3} className="text-micro uppercase text-ink-3 mb-1">Timeline</Heading>
                <DataRow label="Created" value={formatDateTime(selected.createdAt)} />
                <DataRow label="Sent" value={formatDateTime(selected.sentAt)} />
                <DataRow label="Responded" value={formatDateTime(selected.respondedAt)} />
                <DataRow
                  label="Expires"
                  value={
                    <Inline className={isExpired(selected) ? 'text-crit' : undefined}>
                      {formatDateTime(selected.expiresAt)}
                    </Inline>
                  }
                />
                <DataRow label="Attempts" value={selected.attempts} mono />
              </Region>

              <Region>
                <Heading level={3} className="text-micro uppercase text-ink-3 mb-1">Delivery</Heading>
                <DataRow label="Delivery status" value={selected.lastDeliveryStatus || '—'} />
                <DataRow label="Content SID" value={selected.contentSid || '—'} mono />
                <DataRow label="Message SID" value={selected.outboundMessageSid || '—'} mono />
              </Region>

              <Region>
                <Heading level={3} className="text-micro uppercase text-ink-3 mb-2">Token</Heading>
                <Box className="flex items-center gap-2 p-2.5 rounded-control bg-surface-inset border border-line">
                  <Code className="text-sm font-mono text-ink-2 truncate flex-1">{selected.token}</Code>
                  <IconButton
                    icon={Copy}
                    label="Copy token"
                    onClick={() => copy(selected.token, 'Token')}
                  />
                </Box>
                <Text className="text-label text-ink-3 mt-1.5">Document ID: {selected.id}</Text>
              </Region>
            </Box>

            <Box className="p-3 border-t border-line flex justify-between gap-2 shrink-0">
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
            </Box>
          </Aside>
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
        <Form id="edit-verification" onSubmit={handleUpdate}>
          <Field
            label="Status"
            hint="Marking a request verified stamps the response time on the document."
          >
            <Select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as VerificationStatus)}
            >
              {VERIFICATION_STATUSES.map((s) => (
                <Option key={s} value={s}>
                  {verificationMeta(s).label}
                </Option>
              ))}
            </Select>
          </Field>
        </Form>
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
        <Text className="text-body text-ink-2">
          The request for{' '}
          <Inline className="text-ink font-medium font-mono">{pendingDelete?.ownerMobileE164}</Inline> will be
          removed from the verificationrequests collection. This cannot be undone.
        </Text>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
