import React, { useMemo, useState } from 'react';
import {
  BedDouble,
  Building2,
  CalendarRange,
  IndianRupee,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  Skeleton,
  cx,
} from '../components/ui';
import { ColumnChart, Donut, RankedBars } from '../components/charts';
import { insightsService } from '../api/services/insightsService';
import { useFetch } from '../lib/useFetch';
import { compactNumber, formatDate, formatDateTime, percent, rupees } from '../lib/format';
import { categoryHue, stayTypeHue, verificationMeta } from '../lib/domain';

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export const AnalyticsPage: React.FC = () => {
  const [days, setDays] = useState(30);
  const { data: s, loading, error, refreshing, reload } = useFetch(
    () => insightsService.getStats(days),
    [days]
  );

  const categoryData = useMemo(
    () =>
      (s?.properties.byCategory ?? []).map((c, i) => ({
        label: c.label,
        value: c.count,
        color: categoryHue(c.label, i),
      })),
    [s]
  );

  const stayTypeData = useMemo(
    () =>
      (s?.properties.byStayType ?? []).map((c, i) => ({
        label: c.label,
        value: c.count,
        color: stayTypeHue(c.label, i),
      })),
    [s]
  );

  const trendHasData = (s?.properties.trend ?? []).some((t) => t.count > 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Overview"
        title="Analytics"
        description="Portfolio composition, onboarding pace and verification performance across the database."
        actions={
          <>
            {/* Time-range control — one row, above the charts */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-control bg-surface-inset">
              {WINDOWS.map((w) => (
                <button
                  key={w.days}
                  onClick={() => setDays(w.days)}
                  aria-pressed={days === w.days}
                  className={cx(
                    'h-7 px-2.5 rounded-[6px] text-label transition-colors',
                    days === w.days
                      ? 'bg-surface text-ink shadow-[var(--shadow-sm)]'
                      : 'text-ink-3 hover:text-ink'
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <IconButton
              icon={RefreshCw}
              label="Reload analytics"
              onClick={reload}
              spinning={refreshing || loading}
            />
          </>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-panel" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-72 w-full rounded-panel" />
            <Skeleton className="h-72 w-full rounded-panel" />
          </div>
        </div>
      ) : !s ? null : (
        <>
          {/* Portfolio value — the one hero figure on this view */}
          <Card>
            <div className="flex flex-col lg:flex-row lg:items-center gap-6">
              <div className="lg:border-r lg:border-line lg:pr-8">
                <p className="text-label text-ink-2">Combined monthly rent across the portfolio</p>
                <p className="text-hero text-ink figure mt-1.5">
                  {rupees(s.properties.rent.portfolioMonthly)}
                </p>
                <p className="text-sm text-ink-3 mt-1.5">
                  Across {s.properties.total} propert{s.properties.total === 1 ? 'y' : 'ies'}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 flex-1">
                {[
                  { label: 'Average rent', value: rupees(s.properties.rent.average), icon: IndianRupee },
                  { label: 'Lowest rent', value: rupees(s.properties.rent.min), icon: IndianRupee },
                  { label: 'Highest rent', value: rupees(s.properties.rent.max), icon: IndianRupee },
                  {
                    label: 'Average deposit',
                    value: rupees(s.properties.rent.averageDeposit),
                    icon: IndianRupee,
                  },
                ].map((m) => (
                  <div key={m.label}>
                    <p className="text-label text-ink-3">{m.label}</p>
                    <p className="text-section text-ink tabular mt-1">{m.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Onboarding pace */}
          <Card>
            <CardHeader
              title="Onboarding pace"
              description={`Properties added per day over the last ${days} days`}
              icon={CalendarRange}
              action={
                <span className="text-label text-ink-3 tabular">
                  {s.properties.addedInWindow} in window · {s.properties.addedInPreviousWindow} in the
                  previous {days} days
                </span>
              }
            />
            <div className="mt-5">
              {trendHasData ? (
                <ColumnChart
                  data={s.properties.trend.map((t) => ({ label: formatDate(t.date), value: t.count }))}
                  xTick={(_, i, total) => {
                    const step = Math.ceil(total / 6);
                    if (i !== total - 1 && i % step !== 0) return '';
                    return new Date(s.properties.trend[i].date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    });
                  }}
                  caption={`Properties onboarded per day over the last ${days} days`}
                  unit=" properties"
                  height={200}
                />
              ) : (
                <EmptyState
                  icon={CalendarRange}
                  title="No onboardings in this window"
                  description="Widen the time range to see earlier activity."
                  action={
                    days !== 90 && (
                      <Button size="sm" variant="secondary" onClick={() => setDays(90)}>
                        Show 90 days
                      </Button>
                    )
                  }
                />
              )}
            </div>
          </Card>

          {/* Composition */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="By category" description="Accommodation type mix" icon={Building2} />
              <div className="mt-5">
                {categoryData.length ? (
                  <Donut
                    data={categoryData}
                    centerValue={compactNumber(s.properties.total)}
                    centerLabel="Properties"
                    caption="Properties by category"
                  />
                ) : (
                  <EmptyState icon={Building2} title="No properties recorded" />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="By stay type" description="Short vs long stay inventory" icon={BedDouble} />
              <div className="mt-5">
                {stayTypeData.length ? (
                  <Donut
                    data={stayTypeData}
                    centerValue={compactNumber(s.properties.total)}
                    centerLabel="Properties"
                    caption="Properties by stay type"
                  />
                ) : (
                  <EmptyState icon={BedDouble} title="No stay types recorded" />
                )}
              </div>
            </Card>
          </div>

          {/* Geography & people */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader
                title="Locations"
                description="Where the portfolio is concentrated"
                icon={MapPin}
              />
              <div className="mt-5">
                {s.properties.topPlaces.length ? (
                  <RankedBars
                    data={s.properties.topPlaces.map((p) => ({
                      label: p.label || 'Unspecified',
                      value: p.count,
                    }))}
                    secondary={(d) => {
                      const place = s.properties.topPlaces.find((p) => p.label === d.label);
                      return place ? `· avg ${rupees(place.avgRent, true)}` : '';
                    }}
                    caption="Properties by location"
                    unit=" properties"
                  />
                ) : (
                  <EmptyState icon={MapPin} title="No locations recorded" />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Field agents"
                description="Properties onboarded per agent account"
                icon={UserCheck}
              />
              <div className="mt-5">
                {s.properties.topOnboarders.length ? (
                  <RankedBars
                    data={s.properties.topOnboarders.map((o) => ({ label: o.label, value: o.count }))}
                    caption="Properties onboarded per agent"
                    unit=" properties"
                  />
                ) : (
                  <EmptyState
                    icon={UserCheck}
                    title="No agent attribution recorded"
                    description="Listings created before agent tracking was added carry no employee email."
                  />
                )}
              </div>
            </Card>
          </div>

          {/* Verification performance */}
          <Card>
            <CardHeader
              title="Verification performance"
              description="Owner confirmation requests by outcome"
              icon={ShieldCheck}
              action={
                <span className="text-label text-ink-3">
                  {s.verifications.successRate === null
                    ? 'No completed requests yet'
                    : `${percent(s.verifications.successRate, 0)} success rate`}
                </span>
              }
            />
            <div className="mt-5">
              {s.verifications.byStatus.length ? (
                <RankedBars
                  data={s.verifications.byStatus.map((v) => ({
                    label: verificationMeta(v.label).label,
                    value: v.count,
                    color: verificationMeta(v.label).chartColor,
                  }))}
                  caption="Verification requests by status"
                  unit=" requests"
                />
              ) : (
                <EmptyState
                  icon={ShieldCheck}
                  title="No verification requests"
                  description="Requests appear once owners are sent a confirmation message."
                />
              )}
            </div>
          </Card>

          <p className="text-label text-ink-3 text-center">
            Computed {formatDateTime(s.generatedAt)} from the live database.
          </p>
        </>
      )}
    </div>
  );
};
