import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Chip, IconBtn, MapPanel, Notice, Sheet, StepBars, Text, Toast, TopBar } from "@/components/ui";
import {
  CURRENT_ORDER,
  ORDER_ITEMS,
  STAGE_CTAS,
  STAGE_HINTS,
  STAGES,
} from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { TOTAL_STAGES, useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space } from "@/theme";

/**
 * The stage rail is the screen's spine — bars filled in brand green up to the
 * current stage. Map height grows on the two travelling stages.
 */
export default function ActiveOrderScreen() {
  const insets = useSafeAreaInsets();
  const { stage, toast, advanceStage, completeDelivery, setOverlay, say } = useFlowStore();
  const sheet = useSheet();

  const travelling = stage === 1 || stage === 4;
  const toRestaurant = stage < 3;
  const pickedUp = stage >= 3;

  const onAdvance = () => {
    if (stage >= TOTAL_STAGES - 1) {
      completeDelivery();
      router.replace("/complete");
      return;
    }
    advanceStage();
  };

  return (
    <View style={styles.root}>
      <TopBar
        back="Home"
        onBack={() => router.replace("/")}
        title={`Order ${CURRENT_ORDER.id}`}
        action="Help"
        onAction={() => router.push("/support")}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space[6] }}>
        <MapPanel
          height={travelling ? 252 : 168}
          kicker={toRestaurant ? "To restaurant" : "To customer"}
          distance={toRestaurant ? "1.2 km" : "3.6 km"}
          eta={toRestaurant ? "4 min" : "12 min"}
          target={toRestaurant ? "Restaurant" : "Customer"}
        />

        <View style={styles.body}>
          {/* ── Where we are ─────────────────────────────────────────── */}
          <View style={styles.stageCard}>
            <View style={styles.stageHead}>
              <Chip label={`Stage ${stage + 1} of ${TOTAL_STAGES}`} tone="brand" />
              <Text variant="numMeta" color="tertiary">
                {CURRENT_ORDER.earn} · {CURRENT_ORDER.distance}
              </Text>
            </View>

            <Text variant="display1" style={{ marginTop: space[3] }}>
              {STAGES[stage]}
            </Text>

            <StepBars total={TOTAL_STAGES} current={stage} height={5} style={{ marginTop: space[3] }} />

            <Text variant="caption" color="secondary" style={{ marginTop: space[3] }}>
              {STAGE_HINTS[stage]}
            </Text>
          </View>

          {/* ── Stops ────────────────────────────────────────────────── */}
          <View style={styles.stopsCard}>
            <View style={styles.stopRow}>
              <View
                style={[
                  styles.stopDot,
                  pickedUp
                    ? { backgroundColor: colors.brand }
                    : { borderWidth: 2.5, borderColor: colors.brand },
                ]}
              />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="eyebrow" color="tertiary">
                  Pickup
                </Text>
                <Text variant="title1" numberOfLines={2}>
                  {CURRENT_ORDER.restaurant}
                </Text>
                <Text variant="numMeta" color="tertiary">
                  Danavaipeta Main Road · token {CURRENT_ORDER.token}
                </Text>
              </View>
              <IconBtn
                glyph="phone"
                fg={colors.brandInk}
                tone={colors.brandOnDark}
                bg={colors.brandTint}
                accessibilityLabel="Call the restaurant"
                onPress={() => say("Calling Paradise Biryani…")}
              />
            </View>

            <View style={[styles.stopRow, styles.stopRowDivided]}>
              <View
                style={[
                  styles.stopDot,
                  stage >= 5
                    ? { backgroundColor: colors.brand }
                    : { borderWidth: 2.5, borderColor: colors.borderInput },
                ]}
              />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="eyebrow" color="tertiary">
                  Drop
                </Text>
                <Text variant="title1" numberOfLines={2}>
                  {CURRENT_ORDER.customer}
                </Text>
                <Text variant="numMeta" color="tertiary">
                  {pickedUp
                    ? CURRENT_ORDER.dropAddress
                    : `${CURRENT_ORDER.dropArea} · unlocks after pickup`}
                </Text>
                {pickedUp && (
                  <Text variant="caption" color="brand" style={{ marginTop: space[1] }}>
                    “Call when you reach the gate, second building.”
                  </Text>
                )}
              </View>
              <IconBtn
                glyph="phone"
                fg={colors.brandInk}
                tone={colors.brandOnDark}
                bg={colors.brandTint}
                accessibilityLabel="Call the customer"
                onPress={() => say("Calling Sneha via masked number…")}
              />
            </View>
          </View>

          {/* ── Items, once at the counter ───────────────────────────── */}
          {stage >= 2 && (
            <View style={styles.itemsCard}>
              <Text variant="eyebrow" color="tertiary">
                Order · 3 items · prepaid ₹640
              </Text>
              <View style={{ marginTop: space[3], gap: space[2] }}>
                {ORDER_ITEMS.map((item) => (
                  <View key={item.name} style={styles.itemRow}>
                    <Text variant="body" style={{ flex: 1 }}>
                      {item.name}
                    </Text>
                    <Text variant="priceSm" color="secondary">
                      {item.qty}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {stage === 2 && (
            <Notice
              tone="warning"
              title={`Show token ${CURRENT_ORDER.token} at the counter`}
              body="Check every item against the list above before you leave."
            />
          )}

          <Btn label={STAGE_CTAS[stage]} large glyph="check" onPress={onAdvance} />

          <View style={styles.secondaryRow}>
            <Btn
              label="Report problem"
              variant="quiet"
              onPress={() => setOverlay("problem")}
              style={{ flex: 1 }}
            />
            <Btn
              label="Cancel order"
              variant="danger"
              onPress={() => setOverlay("cancel")}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: layout.gutter, paddingTop: space[4], gap: space[3] },

  stageCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
  },
  stageHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[2] },

  stopsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  stopRow: { padding: space[3], flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  stopRowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  stopDot: { width: 11, height: 11, borderRadius: radius.pill, marginTop: 6 },

  itemsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
  },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3] },

  secondaryRow: { flexDirection: "row", gap: space[2] },
});
