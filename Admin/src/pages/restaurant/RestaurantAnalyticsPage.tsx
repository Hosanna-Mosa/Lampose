/* ══════════════════════════════════════════════════════════════════════════
   Analytics — how this restaurant is trading.

   The dashboard answers "what needs me now". This answers "how are we
   doing", which is a different question asked at a different time of day,
   which is why it is a separate page rather than more tiles on that one.

   Everything comes from ONE request — `/v1/restaurant-admin/analytics` —
   which the server answers with six aggregations over indexed fields. Nothing
   on this page is computed from a list of orders dragged across the wire.

   ## Every figure that involves money is delivered-only

   The same rule the dashboard uses, and the page says so once at the top
   rather than repeating it on six tiles. Counting food still being cooked
   would make a chart redraw downward when an order was refused, and a figure
   that moves backwards is one nobody trusts.

   ## Two numbers per dish, because they disagree

   The dish that sells most often and the dish that earns most are frequently
   not the same one, and an owner deciding what to drop from the menu needs
   both in front of them. So there are two ranked lists, not one sorted
   whichever way happened to be written first.

   ## What is NOT here

   No comparison against a previous period. The server sends one window and
   `StatCard`'s delta would need a second, so rather than invent a baseline
   the tiles carry a plain footnote. A real "vs the previous 30 days" is a
   second aggregation and a deliberate piece of work, not a division done in
   a browser against numbers it does not have.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useMemo, useState } from 'react';
import {
  Ban,
  BarChart3,
  CheckCircle2,
  Clock3,
  CreditCard,
  Flame,
  Receipt,
  RefreshCw,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Box } from '../../components/common/atoms/Box';
import { Button } from '../../components/common/atoms/Button';
import { Card } from '../../components/common/atoms/Card';
import { Inline } from '../../components/common/atoms/Inline';
import { PlainButton } from '../../components/common/atoms/PlainButton';
import { Text } from '../../components/common/atoms/Text';
import { EmptyState } from '../../components/common/molecules/EmptyState';
import { ErrorState } from '../../components/common/molecules/ErrorState';
import { PageHeader } from '../../components/common/molecules/PageHeader';
import { Section } from '../../components/common/molecules/Section';
import { StatCard } from '../../components/common/molecules/StatCard';
import { ColumnChart } from '../../components/common/organisms/ColumnChart';
import { Donut } from '../../components/common/organisms/Donut';
import { RankedBars } from '../../components/common/organisms/RankedBars';
import { cx } from '../../components/common/utils';
import type { Datum } from '../../components/common/utils';
import { restaurantAdminService } from '../../api/services/restaurantAdminService';
import type { FoodOrderStatus } from '../../api/services/restaurantAdminService';
import { useFetch } from '../../lib/useFetch';
import { percent, rupees } from '../../lib/format';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

/** How an order ended, and how loudly to say so. */
const OUTCOME_LOOK: Partial<Record<FoodOrderStatus, { label: string; color: string }>> = {
  delivered: { label: 'Delivered', color: 'var(--chart-good)' },
  rejected: { label: 'Refused by you', color: 'var(--chart-critical)' },
  cancelled: { label: 'Cancelled by the diner', color: 'var(--chart-neutral)' },
  placed: { label: 'Still waiting', color: 'var(--chart-warning)' },
  accepted: { label: 'Accepted', color: 'var(--chart-series)' },
  preparing: { label: 'Cooking', color: 'var(--chart-series)' },
  ready: { label: 'Ready', color: 'var(--chart-series)' },
  picked_up: { label: 'On the way', color: 'var(--chart-series)' },
};

/** `2026-09-19` → `19 Sep`. Built from the parts rather than `new Date(s)`,
 *  which would read the key as UTC and shift the label a day in some zones. */
const dayLabel = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const hourLabel = (hour: number): string => {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
};

