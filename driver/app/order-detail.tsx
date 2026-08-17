import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Rule, TopBar } from "@/components/ui";
import { ORDER_EARNINGS, TIMELINE } from "@/constants/lampose";
import { colors, font, ms, radius, space, typography as t } from "@/theme";

export default function OrderDetailScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }}>
        <TopBar back="Orders" />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Paradise Biryani</Text>
        <Text style={styles.sub}>#LP48291 · 16 Aug, 7:42 pm · delivered</Text>

        {/* ── Timeline ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={t.kicker}>Timeline</Text>
          <View style={{ marginTop: ms(12) }}>
            {TIMELINE.map((step, i) => (
              <View key={step.t} style={{ flexDirection: "row", gap: ms(12) }}>
                <View style={styles.railCol}>
                  <View style={styles.railDot} />
                  {i < TIMELINE.length - 1 && <View style={styles.railLine} />}
                </View>
                <View style={{ flex: 1, paddingBottom: ms(14) }}>
                  <Text style={styles.stepLabel}>{step.t}</Text>
                  <Text style={styles.stepAt}>{step.at}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── Earnings ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={t.kicker}>Your earnings</Text>
          <View style={{ marginTop: ms(10), gap: ms(9) }}>
            {ORDER_EARNINGS.map((r) => (
              <View key={r.l} style={styles.lineRow}>
                <Text style={[styles.lineLabel, { color: r.tone }]}>{r.l}</Text>
                <Text style={[styles.lineValue, { color: r.tone }]}>{r.v}</Text>
              </View>
            ))}
          </View>
          <Rule style={{ marginVertical: ms(14) }} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total paid to you</Text>
            <Text style={styles.totalValue}>₹86</Text>
          </View>
        </View>

        {/* ── Order value ──────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={t.kicker}>Order value</Text>
          <View style={[styles.lineRow, { marginTop: ms(9) }]}>
            <Text style={styles.lineLabel}>Customer bill (prepaid)</Text>
            <Text style={styles.lineValue}>₹640</Text>
          </View>
          <View style={[styles.lineRow, { marginTop: ms(7) }]}>
            <Text style={[styles.lineLabel, { color: colors.neutral700 }]}>Delivery fee charged</Text>
            <Text style={[styles.lineValue, { color: colors.neutral700 }]}>₹39</Text>
          </View>
          <View style={[styles.lineRow, { marginTop: ms(7) }]}>
            <Text style={[styles.lineLabel, { color: colors.neutral700 }]}>Distance travelled</Text>
            <Text style={[styles.lineValue, { color: colors.neutral700 }]}>4.8 km · 21 min</Text>
          </View>
        </View>

        <Btn
          label="Raise an issue with this order"
          variant="ghost"
          onPress={() => router.push("/support")}
          style={{ marginTop: ms(16) }}
        />
      </ScrollView>
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
  sub: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(18),
    color: colors.neutral700,
    marginTop: ms(4),
    fontVariant: ["tabular-nums"],
  },
  card: {
    marginTop: ms(16),
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    padding: ms(16),
  },
  railCol: { width: ms(10), alignItems: "center" },
  railDot: {
    width: ms(8),
    height: ms(8),
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    marginTop: ms(5),
  },
  railLine: { flex: 1, width: 1, backgroundColor: colors.divider },
  stepLabel: { ...font.body, fontSize: ms(14), lineHeight: ms(17), color: colors.text },
  stepAt: {
    ...font.body,
    fontSize: ms(11.5),
    color: colors.neutral600,
    marginTop: ms(2),
    fontVariant: ["tabular-nums"],
  },
  lineRow: { flexDirection: "row", justifyContent: "space-between", gap: ms(10) },
  lineLabel: { ...font.body, fontSize: ms(13.5), lineHeight: ms(18), color: colors.text, flex: 1 },
  lineValue: {
    ...font.body,
    fontSize: ms(13.5),
    lineHeight: ms(18),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  totalLabel: {
    ...font.bodySemi,
    fontSize: ms(10),
    letterSpacing: ms(10) * 0.14,
    textTransform: "uppercase",
    color: colors.text,
  },
  totalValue: {
    ...font.headingBold,
    fontSize: ms(26),
    lineHeight: ms(28),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
});
