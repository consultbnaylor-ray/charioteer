import { describe, expect, it } from 'vitest';

import type { GarminActivity, GarminActivityDetail } from '@/domain/garminConnect';
import { sampleCanalLoop, type OutdoorPoint } from '@/domain/outdoorRoute';
import {
  ROUTE_MATCH_EMPTY,
  appleRouteWorkout,
  dedupeRouteWorkouts,
  elevationGainMetres,
  garminRouteWorkout,
  matchRouteCompletions,
  routeCompletionStatLine,
  routeCompletionSummaryLine,
  routeHistorySummary,
  routeHistorySummaryLine,
  savedRouteForMatch,
  workoutsForRouteMatch,
  type RecordedRouteWorkout,
  type SavedRouteForMatch,
} from '@/domain/routeCompletions';
import type { DeviceWorkout } from '@/domain/workoutRoute';

const START: OutdoorPoint = { latitude: 51.449, longitude: -2.597 };
const NEAR: OutdoorPoint = { latitude: 51.4494, longitude: -2.597 };
const FAR: OutdoorPoint = { latitude: 51.52, longitude: -2.59 };

function route(partial: Partial<SavedRouteForMatch> & Pick<SavedRouteForMatch, 'id'>): SavedRouteForMatch {
  return {
    createdAt: '2026-11-01T09:00:00.000Z',
    distanceM: 5000,
    activity: null,
    start: START,
    ...partial,
  };
}

function workout(partial: Partial<RecordedRouteWorkout> & Pick<RecordedRouteWorkout, 'id'>): RecordedRouteWorkout {
  return {
    source: 'garmin',
    activity: 'walk',
    startedAt: '2026-11-10T08:00:00.000Z',
    durationSeconds: 50 * 60,
    distanceMetres: 5100,
    averageHeartRate: 120,
    energyKcal: 300,
    elevationGainM: null,
    start: null,
    ...partial,
  };
}

function garmin(partial: Partial<GarminActivity> & Pick<GarminActivity, 'summaryId' | 'startedAt'>): GarminActivity {
  return {
    activityType: 'WALKING',
    activityName: 'Morning walk',
    durationSeconds: 50 * 60,
    averageHeartRateBpm: 118,
    trainingEffect: null,
    anaerobicEffect: null,
    ...partial,
  };
}

function detail(partial: Partial<GarminActivityDetail> & Pick<GarminActivityDetail, 'summaryId'>): GarminActivityDetail {
  return {
    calendarDate: '2026-11-10',
    durationSeconds: 50 * 60,
    distanceMetres: 5100,
    averageHeartRateBpm: 118,
    activeKilocalories: 280,
    ...partial,
  };
}

function apple(partial: Partial<DeviceWorkout> & Pick<DeviceWorkout, 'id' | 'startedAt'>): DeviceWorkout {
  return {
    activityType: 52,
    label: 'Walking',
    durationMinutes: 50,
    distanceMetres: 5000,
    energyKcal: 260,
    averageHeartRate: 110,
    routeExpected: true,
    ...partial,
  };
}

