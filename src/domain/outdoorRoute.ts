/**
 * A walk the signed-in person draws or sketches.
 * The line stays on their account. It is not a buddy share and not a live fix.
 */

export const LOCATION_WHEN_IN_USE =
  'Charioteer uses your location only while the map is open, to show where you are and to draw a walk. It is not tracked in the background. It is never shared. It is stored only if you save a route.';

export const LOCATION_PAGE_LINE =
  'Location is optional. It is used only while this page is open, to show where you are and to draw a walk. It is not tracked in the background. It is never shared. It is stored only if you save a route.';

export const OUTSIDE_SAFETY_LINE =
  'Not medical advice. If you feel unwell, contact your GP or NHS 111. Call 999 for chest pain, fainting, or breathlessness.';

export const OUTSIDE_CRISIS_LINE =
  'If you are in distress, call Samaritans on 116 123. Call 999 if you are in immediate danger.';

export const SKETCH_LINE =
  'This ring is a sketch, not a path. It can cross roads, water, or private land. The app does not know if it is safe or legal.';

export const PATH_LINE =
  'A line on the map may follow a path that is unsurfaced, closed, or private. The app does not know. It does not promise that a route is safe, legal, or passable.';

export const PLAN_ONLY_LINE =
  'Sharing a walk with a buddy is not in this version. When it is added, the other person will see a plan only: a name, a time, a distance, and a duration. Never where you are.';

export const MAP_CREDIT = 'OpenFreeMap © OpenMapTiles. Data from OpenStreetMap.';

export const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
export const OPENFREEMAP_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';

const EARTH_M = 6_371_000;
const WALK_METRES_PER_MINUTE = 80;
const MAX_POINTS = 64;

export type OutdoorKind = 'drawn' | 'craving_walk';

export type OutdoorPoint = {
  latitude: number;
  longitude: number;
};

export type OutdoorRoute = {
  id: string;
  title: string;
  kind: OutdoorKind;
  distanceM: number;
  durationMinutes: number;
  points: OutdoorPoint[];
  createdAt: string;
};

export type OutdoorRouteDraft = {
  id?: string;
  title: string;
  kind: OutdoorKind;
  points: readonly OutdoorPoint[];
  durationMinutes?: number;
};

export function openFreeMapStyle(scheme: 'dark' | 'light'): string {
  return scheme === 'light' ? OPENFREEMAP_LIGHT : OPENFREEMAP_DARK;
}

export function mapStart(): OutdoorPoint {
  return { latitude: 51.4545, longitude: -2.5879 };
}

export function toLngLat(point: OutdoorPoint): [number, number] {
  return [point.longitude, point.latitude];
}

function finitePoint(value: unknown): OutdoorPoint | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { latitude?: unknown; longitude?: unknown };
  const latitude = typeof row.latitude === 'number' ? row.latitude : Number(row.latitude);
  const longitude = typeof row.longitude === 'number' ? row.longitude : Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function cleanPoints(points: readonly OutdoorPoint[]): OutdoorPoint[] {
  return points.map((point) => finitePoint(point)).filter((point): point is OutdoorPoint => point != null).slice(0, MAX_POINTS);
}

export function metresBetween(a: OutdoorPoint, b: OutdoorPoint): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathMetres(points: readonly OutdoorPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += metresBetween(points[index - 1], points[index]);
  }
  return Math.round(total);
}

function offset(origin: OutdoorPoint, metres: number, bearing: number): OutdoorPoint {
  const lat = (origin.latitude * Math.PI) / 180;
  const lng = (origin.longitude * Math.PI) / 180;
  const ang = metres / EARTH_M;
  const lat2 = Math.asin(Math.sin(lat) * Math.cos(ang) + Math.cos(lat) * Math.sin(ang) * Math.cos(bearing));
  const lng2 = lng + Math.atan2(
    Math.sin(bearing) * Math.sin(ang) * Math.cos(lat),
    Math.cos(ang) - Math.sin(lat) * Math.sin(lat2),
  );
  return { latitude: (lat2 * 180) / Math.PI, longitude: (lng2 * 180) / Math.PI };
}

/** A closed ring on the phone. No router is called. */
export function cravingSketch(centre: OutdoorPoint, minutes: number): OutdoorPoint[] {
  const walk = Math.min(20, Math.max(10, Math.round(minutes)));
  const radius = (walk * WALK_METRES_PER_MINUTE) / (2 * Math.PI);
  const steps = 16;
  const ring: OutdoorPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    ring.push(offset(centre, radius, (index / steps) * Math.PI * 2));
  }
  return ring;
}

