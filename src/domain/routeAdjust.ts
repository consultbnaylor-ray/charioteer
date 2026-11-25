import { isoDay } from '@/domain/dates';
import type { RoutePlace } from '@/domain/findRoute';
import { ROUTE_OFFLINE, ROUTE_SNAP_LIMIT, type RoutePlan, type RoutePlanInput } from '@/domain/findRoute';
import { simplifyLine, sketchWaypoints, type OutdoorPoint } from '@/domain/outdoorRoute';

export const VIA_POINT_CAP = 5;
export const REDRAW_PAUSE_MS = 500;
export const MIN_LIFT_METRES = 40;
export const GRAB_METRES = 80;

export const ADJUST_THE_ROUTE = 'Adjust the route';
export const ADD_A_POINT = 'Add a point';
export const REMOVE_POINT = 'Remove point';
export const UNDO_ADJUST = 'Undo';
export const RESET_ADJUST = 'Reset';
export const RELEASE_TO_REDRAW = 'Release to redraw the route.';
export const TAP_TO_PLACE = 'Tap the map to place this point.';
export const TAP_TO_MOVE = 'Tap the map to move this point.';
/** A tap this close is the same spot. It is well under the old 40 m drag gap. */
export const SAME_POINT_METRES = 8;
export const REDRAWING_THE_ROUTE = 'Redrawing the route.';
export const LAST_ROUTE_FIGURES = 'Last route. The figures change when the redraw finishes.';
export const ROUTE_UNCHANGED = 'The route on the map is unchanged.';
export const ROUTE_REQUEST_LIMIT_LINE =
  '40 route requests a day and 12 in 10 minutes. Place search has its own allowance.';

export const ROUTE_REQUEST_DAY_KEY = 'charioteer.route-requests.day';

export const PREFER_PATHS_KEY = 'charioteer.prefer-footpaths';

export const PREFER_PATHS_LABEL = 'Prefer footpaths over roads';

export const PREFER_PATHS_NOTE = 'Paths and trails are preferred. A main road is used when there is no path.';

export const DRAW_ROUTE = 'Draw';

export const EXIT_DRAW = 'Exit draw';

export const CLEAR_DRAW = 'Clear';

export const REDRAW_DRAW = 'Redraw';

export const UNDO_DRAW = 'Undo';

export const DRAW_HINT = 'Drag on the map to sketch a line. Lift your finger to follow paths.';

export const DRAW_FINGER_HINT = 'Draw your route, then tap the green tick to snap it to the nearest paths';

/** Spoken name of the green tick. It snaps the pencil and leaves drawing. */
export const CONFIRM_DRAW = 'Snap to nearest paths';

/** Filled green behind the tick, the same green as a snapped route on the light map. */
export const DRAW_TICK_GREEN = '#047857';

/** Shown once the tick has put the pencil onto the nearest paths. */
export const DRAW_SNAPPED = 'Snapped to the nearest paths.';

export const DRAW_PEN_HINT =
  'Use the optional settings above to create a route, or use the pen symbol on the map and the line will snap to the nearest paths';

/** Shown when a lift does not come back as a path. The pencil line stays. */
export const DRAW_NO_PATH = 'No path matched that line.';

/** Shown when a snap wanders off the pencil. The pencil line is the route. */
export const DRAW_SNAP_PARTIAL = 'Couldn\'t match all of that to paths — showing your line';

/** The snap was refused. The pencil line stays a sketch. */
/** Most of the line snapped. A short piece the paths did not match follows the pencil. */
export const DRAW_SNAP_MOSTLY = 'Snapped to paths. A short part follows your line.';

export const DRAW_SNAP_FAILED = 'Couldn\'t snap to paths';

/** The route service's own cap: too many points, too long a leg, or too big a request. */
export const DRAW_SNAP_LIMIT = ROUTE_SNAP_LIMIT;

/** A server limit, including the message the deployed function still uses for too many points. */
export function snapLimitMessage(message: string | null): string | null {
  if (!message) return null;
  if (message === DRAW_SNAP_LIMIT || /fewer points on the sketch/i.test(message)) return DRAW_SNAP_LIMIT;
  if (/over the route limit/i.test(message)) return DRAW_SNAP_LIMIT;
  return null;
}

export const DRAW_SNAP_TRY_AGAIN = 'Try again';

