import { useRouter } from 'expo-router';

import {
  Avatar, Box, Button, EmptyState, ErrorState, IconButton, Screen, Skeleton, Tappable, Text,
} from '@/components/common';
import {
  CHANNEL_LABEL, ReminderButtons, monthLabel, monthLine, rentStyles as styles,
} from '@/components/rent-common';
import { formatINR } from '@/lib/format';
import { useColors } from '@/hooks/useColors';
import { useDues } from '@/services/hooks/useRent';

/**
 * Rent to be paid — every resident who owes today or earlier, the longest
 * waiting first, with the two things to do about it right on the row.
 */
export function RentDueScreen() {
  const c = useColors();
  const router = useRouter();
  const { rows, total, isLoading, isError, error, isRefetching, refetch } = useDues();

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
          <Text variant="screenTitle">Rent to Be Paid</Text>
        </>
      }
    >
      {isLoading ? (
        <Box style={styles.stack}>
          <Skeleton width="100%" height={96} radius={16} />
          <Skeleton width="100%" height={150} radius={16} />
          <Skeleton width="100%" height={150} radius={16} />
        </Box>
      ) : isError && !rows.length ? (
        <ErrorState title="We could not load what is due" body={error?.displayMessage} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title="Nobody owes rent right now"
          body="Residents appear here on the day their rent falls due, and stay until it is recorded as paid."
          style={styles.empty}
        />
      ) : (
        <>
          <Box style={[styles.card, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
            <Text variant="label" color="textSecondary">To collect</Text>
            <Text style={[styles.amount, { color: c.textPrimary }]}>{formatINR(total)}</Text>
            <Text variant="caption" color="textTertiary">
              From {rows.length} resident{rows.length === 1 ? '' : 's'}
            </Text>
          </Box>

          {rows.map((r) => {
            /* `owing` is oldest first — the month a payment clears first. */
            const oldest = r.owing[0];
            return (
              <Box key={r.id} style={[styles.card, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
                <Tappable
                  onPress={() => router.push({ pathname: '/rent/resident/[id]', params: { id: r.id } } as never)}
                  accessibilityRole="button"
                  style={styles.rowTop}
                >
                  <Avatar label={r.guestName} tone={r.summary.status === 'overdue' ? 'error' : 'warning'} />
                  <Box style={styles.flex}>
                    <Text variant="cardTitle" numberOfLines={1}>{r.guestName}</Text>
                    <Text variant="caption" color="textTertiary" numberOfLines={1}>
                      Room {r.roomNumber || '—'}{r.propertyName ? ` · ${r.propertyName}` : ''}
                    </Text>
                  </Box>
                  <Text style={[styles.rowAmount, { color: c.error }]}>{formatINR(r.summary.outstanding)}</Text>
                </Tappable>

                <Box style={[styles.divider, { backgroundColor: c.borderSubtle }]} />
                {r.owing.map((m) => (
                  <Text key={m.period} variant="caption" color={m.status === 'overdue' ? 'error' : 'warningInk'}>
                    {monthLabel(m.period)} — {monthLine(m)}
                    {m.isPartial ? ` · ${formatINR(m.balance)} left` : ''}
                  </Text>
                ))}
                {r.lastReminder ? (
                  <Text variant="caption" color="textTertiary">
                    Reminded by {CHANNEL_LABEL[r.lastReminder.channel]} on{' '}
                    {new Date(r.lastReminder.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </Text>
                ) : null}

                <Box style={styles.actions}>
                  <ReminderButtons
                    residentId={r.id}
                    guestName={r.guestName}
                    guestPhone={r.guestPhone}
                    propertyName={r.propertyName}
                    amount={r.summary.outstanding}
                    status={oldest.status}
                    period={oldest.period}
                    dueDate={oldest.dueDate}
                  />
                </Box>
                <Button
                  label="Record payment"
                  size="sm"
                  variant="secondary"
                  style={styles.message}
                  onPress={() =>
                    router.push({ pathname: '/rent/pay', params: { id: r.id, period: oldest.period } } as never)}
                />
              </Box>
            );
          })}
        </>
      )}
    </Screen>
  );
}
