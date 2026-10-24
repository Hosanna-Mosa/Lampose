import { useState } from 'react';
import { useRouter } from 'expo-router';

import {
  Badge, Box, EmptyState, ErrorState, IconButton, Screen, Skeleton, Tappable, Text,
} from '@/components/common';
import {
  MODE_LABEL, fullDayLabel, monthLabel, rentStyles as styles, shiftPeriod, todayYmd,
} from '@/components/rent-common';
import { formatINR } from '@/lib/format';
import { useColors } from '@/hooks/useColors';
import { useRentPayments } from '@/services/hooks/useRent';

/**
 * Rent history — every payment recorded, a month at a time, each opening its
 * receipt. The month here is when the money came in (`paidOn`), which is what
 * an owner reconciling their cash box is counting.
 */
export function RentHistoryScreen() {
  const c = useColors();
  const router = useRouter();
  const thisMonth = todayYmd().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const { rows, total, isLoading, isError, error, isRefetching, refetch } = useRentPayments(month);

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
          <Text variant="screenTitle">Rent History</Text>
        </>
      }
    >
      <Box style={[styles.row, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
        <IconButton name="chevron-left" label="Previous month" onPress={() => setMonth(shiftPeriod(month, -1))} />
        <Box style={styles.flex}>
          <Text variant="cardTitle" center>{monthLabel(month)}</Text>
          <Text variant="caption" color="textTertiary" center>
            {formatINR(total)} received
          </Text>
        </Box>
        {month < thisMonth ? (
          <IconButton name="chevron-right" label="Next month" onPress={() => setMonth(shiftPeriod(month, 1))} />
        ) : (
          <Box style={{ width: 44 }} />
        )}
      </Box>

      {isLoading ? (
        <Box style={styles.stack}>
          <Skeleton width="100%" height={72} radius={14} />
          <Skeleton width="100%" height={72} radius={14} />
        </Box>
      ) : isError && !rows.length ? (
        <ErrorState title="We could not load payments" body={error?.displayMessage} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="rupee"
          title={`No payments in ${monthLabel(month)}`}
          body="Payments you record from a resident’s rent page show here with their receipts."
          style={styles.empty}
        />
      ) : (
        rows.map((p) => (
          <Tappable
            key={p.id}
            onPress={() => router.push({ pathname: '/rent/receipt/[id]', params: { id: p.id } } as never)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.row,
              { borderColor: c.borderCard, backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Box style={styles.flex}>
              <Text variant="cardTitle" numberOfLines={1}>{p.guestName}</Text>
              <Text variant="caption" color="textTertiary" numberOfLines={1}>
                {fullDayLabel(p.paidOn)} · {MODE_LABEL[p.mode]} · for {monthLabel(p.period)}
              </Text>
              <Text variant="caption" color="textTertiary">{p.receiptNo}</Text>
            </Box>
            <Box>
              <Text style={[styles.rowAmount, { color: c.textPrimary }]}>{formatINR(p.amount)}</Text>
              <Badge label="Receipt" tone="success" />
            </Box>
          </Tappable>
        ))
      )}
    </Screen>
  );
}
