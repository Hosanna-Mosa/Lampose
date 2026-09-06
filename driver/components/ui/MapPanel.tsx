import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Camera } from "react-native-maps";
import Svg, { Circle, Path, Polygon } from "react-native-svg";
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

/** `[lng, lat]` — this file's order, GeoJSON's and MongoDB's — to what
    `react-native-maps` wants. The one place the pair is flipped. */
const toLatLng = ([lng, lat]: LngLat) => ({ latitude: lat, longitude: lng });

/**
 * True geographic bearing from `a` to `b`, for the rider chevron's fallback
 * rotation when the phone has no compass.
 *
 * This used to be a SCREEN-space bearing — `atan2` on the two points' already
 *-projected x/y — which only worked because the panel drew its own
 * equirectangular projection and the angle on screen happened to equal the
 * angle on the ground. A real map has no such projection to read: north is
 * always up, so the angle this component needs is the actual compass bearing
 * between the two coordinates.
 */
function bearingBetween(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** A teardrop pin, sized to its own small marker canvas rather than the whole
    map — `anchor={{x:0.5,y:1}}` on the `Marker` puts its tip on the coordinate. */
function PinIcon() {
  const r = 7;
  const w = r * 2 + 6;
  const h = r * 2.6 + 6;
  const d = [
    `M ${w / 2} ${h - 3}`,
    `L ${w / 2 - r} ${h - 3 - r * 1.6}`,
    `A ${r} ${r} 0 1 1 ${w / 2 + r} ${h - 3 - r * 1.6}`,
    "Z",
  ].join(" ");
  return (
    <Svg width={w} height={h}>
      <Path d={d} fill={colors.graphite} stroke={colors.surface} strokeWidth={2} />
    </Svg>
  );
}

/** The restaurant: a ring, filled once the food has left it. */
function RingIcon({ filled }: { filled: boolean }) {
  const size = 22;
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={8}
        fill={filled ? colors.brand : colors.surface}
        stroke={colors.brand}
        strokeWidth={3}
      />
    </Svg>
  );
}

/** The rider, rotated to face the way they are actually heading. Rotation is
    applied by hand — via `transform`, same as the SVG this replaces — rather
    than through `Marker`'s own `rotation` prop, which only turns the built-in
    marker image and leaves a custom child view like this one facing north. */
function ChevronIcon({ heading }: { heading: number }) {
  const size = 26;
  return (
    <Svg width={size} height={size}>
      <Polygon
        points="13,2 21,20 13,16 5,20"
        fill={colors.brand}
        stroke={colors.surface}
        strokeWidth={2}
        strokeLinejoin="round"
        transform={`rotate(${heading} 13 13)`}
      />
    </Svg>
  );
}

/**
 * An expanding ring, in plain screen space.
 *
 * Used by Home's small "Online" indicator, and — centred over the whole map
 * view rather than pinned inside it — by Home's "waiting for orders" search
 * animation too (see the long comment on why, further down this file, where
 * a marker-based version of this same idea used to live and did not
 * reliably animate on Android).
 */
export function PulseRing({
  size,
  color,
  delay = 0,
  duration = 2400,
  style,
}: {
  size: number;
  color: string;
  delay?: number;
  duration?: number;
  style?: object;
}) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay, duration]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: radius.pill,
          borderWidth: 1.5,
          borderColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.6] }) }],
        },
        style,
      ]}
    />
  );
}

