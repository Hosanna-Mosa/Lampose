import React, { useEffect, useRef } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

export type LngLat = readonly [number, number];

/**
 * Metres between two points, on a sphere.
 *
 * The haversine, not a flat-earth approximation, because the number under the
 * map is a distance a student will compare against what their maps app says.
 * Over 3km the two agree to a metre or two; the point is that this one does
 * not need a caveat.
 */
export function metresBetween(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "1.4 km" over a kilometre, "320 m" under it. Nobody says "0.32 km". */
export function readableDistance(metres: number): string {
  if (!Number.isFinite(metres)) return '';
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres / 10) * 10} m`;
}

/** "just now", then seconds, then minutes. Never a clock time — it is an age. */
function readableAge(at?: string | null): string {
  if (!at) return '';
  const seconds = Math.round((Date.now() - new Date(at).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)} min ago`;
}

/**
 * Longitude/latitude onto the view box, and the scale it worked out.
 *
 * An equirectangular projection with the longitude squeezed by cos(latitude).
 * Over the two or three kilometres a food delivery covers, the error against a
 * proper projection is millimetres on screen — and getting the cos() wrong is
 * the mistake that actually shows: without it, everything at 17°N is stretched
 * about 5% sideways and a straight road looks bent.
 *
 * The scale is uniform on both axes on purpose. A projection that stretched to
 * fill the box would put the markers in the right ORDER and the wrong shape,
 * and the scale bar underneath would then be a lie.
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
     scale where GPS jitter looks like the rider crossing the screen. ~0.004°
     is roughly 400m. */
  const spanX = Math.max(maxX - minX, 0.004);
  const spanY = Math.max(maxY - minY, 0.004);
  const scale = Math.min(usableW / spanX, usableH / spanY);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const to = (p: LngLat) => ({
    x: width / 2 + (p[0] * kx - cx) * scale,
    y: height / 2 + (-p[1] - cy) * scale,
  });

  /* Degrees-of-longitude per pixel, converted to metres — what the scale bar
     is drawn from. 111,320 m is one degree of latitude; the cos() is already
     baked into `scale`. */
  const metresPerPixel = 111320 / scale;

  return { to, metresPerPixel };
}

/** The scale bar picks a round distance that fills a third of the width. */
const NICE_STEPS = [50, 100, 200, 250, 500, 1000, 2000, 5000];

function scaleBar(metresPerPixel: number, width: number) {
  const target = (width / 3) * metresPerPixel;
  const metres = NICE_STEPS.find((step) => step >= target) ?? NICE_STEPS[NICE_STEPS.length - 1];
  return { metres, pixels: metres / metresPerPixel };
}

/* ------------------------------------------------------------------ *
 * The map
 * ------------------------------------------------------------------ */

export type DeliveryMapProps = {
  /** Where the food is cooked. Absent when the partner never dropped a pin. */
  restaurant?: LngLat | null;
  /** Where it is going. Absent when the diner ordered without location access. */
  drop?: LngLat | null;
  /** The rider, now. Null when the fix is too old to draw — see the caption. */
  rider?: LngLat | null;
  /** Degrees from north, for the marker's rotation. Null on a phone with no compass. */
  heading?: number | null;
  /** When the rider's fix was taken, so the caption can say how old it is. */
  riderAt?: string | null;
  /** True once the food is in the bag: the leg being drawn flips to the drop. */
  pickedUp?: boolean;
  height?: number;
};

/**
 * Where your rider is.
 *
 * ## This is a relative map, and it says so
 *
 * There are no street tiles. Every marker is at its TRUE position relative to
 * the others, drawn at one uniform scale with a scale bar to read it against,
 * and the distance under it is a real haversine — but there are no roads and
 * the dashed line between two points is a straight line, not a route.
 *
 * That is a deliberate trade rather than a stub. Street tiles mean either a
 * native module (`react-native-maps`: a config plugin, a Google Maps key, and
 * a development build, so the screen stops rendering in Expo Go) or a WebView
 * full of remote tiles that cannot use the app's own colours. What a student
 * waiting for food actually asks is "how far away are they and are they moving
 * towards me", and that is answerable at this fidelity — honestly, offline,
 * and in the app's own type and palette.
 *
 * If tiles are wanted later, this component is the seam: the projection and
 * the markers go, the props stay.
 *
 * ## A missing position is drawn, not hidden
 *
 * `rider` is null whenever the server's fix is over two minutes old. The map
 * still renders — the restaurant and the door do not move — and the caption
 * says the rider cannot be seen. A marker left sitting where it was reads as a
 * rider who has stopped, which is a different and more alarming thing than a
 * phone that lost signal.
 */
