/* ══════════════════════════════════════════════════════════════════════════
   Delivery riders — the approval queue, and everything else about one.

   A rider signs up in the Driver app and lands in `app_drivers` as `pending`.
   Nobody is offered a delivery until somebody on this screen has read their
   licence and approved them, and this is the only place in the console that
   can do it — no route the rider holds can set their own status.

   ## Two verdicts, and the small one is the important one

   The drawer offers a decision on EACH DOCUMENT — verify it, or refuse it with
   a sentence the rider reads in their app — and, separately, a decision on the
   ACCOUNT. That split is the whole design. Before it existed the only verdict
   available was on the application as a whole, so a blurred PAN card rejected
   a rider who had sent four perfect documents and sent them back to the start.
   Refusing a document leaves the account exactly where it is: pending, in this
   queue, with the rider told which photograph to take again.

   So the row does not offer an approve button. The point of the drawer is that
   the scans, the payout account and the vehicle are looked at before anything
   is pressed, and a one-tap approve in a list is how that stops happening.

   ## Every figure is read from the response

   A missing value renders as a dash, never a zero — on this screen the reader
   is deciding whether to put a stranger on the road with somebody's dinner,
   and a zero that means "we did not ask" is indistinguishable from one that
   means "none".
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useMemo, useState } from 'react';
import {
  Ban,
  Bike,
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  ExternalLink,
  Eye,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Truck,
  XCircle,
} from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import type { BadgeTone } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { Textarea } from '../components/common/atoms/Textarea';
import { DataRow } from '../components/common/molecules/DataRow';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { cx } from '../components/common/utils';
import { driverAdminService } from '../api/services/driverAdminService';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../lib/useFetch';
import type {
  DriverDetail,
  DriverDocumentKind,
  DriverQueueCounts,
  DriverStatus,
} from '../api/types';

import { Section } from '../components/common/molecules/Section';
import { DocumentTally } from '../components/drivers/molecules/DocumentTally';
import { DutyCell } from '../components/drivers/molecules/DutyCell';
import { DocumentPanel } from '../components/drivers/organisms/DocumentPanel';
import { CashPanel } from '../components/drivers/organisms/CashPanel';
import { day, ago } from '../components/drivers/utils';
import { Box } from '../components/common/atoms/Box';
import { Inline } from '../components/common/atoms/Inline';
import { Link } from '../components/common/atoms/Link';
import { PlainButton } from '../components/common/atoms/PlainButton';
import { PlainTable, PlainTd, PlainTr, TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Text } from '../components/common/atoms/Text';
interface DriversPageProps {
  search: string;
}

type StatusFilter = DriverStatus | 'all';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'pending', label: 'Awaiting approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All riders' },
];

const STATUS_TONE: Record<DriverStatus, BadgeTone> = {
  pending: 'warn',
  approved: 'good',
  rejected: 'crit',
  suspended: 'crit',
};

const STATUS_LABEL: Record<DriverStatus, string> = {
  pending: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
};



const VEHICLE_LABEL: Record<string, string> = {
  bike: 'Motorcycle',
  scooter: 'Scooter',
  cycle: 'Bicycle',
  auto: 'Auto',
};

/** Roles the backend lets decide. Mirrored here only to hide a button that
 *  would 403 — `driverAdmin.routes.js` is the real guard. */
const DECIDING_ROLES = new Set(['Super Admin', 'Admin', 'Food Admin']);

const dash = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
};

const money = (value: number | undefined | null): string =>
  typeof value === 'number' && Number.isFinite(value) ? `₹${Math.round(value).toLocaleString('en-IN')}` : '—';

const when = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';