/*
 * There used to be a `MarkerPulse` here — the same expanding ring, but as its
 * own `Marker` pinned to the rider's real coordinate, so it would move with
 * the map. Two rounds of fixing `react-native-maps`' Android marker
 * internals for it (`tracksViewChanges`, then which thread the animation
 * runs on) still didn't make it visible on a device, and a third attempt at
 * internals I cannot see run is the wrong way to spend a fix. So solo mode
 * does not animate a marker at all any more — it draws the ring in plain
 * screen space, the same proven way the small "Online" dot's `PulseRing`
 * already works, positioned at the CENTRE of the map view instead of at a
 * coordinate.
 *
 * That substitution is only honest because solo mode locks the camera
 * exactly there: pan and zoom are off, and the one centring effect below
 * points the camera at `me` and leaves it — so the centre of this view and
 * the rider's marker are the same pixel for as long as solo mode is showing
 * at all. It would be a lie the moment the map could pan away from the
 * rider, which is exactly why the active-job map keeps its own marker-based
 * pulse instead: `me` moves all over that view as the camera fits pickup,
 * rider and drop together, and a screen-centred ring would drift off the
 * chevron the first time it did.
 */

/**
 * The navigation panel for the active job — and, with no `pickup`/`drop`,
 * the same live map on Home while a rider is only waiting for one.
 *
 * ## This now draws a real map
 *
 * It used to be a hand-projected grid — the rider's actual position against
 * the pickup and the drop, at one uniform scale, honestly labelled as not
 * street tiles. `react-native-maps` was already a dependency waiting on a
 * Google Maps key and a development build; both are now in place (see
 * `app.config.js` and `.env.example`), so this is the promised upgrade: the
 * projection and the markers are gone, the props are exactly the same.
 *
 * Turn-by-turn routing is still a separate decision. The line between two
 * points below is still a STRAIGHT line, not a road-following route — this
 * only replaced the canvas underneath it, not the geometry drawn on top —
 * and a rider still taps through to their own maps app for actual
 * navigation, same as before.
 *
 * ## A position it does not have is drawn as one it does not have
 *
 * `me` is null before the first GPS fix and while permission is refused. The
 * panel still renders the two ends of the journey and says the position is
 * unavailable, rather than parking a marker in the middle and letting a rider
 * navigate by it.
 *
 * ## No journey yet — just the rider
 *
 * Home shows this same panel while a rider is online with nothing assigned:
 * no `pickup`, no `drop`, no leg to measure. `hasJourney` is what tells the
 * distance card, the target chip and the "waiting for…" caption apart from
 * the active-job case below — there is no destination to be waiting FOR
 * here, only a GPS fix to be waiting ON, which is a different sentence.
 */
