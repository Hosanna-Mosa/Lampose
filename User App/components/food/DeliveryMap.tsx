import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import MapView, { AnimatedRegion, Marker, MarkerAnimated, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Svg, { Circle, Path } from 'react-native-svg';
import { Bike } from 'lucide-react-native';

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

/** `[lng, lat]` — this file's order, GeoJSON's and MongoDB's — to what
    `react-native-maps` wants. The one place the pair is flipped. */
const toLatLng = ([lng, lat]: LngLat) => ({ latitude: lat, longitude: lng });

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
 * The rider: a plain circular badge with a bike glyph inside — the same
 * shape Swiggy and Zomato mark a live rider with, rather than the arrow this
 * used to draw.
 *
 * It does not rotate. The old chevron turned to face the rider's compass
 * heading, which meant a phone with no compass drew a GUESSED heading — the
 * bearing toward wherever the rider happened to be walking, a number with no
 * claim to be true the moment they turned down a side street. Neither app it
 * is modelled on rotates its badge either: which way the rider is actually
 * heading is read off the badge MOVING that way, smoothly, not off the glyph
 * spinning to face it. See `riderRegion` below for the half of this that
 * makes the movement itself true.
 */
function RiderIcon({ badge, glyph, ring }: { badge: string; glyph: string; ring: string }) {
  const size = 34;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - 2} fill={badge} stroke={ring} strokeWidth={2} />
      </Svg>
      <Bike size={16} color={glyph} strokeWidth={2.4} />
    </View>
  );
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
  /**
   * Degrees from north. Accepted, but no longer used to rotate the marker —
   * see `RiderIcon`'s own comment for why. Kept in the type rather than
   * removed so the caller (`app/food/order/[id].tsx`) does not need to stop
   * passing what the server already sends it.
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
 * The line between two points is still a STRAIGHT line, not a road-following
 * route — only the canvas underneath changed, not the geometry drawn on top.
 * Real turn-by-turn routing is a separate decision, same as it was before.
 *
 * ## A missing position is drawn, not hidden
 *
 * `rider` is null whenever the server's fix is over two minutes old. The map
 * still renders — the restaurant and the door do not move — and the caption
 * says the rider cannot be seen. A marker left sitting where it was reads as a
 * rider who has stopped, which is a different and more alarming thing than a
 * phone that lost signal.
 *
 * ## The rider's marker glides, and looks like one
 *
 * Two more things changed after this actually reached a device: the marker
 * used to be an abstract chevron and it used to SNAP to each new fix rather
 * than move to it. It is now a plain circular bike badge — the same shape
 * Swiggy and Zomato mark a rider with — and it glides between the polled
 * positions via `riderRegion`, an `AnimatedRegion` (see its own comment for
 * why that mechanism, specifically, is what makes smooth marker movement
 * possible on this library). It does not rotate to face a heading any more;
 * see `RiderIcon` for why that was a guess worth dropping rather than a fact
 * worth keeping.
 */
export function DeliveryMap({
  restaurant,
  drop,
  rider,
  riderAt,
  pickedUp = false,
  height = 200,
}: DeliveryMapProps) {
  const { colors, space, radius } = useTheme();
  const mapRef = useRef<MapView>(null);

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
          {/* The whole journey, faint: restaurant to door. It is the thing the
              order is, and it stays visible on both legs so the rider's
              progress reads against something fixed. */}
          {restaurant && drop ? (
            <Polyline
              coordinates={[toLatLng(restaurant), toLatLng(drop)]}
              strokeColor={colors.border}
              strokeWidth={1.5}
            />
          ) : null}

          {/* The leg being travelled right now, in brand green and dashed.
              Dashed because it is a straight line and NOT a route — a solid
              line reads as "this is the road they will take". */}
          {rider && target ? (
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

          {/* The rider: a bike badge that glides to each new fix rather than
              jumping to it — see `riderRegion`. The pulse rides in a sibling
              `MarkerAnimated` at the same coordinate, so its own Animated
              loop does not force the badge's marker to keep re-snapshotting,
              and shares `riderRegion` so the two move together as one thing
              rather than the ring lagging behind or racing ahead of it. */}
          {rider && riderRegion.current ? (
            <MarkerAnimated coordinate={riderRegion.current} anchor={{ x: 0.5, y: 0.5 }} zIndex={2}>
              <RiderIcon badge={colors.brand} glyph={colors.onBrand} ring={colors.surface} />
            </MarkerAnimated>
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
