import { adoptSnappedLine, matchDrawnSketch, type RoutePlan } from '@/domain/findRoute';
import {
  centreKeepingPoint,
  viewToPoint,
  type OutdoorPoint,
  cleanPoints,
  metresBetween,
} from '@/domain/outdoorRoute';

/**
 * A drawn route is a stack of finger strokes.
 * Each stroke is only the finger path. A previous end is not copied onto the next stroke,
 * and the phone's location is not copied onto the first stroke.
 * Undo drops the last stroke. Clear drops every stroke.
 */

function copyPoints(points: readonly OutdoorPoint[]): OutdoorPoint[] {
  return cleanPoints(points).map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
}

function samePoint(a: OutdoorPoint, b: OutdoorPoint): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

function strokeCount(snappedCount: number, limit: number): number {
  if (!Number.isFinite(snappedCount)) return 0;
  return Math.max(0, Math.min(limit, Math.round(snappedCount)));
}

/** The last point of the last stroke. Null when nothing has been committed. */
export function drawEnd(strokes: readonly (readonly OutdoorPoint[])[]): OutdoorPoint | null {
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const points = copyPoints(strokes[index] ?? []);
    const end = points[points.length - 1];
    if (end) return end;
  }
  return null;
}

/**
 * Where the next stroke must leave from.
 * A snapped route uses the line on the map. A stroke that has not snapped yet uses its own end.
 * The first stroke of a session has no end, so it does not jump to an older generated route.
 */
export function continuationEnd(
  strokes: readonly (readonly OutdoorPoint[])[],
  snapped: readonly OutdoorPoint[] | null,
  snappedCount: number,
): OutdoorPoint | null {
  if (strokes.length === 0) return null;
  const count = strokeCount(snappedCount, strokes.length);
  const line = snapped ? copyPoints(snapped) : [];
  if (line.length >= 2 && count >= strokes.length) return line[line.length - 1] ?? null;
  return drawEnd(strokes);
}

/**
 * The finger path only.
 * `end` is ignored. A previous end, and the blue location dot, are not inserted.
 */
export function joinStroke(_end: OutdoorPoint | null, stroke: readonly OutdoorPoint[]): OutdoorPoint[] {
  return copyPoints(stroke);
}

/** Appends one stroke. A stroke that does not move is left off the stack. Nothing is prepended. */
export function commitDrawStroke(
  strokes: readonly (readonly OutdoorPoint[])[],
  stroke: readonly OutdoorPoint[],
): OutdoorPoint[][] {
  const kept = strokes.map((item) => copyPoints(item));
  const clean = copyPoints(stroke);
  if (clean.length < 2) return kept;
  return [...kept, clean];
}

/** Drops the last stroke. The earlier strokes stay. */
export function undoDrawStroke(strokes: readonly (readonly OutdoorPoint[])[]): OutdoorPoint[][] {
  return strokes.slice(0, -1).map((item) => copyPoints(item));
}

export function clearDrawStrokes(): OutdoorPoint[][] {
  return [];
}

/** One line for the route service. The shared join point is not repeated. */
export function combineDrawStrokes(strokes: readonly (readonly OutdoorPoint[])[]): OutdoorPoint[] {
  const line: OutdoorPoint[] = [];
  for (const stroke of strokes) {
    for (const point of copyPoints(stroke)) {
      const last = line[line.length - 1];
      if (last && samePoint(last, point)) continue;
      line.push(point);
    }
  }
  return line;
}

/**
 * Keeps every earlier point, then the added line.
 * A point that starts on the current end is not duplicated.
 */
export function stitchRoute(kept: readonly OutdoorPoint[], added: readonly OutdoorPoint[]): OutdoorPoint[] {
  const prior = copyPoints(kept);
  const next = copyPoints(added);
  if (prior.length === 0) return next;
  if (next.length === 0) return prior;
  const end = prior[prior.length - 1];
  const start = next[0];
  const skip = end && start && (samePoint(end, start) || metresBetween(end, start) < 8) ? 1 : 0;
  return [...prior, ...next.slice(skip)];
}

/**
 * The line on the map.
 * Snapped strokes use the routed geometry. A stroke that is still waiting is appended raw,
 * so a failed snap cannot drop the earlier route.
 */
