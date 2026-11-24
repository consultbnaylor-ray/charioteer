import {
  appendSketchPoint,
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

/**
 * One finger adds a point. Two or more fingers cancel the stroke and add nothing.
 * After a cancel, a later one-finger move in the same gesture still adds nothing.
 */
export function applyDrawPointers(
  session: DrawSession,
  pointerCount: number,
  point: OutdoorPoint | null,
): DrawSession {
  if (pointerCount >= 2 || session.cancelled) return { cancelled: true, points: [] };
  if (pointerCount !== 1 || !point) return session;
  return { cancelled: false, points: appendSketchPoint(session.points, point, 2) };
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
