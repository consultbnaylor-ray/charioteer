/**
 * A walk the signed-in person saves.
 * The line stays on their account. It is not shared with other people.
 * A live fix is not stored. A route service is called only after route finding is on.
 */

export const LOCATION_WHEN_IN_USE =
  'Charioteer uses your location while you are on a walk, run or cycle to track distance and give you spoken updates, including when the screen is locked or you are using other apps. Your route stays on your phone and is not sent anywhere. The same permission shows where you are while the map is open. A route is sent to the route service only if you turn route finding on. That request is the start, the destination, and any points you add on the map. It is not the outing path.';

export const LOCATION_PAGE_LINE =
  'Location is optional. The map uses it while this page is open, to show where you are. A walk, run, or cycle you start can keep using it until you stop. A route is sent to the route service only if you turn route finding on. It is not shared with other people. It is stored only if you save a route.';

export const OUTSIDE_SAFETY_LINE =
  'Not medical advice. If you feel unwell, contact your GP or NHS 111. Call 999 for chest pain, fainting, or breathlessness.';

export const OUTSIDE_CRISIS_LINE =
  'If you are in distress, call Samaritans on 116 123. Call 999 if you are in immediate danger.';

export const SKETCH_LINE =
  'This ring is a sketch, not a path. It can cross roads, water, or private land. The app does not know if it is safe or legal.';

export const PATH_LINE =
  'A line on the map may follow a path that is unsurfaced, closed, or private. The app does not know. It does not promise that a route is safe, legal, or passable.';

export const ROUTE_SAFETY_LINE =
  "Live routes can't be shared with anyone. That's to protect your safety.";

export const MAP_CREDIT = 'OpenFreeMap © OpenMapTiles. Data from OpenStreetMap.';

export const OPENFREEMAP_HOST = 'tiles.openfreemap.org';
export const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
export const OPENFREEMAP_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';

/** Remembered on this phone. The map opens light until a choice is stored. */
export const MAP_STYLE_STORAGE_KEY = 'charioteer.map-style';

export type MapScheme = 'light' | 'dark';

/** Dark green on the light Liberty style. Lime on the dark style. */
export const MAP_LINE_LIGHT = '#047857';
export const MAP_LINE_DARK = '#2DE0A0';

/** Blue on the light Liberty style. Pale blue on the dark style. Not the saved-route green. */
export const TRACK_LINE_LIGHT = '#1D4ED8';
export const TRACK_LINE_DARK = '#93C5FD';

const EARTH_M = 6_371_000;
const WALK_METRES_PER_MINUTE = 80;
/** A line the app will hold. The live table still caps a row at LIVE_POINT_CAP until a later migration. */
export const ROUTE_POINT_CAP = 2000;
export const LIVE_POINT_CAP = 64;
const MAX_POINTS = ROUTE_POINT_CAP;

export type OutdoorKind = 'drawn' | 'craving_walk' | 'loop' | 'point_to_point';

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
  /** When set, this is the stored length. A shortened line does not replace it. */
  distanceM?: number;
  ascentM?: number | null;
};

export function isOutdoorKind(value: unknown): value is OutdoorKind {
  return value === 'drawn' || value === 'craving_walk' || value === 'loop' || value === 'point_to_point';
}

export function routeKindLabel(kind: OutdoorKind): string {
  if (kind === 'craving_walk') return 'Craving walk';
  if (kind === 'loop') return 'Loop';
  if (kind === 'point_to_point') return 'A to B';
  return 'Saved route';
}

export function openFreeMapStyle(scheme: MapScheme): string {
  return scheme === 'light' ? OPENFREEMAP_LIGHT : OPENFREEMAP_DARK;
}

/** A missing or unknown value stays light. Dark is stored only after the person chooses it. */
export function parseMapScheme(value: unknown): MapScheme {
  return value === 'dark' ? 'dark' : 'light';
}

export function mapLineColour(scheme: MapScheme): string {
  return scheme === 'dark' ? MAP_LINE_DARK : MAP_LINE_LIGHT;
}

