import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Chip, Toast, TopBar } from "@/components/ui";
import { SUPPORT_TILES, TICKETS } from "@/constants/lampose";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, radius, space, typography as t } from "@/theme";

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }}>
        <TopBar back="Profile" />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Help & support</Text>
        <Text style={styles.sub}>Pick the closest topic — most issues are resolved in an hour.</Text>

        <View style={styles.grid}>
          {SUPPORT_TILES.map((tile) => (
            <Pressable
              key={tile.t}
              onPress={() => router.push("/ticket")}
              style={({ pressed }) => [styles.tile, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.tileTitle}>{tile.t}</Text>
              <Text style={styles.tileSub}>{tile.sub}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[t.kicker, { marginTop: ms(22) }]}>Your tickets</Text>
        <View style={{ marginTop: ms(11), gap: ms(10) }}>
          {TICKETS.map((ticket) => (
            <Pressable
              key={ticket.id}
              onPress={() => router.push("/ticket")}
              style={({ pressed }) => [styles.ticket, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.ticketHead}>
                <Text style={styles.ticketTitle}>{ticket.t}</Text>
                <Chip label={ticket.status} tone={ticket.tone} />
              </View>
              <Text style={styles.ticketMeta}>
                {ticket.id} · {ticket.at}
              </Text>
            </Pressable>
          ))}
        </View>

        <Btn
          label="Call partner support"
          variant="ghost"
          onPress={() => say("Connecting you to partner support…")}
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
  sub: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(19),
    color: colors.neutral700,
    marginTop: ms(4),
  },
  grid: {
    marginTop: ms(16),
    flexDirection: "row",
    flexWrap: "wrap",
    gap: ms(9),
  },
  tile: {
    width: "48%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    padding: ms(14),
    backgroundColor: colors.neutral100,
  },
  tileTitle: { ...font.heading, fontSize: ms(16), lineHeight: ms(19), color: colors.text },
  tileSub: {
    ...font.body,
    fontSize: ms(11.5),
    lineHeight: ms(16),
    color: colors.neutral700,
    marginTop: ms(5),
  },
  ticket: { borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg, padding: ms(14) },
  ticketHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: ms(10) },
  ticketTitle: {
    ...font.body,
    fontSize: ms(14),
    lineHeight: ms(19),
    color: colors.text,
    flex: 1,
  },
  ticketMeta: {
    ...font.body,
    fontSize: ms(11.5),
    color: colors.neutral600,
    marginTop: ms(7),
    fontVariant: ["tabular-nums"],
  },
});
