import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Sheet, Toast, TopBar } from "@/components/ui";
import { VEHICLE_ROWS } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, radius, space, typography as t } from "@/theme";

export default function VehicleScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();
  const sheet = useSheet();

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }}>
        <TopBar back="Profile" />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Vehicle</Text>

        <View style={styles.plate}>
          <Text style={[t.kicker, { textAlign: "center" }]}>Registered two-wheeler</Text>
          <Text style={styles.plateNumber}>AP 05 CJ 4471</Text>
          <Text style={styles.plateMeta}>Honda Activa 6G · 2022 · white</Text>
        </View>

        <View style={{ marginTop: ms(16) }}>
          {VEHICLE_ROWS.map((r) => (
            <View key={r.l} style={styles.row}>
              <Text style={styles.rowLabel}>{r.l}</Text>
              <Text style={[styles.rowValue, { color: r.tone }]}>{r.v}</Text>
            </View>
          ))}
        </View>

        <Btn
          label="Request vehicle change"
          variant="ghost"
          onPress={() => say("Vehicle change request sent for review.")}
          style={{ marginTop: ms(18) }}
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
  title: {
    ...font.headingBold,
    fontSize: ms(28),
    lineHeight: ms(31),
    color: colors.text,
    marginTop: ms(12),
  },
  plate: {
    marginTop: ms(16),
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    padding: ms(18),
    alignItems: "center",
  },
  plateNumber: {
    ...font.headingBold,
    fontSize: ms(30),
    lineHeight: ms(33),
    letterSpacing: 0.6,
    color: colors.text,
    marginTop: ms(10),
    fontVariant: ["tabular-nums"],
  },
  plateMeta: {
    ...font.body,
    fontSize: ms(13),
    lineHeight: ms(18),
    color: colors.neutral700,
    marginTop: ms(7),
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: ms(10),
    paddingVertical: ms(14),
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowLabel: { ...font.body, fontSize: ms(14), color: colors.neutral700 },
  rowValue: { ...font.body, fontSize: ms(14), fontVariant: ["tabular-nums"] },
});