export function visibleDrawLine(
  snapped: readonly OutdoorPoint[] | null,
  strokes: readonly (readonly OutdoorPoint[])[],
  snappedCount: number,
): OutdoorPoint[] {
  const count = strokeCount(snappedCount, strokes.length);
  const pending = strokes.slice(count);
  const snap = snapped ? copyPoints(snapped) : [];
  const base = snap.length >= 2 && (count > 0 || strokes.length === 0)
    ? snap
    : combineDrawStrokes(strokes.slice(0, count));
  if (pending.length === 0) return base;
  return stitchRoute(base, combineDrawStrokes(pending));
}

/**
 * The routed line only. A stroke that has not been confirmed stays off this line,
 * so the pencil colour can show that it is not snapped yet.
 * A route made without drawing (no strokes) still uses the plan.
 */
export function snappedDrawLine(
  snapped: readonly OutdoorPoint[] | null,
  strokes: readonly (readonly OutdoorPoint[])[],
  snappedCount: number,
): OutdoorPoint[] {
  const snap = snapped ? copyPoints(snapped) : [];
  if (strokes.length === 0) return snap.length >= 2 ? snap : [];
  const count = strokeCount(snappedCount, strokes.length);
  if (count <= 0) return [];
  if (snap.length >= 2) return snap;
  return combineDrawStrokes(strokes.slice(0, count));
}

/** Hand-drawn points that are not on a snapped route yet, plus the finger still down. One list, for a length. */
export function rawDrawLine(
  strokes: readonly (readonly OutdoorPoint[])[],
  snappedCount: number,
  pencil: readonly OutdoorPoint[] = [],
): OutdoorPoint[] {
  return combineDrawStrokes(rawStrokeLines(strokes, snappedCount, pencil));
}

/**
 * Each unfinished stroke on its own.
 * The finger still down is its own stroke. Nothing is drawn between strokes.
 */
export function rawStrokeLines(
  strokes: readonly (readonly OutdoorPoint[])[],
  snappedCount: number,
  pencil: readonly OutdoorPoint[] = [],
): OutdoorPoint[][] {
  const count = strokeCount(snappedCount, strokes.length);
  const lines = strokes.slice(count).map((stroke) => copyPoints(stroke)).filter((stroke) => stroke.length >= 2);
  const finger = copyPoints(pencil);
  if (finger.length >= 2) lines.push(finger);
  return lines;
}

/**
 * A thin hint of the order of strokes. Not part of the pencil.
 * The phone's location is never one of these ends.
 */
export function drawGapLines(
  strokes: readonly (readonly OutdoorPoint[])[],
  snapped: readonly OutdoorPoint[] | null,
  snappedCount: number,
  pencil: readonly OutdoorPoint[] = [],
): OutdoorPoint[][] {
  const count = strokeCount(snappedCount, strokes.length);
  const pieces: OutdoorPoint[][] = [];
  const snap = snapped ? copyPoints(snapped) : [];
  if (count > 0 && snap.length >= 2) pieces.push(snap);
  else {
    for (const stroke of strokes.slice(0, count)) {
      const clean = copyPoints(stroke);
      if (clean.length >= 2) pieces.push(clean);
    }
  }
  for (const stroke of rawStrokeLines(strokes, snappedCount, pencil)) pieces.push(stroke);
  const gaps: OutdoorPoint[][] = [];
  for (let index = 1; index < pieces.length; index += 1) {
    const previous = pieces[index - 1];
    const next = pieces[index];
    const end = previous?.[previous.length - 1];
    const start = next?.[0];
    if (!end || !start) continue;
    if (samePoint(end, start) || metresBetween(end, start) < 8) continue;
    gaps.push([end, start]);
  }
  return gaps;
}

/** How far apart snap waypoints sit along a stroke. The 2 m finger samples are not sent. */
export const SNAP_SPACING_M = 150;

/** One directions call stays under the service cap of 50, and under the corner budget of 25. */
export const SNAP_CHUNK_CAP = 25;

/**
 * HeiGIT refuses a directions call whose straight-line length is over 100 km.
 * A single leg over that cannot be split.
 */
export const SNAP_MAX_LEG_M = 100_000;

/** A gap at least this long is its own two-point route, so the turn is not forced straight. */
export const SNAP_GAP_SPLIT_M = 20;

