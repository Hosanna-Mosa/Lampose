import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Icon, IconBtn, MapPanel, Sheet, StepBars, Toast, TopBar } from "@/components/ui";
import {
  CURRENT_ORDER,
  ORDER_ITEMS,
  STAGE_CTAS,
  STAGE_HINTS,
  STAGES,
} from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { TOTAL_STAGES, useFlowStore } from "@/store/flowStore";
import { colors, font, ms, radius, space, typography as t } from "@/theme";

/**
 * The stage rail is the screen's spine — the current stage in ink, the rest
 * hairline. Map height grows on the two travelling stages.
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
      <View style={{ paddingTop: insets.top }}>
        <TopBar
          back="Home"
          onBack={() => router.replace("/")}
          center={`Order ${CURRENT_ORDER.id}`}
          action="Help"
          onAction={() => router.push("/support")}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: ms(26) }}>
        <MapPanel
          height={travelling ? ms(252) : ms(168)}
          kicker={toRestaurant ? "To restaurant" : "To customer"}
          distance={toRestaurant ? "1.2 km" : "3.6 km"}
          eta={toRestaurant ? "4 min" : "12 min"}
          target={toRestaurant ? "Restaurant" : "Customer"}
        />

        <View style={styles.body}>
          <View style={styles.stageHead}>
            <Text style={styles.stageCount}>
              Stage {stage + 1} of {TOTAL_STAGES}
            </Text>
            <Text style={styles.stageFacts}>
              {CURRENT_ORDER.earn} · {CURRENT_ORDER.distance}
            </Text>
          </View>

          <Text style={styles.stageName}>{STAGES[stage]}</Text>

          <StepBars
            total={TOTAL_STAGES}
            current={stage}
            height={ms(5)}
            activeTone={colors.ink}
            style={{ marginTop: ms(14) }}
          />

          <Text style={styles.stageHint}>{STAGE_HINTS[stage]}</Text>

          {/* ── Stops ────────────────────────────────────────────────── */}
          <View style={styles.stopsCard}>
            <View style={[styles.stopRow, styles.stopRowDivided]}>
              <View
                style={[
                  styles.stopDot,
                  pickedUp
                    ? { backgroundColor: colors.ink }
                    : { borderWidth: 1.5, borderColor: colors.ink },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={t.kicker}>Pickup</Text>
                <Text style={styles.stopName}>{CURRENT_ORDER.restaurant}</Text>
                <Text style={styles.stopMeta}>
                  Danavaipeta Main Road · token {CURRENT_ORDER.token}
                </Text>
              </View>
              <IconBtn
                accessibilityLabel="Call the restaurant"
                onPress={() => say("Calling Paradise Biryani…")}
              >
                <Icon name="phone" size={ms(17)} color={colors.accent700} strokeWidth={1.6} />
              </IconBtn>
            </View>

            <View style={styles.stopRow}>
              <View
                style={[
                  styles.stopDot,
                  stage >= 5
                    ? { backgroundColor: colors.ink }
                    : { borderWidth: 1.5, borderColor: colors.neutral400 },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={t.kicker}>Drop</Text>
                <Text style={styles.stopName}>{CURRENT_ORDER.customer}</Text>
                <Text style={styles.stopMeta}>
                  {pickedUp
                    ? CURRENT_ORDER.dropAddress
                    : `${CURRENT_ORDER.dropArea} · unlocks after pickup`}
                </Text>
                {pickedUp && (
                  <Text style={styles.dropNote}>
                    “Call when you reach the gate, second building.”
                  </Text>
                )}
              </View>
              <IconBtn
                accessibilityLabel="Call the customer"
                onPress={() => say("Calling Sneha via masked number…")}
              >
                <Icon name="phone" size={ms(17)} color={colors.accent700} strokeWidth={1.6} />
              </IconBtn>
            </View>
          </View>

          {/* ── Items, once at the counter ───────────────────────────── */}
          {stage >= 2 && (
            <View style={styles.itemsCard}>
              <Text style={t.kicker}>Order · 3 items · prepaid ₹640</Text>
              <View style={{ marginTop: ms(10), gap: ms(9) }}>
                {ORDER_ITEMS.map((item) => (
                  <View key={item.name} style={styles.itemRow}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemQty}>{item.qty}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <Btn label={STAGE_CTAS[stage]} onPress={onAdvance} style={styles.advanceBtn} />

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

      <Toast message={toast} top={insets.top + ms(8)} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: space[4], paddingTop: ms(16) },

  stageHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  stageCount: {
    ...font.bodySemi,
    fontSize: ms(10),
    letterSpacing: ms(10) * 0.16,
    textTransform: "uppercase",
    color: colors.accent700,
  },
  stageFacts: {
    ...font.body,
    fontSize: ms(12.5),
    color: colors.neutral700,
    fontVariant: ["tabular-nums"],
  },
  stageName: {
    ...font.headingBold,
    fontSize: ms(28),
    lineHeight: ms(31),
    letterSpacing: -0.3,
    color: colors.text,
    marginTop: ms(8),
  },
  stageHint: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(19),
    color: colors.neutral700,
    marginTop: ms(9),
  },

  stopsCard: {
    marginTop: ms(16),
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  stopRow: { padding: ms(14), flexDirection: "row", gap: ms(12), alignItems: "flex-start" },
  stopRowDivided: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  stopDot: { width: ms(10), height: ms(10), borderRadius: radius.pill, marginTop: ms(6) },
  stopName: {
    ...font.heading,
    fontSize: ms(17),
    lineHeight: ms(20),
    color: colors.text,
    marginTop: ms(3),
  },
  stopMeta: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(18),
    color: colors.neutral700,
  },
  dropNote: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(18),
    color: colors.accent700,
    marginTop: ms(5),
  },

  itemsCard: {
    marginTop: ms(14),
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    padding: ms(14),
  },
  itemRow: { flexDirection: "row", justifyContent: "space-between", gap: ms(10) },
  itemName: { ...font.body, fontSize: ms(13.5), lineHeight: ms(18), flex: 1, color: colors.text },
  itemQty: {
    ...font.body,
    fontSize: ms(13.5),
    color: colors.neutral700,
    fontVariant: ["tabular-nums"],
  },

  advanceBtn: { marginTop: ms(16), paddingVertical: ms(22) },
  secondaryRow: { flexDirection: "row", gap: ms(9), marginTop: ms(9) },
});
