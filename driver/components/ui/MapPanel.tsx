import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Path, Polygon } from "react-native-svg";
import { colors, elevation, radius, space } from "@/theme";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { Chip } from "./primitives";

/* ── Geometry ─────────────────────────────────────────────────────────────
   Kept in step with the customer app's `components/food/DeliveryMap.tsx`,
   which draws the same three points from the other side of the delivery. Two
   copies rather than a shared package because there is no workspace tooling in
   this monorepo — but they must agree, or the rider and the diner would be
   reading two different pictures of one journey. */

export type LngLat = readonly [number, number];

/** Metres between two points, haversine. The figure under the map is real. */
export function metresBetween(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "1.4 km" over a kilometre, "320 m" under it. Nobody says "0.32 km". */
export function readableDistance(metres: number): string {
  if (!Number.isFinite(metres)) return "";
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres / 10) * 10} m`;
}

/**
 * Longitude/latitude onto the view box, at one uniform scale.
 *
 * Equirectangular, with longitude squeezed by cos(latitude). Over the two or
 * three kilometres a delivery covers the error is millimetres on screen —
 * whereas dropping the cos() stretches everything at 17°N by about 5%
 * sideways, which is the mistake that visibly bends a straight road.
 */
function project(points: LngLat[], width: number, height: number, pad: number) {
  const usableW = Math.max(1, width - pad * 2);
  const usableH = Math.max(1, height - pad * 2);

  const lat0 = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);

  const xs = points.map((p) => p[0] * kx);
  const ys = points.map((p) => -p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  /* A floor on the span, so two points a few metres apart do not zoom to a
     scale where GPS jitter looks like crossing the screen. */
  const spanX = Math.max(maxX - minX, 0.004);
  const spanY = Math.max(maxY - minY, 0.004);
  const scale = Math.min(usableW / spanX, usableH / spanY);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return {
    to: (p: LngLat) => ({
      x: width / 2 + (p[0] * kx - cx) * scale,
      y: height / 2 + (-p[1] - cy) * scale,
    }),
    metresPerPixel: 111320 / scale,
  };
}

const NICE_STEPS = [50, 100, 200, 250, 500, 1000, 2000, 5000];

function scaleBar(metresPerPixel: number, width: number) {
  const target = (width / 3) * metresPerPixel;
  const metres = NICE_STEPS.find((step) => step >= target) ?? NICE_STEPS[NICE_STEPS.length - 1];
  return { metres, pixels: metres / metresPerPixel };
}

/** The 28px surveyor's grid, floored so a tight scale bar cannot draw mud. */
function GridBackdrop({ width, height, step }: { width: number; height: number; step: number }) {
  const gap = Math.max(28, step);
  const cols = Math.ceil(width / gap) + 1;
  const rows = Math.ceil(height / gap) + 1;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      {Array.from({ length: rows }, (_, i) => (
        <Line key={`h${i}`} x1={0} y1={i * gap} x2={width} y2={i * gap} stroke={colors.border} strokeWidth={1} />
      ))}
      {Array.from({ length: cols }, (_, i) => (
        <Line key={`v${i}`} x1={i * gap} y1={0} x2={i * gap} y2={height} stroke={colors.border} strokeWidth={1} />
      ))}
    </Svg>
  );
}

/** A teardrop pin whose POINT sits on the coordinate, not its centre. */
function pinPath(x: number, y: number): string {
  const r = 7;
  return [
    `M ${x} ${y}`,
    `L ${x - r} ${y - r * 1.6}`,
    `A ${r} ${r} 0 1 1 ${x + r} ${y - r * 1.6}`,
    "Z",
  ].join(" ");
}

/** Screen-space bearing in degrees, for the no-compass fallback. */
function bearingOnScreen(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return (Math.atan2(to.x - from.x, from.y - to.y) * 180) / Math.PI;
}

/**
 * The navigation panel for the active job.
 *
 * ## This used to draw nothing real
 *
 * It was a decorative grid with a hand-drawn bezier route and two dots at fixed
 * pixel offsets — a placeholder, and honestly labelled as one. It now draws the
 * rider's ACTUAL position against the pickup and the drop, at one uniform scale
 * with a scale bar, and the distance under it is a real haversine.
 *
 * What it still is not: street tiles. `react-native-maps` is already a
 * dependency of this app, so upgrading is possible — it needs a Google Maps key
 * and a development build, and this component is the seam: the projection and
 * the markers go, the props stay. Turn-by-turn navigation is a separate
 * decision again, and until it exists the rider taps through to their own maps
 * app, which is what they would do anyway.
 *
 * ## A position it does not have is drawn as one it does not have
 *
 * `me` is null before the first GPS fix and while permission is refused. The
 * panel still renders the two ends of the journey and says the position is
 * unavailable, rather than parking a marker in the middle and letting a rider
 * navigate by it.
 */
export function MapPanel({
  height,
  kicker,
  target,
  me,
  pickup,
  drop,
  heading,
  pickedUp = false,
  eta,
}: {
  height: number;
  /** "To restaurant" / "To customer" — which leg this is. */
  kicker: string;
  /** The label on the target's chip. */
  target: string;
  /** The rider, now. Null before the first fix. */
  me?: LngLat | null;
  pickup?: LngLat | null;
  drop?: LngLat | null;
  heading?: number | null;
  /** True once the food is in the bag: the leg being drawn flips to the drop. */
  pickedUp?: boolean;
  /** Optional, and left empty rather than guessed — nothing computes an ETA. */
  eta?: string;
}) {
  const [width, setWidth] = useState(390);
  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0 && Math.abs(next - width) > 1) setWidth(next);
  };

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

  const points = [pickup, me, drop].filter(Boolean) as LngLat[];
  const enough = points.length >= 2;

  const PAD = 44;
  const projection = enough ? project(points, width, height, PAD) : null;
  const bar = projection ? scaleBar(projection.metresPerPixel, width) : { metres: 0, pixels: 0 };

  const to = projection?.to;
  const pPickup = to && pickup ? to(pickup) : null;
  const pDrop = to && drop ? to(drop) : null;
  const pMe = to && me ? to(me) : null;
  const pTarget = pickedUp ? pDrop : pPickup;

  const legTarget = pickedUp ? drop : pickup;
  const legMetres = me && legTarget ? metresBetween(me, legTarget) : null;

  return (
    <View style={[styles.wrap, { height }]} onLayout={onLayout}>
      <GridBackdrop width={width} height={height} step={bar.pixels} />

      {enough ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          {/* The whole journey, faint. It stays visible on both legs so
              progress reads against something fixed. */}
          {pPickup && pDrop ? (
            <Line
              x1={pPickup.x}
              y1={pPickup.y}
              x2={pDrop.x}
              y2={pDrop.y}
              stroke={colors.borderInput}
              strokeWidth={2}
            />
          ) : null}

          {/* The leg being travelled, dashed BECAUSE it is a straight line and
              not a route — a solid line would read as "this is the road". */}
          {pMe && pTarget ? (
            <Line
              x1={pMe.x}
              y1={pMe.y}
              x2={pTarget.x}
              y2={pTarget.y}
              stroke={colors.brand}
              strokeWidth={4}
              strokeDasharray="10 8"
              strokeLinecap="round"
            />
          ) : null}

          {/* The restaurant: a ring, filled once the food has left it. */}
          {pPickup ? (
            <Circle
              cx={pPickup.x}
              cy={pPickup.y}
              r={8}
              fill={pickedUp ? colors.brand : colors.surface}
              stroke={colors.brand}
              strokeWidth={3}
            />
          ) : null}

          {/* The door: the only non-round marker, so it is distinguishable
              from the restaurant without relying on colour. */}
          {pDrop ? (
            <Path d={pinPath(pDrop.x, pDrop.y)} fill={colors.graphite} stroke={colors.surface} strokeWidth={2} />
          ) : null}

          {/* The rider, pointing the way they are facing. Falls back to
              pointing at the target when the phone has no compass, which is a
              better guess than always pointing north. */}
          {pMe ? (
            <Polygon
              points="0,-11 8,9 0,5 -8,9"
              fill={colors.brand}
              stroke={colors.surface}
              strokeWidth={2}
              strokeLinejoin="round"
              transform={`translate(${pMe.x} ${pMe.y}) rotate(${
                Number.isFinite(heading as number)
                  ? (heading as number)
                  : pTarget
                    ? bearingOnScreen(pMe, pTarget)
                    : 0
              })`}
            />
          ) : null}
        </Svg>
      ) : null}

      {/* The pulse rides above the SVG: Animated cannot drive an Svg attribute
          without the reanimated bridge, and a plain View ring is identical. */}
      {pMe ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulse,
            {
              left: pMe.x - 28,
              top: pMe.y - 28,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.2] }) }],
            },
          ]}
        />
      ) : null}

      {/* The target's chip, pinned to the marker it labels rather than to a
          fixed corner — a label three inches from its pin is a label for
          nothing. */}
      {pTarget ? (
        <View style={[styles.targetLabel, { left: Math.max(8, pTarget.x - 44), top: Math.max(8, pTarget.y - 34) }]}>
          <Chip label={target} tone="brand" />
        </View>
      ) : null}

      {/* Distance card */}
      <View style={styles.readout}>
        <Text variant="eyebrow" color="tertiary">
          {kicker}
        </Text>
        <View style={styles.readoutRow}>
          <Text variant="priceHero">
            {legMetres === null ? "—" : readableDistance(legMetres)}
          </Text>
          {!!eta && (
            <Text variant="numMeta" color="tertiary">
              {eta}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.ctrl}>
          <Icon name="plus" size={17} color={colors.textPrimary} />
        </View>
        <View style={styles.ctrl}>
          <Icon name="navigate" size={17} color={colors.textPrimary} />
        </View>
      </View>

      <View style={styles.caption}>
        {enough ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            <View style={{ width: bar.pixels, height: 2, backgroundColor: colors.textTertiary }} />
            <Text variant="numMeta" color="tertiary">
              {readableDistance(bar.metres)} · straight line, streets not shown
            </Text>
          </View>
        ) : (
          <Text variant="numMeta" color="tertiary">
            {me ? "Waiting for the order's location" : "Waiting for GPS"}
          </Text>
        )}
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
  pulse: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.brand,
  },
  targetLabel: { position: "absolute", alignItems: "center" },
  readout: {
    position: "absolute",
    left: space[3],
    top: space[3],
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    gap: 2,
    ...elevation.card,
  },
  readoutRow: { flexDirection: "row", alignItems: "baseline", gap: space[2] },
  controls: { position: "absolute", right: space[3], top: space[3], gap: space[2] },
  ctrl: {
    width: 34,
    height: 34,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.card,
  },
  caption: {
    position: "absolute",
    left: space[3],
    bottom: space[2],
    right: space[3],
  },
});
