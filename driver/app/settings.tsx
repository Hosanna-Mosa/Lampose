import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Sheet, Toast, Toggle, TopBar } from "@/components/ui";
import { SETTING_ROWS, SWITCHES } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, space, typography as t } from "@/theme";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say, switches, toggleSwitch, setOverlay } = useFlowStore();
  const sheet = useSheet();

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }}>
        <TopBar back="Profile" />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>

        <Text style={[t.kicker, { marginTop: ms(20) }]}>Notifications</Text>
        <View style={{ marginTop: ms(8) }}>
          {SWITCHES.map((s) => (
            <View key={s.k} style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{s.t}</Text>
                <Text style={styles.rowSub}>{s.sub}</Text>
              </View>
              <Toggle
                value={!!switches[s.k]}
                onChange={() => toggleSwitch(s.k)}
                accessibilityLabel={s.t}
              />
            </View>
          ))}
        </View>

        <Text style={[t.kicker, { marginTop: ms(24) }]}>Preferences</Text>
        <View style={{ marginTop: ms(8) }}>
          {SETTING_ROWS.map((row) => (
            <Pressable
              key={row.t}
              onPress={() => say(row.toast)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.rowLabel}>{row.t}</Text>
              <View style={styles.rowRight}>
                {!!row.meta && <Text style={styles.rowMeta}>{row.meta}</Text>}
                <Text style={styles.chevron}>›</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <Btn
          label="Log out"
          variant="danger"
          onPress={() => setOverlay("logout")}
          style={{ marginTop: ms(20) }}
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(12),
    paddingVertical: ms(14),
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: ms(12),
    paddingVertical: ms(14),
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowLabel: { ...font.body, fontSize: ms(14.5), lineHeight: ms(19), color: colors.text },
  rowSub: {
    ...font.body,
    fontSize: ms(12),
    lineHeight: ms(17),
    color: colors.neutral700,
    marginTop: ms(2),
  },
  rowRight: { flexDirection: "row", alignItems: "center", gap: ms(9) },
  rowMeta: { ...font.body, fontSize: ms(12), color: colors.neutral600 },
  chevron: { color: colors.accent, ...font.body, fontSize: ms(15) },
});