export const DriversPage: React.FC<DriversPageProps> = ({ search }) => {
  const { user } = useAuth();
  const canDecide = DECIDING_ROLES.has(user?.role ?? '');

  const [status, setStatus] = useState<StatusFilter>('pending');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [docNotes, setDocNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const queue = useFetch(
    () =>
      driverAdminService.getDrivers({
        status,
        search: search || undefined,
        online: onlineOnly || undefined,
      }),
    [status, search, onlineOnly]
  );

  const detail = useFetch<DriverDetail | null>(
    () =>
      openId
        ? driverAdminService.getDriver(openId)
        : Promise.resolve({ data: null, status: 200, message: '', success: true, timestamp: '' }),
    [openId]
  );

  const rows = queue.data ?? [];
  const counts = (queue as { counts?: DriverQueueCounts }).counts;
  const open = detail.data;

  const closeDrawer = () => {
    setOpenId(null);
    setNote('');
    setDocNotes({});
  };

  /* ── The document verdict ────────────────────────────────────────────── */
  const decideDocument = async (
    kind: DriverDocumentKind,
    verdict: 'verified' | 'rejected'
  ) => {
    if (!openId) return;
    const reason = (docNotes[kind] ?? '').trim();
    if (verdict === 'rejected' && !reason) {
      setToast({
        tone: 'crit',
        message: 'Say what is wrong with it — the rider reads this and has to know what to photograph again.',
      });
      return;
    }

    setBusy(true);
    const res = await driverAdminService.decideDocument(openId, kind, verdict, reason || undefined);
    setBusy(false);

    if (!res.success) {
      setToast({ tone: 'crit', message: res.message || 'That did not save.' });
      return;
    }
    setToast({
      tone: 'good',
      message: verdict === 'verified'
        ? 'Document verified.'
        : 'Sent back. The rider is told on WhatsApp, by notification and in the app.',
    });
    setDocNotes((prev) => ({ ...prev, [kind]: '' }));
    detail.reload();
    queue.reload();
  };

  /* ── The account verdict ─────────────────────────────────────────────── */
  const decide = async (verdict: DriverStatus) => {
    if (!openId) return;
    if (verdict !== 'approved' && !note.trim()) {
      setToast({
        tone: 'crit',
        message: 'Say why. The rider is shown this, and support has to be able to explain it.',
      });
      return;
    }

    setBusy(true);
    const res = await driverAdminService.decide(openId, verdict, note.trim() || undefined);
    setBusy(false);

    if (!res.success) {
      setToast({ tone: 'crit', message: res.message || 'That did not save.' });
      return;
    }
    /* The backend's warning outranks the confirmation: a suspended rider still
       holding an order, or an approval granted over incomplete paperwork, is
       the thing the operator has to act on next. */
    setToast(
      res.warning
        ? { tone: 'crit', message: res.warning }
        : { tone: 'good', message: `Rider ${STATUS_LABEL[verdict].toLowerCase()}.` }
    );
    detail.reload();
    queue.reload();
  };

  const summary = useMemo(
    () =>
      counts
        ? [
            { label: 'Awaiting approval', value: counts.pending ?? 0 },
            { label: 'Approved', value: counts.approved ?? 0 },
            { label: 'On duty now', value: counts.online ?? 0 },
            { label: 'Suspended', value: counts.suspended ?? 0 },
          ]
        : [],
    [counts]
  );

  return (
    <Box className="space-y-4">
      <PageHeader
        title="Delivery riders"
        description="Applications from the Driver app. Verify each document, then approve the account — approving is what lets a rider go online and be offered work."
        actions={
          <Button variant="ghost" icon={RefreshCw} onClick={queue.reload} disabled={queue.refreshing}>
            Refresh
          </Button>
        }
      />

      {summary.length > 0 && (
        <Box className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {summary.map((s) => (
            <Card key={s.label} padded>
              <Text className="text-micro uppercase text-ink-3">{s.label}</Text>
              <Text className="text-2xl font-semibold text-ink tabular mt-1">{s.value}</Text>
            </Card>
          ))}
        </Box>
      )}

      <Box className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <PlainButton
            key={f.id}
            onClick={() => setStatus(f.id)}
            className={cx(
              'h-8 px-3 rounded-control text-body transition-colors',
              status === f.id
                ? 'bg-brand-soft text-brand-ink font-medium'
                : 'text-ink-2 hover:bg-surface-inset'
            )}
          >
            {f.label}
          </PlainButton>
        ))}
        <Inline className="w-px h-5 bg-line mx-1" aria-hidden />
        {/* Duty is orthogonal to approval — an approved rider is usually
            offline — so this is its own toggle rather than a sixth status. */}
        <PlainButton
          onClick={() => setOnlineOnly((v) => !v)}
          className={cx(
            'h-8 px-3 rounded-control text-body transition-colors inline-flex items-center gap-1.5',
            onlineOnly
              ? 'bg-brand-soft text-brand-ink font-medium'
              : 'text-ink-2 hover:bg-surface-inset'
          )}
        >
          <Truck className="size-3.5" />
          On duty now
        </PlainButton>
      </Box>

      <Card>
        {queue.loading ? (
          <TableSkeleton cols={8} />
        ) : queue.error ? (
          <ErrorState message={queue.error} onRetry={queue.reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Bike}
            title="Nothing here"
            description={
              status === 'pending'
                ? 'No rider is waiting for a decision.'
                : 'No rider matches this filter.'
            }
          />
        ) : (
          <Table>
            <TableHead>
              <Tr>
                <Th>Rider</Th>
                <Th>Vehicle</Th>
                <Th>Documents</Th>
                <Th>Duty</Th>
                <Th>Status</Th>
                <Th className="text-right">Cash in hand</Th>
                <Th>Applied</Th>
                <Th />
              </Tr>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <Tr key={row.driverId}>
                  <Td>
                    <Text className="font-medium text-ink">{row.name || 'Unnamed rider'}</Text>
                    <Text className="text-label text-ink-3 font-mono tabular">
                      {row.phone} · {row.driverId}
                    </Text>
                  </Td>
                  <Td>
                    <Text className="text-ink-2">{VEHICLE_LABEL[row.vehicle.type ?? ''] ?? '—'}</Text>
                    <Text className="text-label text-ink-3 font-mono">{dash(row.vehicle.plate)}</Text>
                  </Td>
                  <Td>
                    <DocumentTally row={row} />
                  </Td>
                  <Td>
                    <DutyCell row={row} />
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                  </Td>
                  <Td
                    className={cx(
                      'text-right tabular',
                      row.cashInHandPaise > 0 ? 'font-medium text-warn' : 'text-ink-3'
                    )}
                  >
                    {row.cashInHandPaise > 0 ? money(row.cashInHandPaise / 100) : '—'}
                  </Td>
                  <Td className="text-label text-ink-3">{day(row.createdAt)}</Td>
                  <Td className="text-right">
                    <Button variant="ghost" icon={ChevronRight} onClick={() => setOpenId(row.driverId)}>
                      Review
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* ── One rider, in full ───────────────────────────────────────────── */}
      <Modal
        open={!!openId}
        onClose={closeDrawer}
        title={open?.name || 'Rider'}
        description={open ? `${open.phone} · ${open.driverId}` : undefined}
        size="lg"
        footer={
          canDecide && open ? (
            <Box className="flex flex-wrap items-center justify-end gap-2 w-full">
              {open.status === 'suspended' || open.status === 'rejected' ? (
                <Button icon={CheckCircle2} onClick={() => decide('approved')} disabled={busy}>
                  Reinstate
                </Button>
              ) : (
                <>
                  {open.status === 'approved' ? (
                    <Button variant="danger" icon={Ban} onClick={() => decide('suspended')} disabled={busy}>
                      Suspend
                    </Button>
                  ) : (
                    <Button variant="danger" icon={XCircle} onClick={() => decide('rejected')} disabled={busy}>
                      Reject
                    </Button>
                  )}
                  <Button
                    icon={CheckCircle2}
                    onClick={() => decide('approved')}
                    disabled={busy || open.status === 'approved'}
                  >
                    Approve and let them ride
                  </Button>
                </>
              )}
            </Box>
          ) : undefined
        }
      >
        {detail.loading ? (
          <Text className="text-body text-ink-3">Loading the rider…</Text>
        ) : detail.error ? (
          <ErrorState message={detail.error} onRetry={detail.reload} />
        ) : !open ? (
          <Text className="text-body text-ink-3">Nothing to show.</Text>
        ) : (
          <Box className="space-y-5">
            <Box className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[open.status]}>{STATUS_LABEL[open.status]}</Badge>
              {open.isOnline && (
                <Badge tone={open.locationFresh ? 'good' : 'warn'} icon={Truck}>
                  {open.locationFresh ? 'On duty' : 'On duty, position stale'}
                </Badge>
              )}
              {!!open.currentOrderNumber && (
                <Badge tone="brand">Carrying {open.currentOrderNumber}</Badge>
              )}
              {!open.hasCompletedOnboarding && <Badge tone="warn">Sign-up unfinished</Badge>}
            </Box>

            {!!open.statusReason && (
              <Box className="rounded-control bg-surface-inset p-3">
                <Text className="text-micro uppercase text-ink-3 mb-1">Reason on file — the rider sees this</Text>
                <Text className="text-body text-ink-2">{open.statusReason}</Text>
              </Box>
            )}

            {/* What the rider still has to send, in the same words their own
                app is showing them — so support answering "why am I not
                approved" reads exactly what the rider is looking at. */}
            {open.onboardingMissing.length > 0 && (
              <Box className="rounded-control border border-warn-border bg-warn-soft p-3">
                <Text className="text-micro uppercase text-warn mb-1">Sign-up incomplete</Text>
                <Text className="text-body text-warn">
                  Still to add: {open.onboardingMissing.join(', ')}.
                </Text>
              </Box>
            )}

            {/* ── The documents. The reason this page exists. ───────────── */}
            <Section title="Documents">
              <Box className="space-y-3">
                {open.documents.map((doc) => (
                  <DocumentPanel
                    key={doc.kind}
                    doc={doc}
                    canDecide={canDecide}
                    busy={busy}
                    note={docNotes[doc.kind] ?? ''}
                    onNote={(value) => setDocNotes((prev) => ({ ...prev, [doc.kind]: value }))}
                    onDecide={(verdict) => decideDocument(doc.kind, verdict)}
                  />
                ))}
              </Box>
            </Section>

            <Section title="Who they are">
              <DataRow label="Full name" value={dash(open.name)} />
              <DataRow label="Date of birth" value={day(open.dateOfBirth)} />
              <DataRow label="City" value={dash(open.city)} />
              <DataRow label="Phone" value={dash(open.phone)} mono />
              <DataRow label="Email" value={dash(open.email)} mono />
              <DataRow label="Phone verified" value={when(open.phoneVerifiedAt)} />
              <DataRow label="Last signed in" value={when(open.lastLoginAt)} />
              <DataRow
                label="Profile photo"
                value={
                  open.profilePhotoUrl ? (
                    <Link
                      className="text-brand-ink inline-flex items-center gap-1 hover:underline"
                      href={open.profilePhotoUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Eye className="size-3.5" /> View
                      <ExternalLink className="size-3" />
                    </Link>
                  ) : (
                    'Not uploaded'
                  )
                }
              />
            </Section>

            <Section title="Vehicle">
              <DataRow label="Type" value={VEHICLE_LABEL[open.vehicle.type ?? ''] ?? '—'} />
              <DataRow label="Registration" value={dash(open.vehicle.plate)} mono />
              <DataRow label="Make and model" value={dash(open.vehicle.model)} />
            </Section>

            <Section title="Duty and position">
              <DataRow
                label="Duty"
                value={open.isOnline ? `Online since ${when(open.onlineSince)}` : 'Offline'}
              />
              <DataRow
                label="Available to dispatch"
                value={open.isAvailable ? 'Yes' : `No — carrying ${dash(open.currentOrderNumber)}`}
              />
              <DataRow
                label="Position"
                value={
                  open.currentLocation ? (
                    <Link
                      className="text-brand-ink inline-flex items-center gap-1 hover:underline"
                      /* `currentLocation` is `[longitude, latitude]` all the
                         way from Mongo; Google wants lat,lng — this is the one
                         place the order is swapped, at the point of use. */
                      href={`https://www.google.com/maps?q=${open.currentLocation[1]},${open.currentLocation[0]}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin className="size-3.5" />
                      {open.currentLocation[1].toFixed(5)}, {open.currentLocation[0].toFixed(5)}
                      <ExternalLink className="size-3" />
                    </Link>
                  ) : (
                    'Never reported'
                  )
                }
              />
              <DataRow
                label="Position age"
                value={
                  /* An "online" rider the matcher skips is the single most
                     confusing state an operator can be shown, so it is spelled
                     out rather than left to be inferred from a timestamp. */
                  <Inline className={open.isOnline && !open.locationFresh ? 'text-crit' : undefined}>
                    {ago(open.locationUpdatedAt)}
                    {open.isOnline && !open.locationFresh && ' — too old to be offered work'}
                  </Inline>
                }
              />
              <DataRow label="Handsets registered" value={String(open.deviceCount)} />
            </Section>

            <Section title="Payout">
              <DataRow label="Account holder" value={dash(open.payout.accountHolderName)} />
              <DataRow label="Bank" value={dash(open.payout.bankName)} />
              <DataRow
                label="Account"
                value={open.payout.accountLast4 ? `ending ${open.payout.accountLast4}` : '—'}
                mono
              />
              <DataRow label="IFSC" value={dash(open.payout.ifscCode)} mono />
              <DataRow label="Type" value={dash(open.payout.accountType)} />
              <DataRow label="UPI" value={dash(open.payout.upiId)} mono />
            </Section>

            <CashPanel
              driverId={open.driverId}
              cash={open.cash}
              canRecord={canDecide}
              onRecorded={() => {
                detail.reload();
                queue.reload();
              }}
              onToast={setToast}
            />

            <Section title="What they have carried">
              <DataRow label="Orders assigned" value={String(open.lifetime.assigned)} />
              <DataRow label="Delivered" value={String(open.lifetime.delivered)} />
              <DataRow label="Cancelled" value={String(open.lifetime.cancelled)} />
              <DataRow label="Paid to this rider" value={money(open.lifetime.earnings)} />
            </Section>

            {open.recentDeliveries.length > 0 && (
              <Section title={`Last ${open.recentDeliveries.length} orders`}>
                <Box className="overflow-x-auto">
                  <PlainTable className="w-full text-body">
                    <TableBody>
                      {open.recentDeliveries.map((order) => (
                        <PlainTr key={order.orderNumber} className="border-b border-line last:border-0">
                          <PlainTd className="py-1.5 pr-3 font-mono tabular text-ink">
                            {order.orderNumber}
                          </PlainTd>
                          <PlainTd className="py-1.5 pr-3 text-ink-3">
                            {order.status}
                            {order.collectionMethod === 'cash'
                              ? ' · cash'
                              : order.collectionMethod === 'upi_qr'
                                ? ' · UPI'
                                : ''}
                          </PlainTd>
                          <PlainTd className="py-1.5 pr-3 text-ink-3 whitespace-nowrap">
                            {day(order.deliveredAt || order.placedAt)}
                          </PlainTd>
                          <PlainTd className="py-1.5 text-right tabular text-ink-2">
                            {money(order.earnings)}
                          </PlainTd>
                        </PlainTr>
                      ))}
                    </TableBody>
                  </PlainTable>
                </Box>
              </Section>
            )}

            {/* ── The account decision ─────────────────────────────────── */}
            {canDecide ? (
              <Box className="border-t border-line pt-4">
                <Field
                  label="Reason"
                  hint="Required to reject or suspend. The rider reads this in their app, and support has to be able to explain it."
                >
                  <Textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. The licence has expired and no renewal has been sent."
                  />
                </Field>
                {!open.documentsReady && open.status !== 'approved' && (
                  <Text className="text-label text-warn mt-2 flex items-center gap-1.5">
                    <CircleSlash className="size-3.5 shrink-0" />
                    The required documents are not all on file. You can still approve — the gap is
                    recorded against the decision.
                  </Text>
                )}
              </Box>
            ) : (
              <Box className="border-t border-line pt-4">
                <Text className="text-body text-ink-3 flex items-center gap-2">
                  <ShieldCheck className="size-4" />
                  Your role can read this queue but not decide on it.
                </Text>
              </Box>
            )}
          </Box>
        )}
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};

/* ── Pieces ───────────────────────────────────────────────────────────────── */




