/* ══════════════════════════════════════════════════════════════════════════
   Refunds — guests owed money for a cancelled hotel stay.

   ## What a row is

   A guest paid for a hotel stay and it was cancelled, by them or by the
   owner. The rule is a full refund, so the amount is what they paid and it
   is not editable here. The queue exists because the refund is made by a
   person: somebody transfers the money from Lampose's bank and records the
   reference, exactly as Partner Payouts does for owners.

   ## Two things a row can be waiting on

   The GUEST, for an account — `awaiting_details`. Nothing can be done with
   these except wait; the guest has been asked in their app. They are shown,
   not hidden, because a queue that hides what it cannot act on is a queue
   that loses track of money.

   A PERSON here, to transfer — `pending`. This is the work.

   ## The account is shown in full

   Whoever pays this has to type it. Masking it would be a courtesy the row
   cannot afford. It never reaches a phone; the guest's own app sees four
   digits and a bank code.

   ## The one warning

   `ownerAlreadyPaid` — the owner had their share before the cancellation
   came through. The guest is still owed the full amount, and paying it here
   is still right; recovering the owner's part is a separate conversation,
   and the row says so rather than hiding the arithmetic.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Ban, CheckCircle2, Clock, Landmark, RefreshCw, RotateCcw, ShieldAlert,
} from 'lucide-react';

import { Badge } from '../components/common/atoms/Badge';
import type { BadgeTone } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { Input } from '../components/common/atoms/Input';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { Textarea } from '../components/common/atoms/Textarea';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { RefundError, refundService, type Refund, type RefundStatus } from '../api/services/refundService';
import type { AdminRole } from '../api/types';
import { Box } from '../components/common/atoms/Box';
import { Inline } from '../components/common/atoms/Inline';
import { TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Text } from '../components/common/atoms/Text';
import { filterBySearch } from '../components/common/utils';

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const when = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * `pending` is the call to action and carries warn. `awaiting_details` is
 * waiting on the guest, not on us, so it is neutral: an amber row somebody
 * cannot act on trains people to ignore amber.
 */
const STATUS: Record<RefundStatus, { label: string; tone: BadgeTone }> = {
  awaiting_details: { label: 'Waiting for guest’s account', tone: 'neutral' },
  pending: { label: 'Ready to send', tone: 'warn' },
  paid: { label: 'Refunded', tone: 'good' },
  rejected: { label: 'Refused', tone: 'crit' },
};

const FILTERS: Array<{ id: RefundStatus | 'All'; label: string }> = [
  { id: 'pending', label: 'Ready to send' },
  { id: 'awaiting_details', label: 'Waiting on guest' },
  { id: 'paid', label: 'Refunded' },
  { id: 'rejected', label: 'Refused' },
  { id: 'All', label: 'Everything' },
];

interface Props {
  search?: string;
  role?: AdminRole;
}

