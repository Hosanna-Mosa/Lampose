import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Icon, SectionHeader, Sheet, Text, Toast, Toggle, TopBar } from "@/components/ui";
import { SETTING_ROWS, SWITCHES } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space } from "@/theme";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say, switches, toggleSwitch, setOverlay } = useFlowStore();
  const sheet = useSheet();

  return (
    <View style={styles.root}>
      <TopBar back="Profile" title="Settings" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={{ gap: space[2] }}>
          <SectionHeader title="Notifications" />
          <View style={styles.group}>
            {SWITCHES.map((s, i) => (
              <View key={s.k} style={[styles.toggleRow, i > 0 && styles.divided]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="bodyLg">{s.t}</Text>
                  <Text variant="caption" color="tertiary">
                    {s.sub}
                  </Text>
                </View>
                <Toggle
                  value={!!switches[s.k]}
                  onChange={() => toggleSwitch(s.k)}
                  accessibilityLabel={s.t}
                />
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: space[2] }}>
          <SectionHeader title="Preferences" />
          <View style={styles.group}>
            {SETTING_ROWS.map((row, i) => (
              <Pressable
                key={row.t}
                onPress={() => say(row.toast)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.divided,
                  pressed && { backgroundColor: colors.surfaceSunken },
                ]}
              >
                <Text variant="bodyLg" style={{ flex: 1 }}>
                  {row.t}
                </Text>
                {!!row.meta && (
                  <Text variant="numMeta" color="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {row.meta}
                  </Text>
                )}
                <Icon name="chevronRight" size={15} color={colors.textTertiary} />
              </Pressable>
            ))}
          </View>
        </View>

        <Btn label="Log out" variant="danger" glyph="logout" onPress={() => setOverlay("logout")} />
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[4] },
  group: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[3],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[3] + 2,
    paddingHorizontal: space[3],
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
});
