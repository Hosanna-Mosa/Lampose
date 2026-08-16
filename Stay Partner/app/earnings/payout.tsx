import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Icon,
  Card,
  DetailRow,
  Divider,
  PayoutStatusBadge,
  EmptyState,
} from '@/components/ui';
import { formatDateLong, formatINR } from '@/lib/format';
import { payoutOf } from '@/lib/bookings';
import { getPayout, payoutAmount, payoutBookings } from '@/lib/payouts';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

export default function PayoutDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const payout = getPayout(id);

  if (!payout) {
    return (
      <Screen scroll={false} padX={22} background="bg">
        <EmptyState
          icon="search"
          title="Payout not found"
          actionLabel="Back to payouts"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const amount = payoutAmount(payout);
  const bookings = payoutBookings(payout);

  return (
    <Screen
      padX={22}
      contentStyle={styles.stack}
      // A receipt only exists for money that actually arrived.
      footer={
        payout.status === 'completed' ? (
          <Button label="Download receipt" variant="secondary" onPress={() => {}} />
        ) : undefined
      }
    >
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

      <View style={styles.hero}>
        <Text tabular style={styles.amount}>
          {formatINR(amount)}
        </Text>
        <PayoutStatusBadge status={payout.status} />
      </View>

      {/* The design has no failed state. A bounced transfer has to say why. */}
      {payout.status === 'failed' && payout.failureReason ? (
        <View style={[styles.alert, { backgroundColor: c.errorTint }]}>
          <Icon name="alert-circle" size={16} color={c.error} strokeWidth={2} />
          <Text style={[styles.alertText, { color: c.errorInk }]}>{payout.failureReason}</Text>
        </View>
      ) : null}

      <Card>
        <DetailRow label="Method" value={payout.method} />
        <DetailRow label="Initiated" value={formatDateLong(payout.initiatedAt)} />
        {/* Only a transfer still in flight has an estimate worth showing. */}
        {payout.status === 'processing' && payout.estArrival ? (
          <DetailRow label="Est. arrival" value={formatDateLong(payout.estArrival)} />
        ) : null}
        <View style={styles.referenceRow}>
          <Text variant="caption" color="textSecondary">
            Reference ID
          </Text>
          <Text variant="mono" style={styles.reference} selectable>
            {payout.reference}
          </Text>
        </View>
      </Card>

      {bookings.length > 0 ? (
        <>
          <Text variant="link" style={styles.sectionTitle}>
            Included bookings ({bookings.length})
          </Text>
          <View>
            {bookings.map((b, i) => (
              <View key={b.id}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.bookingRow}>
                  <Text variant="bodySm">{b.guest}</Text>
                  <Text tabular style={styles.bookingAmount}>
                    {formatINR(payoutOf(b))}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : (
        // Archived transfers predate the bookings held on device.
        <Text variant="badge" color="textTertiary" style={styles.archived}>
          The bookings in this transfer are no longer held on this device. Support can retrieve them
          from the reference ID.
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -2 },
  hero: { alignItems: 'center', gap: 8, marginBottom: 6 },
  amount: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 40 },

  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: radius.control,
  },
  alertText: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17.5 },

  referenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  reference: { fontSize: 12.5, lineHeight: 17 },

  sectionTitle: { fontSize: 13, marginBottom: -6 },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  bookingAmount: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  archived: { fontSize: 12, lineHeight: 18 },
});
