import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { colors, font, ms, radius, shadow, space } from "@/theme";
import { Icon } from "./Icon";

const GRID = 28;

/** The 28px surveyor's grid that stands in for map tiles. */
function GridBackdrop({ width, height }: { width: number; height: number }) {
  const cols = Math.ceil(width / GRID) + 1;
  const rows = Math.ceil(height / GRID) + 1;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      {Array.from({ length: rows }, (_, i) => (
        <Line
          key={`h${i}`}
          x1={0}
          y1={i * GRID}
          x2={width}
          y2={i * GRID}
          stroke="#cfcaca"
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: cols }, (_, i) => (
        <Line
          key={`v${i}`}
          x1={i * GRID}
          y1={0}
          x2={i * GRID}
          y2={height}
          stroke="#cfcaca"
          strokeWidth={1}
        />
      ))}
    </Svg>
  );
}

/**
 * Navigation panel for the active order: grid backdrop, dashed route, pulsing
 * rider puck, target pin, distance/ETA card and map controls. A placeholder
 * for the real navigation SDK, styled exactly like the design.
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
          stroke={colors.ink}
          strokeWidth={3}
          strokeDasharray="9 7"
          opacity={0.8}
        />
      </Svg>

      {/* Rider puck + pulse */}
      <Animated.View
        style={[
          styles.pulse,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            transform: [
              { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.6] }) },
            ],
          },
        ]}
      />
      <View style={styles.rider} />

      {/* Target pin */}
      <View style={styles.target}>
        <View style={styles.targetPill}>
          <Text style={styles.targetLabel}>{target}</Text>
        </View>
        <View style={styles.targetDot} />
      </View>

      {/* Distance card */}
      <View style={styles.readout}>
        <Text style={styles.readoutKicker}>{kicker}</Text>
        <Text style={styles.readoutValue}>
          {distance} <Text style={styles.readoutEta}>· {eta}</Text>
        </Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <View style={styles.ctrl}>
          <Icon name="plus" size={ms(17)} color={colors.ink} strokeWidth={1.6} />
        </View>
        <View style={styles.ctrl}>
          <Icon name="navigate" size={ms(17)} color={colors.ink} strokeWidth={1.6} />
        </View>
      </View>

      <Text style={styles.caption}>Map placeholder · live navigation SDK</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#d7d3d3",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    position: "relative",
    overflow: "hidden",
  },
  rider: {
    position: "absolute",
    left: ms(52),
    bottom: ms(34),
    width: ms(20),
    height: ms(20),
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    borderWidth: 3,
    borderColor: colors.bg,
    ...shadow.sm,
  },
  pulse: {
    position: "absolute",
    left: ms(34),
    bottom: ms(22),
    width: ms(56),
    height: ms(56),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  target: { position: "absolute", right: ms(74), top: ms(40), alignItems: "center", gap: ms(4) },
  targetPill: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 3,
    paddingHorizontal: ms(7),
    paddingVertical: ms(3),
  },
  targetLabel: {
    ...font.bodySemi,
    fontSize: ms(9.5),
    letterSpacing: ms(9.5) * 0.1,
    textTransform: "uppercase",
    color: colors.text,
  },
  targetDot: {
    width: ms(11),
    height: ms(11),
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  readout: {
    position: "absolute",
    left: ms(12),
    top: ms(12),
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: ms(11),
    paddingVertical: ms(8),
  },
  readoutKicker: {
    ...font.bodySemi,
    fontSize: ms(9),
    letterSpacing: ms(9) * 0.14,
    textTransform: "uppercase",
    color: colors.neutral600,
  },
  readoutValue: {
    ...font.heading,
    fontSize: ms(20),
    lineHeight: ms(22),
    marginTop: ms(5),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  readoutEta: { fontSize: ms(13), color: colors.neutral700 },
  controls: {
    position: "absolute",
    right: ms(12),
    bottom: ms(12),
    gap: ms(6),
  },
  ctrl: {
    width: ms(34),
    height: ms(34),
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    position: "absolute",
    left: ms(12),
    bottom: ms(12),
    ...font.body,
    fontSize: ms(10),
    color: colors.neutral700,
  },
});
