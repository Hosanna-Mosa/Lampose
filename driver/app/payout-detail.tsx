import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Chip, Toast, TopBar } from "@/components/ui";
import { PAYOUT_ROWS } from "@/constants/lampose";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, space, typography as t } from "@/theme";

export default function PayoutDetailScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }}>
        <TopBar back="Payouts" />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={[t.kicker, { textAlign: "center" }]}>Paid on 11 Aug 2026</Text>
          <Text style={styles.amount}>₹6,480</Text>
          <Chip label="Completed" tone={colors.ok} style={styles.heroChip} />
        </View>

        <View style={{ marginTop: ms(18) }}>
          {PAYOUT_ROWS.map((r) => (
            <View key={r.l} style={styles.row}>
              <Text style={styles.rowLabel}>{r.l}</Text>
              <Text style={styles.rowValue}>{r.v}</Text>
            </View>
          ))}
        </View>

        <Btn
          label="Download statement"
          variant="ghost"
          onPress={() => say("Statement downloaded as PDF.")}
          style={{ marginTop: ms(18) }}
        />
      </ScrollView>

      <Toast message={toast} top={insets.top + ms(8)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[4], paddingBottom: ms(26) },
  hero: {
    alignItems: "center",
    paddingTop: ms(24),
    paddingBottom: ms(20),
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  amount: {
    ...font.headingBold,
    fontSize: ms(50),
    lineHeight: ms(52),
    marginTop: ms(10),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  heroChip: { marginTop: ms(12), alignSelf: "center" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: ms(10),
    paddingVertical: ms(13),
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowLabel: { ...font.body, fontSize: ms(13.5), color: colors.neutral700, flex: 1 },
  rowValue: {
    ...font.body,
    fontSize: ms(13.5),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
});
