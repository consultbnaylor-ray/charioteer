import { combineDrawStrokes } from '@/domain/drawStroke';
import { routeOverTierLimit } from '@/domain/routeLengthLimit';
import type { Tier } from '@/domain/tierLimits';
import {
  adoptSnappedLine,
  ROUTE_BAD_REQUEST,
  ROUTE_NO_PATH,
  ROUTE_UNAVAILABLE,
  type RoutePlan,
} from '@/domain/findRoute';
import {
  cleanPoints,
  densifyLine,
  formatWalkDistance,
  hausdorffMetres,
  metresBetween,
  pathMetres,
  removeRouteSpurs,
  simplifySketch,
  snapFollowsSketch,
  SPUR_MAX_M,
  SPUR_WITHIN_M,
  type OutdoorPoint,
} from '@/domain/outdoorRoute';

/**
 * Drawn route, intent first.
 *
 * A drawing is a rough idea of where someone wants to go, not a line to trace. It may cross
 * a river, a field or a row of houses. So the drawing becomes a handful of intent points:
 * the start, the end, the turns and the far ends of a loop. The route service gets those
 * points in one call and finds the real walkable way between them. Where the drawing crossed
 * a river, the route goes over the nearest bridge on its own. The line on the map is always
 * the service's path geometry, never a straight pencil line.
 *
 * When the first answer strays a long way from the drawing, the same drawing is asked once
 * more with half as many points (fewer forced turns, fewer detours), and the answer closer
 * to the drawing is kept. No AI service is used, and nothing is charged.
 */

/** About one intent point per this many metres of drawing. */
export const INTENT_SPACING_M = 350;
export const INTENT_POINTS_MIN = 4;
/** Enough for a long Pro route at about one point per 350 m. The server splits the call. */
export const INTENT_POINTS_MAX = 1_000;
/** A wobble or a corner smaller than this is not a turn the person meant. */
export const INTENT_WOBBLE_M = 40;
/** Kept for tests. The phone now sends the whole drawing in one request; the server splits it. */
export const INTENT_CALL_MAX_M = 15_000;
/** Within this, and not much longer, the route is "near" the drawing. */
export const INTENT_NEAR_M = 400;
export const INTENT_NEAR_RATIO = 1.3;
export const INTENT_NEAR_EXTRA_M = 300;

export type IntentFit = 'close' | 'near' | 'round';

export type DrawIntentResult =
  | {
    ok: true;
    points: OutdoorPoint[];
    plan: RoutePlan;
    /** close: on the drawing. near: a street or so away. round: goes a different way, such as round to a bridge. */
    fit: IntentFit;
    drawnM: number;
    routeM: number;
    /** Route calls made from the phone. */
    calls: number;
  }
  | { ok: false; limit: true }
  | { ok: false; limit: false; error: unknown };

function copy(point: OutdoorPoint): OutdoorPoint {
  return { latitude: point.latitude, longitude: point.longitude };
}

/**
 * The whole drawing as one line: the blue dot (when it is the start and is not already
 * under the first stroke), then every stroke in order. A loop ends where it began.
 */
export function intentLine(
  strokes: readonly (readonly OutdoorPoint[])[],
  anchor: OutdoorPoint | null,
  closeLoop = false,
): OutdoorPoint[] {
  const drawn = combineDrawStrokes(strokes);
  if (drawn.length < 2) return drawn;
  const line = [...drawn];
  const first = line[0]!;
  if (anchor && Number.isFinite(anchor.latitude) && Number.isFinite(anchor.longitude) && metresBetween(anchor, first) >= 8) {
    line.unshift(copy(anchor));
  }
  if (closeLoop) {
    const start = line[0]!;
    const last = line[line.length - 1]!;
    if (metresBetween(start, last) >= 8) line.push(copy(start));
    else line[line.length - 1] = copy(start);
  }
  return line;
}

/** How many intent points a drawing of this length gets. */
export function intentBudget(lengthM: number): number {
  if (!Number.isFinite(lengthM) || lengthM <= 0) return INTENT_POINTS_MIN;
  return Math.min(INTENT_POINTS_MAX, Math.max(INTENT_POINTS_MIN, Math.round(lengthM / INTENT_SPACING_M)));
}

/**
 * The turning points of the drawing: Douglas-Peucker, tightened until it fits the budget.
 * The start, the end and the far ends of a loop are what survive first.
 */
