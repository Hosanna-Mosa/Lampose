import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Btn, Chip, Toast, TopBar } from "@/components/ui";
import { DRIVER } from "@/constants/lampose";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, space } from "@/theme";

const ROWS = [
  { l: "Full name", v: DRIVER.name },
  { l: "Date of birth", v: "14 Jun 1996" },
  { l: "Mobile number", v: DRIVER.phone },
  { l: "City", v: "Rajahmundry" },
  { l: "Partner ID", v: DRIVER.partnerId },
  { l: "Partner since", v: "Mar 2024" },
  { l: "Aadhaar", v: "•••• •••• 4412" },
  { l: "PAN", v: "Under review", tone: colors.warn },
];

export default function ProfileDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }}>
        <TopBar back="Profile" />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Personal information</Text>

        <View style={styles.identity}>
          <Avatar name={DRIVER.name} size={ms(56)} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{DRIVER.name}</Text>
            <Chip label="Verified partner" tone={colors.ok} style={{ marginTop: ms(6) }} />
          </View>
        </View>

        <View style={{ marginTop: ms(18) }}>
          {ROWS.map((r) => (
            <View key={r.l} style={styles.row}>
              <Text style={styles.rowLabel}>{r.l}</Text>
              <Text style={[styles.rowValue, r.tone ? { color: r.tone } : null]}>{r.v}</Text>
            </View>
          ))}
        </View>

        <Btn
          label="Request a correction"
          variant="ghost"
          onPress={() => say("Correction request sent to the verification team.")}
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
  title: {
    ...font.headingBold,
    fontSize: ms(28),
    lineHeight: ms(31),
    color: colors.text,
    marginTop: ms(12),
  },
  identity: { flexDirection: "row", alignItems: "center", gap: ms(14), marginTop: ms(16) },
  name: { ...font.headingBold, fontSize: ms(22), lineHeight: ms(25), color: colors.text },
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
  rowValue: {
    ...font.body,
    fontSize: ms(14),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
});
