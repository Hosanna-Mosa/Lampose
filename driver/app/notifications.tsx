import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sheet, Toast, TopBar } from "@/components/ui";
import { NOTIFS } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, radius, space } from "@/theme";

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();
  const sheet = useSheet();

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }}>
        <TopBar back="Home" />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Text style={styles.title}>Notifications</Text>
          <Pressable onPress={() => say("All notifications marked as read.")} hitSlop={8}>
            <Text style={styles.link}>Mark all read</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: ms(16) }}>
          {NOTIFS.map((n, i) => (
            <View key={`${n.cat}-${i}`} style={styles.row}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: n.unread ? colors.accent : "transparent" },
                ]}
              />
              <View style={{ flex: 1 }}>
                <View style={styles.rowHead}>
                  <Text style={[styles.cat, { color: n.tone }]}>{n.cat}</Text>
                  <Text style={styles.at}>{n.at}</Text>
                </View>
                <Text style={styles.body}>{n.t}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Toast message={toast} top={insets.top + ms(8)} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[4], paddingBottom: ms(26) },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  title: { ...font.headingBold, fontSize: ms(30), lineHeight: ms(33), color: colors.text },
  link: { ...font.body, fontSize: ms(12.5), color: colors.accent700 },
  row: {
    flexDirection: "row",
    gap: ms(11),
    paddingVertical: ms(14),
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  dot: { width: ms(7), height: ms(7), borderRadius: radius.pill, marginTop: ms(7) },
  rowHead: { flexDirection: "row", justifyContent: "space-between", gap: ms(8) },
  cat: {
    ...font.bodySemi,
    fontSize: ms(9.5),
    letterSpacing: ms(9.5) * 0.14,
    textTransform: "uppercase",
  },
  at: {
    ...font.body,
    fontSize: ms(11),
    color: colors.neutral500,
    fontVariant: ["tabular-nums"],
  },
  body: {
    ...font.body,
    fontSize: ms(14.5),
    lineHeight: ms(20),
    color: colors.text,
    marginTop: ms(6),
  },
});
