import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { GARMIN_SUMMARY_TABLES, mapGarminPush } from '../../supabase/functions/_shared/garmin';
import { storedActivityDetail } from '../../supabase/functions/_shared/garminSummaries';
import {
  GARMIN_TRACK_MAX_POINTS,
  detailStartAndClimb,
  logSampleCounts,
  sampleCounts,
  sampleCountsLine,
  trackFromDetail,
  trackInterval,
} from '../../supabase/functions/_shared/garminTrack';
import { garminRouteExpected, mergeWorkouts } from '@/domain/healthSources';
import { workoutsForRouteMatch } from '@/domain/routeCompletions';
import {
  climbAndDescent,
  climbLine,
  elevationTrace,
  evenTrace,
  garminDetailIds,
  garminTrackRoute,
  heartRangeLine,
  heartTrace,
  TRACE_BUCKETS,
} from '@/domain/workoutTrace';
import type { DeviceWorkout } from '@/domain/workoutRoute';

const START = 1_795_650_000;

/** A synthetic 1 Hz run on a made-up line. Not anyone's real route. */
function syntheticDetail(seconds: number, options: { gps?: boolean } = {}) {
  const samples = Array.from({ length: seconds }, (_, index) => ({
    startTimeInSeconds: START + index,
    ...(options.gps === false ? {} : { latitudeInDegree: 10 + index * 0.0000123456, longitudeInDegree: 20 + index * 0.0000234567 }),
    elevationInMeters: 50 + Math.sin(index / 60) * 10,
    heartRate: 120 + (index % 40),
    speedMetersPerSecond: 2.5,
    totalDistanceInMeters: index * 2.5,
  }));
  return {
    userId: 'garmin-user',
    summaryId: '123-detail',
    summary: {
      summaryId: '123-detail',
      activityType: 'RUNNING',
      startTimeInSeconds: START,
      durationInSeconds: seconds,
      distanceInMeters: seconds * 2.5,
      startingLatitudeInDegree: 10.123456,
      startingLongitudeInDegree: 20.654321,
      totalElevationGainInMeters: 41.6,
      totalElevationLossInMeters: 39.2,
    },
    samples,
  };
}

const ids = { garminUserId: 'garmin-user', summaryId: '123-detail', calendarDate: '2026-11-26' };

