import { cleanPoints, type OutdoorPoint } from '@/domain/outdoorRoute';
import type { RoutePlan } from '@/domain/findRoute';
import { nextDrawMode } from '@/domain/drawStroke';

/**
 * The rubber on the drawn-route map.
 *
 * In rubber mode a finger drag does not draw. Every drawn point (and every point of the
 * snapped green line) within the rubber's reach of the drag is wiped. Wiping the middle of
 * a stroke splits it in two, so the pieces stay in their drawn order. Recalculate then
 * sends the remaining pieces, in order, through the same snap as the green tick, and the
 * route service joins the gaps up again. Nothing here logs or sends a position.
 */

/** Half the width of the rubber on screen, in points. Roughly a fingertip. */
export const RUBBER_RADIUS_PX = 24;

/** The rubber never shrinks below this on the ground, so a zoomed-in wipe still catches a line. */
export const RUBBER_MIN_M = 3;

/** And never grows past this, so a zoomed-out wipe cannot take a whole route by accident. */
export const RUBBER_MAX_M = 1500;

/** The tile size MapLibre uses for its zoom levels (see viewToPoint). */
const MERCATOR_TILE = 512;
const EARTH_M = 6_371_008.8;

export type DrawTool = 'pen' | 'rubber';

/** Spoken names of the rubber button. */
export const RUBBER_LABEL = 'Rubber: wipe out parts of the drawn route';
export const RUBBER_ON_LABEL = 'Rubber on. Tap to go back to the pen';

/** The button that snaps what is left after a wipe. */
export const RECALCULATE_ROUTE = 'Recalculate route';
export const RECALCULATE_HINT = 'Joins up what is left of your drawing and snaps it to the nearest paths again.';

/** Ground metres covered by one screen point at this zoom and latitude. */
export function metresPerPixel(latitude: number, zoom: number): number {
  if (!Number.isFinite(latitude) || !Number.isFinite(zoom)) return Number.NaN;
  const lat = Math.max(-85, Math.min(85, latitude));
  return (2 * Math.PI * EARTH_M * Math.cos((lat * Math.PI) / 180)) / (MERCATOR_TILE * 2 ** zoom);
}

/** How far the rubber reaches on the ground, for the map as it is now. */
export function rubberRadiusMetres(latitude: number, zoom: number, radiusPx = RUBBER_RADIUS_PX): number {
  const perPixel = metresPerPixel(latitude, zoom);
  if (!Number.isFinite(perPixel) || !(perPixel > 0)) return RUBBER_MIN_M;
  return Math.max(RUBBER_MIN_M, Math.min(RUBBER_MAX_M, perPixel * radiusPx));
}

type Flat = { x: number; y: number };

/** Local flat metres around `origin`. Accurate enough at rubber sizes. */
function flatten(point: OutdoorPoint, origin: OutdoorPoint): Flat {
  const toRad = Math.PI / 180;
  const cosLat = Math.cos(origin.latitude * toRad);
  return {
    x: (point.longitude - origin.longitude) * toRad * EARTH_M * cosLat,
    y: (point.latitude - origin.latitude) * toRad * EARTH_M,
  };
}

function distanceToSegment(point: Flat, a: Flat, b: Flat): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq)) : 0;
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** True when `point` lies within `radiusM` of the rubber's drag path (a single tap counts). */
export function touchedByRubber(point: OutdoorPoint, path: readonly OutdoorPoint[], radiusM: number): boolean {
  const drag = cleanPoints(path);
  if (drag.length === 0 || !(radiusM > 0)) return false;
  const origin = drag[0] as OutdoorPoint;
  const here = flatten(point, origin);
  if (drag.length === 1) return Math.hypot(here.x, here.y) <= radiusM;
  for (let index = 1; index < drag.length; index += 1) {
    const a = flatten(drag[index - 1] as OutdoorPoint, origin);
    const b = flatten(drag[index] as OutdoorPoint, origin);
    if (distanceToSegment(here, a, b) <= radiusM) return true;
  }
  return false;
}

/**
 * Adds points along any segment longer than `stepM`, so a rubber that crosses a long
 * straight piece of line (two far-apart points) still wipes where it crossed.
 */
