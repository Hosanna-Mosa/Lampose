/* ══════════════════════════════════════════════════════════════════════════
   Service zones — where Lampose operates, drawn on a map.

   A port of Project-X's `admin/src/pages/Zones.tsx`. The INTERACTION is copied
   exactly, because that is the part that was asked for and the part that took
   somebody a long time to get right:

     · click the map to place points — a circle's centre, or a polygon's
       vertices one at a time
     · from the fourth vertex on, a new point is INSERTED into the segment it
       is nearest to rather than appended, so a shape drawn out of order does
       not cross itself (`insertionIndexFor` below)
     · drag any numbered node to move that vertex
     · undo the last point, or clear and start again
     · a live preview that redraws as you type coordinates by hand
     · the list shows every zone; selecting one previews it on the big map

   What is NOT copied is Project-X's chrome: it is built on shadcn/Radix,
   TanStack Query and its own tokens, and this console has none of those. The
   page is rebuilt on Lampose's own `Card`/`Modal`/`Button`/`Table` and
   `useFetch`, so it looks like the rest of this console rather than like a
   transplant. Same flow, same gestures, this console's clothes.

   ## Coordinates

   Everything stored and sent is `[longitude, latitude]` — GeoJSON's order and
   MongoDB's, kept unswapped everywhere else in this codebase. Google Maps
   wants `{lat, lng}`. The conversion happens in `toLatLng` / `toLngLat` and
   NOWHERE else, because a swap does not throw: it puts a Rajahmundry zone in
   the Arctic Ocean and every address in the city quietly stops being
   serviceable.

   ## The map needs a key, and there is no fallback in this file

   `VITE_GOOGLE_MAPS_API_KEY`. Project-X carries a hardcoded key as a fallback;
   copying somebody's API credential into a second product is not something to
   do, and this codebase's own rule is no credential fallbacks in source. With
   no key the page still lists, edits, toggles and deletes zones, and the
   drawing panel says exactly what to add and where — coordinates can still be
   typed by hand, which is the same data by a slower road.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Compass,
  Crosshair,
  Eye,
  KeyRound,
  Map as MapIcon,
  MapPin,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Shapes,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  GoogleMap,
  Circle as MapCircle,
  Marker,
  Polygon as MapPolygon,
  useJsApiLoader,
} from '@react-google-maps/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  TableSkeleton,
  Td,
  Textarea,
  Th,
  Toast,
  Tr,
  cx,
  type BadgeTone,
  type ToastState,
} from '../components/ui';
import { zoneService } from '../api/services/zoneService';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../lib/useFetch';
import type { ZoneInput, ZoneRow, ZoneService, ZoneType } from '../api/types';

interface ZonesPageProps {
  search: string;
}

/** Rajahmundry — where Lampose operates. Project-X centres on Bangalore. */
const DEFAULT_CENTER = { lat: 16.9891, lng: 81.7836 };

const SERVICES: { id: ZoneService; label: string }[] = [
  { id: 'food', label: 'Food delivery' },
  { id: 'stay', label: 'Stays' },
];

/** Roles the backend lets draw. Mirrored only to hide a button that would 403. */
const DRAWING_ROLES = new Set(['Super Admin', 'Admin']);

const MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

/* ── Geometry ──────────────────────────────────────────────────────────── */

type LngLat = [number, number];

const toLatLng = (p: LngLat) => ({ lat: p[1], lng: p[0] });
const toLngLat = (lat: number, lng: number): LngLat => [
  Number(lng.toFixed(6)),
  Number(lat.toFixed(6)),
];

/** Metres between two lat/lng pairs. The same haversine the backend uses. */
const metresBetween = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Where a new vertex belongs in an existing ring.
 *
 * Copied from Project-X, and it is the cleverest thing on the page. Appending
 * every click to the end means a shape drawn in anything but perfect order
 * crosses itself, and a self-intersecting polygon is one MongoDB rejects at
 * query time with a message nobody can act on.
 *
 * So each SEGMENT is scored by what inserting here would cost:
 *
 *     cost = |p1 → new| + |new → p2| − |p1 → p2|
 *
 * — the detour the ring would have to make. A point sitting exactly on a
 * segment costs nothing; one far from it costs a lot. The cheapest segment
 * wins, which is the segment a person would have picked by eye.
 *
 * The ring is evaluated as a LOOP (last back to first), so a point dropped
 * near the closing edge lands there rather than being forced onto the end.
 */
