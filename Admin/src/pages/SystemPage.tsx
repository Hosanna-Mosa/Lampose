import React from 'react';
import { Activity, Cpu, Database, HardDrive, RefreshCw, Table2 } from 'lucide-react';
import {
  Badge,
  Card,
  CardHeader,
  DataRow,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
  cx,
} from '../components/ui';
import { RankedBars } from '../components/charts';
import { insightsService } from '../api/services/insightsService';
import { useFetch } from '../lib/useFetch';
import { bytes, compactNumber, duration, formatDateTime } from '../lib/format';

/** Simple utilisation meter — fill carries the value, track is a lighter step
 *  of the same ramp so state reads across the whole bar. */
const Meter: React.FC<{ used: number; total: number; label: string }> = ({ used, total, label }) => {
  const ratio = total > 0 ? Math.min(used / total, 1) : 0;
  const severity = ratio > 0.9 ? 'var(--chart-critical)' : ratio > 0.75 ? 'var(--chart-warning)' : 'var(--chart-series)';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-sm text-ink-2">{label}</span>
        <span className="text-sm text-ink tabular">
          {bytes(used)} <span className="text-ink-3">of {bytes(total)}</span>
        </span>
      </div>
      <div
        className="h-1.5 w-full rounded-pill overflow-hidden"
        style={{ background: 'var(--chart-series-wash)' }}
      >
        <div
          className="h-full rounded-pill transition-[width] duration-300"
          style={{ width: `${Math.max(ratio * 100, 2)}%`, background: severity }}
        />
      </div>
    </div>
  );
};

export const SystemPage: React.FC = () => {
  const { data, loading, error, refreshing, reload } = useFetch(() => insightsService.getSystem(), []);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Platform"
        title="System"
        description="Live database connectivity, collection sizes and API process telemetry."
        actions={
          <IconButton
            icon={RefreshCw}
            label="Reload telemetry"
            onClick={reload}
            spinning={refreshing || loading}
          />
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64 w-full rounded-panel" />
          <Skeleton className="h-64 w-full rounded-panel" />
        </div>
      ) : !data ? null : (
        <>
          {/* Connection banner */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  className={cx(
                    'grid place-items-center size-10 rounded-panel',
                    data.database.connected ? 'bg-good-soft text-good' : 'bg-crit-soft text-crit'
                  )}
                >
                  <Database className="size-5" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-section text-ink">{data.database.name}</p>
                  <p className="text-sm text-ink-3 font-mono break-all">{data.database.host}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge tone={data.database.connected ? 'good' : 'crit'} icon={Activity}>
                  {data.database.readyState}
                </Badge>
                <Badge tone="neutral">
                  {compactNumber(data.database.stats?.objects ?? 0)} documents
                </Badge>
                <Badge tone="neutral">{data.database.stats?.indexes ?? 0} indexes</Badge>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Collections */}
            <Card padded={false}>
              <div className="p-5 pb-4">
                <CardHeader
                  title="Collections"
                  description="Document counts in the connected database"
                  icon={Table2}
                />
              </div>
              {data.database.collections.length ? (
                <Table>
                  <thead>
                    <tr>
                      <Th>Collection</Th>
                      <Th className="text-right">Documents</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.database.collections.map((c) => (
                      <Tr key={c.name}>
                        <Td className="text-ink font-mono">{c.name}</Td>
                        <Td className="text-right text-ink tabular">
                          {c.documents.toLocaleString('en-IN')}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <EmptyState icon={Table2} title="No collections reported" />
              )}
            </Card>

            {/* Storage */}
            <Card>
              <CardHeader
                title="Storage"
                description="Space used by documents and indexes"
                icon={HardDrive}
              />
              <div className="mt-5">
                {data.database.stats ? (
                  <RankedBars
                    data={[
                      { label: 'Index size', value: data.database.stats.indexSizeBytes },
                      { label: 'Storage allocated', value: data.database.stats.storageSizeBytes },
                      { label: 'Document data', value: data.database.stats.dataSizeBytes },
                    ]}
                    format={bytes}
                    caption="Database storage breakdown"
                  />
                ) : (
                  <EmptyState icon={HardDrive} title="Storage statistics unavailable" />
                )}
              </div>
            </Card>
          </div>

          {/* Runtime */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="API process" description="Node.js runtime hosting the API" icon={Cpu} />
              <div className="mt-4">
                <DataRow label="Node version" value={data.runtime.node} mono />
                <DataRow label="Platform" value={data.runtime.platform} mono />
                <DataRow label="Process ID" value={data.runtime.pid} mono />
                <DataRow label="Uptime" value={duration(data.runtime.uptimeSeconds)} mono />
                <DataRow label="Resident memory" value={bytes(data.runtime.rssBytes)} mono />
              </div>
            </Card>

            <Card>
              <CardHeader title="Memory" description="V8 heap utilisation" icon={Activity} />
              <div className="mt-5 space-y-4">
                <Meter
                  used={data.runtime.heapUsedBytes}
                  total={data.runtime.heapTotalBytes}
                  label="Heap used"
                />
                <Meter
                  used={data.runtime.heapTotalBytes}
                  total={data.runtime.rssBytes}
                  label="Heap allocated of resident set"
                />
              </div>
            </Card>
          </div>

          <p className="text-label text-ink-3 text-center">
            Read {formatDateTime(data.generatedAt)} from the running API process.
          </p>
        </>
      )}
    </div>
  );
};
