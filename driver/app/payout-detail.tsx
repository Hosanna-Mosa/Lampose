import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Chip, DataRow, Text, Toast, TopBar } from "@/components/ui";
import { PAYOUT_ROWS } from "@/constants/lampose";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space } from "@/theme";

export default function PayoutDetailScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();

  return (
    <View style={styles.root}>
      <TopBar back="Payouts" title="Payout" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* The figure is the screen. Everything under it explains the figure. */}
        <View style={styles.hero}>
          <Text variant="eyebrow" color="tertiary">
            Paid on 11 Aug 2026
          </Text>
          <Text variant="codeHero" adjustsFontSizeToFit numberOfLines={1} style={{ marginTop: space[2] }}>
            ₹6,480
          </Text>
          <Chip label="Completed" tone="success" glyph="check" style={{ marginTop: space[3] }} />
        </View>

        <View style={styles.card}>
          {PAYOUT_ROWS.map((r, i) => (
            <DataRow key={r.l} label={r.l} value={r.v} first={i === 0} />
          ))}
        </View>

        <Btn
          label="Download statement"
          variant="ghost"
          glyph="documents"
          onPress={() => say("Statement downloaded as PDF.")}
        />
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[4] },
  hero: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    paddingVertical: space[6],
    paddingHorizontal: space[4],
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    paddingHorizontal: space[4],
    paddingVertical: space[1],
  },
});