const insertionIndexFor = (ringPoints: LngLat[], lat: number, lng: number): number => {
  const loop = [...ringPoints, ringPoints[0]];
  let bestIndex = ringPoints.length;
  let bestCost = Infinity;

  for (let i = 0; i < loop.length - 1; i += 1) {
    const [aLng, aLat] = loop[i];
    const [bLng, bLat] = loop[i + 1];
    const cost =
      metresBetween(aLat, aLng, lat, lng) +
      metresBetween(bLat, bLng, lat, lng) -
      metresBetween(aLat, aLng, bLat, bLng);
    if (cost < bestCost) {
      bestCost = cost;
      bestIndex = i + 1;
    }
  }
  return bestIndex;
};

/** The ring without its closing duplicate, which is what a person edits. */
const openRing = (points: LngLat[]): LngLat[] => {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : points;
};

/* ── Colour by multiplier, exactly as Project-X grades it ──────────────── */

const zoneColors = (multiplier: number) => {
  if (multiplier >= 2) return { fill: '#ef4444', stroke: '#dc2626' };
  if (multiplier >= 1.5) return { fill: '#f97316', stroke: '#ea580c' };
  if (multiplier > 1) return { fill: '#eab308', stroke: '#ca8a04' };
  return { fill: '#0F5F52', stroke: '#0B4A40' };
};

const multiplierTone = (multiplier: number): BadgeTone => {
  if (multiplier >= 2) return 'crit';
  if (multiplier >= 1.5) return 'warn';
  if (multiplier > 1) return 'warn';
  return 'neutral';
};

/* ── The draft a person is drawing ─────────────────────────────────────── */

type Draft = {
  zoneId: string | null;
  name: string;
  description: string;
  type: ZoneType;
  multiplier: string;
  isActive: boolean;
  centerLat: string;
  centerLng: string;
  radius: string;
  /** Open ring — the closing point is added on save, by the server too. */
  points: LngLat[];
  services: ZoneService[];
  start: string;
  end: string;
};

const EMPTY_DRAFT: Draft = {
  zoneId: null,
  name: '',
  description: '',
  type: 'polygon',
  multiplier: '1.0',
  isActive: true,
  centerLat: '',
  centerLng: '',
  radius: '1000',
  points: [],
  services: [],
  start: '',
  end: '',
};

const draftFrom = (zone: ZoneRow): Draft => ({
  zoneId: zone.zoneId,
  name: zone.name,
  description: zone.description,
  type: zone.type,
  multiplier: String(zone.pricingMultiplier),
  isActive: zone.isActive,
  centerLat: zone.center ? String(zone.center[1]) : '',
  centerLng: zone.center ? String(zone.center[0]) : '',
  radius: zone.radius ? String(zone.radius) : '1000',
  points: zone.boundary?.[0] ? openRing(zone.boundary[0]) : [],
  services: zone.allowedServices,
  start: zone.activeHours.start,
  end: zone.activeHours.end,
});

