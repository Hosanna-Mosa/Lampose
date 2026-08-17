import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Chip, Sheet, Toast, TopBar } from "@/components/ui";
import { PAYOUTS } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, radius, space, typography as t } from "@/theme";

export default function PayoutsScreen() {
  const insets = useSafeAreaInsets();
  const { toast, setOverlay } = useFlowStore();
  const sheet = useSheet();

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }}>
        <TopBar back="Earnings" />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Payouts</Text>

        <View style={styles.balanceCard}>
          <Text style={t.kicker}>Available balance</Text>
          <Text style={styles.balance}>₹3,240</Text>
          <Text style={styles.balanceMeta}>
            Auto payout every Monday to HDFC ••••8841. Instant withdrawal costs ₹5.
          </Text>
          <Btn
            label="Withdraw now"
            onPress={() => setOverlay("withdraw")}
            style={{ marginTop: ms(16) }}
          />
        </View>

        <Text style={[t.kicker, { marginTop: ms(20) }]}>History</Text>
        <View style={{ marginTop: ms(11), gap: ms(10) }}>
          {PAYOUTS.map((p) => (
            <Pressable
              key={p.txn + p.date}
              onPress={() => router.push("/payout-detail")}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.cardHead}>
                <Text style={styles.amount}>{p.amt}</Text>
                <Chip label={p.status} tone={p.tone} />
              </View>
              <Text style={styles.cardMeta}>
                {p.date} · {p.txn}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Toast message={toast} top={insets.top + ms(8)} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[4], paddingBottom: ms(26) },
  title: {
    ...font.headingBold,
    fontSize: ms(28),
    lineHeight: ms(31),
    color: colors.text,
    marginTop: ms(12),
  },
  balanceCard: {
    marginTop: ms(16),
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: radius.lg,
    padding: ms(18),
  },
  balance: {
    ...font.headingBold,
    fontSize: ms(44),
    lineHeight: ms(46),
    marginTop: ms(8),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  balanceMeta: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(18),
    color: colors.neutral700,
    marginTop: ms(8),
  },
  card: { borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg, padding: ms(14) },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: ms(10) },
  amount: {
    ...font.heading,
    fontSize: ms(19),
    lineHeight: ms(21),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  cardMeta: {
    ...font.body,
    fontSize: ms(12),
    lineHeight: ms(16),
    color: colors.neutral700,
    marginTop: ms(7),
    fontVariant: ["tabular-nums"],
  },
});
