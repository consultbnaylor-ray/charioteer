/**
 * A walk the signed-in person saves.
 * The name, distance, and time stay on their account. The line is not stored.
 * It is not shared with other people.
 * A live fix is not stored. A route service is called only after route finding is on.
 */

export const LOCATION_WHEN_IN_USE =
  'Charioteer uses your location while you are on a walk, run or cycle to track distance and give you spoken updates, including when the screen is locked or you are using other apps. Your route stays on your phone and is not sent anywhere. The same permission shows where you are while the map is open. A route is sent to the route service only if you turn route finding on. That request is the start, the destination, and any points you add on the map. It is not the outing path.';

export const LOCATION_PAGE_LINE =
  'Location is optional. The map uses it while this page is open, to show where you are. A walk, run, or cycle you start can keep using it until you stop. A route is sent to the route service only if you turn route finding on. It is not shared with other people. Saving a route keeps the name, distance, and time, not the line.';

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
/**
 * OpenRouteService directions accepts at most this many coordinates.
 * A drawn line is reduced to a handful of corners before it is sent.
 * Fifty is only the service limit. Sending that many forces the route through
 * points that are not real turns, which is what grows the side-street spurs.
 */
export const ORS_WAYPOINT_LIMIT = 50;
/** How many corners a sketch sends, scaled by its length. */
export const SKETCH_WAYPOINT_MIN = 8;
export const SKETCH_WAYPOINT_MAX = 25;
/** A snap longer than this, compared with the pencil line, is rejected. */
export const SNAP_LENGTH_RATIO = 1.6;
/** A snap farther than this from the pencil line is rejected. Metres. */
export const SNAP_DEVIATION_M = 120;
/** A there-and-back that returns inside this distance is a spur. */
export const SPUR_WITHIN_M = 35;
/** An out-and-back longer than this is kept. It may be a loop the person drew. */
export const SPUR_MAX_M = 350;
/**
 * With the pencil line to compare against, a longer there-and-back is dropped when the pencil
 * did not go out and back there. One street block out and back fits.
 */
export const SPUR_MAX_WITH_SKETCH_M = 1200;
/** A jut shorter than this is noise in the route geometry, not a spur. */
const SPUR_MIN_M = 8;
/** A finger wobble smaller than this is dropped before the route is requested. */
export const SKETCH_EPSILON_M = 30;
const SKETCH_RAW_CAP = 500;
const MERCATOR_TILE = 512;
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
  /** Present when the row stored a climb. Absent or null shows the no-climb sentence. */
  ascentM?: number | null;
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

export const DRAWN_ROUTE_KIND_LABEL = 'Your drawn route';

export function routeKindLabel(kind: OutdoorKind): string {
  if (kind === 'craving_walk') return 'Craving walk';
  if (kind === 'loop') return 'Loop';
  if (kind === 'point_to_point') return 'A to B';
  if (kind === 'drawn') return DRAWN_ROUTE_KIND_LABEL;
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

/** High contrast on both map styles. The live finger stroke uses this, solid. */
export const PENCIL_LIGHT = '#111111';
export const PENCIL_DARK = '#F4F1E8';

export function pencilColour(scheme: MapScheme): string {
  return scheme === 'dark' ? PENCIL_DARK : PENCIL_LIGHT;
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

/** The length of a pencil sketch. Computed on the phone. No route request. */
export function sketchDistanceLabel(metres: number): string | null {
  if (!Number.isFinite(metres) || metres < 1) return null;
  return `Sketch ${formatWalkDistance(metres)}`;
}

export function routeSummary(route: Pick<OutdoorRoute, 'distanceM' | 'durationMinutes'>): string {
  return `${formatWalkDistance(route.distanceM)} · ${route.durationMinutes} min`;
}

function titleOf(value: string): string | null {
  const title = value.trim().slice(0, 80);
  return title.length > 0 ? title : null;
}

/** The stored name: ends dropped, 80 characters, empty refused. */
export function routeTitleOf(value: string): string | null {
  return titleOf(value);
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
  ascent_m?: unknown;
  created_at?: unknown;
}): OutdoorRoute | null {
  if (typeof row.id !== 'string' || typeof row.title !== 'string') return null;
  if (!isOutdoorKind(row.kind)) return null;
  const geometry = Array.isArray(row.geometry) ? row.geometry : [];
  const points = geometry.map((item) => finitePoint(item)).filter((point): point is OutdoorPoint => point != null);
  const distance = typeof row.distance_m === 'number' ? row.distance_m : Number(row.distance_m);
  const duration = typeof row.duration_minutes === 'number' ? row.duration_minutes : Number(row.duration_minutes);
  if (!Number.isFinite(distance) || !Number.isFinite(duration)) return null;
  const ascent = row.ascent_m == null || row.ascent_m === '' ? null : Number(row.ascent_m);
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    distanceM: Math.round(distance),
    durationMinutes: Math.round(duration),
    points,
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    ascentM: ascent != null && Number.isFinite(ascent) ? Math.round(ascent) : null,
  };
}

