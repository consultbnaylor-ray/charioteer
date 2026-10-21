import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APPLE_HEALTH_READ_TYPES } from '@/health/connection';
import { parseBuddyShare, projectBuddyShare } from '@/domain/buddies';
import { HEALTH_KINDS } from '@/domain/healthInsights';
import type { HealthPlan } from '@/domain/healthPlan';
import { chatPreview, messageFromRealtime } from '@/domain/liveChat';
import { defaultNutritionSettings } from '@/domain/nutrition';
import { defaultProfileSharing, parsePublicProfile, projectPublicProfile, type ProfileSharing, type ShareSource } from '@/domain/profileSharing';
import { omitSharedLocation, scrubSharedText } from '@/domain/sharedPayload';
import { latestVo2Day, VO2_ESTIMATE_NOTE, VO2_PLAN_LABEL, VO2_STALE_NUDGE, vo2MeasuredLine, vo2ReadingIsStale } from '@/domain/vo2Estimate';
import { messageAlert } from '../../supabase/functions/_shared/messagePush';
import {
  DEV_FIXTURE_ROUTE_ID,
  ROUTE_LOAD_ERROR,
  ROUTE_MAP_TIMEOUT,
  ROUTE_MAP_TIMEOUT_MS,
  ROUTE_POINT_LIMIT,
  ROUTE_READ_TIMEOUT,
  ROUTE_READING,
  ROUTE_RETRY,
  buildRouteStats,
  routeSummaryLine,
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
    expect(routeSummaryLine(walk)).toBe('Distance 3.2 km · Duration 33 min · Average pace 10:19 / km · Average heart rate 136 bpm');
    expect(routeSummaryLine({ ...walk, routeExpected: false })).toBeNull();
    expect(routeSummaryLine({ ...walk, averageHeartRate: null })).toBe('Distance 3.2 km · Duration 33 min · Average pace 10:19 / km');
    expect(routeSummaryLine(walk, 'mile')).toContain('Average pace');
    expect(routeSummaryLine(walk, 'mile')).toContain('/ mi');
    expect(routeSummaryLine(devFixtureWorkout())).toBe('Distance 6.3 km · Duration 109 min · Average pace 17:18 / km · Average heart rate 112 bpm');
  });

  it('refuses route coordinates in a network payload', () => {
    const points = demoRoutePoints(walk.startedAt);
    expect(payloadHasRouteCoordinates({ samples: [{ kind: 'workout_minutes', value: 30 }] })).toBe(false);
    expect(payloadHasRouteCoordinates({ content: 'hello', mode: 'plan' })).toBe(false);
    expect(payloadHasRouteCoordinates({ content: 'Distance 3.2 km · Duration 33 min · Average pace 10:19 / km' })).toBe(false);
    expect(payloadHasRouteCoordinates({ route: points })).toBe(true);
    expect(payloadHasRouteCoordinates({ latitude: '51.5074' })).toBe(true);
    expect(payloadHasRouteCoordinates({ startLocation: 'Hyde Park', endLocation: 'Serpentine' })).toBe(true);
    expect(payloadHasRouteCoordinates({ points: [[51.5074, -0.1278]] })).toBe(true);
    expect(() => rejectRouteCoordinates(points)).toThrow(/stay on this iPhone/);
    expect(() => rejectRouteCoordinates({ startLocation: 'Hyde Park' })).toThrow(/stay on this iPhone/);
    expect(() => rejectRouteCoordinates({ kind: 'vo2_max', value: 42 })).not.toThrow();
    expect(() => rejectRouteCoordinates({ content: 'Distance 3.2 km · Duration 33 min · Average pace 10:19 / km' })).not.toThrow();
  });

  it('keeps coordinates out of shared profiles, buddy shares, and messages', () => {
    const stats = 'Distance 3.2 km · Duration 33 min · Average pace 10:19 / km';
    const place = 'Meet at 51.50740, -0.12780 after the start location Hyde Park.';
    const plan: HealthPlan = {
      focus: [
        { id: 'pace', text: stats, done: true },
        { id: 'place', text: place, done: false },
      ],
      nutrition: { targets: '', habits: [], swaps: [] },
      fitness: { intro: '', sessions: [] },
      wellbeing: { habits: [] },
      limits: 'Start location Serpentine 51.50740, -0.12780',
      disclaimer: '',
      updatedAt: '2026-10-21T12:00:00.000Z',
    };
    const samples = [
      {
        kind: 'workout_minutes',
        value: 33,
        recordedOn: '2026-10-20',
        latitude: 51.5074,
        longitude: -0.1278,
        startLocation: 'Hyde Park',
        endLocation: 'Serpentine',
        route: [{ latitude: 51.5074, longitude: -0.1278 }],
      },
    ];
    expect(payloadHasRouteCoordinates(samples)).toBe(true);
    const sharing: ProfileSharing = {
      ...defaultProfileSharing(),
      healthKinds: [...HEALTH_KINDS],
      healthPlan: true,
      gratitudeIds: ['g1', 'g2'],
      visionIds: ['v1'],
      town: true,
    };
    const source: ShareSource = {
      now: new Date('2026-10-21T12:00:00.000Z'),
      today: '2026-10-21',
      displayName: 'Alex Hart',
      bio: 'Gym most mornings.',
      town: 'Bristol',
      stage: 'stopped',
      sobrietyStartedAt: null,
      weeklySpendGbp: null,
      weeklyUnits: null,
      interestLabels: ['Hiking'],
      reasons: [],
      checkIns: [],
      health: samples as ShareSource['health'],
      gratitude: [
        { id: 'g1', body: 'Window light', entryDate: '2026-10-21', photos: [] },
        { id: 'g2', body: place, entryDate: '2026-10-21', photos: [] },
      ],
      vision: [{ id: 'v1', caption: stats, area: null }],
      progressPhotos: [],
      pinnedQuoteId: null,
      healthPlan: plan,
    };
    const view = projectPublicProfile(source, sharing);
    const buddy = projectBuddyShare({
      ownerId: 'alex',
      displayName: 'Alex Hart',
      today: '2026-10-21',
      nutrition: defaultNutritionSettings(),
      foodLogs: [],
      checkIns: [{ mood: 6, createdAt: '2026-10-21T08:00:00.000Z' }],
      gratitude: [{ body: 'Window light' }, { body: place }],
      visionStatement: stats,
      visionCaptions: [],
      healthPlan: plan,
      health: samples as { kind: string; value: number; recordedOn: string }[],
      bodyFatPct: null,
      leanMassKg: null,
      waistCm: null,
    }, {
      meals: true,
      calories: true,
      quality: true,
      goal: true,
      progress: true,
      checkIns: true,
      gratitude: true,
      vision: true,
      healthPlan: true,
      healthData: true,
    });
    const parsed = parsePublicProfile({
      displayName: 'Alex Hart',
      town: 'Bristol',
      latitude: 51.5074,
      longitude: -0.1278,
      startLocation: 'Hyde Park',
      endLocation: 'Serpentine',
      route: samples[0]?.route,
      health: ['Workouts average 33 min', stats, place],
      healthTrends: [{ kind: 'workout_minutes', points: [{ day: '2026-10-20', value: 33, latitude: 51.5074, longitude: -0.1278 }] }],
      healthPlan: plan,
    });
    const parsedBuddy = parseBuddyShare({
      ownerId: 'alex',
      displayName: 'Alex Hart',
      latitude: 51.5074,
      longitude: -0.1278,
      route: samples[0]?.route,
      gratitude: ['Window light', place],
      healthPlan: plan,
      healthData: ['Workouts average 33 min', stats, place],
    }, '2026-10-21');
    for (const payload of [view, buddy, parsed, parsedBuddy]) {
      const packed = JSON.stringify(payload);
      expect(packed).not.toMatch(/latitude|longitude|startLocation|endLocation|start_location|end_location/i);
      expect(packed).not.toMatch(/51\.5074|-0\.1278|51\.50740|-0\.12800|Hyde Park|Serpentine/);
      expect(packed).not.toMatch(/View route|RouteMap/);
      expect(payloadHasRouteCoordinates(payload)).toBe(false);
      expect(packed).toContain(stats);
    }
    expect(view.town).toBe('Bristol');
    expect(view.health.join(' ')).toContain('33 min');
    expect(JSON.stringify(view)).toContain('Window light');
    expect(JSON.stringify(view)).not.toContain('Serpentine');
    expect(scrubSharedText(stats)).toBe(stats);
    expect(omitSharedLocation(place)).not.toMatch(/51\.50740|Hyde Park/);
    const kept = messageFromRealtime({
      id: 'm1',
      connection_id: '11111111-1111-4111-8111-111111111111',
      sender_id: 'alex',
      body: `${stats} ${place}`,
      created_at: '2026-10-21T12:00:00.000Z',
    });
    expect(kept?.body).toContain(stats);
    expect(kept?.body).not.toMatch(/51\.50740|Hyde Park/);
    expect(messageFromRealtime({
      id: 'm2',
      connection_id: '11111111-1111-4111-8111-111111111111',
      sender_id: 'alex',
      body: '51.50740, -0.12780',
      created_at: '2026-10-21T12:00:00.000Z',
    })).toBeNull();
    expect(chatPreview(`${stats}\n${place}`)).toContain('3.2 km');
    expect(chatPreview(`${stats}\n${place}`)).not.toMatch(/51\.50740/);
    const alert = messageAlert({
      senderId: 'alex',
      recipientId: 'jordan',
      connectionId: '11111111-1111-4111-8111-111111111111',
      connectionAccepted: true,
      messageBody: place,
      recipientCommunityOn: true,
      senderCommunityOn: true,
      blocked: false,
      notificationsOn: true,
      showSenderName: true,
      senderName: 'Alex',
    });
    expect(alert.ok).toBe(true);
    if (alert.ok) {
      expect(JSON.stringify(alert)).not.toMatch(/51\.50740|Hyde Park|latitude/);
      expect(alert.data).toEqual({ connectionId: '11111111-1111-4111-8111-111111111111' });
    }
    expect(readFileSync('src/data/supabase-repository.ts', 'utf8')).toContain('omitSharedLocation(body.trim()');
    expect(readFileSync('src/data/demo-repository.ts', 'utf8')).toContain('omitSharedLocation(body.trim()');
    expect(readFileSync('src/app/(main)/chat/[id].tsx', 'utf8')).toContain('omitSharedLocation(message.body');
  });

  it('keeps route links on the owner screens only', () => {
    const allowed = new Set([
      'src/ui/WorkoutList.tsx',
      'src/ui/WorkoutCalendar.tsx',
      'src/ui/RouteMap.tsx',
      'src/ui/RouteMap.ios.tsx',
      'src/app/(main)/health-plan.tsx',
      'src/app/(main)/workout/[id].tsx',
    ]);
    for (const path of [...filesUnder('src/ui'), ...filesUnder('src/app')]) {
      const source = readFileSync(path, 'utf8');
      if (path.endsWith('health-plan.tsx')) {
        expect(source).toContain('WorkoutList');
        expect(source).toContain('WorkoutCalendar');
      } else if (!path.endsWith('WorkoutList.tsx') && !path.endsWith('WorkoutCalendar.tsx')) {
        expect(source, path).not.toContain('WorkoutList');
        expect(source, path).not.toContain('WorkoutCalendar');
      }
      if (allowed.has(path)) continue;
      expect(source, path).not.toMatch(/View route|RouteMap|routeSummaryLine|readDeviceRoute|latitude|longitude/);
    }
    for (const path of filesUnder('supabase/migrations')) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/latitude|longitude/);
    }
    expect(readFileSync('src/app/(main)/workout/[id].tsx', 'utf8')).toContain('readDeviceRoute');
    expect(readFileSync('src/ui/WorkoutList.tsx', 'utf8')).toContain('View route');
    expect(readFileSync('src/ui/WorkoutCalendar.tsx', 'utf8')).toContain('View route');
  });

  it('does not send a route from the repositories, sharing, or edge functions', () => {
    const watched = [
      ...filesUnder('src/data'),
      ...filesUnder('supabase/functions'),
      ...filesUnder('src/domain').filter((path) => !path.endsWith('workoutRoute.ts') && !path.endsWith('sharedPayload.ts') && !path.endsWith('.test.ts')),
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
    expect(screen.indexOf('<Screen')).toBeLessThan(screen.indexOf('<RouteBoundary'));
    expect(screen).toContain('label="Back"');
    expect(screen).toContain('ROUTE_READING');
    expect(screen).toContain('ROUTE_MAP_TIMEOUT_MS');
    expect(screen).toContain('ROUTE_READ_TIMEOUT');
    expect(screen).toContain('onProblem={report}');
    expect(screen).not.toMatch(/if \(!ready\) return null/);
    expect(map).toContain('ROUTE_MAP_TIMEOUT');
    expect(map.indexOf('try {')).toBeLessThan(map.indexOf("require('react-native-maps')"));
    expect(ROUTE_MAP_TIMEOUT_MS).toBe(10_000);
    expect(ROUTE_READING).toBe('Reading the route on this iPhone.');
    expect(routeErrorLine(ROUTE_MAP_TIMEOUT)).toBe(ROUTE_MAP_TIMEOUT);
    expect(routeErrorLine(ROUTE_READ_TIMEOUT)).toBe(ROUTE_READ_TIMEOUT);
    expect(routeErrorLine(new Error(`${ROUTE_MAP_TIMEOUT} latitude 51.50740`))).not.toMatch(/51\.50740|latitude/);
    const boundary = readFileSync('src/ui/RouteBoundary.tsx', 'utf8');
    expect(boundary).toContain('getDerivedStateFromError');
    expect(boundary).toContain('ROUTE_LOAD_ERROR');
    expect(boundary).toContain('routeErrorLine');
    expect(boundary).not.toContain('error.stack');
    expect(boundary).not.toContain('componentStack');
    expect(boundary).not.toContain('flex: 1');
    const pkg = readFileSync('package.json', 'utf8');
    expect(pkg).toContain('"postinstall": "patch-package --error-on-fail"');
    expect(pkg).toContain('"ship-check": "node scripts/assert-patches.mjs"');
    const checker = readFileSync('scripts/assert-patches.mjs', 'utf8');
    expect(checker).toContain('--dry-run');
    expect(checker).toContain('--reverse');
    expect(checker).not.toContain('patch-package');
    expect(readFileSync('README.md', 'utf8')).toContain('npm run ship-check');
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

  it('fails the ship check when a patch is missing and passes when it is applied', () => {
    const script = join(process.cwd(), 'scripts/assert-patches.mjs');
    const live = spawnSync(process.execPath, [script], { cwd: process.cwd(), encoding: 'utf8' });
    expect(live.status, live.stderr).toBe(0);

    const root = mkdtempSync(join(tmpdir(), 'charioteer-patches-'));
    try {
      const fileDir = join(root, 'node_modules', 'example');
      mkdirSync(fileDir, { recursive: true });
      mkdirSync(join(root, 'patches'));
      writeFileSync(join(fileDir, 'file.txt'), 'original\n');
      writeFileSync(join(root, 'patches', 'example+1.0.0.patch'), [
        'diff --git a/node_modules/example/file.txt b/node_modules/example/file.txt',
        '--- a/node_modules/example/file.txt',
        '+++ b/node_modules/example/file.txt',
        '@@ -1 +1 @@',
        '-original',
        '+patched',
        '',
      ].join('\n'));
      const missing = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
      expect(missing.status).not.toBe(0);
      expect(`${missing.stderr}\n${missing.stdout}`).toMatch(/not applied/);
      expect(`${missing.stderr}\n${missing.stdout}`).toMatch(/npm install/);
      writeFileSync(join(fileDir, 'file.txt'), 'patched\n');
      const applied = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
      expect(applied.status, applied.stderr).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
