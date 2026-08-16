import React, { useMemo, useState } from 'react';
import {
  Building2,
  Clock,
  KeyRound,
  RefreshCw,
  ShieldX,
  Trash2,
  TriangleAlert,
  User,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DataRow,
  EmptyState,
  ErrorState,
  IconButton,
  Modal,
  PageHeader,
  Select,
  Switch,
  Table,
  TableSkeleton,
  Td,
  Th,
  Toast,
  Tr,
  cx,
  type ToastState,
} from '../components/ui';
import { permissionService } from '../api/services/permissionService';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../lib/useFetch';
import {
  PERMISSION_ACTION_META,
  PERMISSION_STATUSES,
  permissionStatusMeta,
} from '../lib/domain';
import { formatDateTime, relativeTime } from '../lib/format';
import type { PermissionEntity, PermissionStatus } from '../api/types';

interface PermissionsPageProps {
  search: string;
}

/** How long a fresh grant stays spendable, offered when an admin flips one on. */
const WINDOW_OPTIONS = [
  { hours: 2, label: '2 hours' },
  { hours: 8, label: '8 hours' },
  { hours: 24, label: '24 hours' },
  { hours: 72, label: '3 days' },
];

const actionMeta = (action: string) =>
  PERMISSION_ACTION_META[action as keyof typeof PERMISSION_ACTION_META] ??
  PERMISSION_ACTION_META.edit;

const isExpiredGrant = (p: PermissionEntity): boolean =>
  p.status === 'granted' && !!p.expiresAt && new Date(p.expiresAt).getTime() < Date.now();

