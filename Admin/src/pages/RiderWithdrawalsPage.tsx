/* ══════════════════════════════════════════════════════════════════════════
   Rider Withdrawals — the staff queue.

   A rider taps "Withdraw" in their app; the amount leaves their wallet at
   once and the request lands here. Somebody makes the transfer (bank or UPI)
   and records the reference, or refuses it and the money goes back to the
   rider's wallet. Nothing on this page moves money — it records that a
   person did. The same shape and the same gates as Restaurant Payouts
   (`FoodPayoutsPage.tsx`): reading is open, settling is Super Admin, and
   `riderWithdrawalAdmin.routes.js` refuses regardless of what is drawn.

   ## The full account number

   Unlike a restaurant's, the rider's full account number is snapshotted on
   the request, and the server hands it only to an administrator who may pay
   (`money.release`). So "Mark paid" fetches the one request fresh and shows
   it there — never in the list.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import {
  AlertCircle,
  Ban,
  Bike,
  CheckCircle2,
  Copy,
  Hourglass,
  Info,
  RefreshCw,
  Settings2,
  Wallet,
} from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import type { BadgeTone } from '../components/common/atoms/Badge';
import { Box } from '../components/common/atoms/Box';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { Input } from '../components/common/atoms/Input';
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
import { Option } from '../components/common/atoms/Option';
import { Select } from '../components/common/atoms/Select';
import { FilterBar } from '../components/common/molecules/FilterBar';
import { FilterChips } from '../components/common/molecules/FilterChips';
import { ResultCount } from '../components/common/molecules/ResultCount';
import { filterSelectClass } from '../components/common/utils';
import { riderWithdrawalService } from '../api/services/riderWithdrawalService';
import { riderLedgerService } from '../api/services/riderLedgerService';
import type { RiderWithdrawalRow, RiderWithdrawalStatus } from '../api/services/riderWithdrawalService';
import type { AdminRole } from '../api/types';
import { useDebounced, useFetch } from '../lib/useFetch';
import { formatDate, formatDateTime, rupeesFromPaise } from '../lib/format';

interface RiderWithdrawalsPageProps {
  search: string;
  role?: AdminRole;
}

/** Mirrored only to hide controls the server would refuse. `money.release`. */
const SETTLING_ROLES = new Set<string>(['Super Admin']);

const STATUS_LOOK: Record<RiderWithdrawalStatus, { label: string; tone: BadgeTone; icon: React.ElementType }> = {
  requested: { label: 'Waiting', tone: 'warn', icon: Hourglass },
  paid: { label: 'Paid', tone: 'good', icon: CheckCircle2 },
  rejected: { label: 'Refused', tone: 'crit', icon: Ban },
};

type TabId = RiderWithdrawalStatus | 'all';

const TABS: { id: TabId; label: string; tone?: BadgeTone }[] = [
  { id: 'requested', label: 'Waiting', tone: 'warn' },
  { id: 'paid', label: 'Paid', tone: 'good' },
  { id: 'rejected', label: 'Refused', tone: 'crit' },
  { id: 'all', label: 'Everything' },
];

type MethodFilter = 'all' | 'bank' | 'upi';

/** "UPI (4)" — a native <option> cannot hold a pill. */
const withCount = (label: string, n: number | null | undefined) =>
  n == null ? label : `${label} (${n.toLocaleString('en-IN')})`;

const masked = (last4?: string): string => (last4 ? `•••• ${last4}` : '');

