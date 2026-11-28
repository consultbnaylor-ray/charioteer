import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  INTENT_POINTS_MAX,
  INTENT_POINTS_MIN,
  intentBudget,
  intentCalls,
  intentPoints,
  intentRoundNote,
  snapDrawnIntent,
} from '@/domain/drawIntent';
import { UserFacingError } from '@/domain/errors';
import { ROUTE_NO_PATH, ROUTE_RATE_LIMITED, type RoutePlan } from '@/domain/findRoute';
import { metresBetween, pathMetres, type OutdoorPoint } from '@/domain/outdoorRoute';
import { routePlanBody } from '@/domain/routeAdjust';
import {
  buildDirectionsBody,
  buildSnapManyBody,
  INTENT_SNAP_RADIUS_M,
  parseSnapMany,
  readIntent,
  SKETCH_SNAP_RADIUS_M,
} from '../../supabase/functions/_shared/orsRoute';

/**
 * Borrowash to Elvaston, 26 Nov 2026 (build 141). A 6.6 km sketch from the blue dot in the
 * village, south over the B5010, straight across the Derwent and the fields to a loop near
 * Elvaston, and back. There is no bridge under the line. The only crossing is 1.5 km east.
 * Build 141 refused it: "Part of your line has no path along it".
 *
 * The fixture is a small made-up network in metres, east (x) and north (y) of the blue dot's road.
 */
const origin = { latitude: 52.8975, longitude: -1.3870 };
const COS = Math.cos((origin.latitude * Math.PI) / 180);
const at = (x: number, y: number): OutdoorPoint => ({
  latitude: origin.latitude + y / 111_320,
  longitude: origin.longitude + x / (111_320 * COS),
});
const xy = (point: OutdoorPoint) => ({
  x: (point.longitude - origin.longitude) * 111_320 * COS,
  y: (point.latitude - origin.latitude) * 111_320,
});

/** Roads and paths, as straight segments. The river runs east-west at y = -300. */
const ROADS: [number, number, number, number][] = [
  [0, 600, 0, 0], // village street down from the blue dot
  [-2000, 0, 3000, 0], // B5010
  [1500, 0, 1500, -1200], // the lane over the bridge
  [-500, -1200, 2500, -1200], // the lane on the far side
  [0, -1200, 0, -1800], // Elvaston loop, west side
  [0, -1800, 800, -1800], // south side
  [800, -1800, 800, -1200], // east side
];
const RIVER_Y = -300;

type Node = { x: number; y: number };
/** Every road cut into 20 m steps, joined where they meet. */
function network(): { nodes: Node[]; edges: Map<number, number[]> } {
  const nodes: Node[] = [];
  const edges = new Map<number, number[]>();
  const keyOf = (node: Node) => `${Math.round(node.x)},${Math.round(node.y)}`;
  const index = new Map<string, number>();
  const add = (node: Node) => {
    const key = keyOf(node);
    const found = index.get(key);
    if (found != null) return found;
    nodes.push(node);
    index.set(key, nodes.length - 1);
    edges.set(nodes.length - 1, []);
    return nodes.length - 1;
  };
  for (const [x1, y1, x2, y2] of ROADS) {
    const steps = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 20));
    let previous = add({ x: x1, y: y1 });
    for (let step = 1; step <= steps; step += 1) {
      const next = add({ x: x1 + ((x2 - x1) * step) / steps, y: y1 + ((y2 - y1) * step) / steps });
      edges.get(previous)!.push(next);
      edges.get(next)!.push(previous);
      previous = next;
    }
  }
  return { nodes, edges };
}
const NET = network();

function nearestNode(point: OutdoorPoint): { node: number; metres: number } {
  const p = xy(point);
  let best = 0;
  let bestM = Number.POSITIVE_INFINITY;
  NET.nodes.forEach((node, index) => {
    const metres = Math.hypot(node.x - p.x, node.y - p.y);
    if (metres < bestM) {
      bestM = metres;
      best = index;
    }
  });
  return { node: best, metres: bestM };
}

