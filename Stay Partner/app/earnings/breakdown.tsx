import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Text, IconButton, Card, Divider, EmptyState } from '@/components/ui';
import { formatINR, formatRange, formatStayRange } from '@/lib/format';
import { payoutOf, type Booking } from '@/lib/bookings';
import { FEE_LABEL } from '@/lib/fees';
import {
  PERIOD_LABELS,
  asPeriod,
  earningBookings,
  feeOfBooking,
  grossOfBooking,
  periodRange,
  totalFor,
} from '@/lib/earnings';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Gross, platform fee, and net payout as three separate lines, per booking —
 * the rule the design system sets and the reason checkpoint 07's "You'll
 * receive" had to change.
 */
export default function EarningsBreakdownScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ period?: string }>();
  const period = asPeriod(params.period);

  const bookings = useMemo(() => earningBookings(period), [period]);
  const range = useMemo(() => periodRange(period), [period]);
  const total = useMemo(() => totalFor(period), [period]);

  return (
    <Screen contentStyle={styles.stack}>
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

      <Text variant="screenTitle" style={styles.title}>
        Earnings breakdown
      </Text>
      <Text variant="caption" color="textSecondary" style={styles.subtitle}>
        {period === 'today'
          ? `Today · ${range.from.getFullYear()}`
          : `${formatRange(range.from, range.to)}, ${range.to.getFullYear()}`}
        {' · '}
        {PERIOD_LABELS[period]}
      </Text>

      {bookings.length > 0 ? (
        <>
          {bookings.map((b) => (
            <BreakdownCard key={b.id} booking={b} />
          ))}

          {/*
            The design stops at the per-booking cards. With more than two, the
            question "so what did I actually make" needs an answer on screen.
          */}
          {bookings.length > 1 ? (
            <Card>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  Net payout · {bookings.length} bookings
                </Text>
                <Text tabular style={styles.totalValue}>
                  {formatINR(total)}
                </Text>
              </View>
            </Card>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon="rupee"
          title="Nothing earned in this period"
          body="A stay counts once the guest checks out."
          style={styles.empty}
        />
      )}
    </Screen>
  );
}

function BreakdownCard({ booking }: { booking: Booking }) {
  const c = useColors();
  const gross = grossOfBooking(booking);
  const fee = feeOfBooking(booking);

  return (
    <Card>
      <Text style={styles.guest}>{booking.guest}</Text>
      <Text variant="badge" color="textSecondary" style={styles.stay}>
        {formatStayRange(booking.checkIn, booking.checkOut)} · {booking.roomType}
      </Text>

      <View style={styles.line}>
        <Text variant="caption" color="textSecondary">
          Gross amount
        </Text>
        <Text tabular style={styles.lineValue}>
          {formatINR(gross)}
        </Text>
      </View>

      {/* Red because it leaves the owner's side of the ledger, not because it's an error. */}
      <View style={[styles.line, styles.feeLine]}>
        <Text variant="caption" style={{ color: c.error }}>
          {FEE_LABEL}
        </Text>
        <Text tabular style={[styles.lineValue, { color: c.error }]}>
          {formatINR(-fee)}
        </Text>
      </View>

      <Divider style={styles.rule} />

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Net payout</Text>
        <Text tabular style={styles.totalValue}>
          {formatINR(payoutOf(booking))}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -8 },
  title: { marginBottom: -10 },
  subtitle: { marginBottom: -4 },

  guest: { fontFamily: fonts.bold, fontSize: 14.5, lineHeight: 19 },
  stay: { fontSize: 12, marginTop: 2, marginBottom: 14 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  feeLine: { marginBottom: 12 },
  lineValue: { fontFamily: fonts.semibold, fontSize: 13.5, lineHeight: 18 },
  rule: { marginBottom: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  totalLabel: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  totalValue: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 21 },
  empty: { minHeight: 300 },
});