export function densifyLine(line: readonly OutdoorPoint[], stepM: number): OutdoorPoint[] {
  const points = cleanPoints(line);
  if (points.length < 2 || !(stepM > 0)) return points.map((point) => ({ ...point }));
  const out: OutdoorPoint[] = [{ ...(points[0] as OutdoorPoint) }];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1] as OutdoorPoint;
    const b = points[index] as OutdoorPoint;
    const flatB = flatten(b, a);
    const length = Math.hypot(flatB.x, flatB.y);
    const pieces = Math.min(400, Math.floor(length / stepM));
    for (let step = 1; step <= pieces; step += 1) {
      const t = step / (pieces + 1);
      out.push({
        latitude: a.latitude + (b.latitude - a.latitude) * t,
        longitude: a.longitude + (b.longitude - a.longitude) * t,
      });
    }
    out.push({ ...b });
  }
  return out;
}

/**
 * One line after a wipe: the pieces that are left, in order. A piece needs two points to
 * be a line. `changed` is false when the rubber did not touch the line, and then the line
 * comes back exactly as it was (not densified).
 */
export function eraseLine(
  line: readonly OutdoorPoint[],
  path: readonly OutdoorPoint[],
  radiusM: number,
): { pieces: OutdoorPoint[][]; changed: boolean } {
  const original = cleanPoints(line).map((point) => ({ ...point }));
  const drag = cleanPoints(path);
  if (original.length === 0 || drag.length === 0 || !(radiusM > 0)) {
    return { pieces: original.length >= 2 ? [original] : [], changed: false };
  }
  const dense = densifyLine(original, Math.max(1, radiusM / 2));
  const pieces: OutdoorPoint[][] = [];
  let current: OutdoorPoint[] = [];
  let changed = false;
  for (const point of dense) {
    if (touchedByRubber(point, drag, radiusM)) {
      changed = true;
      if (current.length > 0) pieces.push(current);
      current = [];
      continue;
    }
    current.push(point);
  }
  if (current.length > 0) pieces.push(current);
  if (!changed) return { pieces: original.length >= 2 ? [original] : [], changed: false };
  return { pieces: pieces.filter((piece) => piece.length >= 2), changed: true };
}

/** Every line after a wipe. Untouched lines keep their points; touched lines may split. */
export function eraseLines(
  lines: readonly (readonly OutdoorPoint[])[],
  path: readonly OutdoorPoint[],
  radiusM: number,
): { lines: OutdoorPoint[][]; changed: boolean } {
  const out: OutdoorPoint[][] = [];
  let changed = false;
  for (const line of lines) {
    const result = eraseLine(line, path, radiusM);
    if (result.changed) changed = true;
    out.push(...result.pieces);
  }
  return { lines: out, changed };
}

function sameLines(a: readonly (readonly OutdoorPoint[])[], b: readonly (readonly OutdoorPoint[])[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? [];
    const right = b[index] ?? [];
    if (left.length !== right.length) return false;
    for (let point = 0; point < left.length; point += 1) {
      const p = left[point] as OutdoorPoint;
      const q = right[point] as OutdoorPoint;
      if (p.latitude !== q.latitude || p.longitude !== q.longitude) return false;
    }
  }
  return true;
}

/**
 * Recalculate shows once there has been a snap and the drawing is no longer what was
 * snapped: after a wipe, or after more drawing on top of a snapped route.
 * It needs something left to snap.
 */
export function needsRecalculate(input: {
  strokes: readonly (readonly OutdoorPoint[])[];
  lastSnapped: readonly (readonly OutdoorPoint[])[] | null;
  erased: boolean;
}): boolean {
  if (input.lastSnapped == null) return false;
  if (!input.strokes.some((stroke) => cleanPoints(stroke).length >= 2)) return false;
  if (input.erased) return true;
  return !sameLines(input.strokes, input.lastSnapped);
}

/** The pen and the rubber. Both keep the map in draw mode. */
export type DrawToolEvent = 'pen' | 'rubber' | 'stop';

export function nextDrawTool(
  drawing: boolean,
  tool: DrawTool,
  event: DrawToolEvent,
): { drawing: boolean; tool: DrawTool } {
  if (event === 'stop') return { drawing: false, tool: 'pen' };
  if (event === 'rubber') {
    // Tapping the rubber again goes back to the pen without leaving draw mode.
    if (drawing && tool === 'rubber') return { drawing: true, tool: 'pen' };
    return { drawing: true, tool: 'rubber' };
  }
  // The pen. From the rubber it goes back to drawing; otherwise it toggles draw mode as before.
  if (drawing && tool === 'rubber') return { drawing: true, tool: 'pen' };
  return { drawing: nextDrawMode(drawing, 'pen').drawing, tool: 'pen' };
}

