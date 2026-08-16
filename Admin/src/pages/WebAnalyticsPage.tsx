import React, { useState } from 'react';
import {
  Activity,
  Clock,
  Compass,
  Eye,
  FileText,
  Gauge,
  MapPin,
  PieChart,
  RefreshCw,
  Repeat2,
  Smartphone,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  PageHeader,
  Skeleton,
  Table,
  TableSkeleton,
  Td,
  Th,
  Tr,
  cx,
} from '../components/ui';
import { ColumnChart, Donut, RankedBars } from '../components/charts';
import { StatCard } from '../components/dashboard/StatCard';
import { webAnalyticsService, type GaQuery } from '../api/services/webAnalyticsService';
import { useFetch } from '../lib/useFetch';
import { compactNumber, deltaPercent, duration, formatDate, formatDateTime, percent } from '../lib/format';
import type { GaOverviewMetrics, GaRangePreset, GaTrafficChannel, GaTrafficPoint } from '../api/types';

/* ── Date range control ───────────────────────────────────────────────── */

const PRESETS: Array<{ id: Exclude<GaRangePreset, 'custom'>; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

const RangeControl: React.FC<{ query: GaQuery; onChange: (q: GaQuery) => void }> = ({ query, onChange }) => {
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState(query.startDate || todayISO());
  const [customEnd, setCustomEnd] = useState(query.endDate || todayISO());

  return (
    <div className="relative">
      <div className="flex items-center gap-0.5 p-0.5 rounded-control bg-surface-inset">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setCustomOpen(false);
              onChange({ range: p.id });
            }}
            aria-pressed={query.range === p.id}
            className={cx(
              'h-7 px-2.5 rounded-[6px] text-label transition-colors',
              query.range === p.id ? 'bg-surface text-ink shadow-[var(--shadow-sm)]' : 'text-ink-3 hover:text-ink'
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setCustomOpen((v) => !v)}
          aria-pressed={query.range === 'custom'}
          className={cx(
            'h-7 px-2.5 rounded-[6px] text-label transition-colors',
            query.range === 'custom' ? 'bg-surface text-ink shadow-[var(--shadow-sm)]' : 'text-ink-3 hover:text-ink'
          )}
        >
          Custom
        </button>
      </div>

      {customOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCustomOpen(false)} aria-hidden />
          <div className="absolute right-0 top-9 z-50 w-72 p-3.5 bg-surface border border-line rounded-panel shadow-[var(--shadow-lg)] anim-fade-up space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start date">
                <Input
                  type="date"
                  value={customStart}
                  max={customEnd}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </Field>
              <Field label="End date">
                <Input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  max={todayISO()}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </Field>
            </div>
            <Button
              variant="primary"
              size="sm"
              className="w-full justify-center"
              onClick={() => {
                onChange({ range: 'custom', startDate: customStart, endDate: customEnd });
                setCustomOpen(false);
              }}
            >
              Apply range
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

/* ── Static lookups ───────────────────────────────────────────────────── */

const OVERVIEW_CARDS: Array<{
  key: keyof GaOverviewMetrics;
  label: string;
  icon: React.ElementType;
  format: (v: number) => string;
}> = [
  { key: 'totalUsers', label: 'Total users', icon: Users, format: compactNumber },
  { key: 'activeUsers', label: 'Active users', icon: Activity, format: compactNumber },
  { key: 'newUsers', label: 'New users', icon: UserPlus, format: compactNumber },
  { key: 'sessions', label: 'Sessions', icon: Repeat2, format: compactNumber },
  { key: 'screenPageViews', label: 'Page views', icon: Eye, format: compactNumber },
  { key: 'engagementRate', label: 'Engagement rate', icon: Gauge, format: (v) => percent(v, 1) },
  { key: 'avgEngagementTime', label: 'Avg. engagement time', icon: Clock, format: (v) => duration(v) },
  { key: 'eventCount', label: 'Event count', icon: Zap, format: compactNumber },
];

const TRAFFIC_METRICS: Array<{ id: keyof Omit<GaTrafficPoint, 'date'>; label: string; unit: string }> = [
  { id: 'totalUsers', label: 'Users', unit: ' users' },
  { id: 'sessions', label: 'Sessions', unit: ' sessions' },
  { id: 'newUsers', label: 'New users', unit: ' new users' },
  { id: 'screenPageViews', label: 'Page views', unit: ' views' },
];

const CHANNEL_COLOR: Record<GaTrafficChannel, string> = {
  'Organic Search': 'var(--chart-good)',
  Direct: 'var(--chart-series)',
  Referral: 'var(--chart-warning)',
  Social: 'var(--chart-serious)',
  Paid: 'var(--chart-critical)',
  Other: 'var(--chart-neutral)',
};

const DEVICE_COLOR: Record<string, string> = {
  desktop: 'var(--chart-series)',
  mobile: 'var(--chart-good)',
  tablet: 'var(--chart-warning)',
};
const OTHER_DEVICE_COLORS = ['var(--chart-serious)', 'var(--chart-critical)', 'var(--chart-neutral)'];
const deviceColor = (category: string, i: number) =>
  DEVICE_COLOR[category.toLowerCase()] || OTHER_DEVICE_COLORS[i % OTHER_DEVICE_COLORS.length];

const titleCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const eventLabel = (name: string) => titleCase(name.replace(/_/g, ' '));

/** Label every ~6th point so the axis stays readable across 7–90 days. */
const spacedTick = (dates: string[]) => (_: unknown, i: number, total: number): string | null => {
  const step = Math.ceil(total / 6);
  if (i !== total - 1 && i % step !== 0) return '';
  return formatDate(dates[i]);
};

/* ── Page ──────────────────────────────────────────────────────────────── */

export const WebAnalyticsPage: React.FC = () => {
  const [query, setQuery] = useState<GaQuery>({ range: '7d' });
  const [trafficMetric, setTrafficMetric] = useState<(typeof TRAFFIC_METRICS)[number]['id']>('totalUsers');

  const overview = useFetch(() => webAnalyticsService.getOverview(query), [query]);
  const traffic = useFetch(() => webAnalyticsService.getTraffic(query), [query]);
  const pages = useFetch(() => webAnalyticsService.getPages(query, 8), [query]);
  const users = useFetch(() => webAnalyticsService.getUsers(query), [query]);
  const events = useFetch(() => webAnalyticsService.getEvents(query, 8), [query]);

  const busy = [overview, traffic, pages, users, events];
  const anyLoading = busy.some((b) => b.loading);
  const anyRefreshing = busy.some((b) => b.refreshing);

  const reloadAll = () => busy.forEach((b) => b.reload());

  // A misconfigured or unreachable GA4 property fails every tile alike — one
  // clear message beats five identical error boxes.
  const pageError = overview.error;

  const t = traffic.data;
  const trafficHasData = (t?.timeseries ?? []).some((p) => p.totalUsers > 0 || p.sessions > 0 || p.screenPageViews > 0);
  const sourcesHasData = (t?.sources ?? []).some((s) => s.sessions > 0);

  const u = users.data;
  const devicesHasData = (u?.devices ?? []).some((d) => d.totalUsers > 0);
  const browsersHasData = (u?.browsers ?? []).some((b) => b.totalUsers > 0);
  const countriesHasData = (u?.countries ?? []).some((c) => c.totalUsers > 0);

  const eventsHasData = (events.data?.events ?? []).length > 0;

  const activeMetric = TRAFFIC_METRICS.find((m) => m.id === trafficMetric)!;
  const dates = (t?.timeseries ?? []).map((p) => p.date);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Website"
        title="Web Analytics"
        description={
          overview.data
            ? `${overview.data.range.label} · ${formatDate(overview.data.range.startDate)} – ${formatDate(overview.data.range.endDate)} · via Google Analytics 4`
            : 'Traffic, engagement and audience data from Google Analytics 4.'
        }
        actions={
          <>
            <RangeControl query={query} onChange={setQuery} />
            <IconButton icon={RefreshCw} label="Reload analytics" onClick={reloadAll} spinning={anyRefreshing || anyLoading} />
          </>
        }
      />

      {pageError ? (
        <ErrorState message={pageError} onRetry={reloadAll} />
      ) : (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {OVERVIEW_CARDS.map(({ key, label, icon, format }) => (
              <StatCard
                key={key}
                loading={overview.loading}
                label={label}
                icon={icon}
                value={overview.data ? format(overview.data.current[key]) : '—'}
                delta={overview.data ? deltaPercent(overview.data.current[key], overview.data.previous[key]) : null}
                deltaLabel="vs previous period"
              />
            ))}
          </div>

          {/* Traffic over time + sources */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Traffic over time"
                description={`${activeMetric.label} per day`}
                icon={TrendingUp}
                action={
                  <div className="flex items-center gap-0.5 p-0.5 rounded-control bg-surface-inset">
                    {TRAFFIC_METRICS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setTrafficMetric(m.id)}
                        aria-pressed={trafficMetric === m.id}
                        className={cx(
                          'h-7 px-2.5 rounded-[6px] text-label transition-colors whitespace-nowrap',
                          trafficMetric === m.id
                            ? 'bg-surface text-ink shadow-[var(--shadow-sm)]'
                            : 'text-ink-3 hover:text-ink'
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                }
              />
              <div className="mt-5">
                {traffic.loading ? (
                  <Skeleton className="h-45 w-full" />
                ) : trafficHasData ? (
                  <ColumnChart
                    data={(t?.timeseries ?? []).map((p) => ({ label: formatDate(p.date), value: p[trafficMetric] }))}
                    xTick={spacedTick(dates)}
                    caption={`${activeMetric.label} per day`}
                    unit={activeMetric.unit}
                    height={200}
                  />
                ) : (
                  <EmptyState icon={TrendingUp} title="No traffic in this window" description="Widen the date range to see earlier activity." />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Traffic sources" description="Sessions by channel" icon={PieChart} />
              <div className="mt-5">
                {traffic.loading ? (
                  <Skeleton className="h-37 w-full" />
                ) : sourcesHasData ? (
                  <Donut
                    data={(t?.sources ?? []).map((s) => ({ label: s.channel, value: s.sessions, color: CHANNEL_COLOR[s.channel] }))}
                    centerValue={compactNumber((t?.sources ?? []).reduce((sum, s) => sum + s.sessions, 0))}
                    centerLabel="Sessions"
                    caption="Sessions by traffic source"
                    size={132}
                  />
                ) : (
                  <EmptyState icon={PieChart} title="No sessions recorded" />
                )}
              </div>
            </Card>
          </div>

          {/* Top pages */}
          <Card padded={false}>
            <div className="p-5 pb-4">
              <CardHeader title="Top pages" description="Most-viewed pages in this window" icon={FileText} />
            </div>
            {pages.error ? (
              <div className="px-5 pb-5">
                <ErrorState message={pages.error} onRetry={pages.reload} />
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Page</Th>
                    <Th className="text-right">Views</Th>
                    <Th className="text-right">Users</Th>
                    <Th className="text-right">Avg. time</Th>
                  </tr>
                </thead>
                <tbody>
                  {pages.loading ? (
                    <TableSkeleton cols={4} rows={6} />
                  ) : !pages.data?.pages.length ? (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState icon={FileText} title="No page views in this window" description="Pages appear once Google Analytics records views for them." />
                      </td>
                    </tr>
                  ) : (
                    pages.data.pages.map((p) => (
                      <Tr key={p.pagePath}>
                        <Td className="max-w-72">
                          <p className="text-ink font-medium truncate">{p.pageTitle}</p>
                          <p className="text-label text-ink-3 truncate mt-0.5">{p.pagePath}</p>
                        </Td>
                        <Td className="text-right tabular">{compactNumber(p.screenPageViews)}</Td>
                        <Td className="text-right tabular">{compactNumber(p.totalUsers)}</Td>
                        <Td className="text-right tabular">{duration(p.avgEngagementTime)}</Td>
                      </Tr>
                    ))
                  )}
                </tbody>
              </Table>
            )}
          </Card>

          {/* Devices, browsers, geography */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader title="Devices" description="Sessions by device category" icon={Smartphone} />
              <div className="mt-5">
                {users.loading ? (
                  <Skeleton className="h-37 w-full" />
                ) : devicesHasData ? (
                  <Donut
                    data={(u?.devices ?? []).map((d, i) => ({
                      label: titleCase(d.category),
                      value: d.totalUsers,
                      color: deviceColor(d.category, i),
                    }))}
                    centerValue={compactNumber((u?.devices ?? []).reduce((sum, d) => sum + d.totalUsers, 0))}
                    centerLabel="Users"
                    caption="Users by device category"
                    size={132}
                  />
                ) : (
                  <EmptyState icon={Smartphone} title="No device data" />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Browsers" description="Top browsers by users" icon={Compass} />
              <div className="mt-5">
                {users.loading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : browsersHasData ? (
                  <RankedBars
                    data={(u?.browsers ?? []).map((b) => ({ label: b.browser, value: b.totalUsers }))}
                    caption="Users by browser"
                    unit=" users"
                  />
                ) : (
                  <EmptyState icon={Compass} title="No browser data" />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Geography" description="Top countries by users" icon={MapPin} />
              <div className="mt-5">
                {users.loading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : countriesHasData ? (
                  <RankedBars
                    data={(u?.countries ?? []).map((c) => ({ label: c.country, value: c.totalUsers }))}
                    secondary={(d) => {
                      const country = u?.countries.find((c) => c.country === d.label);
                      return country ? `· ${compactNumber(country.sessions)} sessions` : '';
                    }}
                    caption="Users by country"
                    unit=" users"
                  />
                ) : (
                  <EmptyState icon={MapPin} title="No geography data" />
                )}
              </div>
            </Card>
          </div>

          {/* Events */}
          <Card>
            <CardHeader title="Top events" description="Most frequent GA4 events in this window" icon={Zap} />
            <div className="mt-5">
              {events.loading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : events.error ? (
                <ErrorState message={events.error} onRetry={events.reload} />
              ) : eventsHasData ? (
                <RankedBars
                  data={(events.data?.events ?? []).map((e) => ({ label: eventLabel(e.eventName), value: e.eventCount }))}
                  caption="Events by count"
                  unit=" events"
                />
              ) : (
                <EmptyState icon={Zap} title="No events recorded" description="Events appear once Google Analytics receives them from the site." />
              )}
            </div>
          </Card>

          {overview.data && (
            <p className="text-label text-ink-3 text-center">
              Data from Google Analytics 4 · refreshed {formatDateTime(overview.data.generatedAt)}
            </p>
          )}
        </>
      )}
    </div>
  );
};
