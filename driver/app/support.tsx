import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Chip, Icon, SectionHeader, Text, Toast, TopBar } from "@/components/ui";
import { SUPPORT_TILES, TICKETS } from "@/constants/lampose";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space } from "@/theme";

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();

  return (
    <View style={styles.root}>
      <TopBar back="Profile" title="Help &amp; support" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="caption" color="tertiary">
          Pick the closest topic — most issues are resolved in an hour.
        </Text>

        <View style={styles.grid}>
          {SUPPORT_TILES.map((tile) => (
            <Pressable
              key={tile.t}
              onPress={() => router.push("/ticket")}
              accessibilityRole="button"
              style={({ pressed }) => [styles.tile, pressed && { backgroundColor: colors.surfaceSunken }]}
            >
              <Text variant="title2" numberOfLines={2}>
                {tile.t}
              </Text>
              <Text variant="caption" color="tertiary">
                {tile.sub}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ gap: space[2] }}>
          <SectionHeader title="Your tickets" trailing={`${TICKETS.length} open`} />
          {TICKETS.map((ticket) => (
            <Pressable
              key={ticket.id}
              onPress={() => router.push("/ticket")}
              accessibilityRole="button"
              accessibilityLabel={`${ticket.t}, ${ticket.status}`}
              style={({ pressed }) => [styles.ticket, pressed && { backgroundColor: colors.surfaceSunken }]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
                <Text variant="bodyLg" numberOfLines={2}>
                  {ticket.t}
                </Text>
                <Text variant="numMeta" color="tertiary">
                  {ticket.id} · {ticket.at}
                </Text>
              </View>
              <Chip label={ticket.status} tone={ticket.tone} />
              <Icon name="chevronRight" size={15} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>

        <Btn
          label="Call partner support"
          variant="ghost"
          glyph="phone"
          onPress={() => say("Connecting you to partner support…")}
        />
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[4] },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  tile: {
    width: "48%",
    flexGrow: 1,
    gap: space[1],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[3],
    backgroundColor: colors.surface,
  },

  ticket: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[3],
    backgroundColor: colors.surface,
  },
});
