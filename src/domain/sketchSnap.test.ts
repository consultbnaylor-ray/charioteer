import { describe, expect, it } from 'vitest';

import { DRAW_SNAP_PARTIAL } from '@/domain/routeAdjust';
import { matchDrawnSketch, unmatchedDrawnPlan, type RoutePlan } from '@/domain/findRoute';
import {
  SNAP_DEVIATION_M,
  SNAP_LENGTH_RATIO,
  SKETCH_WAYPOINT_MAX,
  SKETCH_WAYPOINT_MIN,
  drawnLineAfterSnap,
  hausdorffMetres,
  metresBetween,
  pathMetres,
  removeRouteSpurs,
  sketchWaypointBudget,
  sketchWaypointSets,
  sketchWaypoints,
  type OutdoorPoint,
} from '@/domain/outdoorRoute';

const origin: OutdoorPoint = { latitude: 52.906, longitude: -1.384 };

function east(metres: number, from: OutdoorPoint = origin): OutdoorPoint {
  const cos = Math.cos((from.latitude * Math.PI) / 180);
  return { latitude: from.latitude, longitude: from.longitude + metres / (111_320 * cos) };
}

function north(metres: number, from: OutdoorPoint = origin): OutdoorPoint {
  return { latitude: from.latitude + metres / 111_320, longitude: from.longitude };
}

function planFrom(points: readonly OutdoorPoint[], distanceM = pathMetres(points)): RoutePlan {
  return {
    mocked: false,
    mode: 'walk',
    shape: 'a_to_b',
    profile: 'foot-walking',
    distanceM,
    durationMinutes: Math.max(1, Math.round(distanceM / 80)),
    ascentM: 12,
    points: points.map((point) => ({ ...point })),
    snappedStart: null,
    snapDistanceM: null,
  };
}

