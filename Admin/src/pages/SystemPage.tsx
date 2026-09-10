import React from 'react';
import { Activity, Cpu, Database, HardDrive, RefreshCw, Table2 } from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import { Card } from '../components/common/atoms/Card';
import { IconButton } from '../components/common/atoms/IconButton';
import { Skeleton } from '../components/common/atoms/Skeleton';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { CardHeader } from '../components/common/molecules/CardHeader';
import { DataRow } from '../components/common/molecules/DataRow';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { cx } from '../components/common/utils';
import { RankedBars } from '../components/common/organisms/RankedBars';
import { insightsService } from '../api/services/insightsService';
import { useFetch } from '../lib/useFetch';
import { bytes, compactNumber, duration, formatDateTime } from '../lib/format';

import { Meter } from '../components/system/molecules/Meter';
import { Box } from '../components/common/atoms/Box';
import { Inline } from '../components/common/atoms/Inline';
import { PlainTr, TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Text } from '../components/common/atoms/Text';

export const SystemPage: React.FC = () => {
  const { data, loading, error, refreshing, reload } = useFetch(() => insightsService.getSystem(), []);

  return (
    <Box className="space-y-5">
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
        <Box className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64 w-full rounded-panel" />
          <Skeleton className="h-64 w-full rounded-panel" />
        </Box>
      ) : !data ? null : (
        <>
          {/* Connection banner */}
          <Card>
            <Box className="flex flex-wrap items-center justify-between gap-4">
              <Box className="flex items-center gap-3">
                <Inline
                  className={cx(
                    'grid place-items-center size-10 rounded-panel',
                    data.database.connected ? 'bg-good-soft text-good' : 'bg-crit-soft text-crit'
                  )}
                >
                  <Database className="size-5" strokeWidth={1.75} />
                </Inline>
                <Box>
                  <Text className="text-section text-ink">{data.database.name}</Text>
                  <Text className="text-sm text-ink-3 font-mono break-all">{data.database.host}</Text>
                </Box>
              </Box>

              <Box className="flex items-center gap-2">
                <Badge tone={data.database.connected ? 'good' : 'crit'} icon={Activity}>
                  {data.database.readyState}
                </Badge>
                <Badge tone="neutral">
                  {compactNumber(data.database.stats?.objects ?? 0)} documents
                </Badge>
                <Badge tone="neutral">{data.database.stats?.indexes ?? 0} indexes</Badge>
              </Box>
            </Box>
          </Card>

          <Box className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Collections */}
            <Card padded={false}>
              <Box className="p-5 pb-4">
                <CardHeader
                  title="Collections"
                  description="Document counts in the connected database"
                  icon={Table2}
                />
              </Box>
              {data.database.collections.length ? (
                <Table>
                  <TableHead>
                    <PlainTr>
                      <Th>Collection</Th>
                      <Th className="text-right">Documents</Th>
                    </PlainTr>
                  </TableHead>
                  <TableBody>
                    {data.database.collections.map((c) => (
                      <Tr key={c.name}>
                        <Td className="text-ink font-mono">{c.name}</Td>
                        <Td className="text-right text-ink tabular">
                          {c.documents.toLocaleString('en-IN')}
                        </Td>
                      </Tr>
                    ))}
                  </TableBody>
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
              <Box className="mt-5">
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
              </Box>
            </Card>
          </Box>

          {/* Runtime */}
          <Box className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="API process" description="Node.js runtime hosting the API" icon={Cpu} />
              <Box className="mt-4">
                <DataRow label="Node version" value={data.runtime.node} mono />
                <DataRow label="Platform" value={data.runtime.platform} mono />
                <DataRow label="Process ID" value={data.runtime.pid} mono />
                <DataRow label="Uptime" value={duration(data.runtime.uptimeSeconds)} mono />
                <DataRow label="Resident memory" value={bytes(data.runtime.rssBytes)} mono />
              </Box>
            </Card>

            <Card>
              <CardHeader title="Memory" description="V8 heap utilisation" icon={Activity} />
              <Box className="mt-5 space-y-4">
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
              </Box>
            </Card>
          </Box>

          <Text className="text-label text-ink-3 text-center">
            Read {formatDateTime(data.generatedAt)} from the running API process.
          </Text>
        </>
      )}
    </Box>
  );
};
