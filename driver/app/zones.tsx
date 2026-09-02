/* ══════════════════════════════════════════════════════════════════════════
   Where Lampose operates, and whether the rider is standing in it.

   The console draws the zones; this is one of the two places they surface. A
   rider's question is not "show me a map of the city" — it is "am I somewhere
   I will be offered work, and if not, where should I go".

   ## Drawn on react-native-svg, not react-native-maps

   `react-native-maps` IS a dependency here, and the app deliberately does not
   use it — see `components/ui/MapPanel.tsx` and the README. Tiles need a
   Google Maps key and a dev build, and this app runs in Expo Go. So a zone is
   projected the same way the delivery map projects a leg: an equirectangular
   fit of the shape's own bounding box, with the rider's position placed on the
   same scale. It is a SHAPE, not a street map, and it is labelled as one.

   ## `[longitude, latitude]`

   Every coordinate from the server is GeoJSON order and stays that way until
   `project()`, which is the only function here that touches x and y. Getting
   it backwards does not throw — it draws a valid-looking shape nowhere near
   the city.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle as SvgCircle, Path, Rect } from "react-native-svg";
import { Chip, Notice, Text, Toast, TopBar } from "@/components/ui";
import { useDriverLocation } from "@/hooks/useDriverLocation";
import { useFlowStore } from "@/store/flowStore";
import { checkZone, fetchZones, type Zone } from "@/utils/zones";
import { colors, layout, radius, space } from "@/theme";

const CARD_HEIGHT = 150;

/* ── Projection ────────────────────────────────────────────────────────────
   The same approach `MapPanel` uses: fit the shape's bounding box to the box
   we have, with one uniform scale on both axes so a zone is not stretched into
   a shape it is not. Longitude is scaled by cos(latitude) first, because a
   degree of longitude at 17°N is ~0.956 of a degree of latitude and ignoring
   that makes every zone look wider than it is. */
type Pt = { x: number; y: number };

function makeProjector(points: [number, number][], width: number, height: number, pad = 14) {
  if (!points.length) return null;

  const lats = points.map((p) => p[1]);
  const lngs = points.map((p) => p[0]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((midLat * Math.PI) / 180) || 1;

  const xs = lngs.map((lng) => lng * k);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);

  /* A degenerate span — a single point, or a shape thinner than floating point
     cares about — would divide by zero. One metre of padding in degrees keeps
     the scale finite and the marker centred. */
  const spanX = Math.max(maxX - minX, 1e-5);
  const spanY = Math.max(maxY - minY, 1e-5);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);

  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  return (lng: number, lat: number): Pt => ({
    x: offsetX + (lng * k - minX) * scale,
    /* Screen y grows downward; latitude grows northward. */
    y: height - offsetY - (lat - minY) * scale,
  });
}

/** A circle as a ring of points, so one projector serves both shapes. */
function circleRing(center: [number, number], radiusMeters: number, steps = 48): [number, number][] {
  const [lng, lat] = center;
  const dLat = radiusMeters / 111_320;
  const dLng = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180) || 1);
  return Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * Math.PI * 2;
    return [lng + Math.cos(t) * dLng, lat + Math.sin(t) * dLat] as [number, number];
  });
}

const ringOf = (zone: Zone): [number, number][] => {
  if (zone.type === "polygon" && zone.boundary?.[0]) return zone.boundary[0];
  if (zone.center && zone.radius) return circleRing(zone.center, zone.radius);
  return [];
};

function ZoneShape({ zone, me }: { zone: Zone; me?: { lat: number; lng: number } | null }) {
  const [box, setBox] = useState({ width: 0, height: CARD_HEIGHT });
  const ring = useMemo(() => ringOf(zone), [zone]);

  /* The rider is included in the fit ONLY when they are near the zone.
     Otherwise a rider across the country shrinks the shape to a dot, which is
     a worse answer to "what does this zone look like" than leaving them off
     the picture and saying so in words. */
  const fitPoints = useMemo(() => {
    if (!me || !ring.length) return ring;
    const lats = ring.map((p) => p[1]);
    const lngs = ring.map((p) => p[0]);
    const pad = 0.05;
    const near =
      me.lat >= Math.min(...lats) - pad && me.lat <= Math.max(...lats) + pad &&
      me.lng >= Math.min(...lngs) - pad && me.lng <= Math.max(...lngs) + pad;
    return near ? [...ring, [me.lng, me.lat] as [number, number]] : ring;
  }, [ring, me]);

  const project = box.width ? makeProjector(fitPoints, box.width, box.height) : null;

  const path = useMemo(() => {
    if (!project || !ring.length) return "";
    return ring
      .map((p, i) => {
        const { x, y } = project(p[0], p[1]);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z";
  }, [project, ring]);

  const mePoint = project && me && fitPoints.length > ring.length ? project(me.lng, me.lat) : null;

  return (
    <View
      style={styles.shape}
      onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: CARD_HEIGHT })}
    >
      {box.width > 0 && (
        <Svg width={box.width} height={CARD_HEIGHT}>
          <Rect x={0} y={0} width={box.width} height={CARD_HEIGHT} fill={colors.surfaceSunken} />
          {!!path && (
            <Path
              d={path}
              fill={colors.brand}
              fillOpacity={0.18}
              stroke={colors.brand}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          )}
          {mePoint && (
            <>
              <SvgCircle cx={mePoint.x} cy={mePoint.y} r={8} fill={colors.brand} fillOpacity={0.22} />
              <SvgCircle cx={mePoint.x} cy={mePoint.y} r={4} fill={colors.brandInk} />
            </>
          )}
        </Svg>
      )}
    </View>
  );
}