/** Title and time only. No coordinate, and no user id. */
export function outdoorRouteRename(title: string, updatedAt: string): { title: string; updated_at: string } | null {
  const next = titleOf(title);
  if (!next) return null;
  return { title: next, updated_at: updatedAt };
}

/**
 * The same row after Adjust. The owner policy still applies.
 * user_id is not in this object, so the account cannot be moved.
 */
export function outdoorRouteReplace(
  route: OutdoorRoute,
  ascentM: number | null | undefined,
  updatedAt: string,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    title: route.title,
    kind: route.kind,
    distance_m: route.distanceM,
    duration_minutes: route.durationMinutes,
    updated_at: updatedAt,
  };
  if (typeof ascentM === 'number' && Number.isFinite(ascentM)) {
    row.ascent_m = Math.min(20_000, Math.max(0, Math.round(ascentM)));
  } else if (ascentM === null) {
    row.ascent_m = null;
  }
  return row;
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

function copyPoint(point: OutdoorPoint): OutdoorPoint {
  return { latitude: point.latitude, longitude: point.longitude };
}

/** Drops a point that has barely moved, and keeps the stroke short enough to simplify. */
export function appendSketchPoint(points: readonly OutdoorPoint[], next: OutdoorPoint, minMetres = 12): OutdoorPoint[] {
  const point = finitePoint(next);
  if (!point) return points.map(copyPoint);
  const last = points[points.length - 1];
  if (last && metresBetween(last, point) < minMetres) return points.map(copyPoint);
  const grown = [...points.map(copyPoint), point];
  if (grown.length <= SKETCH_RAW_CAP) return grown;
  return simplifyLine(grown, SKETCH_RAW_CAP);
}

function perpendicularMetres(point: OutdoorPoint, start: OutdoorPoint, end: OutdoorPoint): number {
  const originLat = (start.latitude * Math.PI) / 180;
  const east = (value: OutdoorPoint) => (value.longitude - start.longitude) * 111_320 * Math.cos(originLat);
  const north = (value: OutdoorPoint) => (value.latitude - start.latitude) * 111_320;
  const px = east(point);
  const py = north(point);
  const ex = east(end);
  const ey = north(end);
  const length = Math.hypot(ex, ey);
  if (length < 1) return Math.hypot(px, py);
  const along = Math.max(0, Math.min(1, (px * ex + py * ey) / (length * length)));
  return Math.hypot(px - along * ex, py - along * ey);
}