export function intentPoints(line: readonly OutdoorPoint[], cap?: number): OutdoorPoint[] {
  const clean = cleanPoints(line);
  if (clean.length <= 2) return clean.map(copy);
  const budget = Math.max(2, Math.round(cap ?? intentBudget(pathMetres(clean))));
  const points = simplifySketch(clean, INTENT_WOBBLE_M, budget).map(copy);
  // A closed loop simplifies to start and end on the same spot. Keep its far side.
  if (points.length === 2 && metresBetween(points[0]!, points[1]!) < 8) {
    let far = 0;
    let farM = 0;
    clean.forEach((point, index) => {
      const metres = metresBetween(clean[0]!, point);
      if (metres > farM) {
        farM = metres;
        far = index;
      }
    });
    if (far > 0) return [points[0]!, copy(clean[far]!), points[1]!];
  }
  return points;
}

/** The first try, then one with about half as many points as the first try used. Duplicates are dropped. */
export function intentPointSets(line: readonly OutdoorPoint[]): OutdoorPoint[][] {
  const budget = intentBudget(pathMetres(cleanPoints(line)));
  const sets: OutdoorPoint[][] = [];
  const seen = new Set<string>();
  const first = intentPoints(line, budget);
  for (const cap of [budget, Math.max(3, Math.floor(first.length / 2))]) {
    const points = cap === budget ? first : intentPoints(line, cap);
    if (points.length < 2) continue;
    const key = points.map((point) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    sets.push(points);
  }
  return sets;
}

/** Splits the intent points so each call covers at most `INTENT_CALL_MAX_M` of drawing. Ends are shared. */
export function intentCalls(points: readonly OutdoorPoint[], maxM = INTENT_CALL_MAX_M): OutdoorPoint[][] {
  const calls: OutdoorPoint[][] = [];
  let current: OutdoorPoint[] = [];
  let since = 0;
  for (const point of points) {
    const last = current[current.length - 1];
    const leg = last ? metresBetween(last, point) : 0;
    if (last && current.length >= 2 && since + leg > maxM) {
      calls.push(current);
      current = [copy(last)];
      since = 0;
    }
    current.push(copy(point));
    since += leg;
  }
  if (current.length >= 2) calls.push(current);
  return calls;
}

function tooLong(line: readonly OutdoorPoint[], tier: Tier | null): boolean {
  return routeOverTierLimit(pathMetres(line), tier);
}

function segmentMetres(point: OutdoorPoint, start: OutdoorPoint, end: OutdoorPoint): number {
  const cos = Math.cos((start.latitude * Math.PI) / 180);
  const px = (point.longitude - start.longitude) * 111_320 * cos;
  const py = (point.latitude - start.latitude) * 111_320;
  const ex = (end.longitude - start.longitude) * 111_320 * cos;
  const ey = (end.latitude - start.latitude) * 111_320;
  const length = ex * ex + ey * ey;
  const t = length < 1 ? 0 : Math.max(0, Math.min(1, (px * ex + py * ey) / length));
  return Math.hypot(px - t * ex, py - t * ey);
}

/**
 * How far the drawing gets from the route: the worst place the person drew that the route
 * does not reach. A route that goes round to a bridge is not penalised here, only by its length.
 */
export function intentMissM(line: readonly OutdoorPoint[], routed: readonly OutdoorPoint[]): number {
  const drawn = densifyLine(line, 40);
  const route = cleanPoints(routed);
  if (route.length < 2) return Number.POSITIVE_INFINITY;
  let worst = 0;
  for (const point of drawn) {
    let best = Number.POSITIVE_INFINITY;
    for (let index = 1; index < route.length; index += 1) {
      best = Math.min(best, segmentMetres(point, route[index - 1]!, route[index]!));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

/** How well a route matches the drawing. Lower is better. */
export function intentScore(line: readonly OutdoorPoint[], routed: readonly OutdoorPoint[]): number {
  const drawnM = pathMetres(line);
  const routeM = pathMetres(routed);
  // Reaching the places drawn matters most. Extra length costs a tenth as much.
  return intentMissM(line, routed) + Math.max(0, routeM - drawnM) * 0.1;
}

export function intentFit(line: readonly OutdoorPoint[], routed: readonly OutdoorPoint[]): IntentFit {
  if (snapFollowsSketch(line, routed)) return 'close';
  const drawnM = pathMetres(line);
  const routeM = pathMetres(routed);
  const offM = hausdorffMetres(densifyLine(line, 40), densifyLine(routed, 40));
  if (offM <= INTENT_NEAR_M && routeM <= Math.max(drawnM * INTENT_NEAR_RATIO, drawnM + INTENT_NEAR_EXTRA_M)) return 'near';
  return 'round';
}

/** A call the service answered without a route. Fewer points may still work. */
function worthFewerPoints(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = (error as { message?: unknown }).message;
  return message === ROUTE_UNAVAILABLE || message === ROUTE_NO_PATH || message === ROUTE_BAD_REQUEST;
}

function joinRouted(line: OutdoorPoint[], next: readonly OutdoorPoint[]): OutdoorPoint[] {
  const added = next.map(copy);
  if (line.length === 0) return added;
  const end = line[line.length - 1]!;
  const start = added[0];
  const skip = start && metresBetween(end, start) < 8 ? 1 : 0;
  return [...line, ...added.slice(skip)];
}

function combine(plans: readonly RoutePlan[]): RoutePlan {
  const last = plans[plans.length - 1]!;
  if (plans.length === 1) return last;
  const sum = (pick: (plan: RoutePlan) => number | null | undefined): number | null => {
    let total = 0;
    for (const plan of plans) {
      const value = pick(plan);
      if (value == null || !Number.isFinite(value)) return null;
      total += value;
    }
    return total;
  };
  return {
    ...last,
    distanceM: Math.max(1, sum((plan) => plan.distanceM) ?? 1),
    durationMinutes: Math.max(1, sum((plan) => plan.durationMinutes) ?? 1),
    ascentM: sum((plan) => plan.ascentM),
    descentM: sum((plan) => plan.descentM),
    elevationsM: null,
    maxGradientPct: null,
    averageGradientPct: null,
  };
}

type Candidate = { points: OutdoorPoint[]; plan: RoutePlan; score: number; fit: IntentFit };

/**
 * The drawing, made into the best real route the service can find.
 * One call for most drawings, two when the first answer strays a long way.
 * Refused only when no route comes back at all.
 */
export async function snapDrawnIntent(input: {
  strokes: readonly (readonly OutdoorPoint[])[];
  anchor: OutdoorPoint | null;
  closeLoop?: boolean;
  /** The person's plan. No plan is treated as Standard. */
  tier?: Tier | null;
  send: (waypoints: readonly OutdoorPoint[]) => Promise<RoutePlan>;
}): Promise<DrawIntentResult> {
  const line = intentLine(input.strokes, input.anchor, input.closeLoop === true);
  if (line.length < 2 || pathMetres(line) < 8) return { ok: false, limit: false, error: new Error('short') };
  if (tooLong(line, input.tier ?? 'standard')) return { ok: false, limit: true };
  const sets = intentPointSets(line);
  if (sets.length === 0) return { ok: false, limit: false, error: new Error('short') };
  let calls = 0;
  let best: Candidate | null = null;
  let lastError: unknown = null;
  for (const set of sets) {
    const plans: RoutePlan[] = [];
    let joined: OutdoorPoint[] = [];
    let failed = false;
    // One request. The edge function splits a long drawing into provider-sized sections.
    calls += 1;
    try {
      const plan = await input.send(set);
      plans.push(plan);
      joined = joinRouted(joined, plan.points);
    } catch (error) {
      if (!worthFewerPoints(error)) return { ok: false, limit: false, error };
      lastError = error;
      failed = true;
    }
    if (failed || plans.length === 0 || joined.length < 2) continue;
    // Out-and-back stubs to a point that sat off the paths are dropped, unless the drawing went there and back too.
    const cleaned = removeRouteSpurs(joined, SPUR_WITHIN_M, SPUR_MAX_M, line);
    const points = cleaned.length >= 2 ? cleaned : joined;
    const candidate: Candidate = {
      points,
      plan: adoptSnappedLine(combine(plans), points),
      score: intentScore(line, points),
      fit: intentFit(line, points),
    };
    if (!best || candidate.score < best.score) best = candidate;
    if (best.fit === 'close') break;
  }
  if (!best) return { ok: false, limit: false, error: lastError ?? new Error(ROUTE_NO_PATH) };
  return {
    ok: true,
    points: best.points,
    plan: best.plan,
    fit: best.fit,
    drawnM: Math.round(pathMetres(line)),
    routeM: Math.round(pathMetres(best.points)),
    calls,
  };
}

/** The note when the route goes a different way from the drawing. Only figures the line supports. */
export function intentRoundNote(drawnM: number, routeM: number): string {
  return `Snapped to the nearest real route. Where your line had no path, it goes round by other paths: ${formatWalkDistance(drawnM)} drawn, ${formatWalkDistance(routeM)} route.`;
}
