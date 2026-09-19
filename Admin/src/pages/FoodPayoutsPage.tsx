/* ══════════════════════════════════════════════════════════════════════════
   Restaurant Payouts — the staff queue.

   A kitchen presses "Request payout" in its own console; the row lands here;
   somebody makes the bank transfer and records the reference. Nothing on
   this page moves money — it records that a person did.

   ## Reading is open, settling is Super Admin

   Any signed-in administrator may read the queue: "has that restaurant been
   paid" is an everyday question. Marking one paid is `money.release`, the
   same capability Partner Payouts requires, and the page hides the controls
   below that role — `foodPayoutAdmin.routes.js` refuses them regardless of
   what is drawn, so this only keeps the console honest with the server.

   ## The reference box is not optional and the page says why

   A row marked paid with no bank reference is a claim nobody can check
   afterwards. The server refuses it; the form refuses it first, so the
   refusal arrives before the click rather than after.

   ## Refusing is not the quiet option

   "Reject" reads like the safe button beside "Mark paid" and it is not: it
   takes money out of a kitchen's pending column and hands them a sentence
   explaining why. The reason is required, and it is shown to the owner
   verbatim.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Ban,
  BadgeIndianRupee,
  Building2,
  CheckCircle2,
  Copy,
  Hourglass,
  Info,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import type { BadgeTone } from '../components/common/atoms/Badge';
import { Box } from '../components/common/atoms/Box';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { Inline } from '../components/common/atoms/Inline';
import { Input } from '../components/common/atoms/Input';
import { PlainButton } from '../components/common/atoms/PlainButton';
import { PlainTd, PlainTr, TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Strong } from '../components/common/atoms/Strong';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { Text } from '../components/common/atoms/Text';
import { Textarea } from '../components/common/atoms/Textarea';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { StatCard } from '../components/common/molecules/StatCard';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { cx } from '../components/common/utils';
import { foodPayoutService } from '../api/services/foodPayoutService';
import type { FoodPayoutRow, FoodPayoutStatus } from '../api/services/foodPayoutService';
import type { AdminRole } from '../api/types';
import { useFetch } from '../lib/useFetch';
import { formatDate, formatDateTime, rupees } from '../lib/format';

interface FoodPayoutsPageProps {
  search: string;
  role?: AdminRole;
}

/** Mirrored only to hide controls the server would refuse. `money.release`. */
const SETTLING_ROLES = new Set<string>(['Super Admin']);

const STATUS_LOOK: Record<FoodPayoutStatus, { label: string; tone: BadgeTone; icon: React.ElementType }> = {
  pending: { label: 'Waiting', tone: 'warn', icon: Hourglass },
  paid: { label: 'Paid', tone: 'good', icon: CheckCircle2 },
  rejected: { label: 'Refused', tone: 'crit', icon: Ban },
};

const TABS: { id: string; label: string; status: string }[] = [
  { id: 'pending', label: 'Waiting', status: 'pending' },
  { id: 'paid', label: 'Paid', status: 'paid' },
  { id: 'rejected', label: 'Refused', status: 'rejected' },
  { id: 'all', label: 'Everything', status: 'all' },
];

const masked = (last4?: string): string => (last4 ? `•••• ${last4}` : '—');

