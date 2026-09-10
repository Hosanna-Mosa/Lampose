import React, { useMemo } from 'react';
import {
  ArrowRight,
  Building2,
  IndianRupee,
  MapPin,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  UserCog,
} from 'lucide-react';
import { StatCard } from '../components/common/molecules/StatCard';
import { ColumnChart } from '../components/common/organisms/ColumnChart';
import { Donut } from '../components/common/organisms/Donut';
import { RankedBars } from '../components/common/organisms/RankedBars';
import { Badge } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { IconButton } from '../components/common/atoms/IconButton';
import { Skeleton } from '../components/common/atoms/Skeleton';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { CardHeader } from '../components/common/molecules/CardHeader';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { insightsService } from '../api/services/insightsService';
import { propertyService } from '../api/services/propertyService';
import { useFetch } from '../lib/useFetch';
import { compactNumber, deltaPercent, formatDate, percent, rupees } from '../lib/format';
import { categoryHue, propertyCategoryLabel, verificationMeta } from '../lib/domain';
import { useAuth } from '../context/AuthContext';
import { Box } from '../components/common/atoms/Box';
import { PlainTd, PlainTr, TableBody, TableHead } from '../components/common/atoms/PlainTable';

interface DashboardProps {
  setActiveTab: (tab: string) => void;
}

