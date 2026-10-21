import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APPLE_HEALTH_READ_TYPES } from '@/health/connection';
import { latestVo2Day, VO2_ESTIMATE_NOTE, VO2_PLAN_LABEL, VO2_STALE_NUDGE, vo2MeasuredLine, vo2ReadingIsStale } from '@/domain/vo2Estimate';
import {
  DEV_FIXTURE_ROUTE_ID,
  ROUTE_LOAD_ERROR,
  ROUTE_POINT_LIMIT,
  ROUTE_RETRY,
  buildRouteStats,
  demoRoutePoints,
  demoWorkouts,
  devFixtureEnabled,
  devFixturePoints,
  devFixtureWorkout,
  downsampleRoute,
  payloadHasRouteCoordinates,
  rejectRouteCoordinates,
  ROUTE_READ_TYPE,
  routeErrorLine,
  routeExpected,
  routeMapRegion,
} from '@/domain/workoutRoute';

function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path));
    else if (/\.(ts|tsx|sql)$/.test(name)) found.push(path);
  }
  return found;
}

describe('VO2 estimate note', () => {
  it('names the last reading and nudges only after three days', () => {
    expect(VO2_ESTIMATE_NOTE).toContain('outdoor walk, run or hike');
    expect(VO2_ESTIMATE_NOTE).toContain('No new reading means no qualifying workout yet.');
    expect(vo2MeasuredLine('2026-10-18')).toBe('Last measured 18 Oct');
    expect(vo2ReadingIsStale('2026-10-17', '2026-10-20')).toBe(false);
    expect(vo2ReadingIsStale('2026-10-16', '2026-10-20')).toBe(true);
    expect(VO2_STALE_NUDGE).toContain('more than 3 days');
    expect(VO2_PLAN_LABEL).toBe('Plan a walk or run to update it');
    expect(latestVo2Day([
      { kind: 'vo2_max', recordedOn: '2026-10-01' },
      { kind: 'steps', recordedOn: '2026-10-20' },
      { kind: 'vo2_max', recordedOn: '2026-10-18' },
    ])).toBe('2026-10-18');
  });

  it('puts the note under the chart and opens one outdoor session', () => {
    const fitness = readFileSync('src/ui/YourFitness.tsx', 'utf8');
    const board = readFileSync('src/ui/HealthStatBoard.tsx', 'utf8');
    const calendar = readFileSync('src/ui/WorkoutCalendar.tsx', 'utf8');
    const plan = readFileSync('src/app/(main)/health-plan.tsx', 'utf8');
    expect(fitness).toContain('<Vo2EstimateNote');
    expect(fitness.indexOf('Cardio fitness chart')).toBeLessThan(fitness.indexOf('<Vo2EstimateNote'));
    expect(board).toContain("tile.id === 'vo2_max'");
    expect(board).toContain('<Vo2EstimateNote');
    expect(calendar).toContain("setSessionType('outdoor')");
    expect(calendar).toContain("setDurationText('30')");
    expect(calendar).toContain('nextSessionClock(today)');
    expect(plan).toContain('planOutdoorNonce={outdoorNonce}');
    expect(readFileSync('src/domain/plannedSession.ts', 'utf8')).toContain("outdoor: 'Run/Walk (outdoor)'");
    expect(readFileSync('src/ui/WorkoutCalendar.tsx', 'utf8')).not.toMatch(/runna|week plan|distance programme/i);
  });
});