export function formatWalkDistance(metres: number): string {
  if (metres < 1000) return `${Math.max(0, Math.round(metres))} m`;
  const km = metres / 1000;
  return `${km.toFixed(km >= 10 ? 0 : 1)} km`;
}

export function routeSummary(route: Pick<OutdoorRoute, 'distanceM' | 'durationMinutes'>): string {
  return `${formatWalkDistance(route.distanceM)} · ${route.durationMinutes} min`;
}

function titleOf(value: string): string | null {
  const title = value.trim().slice(0, 80);
  return title.length > 0 ? title : null;
}

export function outdoorRouteFromDraft(id: string, draft: OutdoorRouteDraft, createdAt = new Date().toISOString()): OutdoorRoute | null {
  const title = titleOf(draft.title);
  const points = cleanPoints(draft.points);
  if (!title || points.length < 2) return null;
  if (draft.kind !== 'drawn' && draft.kind !== 'craving_walk') return null;
  const duration = draft.durationMinutes ?? Math.min(240, Math.max(10, Math.round(pathMetres(points) / WALK_METRES_PER_MINUTE)));
  if (!Number.isFinite(duration) || duration < 1 || duration > 240) return null;
  return {
    id,
    title,
    kind: draft.kind,
    distanceM: pathMetres(points),
    durationMinutes: Math.round(duration),
    points,
    createdAt,
  };
}

export function outdoorRouteFromRow(row: {
  id?: unknown;
  title?: unknown;
  kind?: unknown;
  distance_m?: unknown;
  duration_minutes?: unknown;
  geometry?: unknown;
  created_at?: unknown;
}): OutdoorRoute | null {
  if (typeof row.id !== 'string' || typeof row.title !== 'string') return null;
  if (row.kind !== 'drawn' && row.kind !== 'craving_walk') return null;
  const geometry = Array.isArray(row.geometry) ? row.geometry : [];
  const points = geometry.map((item) => finitePoint(item)).filter((point): point is OutdoorPoint => point != null);
  const distance = typeof row.distance_m === 'number' ? row.distance_m : Number(row.distance_m);
  const duration = typeof row.duration_minutes === 'number' ? row.duration_minutes : Number(row.duration_minutes);
  if (points.length < 2 || !Number.isFinite(distance) || !Number.isFinite(duration)) return null;
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    distanceM: Math.round(distance),
    durationMinutes: Math.round(duration),
    points,
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  };
}

/** Columns the signed-in person may insert. No live fix column. */
export function outdoorRouteInsert(userId: string, id: string, draft: OutdoorRouteDraft): Record<string, unknown> | null {
  const route = outdoorRouteFromDraft(id, draft);
  if (!route) return null;
  return {
    id: route.id,
    user_id: userId,
    title: route.title,
    kind: route.kind,
    distance_m: route.distanceM,
    duration_minutes: route.durationMinutes,
    geometry: route.points,
  };
}

type LineInput = { id: string; points: readonly OutdoorPoint[] };

function lineFeatures(lines: readonly LineInput[]) {
  return lines.flatMap((line) => {
    const points = cleanPoints(line.points);
    if (points.length < 2) return [];
    return [{
      type: 'Feature' as const,
      id: line.id,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: points.map((point) => toLngLat(point)),
      },
    }];
  });
}

export function savedLineCollection(routes: readonly OutdoorRoute[]) {
  return {
    type: 'FeatureCollection' as const,
    features: lineFeatures(routes.map((route) => ({ id: route.id, points: route.points }))),
  };
}

export function sketchLineCollection(points: readonly OutdoorPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: lineFeatures([{ id: 'sketch', points }]),
  };
}

export function hereCollection(point: OutdoorPoint | null) {
  const clean = point ? finitePoint(point) : null;
  return {
    type: 'FeatureCollection' as const,
    features: clean ? [{
      type: 'Feature' as const,
      id: 'here',
      properties: {},
      geometry: { type: 'Point' as const, coordinates: toLngLat(clean) },
    }] : [],
  };
}

export function sampleCanalLoop(): OutdoorRoute {
  const centre = { latitude: 51.449, longitude: -2.597 };
  const points = cravingSketch(centre, 15);
  return {
    id: '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a01',
    title: 'Canal loop',
    kind: 'drawn',
    distanceM: pathMetres(points),
    durationMinutes: 15,
    points,
    createdAt: '2026-10-20T09:00:00.000Z',
  };
}

export function viewCentre(routes: readonly OutdoorRoute[], sketch: readonly OutdoorPoint[], here: OutdoorPoint | null): OutdoorPoint {
  if (here) return here;
  if (sketch.length) return sketch[0];
  if (routes[0]?.points.length) return routes[0].points[0];
  return mapStart();
}