/** Dev log for a failed snap. Coordinates and tokens are left out. */
export function logDrawSnapFailure(error: unknown): void {
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : '';
  const safe = `${name}: ${message}`.replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!safe || /eyJ|bearer|sb_publishable|sb_secret|latitude|longitude|\d+\.\d{4,}/i.test(safe)) {
    console.error('draw snap failed');
    return;
  }
  console.error('draw snap failed', safe);
}

/** Wait after the last keystroke before a place lookup. */
export const PLACE_SEARCH_PAUSE_MS = 800;

/** Shorter text is not sent. Two letters were enough to spend a route request. */
export const PLACE_SEARCH_MIN_CHARS = 3;

export function parsePreferPaths(value: unknown): boolean {
  return value === 'on';
}

type PreferListener = (value: boolean) => void;
const preferListeners = new Set<PreferListener>();

export function subscribePreferPaths(listener: PreferListener): () => void {
  preferListeners.add(listener);
  return () => preferListeners.delete(listener);
}

export async function readPreferPaths(store: DayStore): Promise<boolean> {
  return parsePreferPaths(await store.getItem(PREFER_PATHS_KEY));
}

export async function writePreferPaths(store: DayStore, on: boolean): Promise<void> {
  await store.setItem(PREFER_PATHS_KEY, on ? 'on' : 'off');
  preferListeners.forEach((listener) => listener(on));
}

let chosenPlace: { role: 'start' | 'end'; place: RoutePlace } | null = null;

/** A place picked on the saved-route map, for the planner to use next. */
export function holdChosenPlace(role: 'start' | 'end', place: RoutePlace): void {
  chosenPlace = {
    role,
    place: { id: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude },
  };
}

export function takeChosenPlace(): { role: 'start' | 'end'; place: RoutePlace } | null {
  const next = chosenPlace;
  chosenPlace = null;
  return next;
}

const placeResultCache = new Map<string, RoutePlace[]>();
const placeSearchFlight = new Map<string, Promise<RoutePlace[]>>();

export function placeQueryKey(query: string): string {
  return query.trim().toLowerCase();
}

function copyPlaces(places: readonly RoutePlace[]): RoutePlace[] {
  return places.map((place) => ({
    id: place.id,
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
  }));
}

/** A result already fetched this session. A miss is null, so a failure is not reused. */
export function cachedPlaceResults(query: string): RoutePlace[] | null {
  const key = placeQueryKey(query);
  if (key.length < PLACE_SEARCH_MIN_CHARS || !placeResultCache.has(key)) return null;
  const found = placeResultCache.get(key);
  return found ? copyPlaces(found) : null;
}

export function rememberPlaceResults(query: string, places: readonly RoutePlace[]): void {
  const key = placeQueryKey(query);
  if (key.length < PLACE_SEARCH_MIN_CHARS) return;
  if (placeResultCache.size >= 40 && !placeResultCache.has(key)) {
    const oldest = placeResultCache.keys().next().value;
    if (oldest) placeResultCache.delete(oldest);
  }
  placeResultCache.set(key, copyPlaces(places));
}

export function clearPlaceResultCache(): void {
  placeResultCache.clear();
  placeSearchFlight.clear();
}

/**
 * One lookup for a query in this session.
 * A cached result is returned without another request. A request already in flight is shared.
 */
export function placeSearchOnce(
  query: string,
  load: (query: string) => Promise<RoutePlace[]>,
): Promise<RoutePlace[]> {
  const key = placeQueryKey(query);
  if (key.length < PLACE_SEARCH_MIN_CHARS) return Promise.resolve([]);
  const cached = cachedPlaceResults(query);
  if (cached) return Promise.resolve(cached);
  const pending = placeSearchFlight.get(key);
  if (pending) return pending.then((places) => copyPlaces(places));
  const next = load(query.trim()).then((places) => {
    rememberPlaceResults(query, places);
    return copyPlaces(places);
  }).finally(() => {
    if (placeSearchFlight.get(key) === next) placeSearchFlight.delete(key);
  });
  placeSearchFlight.set(key, next);
  return next;
}

/**
 * One lookup after the person pauses.
 * Fewer than three letters are not sent. A repeat of the last lookup is not sent again.
 * A new pause replaces the one that is waiting. `missed` lets that same text be sent after a refusal.
 */