describe('workout routes stay on the phone', () => {
  const walk = demoWorkouts(new Date('2026-10-20T12:00:00.000Z'))[0];

  it('builds kilometre splits with pace, heart rate, and elevation', () => {
    expect(routeExpected(52, false)).toBe(true);
    expect(routeExpected(52, true)).toBe(false);
    expect(routeExpected(50, false)).toBe(false);
    const points = demoRoutePoints(walk.startedAt);
    const stats = buildRouteStats({
      points,
      unit: 'km',
      durationSeconds: walk.durationMinutes * 60,
      energyKcal: walk.energyKcal,
      averageHeartRate: walk.averageHeartRate,
    });
    expect(stats.splits.length).toBeGreaterThanOrEqual(3);
    expect(stats.splits[0]?.label).toBe('1 km');
    expect(stats.splits[0]?.paceLabel).toMatch(/^\d+:\d\d \/ km$/);
    expect(stats.splits[0]?.heartRate).toBeGreaterThan(30);
    expect(stats.distanceLabel).toMatch(/^Distance \d/);
    expect(stats.durationLabel).toContain('Duration');
    expect(stats.heartLabel).toBe('Average heart rate 136 bpm');
    expect(stats.calorieLabel).toBe('Calories 210 kcal');
    expect(Number.isFinite(stats.splits[0]?.elevationMetres)).toBe(true);
    const miles = buildRouteStats({ points, unit: 'mile', durationSeconds: walk.durationMinutes * 60 });
    expect(miles.splits[0]?.label).toBe('1 mi');
    expect(miles.paceLabel).toContain('/ mi');
  });

  it('refuses route coordinates in a network payload', () => {
    const points = demoRoutePoints(walk.startedAt);
    expect(payloadHasRouteCoordinates({ samples: [{ kind: 'workout_minutes', value: 30 }] })).toBe(false);
    expect(payloadHasRouteCoordinates({ content: 'hello', mode: 'plan' })).toBe(false);
    expect(payloadHasRouteCoordinates({ route: points })).toBe(true);
    expect(() => rejectRouteCoordinates(points)).toThrow(/stay on this iPhone/);
    expect(() => rejectRouteCoordinates({ kind: 'vo2_max', value: 42 })).not.toThrow();
  });

  it('does not send a route from the repositories, sharing, or edge functions', () => {
    const watched = [
      ...filesUnder('src/data'),
      ...filesUnder('supabase/functions'),
      ...filesUnder('src/domain').filter((path) => !path.endsWith('workoutRoute.ts') && !path.endsWith('.test.ts')),
    ];
    for (const path of watched) {
      const source = readFileSync(path, 'utf8');
      expect(source, path).not.toMatch(/getWorkoutRoutes|HKWorkoutRoute|latitude|longitude/);
    }
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const demo = readFileSync('src/data/demo-repository.ts', 'utf8');
    expect(repo).toContain('rejectRouteCoordinates(samples)');
    expect(repo).toContain('rejectRouteCoordinates(thumosBody)');
    expect(repo).toContain('rejectRouteCoordinates(body)');
    expect(demo).toContain('rejectRouteCoordinates(samples)');
    expect(APPLE_HEALTH_READ_TYPES).not.toContain(ROUTE_READ_TYPE);
    const sync = readFileSync('src/health/sync.ios.ts', 'utf8');
    expect(sync).not.toContain('getWorkoutRoutes');
    expect(sync).not.toContain(ROUTE_READ_TYPE);
    const reader = readFileSync('src/health/workoutRoute.ios.ts', 'utf8');
    expect(reader).toContain('getWorkoutRoutes');
    expect(reader).toContain('requestAuthorization({ toRead: [ROUTE_READ_TYPE] })');
    expect(reader.indexOf('!known.routeExpected')).toBeLessThan(reader.indexOf('requestAuthorization({ toRead: [ROUTE_READ_TYPE] })'));
    expect(reader.indexOf('listDeviceWorkouts')).toBeLessThan(reader.indexOf('requestAuthorization({ toRead: [ROUTE_READ_TYPE] })'));
    const screen = readFileSync('src/app/(main)/workout/[id].tsx', 'utf8');
    const list = readFileSync('src/ui/WorkoutList.tsx', 'utf8');
    const calendar = readFileSync('src/ui/WorkoutCalendar.tsx', 'utf8');
    expect(list).toContain('/workout/');
    expect(calendar).toContain('View route');
    expect(screen).toContain('<RouteMap');
    expect(screen).toContain('Kilometres');
    expect(screen).toContain('Miles');
    const map = readFileSync('src/ui/RouteMap.ios.tsx', 'utf8');
    expect(map).toContain('mapType="mutedStandard"');
    expect(map).not.toContain('PROVIDER_GOOGLE');
    expect(map).not.toMatch(/^import .*(react-native-maps)/m);
    expect(map).toContain("require('react-native-maps')");
    expect(map.indexOf('routeMapRegion')).toBeLessThan(map.indexOf('<MapView'));
    expect(map.indexOf('if (!region || line.length < 2) return null')).toBeLessThan(map.indexOf('<MapView'));
    expect(map.indexOf('onMapReady')).toBeLessThan(map.indexOf('<Polyline'));
    expect(map).toContain('mapReady ? <Polyline');
    expect(readFileSync('app.json', 'utf8')).toContain('react-native-maps');
    expect(screen).toContain('RouteBoundary');
    expect(screen).toContain('ROUTE_LOAD_ERROR');
    expect(screen).toContain('ROUTE_RETRY');
    expect(ROUTE_LOAD_ERROR).toBe("Route couldn't be loaded");
    expect(ROUTE_RETRY).toBe('Try again');
    expect(screen).toContain("logClientError('workout-route'");
    expect(screen).toContain('routeErrorLine');
    expect(screen).not.toMatch(/logClientError\([^)]*points/);
    const boundary = readFileSync('src/ui/RouteBoundary.tsx', 'utf8');
    expect(boundary).toContain('getDerivedStateFromError');
    expect(boundary).toContain('ROUTE_LOAD_ERROR');
    expect(boundary).toContain('routeErrorLine');
    expect(boundary).not.toContain('error.stack');
    expect(boundary).not.toContain('componentStack');
    expect(reader).toContain('downsampleRoute');
    expect(reader).toContain('DEV_FIXTURE_ROUTE_ID');
    expect(reader).toContain('devFixtureEnabled()');
    expect(reader.indexOf('id === DEV_FIXTURE_ROUTE_ID && devFixtureEnabled()')).toBeLessThan(reader.indexOf('requestAuthorization({ toRead: [ROUTE_READ_TYPE] })'));
    const native = readFileSync('node_modules/@kingstinct/react-native-healthkit/ios/WorkoutProxy.swift', 'utf8');
    const locations = native.slice(native.indexOf('func getRouteLocations'), native.indexOf('func serializeLocation'));
    expect(locations).toContain('cappedRouteLocations');
    expect(locations).toContain('guard !hasFinished');
    expect(locations).toContain('DispatchQueue.main.async');
    expect(locations).not.toContain('Unexpected empty response');
    expect(readFileSync('patches/@kingstinct+react-native-healthkit+16.1.0.patch', 'utf8')).toContain('cappedRouteLocations');
    expect(readFileSync('src/domain/profileSharing.ts', 'utf8')).not.toMatch(/latitude|longitude|route/);
  });

  it('downsamples a long walk, drops bad coordinates, and keeps the log free of the path', () => {
    const started = Date.parse('2026-10-18T10:16:00.000Z');
    const many = Array.from({ length: 2400 }, (_, index) => ({
      latitude: 51.5 + index * 0.00001,
      longitude: -0.12 - index * 0.00001,
      altitude: 10,
      at: new Date(started + index * 1000).toISOString(),
      heartRate: null,
    }));
    many.splice(10, 0, { latitude: Number.NaN, longitude: -0.12, altitude: 0, at: new Date(started).toISOString(), heartRate: null });
    const drawn = downsampleRoute(many);
    expect(drawn).toHaveLength(ROUTE_POINT_LIMIT);
    expect(drawn[0]?.latitude).toBeCloseTo(51.5, 5);
    expect(drawn.at(-1)?.latitude).toBeCloseTo(51.5 + 2399 * 0.00001, 5);
    expect(drawn.every((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))).toBe(true);
    expect(routeMapRegion([])).toBeNull();
    expect(routeMapRegion([many[0]])).toBeNull();
    expect(routeMapRegion([{ ...many[0], latitude: Number.NaN }])).toBeNull();
    const region = routeMapRegion(drawn);
    expect(region?.latitudeDelta).toBeGreaterThan(0);
    expect(region && Object.values(region).every((value) => Number.isFinite(value))).toBe(true);
    const leaked = routeErrorLine(new Error('AIRMap failed at latitude 51.50740 longitude -0.12800'));
    expect(leaked).not.toMatch(/51\.50740|-0\.12800|latitude|longitude/);
    expect(leaked).not.toContain('at RouteMap');
    expect(routeErrorLine(new Error('   '))).toBe('Unknown error');
    expect(() => rejectRouteCoordinates(devFixturePoints())).toThrow(/stay on this iPhone/);
    expect(devFixtureEnabled(false)).toBe(false);
    expect(devFixtureEnabled(true)).toBe(true);
    expect(devFixtureWorkout().id).toBe(DEV_FIXTURE_ROUTE_ID);
    expect(devFixtureWorkout().label).toBe('Walking');
    expect(devFixtureWorkout().durationMinutes).toBe(109);
    expect(devFixtureWorkout().distanceMetres).toBe(6300);
    expect(devFixturePoints().length).toBeGreaterThan(2);
  });
});
