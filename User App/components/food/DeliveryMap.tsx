import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import MapView, { AnimatedRegion, Marker, MarkerAnimated, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import Svg, { Circle, Path } from 'react-native-svg';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

/** The same public key `app.config.js` bakes into the native Maps SDK,
    reused here as the Directions API key — one Google Cloud key, both
    APIs enabled on it. If the Directions API specifically isn't enabled
    for this key (a Cloud Console setting, not something this file can
    detect in advance), every route request fails and the map quietly
    falls back to the straight line below; nothing crashes either way. */
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

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

/** `[lng, lat]` — this file's order, GeoJSON's and MongoDB's — to what
    `react-native-maps` wants. The one place the pair is flipped. */
const toLatLng = ([lng, lat]: LngLat) => ({ latitude: lat, longitude: lng });

/* Don't ask the Directions API for a fresh route on every fix — the
   tracking screen polls every five to eight seconds and the rider's
   position moves within that, so binding a request straight to `rider`
   would fire one on nearly every poll for as long as the order is live.
   Twenty seconds or sixty metres, whichever comes first, keeps the ROUTE
   itself reasonably current without multiplying Directions requests by
   the polling rate — the marker still glides smoothly every poll either
   way; only how often the route line gets RECOMPUTED is throttled. */
const ROUTE_MIN_INTERVAL_MS = 20000;
const ROUTE_MIN_MOVE_METRES = 60;

/** Returns `point`, but only once it has moved far enough AND enough time
    has passed since the last value this returned — otherwise it keeps
    returning the previous one. Computed directly during render (mutating
    the ref is safe here: it only ever narrows what gets returned, never
    triggers a render of its own) rather than in an effect, so it settles
    in the same pass as everything else that already re-renders whenever
    `rider` does. */
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

/** The signed difference from `fromDeg` to `toDeg`, in (-180, 180] — the
    SHORT way round a compass, so a turn that crosses 0°/360° never reads
    as a near-full spin the long way instead. Same helper, same reasoning,
    as the driver app's own copy in `MapPanel.tsx`. */
function shortestAngleDelta(fromDeg: number, toDeg: number): number {
  let diff = (toDeg - fromDeg) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

const RIDER_ROTATE_MS = 700;

/** Eases the rider's marker toward each new `heading` reading instead of
    snapping to it — see `RIDER_MARKER_IMAGE`'s own comment for what this
    number actually is and why it can be trusted. Unlike the driver app's
    own copy of this hook, `heading` here can be `null` on any given poll —
    the very first fix this map ever sees, or any later one where the
    driver's phone genuinely reported nothing (see the comment on the
    `heading` prop) — and a `null` reading is simply skipped rather than
    animated to: the marker holds at the last direction it actually knows
    instead of snapping to a fake default. The turn always goes the SHORT
    way round (`shortestAngleDelta`), and the very first real reading is
    set directly (`setValue`) rather than tweened from the Animated.Value's
    arbitrary starting 0 — otherwise the marker would visibly spin in from
    "north" the moment it first appears, before it has ever faced anywhere
    real. */
function useEasedHeading(heading: number | null | undefined): number {
  const target = useRef<number | null>(null);
  const rotAnim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const id = rotAnim.addListener(({ value }) => setDisplay(value));
    return () => rotAnim.removeListener(id);
  }, [rotAnim]);

  useEffect(() => {
    if (heading == null || !Number.isFinite(heading)) return;
    if (target.current == null) {
      target.current = heading;
      rotAnim.setValue(heading);
      return;
    }
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

/* ------------------------------------------------------------------ *
 * Markers — small, fixed-size canvases rather than the whole map, since
 * `react-native-maps` places each one at its own coordinate rather than at
 * a hand-projected pixel.
 * ------------------------------------------------------------------ */

/** A teardrop pin whose tip sits on the coordinate — `anchor={{x:0.5,y:1}}`
    on the `Marker` puts it there. */
function PinIcon({ fill, stroke }: { fill: string; stroke: string }) {
  const r = 6.5;
  const w = r * 2 + 5;
  const h = r * 2.6 + 5;
  const d = [
    `M ${w / 2} ${h - 2}`,
    `L ${w / 2 - r} ${h - 2 - r * 1.6}`,
    `A ${r} ${r} 0 1 1 ${w / 2 + r} ${h - 2 - r * 1.6}`,
    'Z',
  ].join(' ');
  return (
    <Svg width={w} height={h}>
      <Path d={d} fill={fill} stroke={stroke} strokeWidth={1.5} />
    </Svg>
  );
}

/** The restaurant: a ring, filled once the food has left it. */
function RingIcon({ filled, fill, stroke }: { filled: boolean; fill: string; stroke: string }) {
  const size = 20;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={7} fill={filled ? stroke : fill} stroke={stroke} strokeWidth={2.5} />
    </Svg>
  );
}

/**
 * The rider: a top-down illustrated scooter — back after a brief detour
 * through the driver app's own plain heading-arrow glyph. The arrow read
 * clearly, but a diner watching THIS map wants to recognise "a bike is on
 * its way", the way an arrow never quite gestures at even when it's easy
 * to see. What was actually wrong the first time this was tried was the
 * SIZE, not the shape: 22×48 at this map's smaller, card-embedded scale
 * rendered as a barely-visible speck, and both 33×70 and 47×100 were still
 * too small. `scooter_blue_top_view_marker.png` is the same crop,
 * regenerated at 65×140 — to resize it again, regenerate the PNG at a
 * different pixel size (same 68:146 aspect ratio); there is no style prop
 * for this, by design, same as the driver app's own image marker.
 *
 * It rotates again — but not the way the very first version of this
 * marker did. That one turned to face a heading INFERRED from the
 * rider's own movement between fixes, and it was deliberately dropped —
 * "the bearing toward wherever the rider happened to be walking, a
 * number with no claim to be true the moment they turned down a side
 * street." This is different: `heading` (see the prop's own comment) is
 * the driver's phone relaying what its own compass or GPS actually
 * measured, straight through the backend with no computation in between
 * — confirmed end to end, not assumed. It arrives late by a few seconds
 * to maybe twenty (bounded by the same 2-minute cutoff that governs the
 * whole position — see `riderAt`), but it is a FACT with latency, the
 * same category of thing the driver app's own marker rotates on, not a
 * guess. `useEasedHeading` eases toward each reading and simply holds at
 * the last one whenever a poll's `heading` comes back `null` (the
 * driver's phone reported nothing that cycle) rather than snapping
 * anywhere. See `riderRegion` below for the position half of "the rider
 * looks like they're actually moving" — this is the facing half.
 *
 * Handed to `MarkerAnimated`'s own `image` prop rather than drawn as a
 * custom child view — a custom-view marker on this same stack, in the
 * driver app, went through two rounds of clipping bugs on Android before
 * landing on native image markers instead, and its rotation went through
 * its own troubleshooting to land on `rotation`+`flat` (native, SDK-level
 * rotation) over animating a `transform` by hand. Both lessons are
 * reused here from the start rather than relearned. */
const RIDER_MARKER_IMAGE = require('../../assets/images/scooter_blue_top_view_marker.png');

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
  /**
   * Degrees from north, straight off the driver's phone — the same value
   * `driverStore.ts`'s `pushLocation` sends, relayed by the backend with no
   * computation of its own (verified against both, not assumed). It is
   * whichever of two things the phone happened to have at the moment: the
   * device compass, while the app is foregrounded and that subscription is
   * live, or GPS course-over-ground otherwise (the very first fix, or the
   * whole time the app is backgrounded mid-delivery — see `MapPanel.tsx`
   * there for where each comes from). Both are real, instantaneous,
   * device-measured readings, never a bearing inferred from stored fixes;
   * neither the client nor the schema can tell which of the two arrived on
   * a given poll. `null` whenever the driver's phone hadn't reported either
   * yet, and collapses to `null` along with the whole position once the fix
   * is older than two minutes — see `RIDER_MARKER_IMAGE`'s own comment for
   * how the marker rotates on this.
   */
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
 * ## This now draws a real map
 *
 * It used to be a hand-projected relative map — every marker at its true
 * position but on a plain grid, honestly labelled as not street tiles,
 * because street tiles meant a native module, a Google Maps key and a
 * development build. All three are now in place (see `app.config.js` and
 * `.env.example`), so this is that promised upgrade: the projection is gone,
 * the props are exactly the same.
 *
 * The line between two points now follows actual roads — `MapViewDirections`
 * asks Google's Directions API for the real route and draws THAT, solid,
 * instead of a straight line pretending to be one. A straight, DASHED line
 * is still what draws when a route genuinely isn't available (no API key,
 * the Directions API not enabled for it, or a failed request) — dashed for
 * the same reason it always was: so a line that is NOT a real route never
 * looks like one. See `ROUTE_MIN_INTERVAL_MS` for why the route itself
 * doesn't refetch on every single poll.
 *
 * ## A missing position is drawn, not hidden
 *
 * `rider` is null whenever the server's fix is over two minutes old. The map
 * still renders — the restaurant and the door do not move — and the caption
 * says the rider cannot be seen. A marker left sitting where it was reads as a
 * rider who has stopped, which is a different and more alarming thing than a
 * phone that lost signal.
 *
 * ## The rider's marker glides, and now turns too
 *
 * Several things changed after this actually reached a device: the marker
 * used to be an abstract chevron, then a plain circular bike badge, then
 * (briefly) a plain heading arrow, and it used to SNAP to each new fix
 * rather than move to it. It is now a top-down illustrated scooter
 * (`RIDER_MARKER_IMAGE`), and it glides between the polled positions via
 * `riderRegion`, an `AnimatedRegion` (see its own comment for why that
 * mechanism, specifically, is what makes smooth marker movement possible
 * on this library). It rotates to face `heading` again, too — see that
 * prop's own comment and `RIDER_MARKER_IMAGE`'s for why that is safe now
 * in a way an earlier attempt at the same thing was not.
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
  const mapRef = useRef<MapView>(null);

  /* See `heading`'s and `RIDER_MARKER_IMAGE`'s own comments for what this
     number is and why it's trusted enough to rotate on. */
  const riderRotation = useEasedHeading(heading);

  /* The route to whichever end the rider is currently headed for. Origin is
     throttled (see `useThrottledRoutePoint`); destination is `target`, which
     only ever changes once, when `pickedUp` flips. `legRouteFailed` starts
     false optimistically on every new request (`onStart`) and only the most
     recent request's own `onError` can set it — so a route that failed for
     the RESTAURANT leg does not linger as a false failure once the leg
     target has moved on to the door. */
  const routeOrigin = useThrottledRoutePoint(rider);
  const [legRouteFailed, setLegRouteFailed] = useState(false);
  /* The whole-journey line's two ends (`restaurant`, `drop`) never move once
     an order exists, so this route is fetched exactly once — no throttling
     needed, unlike the leg above. */
  const [journeyRouteFailed, setJourneyRouteFailed] = useState(false);

  /* The rider's own marker pulses; nothing else does. One moving thing on a
     still map is unambiguous about which of the three dots is the person.

     JS-driven, not native: `useNativeDriver: true` updates the view directly
     on the native UI thread and never goes back through a React commit — and
     a React commit is exactly what `react-native-maps` on Android watches
     for to know a custom marker's content needs re-rasterising. Driven here
     instead, every tick is a real prop change for `tracksViewChanges` below
     to actually have something to react to. */
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!rider) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, rider]);

  /*
   * The rider's marker glides between fixes instead of jumping — the same
   * thing Swiggy and Zomato do, and the half of "real-time" a plain
   * `coordinate` prop cannot give: `Marker` snaps the INSTANT its coordinate
   * changes, and the tracking screen polls every five to eight seconds (see
   * `app/food/order/[id].tsx`), so a plain marker would sit still and then
   * teleport, over and over.
   *
   * `AnimatedRegion` is what `react-native-maps` gives a `Marker.Animated`
   * (`MarkerAnimated` below) to smoothly reposition the marker's EXISTING
   * bitmap between two coordinates — a different mechanism from, and not
   * subject to the same Android quirks as, animating what is drawn INSIDE a
   * marker (which the pulse ring above still has to work around). Created
   * once, lazily, from the first fix this map ever sees — never rebuilt, so
   * every later fix animates the same object rather than starting a fresh
   * one at the old position.
   */
  const riderRegion = useRef<AnimatedRegion | null>(null);
  if (rider && !riderRegion.current) {
    riderRegion.current = new AnimatedRegion({
      latitude: rider[1],
      longitude: rider[0],
      latitudeDelta: 0,
      longitudeDelta: 0,
    });
  }

  useEffect(() => {
    if (!rider || !riderRegion.current) return;
    /* Slightly under the five-second poll floor, so one glide finishes
       before the next fix arrives instead of still being mid-flight when it
       does — two overlapping tweens is what makes a smoothly moving marker
       look like it is stuttering instead. */
    riderRegion.current
      .timing({
        latitude: rider[1],
        longitude: rider[0],
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration: 4500,
        useNativeDriver: false,
        /* react-native-maps' own `.d.ts` demands a `toValue` here, but its
           actual implementation (`AnimatedRegion.js`) only ever reads
           latitude/longitude/latitudeDelta/longitudeDelta off this object —
           `toValue` is derived per field internally and whatever is passed
           here is overwritten and never read. The type is simply wrong;
           this satisfies it without pretending the number means anything. */
        toValue: 0,
      })
      .start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rider?.[0], rider?.[1]]);

  const points = [restaurant, rider, drop].filter(Boolean) as LngLat[];

  /*
   * Frame the camera to whatever is on screen, the same job the old
   * projection's bounding box did. Keyed on the points' own values rather
   * than firing on every render, so a diner who has panned off to check a
   * nearby street is not yanked back by an unrelated re-render — only an
   * actual move of the restaurant, the door or the rider re-fits it.
   *
   * Called unconditionally, THEN guarded inside — this used to be declared
   * after the `points.length < 2` early return below, which is a real "fewer
   * hooks than expected" crash waiting for the one order shape that flips
   * that guard between renders: no `dropLocation` (ordered without location
   * access), tracked live while a rider's position was still being sent, and
   * then delivered — a delivered order stops broadcasting one at all, so
   * `points` drops from 2 down to 1 on the exact render after "Delivered"
   * lands, and this hook would have silently stopped being called. React
   * does not allow a component to call a different NUMBER of hooks between
   * renders, whichever reason it has.
   */
  const fitKey = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length < 2) return;
    mapRef.current?.fitToCoordinates(points.map(toLatLng), {
      edgePadding: { top: 40, right: 36, bottom: 40, left: 36 },
      animated: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  /* Nothing to draw. Rendering an empty map would be decoration pretending to
     be information — the caller shows its own line instead. */
  if (points.length < 2) return null;

  const target = pickedUp ? drop : restaurant;
  const legMetres = rider && target ? metresBetween(rider, target) : null;
  const age = readableAge(riderAt);

  return (
    <View
      style={{
        borderRadius: radius.card,
        backgroundColor: colors.surfaceSunken,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      <View style={{ height }}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            ...toLatLng(points[0]),
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
        >
          {/* The whole journey, faint: restaurant to door, along actual
              roads. It is the thing the order is, and it stays visible on
              both legs so the rider's progress reads against something
              fixed. Fixed endpoints, so this fetches once and never
              refetches for the life of the order. */}
          {restaurant && drop && GOOGLE_MAPS_API_KEY ? (
            <MapViewDirections
              origin={toLatLng(restaurant)}
              destination={toLatLng(drop)}
              apikey={GOOGLE_MAPS_API_KEY}
              mode="DRIVING"
              strokeColor={colors.border}
              strokeWidth={1.5}
              onStart={() => setJourneyRouteFailed(false)}
              onError={() => setJourneyRouteFailed(true)}
            />
          ) : null}
          {restaurant && drop && (!GOOGLE_MAPS_API_KEY || journeyRouteFailed) ? (
            <Polyline
              coordinates={[toLatLng(restaurant), toLatLng(drop)]}
              strokeColor={colors.border}
              strokeWidth={1.5}
            />
          ) : null}

          {/* The leg being travelled right now, in brand green, along actual
              roads — solid, because unlike the straight line it can fall
              back to, this really is "the road they will take". The straight
              DASHED line below only draws when this one could not: dashed
              for the same reason it always was, so a line that is NOT a real
              route never looks like one. */}
          {rider && target && routeOrigin && GOOGLE_MAPS_API_KEY ? (
            <MapViewDirections
              origin={toLatLng(routeOrigin)}
              destination={toLatLng(target)}
              apikey={GOOGLE_MAPS_API_KEY}
              mode="DRIVING"
              precision="high"
              strokeColor={colors.brand}
              strokeWidth={3}
              onStart={() => setLegRouteFailed(false)}
              onError={() => setLegRouteFailed(true)}
            />
          ) : null}
          {rider && target && (!GOOGLE_MAPS_API_KEY || legRouteFailed) ? (
            <Polyline
              coordinates={[toLatLng(rider), toLatLng(target)]}
              strokeColor={colors.brand}
              strokeWidth={2.5}
              lineDashPattern={[6, 5]}
            />
          ) : null}

          {/* The restaurant: a ring, filled once the food has left it. */}
          {restaurant ? (
            <Marker coordinate={toLatLng(restaurant)} anchor={{ x: 0.5, y: 0.5 }}>
              <RingIcon filled={pickedUp} fill={colors.surface} stroke={colors.brand} />
            </Marker>
          ) : null}

          {/* The door: a solid pin, and the only teardrop marker on the map so
              it is distinguishable from the restaurant without relying on
              colour. */}
          {drop ? (
            <Marker coordinate={toLatLng(drop)} anchor={{ x: 0.5, y: 1 }}>
              <PinIcon fill={colors.graphite} stroke={colors.surface} />
            </Marker>
          ) : null}

          {/* The rider: a native image marker (see `RIDER_MARKER_IMAGE`'s own
              comment) that glides to each new fix rather than jumping to it —
              see `riderRegion` — and turns to face `riderRotation`, eased,
              via the same native `rotation`+`flat` mechanism the driver
              app's own marker uses (not a hand-animated `transform`, which
              is what led that marker into its own clipping bugs before it
              switched to this). The pulse rides in a sibling `MarkerAnimated`
              at the same coordinate, so its own Animated loop does not force
              this marker to keep re-snapshotting, and shares `riderRegion` so
              the two move together as one thing rather than the ring lagging
              behind or racing ahead of it. */}
          {rider && riderRegion.current ? (
            <MarkerAnimated
              coordinate={riderRegion.current}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={2}
              image={RIDER_MARKER_IMAGE}
              rotation={riderRotation}
              flat
            />
          ) : null}
          {rider && riderRegion.current ? (
            <MarkerAnimated
              coordinate={riderRegion.current}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={1}
              tracksViewChanges
            >
              <Animated.View
                pointerEvents="none"
                style={{
                  width: 148,
                  height: 148,
                  borderRadius: 74,
                  borderWidth: 1.5,
                  borderColor: colors.brand,
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
                  transform: [
                    { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] }) },
                  ],
                }}
              />
            </MarkerAnimated>
          ) : null}
        </MapView>
      </View>

      {/* ── The readout ───────────────────────────────────────────────────
          Distance, then the age of the fix. The age is the part that stops
          this being a map that quietly lies: a marker is only worth reading
          if you know how old it is. */}
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

        <Text variant="numMeta" style={{ color: colors.textTertiary }}>
          {rider ? (age ? `updated ${age}` : 'live') : 'signal lost'}
        </Text>
      </View>
    </View>
  );
}

export default DeliveryMap;