export function DeliveryMap({
  restaurant,
  drop,
  rider,
  heading,
  riderAt,
  pickedUp = false,
  height = 200,
}: DeliveryMapProps) {
  const { colors, space, radius } = useTheme();
  const dimensions = useWindowDimensions();
  /* A first guess so the very first frame is not zero-width; `onLayout`
     corrects it before anybody sees it. The gutter is 16 each side. */
  const [width, setWidth] = React.useState(dimensions.width - 32);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0 && Math.abs(next - width) > 1) setWidth(next);
  };

  /* The rider's own marker pulses; nothing else does. One moving thing on a
     still map is unambiguous about which of the three dots is the person. */
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!rider) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, rider]);

  const points = [restaurant, rider, drop].filter(Boolean) as LngLat[];

  /* Nothing to draw. Rendering an empty grid would be decoration pretending to
     be information — the caller shows its own line instead. */
  if (points.length < 2) return null;

  const PAD = 34;
  const { to, metresPerPixel } = project(points, width, height, PAD);
  const bar = scaleBar(metresPerPixel, width);

  const target = pickedUp ? drop : restaurant;
  const legMetres = rider && target ? metresBetween(rider, target) : null;
  const age = readableAge(riderAt);

  const pRestaurant = restaurant ? to(restaurant) : null;
  const pDrop = drop ? to(drop) : null;
  const pRider = rider ? to(rider) : null;
  const pTarget = pickedUp ? pDrop : pRestaurant;

  return (
    <View
      onLayout={onLayout}
      style={{
        borderRadius: radius.card,
        backgroundColor: colors.surfaceSunken,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      <View style={{ height }}>
        <Svg width={width} height={height}>
          {/* The grid is a scale reference, not a decoration: its squares are
              the scale bar's unit, so a rider crossing one has covered that
              distance. It is drawn at the subtle border colour so it reads as
              paper rather than as content. */}
          <GridLines
            width={width}
            height={height}
            step={bar.pixels}
            stroke={colors.borderSubtle}
          />

          {/* The whole journey, faint: restaurant to door. It is the thing the
              order is, and it stays visible on both legs so the rider's
              progress reads against something fixed. */}
          {pRestaurant && pDrop ? (
            <Line
              x1={pRestaurant.x}
              y1={pRestaurant.y}
              x2={pDrop.x}
              y2={pDrop.y}
              stroke={colors.border}
              strokeWidth={1.5}
            />
          ) : null}

          {/* The leg being travelled right now, in brand green and dashed.
              Dashed because it is a straight line and NOT a route — a solid
              line reads as "this is the road they will take". */}
          {pRider && pTarget ? (
            <Line
              x1={pRider.x}
              y1={pRider.y}
              x2={pTarget.x}
              y2={pTarget.y}
              stroke={colors.brand}
              strokeWidth={2.5}
              strokeDasharray="6 5"
              strokeLinecap="round"
            />
          ) : null}

          {/* The restaurant: a ring, filled once the food has left it. */}
          {pRestaurant ? (
            <>
              <Circle
                cx={pRestaurant.x}
                cy={pRestaurant.y}
                r={7}
                fill={pickedUp ? colors.brand : colors.surface}
                stroke={colors.brand}
                strokeWidth={2.5}
              />
            </>
          ) : null}

          {/* The door: a solid pin, and the only square marker on the map so it
              is distinguishable from the restaurant without relying on colour. */}
          {pDrop ? (
            <Path
              d={pinPath(pDrop.x, pDrop.y)}
              fill={colors.graphite}
              stroke={colors.surface}
              strokeWidth={1.5}
            />
          ) : null}

          {/* The rider: a chevron pointing the way they are actually facing.
              Falls back to pointing at the target when the phone has no
              compass, which is a better guess than always pointing north. */}
          {pRider ? (
            <Polygon
              points="0,-9 7,8 0,4 -7,8"
              fill={colors.brand}
              stroke={colors.onBrand}
              strokeWidth={1.5}
              strokeLinejoin="round"
              transform={`translate(${pRider.x} ${pRider.y}) rotate(${
                Number.isFinite(heading as number)
                  ? (heading as number)
                  : pTarget
                    ? bearingOnScreen(pRider, pTarget)
                    : 0
              })`}
            />
          ) : null}
        </Svg>

        {/* The pulse rides above the SVG rather than inside it — Animated
            cannot drive an Svg attribute without the reanimated bridge, and a
            plain View ring costs nothing and behaves identically. */}
        {pRider ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: pRider.x - 22,
              top: pRider.y - 22,
              width: 44,
              height: 44,
              borderRadius: 22,
              borderWidth: 1.5,
              borderColor: colors.brand,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] }) },
              ],
            }}
          />
        ) : null}
      </View>

      {/* ── The readout ───────────────────────────────────────────────────
          Distance, then the scale, then the age of the fix. The age is the
          part that stops this being a map that quietly lies: a marker is only
          worth reading if you know how old it is. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          paddingHorizontal: space[3],
          paddingVertical: space[2],
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="caption" style={{ color: colors.textTertiary }}>
            {rider
              ? pickedUp
                ? 'Rider to your door'
                : 'Rider to the restaurant'
              : 'We cannot see your rider'}
          </Text>
          <Text variant="priceMd" numberOfLines={1}>
            {legMetres === null ? 'Position unavailable' : readableDistance(legMetres)}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
            <View style={{ width: bar.pixels, height: 2, backgroundColor: colors.textTertiary }} />
            <Text variant="numMeta" style={{ color: colors.textTertiary }}>
              {readableDistance(bar.metres)}
            </Text>
          </View>
          <Text variant="numMeta" style={{ color: colors.textTertiary }}>
            {rider ? (age ? `updated ${age}` : 'live') : 'signal lost'}
          </Text>
        </View>
      </View>

      {/* Said once, quietly, and never repeated in the copy above. A student
          who expects Google Maps needs to know in one glance why this does not
          look like it — and not be told again every time they open it. */}
      <View
        style={{
          paddingHorizontal: space[3],
          paddingBottom: space[2],
          backgroundColor: colors.surface,
        }}
      >
        <Text variant="numMeta" style={{ color: colors.textTertiary }}>
          Straight-line distance · positions are to scale, streets are not shown
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function GridLines({
  width,
  height,
  step,
  stroke,
}: {
  width: number;
  height: number;
  step: number;
  stroke: string;
}) {
  /* A floor on the spacing: a scale bar that came out at 12px would draw a
     hundred lines and read as a solid grey block. */
  const gap = Math.max(28, step);
  const cols = Math.ceil(width / gap) + 1;
  const rows = Math.ceil(height / gap) + 1;

  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <Line key={`h${i}`} x1={0} y1={i * gap} x2={width} y2={i * gap} stroke={stroke} strokeWidth={1} />
      ))}
      {Array.from({ length: cols }, (_, i) => (
        <Line key={`v${i}`} x1={i * gap} y1={0} x2={i * gap} y2={height} stroke={stroke} strokeWidth={1} />
      ))}
    </>
  );
}

/** A teardrop pin whose POINT sits on the coordinate, not its centre. */
function pinPath(x: number, y: number): string {
  const r = 6.5;
  return [
    `M ${x} ${y}`,
    `L ${x - r} ${y - r * 1.6}`,
    `A ${r} ${r} 0 1 1 ${x + r} ${y - r * 1.6}`,
    'Z',
  ].join(' ');
}

/** Screen-space bearing in degrees, for the no-compass fallback. */
function bearingOnScreen(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return (Math.atan2(to.x - from.x, from.y - to.y) * 180) / Math.PI;
}

export default DeliveryMap;
