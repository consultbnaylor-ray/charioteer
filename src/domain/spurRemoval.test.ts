import { describe, expect, it } from 'vitest';

import { snapDrawnStrokes } from '@/domain/drawStroke';
import type { RoutePlan } from '@/domain/findRoute';
import {
  drawnLineAfterSnap,
  metresBetween,
  pathMetres,
  removeRouteSpurs,
  type OutdoorPoint,
} from '@/domain/outdoorRoute';
import { DRAW_SNAP_MOSTLY, DRAW_SNAP_NO_PATH_ALONG } from '@/domain/routeAdjust';

const origin: OutdoorPoint = { latitude: 52.906, longitude: -1.384 };

function offset(eastM: number, northM: number, from: OutdoorPoint = origin): OutdoorPoint {
  const cos = Math.cos((from.latitude * Math.PI) / 180);
  return { latitude: from.latitude + northM / 111_320, longitude: from.longitude + eastM / (111_320 * cos) };
}

/** Route-service style geometry: a vertex every `stepM` along straight legs. */
function dense(corners: readonly OutdoorPoint[], stepM = 10): OutdoorPoint[] {
  const out: OutdoorPoint[] = [];
  for (let index = 1; index < corners.length; index += 1) {
    const from = corners[index - 1]!;
    const to = corners[index]!;
    const pieces = Math.max(1, Math.round(metresBetween(from, to) / stepM));
    for (let part = 0; part < pieces; part += 1) {
      const t = part / pieces;
      out.push({
        latitude: from.latitude + (to.latitude - from.latitude) * t,
        longitude: from.longitude + (to.longitude - from.longitude) * t,
      });
    }
  }
  out.push({ ...corners[corners.length - 1]! });
  return out;
}

function nearest(line: readonly OutdoorPoint[], point: OutdoorPoint): number {
  return Math.min(...line.map((item) => metresBetween(item, point)));
}

describe('route spurs on dense route geometry', () => {
  it('drops a side-path out-and-back on a dense straight road, and keeps the road', () => {
    // South along a road, a 120 m spur east to a footpath and back, then on south.
    const junction = offset(0, -1200);
    const tip = offset(120, 0, junction);
    const routed = dense([origin, junction, tip, junction, offset(0, -2500)]);
    const cleaned = removeRouteSpurs(routed);
    expect(nearest(cleaned, tip)).toBeGreaterThan(100);
    expect(pathMetres(cleaned)).toBeCloseTo(2500, -1);
    // The straight road is not thinned into chords.
    expect(cleaned.length).toBeGreaterThan(200);
  });

  it('drops a block-long spur when the pencil strayed toward it, but not one the pencil drew', () => {
    const junction = offset(0, -1000);
    const tip = offset(260, 0, junction);
    const routed = dense([origin, junction, tip, junction, offset(0, -2000)]);
    // The hand drifted 60 m east of the road near the junction.
    const strayed = [origin, offset(60, -1000), offset(0, -2000)];
    const cleaned = removeRouteSpurs(routed, undefined, undefined, strayed);
    expect(nearest(cleaned, tip)).toBeGreaterThan(200);
    expect(pathMetres(cleaned)).toBeCloseTo(2000, -1);

    // The person drew out to the end of that path and back on purpose.
    const drawnOutAndBack = [origin, junction, tip, junction, offset(0, -2000)];
    const kept = removeRouteSpurs(routed, undefined, undefined, drawnOutAndBack);
    expect(nearest(kept, tip)).toBeLessThan(5);
  });

  it('drops several spurs and a tiny jut in one pass', () => {
    const j1 = offset(0, -800);
    const j2 = offset(0, -1600);
    const j3 = offset(0, -2400);
    const routed = dense([
      origin, j1, offset(150, 0, j1), j1, j2, offset(90, 0, j2), j2, j3, offset(-30, 30, j3), j3, offset(0, -3000),
    ]);
    const sketch = [origin, offset(40, -1600), offset(0, -3000)];
    const cleaned = removeRouteSpurs(routed, undefined, undefined, sketch);
    expect(pathMetres(cleaned)).toBeCloseTo(3000, -1);
    expect(Math.max(...cleaned.map((point) => Math.abs(point.longitude - origin.longitude)))).toBeLessThan(1e-6);
  });

  it('keeps a loop round a block and a large drawn loop', () => {
    const a = offset(0, -500);
    const block = dense([origin, a, offset(150, 0, a), offset(150, -150, a), offset(0, -150, a), offset(0, -1000)]);
    expect(removeRouteSpurs(block)).toHaveLength(block.length);

    const ring = dense([origin, offset(800, 0), offset(800, -800), offset(0, -800), origin]);
    const drawn = [origin, offset(790, 10), offset(810, -790), offset(-10, -800), origin];
    const keptRing = removeRouteSpurs(ring, undefined, undefined, drawn);
    expect(keptRing).toHaveLength(ring.length);
    expect(drawnLineAfterSnap({ sketch: drawn, routed: ring }).matched).toBe(true);

    // A small drawn lollipop: out 150 m, round a pond, and back the same way.
    const stick = offset(0, -150);
    const lolly = dense([origin, stick, offset(60, -60, stick), offset(0, -120, stick), offset(-60, -60, stick), stick, origin]);
    const drawnLolly = [origin, stick, offset(60, -60, stick), offset(0, -120, stick), offset(-60, -60, stick), stick, origin];
    expect(removeRouteSpurs(lolly, undefined, undefined, drawnLolly)).toHaveLength(lolly.length);
  });

  it('matches a strayed pencil once the spur is gone', () => {
    const junction = offset(0, -400);
    const tip = offset(140, 0, junction);
    const routed = dense([origin, junction, tip, junction, offset(0, -800)]);
    const sketch = [origin, offset(70, -400), offset(0, -800)];
    const choice = drawnLineAfterSnap({ sketch, routed });
    expect(choice.matched).toBe(true);
    expect(nearest(choice.points, tip)).toBeGreaterThan(100);
  });
});