export function createPlaceSearch(
  send: (query: string) => void,
  pauseMs = PLACE_SEARCH_PAUSE_MS,
): { type: (query: string) => void; now: () => void; missed: () => void; dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let serial = 0;
  let lastSent = '';
  return {
    type(query: string) {
      if (timer) clearTimeout(timer);
      timer = null;
      const trimmed = query.trim();
      if (trimmed.length < PLACE_SEARCH_MIN_CHARS) {
        lastSent = '';
        return;
      }
      const key = trimmed.toLowerCase();
      if (key === lastSent) return;
      const ticket = ++serial;
      timer = setTimeout(() => {
        timer = null;
        if (ticket !== serial) return;
        lastSent = key;
        send(trimmed);
      }, pauseMs);
    },
    now() {
      if (timer) clearTimeout(timer);
      timer = null;
      serial += 1;
    },
    missed() {
      lastSent = '';
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
      serial += 1;
    },
  };
}

export function viaCountLine(count: number): string {
  const shown = Math.max(0, Math.min(count, VIA_POINT_CAP));
  if (shown >= VIA_POINT_CAP) return `${VIA_POINT_CAP} of ${VIA_POINT_CAP} points.`;
  return `${shown} of ${VIA_POINT_CAP} points`;
}

export function routeRequestsTodayLine(count: number): string {
  const noun = count === 1 ? 'request' : 'requests';
  return `${count} route ${noun} on this phone today.`;
}

/**
 * A request that never left the phone is not counted.
 * A success, and an answer from the server, are counted once.
 */
export function countsPhoneRouteRequest(message: string | null): boolean {
  return message !== ROUTE_OFFLINE;
}

/** Adjust is on after the button is tapped, and off after it is tapped again. */
export function adjustControlsOn(input: { craving: boolean; adjusting: boolean; hasPlan: boolean }): boolean {
  return !input.craving && input.adjusting && input.hasPlan;
}

export type DayStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

function storedCount(raw: string | null, day: string): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { day?: unknown; count?: unknown };
    if (parsed.day !== day || typeof parsed.count !== 'number' || !Number.isFinite(parsed.count)) return 0;
    return Math.max(0, Math.round(parsed.count));
  } catch {
    return 0;
  }
}

export async function readRouteRequests(store: DayStore, now = new Date()): Promise<number> {
  return storedCount(await store.getItem(ROUTE_REQUEST_DAY_KEY), isoDay(now));
}

/** Counts a route request on this phone. A place search is not counted here. */
export async function noteRouteRequest(store: DayStore, now = new Date()): Promise<number> {
  const day = isoDay(now);
  const count = storedCount(await store.getItem(ROUTE_REQUEST_DAY_KEY), day) + 1;
  await store.setItem(ROUTE_REQUEST_DAY_KEY, JSON.stringify({ day, count }));
  return count;
}

export function placeSearchBody(query: string): { action: 'search'; query: string } {
  return { action: 'search', query };
}

function capVia(points: readonly OutdoorPoint[]): OutdoorPoint[] {
  const clean = points.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
  if (clean.length <= VIA_POINT_CAP) return clean;
  return simplifyLine(clean, VIA_POINT_CAP);
}

export function routePlanBody(input: RoutePlanInput): {
  action: 'route';
  mode: RoutePlanInput['mode'];
  shape: RoutePlanInput['shape'];
  start: OutdoorPoint;
  end: OutdoorPoint | null;
  distanceM: number | null;
  minutes: number | null;
  via: OutdoorPoint[];
  preferPaths: boolean;
  sketch: OutdoorPoint[];
  requestId?: string;
} {
  return {
    action: 'route',
    mode: input.mode,
    shape: input.shape,
    start: input.start,
    end: input.end ?? null,
    distanceM: input.distanceM ?? null,
    minutes: input.minutes ?? null,
    via: capVia(input.via ?? []),
    preferPaths: input.preferPaths === true,
    sketch: sketchWaypoints(input.sketch ?? []),
    ...(input.requestId ? { requestId: input.requestId } : {}),
  };
}

export function viaPointCollection(points: readonly OutdoorPoint[]): {
  type: 'FeatureCollection';
  features: { type: 'Feature'; properties: { label: string }; geometry: { type: 'Point'; coordinates: [number, number] } }[];
} {
  return {
    type: 'FeatureCollection',
    features: points.map((point, index) => ({
      type: 'Feature' as const,
      properties: { label: String(index + 1) },
      geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
    })),
  };
}