export default function ZonesScreen() {
  const insets = useSafeAreaInsets();
  const { toast } = useFlowStore();
  const { location } = useDriverLocation();

  const [zones, setZones] = useState<Zone[]>([]);
  const [inside, setInside] = useState<Zone | null>(null);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setZones(await fetchZones("food"));
    } catch (err) {
      setError((err as Error)?.message || "We could not load the service area.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Asked of the SERVER rather than computed here. The same rule the rest of
     this app follows: `zone.service.js` decides what is in a zone, including
     active hours and allowed services, and a second implementation in the app
     is a second implementation that drifts. */
  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    checkZone(location.lat, location.lng, "food")
      .then((res) => {
        if (cancelled) return;
        setInside(res.serviceable ? res.zone : null);
        setChecked(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [location]);

  const me = location ? { lat: location.lat, lng: location.lng } : null;

  return (
    <View style={styles.root}>
      <TopBar back="Profile" title="Service area" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <Text variant="caption" color="tertiary">
          Deliveries are only offered inside these areas. They are drawn by the Lampose team and
          update the moment they change.
        </Text>

        {!!error && <Notice tone="danger" glyph="alert" title={error} />}

        {/* Where the rider stands, in the server's own answer. */}
        {!location ? (
          <Notice
            tone="info"
            glyph="mapPin"
            title="Turn on location to see where you are"
            body="Without a position we cannot tell you whether you are inside a service area — and the dispatcher cannot see you either."
          />
        ) : !checked ? null : inside ? (
          <Notice
            tone="success"
            glyph="check"
            title={`You are in ${inside.name}`}
            body={
              inside.pricingMultiplier > 1
                ? `Deliveries here pay ${inside.pricingMultiplier}× the base rate.`
                : "You can be offered deliveries here."
            }
          />
        ) : (
          <Notice
            tone="warning"
            glyph="alert"
            title="You are outside every service area"
            body="You can stay online, but no delivery will be offered until you are inside one of the areas below."
          />
        )}

        {loading ? (
          <Text variant="caption" color="tertiary">
            Loading the service area…
          </Text>
        ) : zones.length === 0 ? (
          <Notice
            tone="muted"
            glyph="info"
            title="No service areas have been drawn yet"
            body="Until the Lampose team draws one, dispatch is not limited by area."
          />
        ) : (
          <View style={{ gap: space[3] }}>
            {zones.map((zone) => {
              const here = inside?.zoneId === zone.zoneId;
              return (
                <View key={zone.zoneId} style={[styles.card, here && styles.cardHere]}>
                  <View style={styles.cardHead}>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text variant="title1" numberOfLines={1}>
                        {zone.name}
                      </Text>
                      <Text variant="numMeta" color="tertiary">
                        {zone.type === "circle" && zone.radius
                          ? `${(zone.radius / 1000).toFixed(1)} km radius`
                          : `${(zone.boundary?.[0]?.length ?? 1) - 1} points`}
                        {zone.activeHours.start
                          ? ` · ${zone.activeHours.start}–${zone.activeHours.end}`
                          : ""}
                      </Text>
                    </View>
                    {here ? (
                      <Chip label="You are here" tone="success" glyph="mapPin" />
                    ) : zone.pricingMultiplier > 1 ? (
                      <Chip label={`${zone.pricingMultiplier}×`} tone="warning" />
                    ) : null}
                  </View>

                  <ZoneShape zone={zone} me={me} />

                  {/* Said plainly, because it is a shape and not a street map —
                      a rider who reads it as one will look for their road. */}
                  <Text variant="caption" color="tertiary">
                    Outline only · streets are not shown
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[4] },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
    gap: space[3],
  },
  cardHere: { borderColor: colors.brand, borderWidth: 1.5 },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space[3],
  },
  shape: {
    height: CARD_HEIGHT,
    borderRadius: radius.chip,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
});