function douglasPeucker(points: readonly OutdoorPoint[], epsilonM: number): OutdoorPoint[] {
  if (points.length <= 2) return points.map(copyPoint);
  let farthest = 0;
  let index = 0;
  const last = points.length - 1;
  for (let cursor = 1; cursor < last; cursor += 1) {
    const distance = perpendicularMetres(points[cursor], points[0], points[last]);
    if (distance > farthest) {
      farthest = distance;
      index = cursor;
    }
  }
  if (farthest <= epsilonM || index === 0) return [copyPoint(points[0]), copyPoint(points[last])];
  const left = douglasPeucker(points.slice(0, index + 1), epsilonM);
  const right = douglasPeucker(points.slice(index), epsilonM);
  return [...left.slice(0, -1), ...right];
}

/**
 * Douglas-Peucker, then a tighter tolerance until the line fits the waypoint cap.
 * The first and last points stay.
 */
export function simplifySketch(
  points: readonly OutdoorPoint[],
  epsilonM = SKETCH_EPSILON_M,
  cap = ORS_WAYPOINT_LIMIT,
): OutdoorPoint[] {
  const clean = cleanPoints(points);
  const limit = Math.max(2, Math.round(cap));
  if (clean.length <= 2) return clean.map(copyPoint);
  const thinned = appendRuns(clean);
  const simplified = douglasPeucker(thinned, Math.max(0, epsilonM));
  if (simplified.length <= limit) return simplified;
  let low = Math.max(0, epsilonM);
  let high = Math.max(low + 1, pathMetres(thinned));
  let best = douglasPeucker(thinned, high);
  if (best.length > limit) return simplifyLine(thinned, limit);
  // Smallest tolerance that still fits. The first coarse hit is not the one we keep.
  for (let step = 0; step < 24 && high - low > 0.5; step += 1) {
    const mid = (low + high) / 2;
    const next = douglasPeucker(thinned, mid);
    if (next.length > limit) low = mid;
    else {
      high = mid;
      best = next;
    }
  }
  return best.length <= limit ? best : simplifyLine(thinned, limit);
}

function appendRuns(points: readonly OutdoorPoint[]): OutdoorPoint[] {
  const kept: OutdoorPoint[] = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last && metresBetween(last, point) < 8) continue;
    kept.push(point);
  }
  const end = points[points.length - 1];
  if (!end) return kept;
  const last = kept[kept.length - 1];
  if (!last) return [end];
  if (last.latitude === end.latitude && last.longitude === end.longitude) return kept;
  if (metresBetween(last, end) < 8) kept[kept.length - 1] = end;
  else kept.push(end);
  return kept;
}

export function sketchIsClosed(points: readonly OutdoorPoint[], withinM = 40): boolean {
  if (points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.latitude === last.latitude && first.longitude === last.longitude) return true;
  return metresBetween(first, last) <= withinM;
}

/** A loop sketch ends on its start so the route service can close the path. */
export function closeSketchIfLoop(points: readonly OutdoorPoint[], withinM = 40): OutdoorPoint[] {
  const copy = points.map(copyPoint);
  if (!sketchIsClosed(copy, withinM)) return copy;
  const first = copy[0];
  const last = copy[copy.length - 1];
  if (first.latitude === last.latitude && first.longitude === last.longitude) return copy;
  return [...copy.slice(0, -1), copyPoint(first)];
}

/**
 * One corner about every 200 m, and never more than 25.
 * A short line still keeps up to eight so a real bend is not dropped,
 * but a straight line stays two points. The count is a cap, not a target.
 */
export function sketchWaypointBudget(lengthM: number): number {
  if (!Number.isFinite(lengthM) || lengthM <= 0) return SKETCH_WAYPOINT_MIN;
  return Math.min(SKETCH_WAYPOINT_MAX, Math.max(SKETCH_WAYPOINT_MIN, Math.round(lengthM / 200)));
}

/**
 * Douglas-Peucker in metres. Only corners survive.
 * The line is not resampled at even gaps. Even gaps are what land a point
 * on the wrong side of a road and make the route run up that road and back.
 */