export function metresBetween(a: OutdoorPoint, b: OutdoorPoint): number {
  const radius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function movedFarEnough(from: OutdoorPoint, to: OutdoorPoint): boolean {
  return metresBetween(from, to) >= MIN_LIFT_METRES;
}

export function nearestVia(vias: readonly OutdoorPoint[], point: OutdoorPoint, within = GRAB_METRES): number | null {
  let best: number | null = null;
  let bestMetres = within;
  vias.forEach((via, index) => {
    const metres = metresBetween(via, point);
    if (metres <= bestMetres) {
      best = index;
      bestMetres = metres;
    }
  });
  return best;
}

export function distanceToPath(point: OutdoorPoint, line: readonly OutdoorPoint[]): number {
  if (line.length === 0) return Number.POSITIVE_INFINITY;
  let best = metresBetween(point, line[0]);
  for (const corner of line) best = Math.min(best, metresBetween(point, corner));
  return best;
}

export function lineMidpoint(line: readonly OutdoorPoint[]): OutdoorPoint | null {
  if (line.length === 0) return null;
  const corner = line[Math.floor(line.length / 2)];
  return corner ? { latitude: corner.latitude, longitude: corner.longitude } : null;
}

/** Adds a via-point, or moves one. A sixth point is refused. */
export function withVia(
  vias: readonly OutdoorPoint[],
  point: OutdoorPoint,
  index: number | null,
): OutdoorPoint[] | null {
  if (index != null && index >= 0 && index < vias.length) {
    const next = vias.map((item) => ({ ...item }));
    next[index] = { latitude: point.latitude, longitude: point.longitude };
    return next;
  }
  if (vias.length >= VIA_POINT_CAP) return null;
  return [...vias.map((item) => ({ ...item })), { latitude: point.latitude, longitude: point.longitude }];
}

export function withoutVia(vias: readonly OutdoorPoint[], index: number): OutdoorPoint[] {
  return vias.filter((_, item) => item !== index).map((item) => ({ ...item }));
}

export type DragGesture = {
  origin: OutdoorPoint;
  viaIndex: number | null;
  current: OutdoorPoint;
};

export function beginDrag(
  vias: readonly OutdoorPoint[],
  line: readonly OutdoorPoint[],
  point: OutdoorPoint,
): DragGesture | null {
  const existing = nearestVia(vias, point);
  if (existing != null) {
    return { origin: { ...point }, viaIndex: existing, current: { ...point } };
  }
  if (vias.length >= VIA_POINT_CAP) return null;
  if (distanceToPath(point, line) > GRAB_METRES) return null;
  return { origin: { ...point }, viaIndex: null, current: { ...point } };
}

export function finishDrag(
  vias: readonly OutdoorPoint[],
  drag: DragGesture | null,
): { vias: OutdoorPoint[]; send: boolean } {
  const kept = vias.map((item) => ({ ...item }));
  if (!drag || !movedFarEnough(drag.origin, drag.current)) return { vias: kept, send: false };
  const next = withVia(vias, drag.current, drag.viaIndex);
  if (!next) return { vias: kept, send: false };
  return { vias: next, send: true };
}

export type PointEdit =
  | { kind: 'idle' }
  | { kind: 'place' }
  | { kind: 'move'; index: number };

/** Add a point arms the next tap. At the cap it stays idle and adds nothing. */
export function armPlacement(count: number): PointEdit {
  if (count >= VIA_POINT_CAP) return { kind: 'idle' };
  return { kind: 'place' };
}

function copyPoints(vias: readonly OutdoorPoint[]): OutdoorPoint[] {
  return vias.map((item) => ({ latitude: item.latitude, longitude: item.longitude }));
}

/**
 * One map tap. Nothing here reads a move.
 * Idle selects a point within the grab radius and never adds one.
 * Place puts the tap down even when it is closer than 40 m to a point.
 * Move sends that new spot even when the gap is under 40 m.
 * A tap on the selected dot itself does not send.
 */
export function tapPoint(input: {
  edit: PointEdit;
  vias: readonly OutdoorPoint[];
  point: OutdoorPoint;
}): { edit: PointEdit; vias: OutdoorPoint[]; send: boolean } {
  const vias = copyPoints(input.vias);
  const point = { latitude: input.point.latitude, longitude: input.point.longitude };
  const hit = nearestVia(vias, point);

  if (input.edit.kind === 'idle') {
    if (hit == null) return { edit: input.edit, vias, send: false };
    return { edit: { kind: 'move', index: hit }, vias, send: false };
  }

  if (input.edit.kind === 'place') {
    if (vias.length >= VIA_POINT_CAP) return { edit: { kind: 'idle' }, vias, send: false };
    const onDot = hit != null && metresBetween(vias[hit], point) <= SAME_POINT_METRES;
    if (onDot) return { edit: { kind: 'move', index: hit }, vias, send: false };
    const next = withVia(vias, point, null);
    if (!next) return { edit: { kind: 'idle' }, vias, send: false };
    return { edit: { kind: 'idle' }, vias: next, send: true };
  }

  const index = input.edit.index;
  if (index < 0 || index >= vias.length) return { edit: { kind: 'idle' }, vias, send: false };
  if (hit != null && hit !== index) return { edit: { kind: 'move', index: hit }, vias, send: false };
  if (metresBetween(vias[index], point) <= SAME_POINT_METRES) {
    return { edit: input.edit, vias, send: false };
  }
  const next = withVia(vias, point, index);
  if (!next) return { edit: input.edit, vias, send: false };
  return { edit: { kind: 'idle' }, vias: next, send: true };
}

export type AdjustSnapshot = { plan: RoutePlan; vias: OutdoorPoint[] };

/** A failed redraw leaves the accepted line and its figures alone. */
export async function commitRedraw(
  current: AdjustSnapshot,
  nextVias: readonly OutdoorPoint[],
  send: (vias: readonly OutdoorPoint[]) => Promise<RoutePlan>,
): Promise<{ snapshot: AdjustSnapshot; failed: boolean }> {
  try {
    const plan = await send(nextVias);
    return { snapshot: { plan, vias: nextVias.map((item) => ({ ...item })) }, failed: false };
  } catch {
    return {
      snapshot: { plan: current.plan, vias: current.vias.map((item) => ({ ...item })) },
      failed: true,
    };
  }
}

/**
 * One route request on finger-up, after the pause.
 * A second lift during the pause replaces the first.
 * While a request is in flight, only the latest lift is kept and sent when the first ends.
 */
export function createRedrawScheduler(
  send: (vias: readonly OutdoorPoint[]) => Promise<void>,
  pauseMs = REDRAW_PAUSE_MS,
): { down: () => void; lift: (vias: readonly OutdoorPoint[]) => void; dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: OutdoorPoint[] | null = null;
  let inflight = false;
  let waiting: OutdoorPoint[] | null = null;
  let disposed = false;

  async function flush(): Promise<void> {
    if (disposed) return;
    const vias = pending;
    pending = null;
    timer = null;
    if (!vias) return;
    if (inflight) {
      waiting = vias;
      return;
    }
    inflight = true;
    try {
      await send(vias);
    } finally {
      inflight = false;
      if (waiting && !disposed) {
        pending = waiting;
        waiting = null;
        void flush();
      }
    }
  }

  return {
    down() {},
    lift(vias) {
      if (disposed) return;
      const next = vias.map((item) => ({ ...item }));
      if (inflight) {
        waiting = next;
        return;
      }
      pending = next;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, pauseMs);
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      waiting = null;
    },
  };
}