describe('route completions', () => {
  it('confirms a workout whose start is near the route and whose length is close', () => {
    const history = matchRouteCompletions(
      [route({ id: 'canal' })],
      [workout({ id: 'g1', start: NEAR, distanceMetres: 5200 })],
    );
    expect(history.byRoute.canal).toHaveLength(1);
    expect(history.byRoute.canal[0]).toMatchObject({
      confidence: 'matched',
      source: 'garmin',
      distanceMetres: 5200,
      averageHeartRate: 120,
      energyKcal: 300,
    });
    expect(history.byRoute.canal[0]?.averagePaceSecPerKm).toBeGreaterThan(0);
    expect(routeCompletionStatLine(history.byRoute.canal[0])).not.toContain('Likely');
    expect(routeCompletionStatLine(history.byRoute.canal[0])).toContain('Garmin');
    expect(routeCompletionSummaryLine(history.byRoute.canal)).toMatch(/^1 time · Last /);
  });

  it('rejects a far start even when the length matches, and labels a missing trace as likely', () => {
    const far = matchRouteCompletions(
      [route({ id: 'canal' })],
      [workout({ id: 'away', start: FAR, distanceMetres: 5000 })],
    );
    expect(far.all).toHaveLength(0);

    const likely = matchRouteCompletions(
      [route({ id: 'canal', activity: 'walk' })],
      [workout({ id: 'no-trace', activity: 'walk', start: null, distanceMetres: 4800 })],
    );
    expect(likely.byRoute.canal[0]?.confidence).toBe('likely');
    expect(routeCompletionStatLine(likely.byRoute.canal[0])).toContain('Likely');
    expect(ROUTE_MATCH_EMPTY).toBe("Not matched to a recorded workout yet. Record it on your watch and it'll appear here.");
  });

  it('keeps workouts on or after the route was saved, of the same type when both are known', () => {
    const saved = route({ id: 'canal', createdAt: '2026-11-08T12:00:00.000Z', activity: 'walk' });
    const history = matchRouteCompletions([saved], [
      workout({ id: 'before', startedAt: '2026-11-07T08:00:00.000Z' }),
      workout({ id: 'run', activity: 'run', startedAt: '2026-11-09T08:00:00.000Z' }),
      workout({ id: 'after', activity: 'walk', startedAt: '2026-11-08T12:00:00.000Z' }),
      workout({ id: 'long', activity: 'walk', startedAt: '2026-11-12T08:00:00.000Z', distanceMetres: 9000 }),
    ]);
    expect(history.all.map((row) => row.workoutId)).toEqual(['after']);
  });

  it('lets an unknown route type take a walk, run, cycle, or hike, and shows cycle as speed', () => {
    const loop = route({ id: 'loop', activity: null, distanceM: 20000 });
    const history = matchRouteCompletions([loop], [
      workout({ id: 'hike', activity: 'hike', source: 'apple', distanceMetres: 19800, durationSeconds: 4 * 3600, elevationGainM: 240 }),
      workout({ id: 'ride', activity: 'cycle', distanceMetres: 21000, durationSeconds: 3600, averageHeartRate: null, energyKcal: null }),
    ]);
    expect(history.all).toHaveLength(2);
    const ride = history.byRoute.loop.find((row) => row.workoutId === 'ride');
    expect(ride?.averageSpeedKmh).toBe(21);
    expect(routeCompletionStatLine(ride!)).toContain('21.0 km/h');
    expect(routeCompletionStatLine(ride!)).not.toContain('/km');
    const hike = history.byRoute.loop.find((row) => row.workoutId === 'hike');
    expect(routeCompletionStatLine(hike!)).toContain('Elevation gain 240 m');
    expect(routeCompletionStatLine(hike!)).toContain('Apple Health');
  });

  it('gives one workout to the nearer route and prefers a traced match over a likely one', () => {
    const history = matchRouteCompletions(
      [
        route({ id: 'older', createdAt: '2026-10-01T09:00:00.000Z', distanceM: 5000 }),
        route({ id: 'newer', createdAt: '2026-11-02T09:00:00.000Z', distanceM: 5000, start: NEAR }),
      ],
      [workout({ id: 'once', start: NEAR, distanceMetres: 5000 })],
    );
    expect(history.byRoute.newer.map((row) => row.workoutId)).toEqual(['once']);
    expect(history.byRoute.older).toEqual([]);
    expect(history.byRoute.newer[0]?.confidence).toBe('matched');
  });

  it('keeps Garmin when Apple recorded the same session, and uses Apple for the gaps', () => {
    const merged = dedupeRouteWorkouts([
      workout({
        id: 'garmin:g1',
        source: 'garmin',
        activity: 'run',
        startedAt: '2026-11-10T07:00:00.000Z',
        durationSeconds: 40 * 60,
        distanceMetres: null,
        energyKcal: null,
        start: null,
        averageHeartRate: 150,
      }),
      workout({
        id: 'hk-1',
        source: 'apple',
        activity: 'run',
        startedAt: '2026-11-10T07:01:00.000Z',
        durationSeconds: 39 * 60,
        distanceMetres: 8000,
        energyKcal: 540,
        elevationGainM: 40,
        start: NEAR,
        averageHeartRate: 142,
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: 'garmin:g1',
      source: 'garmin',
      distanceMetres: 8000,
      energyKcal: 540,
      elevationGainM: 40,
      averageHeartRate: 150,
      start: NEAR,
    });
    const history = matchRouteCompletions(
      [route({ id: 'park', distanceM: 8000, activity: 'run' })],
      merged,
    );
    expect(history.byRoute.park[0]).toMatchObject({ source: 'garmin', confidence: 'matched', distanceMetres: 8000 });
  });

  it('reads Garmin distance from the detail row and skips indoor or non-route sports', () => {
    const rows = workoutsForRouteMatch({
      activities: [
        garmin({ summaryId: 'walk-1', startedAt: '2026-11-10T08:00:00.000Z' }),
        garmin({ summaryId: 'gym', startedAt: '2026-11-10T18:00:00.000Z', activityType: 'STRENGTH_TRAINING', activityName: 'Weights' }),
        garmin({ summaryId: 'mill', startedAt: '2026-11-11T08:00:00.000Z', activityType: 'TREADMILL_RUNNING', activityName: 'Treadmill' }),
      ],
      activityDetails: [detail({ summaryId: 'walk-1', distanceMetres: 5000, activeKilocalories: 310 })],
      apple: [apple({ id: 'indoor', startedAt: '2026-11-11T09:00:00.000Z', routeExpected: false })],
    });
    expect(rows.map((row) => row.id)).toEqual(['garmin:walk-1']);
    expect(rows[0]).toMatchObject({ distanceMetres: 5000, energyKcal: 310, activity: 'walk', start: null });
    expect(garminRouteWorkout(garmin({ summaryId: 'walk-1', startedAt: 'nope' }), null)).toBeNull();
    expect(appleRouteWorkout(apple({ id: 'out', startedAt: '2026-11-11T09:00:00.000Z' }))?.activity).toBe('walk');
  });

  it('sums this month from the recorded lengths and counts every completion', () => {
    const history = matchRouteCompletions(
      [route({ id: 'canal', createdAt: '2026-10-01T00:00:00.000Z' })],
      [
        workout({ id: 'oct', startedAt: '2026-10-20T08:00:00.000Z', distanceMetres: 5000 }),
        workout({ id: 'nov', startedAt: '2026-11-03T08:00:00.000Z', distanceMetres: 4800 }),
      ],
    );
    const summary = routeHistorySummary(history.all, new Date('2026-11-24T12:00:00.000Z'));
    expect(summary).toEqual({ completions: 2, distanceMetresThisMonth: 4800 });
    expect(routeHistorySummaryLine(summary)).toBe('2 completions · 4.80 km this month');
    expect(routeHistorySummaryLine({ completions: 1, distanceMetresThisMonth: 0 })).toBe('1 completion · 0 m this month');
  });

  it('treats a craving walk as a walk and reads the saved start', () => {
    const saved = savedRouteForMatch({ ...sampleCanalLoop(), kind: 'craving_walk' });
    expect(saved.activity).toBe('walk');
    expect(saved.start).toEqual(sampleCanalLoop().points[0]);
    expect(elevationGainMetres([10, 12, 11, 18])).toBe(9);
    expect(elevationGainMetres([10])).toBeNull();
    expect(routeCompletionSummaryLine([])).toBe('0 times');
  });
});
