import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ROUTE_DISTANCE_NOTE, ROUTE_RETRACE_NOTE, loopNoteLine, parseRoutePlan } from '@/domain/findRoute';
import {
  LOOP_ATTEMPT_CAP,
  LOOP_LENGTH_TOLERANCE,
  LOOP_RETRACE_LIMIT,
  ORS_DIRECTIONS_DAILY_BUDGET,
  ORS_FREE_DIRECTIONS_PER_DAY,
  buildDirectionsBody,
  chooseLoopCandidate,
  loopCandidateReady,
  nextLoopRequest,
  retraceRatio,
  routeLengthM,
  withinGlobalRouteLimit,
} from '../../supabase/functions/_shared/orsRoute';

const start = { latitude: 51.4504, longitude: -2.5945 };

/** A straight north line. Step is metres. This is a shape, not a place. */
function north(metres: number, step: number, east = 0): { latitude: number; longitude: number }[] {
  const points = [];
  for (let walked = 0; walked <= metres; walked += step) {
    points.push({
      latitude: 51 + walked / 111_320,
      longitude: -2 + east / (111_320 * Math.cos((51 * Math.PI) / 180)),
    });
  }
  return points;
}

function outAndBack(): { latitude: number; longitude: number }[] {
  const out = north(400, 80);
  return [...out, ...[...out].reverse().slice(1)];
}

function shift(northM: number, eastM: number): { latitude: number; longitude: number } {
  return {
    latitude: 51 + northM / 111_320,
    longitude: -2 + eastM / (111_320 * Math.cos((51 * Math.PI) / 180)),
  };
}

/** A square loop. Opposite sides are 400 m apart, so they are not a retrace. */
function cleanSquare(): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let northM = 0;
  let eastM = 0;
  const legs: [number, number][] = [[400, 0], [0, 400], [-400, 0], [0, -400]];
  points.push(shift(0, 0));
  for (const [northLeg, eastLeg] of legs) {
    for (let step = 1; step <= 5; step += 1) {
      points.push(shift(northM + (northLeg * step) / 5, eastM + (eastLeg * step) / 5));
    }
    northM += northLeg;
    eastM += eastLeg;
  }
  return points;
}

describe('loop length', () => {
  it('asks OpenRouteService for the chosen metres and can fix the seed', () => {
    const body = buildDirectionsBody({ mode: 'walk', shape: 'loop', start, lengthM: 8000, seed: 1 });
    expect(body?.options).toEqual({ round_trip: { length: 8000, points: 5, seed: 1 } });
    expect(buildDirectionsBody({ mode: 'walk', shape: 'loop', start, lengthM: 8000 })?.options).toEqual({
      round_trip: { length: 8000, points: 5 },
    });
    expect(routeLengthM({ mode: 'walk', distanceM: 8000, minutes: 30 })).toBe(8000);
  });

  it('keeps a loop near the asked distance and says when none is', () => {
    const clean = { distanceM: 8400, points: cleanSquare() };
    const far = { distanceM: 19000, points: cleanSquare() };
    expect(Math.abs(19000 - 8000) / 8000).toBeGreaterThan(LOOP_LENGTH_TOLERANCE);
    const picked = chooseLoopCandidate(8000, [far, clean]);
    expect(picked?.choice.distanceM).toBe(8400);
    expect(picked?.note).toBeNull();
    const onlyFar = chooseLoopCandidate(8000, [far, { distanceM: 17000, points: cleanSquare() }]);
    expect(onlyFar?.choice.distanceM).toBe(17000);
    expect(onlyFar?.note).toBe('distance');
    expect(loopNoteLine('distance')).toBe(ROUTE_DISTANCE_NOTE);
    expect(loopNoteLine('retrace')).toBe(ROUTE_RETRACE_NOTE);
    expect(loopNoteLine('other')).toBeNull();
    expect(JSON.stringify(ROUTE_DISTANCE_NOTE)).not.toMatch(/postcode/i);
    expect(JSON.stringify(ROUTE_RETRACE_NOTE)).not.toMatch(/postcode/i);
  });

  it('prefers a line that does not run back over itself', () => {
    const doubled = outAndBack();
    const square = cleanSquare();
    expect(retraceRatio(doubled)).toBeGreaterThan(LOOP_RETRACE_LIMIT);
    expect(retraceRatio(square)).toBeLessThan(LOOP_RETRACE_LIMIT);
    const picked = chooseLoopCandidate(8000, [
      { distanceM: 8000, points: doubled },
      { distanceM: 9000, points: square },
    ]);
    expect(picked?.choice.distanceM).toBe(9000);
    expect(picked?.note).toBeNull();
    const stillDoubled = chooseLoopCandidate(8000, [
      { distanceM: 8100, points: doubled },
      { distanceM: 8600, points: doubled },
    ]);
    expect(stillDoubled?.note).toBe('retrace');
    expect(loopCandidateReady(8000, { distanceM: 8400, points: square })).toBe(true);
    expect(loopCandidateReady(8000, { distanceM: 19000, points: square })).toBe(false);
    expect(loopCandidateReady(8000, { distanceM: 8000, points: doubled })).toBe(false);
  });

  it('scales the next length from the stretch and stops after the cap', () => {
    expect(nextLoopRequest(8000, 19000, 8000, 1)).toEqual({ lengthM: 3368, seed: 2 });
    expect(nextLoopRequest(8000, 8400, 3368, 2)).toEqual({ lengthM: 3368, seed: 3 });
    expect(nextLoopRequest(8000, 100, 8000, 1)?.lengthM).toBe(routeLengthM({ mode: 'walk', distanceM: 640_000 }));
    expect(LOOP_ATTEMPT_CAP).toBe(3);
    expect(ORS_DIRECTIONS_DAILY_BUDGET).toBeLessThan(ORS_FREE_DIRECTIONS_PER_DAY);
    const now = 1_000_000_000_000;
    const spent = Array.from({ length: ORS_DIRECTIONS_DAILY_BUDGET }, (_, index) => now - index);
    expect(withinGlobalRouteLimit(spent, now, ORS_DIRECTIONS_DAILY_BUDGET).ok).toBe(false);
    const fn = readFileSync('supabase/functions/outdoor-route/index.ts', 'utf8');
    expect(fn).toContain('calls < LOOP_ATTEMPT_CAP');
    expect(fn).toContain('loopNote: loop.note');
    expect(fn).toContain('ORS_DIRECTIONS_DAILY_BUDGET');
    expect(fn).toContain('buildDirectionsBody({ mode, shape, start, end, lengthM: lengthM ?? 0, via: vias })');
    expect(fn).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*(latitude|longitude|postcode)/);
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    expect(maker).toContain('loopNoteLine(plan.loopNote)');
    const plan = parseRoutePlan({
      ok: true,
      mocked: false,
      mode: 'walk',
      shape: 'loop',
      profile: 'foot-walking',
      distanceM: 19000,
      durationMinutes: 240,
      ascentM: 611,
      points: [start, { latitude: start.latitude + 0.01, longitude: start.longitude }],
      loopNote: 'distance',
    });
    expect(plan?.distanceM).toBe(19000);
    expect(plan?.loopNote).toBe('distance');
    expect(plan?.ascentM).toBe(611);
    expect(parseRoutePlan({ ...plan, ok: true, loopNote: 'nope' })?.loopNote).toBeNull();
  });
});
