import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Chip, Icon, SectionHeader, Sheet, Text, Toast, TopBar } from "@/components/ui";
import { PAYOUTS } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space } from "@/theme";

export default function PayoutsScreen() {
  const insets = useSafeAreaInsets();
  const { toast, setOverlay } = useFlowStore();
  const sheet = useSheet();

  return (
    <View style={styles.root}>
      <TopBar back="Earnings" title="Payouts" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* The balance card is the one brand-tinted surface here — it is the
            only thing on the screen a rider can act on. */}
        <View style={styles.balanceCard}>
          <Text variant="eyebrow" style={{ color: colors.brandInk }}>
            Available balance
          </Text>
          <Text variant="codeHero" adjustsFontSizeToFit numberOfLines={1} style={{ marginTop: space[2] }}>
            ₹3,240
          </Text>
          <Text variant="caption" color="secondary" style={{ marginTop: space[2] }}>
            Auto payout every Monday to HDFC ••••8841. Instant withdrawal costs ₹5.
          </Text>
          <Btn label="Withdraw now" glyph="bank" onPress={() => setOverlay("withdraw")} style={{ marginTop: space[4] }} />
        </View>

        <View style={{ gap: space[2] }}>
          <SectionHeader title="History" trailing={`${PAYOUTS.length} payouts`} />
          {PAYOUTS.map((p) => (
            <Pressable
              key={p.txn + p.date}
              onPress={() => router.push("/payout-detail")}
              accessibilityRole="button"
              accessibilityLabel={`${p.amt}, ${p.status}, ${p.date}`}
              style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceSunken }]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
                <Text variant="priceLg">{p.amt}</Text>
                <Text variant="numMeta" color="tertiary" numberOfLines={1}>
                  {p.date} · {p.txn}
                </Text>
              </View>
              <Chip label={p.status} tone={p.tone} />
              <Icon name="chevronRight" size={15} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[4] },
  balanceCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    backgroundColor: colors.brandTint,
    borderRadius: radius.card,
    padding: space[4],
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[3],
  },
});