export type DrawSnapRequest = {
  waypoints: OutdoorPoint[];
  /** The straight chord between strokes, or from Where I am. It is not a finger stroke. */
  routedGap: boolean;
};

export type DrawSnapPlan = {
  requests: DrawSnapRequest[];
  limit: boolean;
};

function dedupeClose(points: readonly OutdoorPoint[]): OutdoorPoint[] {
  const kept: OutdoorPoint[] = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last && metresBetween(last, point) < 8) {
      kept[kept.length - 1] = point;
      continue;
    }
    kept.push(point);
  }
  return kept;
}

/**
 * Samples along the finger path.
 * A bend that leaves the chord by more than 35 m is kept. Points are not added on a gap.
 */
export function resampleDrawnPath(points: readonly OutdoorPoint[], spacingM = SNAP_SPACING_M): OutdoorPoint[] {
  const line = points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180);
  if (line.length <= 2) return line.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
  const spacing = Math.max(20, spacingM);
  const kept: OutdoorPoint[] = [];
  const first = line[0];
  if (!first) return [];
  kept.push(first);
  let origin = first;
  let windowStart = 0;
  let since = 0;
  for (let index = 1; index < line.length; index += 1) {
    const prev = line[index - 1];
    const point = line[index];
    if (!prev || !point) continue;
    since += metresBetween(prev, point);
    const last = index === line.length - 1;
    if (since < spacing && !last) continue;
    let farthest = -1;
    let farM = 35;
    for (let cursor = windowStart + 1; cursor < index; cursor += 1) {
      const sample = line[cursor];
      if (!sample) continue;
      const deviation = chordMetres(sample, origin, point);
      if (deviation > farM) {
        farM = deviation;
        farthest = cursor;
      }
    }
    if (farthest > windowStart) {
      const bend = line[farthest];
      if (bend) kept.push(bend);
    }
    kept.push(point);
    origin = point;
    windowStart = index;
    since = 0;
  }
  return dedupeClose(kept).map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
}

function splitCapped(points: readonly OutdoorPoint[], cap: number): OutdoorPoint[][] {
  if (points.length <= cap) return [points.map((point) => ({ ...point }))];
  const chunks: OutdoorPoint[][] = [];
  let index = 0;
  while (index < points.length - 1) {
    const end = Math.min(points.length, index + cap);
    const slice = points.slice(index, end).map((point) => ({ ...point }));
    if (slice.length >= 2) chunks.push(slice);
    if (end >= points.length) break;
    index = end - 1;
  }
  return chunks;
}

function legTooLong(points: readonly OutdoorPoint[]): boolean {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (!previous || !point) continue;
    const leg = metresBetween(previous, point);
    if (leg > SNAP_MAX_LEG_M) return true;
    total += leg;
    if (total > SNAP_MAX_LEG_M) return true;
  }
  return false;
}

/**
 * Waypoints for the route service.
 * Each stroke is resampled on its own. A gap is the two ends only, routed along paths.
 * `anchor` is the Where I am point. It is not copied onto a stroke.
 */
export function buildDrawSnapRequests(
  strokes: readonly (readonly OutdoorPoint[])[],
  anchor: OutdoorPoint | null,
  closeLoop = false,
): DrawSnapPlan {
  const sampled = strokes
    .map((stroke) => resampleDrawnPath(stroke))
    .filter((stroke) => stroke.length >= 2);
  if (closeLoop && sampled.length > 0) {
    const first = sampled[0]?.[0];
    const lastStroke = sampled[sampled.length - 1];
    if (first && lastStroke && lastStroke.length > 0) {
      lastStroke[lastStroke.length - 1] = { latitude: first.latitude, longitude: first.longitude };
    }
  }
  if (sampled.length === 0) return { requests: [], limit: false };
  const requests: DrawSnapRequest[] = [];
  const lead = anchor ? copyPoints([anchor])[0] : undefined;
  const strokeStart = sampled[0]?.[0];
  if (lead && strokeStart) {
    const gap = metresBetween(lead, strokeStart);
    if (gap > SNAP_MAX_LEG_M) return { requests: [], limit: true };
    if (gap >= 8) requests.push({ waypoints: [lead, strokeStart], routedGap: true });
  }
  for (let index = 0; index < sampled.length; index += 1) {
    const stroke = sampled[index];
    if (!stroke) continue;
    for (const piece of splitCapped(stroke, SNAP_CHUNK_CAP)) {
      if (legTooLong(piece)) return { requests: [], limit: true };
      requests.push({ waypoints: piece, routedGap: false });
    }
    const next = sampled[index + 1];
    const end = stroke[stroke.length - 1];
    const start = next?.[0];
    if (!end || !start) continue;
    const gap = metresBetween(end, start);
    if (gap > SNAP_MAX_LEG_M) return { requests: [], limit: true };
    if (gap >= SNAP_GAP_SPLIT_M) requests.push({ waypoints: [end, start], routedGap: true });
  }
  if (requests.some((request) => request.waypoints.length > SNAP_CHUNK_CAP || legTooLong(request.waypoints))) {
    return { requests: [], limit: true };
  }
  return { requests, limit: false };
}

