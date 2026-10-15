import React from "react";
import { Image, StyleSheet, Text as RNText, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "@/theme";

/**
 * Scooter Rider Graphic using 3D real scooter rider transparent PNG asset:
 * Features the realistic 3D delivery rider on a green electric scooter, floating green pin, and speech bubble reading "Let's deliver happiness! 🚀".
 * 100% transparent PNG with zero background box, zero grey shadows, and seamless blending on top mint gradient.
 */
export function ScooterRiderGraphic() {
  return (
    <View style={styles.container}>
      {/* Speech bubble at top right */}
      <View style={styles.speechBubble}>
        <RNText style={styles.speechText}>
          Let's deliver happiness! 🚀
        </RNText>
        <View style={styles.bubbleTail} />
      </View>

      <View style={styles.graphicWrapper}>
        {/* Floating Green Location Pin SVG */}
        <View style={styles.pinWrapper}>
          <Svg width={26} height={32} viewBox="0 0 24 32" fill="none">
            <Path
              d="M12 0C5.37 0 0 5.37 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.37 18.63 0 12 0ZM12 16C9.79 16 8 14.21 8 12C8 9.79 9.79 8 12 8C14.21 8 16 9.79 16 12C16 14.21 14.21 16 12 16Z"
              fill={colors.brand}
            />
          </Svg>
        </View>

        {/* Real 3D Scooter Rider Transparent PNG Asset */}
        <Image
          source={require("@/assets/images/scooter_rider_mascot.png")}
          style={styles.scooterImage}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-end",
    position: "relative",
    width: 155,
    height: 130,
    backgroundColor: "transparent",
  },
  speechBubble: {
    backgroundColor: colors.surface,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 2,
    marginRight: 4,
    zIndex: 10,
  },
  speechText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textPrimary,
    fontFamily: "System",
  },
  bubbleTail: {
    position: "absolute",
    bottom: -6,
    right: 22,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderStyle: "solid",
    backgroundColor: "transparent",
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: colors.surface,
  },
  graphicWrapper: {
    width: 140,
    height: 100,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  pinWrapper: {
    position: "absolute",
    top: 4,
    right: 2,
    zIndex: 5,
  },
  scooterImage: {
    width: 135,
    height: 95,
    backgroundColor: "transparent",
  },
});
