import React, { useMemo, useState } from 'react';
import { Activity, Cpu, Database, HardDrive, RefreshCw, Table2 } from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { IconButton } from '../components/common/atoms/IconButton';
import { Skeleton } from '../components/common/atoms/Skeleton';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { CardHeader } from '../components/common/molecules/CardHeader';
import { DataRow } from '../components/common/molecules/DataRow';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { FilterBar } from '../components/common/molecules/FilterBar';
import { FilterChips } from '../components/common/molecules/FilterChips';
import { ResultCount } from '../components/common/molecules/ResultCount';
import { cx, filterBySearch } from '../components/common/utils';
import { RankedBars } from '../components/common/organisms/RankedBars';
import { insightsService } from '../api/services/insightsService';
import { useFetch } from '../lib/useFetch';
import { bytes, compactNumber, duration, formatDateTime } from '../lib/format';

import { Meter } from '../components/system/molecules/Meter';
import { Box } from '../components/common/atoms/Box';
import { Inline } from '../components/common/atoms/Inline';
import { PlainTr, TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Text } from '../components/common/atoms/Text';

type FillFilter = 'all' | 'filled' | 'empty';

export const SystemPage: React.FC = () => {
  const { data, loading, error, refreshing, reload } = useFetch(() => insightsService.getSystem(), []);

  /* The header search is off on this tab, so the collection list carries its
     own box — the database has enough collections that scanning for one by
     eye is slow. */
  const [collectionQuery, setCollectionQuery] = useState('');
  const [fill, setFill] = useState<FillFilter>('all');

  const allCollections = useMemo(() => data?.database.collections ?? [], [data]);
  const searched = useMemo(
    () => filterBySearch(allCollections, collectionQuery, (c, q) => c.name.toLowerCase().includes(q)),
    [allCollections, collectionQuery]
  );
  const fillCounts = useMemo(
    () => ({
      all: searched.length,
      filled: searched.filter((c) => c.documents > 0).length,
      empty: searched.filter((c) => c.documents === 0).length,
    }),
    [searched]
  );
  const collections = useMemo(
    () =>
      fill === 'all' ? searched : searched.filter((c) => (fill === 'empty' ? c.documents === 0 : c.documents > 0)),
    [searched, fill]
  );
  const clearCollectionFilters = () => {
    setCollectionQuery('');
    setFill('all');
  };

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
              {allCollections.length > 0 && (
                <Box className="px-5 pb-3">
                  <FilterBar
                    search={{
                      value: collectionQuery,
                      onChange: setCollectionQuery,
                      placeholder: 'Find a collection',
                    }}
                    summary={
                      <ResultCount
                        shown={collections.length}
                        total={allCollections.length}
                        noun="collections"
                        onClear={clearCollectionFilters}
                      />
                    }
                  >
                    <FilterChips
                      label="Documents"
                      value={fill}
                      onChange={setFill}
                      options={[
                        { id: 'all', label: 'All', count: fillCounts.all },
                        { id: 'filled', label: 'Has documents', count: fillCounts.filled, tone: 'good' },
                        { id: 'empty', label: 'Empty', count: fillCounts.empty, tone: 'warn' },
                      ]}
                    />
                  </FilterBar>
                </Box>
              )}
              {!allCollections.length ? (
                <EmptyState icon={Table2} title="No collections reported" />
              ) : !collections.length ? (
                <EmptyState
                  icon={Table2}
                  title="No collections match these filters"
                  action={
                    <Button size="sm" variant="secondary" onClick={clearCollectionFilters}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHead>
                    <PlainTr>
                      <Th>Collection</Th>
                      <Th className="text-right">Documents</Th>
                    </PlainTr>
                  </TableHead>
                  <TableBody>
                    {collections.map((c) => (
                      <Tr key={c.name}>
                        <Td className="text-ink font-mono">{c.name}</Td>
                        <Td className="text-right text-ink tabular">
                          {c.documents.toLocaleString('en-IN')}
                        </Td>
                      </Tr>
                    ))}
                  </TableBody>
                </Table>
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