export const RestaurantAnalyticsPage: React.FC = () => {
  const [days, setDays] = useState(30);
  const analytics = useFetch(() => restaurantAdminService.analytics(days), [days]);
  const data = analytics.data;

  /* ── Charts ─────────────────────────────────────────────────────────── */

  const earningsSeries: Datum[] = useMemo(
    () =>
      (data?.series ?? []).map((row) => ({
        label: dayLabel(row.date),
        value: row.earnings,
        meta: `${row.delivered} delivered of ${row.orders} placed`,
      })),
    [data]
  );

  const ordersSeries: Datum[] = useMemo(
    () =>
      (data?.series ?? []).map((row) => ({
        label: dayLabel(row.date),
        value: row.orders,
        meta: `${row.delivered} delivered · ${rupees(row.earnings)} earned`,
      })),
    [data]
  );

  /* Only the hours this kitchen actually trades in. Twenty-four bars of which
     nine are zero is a chart about the night, not about the business — the
     server sends all of them so the gaps are real, and the range is trimmed
     to the first and last hour with an order in it. */
  const hourSeries: Datum[] = useMemo(() => {
    const hours = data?.hours ?? [];
    const busy = hours.filter((h) => h.orders > 0);
    if (!busy.length) return [];
    const first = Math.min(...busy.map((h) => h.hour));
    const last = Math.max(...busy.map((h) => h.hour));
    return hours
      .filter((h) => h.hour >= first && h.hour <= last)
      .map((h) => ({
        label: hourLabel(h.hour),
        value: h.orders,
        meta: `${h.orders} order${h.orders === 1 ? '' : 's'} placed between ${hourLabel(h.hour)} and ${hourLabel((h.hour + 1) % 24)}`,
      }));
  }, [data]);

  const outcomes: Datum[] = useMemo(() => {
    const status = data?.status ?? {};
    return (Object.keys(status) as FoodOrderStatus[])
      .filter((key) => (status[key] ?? 0) > 0)
      .map((key) => ({
        label: OUTCOME_LOOK[key]?.label ?? key,
        value: status[key] ?? 0,
        color: OUTCOME_LOOK[key]?.color,
      }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const paymentMix: Datum[] = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Paid online', value: data.payment.online.orders, color: 'var(--chart-series)' },
      { label: 'Cash', value: data.payment.cash.orders, color: 'var(--chart-warning)' },
    ].filter((d) => d.value > 0);
  }, [data]);

  const dishesByQuantity: Datum[] = useMemo(
    () =>
      (data?.topDishes ?? []).slice(0, 8).map((dish) => ({
        label: dish.productName,
        value: dish.quantity,
        meta: `${rupees(dish.revenue)} across ${dish.orders} order${dish.orders === 1 ? '' : 's'}`,
      })),
    [data]
  );

  const dishesByRevenue: Datum[] = useMemo(
    () =>
      [...(data?.topDishes ?? [])]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8)
        .map((dish) => ({
          label: dish.productName,
          value: dish.revenue,
          meta: `${dish.quantity} sold`,
        })),
    [data]
  );

  const totals = data?.totals;
  const nothingYet = Boolean(data && totals && totals.placed === 0);

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="My restaurant"
        title="Analytics"
        description="How the kitchen has traded. Every money figure counts delivered orders only — food still being cooked has not been earned yet."
        actions={
          <Box className="flex items-center gap-2">
            <Box role="radiogroup" aria-label="Period" className="flex gap-1">
              {RANGES.map((range) => {
                const active = range.days === days;
                return (
                  <PlainButton
                    key={range.days}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDays(range.days)}
                    className={cx(
                      'h-8 px-2.5 rounded-control border text-label transition-colors duration-120',
                      active
                        ? 'bg-brand-soft border-brand-border text-brand-ink font-medium'
                        : 'bg-surface border-line text-ink-2 hover:bg-surface-inset hover:text-ink'
                    )}
                  >
                    {range.label}
                  </PlainButton>
                );
              })}
            </Box>
            <Button
              size="sm"
              variant="secondary"
              icon={RefreshCw}
              onClick={analytics.reload}
              loading={analytics.refreshing}
            >
              Refresh
            </Button>
          </Box>
        }
      />

      {analytics.error && <ErrorState message={analytics.error} onRetry={analytics.reload} />}

      {nothingYet ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="No orders in this period"
            description={`Nothing was placed in the last ${days} days. Try a longer period, or come back once orders start arriving.`}
          />
        </Card>
      ) : (
        <>
          {/* ── The headline ───────────────────────────────────────────── */}
          <Box className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="You earned"
              value={rupees(totals?.earnings ?? 0)}
              icon={Wallet}
              loading={analytics.loading}
              trend={(data?.series ?? []).map((row) => row.earnings)}
              footnote={
                totals ? `from ${rupees(totals.gross)} taken across the counter` : undefined
              }
            />
            <StatCard
              label="Orders delivered"
              value={String(totals?.delivered ?? 0)}
              icon={CheckCircle2}
              loading={analytics.loading}
              trend={(data?.series ?? []).map((row) => row.delivered)}
              footnote={totals ? `${totals.placed} placed in the period` : undefined}
            />
            <StatCard
              label="Average order"
              /* An em dash rather than ₹0 — nothing delivered is not the
                 same claim as an average of nothing. */
              value={totals?.averageOrder != null ? rupees(totals.averageOrder) : '—'}
              icon={Receipt}
              loading={analytics.loading}
              footnote="what reaches you, per delivered order"
            />
            <StatCard
              label="Fulfilment rate"
              value={totals?.fulfilmentRate != null ? percent(totals.fulfilmentRate * 100, 0) : '—'}
              icon={TrendingUp}
              loading={analytics.loading}
              footnote="of the orders that reached a conclusion"
            />
          </Box>

          {/* ── Over time ──────────────────────────────────────────────── */}
          <Card className="p-4">
            <Section title={`Earnings per day · last ${days} days`}>
              {earningsSeries.length > 0 && (
                <ColumnChart
                  data={earningsSeries}
                  caption={`What the kitchen earned each day over the last ${days} days, from delivered orders.`}
                  format={(v) => rupees(v)}
                  unit="₹"
                  /* A tick on every one of ninety days is unreadable, so
                     roughly eight are labelled however long the window is. */
                  xTick={(d, i, total) =>
                    i % Math.max(1, Math.ceil(total / 8)) === 0 ? d.label : null
                  }
                />
              )}
            </Section>
          </Card>

          <Card className="p-4">
            <Section title="Orders per day">
              {ordersSeries.length > 0 && (
                <ColumnChart
                  data={ordersSeries}
                  caption={`How many orders were placed each day over the last ${days} days, delivered or not.`}
                  height={150}
                  xTick={(d, i, total) =>
                    i % Math.max(1, Math.ceil(total / 8)) === 0 ? d.label : null
                  }
                />
              )}
            </Section>
          </Card>

          {/* ── When, and how it ends ──────────────────────────────────── */}
          <Box className="grid lg:grid-cols-2 gap-5 items-start">
            <Card className="p-4">
              <Section title="Busiest hours">
                {hourSeries.length ? (
                  <ColumnChart
                    data={hourSeries}
                    caption="When orders are placed, across the whole period. Only the hours this kitchen trades in are shown."
                    height={150}
                    xTick={(d, i, total) =>
                      i % Math.max(1, Math.ceil(total / 6)) === 0 ? d.label : null
                    }
                  />
                ) : (
                  <EmptyState icon={Clock3} title="No orders to place on a clock yet" />
                )}
              </Section>
            </Card>

            <Card className="p-4">
              <Section title="How orders ended">
                {outcomes.length ? (
                  <Donut
                    data={outcomes}
                    centerValue={String(totals?.placed ?? 0)}
                    centerLabel="orders"
                    caption="Every order placed in the period, by the state it ended in."
                  />
                ) : (
                  <EmptyState icon={Ban} title="Nothing to break down yet" />
                )}
              </Section>
            </Card>
          </Box>

          {/* ── What sells ─────────────────────────────────────────────── */}
          <Box className="grid lg:grid-cols-2 gap-5 items-start">
            <Card className="p-4">
              <Section title="Most ordered dishes">
                {dishesByQuantity.length ? (
                  <RankedBars
                    data={dishesByQuantity}
                    caption="Dishes by how many were sold across delivered orders."
                    unit="sold"
                    secondary={(_d, share) => `${percent(share * 100, 0)} of everything sold`}
                  />
                ) : (
                  <EmptyState icon={Flame} title="No dishes sold in this period" />
                )}
              </Section>
            </Card>

            <Card className="p-4">
              {/* The second list, and the reason it exists: a ₹30 filter
                  coffee can top the list on the left and be nowhere here. */}
              <Section title="Dishes that earn most">
                {dishesByRevenue.length ? (
                  <RankedBars
                    data={dishesByRevenue}
                    caption="The same dishes by what they took, which is frequently a different order."
                    format={(v) => rupees(v)}
                    unit="₹"
                    secondary={(_d, share) => `${percent(share * 100, 0)} of dish revenue`}
                  />
                ) : (
                  <EmptyState icon={Wallet} title="No dish revenue in this period" />
                )}
              </Section>
            </Card>
          </Box>

          {/* ── How they paid ──────────────────────────────────────────── */}
          {paymentMix.length > 0 && (
            <Card className="p-4">
              <Section title="How diners paid">
                <Box className="grid sm:grid-cols-2 gap-5 items-center">
                  <Donut
                    data={paymentMix}
                    centerValue={String(
                      (data?.payment.online.orders ?? 0) + (data?.payment.cash.orders ?? 0)
                    )}
                    centerLabel="delivered"
                    caption="Delivered orders by how the diner paid."
                  />
                  <Box className="space-y-2.5">
                    <Box className="flex items-baseline justify-between gap-4">
                      <Inline className="inline-flex items-center gap-1.5 text-sm text-ink-2">
                        <CreditCard className="size-3.5 text-ink-3" strokeWidth={1.75} />
                        Paid online
                      </Inline>
                      <Text className="text-sm text-ink tabular">
                        {rupees(data?.payment.online.earnings ?? 0)}
                      </Text>
                    </Box>
                    <Box className="flex items-baseline justify-between gap-4">
                      <Inline className="inline-flex items-center gap-1.5 text-sm text-ink-2">
                        <Wallet className="size-3.5 text-ink-3" strokeWidth={1.75} />
                        Cash
                      </Inline>
                      <Text className="text-sm text-ink tabular">
                        {rupees(data?.payment.cash.earnings ?? 0)}
                      </Text>
                    </Box>
                    {/* The split matters beyond curiosity — the two settle
                        differently, which is what the Earnings page is about. */}
                    <Text className="text-label text-ink-3 pt-1">
                      These settle differently. See Earnings for the breakdown.
                    </Text>
                  </Box>
                </Box>
              </Section>
            </Card>
          )}
        </>
      )}
    </Box>
  );
};