function appendRouted(line: OutdoorPoint[], next: readonly OutdoorPoint[]): OutdoorPoint[] {
  const added = copyPoints(next);
  if (line.length === 0) return added;
  if (added.length === 0) return line;
  const end = line[line.length - 1];
  const start = added[0];
  const skip = end && start && metresBetween(end, start) < 8 ? 1 : 0;
  return [...line, ...added.slice(skip)];
}

/**
 * Snaps each stroke, and routes each gap along paths.
 * A limit is refused before any call. A later failure does not pretend the earlier part snapped.
 */
export async function snapDrawnStrokes(input: {
  strokes: readonly (readonly OutdoorPoint[])[];
  anchor: OutdoorPoint | null;
  closeLoop?: boolean;
  send: (waypoints: readonly OutdoorPoint[]) => Promise<RoutePlan>;
}): Promise<
  | { ok: true; matched: boolean; points: OutdoorPoint[]; plan: RoutePlan | null }
  | { ok: false; limit: true }
  | { ok: false; limit: false; error: unknown }
> {
  const built = buildDrawSnapRequests(input.strokes, input.anchor, input.closeLoop === true);
  if (built.limit) return { ok: false, limit: true };
  if (built.requests.length === 0) return { ok: false, limit: false, error: new Error('short') };
  let matched = true;
  let sawPlan = false;
  let line: OutdoorPoint[] = [];
  let plan: RoutePlan | null = null;
  for (const request of built.requests) {
    if (request.routedGap) {
      try {
        const next = await input.send(request.waypoints);
        sawPlan = true;
        plan = next;
        line = appendRouted(line, next.points);
      } catch (error) {
        return { ok: false, limit: false, error };
      }
      continue;
    }
    const result = await matchDrawnSketch({ sketch: request.waypoints, send: input.send });
    if (!result.matched && !result.sawRoute) return { ok: false, limit: false, error: result.error };
    if (!result.matched) matched = false;
    else {
      sawPlan = true;
      plan = result.plan;
    }
    line = appendRouted(line, result.matched ? result.plan.points : request.waypoints);
  }
  if (line.length < 2) return { ok: false, limit: false, error: new Error('short') };
  return {
    ok: true,
    matched: matched && sawPlan,
    points: line,
    plan: plan ? adoptSnappedLine(plan, line) : null,
  };
}

/** The green tick waits until a stroke has actually moved. */
export function drawReadyToSnap(
  strokes: readonly (readonly OutdoorPoint[])[],
  pencil: readonly OutdoorPoint[] = [],
): boolean {
  if (copyPoints(pencil).length >= 2) return true;
  return strokes.some((stroke) => copyPoints(stroke).length >= 2);
}

export const DRAW_ZOOM_MIN = 2;
export const DRAW_ZOOM_MAX = 22;

export type DrawSession = {
  cancelled: boolean;
  points: OutdoorPoint[];
};

export function startDrawSession(): DrawSession {
  return { cancelled: false, points: [] };
}

/** A new finger sample closer than this is the same place. */
export const FINGER_GAP_M = 2;

/**
 * Past this many samples, a point that already sits on the segment between its
 * neighbours can be dropped. A bend stays. The line is not redrawn as chords.
 */
export const FINGER_POINT_CAP = 1500;

