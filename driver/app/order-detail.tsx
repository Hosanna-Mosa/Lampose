import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Btn, Chip, DataRow, Rule, Text, TopBar } from "@/components/ui";
import { ORDER_EARNINGS, TIMELINE } from "@/constants/lampose";
import { colors, layout, radius, space, tone as resolveTone } from "@/theme";

export default function OrderDetailScreen() {

  return (
    <View style={styles.root}>
      <TopBar back="Orders" title="Paradise Biryani" subtitle="#LP48291 · 16 Aug, 7:42 pm" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Chip label="Delivered" tone="success" glyph="check" />

        {/* ── Timeline ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text variant="eyebrow" color="tertiary">
            Timeline
          </Text>
          <View style={{ marginTop: space[3] }}>
            {TIMELINE.map((step, i) => {
              const last = i === TIMELINE.length - 1;
              return (
                <View key={step.t} style={{ flexDirection: "row", gap: space[3] }}>
                  <View style={styles.railCol}>
                    <View style={styles.railDot} />
                    {!last && <View style={styles.railLine} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: last ? 0 : space[4], gap: 2 }}>
                    <Text variant="bodyStrong">{step.t}</Text>
                    <Text variant="numMeta" color="tertiary">
                      {step.at}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Earnings ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text variant="eyebrow" color="tertiary">
            Your earnings
          </Text>
          <View style={{ marginTop: space[1] }}>
            {ORDER_EARNINGS.map((r, i) => (
              <DataRow
                key={r.l}
                label={r.l}
                value={r.v}
                first={i === 0}
                valueTone={r.tone ? resolveTone(r.tone).ink : undefined}
              />
            ))}
          </View>
          <Rule style={{ marginTop: space[3], marginBottom: space[4] }} />
          <View style={styles.totalRow}>
            <Text variant="label" color="tertiary">
              Total paid to you
            </Text>
            <Text variant="priceHero">₹86</Text>
          </View>
        </View>

        {/* ── Order value ──────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text variant="eyebrow" color="tertiary">
            Order value
          </Text>
          <View style={{ marginTop: space[1] }}>
            <DataRow label="Customer bill (prepaid)" value="₹640" first />
            <DataRow label="Delivery fee charged" value="₹39" />
            <DataRow label="Distance travelled" value="4.8 km · 21 min" />
          </View>
        </View>

        <Btn
          label="Raise an issue with this order"
          variant="ghost"
          glyph="support"
          onPress={() => router.push("/support")}
        />
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
  railCol: { width: 10, alignItems: "center" },
  railDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    marginTop: 5,
  },
  railLine: { flex: 1, width: 1.5, backgroundColor: colors.border, marginTop: 2 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[3] },
});
