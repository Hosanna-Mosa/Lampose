import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TopBar } from "@/components/ui";
import { INCENTIVES } from "@/constants/lampose";
import { colors, font, ms, radius, space } from "@/theme";

export default function IncentivesScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }}>
        <TopBar back="Home" />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Incentives</Text>
        <Text style={styles.sub}>₹300 earned from incentives this week</Text>

        <View style={{ marginTop: ms(16), gap: ms(12) }}>
          {INCENTIVES.map((i) => (
            <View key={i.title} style={[styles.card, { borderLeftColor: i.tone }]}>
              <View style={styles.cardHead}>
                <Text style={[styles.tag, { color: i.tone }]}>{i.tag}</Text>
                <Text style={styles.expiry}>{i.expiry}</Text>
              </View>
              <Text style={styles.cardTitle}>{i.title}</Text>
              <Text style={styles.cardSub}>{i.sub}</Text>
              <View style={styles.track}>
                <View style={{ width: `${i.pct}%`, height: "100%", backgroundColor: i.tone }} />
              </View>
              <View style={styles.footRow}>
                <Text style={styles.progress}>{i.progress}</Text>
                <Text style={styles.reward}>{i.reward}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[4], paddingBottom: ms(26) },
  title: { ...font.headingBold, fontSize: ms(30), lineHeight: ms(33), color: colors.text },
  sub: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(18),
    color: colors.neutral700,
    marginTop: ms(4),
  },
  card: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderLeftWidth: 2,
    borderRadius: radius.lg,
    padding: ms(16),
    backgroundColor: colors.neutral100,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: ms(8) },
  tag: {
    ...font.bodySemi,
    fontSize: ms(10),
    letterSpacing: ms(10) * 0.14,
    textTransform: "uppercase",
  },
  expiry: {
    ...font.body,
    fontSize: ms(11.5),
    color: colors.neutral600,
    fontVariant: ["tabular-nums"],
  },
  cardTitle: {
    ...font.heading,
    fontSize: ms(19),
    lineHeight: ms(23),
    color: colors.text,
    marginTop: ms(8),
  },
  cardSub: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(18),
    color: colors.neutral700,
    marginTop: ms(4),
  },
  track: {
    marginTop: ms(12),
    height: ms(5),
    borderRadius: 3,
    backgroundColor: colors.neutral300,
    overflow: "hidden",
  },
  footRow: { flexDirection: "row", justifyContent: "space-between", marginTop: ms(8), gap: ms(8) },
  progress: {
    ...font.body,
    fontSize: ms(12),
    color: colors.neutral700,
    fontVariant: ["tabular-nums"],
  },
  reward: {
    ...font.body,
    fontSize: ms(12),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
});