export const RefundsPage: React.FC<Props> = ({ search = '', role }) => {
  const [filter, setFilter] = useState<RefundStatus | 'All'>('pending');
  /* Who cancelled — the first thing the team looks at. A guest walking away
     and an owner cancelling on a guest are read differently even though
     both refund in full. */
  const [who, setWho] = useState<'All' | 'student' | 'owner'>('All');
  const [rows, setRows] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [acting, setActing] = useState<{ row: Refund; kind: 'pay' | 'refuse' } | null>(null);
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const canAct = role === 'Super Admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await refundService.list(filter));
    } catch (err) {
      setError(err instanceof RefundError ? err.message : 'Could not load the refund queue.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const byWho = who === 'All' ? rows : rows.filter((r) => r.cancelledBy === who);
    /* `bank.accountNumber` is deliberately NOT case-folded, as it was not
       before: an account number has no case to fold, and folding it here
       would quietly change what this screen finds. */
    return filterBySearch(byWho, search, (r, q) =>
      (r.guestName || '').toLowerCase().includes(q)
      || (r.guestPhone || '').toLowerCase().includes(q)
      || (r.propertyName || '').toLowerCase().includes(q)
      || (r.bank?.accountNumber || '').includes(q)
      || (r.reference || '').toLowerCase().includes(q)
      || r.bookingId.toLowerCase().includes(q));
  }, [rows, search, who]);

  const owed = useMemo(
    () => rows.filter((r) => r.status === 'pending' || r.status === 'awaiting_details')
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [rows],
  );

  const open = (row: Refund, kind: 'pay' | 'refuse') => {
    setActing({ row, kind });
    setReference('');
    setReason('');
  };

  const submit = async () => {
    if (!acting) return;
    setBusy(true);
    try {
      const { row, kind } = acting;
      if (kind === 'refuse') {
        await refundService.reject(row.id, reason);
        setToast({ tone: 'good', message: `${inr(row.amount)} refused — the guest has been told why.` });
      } else {
        await refundService.markPaid(row.id, reference);
        setToast({ tone: 'good', message: `${inr(row.amount)} recorded as refunded.` });
      }
      setActing(null);
      void load();
    } catch (err) {
      setToast({ tone: 'crit', message: err instanceof RefundError ? err.message : 'That did not go through.' });
      setActing(null);
      void load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="Stay bookings"
        title="Refunds"
        description="Guests owed their money back for a cancelled hotel stay. Full refund, whoever cancelled. Make the bank transfer, then record it here."
        actions={(
          <Button icon={RefreshCw} onClick={() => void load()} disabled={loading}>Refresh</Button>
        )}
      />

      <Card className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <Box>
          <Box className="text-label uppercase tracking-wide text-ink-3">Owed to guests</Box>
          <Box className="text-h2 font-semibold tabular-nums">{inr(owed)}</Box>
        </Box>
        <Box>
          <Box className="text-label uppercase tracking-wide text-ink-3">Ready to send</Box>
          <Box className="text-h2 font-semibold tabular-nums">{rows.filter((r) => r.status === 'pending').length}</Box>
        </Box>
        <Box>
          <Box className="text-label uppercase tracking-wide text-ink-3">Waiting on guest</Box>
          <Box className="text-h2 font-semibold tabular-nums">{rows.filter((r) => r.status === 'awaiting_details').length}</Box>
        </Box>
        {!canAct && (
          <Box className="ml-auto max-w-md text-body text-ink-2">You can read this queue. Sending a refund is Super Admin only.</Box>
        )}
      </Card>

      <Box className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button key={f.id} variant={filter === f.id ? 'primary' : 'secondary'} size="sm" onClick={() => setFilter(f.id)}>
            {f.label}
          </Button>
        ))}
        <Inline className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        {([
          { id: 'All', label: 'Anyone cancelled' },
          { id: 'student', label: 'Guest cancelled' },
          { id: 'owner', label: 'Owner cancelled' },
        ] as const).map((f) => (
          <Button key={f.id} variant={who === f.id ? 'primary' : 'secondary'} size="sm" onClick={() => setWho(f.id)}>
            {f.label}
          </Button>
        ))}
      </Box>

      <Card padded={false}>
        {loading ? (
          <TableSkeleton cols={7} />
        ) : error ? (
          <EmptyState icon={AlertTriangle} title="Could not load the queue" description={error} action={<Button onClick={() => void load()}>Try again</Button>} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={RotateCcw}
            title={filter === 'pending' ? 'Nothing to send' : 'Nothing here'}
            description={filter === 'pending' ? 'Every refund with an account has been sent.' : 'No refunds match this filter.'}
          />
        ) : (
          <Table>
            <TableHead>
              <Tr>
                <Th>Guest</Th>
                <Th>Stay</Th>
                <Th>Cancellation</Th>
                <Th>Amount</Th>
                <Th>Pay into</Th>
                <Th>Status</Th>
                <Th className="text-right">Action</Th>
              </Tr>
            </TableHead>
            <TableBody>
              {visible.map((r) => {
                const s = STATUS[r.status] ?? STATUS.awaiting_details;
                return (
                  <Tr key={r.id}>
                    <Td>
                      <Box className="font-medium text-ink">{r.guestName || 'Guest'}</Box>
                      <Box className="mt-0.5 text-[11px] tabular-nums text-ink-3">{r.guestPhone}</Box>
                    </Td>

                    <Td>
                      <Box className="text-ink">{r.propertyName}</Box>
                      <Box className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-3">
                        <Clock className="size-3.5 shrink-0" />
                        check-in {r.checkInDate || '—'}
                      </Box>
                    </Td>

                    {/* WHO and WHY, as the main text of their own column —
                        not a grey line under the stay. This is what the
                        person paying reads to decide the refund is right. */}
                    <Td>
                      <Badge tone={r.cancelledBy === 'owner' ? 'crit' : 'neutral'}>
                        {r.cancelledBy === 'owner' ? 'Owner cancelled' : 'Guest cancelled'}
                      </Badge>
                      <Box className="mt-1.5 max-w-[30ch] text-ink">
                        {r.cancelReason || <Inline className="text-ink-3">No reason given</Inline>}
                      </Box>
                      {r.cancelNote && (
                        <Box className="mt-0.5 max-w-[30ch] text-[12px] leading-snug text-ink-2">“{r.cancelNote}”</Box>
                      )}
                      <Box className="mt-1 text-[11px] text-ink-3">{when(r.createdAt)}</Box>
                    </Td>

                    <Td>
                      <Box className="tabular-nums font-medium text-ink">{inr(r.amount)}</Box>
                      <Box className="mt-0.5 text-[11px] text-ink-3">full amount paid</Box>
                      {r.ownerAlreadyPaid && (
                        <Box className="mt-1 flex max-w-[26ch] items-start gap-1 text-[11px] leading-snug text-warn">
                          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                          Owner was already paid their share ({r.settlementStatusAtCancel}). Recover separately.
                        </Box>
                      )}
                    </Td>

                    <Td>
                      {r.bank ? (
                        <Box className="text-ink-2">
                          <Box className="flex items-center gap-1.5"><Landmark className="size-3.5 shrink-0" /><Inline>{r.bank.accountName}</Inline></Box>
                          {/* In full — see the header. A person types this. */}
                          <Box className="mt-0.5 font-mono text-[12px] text-ink">{r.bank.accountNumber}</Box>
                          <Box className="font-mono text-[11px] text-ink-3">{r.bank.ifsc}</Box>
                        </Box>
                      ) : (
                        <Inline className="text-ink-3">Guest has not given an account yet</Inline>
                      )}
                      {r.reference && <Box className="mt-1 font-mono text-[11px] text-ink-3">Ref {r.reference}</Box>}
                    </Td>

                    <Td>
                      <Badge tone={s.tone}>{s.label}</Badge>
                      {r.status === 'rejected' && r.rejectedReason && (
                        <Box className="mt-1 max-w-[26ch] text-[11px] leading-snug text-crit">{r.rejectedReason}</Box>
                      )}
                      {r.status === 'paid' && (
                        <Box className="mt-1 text-[11px] text-ink-3">{when(r.paidAt)}{r.paidByAdminName ? ` · by ${r.paidByAdminName}` : ''}</Box>
                      )}
                    </Td>

                    <Td className="text-right">
                      {canAct && (r.status === 'pending' || r.status === 'awaiting_details') ? (
                        <Box className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" icon={Ban} onClick={() => open(r, 'refuse')}>Refuse</Button>
                          <Button
                            variant="primary"
                            size="sm"
                            icon={CheckCircle2}
                            disabled={!r.bank}
                            title={r.bank ? undefined : 'The guest has not given an account yet'}
                            onClick={() => open(r, 'pay')}
                          >
                            Mark as refunded
                          </Button>
                        </Box>
                      ) : r.status === 'paid' ? (
                        <Inline className="inline-flex items-center gap-1.5 text-label text-good"><CheckCircle2 className="size-3.5" /> Refunded</Inline>
                      ) : (
                        <Inline className="text-label text-ink-3">—</Inline>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal
        open={Boolean(acting)}
        onClose={() => (busy ? undefined : setActing(null))}
        title={acting?.kind === 'refuse' ? 'Refuse this refund?' : 'Record this refund'}
        description={acting?.kind === 'refuse'
          ? 'The guest will see the reason you give.'
          : 'Mark this only once the transfer has actually left your bank.'}
        footer={(
          <>
            <Button onClick={() => setActing(null)} disabled={busy}>Cancel</Button>
            <Button variant={acting?.kind === 'refuse' ? 'danger' : 'primary'} onClick={() => void submit()} loading={busy}>
              {acting?.kind === 'refuse' ? 'Refuse' : 'Mark as refunded'}
            </Button>
          </>
        )}
      >
        {acting && (
          <Box className="space-y-3 text-body text-ink-2">
            <Text>
              <Inline className="font-medium text-ink">{inr(acting.row.amount)}</Inline> to{' '}
              <Inline className="font-medium text-ink">{acting.row.guestName || 'the guest'}</Inline>
              {acting.row.bank ? ` · ${acting.row.bank.accountNumber} · ${acting.row.bank.ifsc}` : ''}
            </Text>

            {/* Read this before pressing. It is the reason the refund exists. */}
            <Box className="rounded border border-line bg-surface-inset px-3 py-2">
              <Box className="flex items-center gap-2">
                <Badge tone={acting.row.cancelledBy === 'owner' ? 'crit' : 'neutral'}>
                  {acting.row.cancelledBy === 'owner' ? 'Owner cancelled' : 'Guest cancelled'}
                </Badge>
                <Inline className="text-[11px] text-ink-3">{when(acting.row.createdAt)}</Inline>
              </Box>
              <Box className="mt-1.5 text-ink">
                {acting.row.cancelReason || <Inline className="text-ink-3">No reason given</Inline>}
              </Box>
              {acting.row.cancelNote && (
                <Box className="mt-0.5 text-[12px] leading-snug text-ink-2">“{acting.row.cancelNote}”</Box>
              )}
              {acting.row.ownerAlreadyPaid && (
                <Box className="mt-1.5 flex items-start gap-1 text-[11px] leading-snug text-warn">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  The owner had already been paid their share. Recover it separately.
                </Box>
              )}
            </Box>
            {acting.kind === 'pay' && (
              <Field label="Bank reference" hint="The UTR or reference from the transfer. The guest sees this.">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="HDFCN00123456" autoFocus />
              </Field>
            )}
            {acting.kind === 'refuse' && (
              <Field label="Why" hint="Shown to the guest. Keep it factual.">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The stay had already started when it was cancelled." rows={3} />
              </Field>
            )}
          </Box>
        )}
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};

export default RefundsPage;
