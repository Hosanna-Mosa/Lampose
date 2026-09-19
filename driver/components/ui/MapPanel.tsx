import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import MapView, {
  AnimatedRegion,
  Marker,
  MarkerAnimated,
  Polyline,
  PROVIDER_GOOGLE,
  type Camera,
} from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import Svg, { Circle, Path } from "react-native-svg";
import { colors, elevation, radius, space } from "@/theme";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { Chip } from "./primitives";

/** The same public key `app.config.js` bakes into the native Maps SDK,
    reused here as the Directions API key — one Google Cloud key, both
    APIs enabled on it. If the Directions API specifically isn't enabled
    for this key (a Cloud Console setting, not something this file can
    detect in advance), every route request fails and the map quietly
    falls back to the straight line below; nothing crashes either way. */
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

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

/* Don't ask the Directions API for a fresh route on every fix — this app's
   own `useDriverLocation` watches position at five metres or two seconds
   (see the comment above `LOCATION_MISSES_BEFORE_STALE` in
   `driverStore.ts`), so binding a request straight to `me` could fire one
   several times a SECOND while actually riding. Twenty seconds or sixty
   metres, whichever comes first, keeps the ROUTE itself reasonably current
   without multiplying Directions requests by the fix rate — the marker
   still glides every fix either way (see `meRegion`); only how often the
   route line gets RECOMPUTED is throttled. */
const ROUTE_MIN_INTERVAL_MS = 20000;
const ROUTE_MIN_MOVE_METRES = 60;

/** Returns `point`, but only once it has moved far enough AND enough time
    has passed since the last value this returned — otherwise it keeps
    returning the previous one. Computed directly during render (mutating
    the ref is safe here: it only ever narrows what gets returned, never
    triggers a render of its own) rather than in an effect, so it settles
    in the same pass as everything else that already re-renders whenever
    `me` does. */
function useThrottledRoutePoint(point: LngLat | null | undefined): LngLat | null {
  const stable = useRef<{ at: number; p: LngLat } | null>(null);
  if (!point) return stable.current?.p ?? null;
  const prev = stable.current;
  if (!prev) {
    stable.current = { at: Date.now(), p: point };
    return point;
  }
  const now = Date.now();
  if (now - prev.at >= ROUTE_MIN_INTERVAL_MS && metresBetween(prev.p, point) >= ROUTE_MIN_MOVE_METRES) {
    stable.current = { at: now, p: point };
    return point;
  }
  return prev.p;
}

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

/** The signed difference from `fromDeg` to `toDeg`, in (-180, 180] — the
    SHORT way round a compass, so a turn that crosses 0°/360° never reads
    as a near-full spin the long way instead. */
