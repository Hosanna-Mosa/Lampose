import React from "react";
import { StyleSheet, View, type DimensionValue } from "react-native";
import Animated from "react-native-reanimated";

import { radius as radii, ui } from "@/theme/ui";
import { useShimmer } from "./motion";

interface Props {
  width: DimensionValue;
  height: DimensionValue;
  radius?: number;
}

/** A shimmering loading placeholder. */
export function Skeleton({ width, height, radius = radii.sm }: Props) {
  const shimmer = useShimmer();
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: ui.sunken }, shimmer]} />;
}

/** Placeholders in the shape of an order card, while a list loads. */
export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.list} accessibilityLabel="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.row}>
            <Skeleton width={40} height={40} radius={12} />
            <View style={styles.texts}>
              <Skeleton width="55%" height={14} />
              <Skeleton width="35%" height={12} />
            </View>
            <Skeleton width={56} height={14} />
          </View>
          <Skeleton width="70%" height={12} />
          <Skeleton width={110} height={22} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  card: {
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: radii.lg,
    padding: 14,
    gap: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  texts: { flex: 1, gap: 6 },
});
