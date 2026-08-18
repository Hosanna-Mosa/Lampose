import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatCard } from "@/app/(tabs)/index";
import { Btn, Icon, Text, Toast, TopBar } from "@/components/ui";
import { CURRENT_ORDER } from "@/constants/lampose";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space } from "@/theme";

/** Completion states the money first, then closes the loop. */
export default function CompleteScreen() {
  const insets = useSafeAreaInsets();
  const { toast, earned, resetFlow, say } = useFlowStore();
  const [rating, setRating] = useState(0);

  const backHome = () => {
    resetFlow();
    router.replace("/");
  };

  return (
    <View style={styles.root}>
      <TopBar title="Delivery complete" subtitle={CURRENT_ORDER.id} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.tick}>
          <Icon name="check" size={28} color={colors.onBrand} strokeWidth={2.5} />
        </View>

        <Text variant="display1" style={styles.centered}>
          Delivery completed
        </Text>
        <Text variant="caption" color="tertiary" style={styles.centered}>
          Order {CURRENT_ORDER.id} · {CURRENT_ORDER.customer}
        </Text>

        {/* ── The money ─────────────────────────────────────────────── */}
        <View style={styles.earnBlock}>
          <Text variant="eyebrow" style={{ color: colors.brandInk }}>
            You earned
          </Text>
          <Text variant="codeHero" adjustsFontSizeToFit numberOfLines={1} style={{ marginTop: space[2] }}>
            ₹86
          </Text>
          <Text variant="numMeta" color="secondary" style={{ marginTop: space[2] }}>
            ₹64 delivery + ₹12 distance + ₹10 tip
          </Text>
        </View>

        <View style={styles.statGrid}>
          <StatCard label="Distance" value="4.8 km" />
          <StatCard label="Duration" value="21 min" />
          <StatCard label="Today" value={`₹${earned}`} />
        </View>

        {/* ── Rating ────────────────────────────────────────────────── */}
        <View style={styles.rateCard}>
          <Text variant="title1" style={{ textAlign: "center" }}>
            How was {CURRENT_ORDER.restaurant}?
          </Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${star} of 5`}
                accessibilityState={{ selected: star <= rating }}
                hitSlop={8}
                onPress={() => {
                  setRating(star);
                  say("Thanks — your rating helps other partners.");
                }}
              >
                <Icon
                  name="star"
                  size={30}
                  color={star <= rating ? colors.warning.base : colors.border}
                  fill={star <= rating ? colors.warning.base : "none"}
                />
              </Pressable>
            ))}
          </View>
        </View>

        <Btn label="Back to home" glyph="home" onPress={backHome} />
        <Btn
          label="View order details"
          variant="ghost"
          onPress={() => router.push("/order-detail")}
        />
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[6],
    paddingBottom: space[6],
    alignItems: "stretch",
    gap: space[3],
  },
  centered: { textAlign: "center" },

  tick: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: space[2],
  },

  earnBlock: {
    marginTop: space[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    backgroundColor: colors.brandTint,
    borderRadius: radius.card,
    paddingVertical: space[5],
    paddingHorizontal: space[4],
    alignItems: "center",
  },

  statGrid: { flexDirection: "row", gap: space[2] },

  rateCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
    marginBottom: space[2],
  },
  stars: { flexDirection: "row", gap: space[3], justifyContent: "center", marginTop: space[3] },
});