export function sketchWaypoints(points: readonly OutdoorPoint[], cap?: number): OutdoorPoint[] {
  const clean = cleanPoints(points);
  if (clean.length <= 2) return clean.map(copyPoint);
  const budget = sketchWaypointBudget(pathMetres(clean));
  const limit = Math.min(SKETCH_WAYPOINT_MAX, Math.max(2, Math.round(cap ?? budget)));
  // Forty metres drops a finger wobble. A turn the person meant is much larger.
  return simplifySketch(clean, 40, limit);
}

/** The first try uses the full corner budget. Later tries use fewer corners. */
export function sketchWaypointSets(points: readonly OutdoorPoint[]): OutdoorPoint[][] {
  const clean = cleanPoints(points);
  if (clean.length < 2) return [];
  const budget = sketchWaypointBudget(pathMetres(clean));
  const caps = [budget, Math.max(4, Math.floor(budget / 2)), Math.max(3, Math.floor(budget / 4))];
  const sets: OutdoorPoint[][] = [];
  const seen = new Set<string>();
  for (const nextCap of caps) {
    const next = sketchWaypoints(clean, nextCap);
    if (next.length < 2) continue;
    const key = next.map((point) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    sets.push(next);
  }
  return sets;
}

function pointSegmentMetres(point: OutdoorPoint, start: OutdoorPoint, end: OutdoorPoint): number {
  return perpendicularMetres(point, start, end);
}

function directedHausdorff(from: readonly OutdoorPoint[], onto: readonly OutdoorPoint[]): number {
  let worst = 0;
  for (const point of from) {
    let best = Number.POSITIVE_INFINITY;
    if (onto.length === 1) best = metresBetween(point, onto[0]);
    for (let index = 1; index < onto.length; index += 1) {
      best = Math.min(best, pointSegmentMetres(point, onto[index - 1], onto[index]));
    }
    if (best > worst) worst = best;
  }
  return worst;
}

/** The farthest either line strays from the other, in metres. */
export function hausdorffMetres(a: readonly OutdoorPoint[], b: readonly OutdoorPoint[]): number {
  const left = cleanPoints(a);
  const right = cleanPoints(b);
  if (left.length === 0 || right.length === 0) return Number.POSITIVE_INFINITY;
  return Math.max(directedHausdorff(left, right), directedHausdorff(right, left));
}

/** Discrete Fréchet distance in metres. Order matters, so a spur scores high. */
export function discreteFrechetMetres(a: readonly OutdoorPoint[], b: readonly OutdoorPoint[]): number {
  const left = cleanPoints(a);
  const right = cleanPoints(b);
  const rows = left.length;
  const cols = right.length;
  if (rows === 0 || cols === 0) return Number.POSITIVE_INFINITY;
  let prev = new Array<number>(cols);
  let curr = new Array<number>(cols);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cost = metresBetween(left[row], right[col]);
      if (row === 0 && col === 0) curr[col] = cost;
      else if (row === 0) curr[col] = Math.max(curr[col - 1], cost);
      else if (col === 0) curr[col] = Math.max(prev[0], cost);
      else curr[col] = Math.max(Math.min(prev[col], curr[col - 1], prev[col - 1]), cost);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[cols - 1];
}

/** Metres along `reference` for each point of `line`, tracked in order so a closed sketch does not jump ends. */
function progressAlong(line: readonly OutdoorPoint[], reference: readonly OutdoorPoint[]): number[] {
  const ref = cleanPoints(reference);
  const out: number[] = [];
  if (ref.length < 2) return line.map(() => 0);
  const cumulative = [0];
  for (let index = 1; index < ref.length; index += 1) {
    cumulative.push(cumulative[index - 1] + metresBetween(ref[index - 1], ref[index]));
  }
  let previous = 0;
  for (let index = 0; index < line.length; index += 1) {
    const point = line[index];
    const moved = index === 0 ? 0 : metresBetween(line[index - 1], point);
    const step = index === 0 ? 150 : moved + 30;
    const low = Math.max(0, previous - step);
    const high = previous + step;
    const expected = previous + moved;
    const candidates: { distance: number; along: number }[] = [];
    for (let seg = 1; seg < ref.length; seg += 1) {
      const from = cumulative[seg - 1];
      const to = cumulative[seg];
      if (to < low || from > high) continue;
      const start = ref[seg - 1];
      const end = ref[seg];
      const length = to - from;
      const cos = Math.cos((start.latitude * Math.PI) / 180);
      const ex = (end.longitude - start.longitude) * 111_320 * cos;
      const ey = (end.latitude - start.latitude) * 111_320;
      const px = (point.longitude - start.longitude) * 111_320 * cos;
      const py = (point.latitude - start.latitude) * 111_320;
      const t = length < 1 ? 0 : Math.max(0, Math.min(1, (px * ex + py * ey) / (ex * ex + ey * ey)));
      const along = Math.max(low, Math.min(high, from + t * length));
      candidates.push({ distance: Math.hypot(px - t * ex, py - t * ey), along });
    }
    let bestAlong = previous;
    if (candidates.length > 0) {
      const best = Math.min(...candidates.map((item) => item.distance));
      // Where the pencil retraced itself, two legs tie. The one that keeps pace with the route wins.
      let pick = Number.POSITIVE_INFINITY;
      for (const item of candidates) {
        if (item.distance > best + 2) continue;
        const gap = Math.abs(item.along - expected);
        if (gap < pick) {
          pick = gap;
          bestAlong = item.along;
        }
      }
    }
    previous = bestAlong;
    out.push(bestAlong);
  }
  return out;
}

type SpurCut = { from: number; to: number };

/**
 * One there-and-back: the line leaves `from`, goes out more than `withinM`,
 * retraces itself, and is back within `withinM` at `to`.
 * Every vertex is checked, so a dense route with a short gap between vertices
 * does not count a straight run as a spur.
 */
function findSpur(
  line: readonly OutdoorPoint[],
  cumulative: readonly number[],
  progress: readonly number[] | null,
  withinM: number,
  maxSpurM: number,
  fromIndex: number,
): SpurCut | null {
  const lastIndex = line.length - 1;
  for (let start = fromIndex; start < lastIndex - 1; start += 1) {
    let peak = 0;
    let peakIndex = -1;
    for (let end = start + 1; end <= lastIndex; end += 1) {
      const walked = cumulative[end] - cumulative[start];
      if (walked > maxSpurM) break;
      const away = metresBetween(line[start], line[end]);
      if (away > peak) {
        peak = away;
        peakIndex = end;
      }
      // A straight run only gets farther away. A spur comes back toward where it left.
      if (peak < SPUR_MIN_M || away > withinM || away > peak * 0.5) continue;
      if (start === 0 && end === lastIndex) break;
      const cut = tightestCut(line, start, peakIndex, end, cumulative, maxSpurM);
      const tolerance = Math.min(withinM, Math.max(SPUR_MIN_M, peak * 0.5));
      if (!retraces(line, cut.from, peakIndex, cut.to, tolerance)) continue;
      if (progress) {
        const loopM = cumulative[cut.to] - cumulative[cut.from];
        const drawnM = Math.abs(progress[cut.to] - progress[cut.from]);
        // The pencil went out and back here too. That is a spur the person drew.
        if (drawnM > loopM * 0.5) continue;
      }
      return cut;
    }
  }
  return null;
}

/** The closest pair either side of the spur tip, so the cut is on the path, not a chord. */
function tightestCut(
  line: readonly OutdoorPoint[],
  start: number,
  peakIndex: number,
  end: number,
  cumulative: readonly number[],
  maxSpurM: number,
): SpurCut {
  let best = { from: start, to: end };
  let bestM = metresBetween(line[start], line[end]);
  for (let from = start; from < peakIndex; from += 1) {
    for (let to = Math.max(end, peakIndex + 1); to < line.length; to += 1) {
      if (cumulative[to] - cumulative[from] > maxSpurM) break;
      const gap = metresBetween(line[from], line[to]);
      if (gap < bestM) {
        bestM = gap;
        best = { from, to };
      }
    }
  }
  return best;
}

/** True when the way back runs over the way out. A loop around a block does not. */
function retraces(line: readonly OutdoorPoint[], from: number, peakIndex: number, to: number, withinM: number): boolean {
  if (peakIndex <= from || peakIndex >= to) return false;
  const out = line.slice(from, peakIndex + 1);
  const back = line.slice(peakIndex, to + 1);
  return directedHausdorff(back, out) <= withinM && directedHausdorff(out, back) <= withinM;
}

/**
 * Drops each there-and-back: the line leaves a point, retraces itself, returns within `withinM`,
 * then carries on. A ring that only meets itself at the finish, or a loop round a block, is kept.
 * With `sketch`, a spur is only dropped when the pencil did not go out and back there too,
 * and spurs up to `SPUR_MAX_WITH_SKETCH_M` are dropped.
 */
export function removeRouteSpurs(
  points: readonly OutdoorPoint[],
  withinM = SPUR_WITHIN_M,
  maxSpurM = SPUR_MAX_M,
  sketch?: readonly OutdoorPoint[] | null,
): OutdoorPoint[] {
  // Not capped like cleanPoints: a long joined route must not lose its far end here.
  let line = points.map((point) => finitePoint(point)).filter((point): point is OutdoorPoint => point != null).map(copyPoint);
  if (line.length < 3) return line;
  const reference = sketch ? cleanPoints(sketch) : [];
  const useSketch = reference.length >= 2;
  const limit = useSketch ? Math.max(maxSpurM, SPUR_MAX_WITH_SKETCH_M) : maxSpurM;
  let resume = 0;
  for (let guard = 0; guard < 200; guard += 1) {
    const cumulative = [0];
    for (let index = 1; index < line.length; index += 1) {
      cumulative.push(cumulative[index - 1] + metresBetween(line[index - 1], line[index]));
    }
    const progress = useSketch ? progressAlong(line, reference) : null;
    const cut = findSpur(line, cumulative, progress, withinM, limit, resume);
    if (!cut) return line;
    const next = [...line.slice(0, cut.from + 1), ...line.slice(cut.to + 1)];
    if (next.length < 2) return line;
    line = next;
    resume = Math.max(0, cut.from - 1);
  }
  return line;
}

/** Fills long gaps so a corner-only pencil can be compared with a detailed route. */
export function densifyLine(points: readonly OutdoorPoint[], stepM = 30): OutdoorPoint[] {
  const line = cleanPoints(points);
  if (line.length < 2) return line.map(copyPoint);
  const step = Math.max(stepM, pathMetres(line) / 300);
  const out: OutdoorPoint[] = [];
  for (let index = 1; index < line.length; index += 1) {
    const from = line[index - 1];
    const to = line[index];
    const pieces = Math.max(1, Math.ceil(metresBetween(from, to) / step));
    for (let part = 0; part < pieces; part += 1) {
      const t = part / pieces;
      out.push({
        latitude: from.latitude + (to.latitude - from.latitude) * t,
        longitude: from.longitude + (to.longitude - from.longitude) * t,
      });
    }
  }
  const end = line[line.length - 1];
  if (end) out.push(copyPoint(end));
  return out;
}

/** True when the routed line still follows the pencil, after spurs are gone. */
export function snapFollowsSketch(sketch: readonly OutdoorPoint[], routed: readonly OutdoorPoint[]): boolean {
  const drawn = cleanPoints(sketch);
  const line = cleanPoints(routed);
  if (drawn.length < 2 || line.length < 2) return false;
  const drawnLength = pathMetres(drawn);
  const lineLength = pathMetres(line);
  if (drawnLength > 0 && lineLength > drawnLength * SNAP_LENGTH_RATIO) return false;
  const drawnFill = densifyLine(drawn);
  const lineFill = densifyLine(line);
  if (hausdorffMetres(drawnFill, lineFill) > SNAP_DEVIATION_M) return false;
  if (discreteFrechetMetres(drawnFill, lineFill) > SNAP_DEVIATION_M) return false;
  return true;
}

/**
 * A routed piece that strays from the pencil by more than the close-match test allows is still kept
 * when it stays within these bounds. The pencil can sit over houses (a finger a little off a street,
 * or a touch offset), and the nearest real street is then a block away. That street is the route;
 * a straight pencil line across the houses is not.
 */
export const SNAP_DETOUR_DEVIATION_M = 400;
export const SNAP_DETOUR_RATIO = 3;
export const SNAP_DETOUR_EXTRA_M = 600;

/**
 * True when a routed line that does not closely follow the pencil is still a fair stand-in for it:
 * real paths near the line, not a long way round to a bridge or a gate.
 * False means there is no path along that part of the pencil, such as across a river or open fields.
 */
export function snapDetourUsable(sketch: readonly OutdoorPoint[], routed: readonly OutdoorPoint[]): boolean {
  const drawn = cleanPoints(sketch);
  const line = cleanPoints(routed);
  if (drawn.length < 2 || line.length < 2) return false;
  const drawnLength = pathMetres(drawn);
  const lineLength = pathMetres(line);
  const allowed = Math.max(drawnLength * SNAP_DETOUR_RATIO, drawnLength + SNAP_DETOUR_EXTRA_M);
  if (lineLength > allowed) return false;
  return hausdorffMetres(densifyLine(drawn), densifyLine(line)) <= SNAP_DETOUR_DEVIATION_M;
}

/**
 * The line to keep after one routing answer.
 * A match is the routed geometry with spurs removed.
 * A miss is the pencil line itself.
 */
export function drawnLineAfterSnap(input: {
  sketch: readonly OutdoorPoint[];
  routed: readonly OutdoorPoint[] | null;
}): { points: OutdoorPoint[]; matched: boolean } {
  const sketch = cleanPoints(input.sketch).map(copyPoint);
  if (sketch.length < 2) return { points: sketch, matched: false };
  if (input.routed && input.routed.length >= 2) {
    const cleaned = removeRouteSpurs(input.routed, SPUR_WITHIN_M, SPUR_MAX_M, sketch);
    if (cleaned.length >= 2 && snapFollowsSketch(sketch, cleaned)) {
      return { points: cleaned, matched: true };
    }
  }
  return { points: sketch, matched: false };
}

function mercatorX(longitude: number): number {
  return (longitude + 180) / 360;
}

function mercatorY(latitude: number): number {
  const radians = (latitude * Math.PI) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + radians / 2));
  return (1 - y / Math.PI) / 2;
}