/** Label every ~7th day so the axis stays readable at 30 points. */
const dayTick = (date: string, i: number, total: number): string | null => {
  const step = Math.ceil(total / 5);
  if (i !== total - 1 && i % step !== 0) return '';
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const Dashboard: React.FC<DashboardProps> = ({ setActiveTab }) => {
  const { user } = useAuth();
  const stats = useFetch(() => insightsService.getStats(30), []);
  const recent = useFetch(() => propertyService.getProperties(), []);

  const s = stats.data;

  const trendValues = useMemo(() => s?.properties.trend.map((t) => t.count) ?? [], [s]);

  const categoryData = useMemo(
    () =>
      (s?.properties.byCategory ?? []).map((c, i) => ({
        label: c.label,
        value: c.count,
        color: categoryHue(c.label, i),
      })),
    [s]
  );

  const verificationData = useMemo(
    () =>
      (s?.verifications.byStatus ?? []).map((v) => ({
        label: verificationMeta(v.label).label,
        value: v.count,
        color: verificationMeta(v.label).chartColor,
      })),
    [s]
  );

  const propertyDelta = s
    ? deltaPercent(s.properties.addedInWindow, s.properties.addedInPreviousWindow)
    : null;

  const recentProperties = (recent.data ?? []).slice(0, 6);

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow={`Signed in as ${user?.role ?? 'Administrator'}`}
        title={`Welcome back, ${user?.name?.split(' ')[0] ?? 'there'}`}
        description="Live figures from the Lampose onboarding database — properties, owner verifications and administrator accounts."
        actions={
          <>
            <IconButton
              icon={RefreshCw}
              label="Refresh dashboard"
              onClick={() => {
                stats.reload();
                recent.reload();
              }}
              spinning={stats.refreshing || stats.loading}
            />
            <Button variant="primary" icon={Building2} onClick={() => setActiveTab('properties')}>
              Manage properties
            </Button>
          </>
        }
      />

      {stats.error ? (
        <ErrorState message={stats.error} onRetry={stats.reload} />
      ) : (
        <>
          {/* Key figures */}
          <Box className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              loading={stats.loading}
              label="Properties onboarded"
              value={compactNumber(s?.properties.total ?? 0)}
              delta={propertyDelta}
              deltaLabel={`${s?.properties.addedInWindow ?? 0} in the last 30 days`}
              icon={Building2}
              trend={trendValues}
            />
            <StatCard
              loading={stats.loading}
              label="Owner verifications"
              value={compactNumber(s?.verifications.total ?? 0)}
              footnote={
                s?.verifications.successRate === null
                  ? 'No request has completed yet'
                  : `${percent(s?.verifications.successRate ?? null, 0)} verified successfully`
              }
              icon={ShieldCheck}
            />
            <StatCard
              loading={stats.loading}
              label="Average monthly rent"
              value={rupees(s?.properties.rent.average ?? 0, true)}
              footnote={
                s
                  ? `Range ${rupees(s.properties.rent.min, true)} – ${rupees(s.properties.rent.max, true)}`
                  : undefined
              }
              icon={IndianRupee}
            />
            <StatCard
              loading={stats.loading}
              label="Administrator accounts"
              value={compactNumber(s?.admins.total ?? 0)}
              footnote={`${s?.admins.active ?? 0} active`}
              icon={UserCog}
            />
          </Box>

          {/* Trend + composition */}
          <Box className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Onboarding activity"
                description="Properties added per day over the last 30 days"
                icon={TrendingUp}
                action={
                  s && (
                    <Badge tone="brand">
                      {s.properties.addedInWindow} added
                    </Badge>
                  )
                }
              />
              <Box className="mt-5">
                {stats.loading ? (
                  <Skeleton className="h-45 w-full" />
                ) : trendValues.some((v) => v > 0) ? (
                  <ColumnChart
                    data={(s?.properties.trend ?? []).map((t) => ({
                      label: formatDate(t.date),
                      value: t.count,
                    }))}
                    xTick={(_, i, total) => dayTick(s!.properties.trend[i].date, i, total)}
                    caption="Properties onboarded per day over the last 30 days"
                    unit=" properties"
                    height={180}
                  />
                ) : (
                  <EmptyState
                    icon={TrendingUp}
                    title="No properties added in this window"
                    description="Onboardings from the last 30 days will be plotted here."
                  />
                )}
              </Box>
            </Card>

            <Card>
              <CardHeader title="Property mix" description="Share by category" icon={Building2} />
              <Box className="mt-5">
                {stats.loading ? (
                  <Skeleton className="h-37 w-full" />
                ) : categoryData.length ? (
                  <Donut
                    data={categoryData}
                    centerValue={compactNumber(s?.properties.total ?? 0)}
                    centerLabel="Total"
                    caption="Properties by category"
                    size={132}
                  />
                ) : (
                  <EmptyState icon={Building2} title="No properties yet" />
                )}
              </Box>
            </Card>
          </Box>

          {/* Locations + verification outcomes */}
          <Box className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader
                title="Top locations"
                description="Where listings are concentrated"
                icon={MapPin}
              />
              <Box className="mt-5">
                {stats.loading ? (
                  <Box className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </Box>
                ) : s?.properties.topPlaces.length ? (
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
              </Box>
            </Card>

            <Card>
              <CardHeader
                title="Verification outcomes"
                description="Owner confirmation requests by state"
                icon={ShieldCheck}
                action={
                  <Button size="sm" variant="ghost" onClick={() => setActiveTab('verifications')}>
                    View all <ArrowRight className="size-3.5" />
                  </Button>
                }
              />
              <Box className="mt-5">
                {stats.loading ? (
                  <Box className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </Box>
                ) : verificationData.length ? (
                  <RankedBars
                    data={verificationData}
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
              </Box>
            </Card>
          </Box>
        </>
      )}

      {/* Latest records */}
      <Card padded={false}>
        <Box className="p-5 pb-4">
          <CardHeader
            title="Latest properties"
            description="Most recent entries in the properties collection"
            icon={Building2}
            action={
              <Button size="sm" variant="secondary" onClick={() => setActiveTab('properties')}>
                View all <ArrowRight className="size-3.5" />
              </Button>
            }
          />
        </Box>

        {recent.error ? (
          <Box className="px-5 pb-5">
            <ErrorState message={recent.error} onRetry={recent.reload} />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <PlainTr>
                <Th>Property</Th>
                <Th>Category</Th>
                <Th>Location</Th>
                <Th className="text-right">Monthly rent</Th>
                <Th>Onboarded</Th>
              </PlainTr>
            </TableHead>
            <TableBody>
              {recent.loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <PlainTr key={i} className="border-b border-line last:border-0">
                    {Array.from({ length: 5 }).map((__, c) => (
                      <PlainTd key={c} className="px-4 py-3.5 first:pl-5 last:pr-5">
                        <Skeleton className={`h-3.5 ${c === 0 ? 'w-44' : 'w-20'}`} />
                      </PlainTd>
                    ))}
                  </PlainTr>
                ))
              ) : !recentProperties.length ? (
                <PlainTr>
                  <PlainTd colSpan={5}>
                    <EmptyState
                      icon={Building2}
                      title="No properties yet"
                      description="Listings onboarded through the field app will appear here."
                    />
                  </PlainTd>
                </PlainTr>
              ) : (
                recentProperties.map((p) => (
                  <Tr key={p.id}>
                    <Td className="text-ink font-medium max-w-56 truncate">{p.name}</Td>
                    <Td>
                      <Badge tone="neutral">{propertyCategoryLabel(p.category)}</Badge>
                    </Td>
                    <Td className="max-w-48 truncate">{p.place || '—'}</Td>
                    <Td className="text-right text-ink tabular">{rupees(p.rent)}</Td>
                    <Td className="tabular">{formatDate(p.createdAt)}</Td>
                  </Tr>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </Box>
  );
};
