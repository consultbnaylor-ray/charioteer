import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { dailyRowsFor, garminCoachLines, mapGarminPush, missingColumn, readingsFromRows } from '../../supabase/functions/_shared/garmin';
import { HEALTH_KINDS } from './healthInsights';
import {
  DAILY_ACTIVITY_RINGS_HINT,
  DAILY_ACTIVITY_TAP_HINT,
  GARMIN_CALORIE_SOURCE,
  GARMIN_EXERCISE_SOURCE,
  GARMIN_VIGOROUS_MINUTE_WEIGHT,
  activityDayName,
  calorieSeries,
  distanceSeries,
  exerciseSeries,
  floorsSeries,
  garminLatestLines,
  restingSeries,
  stepsSeries,
  garminExerciseMinutes,
  mostInOneDay,
} from './dailyActivity';

const end = '2026-10-22';

describe('daily activity', () => {
  it('counts Garmin vigorous minutes twice and keeps Apple when that day has movement', () => {
    expect(GARMIN_VIGOROUS_MINUTE_WEIGHT).toBe(2);
    expect(garminExerciseMinutes(20, 10)).toBe(40);
    expect(garminExerciseMinutes(20, 10)).not.toBe(30);
    expect(garminExerciseMinutes(null, null)).toBeNull();
    expect(garminExerciseMinutes(0, 0)).toBe(0);
    const dailies = [
      { calendarDate: '2026-10-21', restingHeartRateBpm: null, averageHeartRateBpm: null, moderateMinutes: 20, vigorousMinutes: 10, activeKilocalories: 300 },
      { calendarDate: '2026-10-22', restingHeartRateBpm: null, averageHeartRateBpm: null, moderateMinutes: 15, vigorousMinutes: 5, activeKilocalories: 180 },
    ];
    const exercise = exerciseSeries(end, 7, [{ day: '2026-10-22', value: 34 }], dailies);
    expect(exercise[0]?.day).toBe('2026-10-16');
    expect(exercise.at(-1)?.day).toBe('2026-10-22');
    expect(exercise.find((point) => point.day === '2026-10-22')).toMatchObject({ value: 34, source: 'apple' });
    expect(exercise.find((point) => point.day === '2026-10-21')).toMatchObject({ value: 40, source: 'garmin' });
    expect(exercise.find((point) => point.day === '2026-10-22')?.label).toBe('Exercise minutes, Thu 22 Oct: 34 min');
    expect(exercise.find((point) => point.day === '2026-10-21')?.label).toBe(`Exercise minutes, Wed 21 Oct: 40 min ${GARMIN_EXERCISE_SOURCE}`);
    expect(activityDayName('2026-10-22')).toBe('Thu 22 Oct');
    expect(mostInOneDay(exercise, 'min')).toBe('Most in one day 40 min');

    const zeroApple = exerciseSeries(end, 7, [{ day: '2026-10-22', value: 0 }], dailies);
    expect(zeroApple.find((point) => point.day === '2026-10-22')).toMatchObject({ value: 25, source: 'garmin' });

    const calories = calorieSeries(
      end,
      7,
      [{ day: '2026-10-22', value: 612.4 }],
      dailies,
    );
    expect(calories.find((point) => point.day === '2026-10-22')).toMatchObject({ value: 612, source: 'apple' });
    expect(calories.find((point) => point.day === '2026-10-21')).toMatchObject({
      value: 300,
      source: 'garmin',
      label: `Active calories, Wed 21 Oct: 300 kcal ${GARMIN_CALORIE_SOURCE}`,
    });
    expect(calories.find((point) => point.day === '2026-10-22')?.label).toBe('Active calories, Thu 22 Oct: 612 kcal');
    const empty = calorieSeries(end, 7, [], []);
    expect(empty.every((point) => point.value === 0 && point.source == null)).toBe(true);
    expect(mostInOneDay(empty, 'kcal')).toBeNull();
    expect(HEALTH_KINDS).not.toContain('exercise_minutes');
  });

  it('stores Garmin active kilocalories without sending them to Thumos', () => {
    const plan = mapGarminPush({
      dailies: [{
        userId: 'garmin1',
        calendarDate: '2026-10-22',
        moderateIntensityDurationInSeconds: 900,
        vigorousIntensityDurationInSeconds: 300,
        activeKilocalories: 480.6,
      }],
    });
    expect(plan.dailies[0]).toMatchObject({
      moderateMinutes: 15,
      vigorousMinutes: 5,
      activeKilocalories: 481,
    });
    expect(dailyRowsFor(plan, new Map([['garmin1', 'user-1']]))[0]).toMatchObject({
      active_kilocalories: 481,
      moderate_minutes: 15,
      vigorous_minutes: 5,
    });
    const readings = readingsFromRows({
      connected: true,
      connectedAt: null,
      dailies: [{ calendar_date: '2026-10-22', moderate_minutes: 15, vigorous_minutes: 5, active_kilocalories: 481 }],
      activities: [],
      sleep: [],
    });
    expect(readings.dailies[0]?.activeKilocalories).toBe(481);
    const lines = garminCoachLines({
      consentAi: true,
      consentHealth: true,
      personalDataEnabled: true,
      readings,
    });
    expect(lines.join('\n')).not.toContain('481');
    expect(lines.join('\n')).not.toContain('kcal');
    expect(missingColumn('column garmin_dailies.active_kilocalories does not exist', 'active_kilocalories')).toBe(true);
    expect(missingColumn('relation "public.garmin_dailies" does not exist', 'active_kilocalories')).toBe(false);

    const sql = readFileSync('supabase/migrations/20261023180000_garmin_active_kilocalories.sql', 'utf8');
    expect(sql).toContain('add column if not exists active_kilocalories integer');
    expect(sql).toContain('active_kilocalories between 0 and 20000');
    expect(sql).toContain("'active_kilocalories', d.active_kilocalories");
    expect(sql).toContain('grant execute on function public.export_my_data() to authenticated');
    expect(sql).toContain('revoke all on function public.export_my_data() from public, anon');
    expect(sql).toContain('cascades');
    expect(sql).not.toMatch(/grant insert|grant update|grant delete/i);
    expect(sql).not.toMatch(/latitude|longitude/);
    expect(sql).not.toMatch(/shared_health_days|shared_health_preview/);
    expect(readFileSync('supabase/functions/garmin-refresh/index.ts', 'utf8')).not.toContain('active_kilocalories');
    expect(readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8')).not.toContain('active_kilocalories');
    expect(readFileSync('supabase/functions/thumos-voice-token/index.ts', 'utf8')).not.toContain('active_kilocalories');
    expect(readFileSync('supabase/functions/health-plan/index.ts', 'utf8')).not.toContain('active_kilocalories');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    expect(repo).toContain('missingColumn(dailiesWithKnown.error.message, \'active_kilocalories\')');
  });

  it('places the charts on Workouts and asks for exercise minutes', () => {
    const list = readFileSync('src/ui/WorkoutList.tsx', 'utf8');
    const charts = readFileSync('src/ui/DailyActivity.tsx', 'utf8');
    const screen = readFileSync('src/app/(main)/workouts.tsx', 'utf8');
    expect(list.indexOf('<DurationChart')).toBeLessThan(list.indexOf('<DailyActivityCharts'));
    expect(list.indexOf('<DailyActivityCharts')).toBeLessThan(list.indexOf('<WorkoutHistory'));
    expect(charts).toContain('{DAILY_ACTIVITY_RINGS_HINT}');
    expect(charts).toContain('{DAILY_ACTIVITY_TAP_HINT}');
    expect(charts).toContain('accessibilityLabel={`${point.label}. Select this day.`}');
    expect(charts).not.toContain('workoutTypeColor');
    expect(screen).toContain('consent={snap.profile.consentHealth}');
    const sources = readFileSync('src/health/useHealthSources.ts', 'utf8');
    expect(sources.indexOf('if (!consent)')).toBeLessThan(sources.indexOf('listDailyActivity()'));
    const reader = readFileSync('src/health/dailyActivity.ios.ts', 'utf8');
    expect(reader).toContain("readCumulative('HKQuantityTypeIdentifierAppleExerciseTime', 'min')");
    expect(reader).toContain("readCumulative('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal')");
    expect(reader).not.toContain('requestAuthorization');
    expect(reader).not.toContain('saveHealth');
    expect(readFileSync('src/health/connection.ts', 'utf8')).toContain('HKQuantityTypeIdentifierAppleExerciseTime');
    expect(readFileSync('app.json', 'utf8')).toContain('exercise minutes');
    expect(readFileSync('docs/privacy.md', 'utf8')).toContain('exercise minutes');
    expect(DAILY_ACTIVITY_RINGS_HINT).toBe('Rings and exercise minutes include all your movement, not just recorded workouts.');
    expect(DAILY_ACTIVITY_TAP_HINT).toBe("Tap a bar to see that day's activity.");
    const steps = stepsSeries(end, 7, [{ day: '2026-10-22', value: 8000 }], [
      { calendarDate: '2026-10-21', restingHeartRateBpm: null, averageHeartRateBpm: null, moderateMinutes: null, vigorousMinutes: null, steps: 6400, distanceMetres: 4200, floorsClimbed: 9 },
      { calendarDate: '2026-10-22', restingHeartRateBpm: 58, averageHeartRateBpm: null, moderateMinutes: null, vigorousMinutes: null, steps: 1000 },
    ]);
    expect(steps[0]?.day).toBe('2026-10-16');
    expect(steps.at(-1)?.day).toBe('2026-10-22');
    expect(steps.find((point) => point.day === '2026-10-22')).toMatchObject({ value: 8000, source: 'apple' });
    expect(steps.find((point) => point.day === '2026-10-22')?.label).toContain('(Apple Health)');
    expect(steps.find((point) => point.day === '2026-10-21')).toMatchObject({ value: 6400, source: 'garmin' });
    expect(steps.find((point) => point.day === '2026-10-21')?.label).toContain('(Garmin)');
    expect(distanceSeries(end, 7, [
      { calendarDate: '2026-10-21', restingHeartRateBpm: null, averageHeartRateBpm: null, moderateMinutes: null, vigorousMinutes: null, distanceMetres: 4200 },
    ]).find((point) => point.day === '2026-10-21')?.label).toBe('Distance, Wed 21 Oct: 4.2 km (Garmin)');
    expect(floorsSeries(end, 7, [
      { calendarDate: '2026-10-21', restingHeartRateBpm: null, averageHeartRateBpm: null, moderateMinutes: null, vigorousMinutes: null, floorsClimbed: 9 },
    ]).find((point) => point.day === '2026-10-21')?.label).toBe('Floors, Wed 21 Oct: 9 floors (Garmin)');
    const resting = restingSeries(end, 7, [{ day: '2026-10-22', value: 60 }], [
      { calendarDate: '2026-10-21', restingHeartRateBpm: 58, averageHeartRateBpm: null, moderateMinutes: null, vigorousMinutes: null },
    ]);
    expect(resting.find((point) => point.day === '2026-10-22')?.label).toContain('60 bpm (Apple Health)');
    expect(resting.find((point) => point.day === '2026-10-21')?.label).toContain('58 bpm (Garmin)');
    const lines = garminLatestLines({
      dailies: [{
        calendarDate: '2026-10-22',
        restingHeartRateBpm: null,
        averageHeartRateBpm: null,
        moderateMinutes: null,
        vigorousMinutes: null,
        stepGoal: 10000,
        averageStressLevel: 28,
        bodyBatteryCharged: 40,
        bodyBatteryDrained: 55,
        bodyBatteryHighest: 80,
        bodyBatteryLowest: 20,
      }],
      sleep: [{ calendarDate: '2026-10-22', sleepScore: 81 }],
      respiration: [{ calendarDate: '2026-10-22', averageBreathsPerMinute: 15.3 }],
      pulseOx: [{ calendarDate: '2026-10-22', averageSpo2: 96 }],
      hrv: [{ calendarDate: '2026-10-22', lastNightAvgMs: 46 }],
    });
    expect(lines[0]).toContain('Step goal');
    expect(lines.length).toBeGreaterThan(4);
    expect(readFileSync('src/ui/DailyActivity.tsx', 'utf8')).toContain('GARMIN_LINE_FOLD');
    expect(readFileSync('src/app/(main)/health.tsx', 'utf8')).toContain('<MovementCharts');
    expect(readFileSync('src/ui/DailyActivity.tsx', 'utf8')).not.toContain('workoutTypeColor');
  });
});
