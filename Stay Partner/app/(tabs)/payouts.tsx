import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Icon } from '@/components/ui';
import { formatINR } from '@/lib/format';
import { totalPayouts } from '@/lib/payouts';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Reduced to a single figure at the user's request — the period selector,
 * daily chart, and recent-bookings list this tab used to show are gone.
 * "Total payouts" sums only `completed` transfers from `lib/payouts.ts`;
 * money still processing or that bounced isn't "paid out" yet. The card
 * stays tappable through to the existing payout history screen so that
 * screen — and the single-payout detail behind it — doesn't go dark for
 * having lost its only other entry point.
 */
export default function PayoutsTab() {
  const c = useColors();
  const router = useRouter();

  const total = useMemo(() => totalPayouts(), []);

  return (
    <Screen tabBarSpacing background="bg" contentStyle={styles.stack}>
      <Text variant="screenTitle">Payouts</Text>

      <Pressable
        onPress={() => router.push('/earnings/payouts')}
        accessibilityRole="button"
        accessibilityLabel={`Total payouts ${formatINR(total)}. See payout history`}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: c.accentTint, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        <Text variant="badge" style={{ color: c.accentInk }}>
          Total payouts
        </Text>
        <Text tabular style={[styles.value, { color: c.accentInkDeep }]}>
          {formatINR(total)}
        </Text>
        <View style={styles.linkRow}>
          <Text variant="badge" style={{ color: c.accent }}>
            View payout history
          </Text>
          <Icon name="chevron-right" size={13} color={c.accent} strokeWidth={2} />
        </View>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  card: { borderRadius: radius.card, padding: 22, gap: 8 },
  value: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 39 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
});