type PressLike = {
  nativeEvent?: PressLike;
  lngLat?: unknown;
  geometry?: { coordinates?: unknown };
  coordinates?: { latitude?: unknown; longitude?: unknown };
};

function finitePressPoint(longitude: number, latitude: number): OutdoorPoint | null {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { latitude, longitude };
}

/**
 * MapLibre React Native 11 delivers a press as `nativeEvent.lngLat`,
 * `[longitude, latitude]`. A handler that only reads `geometry` or
 * `coordinates.latitude` drops the tap and adds nothing.
 */
export function mapPressPoint(event: unknown): OutdoorPoint | null {
  if (!event || typeof event !== 'object') return null;
  const record = event as PressLike;
  const payload = record.nativeEvent && typeof record.nativeEvent === 'object' ? record.nativeEvent : record;
  const pair = payload.lngLat;
  if (Array.isArray(pair) && pair.length >= 2) {
    const fromPair = finitePressPoint(Number(pair[0]), Number(pair[1]));
    if (fromPair) return fromPair;
  }
  const geometry = payload.geometry?.coordinates;
  if (Array.isArray(geometry) && geometry.length >= 2) {
    const fromGeometry = finitePressPoint(Number(geometry[0]), Number(geometry[1]));
    if (fromGeometry) return fromGeometry;
  }
  const coordinates = payload.coordinates;
  if (coordinates && typeof coordinates.latitude === 'number' && typeof coordinates.longitude === 'number') {
    return finitePressPoint(coordinates.longitude, coordinates.latitude);
  }
  return null;
}
