/* ══════════════════════════════════════════════════════════════════════════
   Earnings — what this kitchen has made, order by order.

   ## The page is called Earnings, not Payouts, and that is not cosmetic

   There is no food settlement ledger in this system. Nothing records that a
   restaurant was actually paid — no `food_settlements` collection, no
   `payoutStatus` on an order, no transfer reference. The Stay side has one
   (`partner_payouts`, dispatched through RazorpayX); the food side does not.

   So this page never says "paid", "pending" or "due". It says EARNED, it
   shows exactly which orders make up the figure, and it carries a standing
   line saying settlement is not tracked here. An owner reading a screen
   headed "Payouts" would reasonably conclude the money had moved, and the
   one person who cannot check that is the one reading it.

   If a real settlement ledger is built later, this page is where it lands —
   a "paid" column, a batch reference, a date — and nothing on it has to be
   retracted, because nothing on it claimed to know.

   ## Cash and online are never netted into one number

   They are owed in opposite directions:

     online  the diner paid Lampose, so Lampose owes the kitchen.
     cash    a rider took the money at the door, or the diner paid the counter
             on a pickup — and which of those it was decides who is holding
             it, so the delivery/pickup split is shown with the figure.

   One net total would be arithmetic nobody could reconcile against anything.

   ## Commission comes off the ITEMS, not off the bill

   The delivery fee and the packaging charge are not the kitchen's revenue and
   are not commissioned. The server derives commission from the two stored
   figures — `itemsTotal` minus `partnerPayout` — rather than from a rate, so
   a renegotiated rate never rewrites what an old order settled at. The
   summary here shows the effective rate that actually applied, which is why
   it can read 15.0% and not exactly match any single order.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  CreditCard,
  Download,
  Info,
  Percent,
  Receipt,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { Badge } from '../../components/common/atoms/Badge';
import { Box } from '../../components/common/atoms/Box';
import { Button } from '../../components/common/atoms/Button';
import { Card } from '../../components/common/atoms/Card';
import { Heading } from '../../components/common/atoms/Heading';
import { Inline } from '../../components/common/atoms/Inline';
import { Input } from '../../components/common/atoms/Input';
import { PlainButton } from '../../components/common/atoms/PlainButton';
import { PlainTd, PlainTr, TableBody, TableHead } from '../../components/common/atoms/PlainTable';
import { Strong } from '../../components/common/atoms/Strong';
import { Table, Td, Th, Tr } from '../../components/common/atoms/Table';
import { Text } from '../../components/common/atoms/Text';
import { EmptyState } from '../../components/common/molecules/EmptyState';
import { ErrorState } from '../../components/common/molecules/ErrorState';
import { Field } from '../../components/common/molecules/Field';
import { PageHeader } from '../../components/common/molecules/PageHeader';
import { StatCard } from '../../components/common/molecules/StatCard';
import { TableSkeleton } from '../../components/common/molecules/TableSkeleton';
import { Toast } from '../../components/common/organisms/Toast';
import type { ToastState } from '../../components/common/organisms/Toast';
import { cx } from '../../components/common/utils';
import { PayoutAccounts } from '../../components/restaurant/organisms/PayoutAccounts';
import { PayoutRequest } from '../../components/restaurant/organisms/PayoutRequest';
import { restaurantAdminService } from '../../api/services/restaurantAdminService';
import type { EarningsBucket } from '../../api/services/restaurantAdminService';
import { useFetch } from '../../lib/useFetch';
import { formatDate, percent, rupees } from '../../lib/format';

/** `YYYY-MM-DD` for an input[type=date], in LOCAL time. `toISOString` would
 *  convert to UTC and hand back yesterday for anybody east of Greenwich. */
const isoDay = (d: Date): string => {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
};

const startOfMonth = (): string => {
  const d = new Date();
  return isoDay(new Date(d.getFullYear(), d.getMonth(), 1));
};

const PRESETS = [
  { id: '7', label: 'Last 7 days', from: () => daysAgo(6), to: () => isoDay(new Date()) },
  { id: '30', label: 'Last 30 days', from: () => daysAgo(29), to: () => isoDay(new Date()) },
  { id: 'month', label: 'This month', from: startOfMonth, to: () => isoDay(new Date()) },
  { id: '90', label: 'Last 90 days', from: () => daysAgo(89), to: () => isoDay(new Date()) },
];

/** One side of the cash/online split. */
const SettlementCard: React.FC<{
  title: string;
  icon: React.ElementType;
  bucket: EarningsBucket;
  explanation: string;
}> = ({ title, icon: Icon, bucket, explanation }) => (
  <Card className="p-4">
    <Box className="flex items-center gap-2 text-ink-3 mb-2">
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      <Text className="text-label uppercase">{title}</Text>
    </Box>
    <Text className="text-display text-ink figure">{rupees(bucket.earnings)}</Text>
    <Text className="text-label text-ink-3 mt-1 tabular">
      {bucket.orders} order{bucket.orders === 1 ? '' : 's'} · {rupees(bucket.collected)} taken from
      diners
    </Text>
    {(bucket.delivery > 0 || bucket.pickup > 0) && (
      <Text className="text-label text-ink-3 mt-0.5 tabular">
        {bucket.delivery} delivered · {bucket.pickup} collected at the counter
      </Text>
    )}
    <Text className="text-label text-ink-3 mt-2 pt-2 border-t border-line">{explanation}</Text>
  </Card>
);

