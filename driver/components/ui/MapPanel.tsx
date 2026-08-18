import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { colors, elevation, radius, space } from "@/theme";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { Chip } from "./primitives";

const GRID = 28;

/** The 28px surveyor's grid that stands in for map tiles. */
function GridBackdrop({ width, height }: { width: number; height: number }) {
  const cols = Math.ceil(width / GRID) + 1;
  const rows = Math.ceil(height / GRID) + 1;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      {Array.from({ length: rows }, (_, i) => (
        <Line key={`h${i}`} x1={0} y1={i * GRID} x2={width} y2={i * GRID} stroke={colors.border} strokeWidth={1} />
      ))}
      {Array.from({ length: cols }, (_, i) => (
        <Line key={`v${i}`} x1={i * GRID} y1={0} x2={i * GRID} y2={height} stroke={colors.border} strokeWidth={1} />
      ))}
    </Svg>
  );
}

/**
 * Navigation panel for the active order: grid backdrop, dashed route, pulsing
 * rider puck, target pin, distance/ETA card and map controls. A placeholder
 * for the real navigation SDK.
 *
 * The route is brand green rather than ink — on every other surface in the
 * product green is what marks the live thing, and a route in progress is
 * exactly that. The readout is a floating white card, matching the way the
 * food module lifts a summary off the content behind it.
 */
export function MapPanel({
  height,
  width = 390,
  kicker,
  distance,
  eta,
  target,
}: {
  height: number;
  width?: number;
  kicker: string;
  distance: string;
  eta: string;
  target: string;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={[styles.wrap, { height }]}>
      <View style={StyleSheet.absoluteFill}>
        <GridBackdrop width={width} height={height} />
      </View>

      {/* Dashed route */}
      <Svg
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        viewBox="0 0 390 240"
        preserveAspectRatio="none"
      >
        <Path
          d="M64 196 C110 176 96 120 148 106 C196 93 214 66 300 54"
          fill="none"
          stroke={colors.brand}
          strokeWidth={4}
          strokeDasharray="10 8"
          strokeLinecap="round"
        />
      </Svg>

      {/* Rider puck + pulse */}
      <Animated.View
        style={[
          styles.pulse,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.6] }) }],
          },
        ]}
      />
      <View style={styles.rider} />

      {/* Target pin */}
      <View style={styles.target}>
        <Chip label={target} tone="brand" />
        <View style={styles.targetDot} />
      </View>

      {/* Distance card */}
      <View style={styles.readout}>
        <Text variant="eyebrow" color="tertiary">
          {kicker}
        </Text>
        <View style={styles.readoutRow}>
          <Text variant="priceHero">{distance}</Text>
          <Text variant="numMeta" color="tertiary">
            {eta}
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <View style={styles.ctrl}>
          <Icon name="plus" size={17} color={colors.textPrimary} />
        </View>
        <View style={styles.ctrl}>
          <Icon name="navigate" size={17} color={colors.textPrimary} />
        </View>
      </View>

      <View style={styles.caption}>
        <Text variant="numMeta" color="tertiary">
          Map placeholder · live navigation SDK
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceSunken,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    position: "relative",
    overflow: "hidden",
  },
  rider: {
    position: "absolute",
    left: 52,
    bottom: 34,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    borderWidth: 3,
    borderColor: colors.surface,
    ...elevation.card,
  },
  pulse: {
    position: "absolute",
    left: 34,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.brand,
  },
  target: { position: "absolute", right: 66, top: 40, alignItems: "center", gap: space[1] },
  targetDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    borderWidth: 2.5,
    borderColor: colors.surface,
    ...elevation.raised,
  },

  readout: {
    position: "absolute",
    left: space[3],
    top: space[3],
    gap: space[1],
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: space[3],
    paddingVertical: space[2] + 2,
    ...elevation.card,
  },
  readoutRow: { flexDirection: "row", alignItems: "baseline", gap: space[2] },

  controls: { position: "absolute", right: space[3], bottom: space[3], gap: space[2] },
  ctrl: {
    width: 36,
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.raised,
  },

  caption: {
    position: "absolute",
    left: space[3],
    bottom: space[3],
    backgroundColor: colors.surface,
    borderRadius: radius.chip,
    paddingHorizontal: space[2],
    paddingVertical: 3,
  },
});