/** Only a point this close to that segment is dropped. A field-sized bend is kept. */
export const FINGER_CHORD_M = 4;

/** One tap moves the map by this share of the screen. */
export const PAN_VIEW_FRACTION = 1 / 3;

/** Wait before a held pan arrow repeats, then the gap between repeats. */
export const PAN_HOLD_BEFORE_REPEAT_MS = 280;
export const PAN_HOLD_REPEAT_MS = 90;

export type PanDirection = 'north' | 'east' | 'south' | 'west';

function copyFinger(points: readonly OutdoorPoint[]): OutdoorPoint[] {
  return points.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
}

function fingerPoint(point: OutdoorPoint): OutdoorPoint | null {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null;
  if (Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return null;
  return { latitude: point.latitude, longitude: point.longitude };
}

function chordMetres(point: OutdoorPoint, start: OutdoorPoint, end: OutdoorPoint): number {
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

/**
 * Drops points that are already on the straight segment between their neighbours.
 * A point that leaves that segment by more than a few metres stays, so the line
 * is not replaced by long chords.
 */
export function thinFingerLine(points: readonly OutdoorPoint[], cap = FINGER_POINT_CAP): OutdoorPoint[] {
  const next = copyFinger(points);
  const limit = Math.max(2, Math.round(cap));
  while (next.length > limit) {
    let index = -1;
    let nearest = FINGER_CHORD_M;
    for (let cursor = 1; cursor < next.length - 1; cursor += 1) {
      const prev = next[cursor - 1];
      const point = next[cursor];
      const end = next[cursor + 1];
      if (!prev || !point || !end) continue;
      const deviation = chordMetres(point, prev, end);
      if (deviation <= nearest) {
        nearest = deviation;
        index = cursor;
      }
    }
    if (index < 0) break;
    next.splice(index, 1);
  }
  return next;
}

/**
 * The finger path, with only a short gap left out.
 * Nothing here snaps to a path or replaces a bend with a chord.
 */
export function appendFingerPoint(
  points: readonly OutdoorPoint[],
  next: OutdoorPoint,
  minMetres = FINGER_GAP_M,
): OutdoorPoint[] {
  const point = fingerPoint(next);
  if (!point) return copyFinger(points);
  const last = points[points.length - 1];
  if (last && metresBetween(last, point) < minMetres) return copyFinger(points);
  return thinFingerLine([...copyFinger(points), point]);
}

/** Top of the slider is the closest zoom. Bottom is the furthest. */
export function zoomFromSlider(fraction: number): number {
  if (!Number.isFinite(fraction)) return clampDrawZoom(DRAW_ZOOM_MIN);
  const clamped = Math.min(1, Math.max(0, fraction));
  return clampDrawZoom(DRAW_ZOOM_MIN + clamped * (DRAW_ZOOM_MAX - DRAW_ZOOM_MIN));
}

export function sliderFraction(zoom: number): number {
  const span = DRAW_ZOOM_MAX - DRAW_ZOOM_MIN;
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, (clampDrawZoom(zoom) - DRAW_ZOOM_MIN) / span));
}

/** Moves the centre by about a third of the screen. North is up. */
export function panViewport(input: {
  centre: OutdoorPoint;
  zoom: number;
  width: number;
  height: number;
  direction: PanDirection;
  fraction?: number;
}): OutdoorPoint | null {
  const fraction = input.fraction ?? PAN_VIEW_FRACTION;
  const across = input.direction === 'east' ? 1 : input.direction === 'west' ? -1 : 0;
  const down = input.direction === 'south' ? 1 : input.direction === 'north' ? -1 : 0;
  return viewToPoint({
    centre: input.centre,
    zoom: input.zoom,
    width: input.width,
    height: input.height,
    x: input.width / 2 + input.width * fraction * across,
    y: input.height / 2 + input.height * fraction * down,
  });
}

export type DrawTouch = {
  locationX?: number;
  locationY?: number;
  pageX?: number;
  pageY?: number;
};

/**
 * The drawing overlay, measured in the window.
 * `ready` is false until two measureInWindow readings agree with onLayout.
 * A sample taken before that is dropped. The camera centre is not used instead.
 */
export type DrawOverlay = {
  ready: boolean;
  originX: number;
  originY: number;
  width: number;
  height: number;
  centre: OutdoorPoint;
  zoom: number;
};

function finiteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function insideOverlay(x: number, y: number, width: number, height: number): boolean {
  return x >= -2 && y >= -2 && x <= width + 2 && y <= height + 2;
}

export type OverlayReading = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OverlayMeasureState = {
  pending: OverlayReading | null;
  attempts: number;
  ready: OverlayReading | null;
};

export function freshOverlayMeasure(): OverlayMeasureState {
  return { pending: null, attempts: 0, ready: null };
}

function readingClose(left: OverlayReading, right: OverlayReading): boolean {
  return Math.abs(left.x - right.x) <= 1
    && Math.abs(left.y - right.y) <= 1
    && Math.abs(left.width - right.width) <= 2
    && Math.abs(left.height - right.height) <= 2;
}

/**
 * A window measurement becomes the drawing frame only after two readings agree.
 * The first onLayout call can report origin 0,0 before the view sits in the window.
 * Subtracting that origin from pageY leaves the point too far down the screen.
 * A later lone reading does not clear a frame that has already been confirmed.
 * `again` is true only while the frame is still unconfirmed, so one more reading is taken.
 */
export function nextOverlayMeasure(
  state: OverlayMeasureState,
  reading: OverlayReading,
  layout: { width: number; height: number },
): { state: OverlayMeasureState; again: boolean } {
  const sane = reading.width > 0 && reading.height > 0 && Number.isFinite(reading.x) && Number.isFinite(reading.y);
  if (!sane) return { state, again: false };
  const sized = layout.width > 0 && layout.height > 0
    && Math.abs(reading.width - layout.width) <= 2
    && Math.abs(reading.height - layout.height) <= 2;
  if (!sized) return { state: freshOverlayMeasure(), again: false };
  if (state.pending && readingClose(state.pending, reading)) {
    return { state: { pending: reading, attempts: 0, ready: reading }, again: false };
  }
  if (state.ready) return { state: { pending: reading, attempts: 0, ready: state.ready }, again: false };
  const attempts = state.attempts + 1;
  if (attempts >= 4) return { state: { pending: reading, attempts: 0, ready: reading }, again: false };
  return { state: { pending: reading, attempts, ready: null }, again: true };
}

/**
 * The finger, in the overlay's own coordinates.
 * Page position minus the measured window origin is the touch.
 * The first responder event can report locationY still in page space, which sits
 * too far down the screen by the overlay's distance from the top and draws a
 * short line south of the finger. That sample is corrected, not kept.
 * Nothing is returned until the overlay has been measured, and a point outside
 * the overlay is dropped. The camera centre is never filled in.
 */
export function fingerInOverlay(
  touch: DrawTouch,
  frame: Pick<DrawOverlay, 'ready' | 'originX' | 'originY' | 'width' | 'height'>,
): { x: number; y: number } | null {
  if (!frame.ready) return null;
  if (!(frame.width > 0) || !(frame.height > 0)) return null;
  if (!Number.isFinite(frame.originX) || !Number.isFinite(frame.originY)) return null;
  const pageX = touch.pageX;
  const pageY = touch.pageY;
  const locationX = touch.locationX;
  const locationY = touch.locationY;
  const page = finiteNumber(pageX) && finiteNumber(pageY)
    ? { x: pageX - frame.originX, y: pageY - frame.originY }
    : null;
  const local = finiteNumber(locationX) && finiteNumber(locationY)
    ? { x: locationX, y: locationY }
    : null;
  // Page minus the measured origin wins. locationY on the first touch can still
  // be the page position, which is originY pixels too far down the screen.
  if (page && insideOverlay(page.x, page.y, frame.width, frame.height)) return page;
  if (local && insideOverlay(local.x, local.y, frame.width, frame.height)) return local;
  return null;
}

/**
 * One touch, as a map coordinate.
 * The point is the finger. A touch with no valid conversion is omitted.
 * The camera centre and the blue location dot are not inserted.
 */
export function strokePointFromTouch(touch: DrawTouch, frame: DrawOverlay): OutdoorPoint | null {
  const finger = fingerInOverlay(touch, frame);
  if (!finger) return null;
  return viewToPoint({
    centre: frame.centre,
    zoom: frame.zoom,
    width: frame.width,
    height: frame.height,
    x: finger.x,
    y: finger.y,
  });
}