/**
 * One undo entry. A snap entry is what the green tick replaced (the existing behaviour).
 * An erase entry is a full copy of the drawing from before the wipe, so undo puts it back.
 * `strokes` on a snap entry is set when that snap was a Recalculate, so undoing it goes
 * back to the wiped drawing rather than dropping strokes.
 */
export type DrawUndoEntry =
  | {
      kind: 'snap';
      plan: RoutePlan | null;
      snappedCount: number;
      keptStrokes: number;
      strokes?: OutdoorPoint[][];
      erasedSnap?: OutdoorPoint[][] | null;
      lastSnapped?: OutdoorPoint[][] | null;
    }
  | {
      kind: 'erase';
      strokes: OutdoorPoint[][];
      snappedCount: number;
      erasedSnap: OutdoorPoint[][] | null;
      /** How many strokes there were straight after the wipe. Strokes drawn later are undone first. */
      strokesAfter: number;
    };

export type DrawUndoStep = 'pencil' | 'stroke' | 'erase' | 'snap' | 'none';

/**
 * What one tap of Undo takes back, newest first: the finger still down, a stroke drawn
 * since the last snap or wipe, the last wipe, then the last snap.
 */
export function nextUndoStep(input: {
  pencil: number;
  strokes: number;
  snappedCount: number;
  top: DrawUndoEntry | null;
}): DrawUndoStep {
  if (input.pencil > 0) return 'pencil';
  const top = input.top;
  if (top?.kind === 'erase') {
    if (input.strokes > top.strokesAfter) return 'stroke';
    return 'erase';
  }
  if (input.strokes > input.snappedCount) return 'stroke';
  if (top?.kind === 'snap') return 'snap';
  if (input.strokes > 0) return 'stroke';
  return 'none';
}

/** The undo stack keeps this many steps. */
export const DRAW_UNDO_CAP = 12;

export function pushUndo(stack: readonly DrawUndoEntry[], entry: DrawUndoEntry): DrawUndoEntry[] {
  return [...stack, entry].slice(-DRAW_UNDO_CAP);
}

/**
 * The state straight after a wipe. Wiping only touches the drawn strokes and the shown
 * green line; the last snapped plan is kept so Undo can bring it back, and the route is
 * not re-snapped until Recalculate (or the green tick).
 */
export function applyErase(input: {
  strokes: readonly (readonly OutdoorPoint[])[];
  snappedLine: readonly OutdoorPoint[];
  erasedSnap: readonly (readonly OutdoorPoint[])[] | null;
  snappedCount: number;
  path: readonly OutdoorPoint[];
  radiusM: number;
}): {
  changed: boolean;
  strokes: OutdoorPoint[][];
  erasedSnap: OutdoorPoint[][] | null;
  entry: DrawUndoEntry | null;
} {
  const strokesNow = input.strokes.map((stroke) => cleanPoints(stroke).map((point) => ({ ...point })));
  const snapBefore = input.erasedSnap
    ? input.erasedSnap.map((line) => cleanPoints(line).map((point) => ({ ...point })))
    : null;
  const drawn = eraseLines(strokesNow, input.path, input.radiusM);
  const snapSource = snapBefore ?? (cleanPoints(input.snappedLine).length >= 2 ? [cleanPoints(input.snappedLine)] : []);
  const green = eraseLines(snapSource, input.path, input.radiusM);
  if (!drawn.changed && !green.changed) {
    return { changed: false, strokes: strokesNow, erasedSnap: snapBefore, entry: null };
  }
  const erasedSnap = green.changed ? green.lines : snapBefore ?? (snapSource.length > 0 ? snapSource : null);
  return {
    changed: true,
    strokes: drawn.lines,
    erasedSnap,
    entry: {
      kind: 'erase',
      strokes: strokesNow,
      snappedCount: input.snappedCount,
      erasedSnap: snapBefore,
      strokesAfter: drawn.lines.length,
    },
  };
}
