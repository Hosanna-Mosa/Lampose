import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { Text } from "./Text";

/**
 * Incentive Bag Graphic using 3D real delivery bag & growth chart transparent PNG asset:
 * Displays 3D delivery bag, green growth chart with gold coins, and badge reading "More Orders Bigger Earnings!".
 * 100% transparent PNG with zero background box, zero grey shadows, and seamless blending.
 */
export function IncentiveBagGraphic() {
  return (
    <View style={styles.container}>
      {/* Badge Pill */}
      <View style={styles.badge}>
        <Text style={styles.badgeText}>More Orders{"\n"}Bigger Earnings!</Text>
      </View>

      {/* Real 3D Delivery Bag & Growth Chart Transparent PNG Asset */}
      <Image
        source={require("@/assets/images/incentive_delivery_bag.png")}
        style={styles.bagImage}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-end",
    position: "relative",
    width: 140,
    height: 110,
    backgroundColor: "transparent",
  },
  badge: {
    backgroundColor: "#064e3b",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 2,
    zIndex: 5,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 11,
  },
  bagImage: {
    width: 130,
    height: 95,
    backgroundColor: "transparent",
  },
});