/**
 * One finger adds a point. Two or more fingers cancel the stroke and add nothing.
 * After a cancel, a later one-finger move in the same gesture still adds nothing.
 * The points are the finger path. They are not snapped and not sent anywhere.
 */
export function applyDrawPointers(
  session: DrawSession,
  pointerCount: number,
  point: OutdoorPoint | null,
): DrawSession {
  if (pointerCount >= 2 || session.cancelled) return { cancelled: true, points: [] };
  if (pointerCount !== 1 || !point) return session;
  return { cancelled: false, points: appendFingerPoint(session.points, point, FINGER_GAP_M) };
}

/**
 * The live pencil, at most once per animation frame.
 *
 * React Native's new architecture delivers `touchMove` as a coalesced event:
 * while the JS thread is busy, every pending move is replaced by the newest one.
 * When each finger sample re-rendered the whole route screen (and the map, which
 * re-serialises its style on every render), the first sample of a stroke held the
 * JS thread long enough that the moves in between were thrown away. The next move
 * that arrived was already far along the finger's path, so the stroke became one
 * straight chord from the touch, then followed the finger again.
 *
 * Samples are kept in full by the caller. Only the drawing of them waits for a
 * frame, and only the newest value is drawn.
 */
export type FrameBatcher<T> = {
  push: (value: T) => void;
  flush: () => void;
  cancel: () => void;
  pending: () => boolean;
};

export function createFrameBatcher<T>(
  publish: (value: T) => void,
  schedule: (run: () => void) => unknown,
  unschedule: (handle: unknown) => void,
): FrameBatcher<T> {
  let handle: unknown = null;
  let scheduled = false;
  let waiting = false;
  let latest: T | undefined;
  function run() {
    scheduled = false;
    handle = null;
    if (!waiting) return;
    waiting = false;
    const value = latest as T;
    latest = undefined;
    publish(value);
  }
  function stop() {
    if (scheduled && handle != null) unschedule(handle);
    scheduled = false;
    handle = null;
  }
  return {
    push(value: T) {
      latest = value;
      waiting = true;
      if (scheduled) return;
      scheduled = true;
      const next = schedule(run);
      if (scheduled) handle = next;
    },
    flush() {
      stop();
      run();
    },
    cancel() {
      stop();
      waiting = false;
      latest = undefined;
    },
    pending() {
      return waiting;
    },
  };
}

/** A cancelled gesture commits no stroke. */
export function finishDrawSession(session: DrawSession): OutdoorPoint[] {
  if (session.cancelled) return [];
  return session.points.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
}

export function clampDrawZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 14;
  return Math.min(DRAW_ZOOM_MAX, Math.max(DRAW_ZOOM_MIN, zoom));
}

/** Zoom change for a pinch. `spanRatio` is the new finger span divided by the span at the start. */
export function pinchZoom(zoom: number, spanRatio: number): number {
  if (!Number.isFinite(zoom) || !Number.isFinite(spanRatio) || spanRatio <= 0) return clampDrawZoom(zoom);
  return clampDrawZoom(zoom + Math.log2(spanRatio));
}

/**
 * Pinch and two-finger pan. The place under the fingers stays under the fingers.
 * Rotation is not applied.
 */
export function twoFingerView(input: {
  startZoom: number;
  startCentre: OutdoorPoint;
  width: number;
  height: number;
  startSpan: number;
  span: number;
  startMidX: number;
  startMidY: number;
  midX: number;
  midY: number;
}): { centre: OutdoorPoint; zoom: number } | null {
  if (!(input.startSpan > 0) || !(input.span > 0)) return null;
  const zoom = pinchZoom(input.startZoom, input.span / input.startSpan);
  const anchor = viewToPoint({
    centre: input.startCentre,
    zoom: input.startZoom,
    width: input.width,
    height: input.height,
    x: input.startMidX,
    y: input.startMidY,
  });
  if (!anchor) return null;
  const centre = centreKeepingPoint({
    point: anchor,
    zoom,
    width: input.width,
    height: input.height,
    x: input.midX,
    y: input.midY,
  });
  if (!centre) return null;
  return { centre, zoom };
}