function unmercatorX(x: number): number {
  return x * 360 - 180;
}

function unmercatorY(y: number): number {
  const radians = Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
  return (radians * 180) / Math.PI;
}

/** A screen point on an unrotated map, using the camera centre and zoom. */
export function viewToPoint(input: {
  centre: OutdoorPoint;
  zoom: number;
  width: number;
  height: number;
  x: number;
  y: number;
}): OutdoorPoint | null {
  if (!(input.width > 0) || !(input.height > 0) || !Number.isFinite(input.zoom)) return null;
  const centre = finitePoint(input.centre);
  if (!centre || !Number.isFinite(input.x) || !Number.isFinite(input.y)) return null;
  const scale = MERCATOR_TILE * 2 ** input.zoom;
  const worldX = mercatorX(centre.longitude) * scale + (input.x - input.width / 2);
  const worldY = mercatorY(centre.latitude) * scale + (input.y - input.height / 2);
  return finitePoint({ latitude: unmercatorY(worldY / scale), longitude: unmercatorX(worldX / scale) });
}

/**
 * The camera centre that puts `point` at the screen position `x`, `y`.
 * Pinch zoom uses this so the place under the fingers stays under the fingers.
 * Bearing is not changed.
 */
export function centreKeepingPoint(input: {
  point: OutdoorPoint;
  zoom: number;
  width: number;
  height: number;
  x: number;
  y: number;
}): OutdoorPoint | null {
  if (!(input.width > 0) || !(input.height > 0) || !Number.isFinite(input.zoom)) return null;
  const point = finitePoint(input.point);
  if (!point || !Number.isFinite(input.x) || !Number.isFinite(input.y)) return null;
  const scale = MERCATOR_TILE * 2 ** input.zoom;
  const worldX = mercatorX(point.longitude) * scale - (input.x - input.width / 2);
  const worldY = mercatorY(point.latitude) * scale - (input.y - input.height / 2);
  return finitePoint({ latitude: unmercatorY(worldY / scale), longitude: unmercatorX(worldX / scale) });
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
  };
}