export const ZonesPage: React.FC<ZonesPageProps> = ({ search }) => {
  const { user } = useAuth();
  const canDraw = DRAWING_ROLES.has(user?.role ?? '');

  const [toast, setToast] = useState<ToastState | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ZoneRow | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const [previewCenter, setPreviewCenter] = useState(DEFAULT_CENTER);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  /* Whether the preview map has already been moved to the shape being drawn.
     Without this the map re-centres on every keystroke and fights the person
     panning it. */
  const framed = useRef(false);

  const { isLoaded } = useJsApiLoader({
    id: 'lampose-zone-map',
    googleMapsApiKey: MAPS_KEY,
  });

  const zones = useFetch(() => zoneService.getZones({ search: search || undefined }), [search]);
  const rows = zones.data ?? [];
  const counts = (zones as { counts?: { total: number; active: number } }).counts;

  /* Select the first zone once, so the map is never empty on arrival. */
  useEffect(() => {
    if (!selected && rows.length) pick(rows[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const pick = (zone: ZoneRow) => {
    setSelected(zone);
    if (zone.type === 'circle' && zone.center) setMapCenter(toLatLng(zone.center));
    else if (zone.boundary?.[0]?.[0]) setMapCenter(toLatLng(zone.boundary[0][0]));
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /* ── The live preview follows the draft ──────────────────────────────── */
  useEffect(() => {
    if (draft.type === 'circle') {
      const lat = Number(draft.centerLat);
      const lng = Number(draft.centerLng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) {
        if (!framed.current) {
          setPreviewCenter({ lat, lng });
          framed.current = true;
        }
      }
    } else if (draft.points.length && !framed.current) {
      setPreviewCenter(toLatLng(draft.points[0]));
      framed.current = true;
    }
  }, [draft.type, draft.centerLat, draft.centerLng, draft.points]);

  const startNew = () => {
    setDraft(EMPTY_DRAFT);
    framed.current = false;
    setPreviewCenter(DEFAULT_CENTER);
    setOpen(true);
  };

  const startEdit = (zone: ZoneRow) => {
    setDraft(draftFrom(zone));
    framed.current = true;
    setPreviewCenter(
      zone.type === 'circle' && zone.center
        ? toLatLng(zone.center)
        : zone.boundary?.[0]?.[0]
          ? toLatLng(zone.boundary[0][0])
          : DEFAULT_CENTER,
    );
    setOpen(true);
  };

  /* ── Drawing ─────────────────────────────────────────────────────────── */

  const onMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      const lat = e.latLng?.lat();
      const lng = e.latLng?.lng();
      if (lat == null || lng == null) return;

      setDraft((d) => {
        if (d.type === 'circle') {
          return { ...d, centerLat: lat.toFixed(6), centerLng: lng.toFixed(6) };
        }
        const next = toLngLat(lat, lng);
        /* Under three points there is no ring to insert into — order is
           whatever the person clicked, which is the only information there is. */
        if (d.points.length < 3) return { ...d, points: [...d.points, next] };

        const at = insertionIndexFor(d.points, lat, lng);
        const points = [...d.points];
        points.splice(at, 0, next);
        return { ...d, points };
      });
    },
    [],
  );

  const onVertexDrag = (index: number, e: google.maps.MapMouseEvent) => {
    const lat = e.latLng?.lat();
    const lng = e.latLng?.lng();
    if (lat == null || lng == null) return;
    setDraft((d) => {
      const points = [...d.points];
      points[index] = toLngLat(lat, lng);
      return { ...d, points };
    });
  };

  const undoPoint = () => setDraft((d) => ({ ...d, points: d.points.slice(0, -1) }));

  const clearShape = () =>
    setDraft((d) =>
      d.type === 'circle'
        ? { ...d, centerLat: '', centerLng: '' }
        : { ...d, points: [] },
    );

  const toggleService = (id: ZoneService) =>
    setDraft((d) => ({
      ...d,
      services: d.services.includes(id)
        ? d.services.filter((s) => s !== id)
        : [...d.services, id],
    }));

  /* ── Saving ──────────────────────────────────────────────────────────── */

  const save = async () => {
    if (!draft.name.trim()) {
      setToast({ tone: 'crit', message: 'Give the zone a name.' });
      return;
    }

    const payload: ZoneInput = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      type: draft.type,
      pricingMultiplier: Number(draft.multiplier) || 1,
      isActive: draft.isActive,
      allowedServices: draft.services,
      /* Both or neither — the backend refuses half a window, because "live from
         22:00" with no end reads as a restriction and behaves as none. */
      activeHours: { start: draft.start, end: draft.end },
    };

    if (draft.type === 'circle') {
      const lat = Number(draft.centerLat);
      const lng = Number(draft.centerLng);
      const radius = Number(draft.radius);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setToast({ tone: 'crit', message: 'Click the map to place the centre, or type a coordinate.' });
        return;
      }
      if (!Number.isFinite(radius) || radius <= 0) {
        setToast({ tone: 'crit', message: 'The radius must be a positive number of metres.' });
        return;
      }
      payload.center = { coordinates: [lng, lat] };
      payload.radius = radius;
    } else {
      if (draft.points.length < 3) {
        setToast({ tone: 'crit', message: 'A polygon needs at least three points. Click the map to add them.' });
        return;
      }
      /* Sent OPEN. The server closes the ring — one implementation of that
         rule, on the side that owns the data. */
      payload.boundary = draft.points;
    }

    setBusy(true);
    const res = draft.zoneId
      ? await zoneService.updateZone(draft.zoneId, payload)
      : await zoneService.createZone(payload);
    setBusy(false);

    if (!res.success || !res.data) {
      setToast({ tone: 'crit', message: res.message || 'That did not save.' });
      return;
    }
    setToast({ tone: 'good', message: draft.zoneId ? 'Zone updated.' : 'Zone created.' });
    setOpen(false);
    pick(res.data);
    zones.reload();
  };

  const toggleActive = async (zone: ZoneRow) => {
    setBusy(true);
    const res = await zoneService.updateZone(zone.zoneId, { isActive: !zone.isActive });
    setBusy(false);
    if (!res.success) {
      setToast({ tone: 'crit', message: res.message || 'That did not save.' });
      return;
    }
    setToast({ tone: 'good', message: `${zone.name} ${zone.isActive ? 'switched off' : 'switched on'}.` });
    zones.reload();
  };

  const remove = async (zone: ZoneRow) => {
    if (!window.confirm(`Delete "${zone.name}"? The shape cannot be recovered.`)) return;
    setBusy(true);
    const res = await zoneService.deleteZone(zone.zoneId);
    setBusy(false);
    if (!res.success) {
      setToast({ tone: 'crit', message: res.message || 'That did not delete.' });
      return;
    }
    setToast({ tone: 'good', message: res.message || 'Zone deleted.' });
    if (selected?.zoneId === zone.zoneId) setSelected(null);
    zones.reload();
  };

  /* ── Derived ─────────────────────────────────────────────────────────── */

  const previewPath = useMemo(() => draft.points.map(toLatLng), [draft.points]);
  const previewCircle = useMemo(() => {
    const lat = Number(draft.centerLat);
    const lng = Number(draft.centerLng);
    return Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : null;
  }, [draft.centerLat, draft.centerLng]);

  const summary = counts
    ? [
        { label: 'Zones drawn', value: counts.total },
        { label: 'Live now', value: counts.active },
        {
          label: 'Highest multiplier',
          value: rows.length ? `${Math.max(...rows.map((z) => z.pricingMultiplier))}×` : '—',
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Service zones"
        description="Where Lampose operates, and what a delivery inside each area is multiplied by. The apps read these the moment you save them."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" icon={RefreshCw} onClick={zones.reload} disabled={zones.refreshing}>
              Refresh
            </Button>
            {canDraw && (
              <Button icon={Plus} onClick={startNew}>
                Create zone
              </Button>
            )}
          </div>
        }
      />

      {!MAPS_KEY && (
        <Card padded>
          <div className="flex items-start gap-3">
            <KeyRound className="size-4 text-warn shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-body font-medium text-ink">No Google Maps key is set</p>
              <p className="text-body text-ink-2 mt-1">
                Everything on this page works except the map itself — you can still create, edit,
                switch off and delete zones by typing coordinates. To draw by clicking, add{' '}
                <code className="font-mono text-label bg-surface-inset px-1 py-0.5 rounded">
                  VITE_GOOGLE_MAPS_API_KEY=…
                </code>{' '}
                to <code className="font-mono text-label">Admin/.env</code> and restart the dev
                server.
              </p>
            </div>
          </div>
        </Card>
      )}

      {summary.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {summary.map((s) => (
            <Card key={s.label} padded>
              <p className="text-micro uppercase text-ink-3">{s.label}</p>
              <p className="text-2xl font-semibold text-ink tabular mt-1">{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* ── The list ──────────────────────────────────────────────── */}
        <Card className="xl:col-span-2">
          {zones.loading ? (
            <TableSkeleton cols={6} />
          ) : zones.error ? (
            <ErrorState message={zones.error} onRetry={zones.reload} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={MapIcon}
              title="No zones yet"
              description="Draw one to say where Lampose delivers. Until a zone exists, every address is treated as outside the area."
            />
          ) : (
            <Table>
              <thead>
                <Tr>
                  <Th>Zone</Th>
                  <Th>Shape</Th>
                  <Th className="text-right">Multiplier</Th>
                  <Th>Restrictions</Th>
                  <Th>Status</Th>
                  <Th />
                </Tr>
              </thead>
              <tbody>
                {rows.map((zone) => (
                  <Tr
                    key={zone.zoneId}
                    className={cx(
                      'cursor-pointer',
                      selected?.zoneId === zone.zoneId && 'bg-brand-soft/40',
                    )}
                    onClick={() => pick(zone)}
                  >
                    <Td>
                      <p className="font-medium text-ink">{zone.name}</p>
                      <p className="text-label text-ink-3 font-mono tabular">{zone.zoneId}</p>
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 text-ink-2">
                        {zone.type === 'circle' ? (
                          <>
                            <Compass className="size-3.5" />
                            {zone.radius ? `${(zone.radius / 1000).toFixed(2)} km` : 'circle'}
                          </>
                        ) : (
                          <>
                            <Shapes className="size-3.5" />
                            {zone.boundary?.[0]
                              ? `${openRing(zone.boundary[0]).length} points`
                              : 'polygon'}
                          </>
                        )}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <Badge tone={multiplierTone(zone.pricingMultiplier)}>
                        {zone.pricingMultiplier}×
                      </Badge>
                    </Td>
                    <Td className="text-label text-ink-3">
                      {[
                        zone.allowedServices.length ? zone.allowedServices.join(', ') : null,
                        zone.activeHours.start
                          ? `${zone.activeHours.start}–${zone.activeHours.end}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'none'}
                    </Td>
                    <Td>
                      <Badge tone={zone.isActive ? 'good' : 'neutral'}>
                        {zone.isActive ? 'Live' : 'Off'}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button variant="ghost" icon={Eye} onClick={() => pick(zone)}>
                          View
                        </Button>
                        {canDraw && (
                          <>
                            <Button
                              variant="ghost"
                              icon={zone.isActive ? Ban : Play}
                              onClick={() => toggleActive(zone)}
                              disabled={busy}
                            >
                              {zone.isActive ? 'Off' : 'On'}
                            </Button>
                            <Button variant="ghost" icon={Pencil} onClick={() => startEdit(zone)}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              icon={Trash2}
                              onClick={() => remove(zone)}
                              disabled={busy}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {/* ── The preview map ───────────────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-line">
            <p className="text-body font-medium text-ink">
              {selected ? selected.name : 'Nothing selected'}
            </p>
            <p className="text-label text-ink-3">
              {selected
                ? selected.type === 'circle'
                  ? `Circle · ${selected.radius ?? 0} m`
                  : `Polygon · ${selected.boundary?.[0] ? openRing(selected.boundary[0]).length : 0} points`
                : 'Pick a zone from the list.'}
            </p>
          </div>
          <div className="h-[420px] bg-surface-inset relative">
            {!MAPS_KEY ? (
              <div className="absolute inset-0 grid place-items-center text-center px-6">
                <div>
                  <MapIcon className="size-6 text-ink-3 mx-auto mb-2" />
                  <p className="text-body text-ink-3">The map needs a Google Maps key.</p>
                </div>
              </div>
            ) : !isLoaded ? (
              <div className="absolute inset-0 grid place-items-center">
                <RefreshCw className="size-5 animate-spin text-brand" />
              </div>
            ) : (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={mapCenter}
                zoom={selected?.type === 'circle' ? 13 : 12}
                options={{
                  mapTypeControl: false,
                  streetViewControl: false,
                  fullscreenControl: false,
                }}
              >
                {/* Every zone at once, so overlaps are visible — two zones over
                    one address is legal and the drawing order decides. */}
                {rows.map((zone) => {
                  const colors = zoneColors(zone.pricingMultiplier);
                  const dim = !zone.isActive || selected?.zoneId !== zone.zoneId;
                  const style = {
                    fillColor: colors.fill,
                    fillOpacity: zone.isActive ? (dim ? 0.12 : 0.35) : 0.06,
                    strokeColor: colors.stroke,
                    strokeOpacity: dim ? 0.4 : 0.9,
                    strokeWeight: dim ? 1.5 : 2.5,
                    clickable: false,
                  };
                  if (zone.type === 'circle' && zone.center && zone.radius) {
                    return (
                      <MapCircle
                        key={zone.zoneId}
                        center={toLatLng(zone.center)}
                        radius={zone.radius}
                        options={style}
                      />
                    );
                  }
                  if (zone.boundary?.[0]) {
                    return (
                      <MapPolygon
                        key={zone.zoneId}
                        paths={zone.boundary[0].map(toLatLng)}
                        options={style}
                      />
                    );
                  }
                  return null;
                })}
              </GoogleMap>
            )}
          </div>
        </Card>
      </div>

      {/* ── Draw / edit ─────────────────────────────────────────────── */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={draft.zoneId ? `Edit ${draft.name || 'zone'}` : 'Create a zone'}
        description="Click the map to place points. Drag a numbered node to move it."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : draft.zoneId ? 'Save changes' : 'Create zone'}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ── The form ───────────────────────────────────────────── */}
          <div className="space-y-4">
            <Field label="Zone name" required>
              <Input
                value={draft.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Morampudi and Danavaipeta"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Shape">
                <Select
                  value={draft.type}
                  onChange={(e) => {
                    /* Switching shape clears the OTHER geometry, matching what
                       the server does on save — a document may only ever hold
                       one, or the matcher can match the one nobody is editing. */
                    const type = e.target.value as ZoneType;
                    setDraft((d) => ({
                      ...d,
                      type,
                      ...(type === 'circle' ? { points: [] } : { centerLat: '', centerLng: '' }),
                    }));
                  }}
                >
                  <option value="polygon">Polygon — a custom shape</option>
                  <option value="circle">Circle — a centre and a radius</option>
                </Select>
              </Field>
              <Field label="Price multiplier" hint="1.0 changes nothing.">
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={draft.multiplier}
                  onChange={(e) => set('multiplier', e.target.value)}
                />
              </Field>
            </div>

            {draft.type === 'circle' ? (
              <div className="rounded-control border border-line bg-surface-subtle p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-label font-medium text-ink flex items-center gap-1.5">
                    <Crosshair className="size-3.5 text-brand" /> Centre
                  </p>
                  <button
                    type="button"
                    onClick={clearShape}
                    className="text-label text-crit hover:underline"
                  >
                    Clear
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Latitude">
                    <Input
                      type="number"
                      step="0.000001"
                      value={draft.centerLat}
                      onChange={(e) => set('centerLat', e.target.value)}
                      placeholder="16.9891"
                    />
                  </Field>
                  <Field label="Longitude">
                    <Input
                      type="number"
                      step="0.000001"
                      value={draft.centerLng}
                      onChange={(e) => set('centerLng', e.target.value)}
                      placeholder="81.7836"
                    />
                  </Field>
                </div>
                <Field label="Radius (metres)">
                  <Input
                    type="number"
                    min="1"
                    value={draft.radius}
                    onChange={(e) => set('radius', e.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <div className="rounded-control border border-line bg-surface-subtle p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-label font-medium text-ink flex items-center gap-1.5">
                    <Shapes className="size-3.5 text-brand" /> {draft.points.length} point
                    {draft.points.length === 1 ? '' : 's'}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={undoPoint}
                      disabled={!draft.points.length}
                      className="text-label text-brand-ink hover:underline disabled:opacity-40 inline-flex items-center gap-1"
                    >
                      <Undo2 className="size-3" /> Undo
                    </button>
                    <button
                      type="button"
                      onClick={clearShape}
                      className="text-label text-crit hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="max-h-28 overflow-y-auto font-mono text-label text-ink-2 leading-relaxed">
                  {draft.points.length ? (
                    draft.points.map((p, i) => (
                      <div key={`${p[0]}-${p[1]}-${i}`}>
                        {i + 1}. {p[0].toFixed(5)}, {p[1].toFixed(5)}
                      </div>
                    ))
                  ) : (
                    <span className="text-ink-3 font-sans">
                      Click the map to place the first point.
                    </span>
                  )}
                </div>
                <div className="flex items-start gap-1.5 rounded-control bg-warn-soft border border-warn-border p-2">
                  <AlertTriangle className="size-3.5 text-warn shrink-0 mt-0.5" />
                  <p className="text-label text-warn leading-normal">
                    Points are stored as <strong>[longitude, latitude]</strong>. From the fourth
                    onward a new point is inserted into the nearest edge, so the outline cannot
                    cross itself.
                  </p>
                </div>
              </div>
            )}

            <Field label="Notes" hint="For other administrators. Never shown in an app.">
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="e.g. Drawn to exclude the far bank — no rider covers it."
              />
            </Field>

            <Field label="Restrict to services" hint="None selected means every service.">
              <div className="flex flex-wrap gap-1.5">
                {SERVICES.map((s) => {
                  const on = draft.services.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleService(s.id)}
                      className={cx(
                        'h-8 px-3 rounded-control text-body border transition-colors',
                        on
                          ? 'bg-brand-soft border-brand-border text-brand-ink font-medium'
                          : 'bg-surface border-line text-ink-2 hover:bg-surface-inset',
                      )}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Live from" hint="Leave both blank for always.">
                <Input type="time" value={draft.start} onChange={(e) => set('start', e.target.value)} />
              </Field>
              <Field label="Live until">
                <Input type="time" value={draft.end} onChange={(e) => set('end', e.target.value)} />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-body text-ink-2">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => set('isActive', e.target.checked)}
                className="size-4 accent-[var(--brand)]"
              />
              Live as soon as it is saved
            </label>
          </div>

          {/* ── The drawing surface ────────────────────────────────── */}
          <div className="rounded-control border border-line overflow-hidden min-h-[420px] bg-surface-inset relative">
            {!MAPS_KEY ? (
              <div className="absolute inset-0 grid place-items-center text-center px-6">
                <div>
                  <KeyRound className="size-6 text-ink-3 mx-auto mb-2" />
                  <p className="text-body text-ink-2">No Google Maps key.</p>
                  <p className="text-label text-ink-3 mt-1">
                    Type the coordinates on the left — the zone saves exactly the same either way.
                  </p>
                </div>
              </div>
            ) : !isLoaded ? (
              <div className="absolute inset-0 grid place-items-center">
                <RefreshCw className="size-5 animate-spin text-brand" />
              </div>
            ) : (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%', minHeight: 420 }}
                center={previewCenter}
                zoom={13}
                onClick={onMapClick}
                options={{
                  mapTypeControl: false,
                  streetViewControl: false,
                  fullscreenControl: false,
                }}
              >
                {draft.type === 'circle' && previewCircle && (
                  <>
                    <Marker
                      position={previewCircle}
                      draggable
                      onDragEnd={(e) => {
                        const lat = e.latLng?.lat();
                        const lng = e.latLng?.lng();
                        if (lat != null && lng != null) {
                          set('centerLat', lat.toFixed(6));
                          set('centerLng', lng.toFixed(6));
                        }
                      }}
                    />
                    <MapCircle
                      center={previewCircle}
                      radius={Number(draft.radius) || 1000}
                      options={{
                        fillColor: '#0F5F52',
                        fillOpacity: 0.22,
                        strokeColor: '#0B4A40',
                        strokeOpacity: 0.8,
                        strokeWeight: 2,
                        clickable: false,
                      }}
                    />
                  </>
                )}

                {draft.type === 'polygon' && previewPath.length > 0 && (
                  <>
                    {previewPath.map((pt, i) => (
                      <Marker
                        key={`${pt.lat}-${pt.lng}-${i}`}
                        position={pt}
                        draggable
                        onDragEnd={(e) => onVertexDrag(i, e)}
                        label={{
                          text: String(i + 1),
                          color: '#ffffff',
                          fontSize: '11px',
                          fontWeight: 'bold',
                        }}
                      />
                    ))}
                    <MapPolygon
                      paths={previewPath}
                      options={{
                        fillColor: '#0F5F52',
                        fillOpacity: 0.22,
                        strokeColor: '#0B4A40',
                        strokeOpacity: 0.8,
                        strokeWeight: 2.5,
                        clickable: false,
                      }}
                    />
                  </>
                )}
              </GoogleMap>
            )}

            {MAPS_KEY && isLoaded && (
              <div className="absolute bottom-3 left-3 right-3 rounded-control bg-surface/95 backdrop-blur-sm border border-line px-3 py-2">
                <p className="text-label text-ink-2 flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-brand shrink-0" />
                  {draft.type === 'circle'
                    ? 'Click to set the centre, or drag the pin.'
                    : 'Click to add a point. Drag a numbered pin to move it.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