describe('sketch snapping', () => {
  it('keeps real corners and caps a long sketch between 8 and 25 waypoints', () => {
    const straight = Array.from({ length: 120 }, (_, index) => east(index * 20));
    const simple = sketchWaypoints(straight);
    expect(simple).toHaveLength(2);
    expect(simple[0]).toEqual(straight[0]);
    expect(simple[1]).toEqual(straight[straight.length - 1]);
    expect(sketchWaypointBudget(pathMetres(straight))).toBeGreaterThanOrEqual(SKETCH_WAYPOINT_MIN);
    expect(sketchWaypointBudget(pathMetres(straight))).toBeLessThanOrEqual(SKETCH_WAYPOINT_MAX);

    const spike = [origin, east(100), north(25, east(100)), east(200)];
    expect(sketchWaypoints(spike)).toHaveLength(2);

    const dogleg = [origin, east(200), north(200, east(200))];
    expect(sketchWaypoints(dogleg)).toHaveLength(3);

    let cursor = origin;
    const busy: OutdoorPoint[] = [origin];
    for (const [eastM, northM] of [
      [400, 0], [0, 300], [400, 0], [0, -250], [500, 0], [0, 350], [400, 0], [0, -200], [450, 0],
    ] as const) {
      cursor = {
        latitude: cursor.latitude + northM / 111_320,
        longitude: cursor.longitude + eastM / (111_320 * Math.cos((cursor.latitude * Math.PI) / 180)),
      };
      busy.push(cursor);
    }
    const corners = sketchWaypoints(busy);
    const budget = sketchWaypointBudget(pathMetres(busy));
    expect(budget).toBeGreaterThanOrEqual(SKETCH_WAYPOINT_MIN);
    expect(budget).toBeLessThanOrEqual(SKETCH_WAYPOINT_MAX);
    expect(corners.length).toBeGreaterThanOrEqual(SKETCH_WAYPOINT_MIN);
    expect(corners.length).toBeLessThanOrEqual(budget);
    expect(corners.length).toBeLessThanOrEqual(SKETCH_WAYPOINT_MAX);
    expect(corners.length).toBeLessThanOrEqual(busy.length);
    expect(corners[0]?.latitude).toBeCloseTo(busy[0]?.latitude ?? 0, 5);
    expect(corners[corners.length - 1]?.longitude).toBeCloseTo(busy[busy.length - 1]?.longitude ?? 0, 5);
    expect(sketchWaypointSets(busy).length).toBeGreaterThan(1);
    expect(sketchWaypointSets(busy).every((set) => set.length <= SKETCH_WAYPOINT_MAX)).toBe(true);
  });

  it('removes an out-and-back spur and keeps a loop that only closes at the end', () => {
    const a = origin;
    const b = east(200);
    const c = east(400);
    const tip = north(80, c);
    const back = { ...c };
    const d = east(600);
    const cleaned = removeRouteSpurs([a, b, c, tip, back, d]);
    expect(cleaned.some((point) => metresBetween(point, tip) < 10)).toBe(false);
    expect(pathMetres(cleaned)).toBeLessThan(pathMetres([a, b, c, tip, back, d]) - 100);
    expect(metresBetween(cleaned[0], a)).toBeLessThan(1);
    expect(metresBetween(cleaned[cleaned.length - 1], d)).toBeLessThan(1);

    const loop = [a, east(180), north(180, east(180)), north(180), a];
    expect(removeRouteSpurs(loop)).toHaveLength(loop.length);

    const stub = [a, north(20), a, east(150)];
    const unstubbed = removeRouteSpurs(stub);
    expect(unstubbed.some((point) => metresBetween(point, north(20)) < 5)).toBe(false);
    expect(metresBetween(unstubbed[unstubbed.length - 1], east(150))).toBeLessThan(1);
  });

  it('rejects a snap that wanders off the pencil and falls back to that line', () => {
    expect(DRAW_SNAP_PARTIAL).toBe('Couldn\'t match all of that to paths — showing your line');
    expect(SNAP_LENGTH_RATIO).toBe(1.6);
    const sketch = [origin, east(500)];

    const withSpur = [origin, east(200), east(400), north(70, east(400)), east(400), east(600)];
    const kept = drawnLineAfterSnap({ sketch: [origin, east(600)], routed: withSpur });
    expect(kept.matched).toBe(true);
    expect(kept.points.some((point) => metresBetween(point, north(70, east(400))) < 10)).toBe(false);
    expect(hausdorffMetres(kept.points, [origin, east(600)])).toBeLessThan(SNAP_DEVIATION_M);

    const detour = [origin, north(400), east(500, north(400)), east(500)];
    const rejected = drawnLineAfterSnap({ sketch, routed: detour });
    expect(rejected.matched).toBe(false);
    expect(rejected.points).toEqual(sketch);
    expect(pathMetres(detour)).toBeGreaterThan(pathMetres(sketch) * SNAP_LENGTH_RATIO);

    const parallel = sketch.map((point) => north(200, point));
    const offToTheSide = drawnLineAfterSnap({ sketch, routed: parallel });
    expect(offToTheSide.matched).toBe(false);
    expect(offToTheSide.points).toEqual(sketch);
    expect(hausdorffMetres(sketch, parallel)).toBeGreaterThan(SNAP_DEVIATION_M);

    const hand = unmatchedDrawnPlan({ mode: 'walk', shape: 'a_to_b', preferPaths: true, points: sketch });
    expect(hand.points).toEqual(sketch);
    expect(hand.profile).toBe('foot-hiking');
    expect(hand.distanceM).toBe(pathMetres(sketch));
  });

  it('sends one snap and keeps that line only when it follows the pencil', async () => {
    let cursor = origin;
    const busy: OutdoorPoint[] = [origin];
    for (const [eastM, northM] of [
      [400, 0], [0, 300], [400, 0], [0, -250], [500, 0], [0, 350], [400, 0], [0, -200], [450, 0],
    ] as const) {
      cursor = {
        latitude: cursor.latitude + northM / 111_320,
        longitude: cursor.longitude + eastM / (111_320 * Math.cos((cursor.latitude * Math.PI) / 180)),
      };
      busy.push(cursor);
    }
    const sent: number[] = [];
    const wandered = await matchDrawnSketch({
      sketch: busy,
      send: async (waypoints) => {
        sent.push(waypoints.length);
        return planFrom(busy.map((point) => north(250, point)), pathMetres(busy) * 3);
      },
    });
    expect(sent).toHaveLength(1);
    expect(wandered.matched).toBe(false);
    if (!wandered.matched) expect(wandered.sawRoute).toBe(true);

    const followed = await matchDrawnSketch({
      sketch: busy,
      send: async (waypoints) => planFrom(waypoints),
    });
    expect(followed.matched).toBe(true);
    if (followed.matched) {
      expect(hausdorffMetres(followed.plan.points, busy)).toBeLessThan(SNAP_DEVIATION_M);
      expect(followed.plan.distanceM).toBeLessThan(pathMetres(busy) * SNAP_LENGTH_RATIO);
    }

    const failed = await matchDrawnSketch({
      sketch: busy,
      send: async () => planFrom(busy.map((point) => north(300, point)), pathMetres(busy) * 2),
    });
    expect(failed.matched).toBe(false);
    if (!failed.matched) expect(failed.sawRoute).toBe(true);
  });
});