function shortest(from: number, to: number): number[] {
  const dist = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, number>();
  const open = new Set<number>([from]);
  while (open.size > 0) {
    let current = -1;
    let currentM = Number.POSITIVE_INFINITY;
    for (const node of open) {
      const metres = dist.get(node)!;
      if (metres < currentM) {
        currentM = metres;
        current = node;
      }
    }
    open.delete(current);
    if (current === to) break;
    for (const next of NET.edges.get(current) ?? []) {
      const a = NET.nodes[current]!;
      const b = NET.nodes[next]!;
      const metres = currentM + Math.hypot(a.x - b.x, a.y - b.y);
      if (metres < (dist.get(next) ?? Number.POSITIVE_INFINITY)) {
        dist.set(next, metres);
        prev.set(next, current);
        open.add(next);
      }
    }
  }
  const path = [to];
  while (path[0] !== from) {
    const back = prev.get(path[0]!);
    if (back == null) return [];
    path.unshift(back);
  }
  return path;
}

/**
 * A stand-in for the deployed outdoor-route function and the route service: each point joins the
 * nearest path within `radiusM`, then the shortest way is taken. With `serverSnaps`, a point out of
 * reach is dropped and the rest are routed, as the function's one snap-and-retry does.
 */
function router(radiusM: number, calls: number[][] = [], serverSnaps = true) {
  return async (waypoints: readonly OutdoorPoint[]): Promise<RoutePlan> => {
    calls.push(waypoints.map(() => 1));
    let snapped = waypoints.map((point) => nearestNode(point));
    if (snapped.some((item) => item.metres > radiusM)) {
      if (!serverSnaps) throw new UserFacingError(ROUTE_NO_PATH, 'generic');
      snapped = snapped.filter((item) => item.metres <= radiusM);
      if (snapped.length < 2) throw new UserFacingError(ROUTE_NO_PATH, 'generic');
    }
    const nodes: number[] = [];
    for (let index = 1; index < snapped.length; index += 1) {
      const leg = shortest(snapped[index - 1]!.node, snapped[index]!.node);
      nodes.push(...(nodes.length > 0 ? leg.slice(1) : leg));
    }
    const points = nodes.map((node) => at(NET.nodes[node]!.x, NET.nodes[node]!.y));
    const distanceM = Math.max(1, pathMetres(points));
    return {
      mocked: false,
      mode: 'walk',
      shape: 'loop',
      profile: 'foot-walking',
      distanceM,
      durationMinutes: Math.max(1, Math.round(distanceM / 80)),
      ascentM: 12,
      points,
      snappedStart: null,
      snapDistanceM: null,
    };
  };
}

function finger(corners: [number, number][], stepM = 3): OutdoorPoint[] {
  const out: OutdoorPoint[] = [];
  for (let index = 1; index < corners.length; index += 1) {
    const [x1, y1] = corners[index - 1]!;
    const [x2, y2] = corners[index]!;
    const steps = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / stepM));
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      // A hand-drawn wobble of a few metres.
      out.push(at(x1 + (x2 - x1) * t + Math.sin(out.length / 9) * 6, y1 + (y2 - y1) * t));
    }
  }
  const [x, y] = corners[corners.length - 1]!;
  out.push(at(x, y));
  return out;
}

const blueDot = at(0, 600);
/** Straight south over the B5010, the river and the fields, round the loop near Elvaston, and back up. */
const riverSketch = finger([[0, 560], [60, 0], [40, -700], [0, -1250], [0, -1800], [800, -1800], [800, -1250], [60, -700], [20, 0], [0, 560]]);

/** Metres from the nearest road. */
function offRoadM(point: OutdoorPoint): number {
  const p = xy(point);
  let best = Number.POSITIVE_INFINITY;
  for (const [x1, y1, x2, y2] of ROADS) {
    const ex = x2 - x1;
    const ey = y2 - y1;
    const t = Math.max(0, Math.min(1, ((p.x - x1) * ex + (p.y - y1) * ey) / (ex * ex + ey * ey)));
    best = Math.min(best, Math.hypot(p.x - (x1 + t * ex), p.y - (y1 + t * ey)));
  }
  return best;
}