export function MapPanel({
  height,
  kicker = "",
  target = "",
  me,
  pickup,
  drop,
  heading,
  pickedUp = false,
  eta,
}: {
  height: number;
  /** "To restaurant" / "To customer" — which leg this is. Leave unset outside
   *  an active job; there is no leg card to head without one. */
  kicker?: string;
  /** The label on the target's chip. Leave unset outside an active job. */
  target?: string;
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
  /** Whether there is a journey at all — the one flag every "which mode is
   *  this" decision below reduces to. */
  const hasJourney = !!(pickup || drop);
  const mapRef = useRef<MapView>(null);

  /* JS-driven, not native: a native-driven animation never goes back through
     a React commit, which is exactly what `react-native-maps` on Android
     watches for to know this marker (below) needs re-rasterising. Driven
     here instead, every tick is a real prop change for `tracksViewChanges`
     to actually react to. */
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const points = [pickup, me, drop].filter(Boolean) as LngLat[];
  const enough = points.length >= 2;

  const legTarget = pickedUp ? drop : pickup;
  const legMetres = me && legTarget ? metresBetween(me, legTarget) : null;

  /*
   * Frame the camera to whatever is on screen, the same job the old
   * projection's bounding box did. Keyed on the points' own values rather
   * than firing on every render, so a rider who has panned off to check a
   * side street is not yanked back by an unrelated re-render — only an
   * actual move of pickup, drop or `me` re-fits it.
   */
  const fitKey = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (!enough) return;
    mapRef.current?.fitToCoordinates(points.map(toLatLng), {
      edgePadding: { top: 72, right: 56, bottom: 96, left: 56 },
      animated: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, enough]);

  /*
   * No journey to fit, so nothing above centres the camera at all — a rider
   * who is only waiting would open Home to a blank map until they found the
   * recentre button themselves. This is the solo-mode equivalent: the first
   * fix that arrives gets centred on once, the same way `initialRegion`
   * would if `MapView` re-read it after mount (it does not). Later fixes
   * while still waiting are deliberately NOT re-centred on, for the same
   * reason a mid-journey re-render must not yank the camera off a road a
   * rider panned to check.
   */
  const centredOnce = useRef(false);
  useEffect(() => {
    if (hasJourney || enough || !me || centredOnce.current) return;
    centredOnce.current = true;
    mapRef.current?.animateCamera({ center: toLatLng(me), zoom: 16 }, { duration: 250 });
  }, [hasJourney, enough, me]);

  const recenter = () => {
    if (enough) {
      mapRef.current?.fitToCoordinates(points.map(toLatLng), {
        edgePadding: { top: 72, right: 56, bottom: 96, left: 56 },
        animated: true,
      });
    } else if (me) {
      mapRef.current?.animateCamera({ center: toLatLng(me), zoom: 16 }, { duration: 250 });
    }
  };

  const zoomBy = (delta: number) => {
    mapRef.current?.getCamera().then((camera: Camera) => {
      mapRef.current?.animateCamera(
        { ...camera, zoom: Math.max(2, (camera.zoom ?? 15) + delta) },
        { duration: 200 },
      );
    });
  };

  const rotation =
    heading != null && Number.isFinite(heading)
      ? heading
      : me && legTarget
        ? bearingBetween(me, legTarget)
        : 0;

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={
          pickup
            ? { ...toLatLng(pickup), latitudeDelta: 0.02, longitudeDelta: 0.02 }
            : me
              ? { ...toLatLng(me), latitudeDelta: 0.01, longitudeDelta: 0.01 }
              : undefined
        }
        /*
         * Solo mode is a live snapshot of where the rider is, not a map to go
         * exploring in — there is nothing here to navigate to yet. Locking
         * pan and zoom is what makes that true rather than asserted: without
         * it a rider could drag the one thing on screen answering "can they
         * see me" away from themselves.
         */
        scrollEnabled={hasJourney}
        zoomEnabled={hasJourney}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {/* The whole journey, faint. It stays visible on both legs so
            progress reads against something fixed. */}
        {pickup && drop ? (
          <Polyline
            coordinates={[toLatLng(pickup), toLatLng(drop)]}
            strokeColor={colors.borderInput}
            strokeWidth={2}
          />
        ) : null}

        {/* The leg being travelled, dashed BECAUSE it is a straight line and
            not a route — a solid line would read as "this is the road". */}
        {me && legTarget ? (
          <Polyline
            coordinates={[toLatLng(me), toLatLng(legTarget)]}
            strokeColor={colors.brand}
            strokeWidth={4}
            lineDashPattern={[10, 8]}
          />
        ) : null}

        {pickup ? (
          <Marker coordinate={toLatLng(pickup)} anchor={{ x: 0.5, y: 0.5 }}>
            <RingIcon filled={pickedUp} />
          </Marker>
        ) : null}

        {drop ? (
          <Marker coordinate={toLatLng(drop)} anchor={{ x: 0.5, y: 1 }}>
            <PinIcon />
          </Marker>
        ) : null}

        {/* The rider. The pulse rides in a sibling `Marker` at the same
            coordinate rather than inside this one, so its own Animated loop
            does not force the chevron's marker to keep re-snapshotting. */}
        {me ? (
          <Marker coordinate={toLatLng(me)} anchor={{ x: 0.5, y: 0.5 }} zIndex={2}>
            <ChevronIcon heading={rotation} />
          </Marker>
        ) : null}
        {/*
          Solo mode draws its pulse OUTSIDE the map entirely now — see the
          long comment above where `MarkerPulse` used to be. This marker-based
          one stays for the active job, where the rider genuinely moves
          around the view as the camera fits pickup, rider and drop together.
          `tracksViewChanges` is TRUE and the animation is JS-driven (not
          native) for the reason worked out getting solo mode's version this
          far: a native-driven change never reaches React, and Android will
          not re-rasterise a marker for a change it never heard about.
        */}
        {hasJourney && me ? (
          <Marker coordinate={toLatLng(me)} anchor={{ x: 0.5, y: 0.5 }} zIndex={1} tracksViewChanges>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pulse,
                {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.2] }) }],
                },
              ]}
            />
          </Marker>
        ) : null}

        {/*
          The target's label. Its own `Marker` at the SAME coordinate as
          whichever pin it labels, so it rides with the map rather than
          needing to be repositioned by hand on every camera move — but it is
          a real pin's worth of pixels above that coordinate rather than
          centred on it, and `anchor` only offsets by a FRACTION of this
          view's own size, not a fixed pixel amount the way the old
          screen-space overlay could. `y: 1.6` is a tuned guess at clearing
          the pin underneath without floating too far above it; it is the one
          number in this file I could not check by eye — I have no native
          build to render it on — so treat it as a starting point to nudge
          after you see it on a device.
        */}
        {legTarget ? (
          <Marker coordinate={toLatLng(legTarget)} anchor={{ x: 0.5, y: 1.6 }} zIndex={3}>
            <Chip label={target} tone="brand" />
          </Marker>
        ) : null}
      </MapView>

      {/*
        Solo mode's search animation — plain screen space, not a map marker.
        Centred over the whole view, which is honest only because the camera
        is locked pointing at `me` for as long as this is showing (see the
        long comment further up) — the chevron marker underneath is really
        sitting at this same centre pixel.
      */}
      {!hasJourney && me ? (
        <View pointerEvents="none" style={styles.searchOverlay}>
          <PulseRing size={100} color={colors.brand} duration={1800} />
          <PulseRing size={100} color={colors.brand} delay={900} duration={1800} />
        </View>
      ) : null}

      {/* Distance card — there is no leg to measure with nothing assigned. */}
      {hasJourney ? (
        <View style={styles.readout} pointerEvents="none">
          <Text variant="eyebrow" color="tertiary">
            {kicker}
          </Text>
          <View style={styles.readoutRow}>
            <Text variant="priceHero">{legMetres === null ? "—" : readableDistance(legMetres)}</Text>
            {!!eta && (
              <Text variant="numMeta" color="tertiary">
                {eta}
              </Text>
            )}
          </View>
        </View>
      ) : null}

      {/* Nothing to zoom into or recentre away from in solo mode — the
          camera is locked, so controls offering to move it would be dead. */}
      {hasJourney ? (
        <View style={styles.controls}>
          <View style={styles.ctrl} onTouchEnd={() => zoomBy(1)}>
            <Icon name="plus" size={17} color={colors.textPrimary} />
          </View>
          <View style={styles.ctrl} onTouchEnd={recenter}>
            <Icon name="navigate" size={17} color={colors.textPrimary} />
          </View>
        </View>
      ) : null}

      {/* Two different things to be waiting ON. With no journey assigned yet
          there is no "order's location" to wait for — only a fix, and once
          that has arrived the map has nothing left to say for itself. */}
      {!hasJourney ? (
        !me ? (
          <View style={styles.caption} pointerEvents="none">
            <Text variant="numMeta" color="tertiary">
              Waiting for GPS
            </Text>
          </View>
        ) : null
      ) : !enough ? (
        <View style={styles.caption} pointerEvents="none">
          <Text variant="numMeta" color="tertiary">
            {me ? "Waiting for the order's location" : "Waiting for GPS"}
          </Text>
        </View>
      ) : null}
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
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.brand,
  },
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
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
