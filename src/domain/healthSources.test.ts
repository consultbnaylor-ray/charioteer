import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildHealthStatBoard } from '@/domain/healthStatTiles';
import { emptyGarminReadings, type GarminActivity, type GarminReadings } from '@/domain/garminConnect';
import {
  WORKOUT_SOURCE_APPLE,
  WORKOUT_SOURCE_GARMIN,
  activeMinutesByDay,
  mergeHealthSamples,
  mergeWorkouts,
  sumDaily,
  workoutSourceLine,
} from '@/domain/healthSources';
import type { HealthSample } from '@/data/types';
import type { DeviceWorkout } from '@/domain/workoutRoute';

function appleWorkout(partial: Partial<DeviceWorkout> & Pick<DeviceWorkout, 'id' | 'startedAt'>): DeviceWorkout {
  return {
    activityType: 37,
    label: 'Running',
    durationMinutes: 40,
    distanceMetres: 5000,
    energyKcal: 320,
    averageHeartRate: null,
    effortScore: null,
    routeExpected: true,
    ...partial,
  };
}

function activity(partial: Partial<GarminActivity> & Pick<GarminActivity, 'summaryId' | 'startedAt'>): GarminActivity {
  return {
    activityType: 'RUNNING',
    activityName: 'Morning run',
    durationSeconds: 40 * 60,
    averageHeartRateBpm: 148,
    trainingEffect: 3.2,
    anaerobicEffect: 0.4,
    ...partial,
  };
}

function sample(partial: Partial<HealthSample> & Pick<HealthSample, 'kind' | 'value' | 'recordedOn'>): HealthSample {
  return {
    id: `${partial.kind}-${partial.recordedOn}`,
    unit: partial.kind === 'sleep_hours' ? 'h' : partial.kind === 'resting_heart_rate' ? 'bpm' : 'min',
    source: 'healthkit',
    ...partial,
  };
}

function readings(partial: Partial<GarminReadings>): GarminReadings {
  return { ...emptyGarminReadings(), connected: true, ...partial };
}

describe('merged workouts', () => {
  it('collapses an Apple Health workout that overlaps a Garmin activity', () => {
    const apple = appleWorkout({ id: 'hk-run', startedAt: '2026-10-21T07:00:00.000Z', durationMinutes: 40 });
    const garmin = activity({ summaryId: 'g-run', startedAt: '2026-10-21T07:01:00.000Z', durationSeconds: 39 * 60 });
    const rows = mergeWorkouts([apple], [garmin]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.origin).toBe('garmin');
    expect(rows[0]?.id).toBe('hk-run');
    expect(rows[0]?.label).toBe('Morning run');
    expect(rows[0]?.averageHeartRate).toBe(148);
    expect(rows[0]?.distanceMetres).toBe(5000);
    expect(rows[0]?.energyKcal).toBe(320);
    expect(rows[0]?.routeExpected).toBe(true);
    expect(rows[0]?.trainingEffect).toBe(3.2);
    expect(workoutSourceLine(rows[0]?.origin)).toBe(WORKOUT_SOURCE_GARMIN);
  });

  it('keeps workouts that do not overlap', () => {
    const morning = appleWorkout({ id: 'hk-early', startedAt: '2026-10-21T07:00:00.000Z', durationMinutes: 30 });
    const evening = activity({
      summaryId: 'g-late',
      startedAt: '2026-10-21T18:00:00.000Z',
      durationSeconds: 25 * 60,
      activityName: 'Evening walk',
    });
    const rows = mergeWorkouts([morning], [evening]);
    expect(rows.map((row) => row.id)).toEqual(['hk-early', 'garmin:g-late']);
    expect(rows.map((row) => row.origin)).toEqual(['apple', 'garmin']);
    expect(workoutSourceLine('apple')).toBe(WORKOUT_SOURCE_APPLE);
  });

  it('treats a start within two minutes and a similar duration as one session', () => {
    const apple = appleWorkout({ id: 'hk-near', startedAt: '2026-10-21T07:00:00.000Z', durationMinutes: 40 });
    const garmin = activity({ summaryId: 'g-near', startedAt: '2026-10-21T07:01:30.000Z', durationSeconds: 36 * 60 });
    expect(mergeWorkouts([apple], [garmin])).toHaveLength(1);
  });
});

