import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatCard } from "@/app/(tabs)/index";
import { Btn, Seg, Sheet, Text, Toast, TopBar } from "@/components/ui";
import { PERIODS, PERIODS_LIST } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space, tone as resolveTone } from "@/theme";

/** Earnings read as a ledger: totals as large figures, breakdown on hairlines. */
export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const { period, setPeriod, toast, setOverlay } = useFlowStore();
  const sheet = useSheet();
  const data = PERIODS[period];

  return (
    <View style={styles.root}>
      <TopBar title="Earnings" action="Payouts" onAction={() => router.push("/payouts")} />

      {/* Pinned with the bar: every figure below is scoped by this control, so
          losing it off the top means reading numbers with no idea what period
          they cover. */}
      <View style={styles.segWrap}>
        <Seg options={PERIODS_LIST} value={period} onChange={setPeriod} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Total ────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text variant="eyebrow" color="tertiary">
            {data.label}
          </Text>
          <Text variant="codeHero" adjustsFontSizeToFit numberOfLines={1} style={{ marginTop: space[2] }}>
            {data.total}
          </Text>
          <Text variant="caption" color="success" style={{ marginTop: space[2] }}>
            {data.delta}
          </Text>

          {/* Bars live inside the total card — they are that figure, split up. */}
          <View style={styles.chart}>
            {data.bars.map(([label, height, highlighted], i) => (
              <View key={`${label}-${i}`} style={styles.col}>
                <View
                  style={{
                    width: "100%",
                    height: Math.max(3, Math.round(height * 96)),
                    borderRadius: radius.chip,
                    backgroundColor: highlighted ? colors.brand : colors.surfaceSunken,
                  }}
                />
                <Text variant="numMeta" color="tertiary">
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Breakdown ────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text variant="eyebrow" color="tertiary">
            Breakdown
          </Text>
          <View style={{ marginTop: space[3] }}>
            {data.rows.map((r) => (
              <View key={r.l} style={styles.ledgerRow}>
                <Text variant="body" color="secondary" style={{ flex: 1 }}>
                  {r.l}
                </Text>
                <Text variant="priceMd" style={r.tone ? { color: resolveTone(r.tone).ink } : undefined}>
                  {r.v}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.totalRow}>
            <Text variant="label" color="tertiary">
              Total
            </Text>
            <Text variant="priceHero">{data.total}</Text>
          </View>
        </View>

        <View style={styles.statGrid}>
          <StatCard label="Deliveries" value={data.orders} />
          <StatCard label="Online hours" value={data.hours} />
        </View>

        {/* ── Balances ─────────────────────────────────────────────── */}
        <View style={[styles.card, { gap: space[3] }]}>
          <View style={styles.balanceRow}>
            <Text variant="bodyLg" style={{ flex: 1 }}>
              Available for payout
            </Text>
            <Text variant="priceLg" color="brand">
              ₹3,240
            </Text>
          </View>
          <View style={styles.balanceRow}>
            <Text variant="body" color="secondary" style={{ flex: 1 }}>
              Pending earnings
            </Text>
            <Text variant="priceMd" color="secondary">
              ₹928
            </Text>
          </View>
          <View style={styles.balanceRow}>
            <Text variant="body" color="secondary" style={{ flex: 1 }}>
              Lifetime earnings
            </Text>
            <Text variant="priceMd" color="secondary">
              ₹2,84,610
            </Text>
          </View>
        </View>

        <Btn label="Withdraw ₹3,240" glyph="bank" onPress={() => setOverlay("withdraw")} />
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  segWrap: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    paddingBottom: space[3],
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  content: { paddingHorizontal: layout.gutter, paddingTop: space[4], paddingBottom: space[6], gap: space[4] },

  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[4],
    backgroundColor: colors.surface,
  },

  chart: {
    marginTop: space[5],
    height: 120,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space[2],
  },
  col: { flex: 1, alignItems: "center", gap: space[2], justifyContent: "flex-end" },

  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    gap: space[3],
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: space[4],
  },

  statGrid: { flexDirection: "row", gap: space[2] },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[3] },
});
