import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Btn, Chip, DataRow, Text, Toast, TopBar } from "@/components/ui";
import { DRIVER } from "@/constants/lampose";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space, tone as resolveTone, type ToneName } from "@/theme";

const ROWS: { l: string; v: string; tone?: ToneName }[] = [
  { l: "Full name", v: DRIVER.name },
  { l: "Date of birth", v: "14 Jun 1996" },
  { l: "Mobile number", v: DRIVER.phone },
  { l: "City", v: "Rajahmundry" },
  { l: "Partner ID", v: DRIVER.partnerId },
  { l: "Partner since", v: "Mar 2024" },
  { l: "Aadhaar", v: "•••• •••• 4412" },
  { l: "PAN", v: "Under review", tone: "warning" },
];

export default function ProfileDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();

  return (
    <View style={styles.root}>
      <TopBar back="Profile" title="Personal information" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="caption" color="tertiary">
          Verified against the documents you submitted.
        </Text>

        <View style={styles.identity}>
          <Avatar name={DRIVER.name} size={56} />
          <View style={{ flex: 1, minWidth: 0, gap: space[2] }}>
            <Text variant="display2" numberOfLines={1}>
              {DRIVER.name}
            </Text>
            <Chip label="Verified partner" tone="success" glyph="shield" />
          </View>
        </View>

        <View style={styles.card}>
          {ROWS.map((r, i) => (
            <DataRow
              key={r.l}
              label={r.l}
              value={r.v}
              first={i === 0}
              valueTone={r.tone ? resolveTone(r.tone).ink : undefined}
            />
          ))}
        </View>

        <Btn
          label="Request a correction"
          variant="ghost"
          glyph="support"
          onPress={() => say("Correction request sent to the verification team.")}
        />
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[4] },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
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