describe('merged daily metrics', () => {
  const apple = [
    sample({ kind: 'resting_heart_rate', value: 70, recordedOn: '2026-10-21' }),
    sample({ kind: 'resting_heart_rate', value: 62, recordedOn: '2026-10-20' }),
    sample({ kind: 'sleep_hours', value: 6, recordedOn: '2026-10-21' }),
    sample({ kind: 'sleep_hours', value: 8, recordedOn: '2026-10-20' }),
    sample({ kind: 'workout_minutes', value: 40, recordedOn: '2026-10-21' }),
    sample({ kind: 'workout_minutes', value: 30, recordedOn: '2026-10-22' }),
    sample({ kind: 'steps', value: 8000, recordedOn: '2026-10-21' }),
  ];

  it('prefers Garmin for a day and keeps Apple Health when Garmin has no reading', () => {
    const merged = mergeHealthSamples(apple, readings({
      dailies: [
        { calendarDate: '2026-10-21', restingHeartRateBpm: 58, averageHeartRateBpm: 72, moderateMinutes: 20, vigorousMinutes: 10 },
      ],
      sleep: [{
        summaryId: 'night',
        calendarDate: '2026-10-21',
        durationSeconds: 7.5 * 3600,
        deepSeconds: null,
        lightSeconds: null,
        remSeconds: null,
        awakeSeconds: null,
        sleepScore: null,
      }],
    }), []);
    const resting = merged.filter((row) => row.kind === 'resting_heart_rate');
    const sleep = merged.filter((row) => row.kind === 'sleep_hours');
    expect(resting.find((row) => row.recordedOn === '2026-10-21')?.value).toBe(58);
    expect(resting.find((row) => row.recordedOn === '2026-10-20')?.value).toBe(62);
    expect(resting.reduce((sum, row) => sum + row.value, 0)).toBe(120);
    expect(sleep.find((row) => row.recordedOn === '2026-10-21')?.value).toBe(7.5);
    expect(sleep.find((row) => row.recordedOn === '2026-10-20')?.value).toBe(8);
    expect(sleep.reduce((sum, row) => sum + row.value, 0)).toBe(15.5);
    expect(merged.find((row) => row.kind === 'steps')?.value).toBe(8000);
  });

  it('does not add Apple Health and Garmin into the weekly total', () => {
    const workouts = mergeWorkouts(
      [
        appleWorkout({ id: 'hk-run', startedAt: '2026-10-21T07:00:00.000Z', durationMinutes: 40 }),
        appleWorkout({ id: 'hk-walk', startedAt: '2026-10-22T12:00:00.000Z', durationMinutes: 30, routeExpected: false }),
      ],
      [
        activity({ summaryId: 'g-run', startedAt: '2026-10-21T07:00:30.000Z', durationSeconds: 40 * 60 }),
        activity({ summaryId: 'g-cycle', startedAt: '2026-10-22T18:00:00.000Z', durationSeconds: 25 * 60, activityName: 'Cycle' }),
      ],
    );
    expect(workouts).toHaveLength(3);
    const merged = mergeHealthSamples(apple, readings({
      dailies: [
        { calendarDate: '2026-10-21', restingHeartRateBpm: 58, averageHeartRateBpm: null, moderateMinutes: 20, vigorousMinutes: 10 },
        { calendarDate: '2026-10-22', restingHeartRateBpm: null, averageHeartRateBpm: null, moderateMinutes: 15, vigorousMinutes: 0 },
      ],
    }), workouts);
    const workoutMinutes = merged.filter((row) => row.kind === 'workout_minutes');
    expect(workoutMinutes.find((row) => row.recordedOn === '2026-10-21')?.value).toBe(40);
    expect(workoutMinutes.find((row) => row.recordedOn === '2026-10-22')?.value).toBe(55);
    expect(workoutMinutes.reduce((sum, row) => sum + row.value, 0)).toBe(95);
    const active = activeMinutesByDay(merged, [
      { calendarDate: '2026-10-21', restingHeartRateBpm: 58, averageHeartRateBpm: null, moderateMinutes: 20, vigorousMinutes: 10 },
      { calendarDate: '2026-10-22', restingHeartRateBpm: null, averageHeartRateBpm: null, moderateMinutes: 15, vigorousMinutes: 0 },
    ]);
    expect(sumDaily(active, '2026-10-16', '2026-10-22')).toBe(45);
    expect(sumDaily(active, '2026-10-16', '2026-10-22')).not.toBe(95 + 45);

    const board = buildHealthStatBoard({
      today: '2026-10-22',
      samples: merged,
      body: [],
      activityEnergyKcal: null,
      heightCm: 178,
      adult: true,
      goalAge: 42,
      goalSex: 'male',
      goal: null,
      build: null,
      period: '7',
      activeMinutes: active,
    });
    const tile = board.sections.flatMap((section) => section.tiles).find((item) => item.id === 'weekly_active_minutes');
    expect(tile?.valueText).toBe('45');
    const listed = board.sections.flatMap((section) => section.tiles).find((item) => item.id === 'workouts');
    expect(listed?.valueText).toBe('95');
  });
});

describe('source line', () => {
  it('names the feed on the workout detail screen and nowhere in the list or the charts', () => {
    const detail = readFileSync('src/app/(main)/workout/[id].tsx', 'utf8');
    const list = readFileSync('src/ui/WorkoutList.tsx', 'utf8');
    const health = readFileSync('src/app/(main)/health.tsx', 'utf8');
    const profile = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    expect(detail).toContain('workoutSourceLine');
    expect(detail).not.toContain('From Garmin');
    expect(list).not.toContain('From Garmin');
    expect(list).not.toContain('From Apple Health');
    expect(list).not.toContain('workoutSourceLine');
    expect(health).not.toContain('GarminReadings');
    expect(health).not.toContain('From Garmin');
    expect(health).toContain('useHealthSources');
    expect(health).toContain('activeMinutes');
    expect(profile).toContain('<GarminConnectRow />');
    expect(readFileSync('supabase/functions/_shared/garmin.ts', 'utf8')).toContain('garminAllowedForCoach');
  });
});
