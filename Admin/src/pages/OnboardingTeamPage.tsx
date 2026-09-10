import React, { useMemo, useState } from 'react';
import { Briefcase, Building2, RefreshCw, X } from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import { Card } from '../components/common/atoms/Card';
import { IconButton } from '../components/common/atoms/IconButton';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { cx, filterBySearch } from '../components/common/utils';
import { insightsService } from '../api/services/insightsService';
import { verificationService } from '../api/services/verificationService';
import { useFetch } from '../lib/useFetch';
import { propertyCategoryLabel, verificationMeta } from '../lib/domain';
import { formatDate, formatDateTime, percent } from '../lib/format';
import type { OnboarderEntity } from '../api/types';
import { Aside } from '../components/common/atoms/Aside';
import { Box } from '../components/common/atoms/Box';
import { Heading } from '../components/common/atoms/Heading';
import { Inline } from '../components/common/atoms/Inline';
import { PlainTd, PlainTr, TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Region } from '../components/common/atoms/Region';
import { Text } from '../components/common/atoms/Text';

interface OnboardingTeamPageProps {
  search: string;
}

export const OnboardingTeamPage: React.FC<OnboardingTeamPageProps> = ({ search }) => {
  const [selected, setSelected] = useState<OnboarderEntity | null>(null);

  const { data, loading, error, refreshing, reload } = useFetch(() => insightsService.getOnboarders(), []);

  const rows = useMemo(
    () => filterBySearch(data ?? [], search, (o, q) => o.employeeEmail.toLowerCase().includes(q)),
    [data, search]
  );

  const summary = useMemo(() => {
    const list = data ?? [];
    const totals = list.reduce(
      (acc, o) => {
        acc.onboards += o.total;
        acc.verified += o.verified;
        acc.pending += o.pending;
        acc.terminal += o.verified + o.rejected + o.failed + o.expired;
        return acc;
      },
      { onboards: 0, verified: 0, pending: 0, terminal: 0 }
    );
    return {
      employees: list.length,
      onboards: totals.onboards,
      pending: totals.pending,
      successRate: totals.terminal > 0 ? (totals.verified / totals.terminal) * 100 : null,
    };
  }, [data]);

  // The employee's full history — every onboarding attempt, not just the
  // counts already on the row. Loaded lazily, only once a row is opened.
  const detail = useFetch(
    () =>
      selected
        ? verificationService.getVerifications({ employeeEmail: selected.employeeEmail })
        : Promise.resolve({ data: [], success: true, status: 200, timestamp: new Date().toISOString() }),
    [selected?.employeeEmail]
  );

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="Records"
        title="Onboarding Team"
        description="Every employee who has onboarded a property, with their full funnel — not just the ones that ended up verified. Sourced from the verificationrequests collection, the only place an onboarding attempt is recorded regardless of outcome."
        actions={
          <IconButton icon={RefreshCw} label="Reload onboarding team" onClick={reload} spinning={refreshing || loading} />
        }
      />

      <Box className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Employees onboarding', value: summary.employees, tone: 'text-ink' },
          { label: 'Total onboards', value: summary.onboards, tone: 'text-ink' },
          { label: 'Awaiting an outcome', value: summary.pending, tone: 'text-warn' },
          {
            label: 'Overall success rate',
            value: summary.successRate === null ? '—' : percent(summary.successRate, 0),
            tone: 'text-good',
          },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <Text className="text-label text-ink-2">{s.label}</Text>
            <Text className={cx('text-metric figure mt-2', s.tone)}>{loading ? '—' : s.value}</Text>
          </Card>
        ))}
      </Box>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <Card padded={false}>
          <Table>
            <TableHead>
              <PlainTr>
                <Th>Employee</Th>
                <Th className="text-right">Onboards</Th>
                <Th className="text-right">Verified</Th>
                <Th className="text-right">Pending</Th>
                <Th className="text-right">Rejected</Th>
                <Th className="text-right">Success rate</Th>
                <Th>Last onboarded</Th>
              </PlainTr>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableSkeleton cols={7} />
              ) : !rows.length ? (
                <PlainTr>
                  <PlainTd colSpan={7}>
                    <EmptyState
                      icon={Briefcase}
                      title={search ? 'No matching employees' : 'No onboarding activity yet'}
                      description={
                        search
                          ? 'Try a different search.'
                          : 'Rows appear here once an employee submits their first property for onboarding.'
                      }
                    />
                  </PlainTd>
                </PlainTr>
              ) : (
                rows.map((o) => (
                  <Tr key={o.employeeEmail} className="cursor-pointer" onClick={() => setSelected(o)}>
                    <Td>
                      <Inline className="text-sm font-medium text-ink hover:text-brand-ink transition-colors">
                        {o.employeeEmail}
                      </Inline>
                    </Td>
                    <Td className="text-right tabular">{o.total}</Td>
                    <Td className="text-right tabular text-good">{o.verified}</Td>
                    <Td className="text-right tabular text-warn">{o.pending}</Td>
                    <Td className="text-right tabular text-crit">{o.rejected}</Td>
                    <Td className="text-right tabular">{o.successRate === null ? '—' : percent(o.successRate, 0)}</Td>
                    <Td className="tabular">{formatDate(o.lastOnboardedAt)}</Td>
                  </Tr>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Detail drawer — this employee's full onboarding history */}
      {selected && (
        <>
          <Box
            className="fixed inset-0 z-40 bg-[rgb(9_12_20/0.45)] backdrop-blur-[2px]"
            onClick={() => setSelected(null)}
            aria-hidden
          />
          <Aside
            role="dialog"
            aria-label="Employee onboarding detail"
            className="fixed top-0 bottom-0 right-0 z-50 w-full max-w-lg bg-surface border-l border-line flex flex-col anim-slide-left"
          >
            <Box className="h-14 px-4 border-b border-line flex items-center justify-between gap-3 shrink-0">
              <Box className="min-w-0">
                <Heading level={2} className="text-section text-ink truncate">{selected.employeeEmail}</Heading>
                <Text className="text-label text-ink-3">Onboarding history</Text>
              </Box>
              <IconButton icon={X} label="Close" onClick={() => setSelected(null)} />
            </Box>

            <Box className="flex-1 overflow-y-auto p-4 space-y-5">
              <Box className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total', value: selected.total, tone: 'text-ink' },
                  { label: 'Verified', value: selected.verified, tone: 'text-good' },
                  { label: 'Pending', value: selected.pending, tone: 'text-warn' },
                  { label: 'Rejected', value: selected.rejected, tone: 'text-crit' },
                ].map((s) => (
                  <Box key={s.label} className="p-2.5 rounded-control bg-surface-inset border border-line text-center">
                    <Text className={cx('text-section figure', s.tone)}>{s.value}</Text>
                    <Text className="text-micro uppercase text-ink-3 mt-0.5">{s.label}</Text>
                  </Box>
                ))}
              </Box>

              <Region>
                <Heading level={3} className="text-micro uppercase text-ink-3 mb-2 flex items-center gap-1.5">
                  <Building2 className="size-3" strokeWidth={2} /> Onboarding attempts
                </Heading>

                {detail.loading ? (
                  <Text className="text-sm text-ink-3">Loading…</Text>
                ) : !detail.data?.length ? (
                  <Text className="text-sm text-ink-3">No attempts on record.</Text>
                ) : (
                  <Box className="space-y-2">
                    {detail.data.map((v) => {
                      const meta = verificationMeta(v.status);
                      return (
                        <Box
                          key={v.id}
                          className="p-3 rounded-control border border-line flex items-start justify-between gap-3"
                        >
                          <Box className="min-w-0">
                            <Text className="text-sm font-medium text-ink truncate">
                              {v.property?.name || 'Untitled property'}
                            </Text>
                            <Text className="text-label text-ink-3 truncate">
                              {v.property ? `${propertyCategoryLabel(v.property.category)} · ${v.property.place}` : v.ownerMobileE164}
                            </Text>
                            <Text className="text-label text-ink-3 mt-1">{formatDateTime(v.createdAt)}</Text>
                          </Box>
                          <Badge tone={meta.tone} icon={meta.icon} className="shrink-0">
                            {meta.label}
                          </Badge>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Region>
            </Box>
          </Aside>
        </>
      )}
    </Box>
  );
};
