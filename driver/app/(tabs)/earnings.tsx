import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatCard } from "@/app/(tabs)/index";
import { Btn, Seg, Sheet, Toast } from "@/components/ui";
import { PERIODS, PERIODS_LIST } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, radius, space, typography as t } from "@/theme";

/** Earnings read as a ledger: totals as large figures, breakdown on hairlines. */
export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const { period, setPeriod, toast, setOverlay } = useFlowStore();
  const sheet = useSheet();
  const data = PERIODS[period];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + ms(8) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <Text style={styles.title}>Earnings</Text>
          <Pressable onPress={() => router.push("/payouts")} hitSlop={8}>
            <Text style={styles.link}>Payouts ›</Text>
          </Pressable>
        </View>

        <Seg
          options={PERIODS_LIST}
          value={period}
          onChange={setPeriod}
          style={{ marginTop: ms(14) }}
        />

        <View style={styles.totalBlock}>
          <Text style={t.kicker}>{data.label}</Text>
          <Text style={styles.total}>{data.total}</Text>
          <Text style={styles.delta}>{data.delta}</Text>
        </View>

        {/* ── Bars ─────────────────────────────────────────────────── */}
        <View style={styles.chart}>
          {data.bars.map(([label, height, highlighted], i) => (
            <View key={`${label}-${i}`} style={styles.col}>
              <View
                style={{
                  width: "100%",
                  height: Math.round(height * ms(104)),
                  borderTopLeftRadius: radius.sm,
                  borderTopRightRadius: radius.sm,
                  backgroundColor: highlighted ? colors.ink : colors.neutral300,
                }}
              />
              <Text style={styles.colLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Breakdown ────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={t.kicker}>Breakdown</Text>
          <View style={{ marginTop: ms(11) }}>
            {data.rows.map((r) => (
              <View key={r.l} style={styles.ledgerRow}>
                <Text style={[styles.ledgerLabel, r.tone ? { color: r.tone } : null]}>{r.l}</Text>
                <Text style={[styles.ledgerValue, r.tone ? { color: r.tone } : null]}>{r.v}</Text>
              </View>
            ))}
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalRowLabel}>Total</Text>
            <Text style={styles.totalRowValue}>{data.total}</Text>
          </View>
        </View>

        <View style={styles.statGrid}>
          <StatCard label="Deliveries" value={data.orders} />
          <StatCard label="Online hours" value={data.hours} />
        </View>

        {/* ── Balances ─────────────────────────────────────────────── */}
        <View style={[styles.card, { marginTop: ms(14), gap: ms(12) }]}>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Available for payout</Text>
            <Text style={styles.balanceMajor}>₹3,240</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={[styles.balanceLabel, { color: colors.neutral700 }]}>Pending earnings</Text>
            <Text style={styles.balanceMinor}>₹928</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={[styles.balanceLabel, { color: colors.neutral700 }]}>Lifetime earnings</Text>
            <Text style={styles.balanceMinor}>₹2,84,610</Text>
          </View>
        </View>

        <Btn
          label="Withdraw ₹3,240"
          onPress={() => setOverlay("withdraw")}
          style={{ marginTop: ms(16) }}
        />
      </ScrollView>

      <Toast message={toast} top={insets.top + ms(8)} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[4], paddingBottom: ms(26) },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  title: { ...font.headingBold, fontSize: ms(30), lineHeight: ms(33), color: colors.text },
  link: { ...font.body, fontSize: ms(13), color: colors.accent700 },

  totalBlock: {
    marginTop: ms(18),
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingBottom: ms(16),
  },
  total: {
    ...font.headingBold,
    fontSize: ms(56),
    lineHeight: ms(58),
    letterSpacing: -1.2,
    marginTop: ms(8),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  delta: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(18),
    color: colors.ok,
    marginTop: ms(8),
  },

  chart: {
    marginTop: ms(18),
    height: ms(132),
    flexDirection: "row",
    alignItems: "flex-end",
    gap: ms(7),
  },
  col: { flex: 1, alignItems: "center", gap: ms(7) },
  colLabel: {
    ...font.body,
    fontSize: ms(10),
    color: colors.neutral600,
    fontVariant: ["tabular-nums"],
  },

  card: {
    marginTop: ms(20),
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    padding: ms(16),
  },
  ledgerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: ms(10),
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: ms(10),
  },
  ledgerLabel: { ...font.body, fontSize: ms(13.5), color: colors.text, flex: 1 },
  ledgerValue: {
    ...font.body,
    fontSize: ms(13.5),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: ms(13) },
  totalRowLabel: {
    ...font.bodySemi,
    fontSize: ms(10),
    letterSpacing: ms(10) * 0.14,
    textTransform: "uppercase",
    color: colors.text,
    paddingTop: ms(6),
  },
  totalRowValue: {
    ...font.headingBold,
    fontSize: ms(24),
    lineHeight: ms(26),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },

  statGrid: { flexDirection: "row", gap: ms(9), marginTop: ms(14) },

  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: ms(10) },
  balanceLabel: { ...font.body, fontSize: ms(14), color: colors.text, flex: 1 },
  balanceMajor: {
    ...font.heading,
    fontSize: ms(22),
    lineHeight: ms(24),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  balanceMinor: {
    ...font.heading,
    fontSize: ms(16),
    lineHeight: ms(18),
    color: colors.neutral700,
    fontVariant: ["tabular-nums"],
  },
});
