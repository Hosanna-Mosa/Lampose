/* ══════════════════════════════════════════════════════════════════════════
   Partner payouts — the queue an owner's "Request payout" lands in.

   ## What an owner is asking for

   One request, covering two kinds of money:

     · COMMISSION OWED on completed PG, hostel and co-living bookings, where
       the owner collected the guest's money themselves.

     · HOTEL SETTLEMENTS, where the guest paid Lampose and we hold their
       share. Only settlements whose guest has actually checked in are
       claimable, so a request never includes money still inside its refund
       window.

   They arrive as one figure because they leave as one bank transfer.

   ## Paid by a person, for now

   `manualPayouts` comes from the server. While it is on — which is every
   deployment today — the primary action is **Mark as paid**: somebody makes
   the transfer in their banking app and records the reference here. That
   reference is the only evidence the money moved, and it is what the owner
   sees and quotes to their bank.

   RazorpayX is built and dormant behind the same button; when the flag flips,
   this page dispatches instead of recording. The two are deliberately one
   screen, because the queue and the question ("who is owed what?") do not
   change with the rail.

   ## Refusing gives the money back

   A request an administrator declines must not leave the owner's bookings and
   settlements claimed — that money would vanish from their available balance
   with nothing to show for it. Refuse hands both halves back.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Ban, CheckCircle2, Clock, Landmark, RefreshCw, Send, Wallet,
} from 'lucide-react';

import {
  Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Textarea,
  Table, TableSkeleton, Td, Th, Toast, Tr,
  type BadgeTone, type ToastState,
} from '../components/ui';
import {
  PartnerPayoutError, partnerPayoutService,
  type PartnerPayout, type PartnerPayoutStatus,
} from '../api/services/partnerPayoutService';
import type { AdminRole } from '../api/types';

/** Rupees, written the way every other figure in the console is. */
const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const when = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * How a payout reads at a glance.
 *
 * `pending` is the only one that is a call to action — it is the queue this
 * page exists to work through — so it is the one that carries warn.
 */
const STATUS: Record<PartnerPayoutStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Awaiting payment', tone: 'warn' },
  processing: { label: 'Sent · with the bank', tone: 'brand' },
  completed: { label: 'Paid', tone: 'good' },
  failed: { label: 'Not paid', tone: 'crit' },
};

const FILTERS: Array<{ id: PartnerPayoutStatus | 'All'; label: string }> = [
  { id: 'pending', label: 'Awaiting payment' },
  { id: 'completed', label: 'Paid' },
  { id: 'failed', label: 'Refused' },
  { id: 'All', label: 'Everything' },
];

interface Props {
  search?: string;
  role?: AdminRole;
}

