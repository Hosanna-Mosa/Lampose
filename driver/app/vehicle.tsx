import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, DataRow, Icon, Sheet, Text, Toast, TopBar } from "@/components/ui";
import { VEHICLE_ROWS } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space, tone as resolveTone } from "@/theme";

export default function VehicleScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();
  const sheet = useSheet();

  return (
    <View style={styles.root}>
      <TopBar back="Profile" title="Vehicle" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="caption" color="tertiary">
          The vehicle your deliveries are assigned against.
        </Text>

        {/* The plate, set in the numeric face — it is an identifier, not a name. */}
        <View style={styles.plate}>
          <View style={styles.plateGlyph}>
            <Icon name="vehicle" size={20} color={colors.brandInk} />
          </View>
          <Text variant="eyebrow" color="tertiary">
            Registered two-wheeler
          </Text>
          <Text variant="priceHero" style={{ marginTop: space[2] }}>
            AP 05 CJ 4471
          </Text>
          <Text variant="caption" color="tertiary" style={{ marginTop: space[1] }}>
            Honda Activa 6G · 2022 · white
          </Text>
        </View>

        <View style={styles.card}>
          {VEHICLE_ROWS.map((r, i) => (
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
          label="Request vehicle change"
          variant="ghost"
          glyph="refresh"
          onPress={() => say("Vehicle change request sent for review.")}
        />
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[4] },
  plate: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[5],
    alignItems: "center",
  },
  plateGlyph: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[3],
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
