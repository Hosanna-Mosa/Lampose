/* ══════════════════════════════════════════════════════════════════════════
   Turning a rep's raw GPS pings into a line that follows the streets.

   Two steps, in this order:

   1. `cleanPath` throws away the fixes that are not movement — a phone
      standing still wanders ±20 m, and a phone indoors occasionally reports
      a fix hundreds of metres away and then comes straight back. Joined
      point-to-point, those are the zig-zags and starbursts on the map.

   2. `useRoadSnappedPath` sends what is left to the Google Roads API
      (`snapToRoads`, `interpolate=true`), which moves each fix onto the road
      it was on and adds the points in between so the line bends round
      corners instead of cutting through buildings. It needs the Roads API
      enabled on `VITE_GOOGLE_MAPS_API_KEY`.

   If snapping fails (API not enabled, quota, offline) the cleaned path is
   returned with `snapped: false` and the caller draws it DASHED — the same
   rule as the delivery maps: a line that isn't a real route never looks
   like one.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useState } from 'react';

export interface PathPoint {
  lat: number;
  lng: number;
  /** Radius in metres; null/absent on fixes from older app builds. */
  accuracy?: number | null;
  at?: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/* A fix vaguer than this is Wi-Fi/cell positioning, not GPS — it can sit
   hundreds of metres from the rep, and snapping then routes the path down
   real streets they never walked. Fixes without an accuracy are kept. */
const MAX_ACCURACY_M = 50;
/* Closer than this to the last kept fix is standing-still jitter. */
const MIN_MOVE_M = 12;
/* Faster than this between fixes (≈110 km/h) is a jump, not a journey. */
const MAX_SPEED_MPS = 30;
/* After this many jumps in a row, the "jumps" are where the rep really is —
   accept the next fix so one bad starting point can't reject everything. */
const MAX_CONSECUTIVE_REJECTS = 3;
/* A→B→C where B is far from both but A and C are close: B was a spike. */
const SPIKE_MIN_LEG_M = 60;
const SPIKE_RETURN_RATIO = 0.35;

/* snapToRoads takes at most 100 points per request. */
const ROADS_CHUNK = 100;
const ROADS_URL = 'https://roads.googleapis.com/v1/snapToRoads';

export const distanceM = (a: LatLng, b: LatLng): number => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const timeOf = (p: PathPoint): number => (p.at ? new Date(p.at).getTime() : NaN);

export function cleanPath(points: PathPoint[]): LatLng[] {
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && !(p.lat === 0 && p.lng === 0)
    && !(typeof p.accuracy === 'number' && p.accuracy > MAX_ACCURACY_M));

  /* Pass 1 — drop jitter and impossible jumps. */
  const kept: PathPoint[] = [];
  let rejects = 0;
  for (const p of valid) {
    const prev = kept[kept.length - 1];
    if (!prev) { kept.push(p); continue; }
    const d = distanceM(prev, p);
    if (d < MIN_MOVE_M) continue;
    const dt = (timeOf(p) - timeOf(prev)) / 1000;
    const tooFast = Number.isFinite(dt) && dt > 0 && d / dt > MAX_SPEED_MPS;
    if (tooFast && rejects < MAX_CONSECUTIVE_REJECTS) { rejects += 1; continue; }
    rejects = 0;
    kept.push(p);
  }

  /* Pass 2 — drop out-and-back spikes the speed test let through. */
  const out: LatLng[] = [];
  for (let i = 0; i < kept.length; i += 1) {
    const a = out[out.length - 1];
    const b = kept[i];
    const c = kept[i + 1];
    if (a && c) {
      const ab = distanceM(a, b);
      const bc = distanceM(b, c);
      if (ab > SPIKE_MIN_LEG_M && bc > SPIKE_MIN_LEG_M
        && distanceM(a, c) < SPIKE_RETURN_RATIO * Math.min(ab, bc)) continue;
    }
    out.push({ lat: b.lat, lng: b.lng });
  }
  return out;
}

/* Snapped chunks, keyed by the exact `path=` string sent. Earlier chunks of
   a live path never change, so the 8-second poll only re-requests the last
   one — and only when a new fix has actually arrived. */
const snapCache = new Map<string, LatLng[]>();
const SNAP_CACHE_MAX = 200;

async function snapChunk(chunk: LatLng[], apiKey: string, signal: AbortSignal): Promise<LatLng[]> {
  const pathParam = chunk.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|');
  const cached = snapCache.get(pathParam);
  if (cached) return cached;

  const url = `${ROADS_URL}?interpolate=true&path=${encodeURIComponent(pathParam)}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`snapToRoads ${res.status}`);
  const body = await res.json();
  const snapped: LatLng[] = Array.isArray(body?.snappedPoints)
    ? body.snappedPoints
      .map((s: any) => ({ lat: Number(s?.location?.latitude), lng: Number(s?.location?.longitude) }))
      .filter((p: LatLng) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    : [];
  /* An empty answer (nowhere near a road) is not a route — keep the fixes. */
  const result = snapped.length > 1 ? snapped : chunk;

  if (snapCache.size >= SNAP_CACHE_MAX) {
    const oldest = snapCache.keys().next().value;
    if (oldest !== undefined) snapCache.delete(oldest);
  }
  snapCache.set(pathParam, result);
  return result;
}

export function useRoadSnappedPath(points: PathPoint[], apiKey: string): { path: LatLng[]; snapped: boolean } {
  /* The service hands back a fresh array on every poll; key on the content. */
  const signature = points.map((p) => `${p.lat},${p.lng},${p.accuracy ?? ''},${p.at ?? ''}`).join(';');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cleaned = useMemo(() => cleanPath(points), [signature]);
  const cleanedKey = cleaned.map((p) => `${p.lat},${p.lng}`).join(';');

  const [state, setState] = useState<{ key: string; path: LatLng[]; snapped: boolean }>({
    key: '', path: [], snapped: false,
  });

  useEffect(() => {
    if (!apiKey || cleaned.length < 2) {
      setState({ key: cleanedKey, path: cleaned, snapped: false });
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        /* Chunks overlap by one fix so the pieces join without a gap. */
        const chunks: LatLng[][] = [];
        for (let i = 0; i < cleaned.length - 1; i += ROADS_CHUNK - 1) {
          chunks.push(cleaned.slice(i, i + ROADS_CHUNK));
        }
        const pieces = await Promise.all(chunks.map((c) => snapChunk(c, apiKey, controller.signal)));
        const joined: LatLng[] = [];
        pieces.forEach((piece, i) => joined.push(...(i === 0 ? piece : piece.slice(1))));
        if (!controller.signal.aborted) setState({ key: cleanedKey, path: joined, snapped: true });
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('[sales-tracking] Road snapping unavailable, drawing the cleaned GPS path instead.', err);
        setState({ key: cleanedKey, path: cleaned, snapped: false });
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanedKey, apiKey]);

  /* Until the snap for the current fixes lands, keep the last snapped line —
     a new fix every 15 s would otherwise flash the dashed fallback each time.
     Only before the first snap ever lands is the cleaned line shown. */
  if (state.key !== cleanedKey) {
    return state.snapped && state.path.length > 1
      ? { path: state.path, snapped: true }
      : { path: cleaned, snapped: false };
  }
  return { path: state.path, snapped: state.snapped };
}