export const FoodPayoutsPage: React.FC<FoodPayoutsPageProps> = ({ search, role }) => {
  const [tabId, setTabId] = useState('pending');
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];

  const queue = useFetch(() => foodPayoutService.list({ status: tab.status }), [tab.status]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busy, setBusy] = useState(false);

  const [paying, setPaying] = useState<FoodPayoutRow | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [refusing, setRefusing] = useState<FoodPayoutRow | null>(null);
  const [reason, setReason] = useState('');

  const maySettle = SETTLING_ROLES.has(role ?? '');
  const counts = queue.data?.counts ?? {};
  const owed = queue.data?.owed ?? 0;

  const rows = useMemo(() => {
    const all = queue.data?.rows ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((row) =>
      [row.payoutId, row.restaurantName, row.restaurantId, row.account?.accountLast4, row.reference]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [queue.data, search]);

  const openPay = (row: FoodPayoutRow) => {
    setReference('');
    setNote('');
    setPaying(row);
  };

  const confirmPay = async () => {
    if (!paying) return;
    setBusy(true);
    const res = await foodPayoutService.markPaid(paying.payoutId, reference.trim(), note.trim());
    setBusy(false);
    if (res.success) {
      setToast({
        tone: 'good',
        message: `${paying.restaurantName} — ${rupees(paying.amount)} recorded as paid.`,
      });
      setPaying(null);
      queue.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'That could not be recorded.' });
      /* ALREADY_SETTLED means somebody else got there first — what is on
         screen is out of date and arguing with it helps nobody. */
      if (res.code === 'ALREADY_SETTLED') {
        setPaying(null);
        queue.reload();
      }
    }
  };

  const confirmRefuse = async () => {
    if (!refusing) return;
    setBusy(true);
    const res = await foodPayoutService.reject(refusing.payoutId, reason.trim());
    setBusy(false);
    if (res.success) {
      setToast({ tone: 'good', message: `${refusing.payoutId} refused. The money is back in their balance.` });
      setRefusing(null);
      queue.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'That could not be refused.' });
      if (res.code === 'ALREADY_SETTLED') {
        setRefusing(null);
        queue.reload();
      }
    }
  };

  /** The bank details, as one line somebody can paste into online banking. */
  const copyDetails = async (row: FoodPayoutRow) => {
    const line = [
      row.account?.accountHolderName,
      row.account?.ifscCode,
      `ending ${row.account?.accountLast4 ?? ''}`,
      rupees(row.amount),
      row.payoutId,
    ]
      .filter(Boolean)
      .join(' · ');
    try {
      await navigator.clipboard.writeText(line);
      setToast({ tone: 'good', message: 'Details copied.' });
    } catch {
      /* A denied clipboard is not worth an error state — the details are on
         screen and can be read. */
      setToast({ tone: 'crit', message: 'Could not copy — the details are on the row.' });
    }
  };

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="Food"
        title="Restaurant Payouts"
        description="Money restaurants have asked Lampose to send them. Transfers are made by hand and recorded here."
        actions={
          <Button
            size="sm"
            variant="secondary"
            icon={RefreshCw}
            onClick={queue.reload}
            loading={queue.refreshing}
          >
            Refresh
          </Button>
        }
      />

      <Box className="grid sm:grid-cols-3 gap-3">
        <StatCard
          label="Owed right now"
          value={rupees(owed)}
          icon={Wallet}
          loading={queue.loading}
          footnote={`${counts.pending ?? 0} request${(counts.pending ?? 0) === 1 ? '' : 's'} waiting`}
        />
        <StatCard
          label="Paid"
          value={String(counts.paid ?? 0)}
          icon={CheckCircle2}
          loading={queue.loading}
          footnote="settled by hand"
        />
        <StatCard
          label="Refused"
          value={String(counts.rejected ?? 0)}
          icon={Ban}
          loading={queue.loading}
          footnote="money returned to the shop's balance"
        />
      </Box>

      {!maySettle && (
        <Box className="flex items-start gap-2.5 p-3 rounded-panel bg-surface-inset border border-line">
          <Info className="size-4 text-ink-3 shrink-0 mt-0.5" strokeWidth={2} />
          <Text className="text-sm text-ink-2">
            You can read this queue. Recording a payout as paid, or refusing one, is a Super Admin
            action.
          </Text>
        </Box>
      )}

      <Box role="tablist" aria-label="Payout states" className="flex flex-wrap gap-1.5">
        {TABS.map((item) => {
          const active = item.id === tabId;
          const n = item.status === 'all' ? undefined : counts[item.status as FoodPayoutStatus];
          return (
            <PlainButton
              key={item.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTabId(item.id)}
              className={cx(
                'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-control border text-label transition-colors duration-120',
                active
                  ? 'bg-brand-soft border-brand-border text-brand-ink font-medium'
                  : 'bg-surface border-line text-ink-2 hover:bg-surface-inset hover:text-ink'
              )}
            >
              {item.label}
              {typeof n === 'number' && n > 0 && <Inline className="tabular text-ink-3">{n}</Inline>}
            </PlainButton>
          );
        })}
      </Box>

      {queue.error && <ErrorState message={queue.error} onRetry={queue.reload} />}

      <Card>
        <Table>
          <TableHead>
            <Tr>
              <Th>Restaurant</Th>
              <Th className="text-right">Amount</Th>
              <Th>Pay into</Th>
              <Th>Requested</Th>
              <Th>State</Th>
              <Th className="text-right">Action</Th>
            </Tr>
          </TableHead>
          <TableBody>
            {queue.loading ? (
              <TableSkeleton rows={6} cols={6} />
            ) : rows.length === 0 ? (
              <PlainTr>
                <PlainTd colSpan={6}>
                  <EmptyState
                    icon={BadgeIndianRupee}
                    title={
                      search.trim()
                        ? 'Nothing matches that'
                        : tabId === 'pending'
                          ? 'No payouts waiting'
                          : 'Nothing here'
                    }
                    description={
                      search.trim()
                        ? 'Clear the filter in the header.'
                        : tabId === 'pending'
                          ? 'Restaurants with a balance can request a payout from their own console. Requests appear here.'
                          : undefined
                    }
                  />
                </PlainTd>
              </PlainTr>
            ) : (
              rows.map((row) => {
                const look = STATUS_LOOK[row.status] ?? STATUS_LOOK.pending;
                return (
                  <Tr key={row.payoutId}>
                    <Td>
                      <Strong className="text-ink">{row.restaurantName || row.restaurantId}</Strong>
                      <Text className="text-label text-ink-3 tabular">
                        {row.payoutId} · {row.orderCount} order{row.orderCount === 1 ? '' : 's'}
                      </Text>
                    </Td>
                    <Td className="text-right">
                      <Strong className="text-ink tabular">{rupees(row.amount)}</Strong>
                    </Td>
                    <Td>
                      <Text className="text-ink-2 tabular">{masked(row.account?.accountLast4)}</Text>
                      <Text className="text-label text-ink-3">
                        {row.account?.accountHolderName}
                        {row.account?.ifscCode ? ` · ${row.account.ifscCode}` : ''}
                      </Text>
                    </Td>
                    <Td className="tabular">{formatDate(row.requestedAt)}</Td>
                    <Td>
                      <Badge tone={look.tone} icon={look.icon}>
                        {look.label}
                      </Badge>
                      {row.status === 'paid' && (
                        <Text className="text-label text-ink-3 mt-0.5 break-all">
                          {row.reference}
                        </Text>
                      )}
                      {row.status === 'rejected' && row.rejectionReason && (
                        <Text className="text-label text-crit mt-0.5 max-w-xs">
                          {row.rejectionReason}
                        </Text>
                      )}
                    </Td>
                    <Td className="text-right">
                      {row.status === 'pending' && maySettle ? (
                        <Box className="inline-flex items-center gap-1.5 justify-end flex-wrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Copy}
                            onClick={() => copyDetails(row)}
                            aria-label={`Copy the bank details for ${row.payoutId}`}
                          >
                            Copy
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            icon={CheckCircle2}
                            onClick={() => openPay(row)}
                          >
                            Mark paid
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            icon={Ban}
                            onClick={() => {
                              setReason('');
                              setRefusing(row);
                            }}
                          >
                            Refuse
                          </Button>
                        </Box>
                      ) : row.status === 'paid' ? (
                        <Text className="text-label text-ink-3">
                          {row.paidByAdminName ? `by ${row.paidByAdminName}` : ''}
                          {row.paidAt ? ` · ${formatDate(row.paidAt)}` : ''}
                        </Text>
                      ) : (
                        <Text className="text-label text-ink-3">—</Text>
                      )}
                    </Td>
                  </Tr>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ── Mark paid ──────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        title={`Record a payout to ${paying?.restaurantName ?? ''}`}
        description="Make the bank transfer first, then record it here with the reference."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPaying(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={CheckCircle2}
              loading={busy}
              /* The server refuses an empty reference; refusing it here means
                 the refusal arrives before the click rather than after. */
              disabled={!reference.trim()}
              onClick={confirmPay}
            >
              Record as paid
            </Button>
          </>
        }
      >
        {paying && (
          <Box className="space-y-4">
            <Box className="p-3 rounded-panel border border-line bg-surface-subtle">
              <Box className="flex items-baseline justify-between gap-4">
                <Text className="text-label uppercase text-ink-3">Transfer</Text>
                <Strong className="text-ink tabular text-body">{rupees(paying.amount)}</Strong>
              </Box>
              <Box className="mt-2 space-y-0.5">
                <Text className="text-sm text-ink-2 inline-flex items-center gap-1.5">
                  <Building2 className="size-3.5 text-ink-3" strokeWidth={1.75} />
                  {paying.account?.accountHolderName || '—'}
                </Text>
                <Text className="text-sm text-ink-2 tabular">
                  {masked(paying.account?.accountLast4)}
                  {paying.account?.ifscCode ? ` · ${paying.account.ifscCode}` : ''}
                  {paying.account?.accountType ? ` · ${paying.account.accountType}` : ''}
                </Text>
                {paying.account?.upiId && (
                  <Text className="text-label text-ink-3">{paying.account.upiId}</Text>
                )}
              </Box>
              {/* Lampose does not hold the full number — the owner typed it
                  once and it was never stored in a readable form. */}
              <Text className="text-label text-ink-3 mt-2 pt-2 border-t border-line">
                Only the last four digits are stored. Use the account on file with the restaurant
                if your banking screen needs the full number.
              </Text>
            </Box>

            <Field
              label="Bank transfer reference"
              required
              hint="UTR or the reference your bank gave. Without it nobody can check this payment later."
            >
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. UTR123456789"
                autoComplete="off"
              />
            </Field>

            <Field label="Internal note" hint="For Lampose only — the restaurant never sees this.">
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional"
              />
            </Field>

            <Text className="text-label text-ink-3">
              Covers {paying.orderCount} delivered order{paying.orderCount === 1 ? '' : 's'},
              requested {formatDateTime(paying.requestedAt)}.
            </Text>
          </Box>
        )}
      </Modal>

      {/* ── Refuse ─────────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(refusing)}
        onClose={() => setRefusing(null)}
        title={`Refuse ${refusing?.payoutId ?? ''}?`}
        description="The orders this request was holding go back to the restaurant's balance, and they can request again."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefusing(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={Ban}
              loading={busy}
              disabled={!reason.trim()}
              onClick={confirmRefuse}
            >
              Refuse the request
            </Button>
          </>
        }
      >
        <Box className="space-y-3">
          <Box className="flex items-start gap-2.5 p-3 rounded-panel bg-warn-soft border border-warn-border">
            <AlertCircle className="size-4 text-warn shrink-0 mt-0.5" strokeWidth={2} />
            <Text className="text-sm text-ink-2">
              {refusing?.restaurantName} asked for {rupees(refusing?.amount ?? 0)}. Nothing is
              lost — the money returns to their balance.
            </Text>
          </Box>
          <Field
            label="Why?"
            required
            hint="The restaurant is shown this, word for word."
          >
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. The bank details need checking — please confirm the IFSC."
            />
          </Field>
        </Box>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