/** True when a straight piece of the line crosses the river away from the bridge. */
function crossesRiverOffBridge(points: readonly OutdoorPoint[]): boolean {
  for (let index = 1; index < points.length; index += 1) {
    const a = xy(points[index - 1]!);
    const b = xy(points[index]!);
    if ((a.y - RIVER_Y) * (b.y - RIVER_Y) > 0) continue;
    const t = a.y === b.y ? 0 : (RIVER_Y - a.y) / (b.y - a.y);
    const x = a.x + (b.x - a.x) * t;
    if (Math.abs(x - 1500) > 5) return true;
  }
  return false;
}

describe('a drawn route is made from the intent of the drawing', () => {
  it('routes the Derwent sketch over the bridge instead of refusing it', async () => {
    const calls: number[][] = [];
    const result = await snapDrawnIntent({
      strokes: [riverSketch],
      anchor: blueDot,
      closeLoop: true,
      send: router(350, calls),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls.length).toBeLessThanOrEqual(2);
    expect(result.calls).toBe(calls.length);
    // Every point is on a road or path, and the river is only crossed on the bridge.
    expect(Math.max(...result.points.map(offRoadM))).toBeLessThan(2);
    expect(crossesRiverOffBridge(result.points)).toBe(false);
    expect(result.points.some((point) => Math.abs(xy(point).x - 1500) < 3 && Math.abs(xy(point).y - RIVER_Y) < 25)).toBe(true);
    // It reaches the loop near Elvaston.
    expect(result.points.some((point) => metresBetween(point, at(400, -1800)) < 25)).toBe(true);
    expect(result.fit).toBe('round');
    expect(result.routeM).toBeGreaterThan(result.drawnM);
    expect(result.plan.points).toEqual(result.points);
    expect(result.plan.distanceM).toBe(Math.max(1, Math.round(pathMetres(result.points))) || result.plan.distanceM);
    const note = intentRoundNote(result.drawnM, result.routeM);
    expect(note).toMatch(/^Snapped to the nearest real route\. Where your line had no path, it goes round by other paths: \d+(\.\d)? km drawn, \d+(\.\d)? km route\.$/);
    expect(note).not.toMatch(/bridge|Derwent|Elvaston/i);
  });

  it('sends the drawing in one call when the paths are under it', async () => {
    const onRoads = finger([[0, 560], [0, 0], [1500, 0], [1500, -1200]]);
    const calls: number[][] = [];
    const result = await snapDrawnIntent({ strokes: [onRoads], anchor: null, send: router(350, calls) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls).toHaveLength(1);
    expect(result.fit).toBe('close');
    expect(calls[0]!.length).toBeLessThanOrEqual(INTENT_POINTS_MAX);
  });

  it('asks once more with fewer points when a point is out of reach of every path', async () => {
    // Against a server that has not been redeployed yet: points over 100 m from a path are refused.
    const calls: number[][] = [];
    const result = await snapDrawnIntent({
      strokes: [riverSketch],
      anchor: blueDot,
      closeLoop: true,
      send: async (waypoints) => {
        if (calls.length === 0) {
          calls.push([]);
          throw new UserFacingError(ROUTE_NO_PATH, 'generic');
        }
        return router(Number.POSITIVE_INFINITY, calls)(waypoints);
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls).toHaveLength(2);
    expect(crossesRiverOffBridge(result.points)).toBe(false);
  });

  it('refuses only when no route comes back at all', async () => {
    let calls = 0;
    const result = await snapDrawnIntent({
      strokes: [riverSketch],
      anchor: blueDot,
      closeLoop: true,
      send: async () => {
        calls += 1;
        throw new UserFacingError(ROUTE_NO_PATH, 'generic');
      },
    });
    expect(calls).toBe(2);
    expect(result.ok).toBe(false);
    if (result.ok || result.limit) return;
    expect((result.error as Error).message).toBe(ROUTE_NO_PATH);
  });

  it('stops at once on a rate limit', async () => {
    let calls = 0;
    const result = await snapDrawnIntent({
      strokes: [riverSketch],
      anchor: null,
      send: async () => {
        calls += 1;
        throw new UserFacingError(ROUTE_RATE_LIMITED, 'generic');
      },
    });
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
  });

  it('picks turning points, keeps the far side of a loop, and stays inside the point budget', () => {
    expect(intentBudget(0)).toBe(INTENT_POINTS_MIN);
    expect(intentBudget(6600)).toBe(19);
    expect(intentBudget(60_000)).toBe(Math.round(60_000 / 350));
    expect(intentBudget(60_000)).toBeLessThanOrEqual(INTENT_POINTS_MAX);
    const points = intentPoints(riverSketch);
    expect(points.length).toBeLessThanOrEqual(intentBudget(pathMetres(riverSketch)));
    expect(points.some((point) => metresBetween(point, at(400, -1800)) < 420)).toBe(true);
    const ring = finger([[0, 0], [300, 0], [300, 300], [0, 300], [0, 0]]);
    expect(intentPoints(ring, 2).length).toBe(3);
  });

  it('splits only a very long drawing into more than one call', () => {
    const line = Array.from({ length: 21 }, (_, index) => at(0, -index * 1000));
    const calls = intentCalls(line);
    expect(calls.length).toBe(2);
    expect(calls[0]![calls[0]!.length - 1]).toEqual(calls[1]![0]);
    expect(intentCalls(line.slice(0, 10))).toHaveLength(1);
  });

  it('sends the intent points as they are, flagged for the server', () => {
    const sketch = [at(0, 0), at(5, 300), at(10, 600)];
    const body = routePlanBody({ mode: 'walk', shape: 'a_to_b', start: sketch[0]!, end: sketch[2]!, sketch, intent: true });
    expect(body.intent).toBe(true);
    expect(body.sketch).toHaveLength(3);
    const plain = routePlanBody({ mode: 'walk', shape: 'a_to_b', start: sketch[0]!, end: sketch[2]!, sketch });
    expect('intent' in plain).toBe(false);
  });
});

describe('the outdoor-route function for intent points', () => {
  const sketch = [at(0, 0), at(0, -700), at(800, -1800)];

  it('lets each point join the nearest path within the hosted maximum, without forced straight exits', () => {
    expect(readIntent(true)).toBe(true);
    expect(readIntent('true')).toBe(false);
    const body = buildDirectionsBody({ mode: 'walk', shape: 'a_to_b', start: sketch[0]!, end: sketch[2]!, lengthM: 0, sketch, intent: true })!;
    expect(INTENT_SNAP_RADIUS_M).toBe(350);
    expect(body.radiuses).toEqual([350, 350, 350]);
    expect(body.continue_straight).toBe(false);
    const older = buildDirectionsBody({ mode: 'walk', shape: 'a_to_b', start: sketch[0]!, end: sketch[2]!, lengthM: 0, sketch })!;
    expect(older.radiuses).toEqual(sketch.map(() => SKETCH_SNAP_RADIUS_M));
  });

  it('snaps every point in one call and reads both answer shapes', () => {
    expect(buildSnapManyBody(sketch)).toEqual({ locations: sketch.map((point) => [Math.round(point.longitude * 1e6) / 1e6, Math.round(point.latitude * 1e6) / 1e6]), radius: 350 });
    const geo = parseSnapMany({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-1.387, 52.8975] }, properties: { source_id: 0 } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-1.375, 52.881] }, properties: { source_id: 2 } },
      ],
    }, 3);
    expect(geo[0]).toEqual({ latitude: 52.8975, longitude: -1.387 });
    expect(geo[1]).toBeNull();
    expect(geo[2]).toEqual({ latitude: 52.881, longitude: -1.375 });
    const plain = parseSnapMany({ locations: [{ location: [-1.387, 52.8975], snapped_distance: 3 }, null, null] }, 3);
    expect(plain.filter(Boolean)).toHaveLength(1);
    expect(parseSnapMany(null, 2)).toEqual([null, null]);
  });

  it('snaps and asks once more only for an intent request that found no path', () => {
    const fn = readFileSync('supabase/functions/outdoor-route/index.ts', 'utf8');
    expect(fn).toContain('routeSketchByChunks');
    expect(fn).toContain('snapManyAll');
    const retry = fn.slice(fn.indexOf('async function routeSketchByChunks'), fn.indexOf('async function recordRequest'));
    expect(retry).toContain('snapManyAll(input.key, input.mode, input.sketch)');
    expect(retry).toContain("first.failure.body.code !== 'no_path'");
    expect(fn).toContain("logOrsFailure('snap-many'");
  });
});
