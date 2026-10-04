import React from "react";
import { StyleSheet, View } from "react-native";

import { dietColor } from "@/lib/diet";

/** The square-with-dot diet label printed on Indian food packaging: veg, egg, non-veg. */
export function VegMarker({ isVeg }: { isVeg?: string | null }) {
  const color = dietColor(isVeg);
  return (
    <View style={[styles.box, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 14, height: 14, borderWidth: 1.5, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
