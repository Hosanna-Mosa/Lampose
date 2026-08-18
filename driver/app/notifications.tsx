import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip, Sheet, Text, Toast, TopBar } from "@/components/ui";
import { NOTIFS } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space } from "@/theme";

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();
  const sheet = useSheet();

  return (
    <View style={styles.root}>
      <TopBar
        back="Home"
        title="Notifications"
        action="Mark all read"
        onAction={() => say("All notifications marked as read.")}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/*
          Unread is a tinted card, not a coloured dot. A 7pt dot at the left
          edge is the first thing that disappears in sunlight, and "which of
          these have I already seen" is the only question this screen answers.
        */}
        <View style={{ gap: space[2] }}>
          {NOTIFS.map((n, i) => (
            <View
              key={`${n.cat}-${i}`}
              style={[
                styles.row,
                n.unread
                  ? { backgroundColor: colors.surface, borderColor: colors.border }
                  : { backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle },
              ]}
            >
              <View style={styles.rowHead}>
                <Chip label={n.cat} tone={n.tone} />
                <Text variant="numMeta" color="tertiary">
                  {n.at}
                </Text>
              </View>
              <Text variant="bodyLg" color={n.unread ? "primary" : "secondary"}>
                {n.t}
              </Text>
            </View>
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
  row: {
    gap: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: space[3],
  },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[2] },
});
