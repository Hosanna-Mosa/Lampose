import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatCard } from "@/app/(tabs)/index";
import { Btn, Icon, Toast } from "@/components/ui";
import { CURRENT_ORDER } from "@/constants/lampose";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, radius, space, typography as t } from "@/theme";

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
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + ms(30) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.tick}>
          <Icon name="check" size={ms(30)} color={colors.ok} strokeWidth={1.6} />
        </View>

        <Text style={styles.title}>Delivery completed</Text>
        <Text style={styles.sub}>
          Order {CURRENT_ORDER.id} · {CURRENT_ORDER.customer}
        </Text>

        {/* ── The money ─────────────────────────────────────────────── */}
        <View style={styles.earnBlock}>
          <Text style={[t.kicker, { textAlign: "center" }]}>You earned</Text>
          <Text style={styles.earnFigure}>₹86</Text>
          <Text style={styles.earnBreak}>₹64 delivery + ₹12 distance + ₹10 tip</Text>
        </View>

        <View style={styles.statGrid}>
          <StatCard label="Distance" value="4.8 km" />
          <StatCard label="Duration" value="21 min" />
          <StatCard label="Today" value={`₹${earned}`} />
        </View>

        {/* ── Rating ────────────────────────────────────────────────── */}
        <View style={styles.rateCard}>
          <Text style={styles.rateTitle}>How was {CURRENT_ORDER.restaurant}?</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${star} of 5`}
                hitSlop={6}
                onPress={() => {
                  setRating(star);
                  say("Thanks — your rating helps other partners.");
                }}
              >
                <Text
                  style={[
                    styles.star,
                    { color: star <= rating ? colors.accent : colors.neutral300 },
                  ]}
                >
                  ★
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Btn label="Back to home" onPress={backHome} style={{ marginTop: ms(16) }} />
        <Btn
          label="View order details"
          variant="ghost"
          onPress={() => router.push("/order-detail")}
          style={{ marginTop: ms(9) }}
        />
      </ScrollView>

      <Toast message={toast} top={insets.top + ms(8)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[4], paddingBottom: ms(26), alignItems: "stretch" },

  tick: {
    width: ms(66),
    height: ms(66),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.ok,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  title: {
    ...font.headingBold,
    fontSize: ms(32),
    lineHeight: ms(35),
    color: colors.text,
    marginTop: ms(18),
    textAlign: "center",
  },
  sub: {
    ...font.body,
    fontSize: ms(13.5),
    lineHeight: ms(20),
    color: colors.neutral700,
    marginTop: ms(6),
    textAlign: "center",
  },

  earnBlock: {
    marginTop: ms(22),
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    paddingVertical: ms(20),
    alignItems: "center",
  },
  earnFigure: {
    ...font.headingBold,
    fontSize: ms(58),
    lineHeight: ms(60),
    letterSpacing: -1.2,
    marginTop: ms(8),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  earnBreak: {
    ...font.body,
    fontSize: ms(12.5),
    color: colors.neutral700,
    marginTop: ms(8),
  },

  statGrid: { flexDirection: "row", gap: ms(9), marginTop: ms(16) },

  rateCard: {
    marginTop: ms(16),
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    padding: ms(16),
  },
  rateTitle: {
    ...font.heading,
    fontSize: ms(16),
    lineHeight: ms(21),
    color: colors.text,
    textAlign: "center",
  },
  stars: { flexDirection: "row", gap: ms(10), justifyContent: "center", marginTop: ms(12) },
  star: { ...font.body, fontSize: ms(27), lineHeight: ms(31) },
});
