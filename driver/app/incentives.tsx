import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Bar, Chip, Text, TopBar } from "@/components/ui";
import { INCENTIVES } from "@/constants/lampose";
import { colors, layout, radius, space, tone as resolveTone } from "@/theme";

export default function IncentivesScreen() {

  return (
    <View style={styles.root}>
      <TopBar back="Home" title="Incentives" subtitle="₹300 earned this week" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={{ gap: space[3] }}>
          {INCENTIVES.map((i) => {
            const t = resolveTone(i.tone);
            return (
              <View key={i.title} style={styles.card}>
                <View style={styles.cardHead}>
                  <Chip label={i.tag} tone={i.tone} />
                  <Text variant="numMeta" color="tertiary">
                    {i.expiry}
                  </Text>
                </View>

                <Text variant="title1" style={{ marginTop: space[3] }}>
                  {i.title}
                </Text>
                <Text variant="caption" color="tertiary" style={{ marginTop: space[1] }}>
                  {i.sub}
                </Text>

                <Bar pct={i.pct} tone={t.base} style={{ marginTop: space[3] }} />

                <View style={styles.footRow}>
                  <Text variant="numMeta" color="tertiary" style={{ flex: 1 }}>
                    {i.progress}
                  </Text>
                  <Text variant="priceMd" style={{ color: t.ink }}>
                    {i.reward}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[4] },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[4],
    backgroundColor: colors.surface,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[2] },
  footRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space[3], gap: space[2] },
});
