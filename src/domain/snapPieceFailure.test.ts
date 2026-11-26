import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildDrawSnapRequests, PENCIL_PIECE_MAX_M, snapDrawnStrokes } from '@/domain/drawStroke';
import { UserFacingError } from '@/domain/errors';
import { ROUTE_RATE_LIMITED, ROUTE_UNAVAILABLE, type RoutePlan } from '@/domain/findRoute';
import type { OutdoorPoint } from '@/domain/outdoorRoute';
import { DRAW_SNAP_SERVICE_GAP } from '@/domain/routeAdjust';

/** A finger line with a sample every couple of metres, like the phone records. */
function finger(corners: OutdoorPoint[], stepM = 3): OutdoorPoint[] {
  const out: OutdoorPoint[] = [];
  for (let index = 1; index < corners.length; index += 1) {
    const a = corners[index - 1]!;
    const b = corners[index]!;
    const metres = Math.hypot((b.latitude - a.latitude) * 111_320, (b.longitude - a.longitude) * 111_320 * 0.6);
    const steps = Math.max(1, Math.round(metres / stepM));
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

const start = { latitude: 52.8935, longitude: -1.3985 };
/** A loop round the park, then up to the town and back down the same line twice, like the 8.8 km sketch. */
const doubledBack = finger([
  start,
  { latitude: 52.888, longitude: -1.404 },
  { latitude: 52.882, longitude: -1.398 },
  { latitude: 52.885, longitude: -1.388 },
  { latitude: 52.89, longitude: -1.389 },
  start,
  { latitude: 52.905, longitude: -1.392 },
  { latitude: 52.91, longitude: -1.394 },
  { latitude: 52.905, longitude: -1.3921 },
  { latitude: 52.8936, longitude: -1.3986 },
  { latitude: 52.905, longitude: -1.3919 },
  { latitude: 52.9101, longitude: -1.3941 },
  { latitude: 52.9049, longitude: -1.392 },
  { latitude: 52.8934, longitude: -1.3984 },
]);
const here = { latitude: 52.9001, longitude: -1.4 };

function planFor(waypoints: readonly OutdoorPoint[]): RoutePlan {
  return {
    mocked: false,
    mode: 'walk',
    shape: 'a_to_b',
    profile: 'foot-walking',
    distanceM: 1000,
    durationMinutes: 12,
    ascentM: 5,
    points: waypoints.map((point) => ({ ...point })),
    snappedStart: null,
    snapDistanceM: null,
  };
}

const unavailable = () => new UserFacingError(ROUTE_UNAVAILABLE, 'generic');

describe('a drawn route when one call to the route service fails', () => {
  it('splits the long doubled-back sketch into pieces the service accepts', () => {
    const built = buildDrawSnapRequests([doubledBack], here, true);
    expect(built.limit).toBe(false);
    expect(built.requests[0]?.routedGap).toBe(true);
    expect(built.requests.filter((request) => !request.routedGap).length).toBeGreaterThanOrEqual(3);
    expect(built.requests.every((request) => request.waypoints.length >= 2 && request.waypoints.length <= 25)).toBe(true);
  });

  it('asks once more when the service misses a piece, so a brief blip still snaps every piece', async () => {
    const built = buildDrawSnapRequests([doubledBack], here, true);
    let calls = 0;
    const result = await snapDrawnStrokes({
      strokes: [doubledBack],
      anchor: here,
      closeLoop: true,
      send: async (waypoints) => {
        calls += 1;
        if (calls === 1) throw unavailable();
        return planFor(waypoints);
      },
    });
    expect(calls).toBe(built.requests.length + 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.serviceMissed).toBe(false);
    expect(result.matched).toBe(true);
    expect(result.pencilM).toBe(0);
    expect(result.points[0]).toEqual(here);
  });

  it('refuses the snap, rather than drawing a long straight line, when a long piece keeps failing', async () => {
    let calls = 0;
    const result = await snapDrawnStrokes({
      strokes: [doubledBack],
      anchor: null,
      closeLoop: true,
      send: async (waypoints) => {
        calls += 1;
        if (calls === 2 || calls === 3) throw unavailable();
        return planFor(waypoints);
      },
    });
    expect(calls).toBe(3);
    expect(result.ok).toBe(false);
    if (result.ok || result.limit) return;
    expect((result.error as Error).message).toBe(ROUTE_UNAVAILABLE);
  });

  it('lets a short piece that keeps failing follow the pencil, and says so', async () => {
    // Two strokes 60 m apart. The 60 m join is its own call, and that call keeps failing.
    const west = finger([start, { latitude: start.latitude, longitude: start.longitude + 0.009 }]);
    const eastStart = { latitude: start.latitude, longitude: start.longitude + 0.0099 };
    const east = finger([eastStart, { latitude: start.latitude, longitude: start.longitude + 0.019 }]);
    const built = buildDrawSnapRequests([west, east], null);
    const gapIndex = built.requests.findIndex((request) => request.routedGap);
    expect(gapIndex).toBe(1);
    let calls = 0;
    const result = await snapDrawnStrokes({
      strokes: [west, east],
      anchor: null,
      send: async (waypoints) => {
        calls += 1;
        if (calls === 2 || calls === 3) throw unavailable();
        return planFor(waypoints);
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.serviceMissed).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.matched).toBe(false);
    expect(result.pencilM).toBeGreaterThan(40);
    expect(result.pencilM).toBeLessThanOrEqual(PENCIL_PIECE_MAX_M);
  });

  it('stops after two failures before anything snapped, so a down service is not asked again and again', async () => {
    let calls = 0;
    const result = await snapDrawnStrokes({
      strokes: [doubledBack],
      anchor: here,
      closeLoop: true,
      send: async () => {
        calls += 1;
        throw unavailable();
      },
    });
    expect(calls).toBe(2);
    expect(result.ok).toBe(false);
    if (result.ok || result.limit) return;
    expect((result.error as Error).message).toBe(ROUTE_UNAVAILABLE);
  });

  it('stops at once on a rate limit', async () => {
    let calls = 0;
    const result = await snapDrawnStrokes({
      strokes: [doubledBack],
      anchor: here,
      closeLoop: true,
      send: async () => {
        calls += 1;
        throw new UserFacingError(ROUTE_RATE_LIMITED, 'generic');
      },
    });
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
  });

  it('still reports the failure when the only piece fails', async () => {
    const short = finger([start, { latitude: 52.896, longitude: -1.398 }]);
    const result = await snapDrawnStrokes({
      strokes: [short],
      anchor: null,
      send: async () => {
        throw unavailable();
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok || result.limit) return;
    expect((result.error as Error).message).toBe(ROUTE_UNAVAILABLE);
  });

  it('keeps the plain pencil-part wording, and the drawing screen no longer shows a pencil line as the route', () => {
    expect(DRAW_SNAP_SERVICE_GAP).toBe('Snapped to paths. The route service missed one part, so that part follows your line.');
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    expect(maker).toContain('snapDrawnIntent');
    expect(maker).not.toContain('unmatchedDrawnPlan');
  });
});