function planOf(points: readonly OutdoorPoint[], ascentM: number | null): RoutePlan {
  const distanceM = pathMetres(points);
  return {
    mocked: false,
    mode: 'walk',
    shape: 'a_to_b',
    profile: 'foot-walking',
    distanceM,
    durationMinutes: Math.max(1, Math.round(distanceM / 80)),
    ascentM,
    points: points.map((point) => ({ ...point })),
    snappedStart: null,
    snapDistanceM: null,
  };
}

describe('snapping a long drawn line in pieces', () => {
  const stroke = Array.from({ length: 2101 }, (_, index) => offset(0, -index * 3));

  it('removes a spur where two pieces meet and adds climb from every piece', async () => {
    let calls = 0;
    const result = await snapDrawnStrokes({
      strokes: [stroke],
      anchor: null,
      send: async (waypoints) => {
        calls += 1;
        const first = waypoints[0]!;
        const last = waypoints[waypoints.length - 1]!;
        // The first piece ends with a stub east to a footpath. The next one starts by coming back.
        const stub = offset(80, 0, last);
        const points = calls === 1 ? dense([first, last, stub, last]) : dense([first, last]);
        return planOf(points, 10);
      },
    });
    expect(calls).toBeGreaterThan(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matched).toBe(true);
    expect(result.partial).toBe(false);
    expect(Math.max(...result.points.map((point) => Math.abs(point.longitude - origin.longitude)))).toBeLessThan(1e-6);
    expect(result.plan?.ascentM).toBeGreaterThanOrEqual(10 * calls - 2);
  });

  it('refuses a long piece whose route goes a long way round, instead of drawing it straight', async () => {
    expect(DRAW_SNAP_MOSTLY).toBe('Snapped to paths. A short part follows your line.');
    let calls = 0;
    const result = await snapDrawnStrokes({
      strokes: [stroke],
      anchor: null,
      send: async (waypoints) => {
        calls += 1;
        const first = waypoints[0]!;
        const last = waypoints[waypoints.length - 1]!;
        // The second piece only has a path 900 m away, like a bridge far down a river.
        if (calls === 2) return planOf(dense([first, offset(900, 0, first), offset(900, 0, last), last], 20), 5);
        return planOf(dense([first, last]), 5);
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok || result.limit) return;
    expect((result.error as Error).message).toBe(DRAW_SNAP_NO_PATH_ALONG);
  });
});