export const PermissionsPage: React.FC<PermissionsPageProps> = ({ search }) => {
  const { user } = useAuth();

  const [status, setStatus] = useState('All');
  const [action, setAction] = useState('All');
  const [windowHours, setWindowHours] = useState(24);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [selected, setSelected] = useState<PermissionEntity | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PermissionEntity | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, loading, error, refreshing, reload } = useFetch(
    () =>
      permissionService.getPermissions({
        ...(status !== 'All' && { status }),
        ...(action !== 'All' && { action }),
      }),
    [status, action]
  );

  // The header filter narrows what is already loaded, so typing costs no request.
  const rows = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) =>
      [p.employeeEmail, p.propertyName, p.propertyPlace, p.reason, p.action, p.status]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [data, search]);

  const summary = useMemo(() => {
    const list = data ?? [];
    return {
      pending: list.filter((p) => p.status === 'pending').length,
      active: list.filter((p) => p.active).length,
      refused: list.filter((p) => p.status === 'denied' || p.status === 'revoked').length,
      spent: list.filter((p) => p.status === 'used').length,
    };
  }, [data]);

  /**
   * The toggle is the decision: on grants a fresh window, off revokes access
   * outright. Either way the outcome is written to the request record, which is
   * what the onboarding app reads before it unlocks a button.
   */
  const decide = async (permission: PermissionEntity, grant: boolean) => {
    setBusyId(permission.id);
    const nextStatus: PermissionStatus = grant ? 'granted' : permission.status === 'pending' ? 'denied' : 'revoked';

    const res = await permissionService.decide(permission.id, {
      status: nextStatus,
      decidedBy: user?.email || user?.name || 'Administrator',
      ...(grant && { expiresInHours: windowHours }),
    });
    setBusyId(null);

    if (res.success) {
      setToast({
        tone: 'good',
        message: grant
          ? `${permission.employeeEmail} can now ${permission.action} “${permission.propertyName}” for the next ${WINDOW_OPTIONS.find((w) => w.hours === windowHours)?.label ?? `${windowHours} hours`}.`
          : `${permission.action === 'delete' ? 'Delete' : 'Edit'} access for ${permission.employeeEmail} is closed.`,
      });
      if (selected?.id === permission.id && res.data) setSelected(res.data);
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Could not save the decision.' });
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await permissionService.deletePermission(pendingDelete.id);
    setDeleting(false);

    if (res.success) {
      setToast({ tone: 'good', message: 'Permission record deleted.' });
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
        title="Permissions"
        description="Field agents hold no standing edit or delete rights. Every request they raise is recorded here and takes effect only once you grant it."
        actions={
          <IconButton
            icon={RefreshCw}
            label="Reload permission requests"
            onClick={reload}
            spinning={refreshing || loading}
          />
        }
      />

      {/* Outcome summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Awaiting decision', value: summary.pending, tone: 'text-warn' },
          { label: 'Access open now', value: summary.active, tone: 'text-good' },
          { label: 'Denied or revoked', value: summary.refused, tone: 'text-crit' },
          { label: 'Used and closed', value: summary.spent, tone: 'text-ink' },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-label text-ink-2">{s.label}</p>
            <p className={cx('text-metric figure mt-2', s.tone)}>{loading ? '—' : s.value}</p>
          </Card>
        ))}
      </div>

      {/* Filters and the window a new grant opens for */}
      <Card padded={false} className="p-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-36">
            <option value="All">All statuses</option>
            {PERMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {permissionStatusMeta(s).label}
              </option>
            ))}
          </Select>

          <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-auto min-w-36">
            <option value="All">Both actions</option>
            <option value="edit">Edit listing</option>
            <option value="delete">Delete listing</option>
          </Select>

          {(status !== 'All' || action !== 'All') && (
            <Button
              size="sm"
              variant="ghost"
              icon={X}
              onClick={() => {
                setStatus('All');
                setAction('All');
              }}
            >
              Clear
            </Button>
          )}

          <label className="flex items-center gap-2 ml-auto">
            <span className="text-label text-ink-3">Grants last</span>
            <Select
              value={windowHours}
              onChange={(e) => setWindowHours(Number(e.target.value))}
              className="w-auto min-w-28"
            >
              {WINDOW_OPTIONS.map((w) => (
                <option key={w.hours} value={w.hours}>
                  {w.label}
                </option>
              ))}
            </Select>
          </label>

          <span className="text-label text-ink-3 tabular">
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
                <Th>Employee</Th>
                <Th>Listing</Th>
                <Th>Requested action</Th>
                <Th>Status</Th>
                <Th>Requested</Th>
                <Th className="text-right">Access</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={7} />
              ) : !rows.length ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={KeyRound}
                      title={
                        search || status !== 'All' || action !== 'All'
                          ? 'No matching requests'
                          : 'No permission requests'
                      }
                      description={
                        search || status !== 'All' || action !== 'All'
                          ? 'Try clearing the filters above.'
                          : 'When a field agent taps “Ask Permission” on a listing, the request lands here for your decision.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                rows.map((p) => {
                  const meta = permissionStatusMeta(p.status);
                  const act = actionMeta(p.action);
                  const ActionIcon = act.icon;
                  const expired = isExpiredGrant(p);
                  return (
                    <Tr key={p.id}>
                      <Td>
                        <button
                          onClick={() => setSelected(p)}
                          className="text-left text-sm text-ink hover:text-brand-ink transition-colors truncate max-w-52 block"
                        >
                          {p.employeeEmail}
                        </button>
                      </Td>
                      <Td className="max-w-52">
                        <span className="block text-sm text-ink truncate">{p.propertyName}</span>
                        <span className="block text-label text-ink-3 truncate">
                          {[p.propertyCategory, p.propertyPlace].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={act.tone} icon={ActionIcon}>
                          {act.label}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Badge tone={meta.tone} icon={meta.icon}>
                            {meta.label}
                          </Badge>
                          {expired && (
                            <Badge tone="neutral" icon={TriangleAlert}>
                              Window closed
                            </Badge>
                          )}
                        </div>
                      </Td>
                      <Td className="tabular">{relativeTime(p.createdAt)}</Td>
                      <Td>
                        <div className="flex items-center justify-end gap-2">
                          <span className={cx('text-label', p.active ? 'text-good' : 'text-ink-3')}>
                            {p.active ? 'Open' : 'Locked'}
                          </span>
                          <Switch
                            checked={p.active}
                            busy={busyId === p.id}
                            label={`${p.active ? 'Close' : 'Grant'} ${p.action} access for ${p.employeeEmail}`}
                            onChange={(next) => decide(p, next)}
                          />
                        </div>
                      </Td>
                      <Td className="text-right">
                        <IconButton
                          icon={Trash2}
                          label="Delete permission record"
                          tone="danger"
                          onClick={() => setPendingDelete(p)}
                        />
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
            aria-label="Permission request detail"
            className="fixed top-0 bottom-0 right-0 z-50 w-full max-w-md bg-surface border-l border-line flex flex-col anim-slide-left"
          >
            <div className="h-14 px-4 border-b border-line flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h2 className="text-section text-ink truncate">{selected.employeeEmail}</h2>
                <p className="text-label text-ink-3">{actionMeta(selected.action).label} request</p>
              </div>
              <IconButton icon={X} label="Close" onClick={() => setSelected(null)} />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div className="flex items-center gap-2">
                <Badge
                  tone={permissionStatusMeta(selected.status).tone}
                  icon={permissionStatusMeta(selected.status).icon}
                >
                  {permissionStatusMeta(selected.status).label}
                </Badge>
                <Badge tone={actionMeta(selected.action).tone} icon={actionMeta(selected.action).icon}>
                  {actionMeta(selected.action).label}
                </Badge>
              </div>

              {selected.reason && (
                <section>
                  <h3 className="text-micro uppercase text-ink-3 mb-1.5">Stated reason</h3>
                  <p className="text-sm text-ink-2 leading-relaxed p-3 rounded-panel bg-surface-inset border border-line">
                    {selected.reason}
                  </p>
                </section>
              )}

              <section>
                <h3 className="text-micro uppercase text-ink-3 mb-1 flex items-center gap-1.5">
                  <Building2 className="size-3" strokeWidth={2} /> Listing
                </h3>
                <DataRow label="Name" value={selected.propertyName} />
                <DataRow label="Category" value={selected.propertyCategory || '—'} />
                <DataRow label="Place" value={selected.propertyPlace || '—'} />
                <DataRow label="Owner" value={selected.ownerName || '—'} />
                <DataRow label="Owner mobile" value={selected.ownerMobile || '—'} mono />
                <DataRow label="Listing ID" value={selected.propertyRef} mono />
              </section>

              <section>
                <h3 className="text-micro uppercase text-ink-3 mb-1 flex items-center gap-1.5">
                  <Clock className="size-3" strokeWidth={2} /> Trail
                </h3>
                <DataRow label="Requested" value={formatDateTime(selected.createdAt)} />
                <DataRow label="Decided" value={formatDateTime(selected.decidedAt)} />
                <DataRow label="Decided by" value={selected.decidedBy || '—'} />
                <DataRow
                  label="Access expires"
                  value={
                    <span className={isExpiredGrant(selected) ? 'text-crit' : undefined}>
                      {formatDateTime(selected.expiresAt)}
                    </span>
                  }
                />
                <DataRow label="Used at" value={formatDateTime(selected.usedAt)} />
                <DataRow label="Origin IP" value={selected.requestedIp || '—'} mono />
                <DataRow label="Record ID" value={selected.id} mono />
              </section>
            </div>

            <div className="p-3 border-t border-line flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Switch
                  checked={selected.active}
                  busy={busyId === selected.id}
                  label={`${selected.active ? 'Close' : 'Grant'} access`}
                  onChange={(next) => decide(selected, next)}
                />
                <span className="text-sm text-ink-2">
                  {selected.active ? 'Access open' : 'Access locked'}
                </span>
              </div>
              <Button variant="danger" icon={Trash2} onClick={() => setPendingDelete(selected)}>
                Delete record
              </Button>
            </div>
          </aside>
        </>
      )}

      {/* Delete confirmation */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete permission record"
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
          The {pendingDelete?.action} request from{' '}
          <span className="text-ink font-medium">{pendingDelete?.employeeEmail}</span> will be removed from
          the permissionrequests collection, taking its audit trail with it.
        </p>
        {pendingDelete && (
          <div className="mt-3 space-y-1">
            <p className="text-sm text-ink-3 flex items-center gap-2">
              <Building2 className="size-3.5" strokeWidth={1.75} /> {pendingDelete.propertyName}
            </p>
            <p className="text-sm text-ink-3 flex items-center gap-2">
              <User className="size-3.5" strokeWidth={1.75} /> {pendingDelete.employeeEmail}
            </p>
            <p className="text-sm text-ink-3 flex items-center gap-2">
              <ShieldX className="size-3.5" strokeWidth={1.75} />{' '}
              {permissionStatusMeta(pendingDelete.status).label}
            </p>
          </div>
        )}
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