function shortestAngleDelta(fromDeg: number, toDeg: number): number {
  let diff = (toDeg - fromDeg) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

/** The rider's own marker icon: Lucide's actual "Navigation" glyph — the
    same dart-shaped compass arrow `<Icon name="navigate">` already draws
    for the recentre button lower in this file — filled solid, brand green
    with a white outline, rather than hand-drawn from scratch. (Two earlier
    hand-drawn attempts, a compass-needle silhouette and a plain triangle,
    both read as "not quite a real icon" — reusing Lucide's own path data
    is what actually looks right, and keeps this app's one navigation glyph
    consistent between the button and the map.) Not the illustrated
    scooter: a rider glancing at their own dot to check which way they're
    facing found a plain arrow read faster than the scooter, whose own
    "front" isn't obvious at a glance the way a literal arrow's tip is.

    Lucide draws this glyph's tip pointing north-east by default (its path
    is `m3 11 19-9-9 19-2-8z`, transcribed in `Icon.tsx`); the baked PNG is
    that same path rotated -45° so the tip points due north instead,
    matching this file's own "0° = up" heading convention.

    Handed to `Marker`'s own `image` prop and rotated by its own
    `rotation`/`flat` props rather than drawn as a React child view — the
    native Google Maps SDK rotates its own bitmap directly, with no React
    Native view layout, transform or snapshot step in the path at all. (An
    earlier custom-child-view attempt at the scooter kept rendering
    incompletely on-device with no way to inspect why from here; switching
    to native rotation sidestepped that whole class of bug, and this arrow
    keeps using it for the same reason.)

    The source PNG's pixel dimensions (60×77) are deliberately exactly its
    intended on-screen size: a `require()`d asset with no `@2x`/`@3x`
    sibling is registered at scale 1, so it renders at `pixelSize / 1` dp
    on every device rather than at a size that depends on guessing which
    density bucket the marker bitmap path picks. To resize it, regenerate
    the PNG at a different pixel size rather than looking for a style prop
    — there isn't one, by design. */
const RIDER_MARKER_IMAGE = require("../../assets/images/rider_heading_arrow.png");
/* A sharp arrowhead makes a turn far more visually obvious than the
   illustrated scooter it replaced did — the same rotation SPEED now reads
   as faster simply because the shape sweeps a bold point across the
   screen instead of a soft silhouette. Slower here than that version
   used, to bring the PERCEIVED speed back down to what it was. */
const RIDER_ROTATE_MS = 700;

/** Eases a stream of raw heading readings into one that changes smoothly,
    for a marker's `rotation` prop.

    `heading` comes from `Location.watchHeadingAsync` (`useDriverLocation`),
    which fires on close to every degree the compass reports — unthrottled
    and, held to a phone's hand, noisy. Passing it straight through snaps
    the marker to each reading the instant it arrives, so turning the phone
    makes it twitch through a dozen tiny jumps a second rather than read as
    one smooth turn. This animates toward each new reading instead, over a
    fixed duration — there is nothing to throttle upstream without also
    slowing how current the heading itself is. The animation target is
    accumulated as a plain, unwrapped number (can run past 360 or below 0)
    rather than reset into 0–360 each time, so a turn through north keeps
    animating the short way instead of snapping backward across the dial;
    the returned value is only normalised into [0, 360) at the end, for the
    `rotation` prop itself. */
function useEasedHeading(heading: number): number {
  const target = useRef(heading);
  const rotAnim = useRef(new Animated.Value(heading)).current;
  const [display, setDisplay] = useState(heading);

  useEffect(() => {
    const id = rotAnim.addListener(({ value }) => setDisplay(value));
    return () => rotAnim.removeListener(id);
  }, [rotAnim]);

  useEffect(() => {
    const next = target.current + shortestAngleDelta(target.current % 360, heading);
    target.current = next;
    Animated.timing(rotAnim, {
      toValue: next,
      duration: RIDER_ROTATE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [heading, rotAnim]);

  return ((display % 360) + 360) % 360;
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
 * The line between two points now follows actual roads — `MapViewDirections`
 * asks Google's Directions API for the real route and draws THAT, solid,
 * instead of a straight line pretending to be one. A straight, DASHED line
 * is still what draws when a route genuinely isn't available (no API key,
 * the Directions API not enabled for it, or a failed request) — dashed for
 * the same reason it always was: so a line that is NOT a real route never
 * looks like one. See `ROUTE_MIN_INTERVAL_MS` for why the route itself
 * doesn't refetch on every single fix. Turn-by-turn, spoken navigation is
 * still a separate decision — a rider still taps through to their own maps
 * app for that, same as before.
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
  mapType = "standard",
  allowPan = false,
  onMapRef,
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
  /** Map type style ('standard' | 'satellite'). Default 'standard'. */
  mapType?: "standard" | "satellite" | "hybrid" | "terrain";
  /** Whether to allow scroll/pan when in solo mode. */
  allowPan?: boolean;
  /** Callback to expose MapView reference. */
  onMapRef?: (ref: MapView | null) => void;
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

  /* The route for the leg actually being ridden. Origin is throttled (see
     `useThrottledRoutePoint`); `legRouteFailed` starts false optimistically
     on every new request (`onStart`) and only the most recent request's own
     `onError` can set it, so a failure on the pickup leg doesn't linger as
     a false failure once the leg target has moved on to the drop. */
  const routeOrigin = useThrottledRoutePoint(me);
  const [legRouteFailed, setLegRouteFailed] = useState(false);
  /* `pickup`/`drop` never move once a job is assigned, so this route is
     fetched exactly once — no throttling needed, unlike the leg above. */
  const [journeyRouteFailed, setJourneyRouteFailed] = useState(false);

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
  const riderRotation = useEasedHeading(rotation);

  /* The rider's own position glides between GPS fixes instead of
     snapping — the same technique `DeliveryMap.tsx` uses for the rider on
     the diner's side, tuned to THIS app's own, much faster update cadence.
     `useDriverLocation` watches position at five metres or two seconds
     (see the comment above `LOCATION_MISSES_BEFORE_STALE` in
     `driverStore.ts`), so while actually riding a fix can arrive under a
     second apart — snapping straight to each one was always happening,
     it just wasn't very noticeable until the marker above got bigger.
     Slightly under that typical gap, so one glide usually finishes before
     the next fix lands; when a fix arrives sooner anyway, retargeting an
     `AnimatedRegion` mid-glide steers it toward the new point rather than
     restarting, so riding fast still reads as one continuous motion. */
  const ME_GLIDE_MS = 1000;
  const meRegion = useRef<AnimatedRegion | null>(null);
  if (me && !meRegion.current) {
    meRegion.current = new AnimatedRegion({
      latitude: me[1],
      longitude: me[0],
      latitudeDelta: 0,
      longitudeDelta: 0,
    });
  }
  useEffect(() => {
    if (!me || !meRegion.current) return;
    meRegion.current
      .timing({
        latitude: me[1],
        longitude: me[0],
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration: ME_GLIDE_MS,
        useNativeDriver: false,
        /* react-native-maps' own `.d.ts` demands a `toValue` here, but its
           actual implementation only ever reads latitude/longitude/deltas
           off this object — satisfies the type without pretending the
           number means anything (same as `DeliveryMap.tsx`'s `riderRegion`). */
        toValue: 0,
      })
      .start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.[0], me?.[1]]);

  useEffect(() => {
    onMapRef?.(mapRef.current);
  }, [onMapRef]);

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        mapType={mapType}
        initialRegion={
          pickup
            ? { ...toLatLng(pickup), latitudeDelta: 0.02, longitudeDelta: 0.02 }
            : me
              ? { ...toLatLng(me), latitudeDelta: 0.01, longitudeDelta: 0.01 }
              : undefined
        }
        scrollEnabled={hasJourney || allowPan}
        zoomEnabled={hasJourney || allowPan}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {/* The whole journey, faint, along actual roads. It stays visible on
            both legs so progress reads against something fixed. Fixed
            endpoints, so this fetches once and never refetches for the life
            of the job. */}
        {pickup && drop && GOOGLE_MAPS_API_KEY ? (
          <MapViewDirections
            origin={toLatLng(pickup)}
            destination={toLatLng(drop)}
            apikey={GOOGLE_MAPS_API_KEY}
            mode="DRIVING"
            strokeColor={colors.borderInput}
            strokeWidth={2}
            onStart={() => setJourneyRouteFailed(false)}
            onError={() => setJourneyRouteFailed(true)}
          />
        ) : null}
        {pickup && drop && (!GOOGLE_MAPS_API_KEY || journeyRouteFailed) ? (
          <Polyline
            coordinates={[toLatLng(pickup), toLatLng(drop)]}
            strokeColor={colors.borderInput}
            strokeWidth={2}
          />
        ) : null}

        {/* The leg being ridden right now, along actual roads — solid,
            because unlike the straight line it can fall back to, this
            really IS "the road". The straight DASHED line below only draws
            when this one could not: dashed for the same reason it always
            was, so a line that is NOT a real route never looks like one. */}
        {me && legTarget && routeOrigin && GOOGLE_MAPS_API_KEY ? (
          <MapViewDirections
            origin={toLatLng(routeOrigin)}
            destination={toLatLng(legTarget)}
            apikey={GOOGLE_MAPS_API_KEY}
            mode="DRIVING"
            precision="high"
            strokeColor={colors.brand}
            strokeWidth={4}
            onStart={() => setLegRouteFailed(false)}
            onError={() => setLegRouteFailed(true)}
          />
        ) : null}
        {me && legTarget && (!GOOGLE_MAPS_API_KEY || legRouteFailed) ? (
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

        {/* The rider — a native image marker, rotated by the SDK itself
            (`image` + `rotation` + `flat`) rather than a custom React child
            view, so there is no React Native layout/snapshot step that
            could clip it. `coordinate` is `meRegion`, not a plain LngLat,
            so it GLIDES to each new fix — see the long comment above. The
            pulse rides in a sibling `MarkerAnimated` sharing that same
            region, so the two move together rather than the ring lagging
            behind or racing ahead of the icon. */}
        {me && meRegion.current ? (
          <MarkerAnimated
            coordinate={meRegion.current}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={2}
            image={RIDER_MARKER_IMAGE}
            rotation={riderRotation}
            flat
          />
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
        {hasJourney && me && meRegion.current ? (
          <MarkerAnimated
            coordinate={meRegion.current}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={1}
            tracksViewChanges
          >
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
          </MarkerAnimated>
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