export const PartnerPayoutsPage: React.FC<Props> = ({ search = '', role }) => {
  const [filter, setFilter] = useState<PartnerPayoutStatus | 'All'>('pending');
  const [rows, setRows] = useState<PartnerPayout[]>([]);
  const [manual, setManual] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  /* The row awaiting confirmation, and which of the two things is being done
     to it. Paying money is never a single unconfirmed press. */
  const [acting, setActing] = useState<{ row: PartnerPayout; kind: 'pay' | 'refuse' } | null>(null);
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const canAct = role === 'Super Admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queue = await partnerPayoutService.list(filter);
      setRows(queue.rows);
      setManual(queue.manualPayouts);
    } catch (err) {
      setError(err instanceof PartnerPayoutError ? err.message : 'Could not load the payout queue.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.ownerName || '').toLowerCase().includes(q)
      || r.partnerPhoneDigits?.toLowerCase().includes(q)
      || (r.bankAccount || '').toLowerCase().includes(q)
      || (r.razorpayReferenceId || '').toLowerCase().includes(q)
      || r.id.toLowerCase().includes(q));
  }, [rows, search]);

  /* What is actually waiting on somebody, regardless of the current filter. */
  const owed = useMemo(
    () => rows.filter((r) => r.status === 'pending').reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [rows],
  );

  const open = (row: PartnerPayout, kind: 'pay' | 'refuse') => {
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
        await partnerPayoutService.reject(row.id, reason);
        setToast({ tone: 'good', message: `${inr(row.amount)} refused — the balance is back with the owner.` });
      } else if (manual) {
        await partnerPayoutService.markPaid(row.id, reference);
        setToast({ tone: 'good', message: `${inr(row.amount)} recorded as paid.` });
      } else {
        const sent = await partnerPayoutService.process(row.id);
        setToast({
          tone: 'good',
          message: sent.status === 'completed'
            ? `${inr(sent.amount)} paid.`
            : `${inr(sent.amount)} sent — the bank will confirm it shortly.`,
        });
      }
      setActing(null);
      void load();
    } catch (err) {
      setToast({
        tone: 'crit',
        message: err instanceof PartnerPayoutError ? err.message : 'That did not go through.',
      });
      setActing(null);
      void load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Stay Partner"
        title="Partner payouts"
        description={manual
          ? 'What owners have asked to be paid. Make the bank transfer yourself, then record it here — the reference you enter is what the owner sees.'
          : 'What owners have asked to be paid for their completed bookings and hotel stays.'}
        actions={(
          <Button icon={RefreshCw} onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        )}
      />

      <Card className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <div className="text-label uppercase tracking-wide text-ink-3">Awaiting payment</div>
          <div className="text-h2 font-semibold tabular-nums">{inr(owed)}</div>
        </div>
        <div>
          <div className="text-label uppercase tracking-wide text-ink-3">Requests</div>
          <div className="text-h2 font-semibold tabular-nums">
            {rows.filter((r) => r.status === 'pending').length}
          </div>
        </div>
        <div className="ml-auto max-w-md text-body text-ink-2">
          {!canAct
            ? 'You can read this queue. Paying an owner is Super Admin only.'
            : manual
              ? 'Payouts are manual: transfer the money from your bank, then mark it paid.'
              : 'Payouts are automatic — RazorpayX sends the money when you press Send.'}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.id}
            variant={filter === f.id ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <Card padded={false}>
        {loading ? (
          <TableSkeleton cols={6} />
        ) : error ? (
          <EmptyState
            icon={AlertTriangle}
            title="Could not load the queue"
            description={error}
            action={<Button onClick={() => void load()}>Try again</Button>}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={filter === 'pending' ? 'Nothing waiting' : 'Nothing here'}
            description={
              filter === 'pending'
                ? 'Every payout an owner has asked for has been dealt with.'
                : 'No payouts match this filter.'
            }
          />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Owner</Th>
                <Th>Amount</Th>
                <Th>Pay into</Th>
                <Th>Status</Th>
                <Th>Requested</Th>
                <Th className="text-right">Action</Th>
              </Tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const s = STATUS[r.status] ?? STATUS.pending;
                const bookings = r.bookingIds?.length || 0;
                const stays = r.settlementCount || 0;
                return (
                  <Tr key={r.id}>
                    <Td>
                      <div className="font-medium text-ink">{r.ownerName || 'Unnamed owner'}</div>
                      <div className="mt-0.5 text-[11px] tabular-nums text-ink-3">
                        {r.partnerPhoneDigits}
                      </div>
                    </Td>

                    <Td>
                      <div className="tabular-nums font-medium text-ink">{inr(r.amount)}</div>
                      {/* What the figure is made of — an owner querying it will
                          ask exactly this. */}
                      <div className="mt-0.5 text-[11px] text-ink-3">
                        {[
                          bookings ? `${bookings} booking${bookings === 1 ? '' : 's'}` : '',
                          stays ? `${stays} hotel stay${stays === 1 ? '' : 's'}` : '',
                        ].filter(Boolean).join(' · ') || 'no lines'}
                      </div>
                    </Td>

                    <Td>
                      {/* The account the OWNER saved. Masked at the source —
                          the console never sees a full account number. */}
                      <div className="flex items-center gap-1.5 text-ink-2">
                        <Landmark className="size-3.5 shrink-0" />
                        <span>{r.bankAccount || 'No account on file'}</span>
                      </div>
                      {r.razorpayReferenceId && (
                        <div className="mt-0.5 font-mono text-[11px] text-ink-3">
                          Ref {r.razorpayReferenceId}
                        </div>
                      )}
                    </Td>

                    <Td>
                      <Badge tone={s.tone}>{s.label}</Badge>
                      {r.status === 'failed' && r.failureReason && (
                        <div className="mt-1 max-w-[26ch] text-[11px] leading-snug text-crit">
                          {r.failureReason}
                        </div>
                      )}
                      {r.status === 'completed' && r.paidByAdminName && (
                        <div className="mt-1 text-[11px] text-ink-3">by {r.paidByAdminName}</div>
                      )}
                    </Td>

                    <Td className="text-ink-2">
                      <div className="flex items-center gap-1.5">
                        <Clock className="size-3.5 shrink-0" />
                        {when(r.requestedAt || r.createdAt)}
                      </div>
                      {r.processedAt && (
                        <div className="mt-0.5 text-[11px] text-ink-3">paid {when(r.processedAt)}</div>
                      )}
                    </Td>

                    <Td className="text-right">
                      {canAct && (r.status === 'pending' || r.status === 'processing') ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" icon={Ban} onClick={() => open(r, 'refuse')}>
                            Refuse
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            icon={manual ? CheckCircle2 : Send}
                            onClick={() => open(r, 'pay')}
                          >
                            {manual ? 'Mark as paid' : 'Send money'}
                          </Button>
                        </div>
                      ) : r.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1.5 text-label text-good">
                          <CheckCircle2 className="size-3.5" /> Paid
                        </span>
                      ) : (
                        <span className="text-label text-ink-3">—</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={Boolean(acting)}
        onClose={() => (busy ? undefined : setActing(null))}
        title={
          acting?.kind === 'refuse'
            ? 'Refuse this payout?'
            : manual ? 'Record this payment' : 'Send this payout?'
        }
        description={
          acting?.kind === 'refuse'
            ? 'The owner keeps the balance and can request it again.'
            : manual
              ? 'Mark this only once the transfer has actually left your bank.'
              : "This transfers the money to the owner's own bank account."
        }
        footer={(
          <>
            <Button onClick={() => setActing(null)} disabled={busy}>Cancel</Button>
            <Button
              variant={acting?.kind === 'refuse' ? 'danger' : 'primary'}
              onClick={() => void submit()}
              loading={busy}
            >
              {acting?.kind === 'refuse'
                ? 'Refuse'
                : manual ? 'Mark as paid' : `Send ${acting ? inr(acting.row.amount) : ''}`}
            </Button>
          </>
        )}
      >
        {acting && (
          <div className="space-y-3 text-body text-ink-2">
            <p>
              <span className="font-medium text-ink">{inr(acting.row.amount)}</span> to{' '}
              <span className="font-medium text-ink">{acting.row.ownerName || 'this owner'}</span>
              {acting.row.bankAccount ? ` · ${acting.row.bankAccount}` : ''}
            </p>

            {acting.kind === 'pay' && manual && (
              <Field
                label="Bank reference"
                hint="The UTR or reference from the transfer. The owner sees this."
              >
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="HDFCN00123456"
                  autoFocus
                />
              </Field>
            )}

            {acting.kind === 'refuse' && (
              <Field label="Why" hint="Shown to the owner. Keep it factual.">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Bank details did not match the account holder."
                  rows={3}
                />
              </Field>
            )}

            {acting.kind === 'pay' && (
              <p className="text-ink-3">
                The amount was set when the owner requested it and cannot be edited here.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};

export default PartnerPayoutsPage;