export function trackLineColour(scheme: MapScheme): string {
  return scheme === 'dark' ? TRACK_LINE_DARK : TRACK_LINE_LIGHT;
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

function storedDistance(draft: OutdoorRouteDraft, points: readonly OutdoorPoint[]): number | null {
  if (typeof draft.distanceM === 'number' && Number.isFinite(draft.distanceM)) {
    const rounded = Math.round(draft.distanceM);
    if (rounded < 0 || rounded > 200_000) return null;
    return rounded;
  }
  return pathMetres(points);
}

export function outdoorRouteFromDraft(id: string, draft: OutdoorRouteDraft, createdAt = new Date().toISOString()): OutdoorRoute | null {
  const title = titleOf(draft.title);
  const points = cleanPoints(draft.points);
  if (!title || points.length < 2) return null;
  if (!isOutdoorKind(draft.kind)) return null;
  const distance = storedDistance(draft, points);
  const duration = draft.durationMinutes ?? Math.min(240, Math.max(10, Math.round(pathMetres(points) / WALK_METRES_PER_MINUTE)));
  if (distance == null || !Number.isFinite(duration) || duration < 1 || duration > 240) return null;
  return {
    id,
    title,
    kind: draft.kind,
    distanceM: distance,
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
  if (!isOutdoorKind(row.kind)) return null;
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
  const row: Record<string, unknown> = {
    id: route.id,
    user_id: userId,
    title: route.title,
    kind: route.kind,
    distance_m: route.distanceM,
    duration_minutes: route.durationMinutes,
    geometry: route.points,
  };
  if (typeof draft.ascentM === 'number' && Number.isFinite(draft.ascentM)) {
    row.ascent_m = Math.min(20_000, Math.max(0, Math.round(draft.ascentM)));
  }
  return row;
}

/** The live table still allows only a short drawn line or a craving walk. */
export function liveKind(kind: OutdoorKind): 'drawn' | 'craving_walk' {
  return kind === 'craving_walk' ? 'craving_walk' : 'drawn';
}

export function simplifyLine(points: readonly OutdoorPoint[], cap = LIVE_POINT_CAP): OutdoorPoint[] {
  const clean = cleanPoints(points);
  if (clean.length <= cap) return clean;
  const lastIndex = clean.length - 1;
  const picked: OutdoorPoint[] = [];
  for (let step = 0; step < cap; step += 1) {
    const point = clean[Math.round((step * lastIndex) / (cap - 1))];
    const prev = picked[picked.length - 1];
    if (!point || (prev && prev.latitude === point.latitude && prev.longitude === point.longitude)) continue;
    picked.push(point);
  }
  const end = clean[lastIndex];
  if (end && (picked.length === 0 || picked[picked.length - 1].latitude !== end.latitude || picked[picked.length - 1].longitude !== end.longitude)) {
    if (picked.length >= cap) picked[picked.length - 1] = end;
    else picked.push(end);
  }
  return picked;
}

export function liveOutdoorRouteInsert(userId: string, id: string, draft: OutdoorRouteDraft): Record<string, unknown> | null {
  const route = outdoorRouteFromDraft(id, draft);
  if (!route) return null;
  const points = simplifyLine(route.points, LIVE_POINT_CAP);
  if (points.length < 2) return null;
  return {
    id: route.id,
    user_id: userId,
    title: route.title,
    kind: liveKind(route.kind),
    distance_m: route.distanceM,
    duration_minutes: route.durationMinutes,
    geometry: points,
  };
}

export function routeTableMissing(message: string): boolean {
  if (/ascent_m/i.test(message)) return false;
  return /does not exist|schema cache|could not find the table/i.test(message);
}

/** The live row is too narrow for this line. A missing table is not this case. */
export function routeShapeRejected(message: string): boolean {
  if (routeTableMissing(message)) return false;
  return /check constraint|violates check|ascent_m|invalid input|permission denied/i.test(message);
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

/** The line of an outing still on screen. Callers keep the points in memory and do not save them. */
export function trackLineCollection(points: readonly OutdoorPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: lineFeatures([{ id: 'track', points }]),
  };
}

/** Blue fill and white ring. Distinct from the green route-start dot. */
export const YOU_HERE_FILL = '#2563EB';
export const YOU_HERE_RING = '#FFFFFF';

function pointCollection(points: readonly OutdoorPoint[], id: string) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((item, index) => ({
      type: 'Feature' as const,
      id: `${id}-${index}`,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: toLngLat(item) },
    })),
  };
}

/** Green dots at the start of a drawn line. Not the phone's location. An explicit start replaces the first sketch point. */
export function startCollection(
  routes: readonly OutdoorRoute[],
  sketch: readonly OutdoorPoint[],
  startPoint?: OutdoorPoint | null,
) {
  const points: OutdoorPoint[] = [];
  const add = (point: OutdoorPoint | undefined | null) => {
    const clean = point ? finitePoint(point) : null;
    if (!clean) return;
    if (points.some((item) => item.latitude === clean.latitude && item.longitude === clean.longitude)) return;
    points.push(clean);
  };
  if (startPoint) add(startPoint);
  else if (sketch[0]) add(sketch[0]);
  for (const route of routes) add(route.points[0]);
  return pointCollection(points, 'start');
}

/** Shown only after the person asks to see where they are. */
export function youAreHereCollection(point: OutdoorPoint | null) {
  const clean = point ? finitePoint(point) : null;
  return pointCollection(clean ? [clean] : [], 'you');
}

export function sampleCanalLoop(): OutdoorRoute {
  const points = [
    { latitude: 51.449, longitude: -2.597 },
    { latitude: 51.4512, longitude: -2.592 },
    { latitude: 51.453, longitude: -2.588 },
    { latitude: 51.4505, longitude: -2.586 },
    { latitude: 51.449, longitude: -2.597 },
  ];
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

/** A route line stays in frame. The GPS fix is the centre only when no line is on the map. */
export function viewCentre(routes: readonly OutdoorRoute[], sketch: readonly OutdoorPoint[], here: OutdoorPoint | null): OutdoorPoint {
  if (sketch.length) return sketch[0];
  if (routes[0]?.points.length) return routes[0].points[0];
  if (here) return here;
  return mapStart();
}
