import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { PENCIL_PIECE_MAX_M, snapDrawnStrokes } from '@/domain/drawStroke';
import { matchDrawnSketch, type RoutePlan } from '@/domain/findRoute';
import {
  hausdorffMetres,
  metresBetween,
  pathMetres,
  SNAP_DEVIATION_M,
  snapDetourUsable,
  type OutdoorPoint,
} from '@/domain/outdoorRoute';
import { DRAW_SNAP_NO_PATH_ALONG, DRAW_SNAP_STRAYED } from '@/domain/routeAdjust';

/**
 * Borrowash, 26 Nov 2026, build 138. A 1.1 km loop drawn between Nottingham Road and the canal.
 * The drawn line sat 1–2 cm above the finger, so the pencil ran over gardens and roofs about
 * 140 m north of the streets the finger traced. Every route call answered, but each routed piece
 * was more than 120 m from the pencil, so the old code swapped it for straight pencil chords.
 */
const origin = { latitude: 52.9046, longitude: -1.3832 };
const COS = Math.cos((origin.latitude * Math.PI) / 180);

function at(eastM: number, northM: number, from: OutdoorPoint = origin): OutdoorPoint {
  return {
    latitude: from.latitude + northM / 111_320,
    longitude: from.longitude + eastM / (111_320 * COS),
  };
}

function trace(corners: readonly OutdoorPoint[], stepM = 3): OutdoorPoint[] {
  const out: OutdoorPoint[] = [];
  for (let index = 1; index < corners.length; index += 1) {
    const a = corners[index - 1]!;
    const b = corners[index]!;
    const steps = Math.max(1, Math.round(metresBetween(a, b) / stepM));
    for (let step = 0; step < steps; step += 1) {
      out.push({
        latitude: a.latitude + ((b.latitude - a.latitude) * step) / steps,
        longitude: a.longitude + ((b.longitude - a.longitude) * step) / steps,
      });
    }
  }
  out.push({ ...corners[corners.length - 1]! });
  return out;
}

/** The streets round the block: a 1.1 km loop with a kink, like the real one. */
const streetCorners = [
  origin,
  at(180, 0),
  at(200, 60),
  at(330, 60),
  at(330, 230),
  at(120, 250),
  at(0, 230),
  origin,
];
const streets = trace(streetCorners, 5);
const OFFSET_M = 140;
/** What the pencil drew: the finger's line, 140 m higher, with a little wobble. */
const pencil = trace(streetCorners.map((point) => at(0, OFFSET_M, point))).map((point, index) => at(Math.sin(index / 7) * 4, 0, point));

function plan(points: readonly OutdoorPoint[]): RoutePlan {
  const distanceM = Math.max(1, pathMetres(points));
  return {
    mocked: false,
    mode: 'walk',
    shape: 'a_to_b',
    profile: 'foot-walking',
    distanceM,
    durationMinutes: Math.max(1, Math.round(distanceM / 80)),
    ascentM: 4,
    points: points.map((point) => ({ ...point })),
    snappedStart: null,
    snapDistanceM: null,
  };
}

/** The part of the street loop nearest each end of the request, in order: the street geometry the service returns. */
function streetsBetween(waypoints: readonly OutdoorPoint[]): OutdoorPoint[] {
  const nearest = (point: OutdoorPoint) => {
    let best = 0;
    let bestM = Number.POSITIVE_INFINITY;
    for (let index = 0; index < streets.length; index += 1) {
      const metres = metresBetween(at(0, -OFFSET_M, point), streets[index]!);
      if (metres < bestM) {
        bestM = metres;
        best = index;
      }
    }
    return best;
  };
  const from = nearest(waypoints[0]!);
  let to = nearest(waypoints[waypoints.length - 1]!);
  if (to <= from) to = streets.length - 1;
  return streets.slice(from, to + 1);
}

function offStreetMetres(points: readonly OutdoorPoint[]): number {
  let worst = 0;
  for (const point of points) {
    let best = Number.POSITIVE_INFINITY;
    for (const street of streets) best = Math.min(best, metresBetween(point, street));
    worst = Math.max(worst, best);
  }
  return worst;
}

describe('a drawn route follows the streets the service returns, not straight pencil lines', () => {
  it('keeps the routed streets when the pencil sits over the houses beside them', async () => {
    expect(hausdorffMetres(pencil, streets)).toBeGreaterThan(SNAP_DEVIATION_M);
    const result = await snapDrawnStrokes({
      strokes: [pencil],
      anchor: null,
      closeLoop: true,
      send: async (waypoints) => plan(streetsBetween(waypoints)),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matched).toBe(true);
    expect(result.strayed).toBe(true);
    expect(result.pencilM).toBe(0);
    // Every point of the green line is on a street. None is on the pencil over the roofs.
    expect(offStreetMetres(result.points)).toBeLessThan(6);
    expect(result.plan?.ascentM).not.toBeNull();
    expect(pathMetres(result.points)).toBeGreaterThan(900);
  });

  it('refuses the snap when the only path is a long way round, such as to a bridge, instead of crossing straight', async () => {
    // Parallel to the B5010 near Little Stryne: the pencil crosses the Derwent where there is no bridge.
    const across = trace([origin, at(0, 700)]);
    const bridge = trace([origin, at(1500, 0), at(1500, 700), at(0, 700)], 10);
    const piece = await matchDrawnSketch({ sketch: across, send: async () => plan(bridge) });
    expect(piece.matched).toBe(false);
    if (piece.matched || !piece.sawRoute) throw new Error('expected an answer');
    expect(piece.detour).toBeNull();
    expect(snapDetourUsable(across, bridge)).toBe(false);

    const result = await snapDrawnStrokes({ strokes: [across], anchor: null, send: async () => plan(bridge) });
    expect(result.ok).toBe(false);
    if (result.ok || result.limit) return;
    expect((result.error as Error).message).toBe(DRAW_SNAP_NO_PATH_ALONG);
  });

  it('lets only a very short piece with no path cross straight, and never a long one', async () => {
    expect(PENCIL_PIECE_MAX_M).toBeLessThanOrEqual(120);
    const short = trace([origin, at(0, 90)]);
    const farRound = trace([origin, at(900, 0), at(900, 90), at(0, 90)], 10);
    // A short piece alone is all pencil, so there is nothing snapped to keep: still refused.
    const alone = await snapDrawnStrokes({ strokes: [short], anchor: null, send: async () => plan(farRound) });
    expect(alone.ok).toBe(false);
  });

  it('accepts nearby streets as a stand-in but not a far detour', () => {
    expect(snapDetourUsable(pencil, streets)).toBe(true);
    const far = streets.map((point) => at(0, -600, point));
    expect(snapDetourUsable(streets, far)).toBe(false);
  });

  it('tells the person when part of the route uses nearby streets rather than their exact line', () => {
    expect(DRAW_SNAP_STRAYED).toBe('Snapped to paths. Part of your line had no path under it, so that part uses the nearest streets and footpaths.');
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    expect(maker).toContain('result.strayed ? DRAW_SNAP_STRAYED : DRAW_SNAPPED');
  });
});
