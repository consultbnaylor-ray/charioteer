import {
  centreKeepingPoint,
  viewToPoint,
  type OutdoorPoint,
  cleanPoints,
  metresBetween,
} from '@/domain/outdoorRoute';

/**
 * A drawn route is a stack of finger strokes.
 * A new stroke continues from the current end, even when the finger starts away from it.
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

/** Prepends the current end so the stroke is joined, even when the finger starts away from it. */
export function joinStroke(end: OutdoorPoint | null, stroke: readonly OutdoorPoint[]): OutdoorPoint[] {
  const clean = copyPoints(stroke);
  const start = end ? copyPoints([end])[0] : undefined;
  if (!start) return clean;
  if (clean.length === 0) return [start];
  if (samePoint(clean[0], start)) return clean;
  return [start, ...clean];
}

/** Appends one stroke. A stroke that does not move is left off the stack. */
export function commitDrawStroke(
  strokes: readonly (readonly OutdoorPoint[])[],
  stroke: readonly OutdoorPoint[],
  end: OutdoorPoint | null = drawEnd(strokes),
): OutdoorPoint[][] {
  const kept = strokes.map((item) => copyPoints(item));
  const joined = joinStroke(end, stroke);
  if (joined.length < 2) return kept;
  return [...kept, joined];
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

/** Hand-drawn points that are not on a snapped route yet, plus the finger still down. */
export function rawDrawLine(
  strokes: readonly (readonly OutdoorPoint[])[],
  snappedCount: number,
  pencil: readonly OutdoorPoint[] = [],
): OutdoorPoint[] {
  const count = strokeCount(snappedCount, strokes.length);
  const pending = combineDrawStrokes(strokes.slice(count));
  const finger = copyPoints(pencil);
  if (finger.length === 0) return pending;
  if (pending.length === 0) return finger;
  return stitchRoute(pending, finger);
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
