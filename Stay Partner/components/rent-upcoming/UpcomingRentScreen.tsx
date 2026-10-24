import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';

import {
  Badge, Box, EmptyState, ErrorState, IconButton, Screen, Segmented, Skeleton, Tappable, Text,
} from '@/components/common';
import { dayLabel, monthLabel, rentStyles as styles } from '@/components/rent-common';
import { formatINR } from '@/lib/format';
import { useColors } from '@/hooks/useColors';
import { useUpcomingRent } from '@/services/hooks/useRent';
import type { UpcomingRow } from '@/services/api/rent.api';

const RANGES = ['7', '15', '30'] as const;
type Range = (typeof RANGES)[number];
const RANGE_LABEL: Record<Range, string> = { '7': '7 days', '15': '15 days', '30': '30 days' };

/** Upcoming rent — who pays next and when, grouped by date. */
export function UpcomingRentScreen() {
  const c = useColors();
  const router = useRouter();
  const [range, setRange] = useState<Range>('30');
  const { rows, total, isLoading, isError, error, isRefetching, refetch } = useUpcomingRent(Number(range));

  const groups = useMemo(() => {
    const byDate = new Map<string, UpcomingRow[]>();
    for (const row of rows) {
      if (!byDate.has(row.dueDate)) byDate.set(row.dueDate, []);
      byDate.get(row.dueDate)!.push(row);
    }
    return [...byDate.entries()];
  }, [rows]);

  return (
    <Screen
      contentStyle={styles.stack}
      refreshing={isRefetching}
      onRefresh={refetch}
      stickyHeader={
        <>
          <Box style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </Box>
          <Text variant="screenTitle">Upcoming Rent</Text>
        </>
      }
    >
      <Segmented options={RANGES} value={range} onChange={setRange} labels={RANGE_LABEL} />

      {isLoading ? (
        <Box style={styles.stack}>
          <Skeleton width="100%" height={84} radius={16} />
          <Skeleton width="100%" height={72} radius={14} />
          <Skeleton width="100%" height={72} radius={14} />
        </Box>
      ) : isError && !rows.length ? (
        <ErrorState title="We could not load upcoming rent" body={error?.displayMessage} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={`Nothing due in the next ${RANGE_LABEL[range]}`}
          body="Rent paid in advance does not show here."
          style={styles.empty}
        />
      ) : (
        <>
          <Box style={[styles.card, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
            <Text variant="label" color="textSecondary">Expected in the next {RANGE_LABEL[range]}</Text>
            <Text style={[styles.amount, { color: c.textPrimary }]}>{formatINR(total)}</Text>
            <Text variant="caption" color="textTertiary">
              {rows.length} payment{rows.length === 1 ? '' : 's'}
            </Text>
          </Box>

          {groups.map(([date, items]) => (
            <Box key={date} style={styles.stack}>
              <Text variant="label" color="textSecondary" style={styles.sectionTitle}>
                {items[0].daysUntil === 1 ? 'Tomorrow' : dayLabel(date)} · in {items[0].daysUntil} day
                {items[0].daysUntil === 1 ? '' : 's'}
              </Text>
              {items.map((row) => (
                <Tappable
                  key={`${row.resident.id}-${row.period}`}
                  onPress={() =>
                    router.push({ pathname: '/rent/resident/[id]', params: { id: row.resident.id } } as never)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.row,
                    { borderColor: c.borderCard, backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Box style={styles.flex}>
                    <Text variant="cardTitle" numberOfLines={1}>{row.resident.guestName}</Text>
                    <Text variant="caption" color="textTertiary" numberOfLines={1}>
                      Room {row.resident.roomNumber || '—'} · {monthLabel(row.period)}
                    </Text>
                  </Box>
                  <Box>
                    <Text style={[styles.rowAmount, { color: c.textPrimary }]}>{formatINR(row.balance)}</Text>
                    {row.isPartial ? <Badge label="Part paid" tone="accent" /> : null}
                  </Box>
                </Tappable>
              ))}
            </Box>
          ))}
        </>
      )}
    </Screen>
  );
}
