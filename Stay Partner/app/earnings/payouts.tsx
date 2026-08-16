import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, IconButton, PayoutStatusBadge, EmptyState } from '@/components/ui';
import { formatINR } from '@/lib/format';
import { PAYOUTS, payoutAmount, type Payout } from '@/lib/payouts';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PayoutHistoryScreen() {
  const router = useRouter();

  return (
    <Screen contentStyle={styles.stack}>
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

      <Text variant="screenTitle" style={styles.title}>
        Payouts
      </Text>

      {PAYOUTS.length > 0 ? (
        PAYOUTS.map((p) => (
          <PayoutRow
            key={p.id}
            payout={p}
            onPress={() => router.push(`/earnings/payout?id=${p.id}`)}
          />
        ))
      ) : (
        <EmptyState
          icon="bank"
          title="No payouts yet"
          body="Transfers appear here once your first stays are settled."
          style={styles.empty}
        />
      )}
    </Screen>
  );
}

function PayoutRow({ payout, onPress }: { payout: Payout; onPress: () => void }) {
  const c = useColors();
  const amount = payoutAmount(payout);
  const d = payout.initiatedAt;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${formatINR(amount)} to ${payout.method}, ${payout.status}`}
      style={({ pressed }) => [
        styles.row,
        { borderColor: c.borderCard, backgroundColor: c.surface, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <View style={styles.rowBody}>
        <Text tabular style={styles.amount}>
          {formatINR(amount)}
        </Text>
        <Text variant="badge" color="textSecondary" style={styles.meta}>
          {payout.method} · {MONTHS[d.getMonth()]} {d.getDate()}
        </Text>
      </View>
      <PayoutStatusBadge status={payout.status} size="sm" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -8 },
  title: { marginBottom: 2 },
  row: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowBody: { flex: 1 },
  amount: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 21 },
  meta: { fontSize: 11.5, marginTop: 3 },
  empty: { minHeight: 300 },
});
