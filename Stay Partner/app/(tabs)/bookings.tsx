import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Chip,
  ChipRow,
  BookingStatusBadge,
  PaymentStatusBadge,
  EmptyState,
} from '@/components/ui';
import { formatINR, formatStayRange } from '@/lib/format';
import { HISTORY, UPCOMING, type Booking, payoutOf } from '@/lib/bookings';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

type Tab = 'upcoming' | 'history';
type Outcome = 'all' | 'completed' | 'cancelled';

const OUTCOMES: { key: Outcome; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function BookingsTab() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [outcome, setOutcome] = useState<Outcome>('all');

  const history = useMemo(
    () => (outcome === 'all' ? HISTORY : HISTORY.filter((b) => b.status === outcome)),
    [outcome],
  );

  const rows = tab === 'upcoming' ? UPCOMING : history;

  const open = (b: Booking) =>
    router.push({ pathname: '/booking/[id]', params: { id: b.id } });

  return (
    <Screen tabBarSpacing contentStyle={styles.stack}>
      <Text variant="screenTitle" style={styles.title}>
        Bookings
      </Text>

      <ChipRow style={styles.filters}>
        <Chip
          label="Upcoming"
          size="sm"
          selected={tab === 'upcoming'}
          onPress={() => setTab('upcoming')}
        />
        <Chip
          label="History"
          size="sm"
          selected={tab === 'history'}
          onPress={() => setTab('history')}
        />
      </ChipRow>

      {/* Subordinate to the row above, so it takes the lighter treatment. */}
      {tab === 'history' ? (
        <ChipRow style={styles.filters}>
          {OUTCOMES.map((o) => (
            <Chip
              key={o.key}
              label={o.label}
              size="sm"
              subtle
              tone="neutral"
              selected={outcome === o.key}
              onPress={() => setOutcome(o.key)}
            />
          ))}
        </ChipRow>
      ) : null}

      {rows.length > 0 ? (
        rows.map((b) => <BookingRow key={b.id} booking={b} onPress={() => open(b)} />)
      ) : (
        <EmptyState
          icon={tab === 'upcoming' ? 'bookings' : 'clock'}
          title={tab === 'upcoming' ? 'No upcoming bookings' : `No ${outcome} stays`}
          body={
            tab === 'upcoming'
              ? 'Confirmed stays appear here once you accept a request.'
              : 'Stays move here once they finish or are called off.'
          }
          style={styles.empty}
        />
      )}
    </Screen>
  );
}

/**
 * The request card layout, minus the countdown. Booking state and payment state
 * sit side by side as two separate badges and are never merged.
 */
function BookingRow({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const c = useColors();
  // A cancelled stay is still a record, but it isn't live — the design dims it.
  const dimmed = booking.status === 'cancelled';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${booking.guest}, ${booking.roomType}, ${formatINR(payoutOf(booking))}`}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: c.borderCard,
          backgroundColor: c.surface,
          opacity: pressed ? 0.75 : dimmed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <Text style={styles.guest}>{booking.guest}</Text>
          <Text variant="caption" color="textSecondary" style={styles.meta}>
            {formatStayRange(booking.checkIn, booking.checkOut)} · {booking.roomType}
          </Text>
        </View>
        <Text tabular style={styles.amount}>
          {formatINR(payoutOf(booking))}
        </Text>
      </View>

      <View style={styles.badges}>
        <BookingStatusBadge status={booking.status} size="sm" />
        <PaymentStatusBadge status={booking.payment} size="sm" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  title: { marginBottom: 2 },
  filters: { marginBottom: 6 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  identity: { flex: 1 },
  guest: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  meta: { fontSize: 12.5, marginTop: 1 },
  amount: { fontFamily: fonts.extrabold, fontSize: 15, lineHeight: 20 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: { minHeight: 320, borderRadius: radius.card },
});
