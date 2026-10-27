import { isoDay } from '@/domain/dates';
import type { OutdoorPoint } from '@/domain/outdoorRoute';
import { ROUTE_OFFLINE, type RoutePlan, type RoutePlanInput } from '@/domain/findRoute';

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
  'The account limit is 40 a day and 12 in 10 minutes, shared with place search.';

export const ROUTE_REQUEST_DAY_KEY = 'charioteer.route-requests.day';

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

export function routePlanBody(input: RoutePlanInput): {
  action: 'route';
  mode: RoutePlanInput['mode'];
  shape: RoutePlanInput['shape'];
  start: OutdoorPoint;
  end: OutdoorPoint | null;
  distanceM: number | null;
  minutes: number | null;
  via: OutdoorPoint[];
} {
  return {
    action: 'route',
    mode: input.mode,
    shape: input.shape,
    start: input.start,
    end: input.end ?? null,
    distanceM: input.distanceM ?? null,
    minutes: input.minutes ?? null,
    via: (input.via ?? []).slice(0, VIA_POINT_CAP),
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
