import {
  adoptSnappedLine,
  matchDrawnSketch,
  ROUTE_BAD_REQUEST,
  ROUTE_NO_PATH,
  ROUTE_UNAVAILABLE,
  type RoutePlan,
} from '@/domain/findRoute';
import { UserFacingError } from '@/domain/errors';
import { DRAW_SNAP_NO_PATH_ALONG } from '@/domain/routeAdjust';
import {
  centreKeepingPoint,
  viewToPoint,
  type OutdoorPoint,
  cleanPoints,
  metresBetween,
  pathMetres,
  removeRouteSpurs,
  SPUR_MAX_M,
  SPUR_WITHIN_M,
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

/**
 * What leaves or enters draw mode. The pen toggles. The X stops drawing and
 * clears the sketch. Collapsing the full-screen map, opening Adjust and a snapped
 * route stop drawing and keep the sketch. Page scrolling is locked only while
 * draw mode is on (the map also releases it when the screen closes), so every
 * way out of draw mode gives the page its scroll back.
 */
export type DrawModeEvent = 'pen' | 'close' | 'collapse' | 'adjust' | 'snapped';

export function nextDrawMode(drawing: boolean, event: DrawModeEvent): { drawing: boolean; clearSketch: boolean } {
  if (event === 'pen') return { drawing: !drawing, clearSketch: false };
  if (event === 'close') return { drawing: false, clearSketch: true };
  return { drawing: false, clearSketch: false };
}

/** The X is always live in draw mode, so there is always a way out, even before a line is drawn. */
export function drawCloseEnabled(input: { drawing: boolean; hasSketch: boolean; fromDraw: boolean }): boolean {
  return input.drawing || input.hasSketch || input.fromDraw;
}

/** Spoken name of the X. In draw mode it stops drawing as well as clearing. */
export function drawCloseLabel(drawing: boolean): string {
  return drawing ? 'Stop drawing and clear' : 'Clear';
}

/** The page under the map scrolls unless draw mode is on. */
export function pageScrollsWhileDrawing(drawing: boolean): boolean {
  return !drawing;
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

/** How close a new stroke must start to join a kept route. */
export const CONTINUE_NEAR_M = 80;

/**
 * Where a new stroke should join a kept route.
 * Near the end: continue from the end.
 * Near some other part of the line: continue from that nearby point.
 * Otherwise the stroke stands on its own, and the next snap routes any gap along paths.
 */
function closestPointOnSegment(point: OutdoorPoint, start: OutdoorPoint, end: OutdoorPoint): { point: OutdoorPoint; metres: number; t: number } {
  const cos = Math.cos((start.latitude * Math.PI) / 180);
  const px = (point.longitude - start.longitude) * 111_320 * cos;
  const py = (point.latitude - start.latitude) * 111_320;
  const ex = (end.longitude - start.longitude) * 111_320 * cos;
  const ey = (end.latitude - start.latitude) * 111_320;
  const length = ex * ex + ey * ey;
  const t = length < 1 ? 0 : Math.max(0, Math.min(1, (px * ex + py * ey) / length));
  return {
    point: {
      latitude: start.latitude + (end.latitude - start.latitude) * t,
      longitude: start.longitude + (end.longitude - start.longitude) * t,
    },
    metres: Math.hypot(px - t * ex, py - t * ey),
    t,
  };
}

export function continueFromRoute(
  route: readonly OutdoorPoint[],
  start: OutdoorPoint,
  nearM = CONTINUE_NEAR_M,
): { from: OutdoorPoint; atEnd: boolean } | null {
  const line = copyPoints(route);
  if (line.length < 2) return null;
  const threshold = Math.max(1, nearM);
  const end = line[line.length - 1]!;
  if (metresBetween(start, end) <= threshold) return { from: end, atEnd: true };
  let best: { point: OutdoorPoint; metres: number; index: number; t: number } | null = null;
  for (let index = 1; index < line.length; index += 1) {
    const hit = closestPointOnSegment(start, line[index - 1]!, line[index]!);
    if (!best || hit.metres < best.metres) best = { point: hit.point, metres: hit.metres, index, t: hit.t };
  }
  if (!best || best.metres > threshold) return null;
  const atEnd = best.index >= line.length - 1 && best.t > 0.8;
  return { from: best.point, atEnd };
}

/** Prepends the join point when the stroke starts near the kept route. */
export function attachStrokeToRoute(
  route: readonly OutdoorPoint[],
  stroke: readonly OutdoorPoint[],
  nearM = CONTINUE_NEAR_M,
): OutdoorPoint[] {
  const line = copyPoints(stroke);
  if (line.length === 0) return line;
  const join = continueFromRoute(route, line[0]!, nearM);
  if (!join) return line;
  if (samePoint(join.from, line[0]!) || metresBetween(join.from, line[0]!) < 8) return line;
  return [copyPoints([join.from])[0]!, ...line];
}

/** Only unsnapped strokes count. A kept route with no new line is not ready to snap again. */
export function pendingDrawStrokes(
  strokes: readonly (readonly OutdoorPoint[])[],
  snappedCount: number,
): OutdoorPoint[][] {
  return rawStrokeLines(strokes, snappedCount, []);
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

/** Climb across every routed piece, not the last piece stretched over the whole line. */
function combinedPlan(plans: readonly RoutePlan[], partial: boolean): RoutePlan | null {
  const last = plans[plans.length - 1];
  if (!last) return null;
  const distanceM = plans.reduce((sum, item) => sum + Math.max(0, item.distanceM), 0);
  const durationMinutes = plans.reduce((sum, item) => sum + Math.max(0, item.durationMinutes), 0);
  const sum = (pick: (item: RoutePlan) => number | null | undefined): number | null => {
    let total = 0;
    for (const item of plans) {
      const value = pick(item);
      if (value == null || !Number.isFinite(value)) return null;
      total += value;
    }
    return total;
  };
  return {
    ...last,
    distanceM: Math.max(1, distanceM),
    durationMinutes: Math.max(1, durationMinutes),
    // Part of the line is the pencil, so its climb is not known.
    ascentM: partial ? null : sum((item) => item.ascentM),
    descentM: partial ? null : sum((item) => item.descentM),
    elevationsM: plans.length === 1 ? last.elevationsM ?? null : null,
    maxGradientPct: plans.length === 1 ? last.maxGradientPct ?? null : null,
    averageGradientPct: plans.length === 1 ? last.averageGradientPct ?? null : null,
  };
}

/** A piece the service could not route may follow the pencil only when it is this short. */
export const PENCIL_PIECE_MAX_M = 120;
/** And only while the pencil is at most this share of the whole route. */
export const PENCIL_SHARE_MAX = 0.15;

export type DrawSnapResult =
  | {
    ok: true;
    /** Every piece is on real paths. Nothing follows the pencil. */
    matched: boolean;
    /** Some pieces are on paths and a short part follows the pencil. */
    partial: boolean;
    /** That short pencil part is there because the service did not answer for it. */
    serviceMissed: boolean;
    /** Some of the paths are a block or so away from the pencil, because no path ran under it. */
    strayed: boolean;
    /** Metres of the final line that follow the pencil, not a path. */
    pencilM: number;
    points: OutdoorPoint[];
    plan: RoutePlan | null;
  }
  | { ok: false; limit: true }
  | { ok: false; limit: false; error: unknown };

/**
 * Snaps each stroke, and routes each gap along paths.
 * A limit is refused before any call. A later failure does not pretend the earlier part snapped.
 * The joined line loses any there-and-back the pencil did not draw, including one where two pieces meet.
 *
 * The line on the map is the route service's geometry. Straight pencil lines are kept only for a
 * short piece the service could not route, and only while they are a small share of the route.
 * - A routed piece that strays from the pencil but stays on nearby paths is kept (`strayed`).
 *   That is what happens when the pencil sits over houses a street away.
 * - A routed piece that goes a long way round means there is no path along the pencil there,
 *   such as across a river or fields. A straight line there would cross the water, so a long
 *   piece like that fails the snap instead, with a message to redraw that part.
 * - A call the service could not answer is tried once more. If it still fails, a short piece
 *   follows the pencil (`serviceMissed`) and a long one fails the snap so it can be tried again.
 *   Two misses before anything snapped stop the calls, because the service is then most likely down.
 *   A rate limit, a sign-in problem or a lost connection stops the calls at once.
 */
export async function snapDrawnStrokes(input: {
  strokes: readonly (readonly OutdoorPoint[])[];
  anchor: OutdoorPoint | null;
  closeLoop?: boolean;
  send: (waypoints: readonly OutdoorPoint[]) => Promise<RoutePlan>;
}): Promise<DrawSnapResult> {
  const built = buildDrawSnapRequests(input.strokes, input.anchor, input.closeLoop === true);
  if (built.limit) return { ok: false, limit: true };
  if (built.requests.length === 0) return { ok: false, limit: false, error: new Error('short') };
  let failures = 0;
  let answered = 0;
  let lastError: unknown = null;
  let strayed = false;
  let pencilM = 0;
  let line: OutdoorPoint[] = [];
  let reference: OutdoorPoint[] = [];
  const plans: RoutePlan[] = [];
  const noPathAlongLine = () => ({ ok: false as const, limit: false as const, error: new UserFacingError(DRAW_SNAP_NO_PATH_ALONG, 'generic') });
  for (const request of built.requests) {
    reference = appendRouted(reference, request.waypoints);
    const pieceM = pathMetres(request.waypoints);
    const outcome = await snapPiece(request, input.send);
    if (outcome.kind === 'stop') return { ok: false, limit: false, error: outcome.error };
    if (outcome.kind === 'routed') {
      answered += 1;
      if (outcome.strayed) strayed = true;
      plans.push(outcome.plan);
      line = appendRouted(line, outcome.plan.points);
      continue;
    }
    if (outcome.kind === 'no_path_along') {
      answered += 1;
      // The service went a long way round. Only a very short piece may cross straight.
      if (pieceM > PENCIL_PIECE_MAX_M) return noPathAlongLine();
      pencilM += pieceM;
      line = appendRouted(line, request.waypoints);
      continue;
    }
    // The service did not answer, even on a second try.
    if (answered === 0 && failures >= 1) return { ok: false, limit: false, error: outcome.error };
    failures += 1;
    lastError = outcome.error;
    if (pieceM > PENCIL_PIECE_MAX_M) return { ok: false, limit: false, error: outcome.error };
    pencilM += pieceM;
    line = appendRouted(line, request.waypoints);
  }
  if (plans.length > 0 && built.requests.length > 1) {
    line = removeRouteSpurs(line, SPUR_WITHIN_M, SPUR_MAX_M, reference);
  }
  if (line.length < 2) return { ok: false, limit: false, error: new Error('short') };
  if (plans.length === 0) {
    return { ok: false, limit: false, error: failures > 0 ? lastError : new UserFacingError(DRAW_SNAP_NO_PATH_ALONG, 'generic') };
  }
  const totalM = pathMetres(line);
  if (pencilM > 0 && totalM > 0 && pencilM / totalM > PENCIL_SHARE_MAX) {
    return failures > 0 ? { ok: false, limit: false, error: lastError } : noPathAlongLine();
  }
  const partial = pencilM > 0;
  const plan = combinedPlan(plans, partial);
  return {
    ok: true,
    matched: !partial,
    partial,
    serviceMissed: failures > 0,
    strayed,
    pencilM: Math.round(pencilM),
    points: line,
    plan: plan ? adoptSnappedLine(plan, line) : null,
  };
}

type PieceOutcome =
  | { kind: 'routed'; plan: RoutePlan; strayed: boolean }
  | { kind: 'no_path_along' }
  | { kind: 'missed'; error: unknown }
  | { kind: 'stop'; error: unknown };

/** One piece, with one more try when the service did not answer. */
async function snapPiece(
  request: DrawSnapRequest,
  send: (waypoints: readonly OutdoorPoint[]) => Promise<RoutePlan>,
): Promise<PieceOutcome> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (request.routedGap) {
      try {
        return { kind: 'routed', plan: await send(request.waypoints), strayed: false };
      } catch (error) {
        if (!pieceCanFollowPencil(error)) return { kind: 'stop', error };
        lastError = error;
        continue;
      }
    }
    const result = await matchDrawnSketch({ sketch: request.waypoints, send });
    if (result.matched) return { kind: 'routed', plan: result.plan, strayed: false };
    if (result.sawRoute) {
      return result.detour ? { kind: 'routed', plan: result.detour, strayed: true } : { kind: 'no_path_along' };
    }
    if (!pieceCanFollowPencil(result.error)) return { kind: 'stop', error: result.error };
    lastError = result.error;
  }
  return { kind: 'missed', error: lastError };
}

/**
 * A piece can keep the pencil when the service answered but could not route it:
 * unavailable, no path, or a request it could not use.
 * A rate limit, sign-in, lost connection, slow answer or route limit is not one of these.
 */
function pieceCanFollowPencil(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = (error as { message?: unknown }).message;
  return message === ROUTE_UNAVAILABLE || message === ROUTE_NO_PATH || message === ROUTE_BAD_REQUEST;
}

/** The green tick waits until a stroke has actually moved. */
export function drawReadyToSnap(
  strokes: readonly (readonly OutdoorPoint[])[],
  pencil: readonly OutdoorPoint[] = [],
  snappedCount = 0,
): boolean {
  if (copyPoints(pencil).length >= 2) return true;
  return pendingDrawStrokes(strokes, snappedCount).length > 0;
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
 * `again` is true while the frame is unconfirmed, or while a new reading
 * disagrees with the confirmed frame, so one more reading is taken.
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
  if (state.ready) {
    // The view moved without changing size (the page scrolled, or something
    // above it changed). Keep the confirmed frame for now and take one more
    // reading, so the new place is confirmed on the next frame rather than
    // waiting for the next stroke.
    const attempts = state.attempts + 1;
    const again = !readingClose(state.ready, reading) && attempts < 4;
    return { state: { pending: reading, attempts: again ? attempts : 0, ready: state.ready }, again };
  }
  const attempts = state.attempts + 1;
  if (attempts >= 4) return { state: { pending: reading, attempts: 0, ready: reading }, again: false };
  return { state: { pending: reading, attempts, ready: null }, again: true };
}

/**
 * The finger, in the overlay's own coordinates.
 *
 * locationX/locationY is the touch measured by the phone against the drawing
 * overlay itself, so it is the point under the finger. It needs no window
 * measurement and is right inside the full screen modal, under a safe-area
 * inset, after the page scrolls, or after the map moves on the screen.
 *
 * pageX/pageY minus a measured window origin is used only when the location is
 * missing, or when it is plainly in page space: page and location are the same
 * point while the overlay sits away from the top left of the page. That was the
 * first responder sample in build 127, which drew a short line south of the finger.
 *
 * Build 138 preferred page minus the measured origin. That origin is an
 * asynchronous window measurement of the map, and in the full screen map it did
 * not match the frame of the touch's page position, so every point landed a
 * fixed distance above the finger.
 *
 * Nothing is returned until the overlay has been measured, and a point outside
 * the overlay is dropped. The camera centre is never filled in.
 */
export function fingerInOverlay(
  touch: DrawTouch,
  frame: Pick<DrawOverlay, 'ready' | 'originX' | 'originY' | 'width' | 'height'>,
): { x: number; y: number } | null {
  if (!frame.ready) return null;
  if (!(frame.width > 0) || !(frame.height > 0)) return null;
  const originKnown = Number.isFinite(frame.originX) && Number.isFinite(frame.originY);
  const pageX = touch.pageX;
  const pageY = touch.pageY;
  const locationX = touch.locationX;
  const locationY = touch.locationY;
  const hasPage = finiteNumber(pageX) && finiteNumber(pageY);
  const hasLocal = finiteNumber(locationX) && finiteNumber(locationY);
  const page = hasPage && originKnown
    ? { x: pageX - frame.originX, y: pageY - frame.originY }
    : null;
  if (hasLocal) {
    const local = { x: locationX, y: locationY };
    const pageSpace = hasPage
      && originKnown
      && Math.abs(pageX - locationX) <= 0.5
      && Math.abs(pageY - locationY) <= 0.5
      && (Math.abs(frame.originX) > 2 || Math.abs(frame.originY) > 2);
    if (pageSpace) {
      return page && insideOverlay(page.x, page.y, frame.width, frame.height) ? page : null;
    }
    return insideOverlay(local.x, local.y, frame.width, frame.height) ? local : null;
  }
  if (page && insideOverlay(page.x, page.y, frame.width, frame.height)) return page;
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