export const RestaurantEarningsPage: React.FC = () => {
  const [from, setFrom] = useState(() => daysAgo(29));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [preset, setPreset] = useState('30');
  const [toast, setToast] = useState<ToastState | null>(null);

  const earnings = useFetch(() => restaurantAdminService.earnings({ from, to }), [from, to]);
  const data = earnings.data;

  const applyPreset = (id: string) => {
    const found = PRESETS.find((p) => p.id === id);
    if (!found) return;
    setPreset(id);
    setFrom(found.from());
    setTo(found.to());
  };

  /* A hand-typed range stops being any preset. Tracked so the chips do not
     keep one highlighted while the dates say something else. */
  const setCustom = (which: 'from' | 'to', value: string) => {
    setPreset('');
    if (which === 'from') setFrom(value);
    else setTo(value);
  };

  const rangeIsBackwards = Boolean(from && to && from > to);

  /**
   * The ledger as a spreadsheet.
   *
   * Built from what is ON SCREEN, which is the server's capped 200 rows — so
   * the button is hidden when the ledger is truncated rather than quietly
   * exporting a partial statement somebody would then reconcile against.
   */
  const downloadCsv = () => {
    if (!data?.ledger.length) return;
    const head = [
      'Order', 'Date', 'Items', 'Delivery fee', 'Packaging', 'Diner paid',
      'Commission', 'You earned', 'Rate %', 'Paid by', 'Fulfilment',
    ];
    const lines = data.ledger.map((row) => [
      row.orderNumber,
      formatDate(row.placedAt),
      row.itemsTotal,
      row.deliveryFee,
      row.packagingCharge,
      row.grandTotal,
      row.commission,
      row.partnerPayout,
      row.commissionRate,
      row.paidBy,
      row.fulfilment,
    ]);
    const csv = [head, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `lampose-earnings-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ tone: 'good', message: `${data.ledger.length} orders exported.` });
  };

  const totals = data?.totals;

  const rows = useMemo(() => data?.ledger ?? [], [data]);

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="My restaurant"
        title="Earnings"
        description="What you have earned from delivered orders, and what came off the top."
        actions={
          <Box className="flex items-center gap-2">
            {data && !data.ledgerTruncated && rows.length > 0 && (
              <Button size="sm" variant="secondary" icon={Download} onClick={downloadCsv}>
                Export CSV
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              icon={RefreshCw}
              onClick={earnings.reload}
              loading={earnings.refreshing}
            >
              Refresh
            </Button>
          </Box>
        }
      />

      {/*
        The standing disclaimer. At the TOP, not in a footnote, and worded as
        a fact rather than an apology — see the file header. A page of money
        figures that does not say what it is will be read as a statement of
        account.
      */}
      <Box className="flex items-start gap-2.5 p-3 rounded-panel bg-surface-inset border border-line">
        <Info className="size-4 text-ink-3 shrink-0 mt-0.5" strokeWidth={2} />
        <Text className="text-sm text-ink-2">
          <Strong className="text-ink">Earnings are what you have made; payouts are what has
          been sent.</Strong>{' '}
          The figures below count every delivered order. What Lampose can actually transfer is
          above — it excludes cash a diner handed you at your own counter, which never reached us.
        </Text>
      </Box>

      {/*
        Where the money goes, directly under the note saying we do not track
        whether it went. The two belong together: an owner who has just read
        "this is not a statement of what was paid" asks "then which account
        would it be paid into", and the answer should not be a page away.
      */}
      <PayoutAccounts />

      {/*
        The button, and the history of pressing it.
        
        Under the account card on purpose: "where does it go" has to be
        answerable before "send it", and an owner with no account saved
        should meet the Add button before the disabled Request one.
      */}
      <PayoutRequest />

      {/* ── The period ─────────────────────────────────────────────────── */}
      <Card className="p-4">
        <Box className="flex flex-wrap items-end gap-4">
          <Box role="radiogroup" aria-label="Period" className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const active = preset === p.id;
              return (
                <PlainButton
                  key={p.id}
                  role="radio"
                  aria-checked={active}
                  onClick={() => applyPreset(p.id)}
                  className={cx(
                    'h-8 px-2.5 rounded-control border text-label transition-colors duration-120',
                    active
                      ? 'bg-brand-soft border-brand-border text-brand-ink font-medium'
                      : 'bg-surface border-line text-ink-2 hover:bg-surface-inset hover:text-ink'
                  )}
                >
                  {p.label}
                </PlainButton>
              );
            })}
          </Box>

          <Box className="flex items-end gap-2">
            <Field label="From">
              <Input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setCustom('from', e.target.value)}
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setCustom('to', e.target.value)}
              />
            </Field>
          </Box>
        </Box>

        {rangeIsBackwards && (
          <Box className="flex items-center gap-2 mt-3 text-label text-crit">
            <AlertCircle className="size-3.5 shrink-0" strokeWidth={2} />
            The start of the period is after its end.
          </Box>
        )}
      </Card>

      {earnings.error && <ErrorState message={earnings.error} onRetry={earnings.reload} />}

      {/* ── The headline ───────────────────────────────────────────────── */}
      <Box className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="You earned"
          value={rupees(totals?.earnings ?? 0)}
          icon={Wallet}
          loading={earnings.loading}
          footnote={totals ? `across ${totals.orders} delivered order${totals.orders === 1 ? '' : 's'}` : undefined}
        />
        <StatCard
          label="Your food sales"
          value={rupees(totals?.items ?? 0)}
          icon={Receipt}
          loading={earnings.loading}
          footnote="before commission, excluding fees"
        />
        <StatCard
          label="Lampose commission"
          value={rupees(totals?.commission ?? 0)}
          icon={Percent}
          loading={earnings.loading}
          footnote={
            totals?.effectiveRate != null
              ? `${percent(totals.effectiveRate, 1)} of food sales`
              : 'charged on food, not on fees'
          }
        />
        <StatCard
          label="Diners paid in total"
          value={rupees(totals?.gross ?? 0)}
          icon={CreditCard}
          loading={earnings.loading}
          footnote="including delivery and packaging"
        />
      </Box>

      {/* ── The split that matters ─────────────────────────────────────── */}
      {data && (
        <Box>
          <Heading level={2} className="text-label uppercase text-ink-3 mb-2">
            Where the money is
          </Heading>
          <Box className="grid sm:grid-cols-2 gap-3">
            <SettlementCard
              title="Paid online"
              icon={CreditCard}
              bucket={data.paidBy.online}
              explanation="The diner paid Lampose. Lampose owes you this."
            />
            <SettlementCard
              title="Paid in cash"
              icon={Banknote}
              bucket={data.paidBy.cash}
              explanation="Collected at the door by the rider, or at your counter on a pickup order."
            />
          </Box>
        </Box>
      )}

      {/* ── Order by order ─────────────────────────────────────────────── */}
      <Box>
        <Heading level={2} className="text-label uppercase text-ink-3 mb-2">
          Every order in this period
        </Heading>
        <Card>
          <Table>
            <TableHead>
              <Tr>
                <Th>Order</Th>
                <Th>Date</Th>
                <Th className="text-right">Food</Th>
                <Th className="text-right">Commission</Th>
                <Th className="text-right">You earned</Th>
                <Th>Paid by</Th>
              </Tr>
            </TableHead>
            <TableBody>
              {earnings.loading ? (
                <TableSkeleton rows={6} cols={6} />
              ) : rows.length === 0 ? (
                <PlainTr>
                  <PlainTd colSpan={6}>
                    <EmptyState
                      icon={Receipt}
                      title="Nothing delivered in this period"
                      description="Only delivered orders count towards earnings. Try a longer period."
                    />
                  </PlainTd>
                </PlainTr>
              ) : (
                rows.map((row) => (
                  <Tr key={row.orderNumber}>
                    <Td>
                      <Strong className="text-ink tabular">{row.orderNumber}</Strong>
                      {row.fulfilment === 'pickup' && (
                        <Text className="text-label text-ink-3 mt-0.5">collected</Text>
                      )}
                    </Td>
                    <Td className="tabular">{formatDate(row.placedAt)}</Td>
                    <Td className="text-right tabular">{rupees(row.itemsTotal)}</Td>
                    <Td className="text-right tabular">
                      −{rupees(row.commission)}
                      <Text className="text-label text-ink-3">{row.commissionRate}%</Text>
                    </Td>
                    <Td className="text-right">
                      <Strong className="text-ink tabular">{rupees(row.partnerPayout)}</Strong>
                    </Td>
                    <Td>
                      <Badge tone={row.paidBy === 'online' ? 'brand' : 'neutral'}>
                        {row.paidBy === 'online' ? 'Online' : 'Cash'}
                      </Badge>
                    </Td>
                  </Tr>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Said plainly rather than left for somebody to discover by adding
            the column up and finding it short. */}
        {data?.ledgerTruncated && (
          <Box className="flex items-start gap-2 mt-2.5 text-label text-ink-3">
            <Info className="size-3.5 shrink-0 mt-0.5" strokeWidth={2} />
            <Inline>
              Showing the {data.ledgerLimit} most recent of {totals?.orders} orders. The totals
              above cover the whole period; this list does not. Narrow the dates to see them all.
            </Inline>
          </Box>
        )}
      </Box>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