/** The live table still requires a line. Omitting it fails until that column can be empty. */
export function routeGeometryStillRequired(message: string): boolean {
  return /geometry/i.test(message) && /not-null|null value/i.test(message);
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

/** One line per stroke. A gap between strokes is not filled in. */
export function sketchLinesCollection(lines: readonly (readonly OutdoorPoint[])[]) {
  return {
    type: 'FeatureCollection' as const,
    features: lineFeatures(lines.map((points, index) => ({ id: `line-${index}`, points }))),
  };
}

/** Thin dashed hint between strokes. Lighter than the pencil on both map styles. */
export function drawGapColour(scheme: MapScheme): string {
  return scheme === 'dark' ? '#D6D3D1' : '#A8A29E';
}

export const DRAW_GAP_WIDTH = 2;
export const DRAW_GAP_DASH: [number, number] = [1, 1.8];

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

/** A searched place, before it is chosen as the start or the destination. */
export function pinCollection(point: OutdoorPoint | null) {
  const clean = point ? finitePoint(point) : null;
  return pointCollection(clean ? [clean] : [], 'pin');
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
/** A nominal small map, so a saved route fits on a phone card and in full screen. */
const FIT_WIDTH_PX = 320;
const FIT_HEIGHT_PX = 180;
const FIT_MIN_ZOOM = 9;
const FIT_MAX_ZOOM = 16;

/**
 * Centre and zoom that fit every route line. Null when no route has a line,
 * so an older saved route with no line never opens on a made-up place.
 */
export function routeFrame(routes: readonly OutdoorRoute[]): { latitude: number; longitude: number; zoom: number } | null {
  let west = Infinity;
  let east = -Infinity;
  let north = Infinity;
  let south = -Infinity;
  for (const route of routes) {
    for (const point of route.points) {
      if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) continue;
      const x = mercatorX(point.longitude);
      const y = mercatorY(point.latitude);
      west = Math.min(west, x);
      east = Math.max(east, x);
      north = Math.min(north, y);
      south = Math.max(south, y);
    }
  }
  if (!Number.isFinite(west) || !Number.isFinite(north)) return null;
  const dx = east - west;
  const dy = south - north;
  const fits = [
    dx > 0 ? Math.log2(FIT_WIDTH_PX / (dx * MERCATOR_TILE)) : FIT_MAX_ZOOM,
    dy > 0 ? Math.log2(FIT_HEIGHT_PX / (dy * MERCATOR_TILE)) : FIT_MAX_ZOOM,
  ];
  const raw = Math.min(...fits);
  const zoom = Math.min(FIT_MAX_ZOOM, Math.max(FIT_MIN_ZOOM, Math.floor(raw * 4) / 4));
  return {
    latitude: unmercatorY((north + south) / 2),
    longitude: unmercatorX((west + east) / 2),
    zoom,
  };
}

export function viewCentre(routes: readonly OutdoorRoute[], sketch: readonly OutdoorPoint[], here: OutdoorPoint | null): OutdoorPoint {
  if (sketch.length) return sketch[0];
  if (routes[0]?.points.length) return routes[0].points[0];
  if (here) return here;
  return mapStart();
}