describe('Garmin activity tracks on the server', () => {
  it('keeps one point every 5 s with both ends, rounded to about 1 m', () => {
    const track = trackFromDetail(syntheticDetail(1590), ids)!;
    expect(track.intervalSeconds).toBe(5);
    expect(track.points.length).toBeGreaterThanOrEqual(318);
    expect(track.points.length).toBeLessThanOrEqual(320);
    expect(track.points[0][0]).toBe(0);
    expect(track.points.at(-1)![0]).toBe(1589);
    expect(track.gpsPointCount).toBe(track.points.length);
    for (const point of track.points) {
      expect(String(point[1]).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(5);
      expect(String(point[2]).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(5);
    }
    expect(track.startedAt).toBe(new Date(START * 1000).toISOString());
  });

  it('stays under the cap for a six-hour activity', () => {
    expect(trackInterval(6 * 3600)).toBeGreaterThan(5);
    const track = trackFromDetail(syntheticDetail(6 * 3600), ids)!;
    expect(track.points.length).toBeLessThanOrEqual(GARMIN_TRACK_MAX_POINTS);
    expect(track.points.at(-1)![0]).toBe(6 * 3600 - 1);
  });

  it('keeps heart rate for an indoor session and treats 0,0 as no position', () => {
    const indoor = trackFromDetail(syntheticDetail(600, { gps: false }), ids)!;
    expect(indoor.gpsPointCount).toBe(0);
    expect(indoor.points.every((point) => point[1] == null && point[2] == null && point[4] != null)).toBe(true);
    const zero = syntheticDetail(30);
    zero.samples.forEach((sample) => Object.assign(sample, { latitudeInDegree: 0, longitudeInDegree: 0 }));
    expect(trackFromDetail(zero, ids)!.gpsPointCount).toBe(0);
    expect(trackFromDetail({ summary: { startTimeInSeconds: START }, samples: [] }, ids)).toBeNull();
    expect(trackFromDetail({ summary: { startTimeInSeconds: START } }, ids)).toBeNull();
  });

  it('logs counts only, never a position', () => {
    const detail = syntheticDetail(120);
    const counts = sampleCounts(detail, trackFromDetail(detail, ids));
    expect(counts).toEqual({ raw: 120, gps: 120, heart: 120, elevation: 120, kept: 25 });
    const line = sampleCountsLine('123-detail', counts);
    expect(line).toBe('garmin-webhook: activityDetails 123-detail samples=120 gps=120 hr=120 elev=120 kept=25');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logSampleCounts({ activityDetails: [detail] });
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = String(spy.mock.calls[0][0]);
    spy.mockRestore();
    expect(logged).not.toMatch(/\d+\.\d+/);
    expect(logged).not.toContain('garmin-user');
  });

  it('reads the start point (about 11 m) and Garmin climb from the summary', () => {
    expect(detailStartAndClimb(syntheticDetail(10))).toEqual({ startLatitude: 10.1235, startLongitude: 20.6543, elevationGainMetres: 42, elevationLossMetres: 39 });
    const noStart = syntheticDetail(10);
    delete (noStart.summary as Partial<typeof noStart.summary>).startingLatitudeInDegree;
    expect(detailStartAndClimb(noStart).startLatitude).toBe(10);
  });

  it('maps an activityDetails push to a detail row and a track', () => {
    const plan = mapGarminPush({ activityDetails: [syntheticDetail(300)] });
    expect(plan.activityDetails).toHaveLength(1);
    expect(plan.activityDetails[0]).toMatchObject({ summaryId: '123-detail', distanceMetres: 750, startLatitude: 10.1235, elevationGainMetres: 42 });
    expect(plan.activityTracks).toHaveLength(1);
    expect(plan.activityTracks[0].points.length).toBe(61);
    expect(storedActivityDetail([{ summary_id: '123-detail', calendar_date: '2026-11-26', start_latitude: 10.1235, start_longitude: 20.6543, elevation_gain_metres: 42, elevation_loss_metres: 39 }])[0])
      .toMatchObject({ startLatitude: 10.1235, startLongitude: 20.6543, elevationGainMetres: 42, elevationLossMetres: 39 });
  });

  it('deletes the track with the other Garmin summaries and writes it from the webhook', () => {
    expect(GARMIN_SUMMARY_TABLES).toContain('garmin_activity_samples');
    const webhook = readFileSync('supabase/functions/garmin-webhook/index.ts', 'utf8');
    expect(webhook).toContain("['garmin_activity_samples', summaryRows(plan.activityTracks");
    expect(webhook).toContain('logSampleCounts(body)');
    const sql = readFileSync('supabase/migrations/20261126215217_garmin_activity_samples.sql', 'utf8');
    expect(sql).toContain('check (point_count between 1 and 2000)');
    expect(sql).toContain("'garmin_activity_samples', (");
    const exported = sql.slice(sql.indexOf("'garmin_activity_samples', ("), sql.indexOf('$add$;'));
    expect(exported).not.toMatch(/points|latitude|longitude/);
  });
});

describe('Garmin route maps in the app', () => {
  it('turns a stored track into map points and heart samples', () => {
    const stored = trackFromDetail(syntheticDetail(120), ids)!;
    const route = garminTrackRoute({ startedAt: stored.startedAt, points: stored.points });
    expect(route.points).toHaveLength(stored.points.length);
    expect(route.heartSamples).toHaveLength(stored.points.length);
    expect(route.points[0].at).toBe(stored.startedAt);
    expect(Number.isFinite(route.points[0].altitude)).toBe(true);
    const indoor = trackFromDetail(syntheticDetail(120, { gps: false }), ids)!;
    const heartOnly = garminTrackRoute({ startedAt: indoor.startedAt, points: indoor.points });
    expect(heartOnly.points).toHaveLength(0);
    expect(heartOnly.heartSamples.length).toBeGreaterThan(2);
    expect(garminTrackRoute({ startedAt: 'nope', points: [[0, 1, 2, 3, 4, 5, 6]] }).points).toHaveLength(0);
    expect(garminTrackRoute({ startedAt: stored.startedAt, points: ['bad', [0, 99, 2, null, null, null, null]] }).points).toHaveLength(0);
  });

  it('works out the climb and ignores GPS wobble', () => {
    expect(climbAndDescent([10, 11, 10, 11, 10])).toEqual({ climb: 0, descent: 0 });
    expect(climbAndDescent([10, 20, 15, 30, 5])).toEqual({ climb: 25, descent: 30 });
    const points = [10, 20, 15].map((altitude, index) => ({ latitude: 0, longitude: index * 0.001, altitude, at: new Date(index * 1000).toISOString(), heartRate: null }));
    expect(climbLine(points)).toBe('Total climb 10 m · Total descent 5 m');
    expect(climbLine(points, { gain: 42, loss: 39 })).toBe('Total climb 42 m · Total descent 39 m');
    expect(climbLine(points.map((point) => ({ ...point, altitude: 0 })))).toBeNull();
  });

  it('draws evenly spaced traces without inventing zeros', () => {
    expect(evenTrace([{ x: 0, y: 1 }, { x: 100, y: 3 }], 10)).toEqual([1, 3]);
    const rows = Array.from({ length: 500 }, (_, index) => ({ x: index, y: index }));
    expect(evenTrace(rows)).toHaveLength(TRACE_BUCKETS);
    const samples = Array.from({ length: 100 }, (_, index) => ({ at: new Date(index * 5000).toISOString(), bpm: 100 + index }));
    expect(heartTrace(samples)).toHaveLength(TRACE_BUCKETS);
    expect(heartRangeLine(samples)).toBe('Lowest 100 bpm · Highest 199 bpm');
    const flat = [0, 1].map((index) => ({ latitude: 0, longitude: index * 0.001, altitude: 0, at: new Date(index).toISOString(), heartRate: null }));
    expect(elevationTrace(flat)).toEqual([]);
  });

  it('opens a route map for Garmin outdoor walks, runs, hikes and cycles only', () => {
    expect(garminRouteExpected({ activityType: 'RUNNING', activityName: 'Morning run' })).toBe(true);
    expect(garminRouteExpected({ activityType: 'WALKING', activityName: '' })).toBe(true);
    expect(garminRouteExpected({ activityType: 'ROAD_BIKING', activityName: '' })).toBe(true);
    expect(garminRouteExpected({ activityType: 'HIKING', activityName: '' })).toBe(true);
    expect(garminRouteExpected({ activityType: 'TREADMILL_RUNNING', activityName: '' })).toBe(false);
    expect(garminRouteExpected({ activityType: 'INDOOR_CYCLING', activityName: '' })).toBe(false);
    expect(garminRouteExpected({ activityType: 'INDOOR_CARDIO', activityName: '' })).toBe(false);
    expect(garminRouteExpected({ activityType: 'STRENGTH_TRAINING', activityName: '' })).toBe(false);
  });

  it('keeps the Garmin id on a merged row so the screen can read the Garmin track', () => {
    const activity = { summaryId: '25202876588', activityType: 'RUNNING', activityName: 'Run', startedAt: '2026-11-26T07:53:57Z', durationSeconds: 1590, averageHeartRateBpm: 148, trainingEffect: null, anaerobicEffect: null };
    const [garminOnly] = mergeWorkouts([], [activity]);
    expect(garminOnly).toMatchObject({ id: 'garmin:25202876588', routeExpected: true, garminSummaryId: '25202876588' });
    const apple: DeviceWorkout = { id: 'apple-uuid', activityType: 37, label: 'Run', startedAt: '2026-11-26T07:54:00Z', durationMinutes: 26, distanceMetres: 3990, energyKcal: null, averageHeartRate: 147, routeExpected: true };
    const [merged] = mergeWorkouts([apple], [activity]);
    expect(merged).toMatchObject({ id: 'apple-uuid', routeExpected: true, origin: 'garmin', garminSummaryId: '25202876588' });
    expect(garminDetailIds('garmin:25202876588')).toEqual(['25202876588', '25202876588-detail']);
    expect(garminDetailIds('25202876588-detail')).toEqual(['25202876588', '25202876588-detail']);
  });

  it('matches saved routes with Garmin distance, start point and climb from the -detail row', () => {
    const [row] = workoutsForRouteMatch({
      activities: [{ summaryId: '25202876588', activityType: 'RUNNING', activityName: 'Run', startedAt: '2026-11-26T07:53:57Z', durationSeconds: 1590, averageHeartRateBpm: 148, trainingEffect: null, anaerobicEffect: null }],
      activityDetails: [{ summaryId: '25202876588-detail', calendarDate: '2026-11-26', durationSeconds: 1590, distanceMetres: 3986, averageHeartRateBpm: 148, activeKilocalories: 300, startLatitude: 10.1235, startLongitude: 20.6543, elevationGainMetres: 42, elevationLossMetres: 39 }],
      apple: [],
    });
    expect(row).toMatchObject({ source: 'garmin', distanceMetres: 3986, elevationGainM: 42, start: { latitude: 10.1235, longitude: 20.6543 } });
  });

  it('shows View route map in history and reads Garmin tracks on the route screen', () => {
    const list = readFileSync('src/ui/WorkoutList.tsx', 'utf8');
    expect(list).toContain("extra={workout.routeExpected ? <T style={{ textDecorationLine: 'underline' }}>{VIEW_ROUTE_MAP}</T> : null}");
    const screen = readFileSync('src/app/(main)/workout/[id].tsx', 'utf8');
    expect(screen).toContain('repo.garminActivityTrack(garminId)');
    expect(screen).toContain('<WorkoutTraceCharts');
    expect(screen.indexOf('readDeviceRoute(id)')).toBeLessThan(screen.indexOf('repo.garminActivityTrack(garminId)'));
  });
});