/** "Bank •••• 9012 · SBIN0001234", "UPI rider@okaxis", or both. */
const payInto = (account: RiderWithdrawalRow['account']): string =>
  [
    account.accountLast4 ? `${masked(account.accountLast4)}${account.ifscCode ? ` · ${account.ifscCode}` : ''}` : '',
    account.upiId ? `UPI ${account.upiId}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ') || '—';

export const RiderWithdrawalsPage: React.FC<RiderWithdrawalsPageProps> = ({ search, role }) => {
  const [tabId, setTabId] = useState<TabId>('requested');
  const [method, setMethod] = useState<MethodFilter>('all');
  /* Searched on the server: the list stops at a page, and a search over one
     page would quietly miss the request somebody is looking for. */
  const q = useDebounced(search.trim(), 300);

  const queue = useFetch(
    () =>
      riderWithdrawalService.list({
        status: tabId,
        search: q || undefined,
        method: method === 'all' ? undefined : method,
      }),
    [tabId, q, method]
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busy, setBusy] = useState(false);

  const [paying, setPaying] = useState<RiderWithdrawalRow | null>(null);
  const [loadingPay, setLoadingPay] = useState(false);
  const [reference, setReference] = useState('');
  const [refusing, setRefusing] = useState<RiderWithdrawalRow | null>(null);
  const [reason, setReason] = useState('');

  const maySettle = SETTLING_ROLES.has(role ?? '');

  /* The cash limit and the minimum withdrawal — read by anyone, changed by a
     Super Admin (`riders.ledger`). Lives here because this is the page about
     rider money; the Drivers page shows its effect per rider. */
  const settings = useFetch(() => riderLedgerService.getSettings(), []);
  const [editingLimits, setEditingLimits] = useState(false);
  const [limitInput, setLimitInput] = useState('');
  const [minInput, setMinInput] = useState('');

  const startEditLimits = () => {
    setLimitInput(String((settings.data?.codLimitPaise ?? 200000) / 100));
    setMinInput(String((settings.data?.minWithdrawalPaise ?? 10000) / 100));
    setEditingLimits(true);
  };

  const saveLimits = async () => {
    const codLimit = Number(limitInput);
    const minWithdrawal = Number(minInput);
    if (!Number.isFinite(codLimit) || codLimit < 1 || !Number.isFinite(minWithdrawal) || minWithdrawal < 1) {
      setToast({ tone: 'crit', message: 'Enter both amounts in rupees, ₹1 or more.' });
      return;
    }
    setBusy(true);
    const res = await riderLedgerService.updateSettings({ codLimit, minWithdrawal });
    setBusy(false);
    if (!res.success) {
      setToast({ tone: 'crit', message: res.message || 'That did not save.' });
      return;
    }
    setToast({ tone: 'good', message: 'Rider money settings saved.' });
    setEditingLimits(false);
    settings.reload();
  };
  const counts = queue.data?.counts ?? {};
  const facets = queue.data?.facets;
  const rows = queue.data?.items ?? [];

  /* Waiting is the queue's resting state, not a filter somebody chose. */
  const filtersActive = !!q || tabId !== 'requested' || method !== 'all';
  const clearFilters = () => {
    setTabId('all');
    setMethod('all');
  };
  const total = Object.values(counts).reduce((sum, c) => sum + (c?.count ?? 0), 0);
  const matching = facets?.matching ?? rows.length;

  /* Fetched fresh: the list never carries the full account number. */
  const openPay = async (row: RiderWithdrawalRow) => {
    setReference('');
    setPaying(row);
    setLoadingPay(true);
    const res = await riderWithdrawalService.get(row.withdrawalId);
    setLoadingPay(false);
    if (res.success && res.data) setPaying(res.data);
  };

  const settledElsewhere = (code?: string) => code === 'NOT_OPEN' || code === 'NOT_FOUND';

  const confirmPay = async () => {
    if (!paying) return;
    setBusy(true);
    const res = await riderWithdrawalService.markPaid(paying.withdrawalId, reference.trim());
    setBusy(false);
    if (res.success) {
      setToast({
        tone: 'good',
        message: `${paying.driverName || paying.driverId} — ${rupeesFromPaise(paying.amountPaise)} recorded as paid.`,
      });
      setPaying(null);
      queue.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'That could not be recorded.' });
      if (settledElsewhere(res.code)) {
        setPaying(null);
        queue.reload();
      }
    }
  };

  const confirmRefuse = async () => {
    if (!refusing) return;
    setBusy(true);
    const res = await riderWithdrawalService.reject(refusing.withdrawalId, reason.trim());
    setBusy(false);
    if (res.success) {
      setToast({ tone: 'good', message: `${refusing.withdrawalId} refused. The money is back in the rider's wallet.` });
      setRefusing(null);
      queue.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'That could not be refused.' });
      if (settledElsewhere(res.code)) {
        setRefusing(null);
        queue.reload();
      }
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast({ tone: 'good', message: 'Copied.' });
    } catch {
      setToast({ tone: 'crit', message: 'Could not copy — the details are on screen.' });
    }
  };

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="Food"
        title="Rider Withdrawals"
        description="Riders asking for their wallet to be paid out. Transfers are made by hand and recorded here."
        actions={
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={queue.reload} loading={queue.refreshing}>
            Refresh
          </Button>
        }
      />

      <Box className="grid sm:grid-cols-3 gap-3">
        <StatCard
          label="Waiting to be paid"
          value={rupeesFromPaise(counts.requested?.amountPaise ?? 0)}
          icon={Wallet}
          loading={queue.loading}
          footnote={`${counts.requested?.count ?? 0} request${(counts.requested?.count ?? 0) === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Paid"
          value={rupeesFromPaise(counts.paid?.amountPaise ?? 0)}
          icon={CheckCircle2}
          loading={queue.loading}
          footnote={`${counts.paid?.count ?? 0} withdrawal${(counts.paid?.count ?? 0) === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Refused"
          value={String(counts.rejected?.count ?? 0)}
          icon={Ban}
          loading={queue.loading}
          footnote="money returned to the rider's wallet"
        />
      </Box>

      <Card>
        <Box className="p-4 flex flex-wrap items-end gap-4 justify-between">
          <Box className="flex items-start gap-2.5">
            <Settings2 className="size-4 text-ink-3 shrink-0 mt-1" strokeWidth={2} />
            <Box>
              <Strong className="text-ink">Rider money settings</Strong>
              {settings.data ? (
                <Text className="text-sm text-ink-2">
                  Cash orders stop at {rupeesFromPaise(settings.data.codLimitPaise)} outstanding · minimum withdrawal{' '}
                  {rupeesFromPaise(settings.data.minWithdrawalPaise)}
                  {settings.data.opened
                    ? ` · ledger opened ${formatDate(settings.data.startedAt as string)}`
                    : ' · ledger NOT opened yet (run npm run rider-ledger:open)'}
                </Text>
              ) : (
                <Text className="text-sm text-ink-3">{settings.error || 'Loading…'}</Text>
              )}
            </Box>
          </Box>
          {maySettle && !editingLimits && settings.data && (
            <Button size="sm" variant="secondary" onClick={startEditLimits}>
              Change
            </Button>
          )}
        </Box>
        {editingLimits && (
          <Box className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <Field label="Cash limit (₹)" hint="At or above this outstanding, no cash orders.">
              <Input type="number" min={1} value={limitInput} onChange={(e) => setLimitInput(e.target.value)} />
            </Field>
            <Field label="Minimum withdrawal (₹)">
              <Input type="number" min={1} value={minInput} onChange={(e) => setMinInput(e.target.value)} />
            </Field>
            <Box className="flex gap-2">
              <Button size="sm" variant="primary" loading={busy} onClick={saveLimits}>
                Save
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditingLimits(false)}>
                Cancel
              </Button>
            </Box>
          </Box>
        )}
      </Card>

      {!maySettle && (
        <Box className="flex items-start gap-2.5 p-3 rounded-panel bg-surface-inset border border-line">
          <Info className="size-4 text-ink-3 shrink-0 mt-0.5" strokeWidth={2} />
          <Text className="text-sm text-ink-2">
            You can read this queue. Recording a withdrawal as paid, or refusing one, is a Super Admin action.
          </Text>
        </Box>
      )}

      <Card padded={false} className="p-3">
        <FilterBar
          summary={
            queue.loading ? undefined : (
              <ResultCount shown={matching} total={total} noun="withdrawals" onClear={clearFilters} />
            )
          }
        >
          <FilterChips
            label="Withdrawal state"
            value={tabId}
            onChange={setTabId}
            options={TABS.map((t) => ({ ...t, count: facets?.status ? facets.status[t.id] ?? 0 : null }))}
          />
          <Select
            aria-label="Paid into"
            value={method}
            onChange={(e) => setMethod(e.target.value as MethodFilter)}
            className={filterSelectClass}
          >
            <Option value="all">{withCount('Bank or UPI', facets?.method?.all)}</Option>
            <Option value="bank">{withCount('Bank account', facets?.method?.bank)}</Option>
            <Option value="upi">{withCount('UPI', facets?.method?.upi)}</Option>
          </Select>
        </FilterBar>
        {matching > rows.length && (
          <Text className="text-label text-ink-3 mt-2">
            Listing the first {rows.length} — search or narrow the filters to reach the rest.
          </Text>
        )}
      </Card>

      {queue.error && <ErrorState message={queue.error} onRetry={queue.reload} />}

      <Card>
        <Table>
          <TableHead>
            <Tr>
              <Th>Rider</Th>
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
                    icon={Bike}
                    title={
                      q || method !== 'all'
                        ? 'No withdrawals match these filters'
                        : tabId === 'requested'
                          ? 'No withdrawals waiting'
                          : 'Nothing here'
                    }
                    description={
                      q
                        ? 'Clear the search in the header, or widen the filters.'
                        : tabId === 'requested' && method === 'all'
                          ? 'Riders with money in their wallet can ask for it from the app. Requests appear here.'
                          : undefined
                    }
                    action={
                      filtersActive && (tabId !== 'all' || method !== 'all') ? (
                        <Button size="sm" variant="secondary" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                </PlainTd>
              </PlainTr>
            ) : (
              rows.map((row) => {
                const look = STATUS_LOOK[row.status] ?? STATUS_LOOK.requested;
                return (
                  <Tr key={row.withdrawalId}>
                    <Td>
                      <Strong className="text-ink">{row.driverName || row.driverId}</Strong>
                      <Text className="text-label text-ink-3 tabular">
                        {row.withdrawalId} · {row.driverId}
                        {row.driverPhone ? ` · ${row.driverPhone}` : ''}
                      </Text>
                    </Td>
                    <Td className="text-right">
                      <Strong className="text-ink tabular">{rupeesFromPaise(row.amountPaise)}</Strong>
                    </Td>
                    <Td>
                      <Text className="text-ink-2 tabular">{payInto(row.account)}</Text>
                      <Text className="text-label text-ink-3">
                        {row.account.accountHolderName}
                        {row.account.bankName ? ` · ${row.account.bankName}` : ''}
                      </Text>
                    </Td>
                    <Td className="tabular">{formatDate(row.requestedAt)}</Td>
                    <Td>
                      <Badge tone={look.tone} icon={look.icon}>
                        {look.label}
                      </Badge>
                      {row.status === 'paid' && (
                        <Text className="text-label text-ink-3 mt-0.5 break-all">{row.reference}</Text>
                      )}
                      {row.status === 'rejected' && row.rejectionReason && (
                        <Text className="text-label text-crit mt-0.5 max-w-xs">{row.rejectionReason}</Text>
                      )}
                    </Td>
                    <Td className="text-right">
                      {row.status === 'requested' && maySettle ? (
                        <Box className="inline-flex items-center gap-1.5 justify-end flex-wrap">
                          <Button size="sm" variant="primary" icon={CheckCircle2} onClick={() => openPay(row)}>
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
                      ) : row.status !== 'requested' ? (
                        <Text className="text-label text-ink-3">
                          {row.decidedBy ? `by ${row.decidedBy}` : ''}
                          {row.paidAt || row.rejectedAt ? ` · ${formatDate((row.paidAt || row.rejectedAt) as string)}` : ''}
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
        title={`Pay ${paying?.driverName || paying?.driverId || ''}`}
        description="Make the transfer first, then record it here with the reference."
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
              disabled={!reference.trim() || loadingPay}
              onClick={confirmPay}
            >
              Record as paid
            </Button>
          </>
        }
      >
        {paying && (
          <Box className="space-y-4">
            <Box className="p-3 rounded-panel border border-line bg-surface-subtle space-y-2">
              <Box className="flex items-baseline justify-between gap-4">
                <Text className="text-label uppercase text-ink-3">Transfer</Text>
                <Strong className="text-ink tabular text-body">{rupeesFromPaise(paying.amountPaise)}</Strong>
              </Box>
              <Text className="text-sm text-ink-2">{paying.account.accountHolderName || '—'}</Text>
              {paying.account.bankAccountNumber ? (
                <Box className="flex items-center justify-between gap-3">
                  <Text className="text-sm text-ink tabular">
                    A/c {paying.account.bankAccountNumber}
                    {paying.account.ifscCode ? ` · ${paying.account.ifscCode}` : ''}
                    {paying.account.bankName ? ` · ${paying.account.bankName}` : ''}
                  </Text>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Copy}
                    onClick={() => copy(paying.account.bankAccountNumber as string)}
                    aria-label="Copy the account number"
                  >
                    Copy
                  </Button>
                </Box>
              ) : paying.account.accountLast4 ? (
                <Text className="text-sm text-ink-2 tabular">
                  {loadingPay ? 'Loading account…' : `${masked(paying.account.accountLast4)} · ${paying.account.ifscCode}`}
                </Text>
              ) : null}
              {paying.account.upiId && (
                <Box className="flex items-center justify-between gap-3">
                  <Text className="text-sm text-ink tabular">UPI {paying.account.upiId}</Text>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Copy}
                    onClick={() => copy(paying.account.upiId)}
                    aria-label="Copy the UPI id"
                  >
                    Copy
                  </Button>
                </Box>
              )}
            </Box>

            <Field
              label="Transfer reference"
              required
              hint="UTR or UPI reference. Without it nobody can check this payment later."
            >
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. UTR123456789"
                autoComplete="off"
              />
            </Field>

            <Text className="text-label text-ink-3">Requested {formatDateTime(paying.requestedAt)}.</Text>
          </Box>
        )}
      </Modal>

      {/* ── Refuse ─────────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(refusing)}
        onClose={() => setRefusing(null)}
        title={`Refuse ${refusing?.withdrawalId ?? ''}?`}
        description="The amount goes back into the rider's wallet, and they can ask again."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefusing(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={Ban} loading={busy} disabled={!reason.trim()} onClick={confirmRefuse}>
              Refuse the request
            </Button>
          </>
        }
      >
        <Box className="space-y-3">
          <Box className="flex items-start gap-2.5 p-3 rounded-panel bg-warn-soft border border-warn-border">
            <AlertCircle className="size-4 text-warn shrink-0 mt-0.5" strokeWidth={2} />
            <Text className="text-sm text-ink-2">
              {refusing?.driverName || refusing?.driverId} asked for {rupeesFromPaise(refusing?.amountPaise ?? 0)}. Nothing
              is lost — it returns to their wallet.
            </Text>
          </Box>
          <Field label="Why?" required hint="The rider is shown this, word for word.">
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. The name on the bank account does not match yours — please update your bank details."
            />
          </Field>
        </Box>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
