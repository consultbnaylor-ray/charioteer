import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { dailyRowsFor, garminCoachLines, mapGarminPush, missingColumn, readingsFromRows } from '../../supabase/functions/_shared/garmin';
import { HEALTH_KINDS } from './healthInsights';
import {
  DAILY_ACTIVITY_RINGS_HINT,
  DAILY_ACTIVITY_TAP_HINT,
  APPLE_AND_GARMIN_SOURCE,
  APPLE_SOURCE,
  GARMIN_CALORIE_SOURCE,
  GARMIN_EXERCISE_SOURCE,
  GARMIN_SOURCE,
  GARMIN_VIGOROUS_MINUTE_WEIGHT,
  NO_STEPS_YET_TODAY,
  activityDayName,
  calorieSeries,
  chartSourceCaption,
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
    expect(exercise.find((point) => point.day === '2026-10-22')?.label).toBe('Exercise minutes, Thu 22 Oct: 34 min (Apple Health)');
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
    expect(calories.find((point) => point.day === '2026-10-22')?.label).toBe('Active calories, Thu 22 Oct: 612 kcal (Apple Health)');
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

  it('keeps today\'s Apple steps when Garmin stored a row with no steps', () => {
    const today = '2026-10-23';
    const blank = {
      calendarDate: today,
      restingHeartRateBpm: null,
      averageHeartRateBpm: null,
      moderateMinutes: null,
      vigorousMinutes: null,
      steps: null,
      distanceMetres: null,
      floorsClimbed: null,
    };
    const steps = stepsSeries(today, 7, [{ day: today, value: 8421 }], [blank]);
    expect(steps.at(-1)).toMatchObject({ day: today, value: 8421, source: 'apple' });
    expect(steps.at(-1)?.label).toContain('8,421 steps (Apple Health)');
    expect(steps.at(-1)?.label).not.toContain(NO_STEPS_YET_TODAY);

    const garminOnly = stepsSeries(today, 7, [], [{ ...blank, steps: 3000 }]);
    expect(garminOnly.at(-1)).toMatchObject({ value: 3000, source: 'garmin' });
    expect(garminOnly.at(-1)?.label).toContain('(Garmin)');

    const neither = stepsSeries(today, 7, [], [blank, { ...blank, calendarDate: today, steps: 0 }]);
    expect(neither.at(-1)).toMatchObject({ value: 0, source: null, label: NO_STEPS_YET_TODAY });
    expect(neither.find((point) => point.day === '2026-10-22')?.label).not.toBe(NO_STEPS_YET_TODAY);

    const resting = restingSeries(today, 7, [{ day: today, value: 59 }], [blank]);
    expect(resting.at(-1)).toMatchObject({ value: 59, source: 'apple' });
    expect(resting.at(-1)?.label).toContain('59 bpm (Apple Health)');

    const distance = distanceSeries(today, 7, [blank, {
      calendarDate: '2026-10-22',
      restingHeartRateBpm: null,
      averageHeartRateBpm: null,
      moderateMinutes: null,
      vigorousMinutes: null,
      distanceMetres: 4200,
    }]);
    expect(distance.at(-1)).toMatchObject({ day: today, value: 0, source: null });
    expect(distance.at(-1)?.label).not.toContain('(Garmin)');
    expect(distance.find((point) => point.day === '2026-10-22')?.source).toBe('garmin');

    const floors = floorsSeries(today, 7, [blank, {
      calendarDate: '2026-10-22',
      restingHeartRateBpm: null,
      averageHeartRateBpm: null,
      moderateMinutes: null,
      vigorousMinutes: null,
      floorsClimbed: 9,
    }]);
    expect(floors.at(-1)).toMatchObject({ day: today, value: 0, source: null });
    expect(floors.at(-1)?.label).not.toContain('(Garmin)');
    expect(floors.find((point) => point.day === '2026-10-22')).toMatchObject({ value: 9, source: 'garmin' });

    expect(readFileSync('src/ui/DailyActivity.tsx', 'utf8')).toContain('NO_STEPS_YET_TODAY');
    const sync = readFileSync('src/health/sync.ios.ts', 'utf8');
    const stepsRead = sync.slice(sync.indexOf('HKQuantityTypeIdentifierStepCount'), sync.indexOf("rows('steps'"));
    expect(stepsRead).toContain('dailyStatisticsAnchor(end)');
    expect(stepsRead).toContain('dailyStatisticsEnd(end)');
    expect(stepsRead).toContain("['cumulativeSum'],\n      dailyStatisticsAnchor(end),");
    expect(readFileSync('src/health/dailyActivity.ios.ts', 'utf8')).toContain('dailyStatisticsAnchor(end)');
    expect(readFileSync('app.json', 'utf8')).toContain('"buildNumber": "54"');
  });

  it('captions each chart from the days that have a number', () => {
    const apple = [{ day: '2026-10-22', value: 80 }];
    const garmin = {
      calendarDate: '2026-10-21',
      restingHeartRateBpm: 55,
      averageHeartRateBpm: null,
      moderateMinutes: 10,
      vigorousMinutes: 5,
      activeKilocalories: 200,
      steps: 4000,
      distanceMetres: 3000,
      floorsClimbed: 4,
    };
    const zero = {
      calendarDate: '2026-10-23',
      restingHeartRateBpm: null,
      averageHeartRateBpm: null,
      moderateMinutes: 0,
      vigorousMinutes: 0,
      activeKilocalories: 0,
      steps: 0,
      distanceMetres: 0,
      floorsClimbed: 0,
    };
    const today = '2026-10-23';

    expect(chartSourceCaption(exerciseSeries(end, 7, apple, []), { vigorous: true })).toBe(APPLE_SOURCE);
    expect(chartSourceCaption(exerciseSeries(end, 7, [], [garmin]), { vigorous: true })).toBe(GARMIN_EXERCISE_SOURCE);
    expect(chartSourceCaption(exerciseSeries(end, 7, apple, [garmin]), { vigorous: true })).toBe('(Apple Health and Garmin, vigorous counted twice)');
    const exerciseZero = exerciseSeries(today, 7, [{ day: '2026-10-22', value: 60 }], [zero]);
    expect(exerciseZero.find((point) => point.day === today)?.source).toBeNull();
    expect(chartSourceCaption(exerciseZero, { vigorous: true })).toBe(APPLE_SOURCE);

    expect(chartSourceCaption(calorieSeries(end, 7, apple, []))).toBe(APPLE_SOURCE);
    expect(chartSourceCaption(calorieSeries(end, 7, [], [garmin]))).toBe(GARMIN_SOURCE);
    expect(chartSourceCaption(calorieSeries(end, 7, apple, [garmin]))).toBe(APPLE_AND_GARMIN_SOURCE);
    const calorieZero = calorieSeries(today, 7, [{ day: '2026-10-22', value: 400 }], [zero]);
    expect(chartSourceCaption(calorieZero)).toBe(APPLE_SOURCE);

    expect(chartSourceCaption(stepsSeries(end, 7, apple, []))).toBe(APPLE_SOURCE);
    expect(chartSourceCaption(stepsSeries(end, 7, [], [garmin]))).toBe(GARMIN_SOURCE);
    expect(chartSourceCaption(stepsSeries(end, 7, apple, [garmin]))).toBe(APPLE_AND_GARMIN_SOURCE);
    expect(chartSourceCaption(stepsSeries(today, 7, [{ day: '2026-10-22', value: 1000 }], [zero]))).toBe(APPLE_SOURCE);

    expect(chartSourceCaption(restingSeries(end, 7, apple, []))).toBe(APPLE_SOURCE);
    expect(chartSourceCaption(restingSeries(end, 7, [], [garmin]))).toBe(GARMIN_SOURCE);
    expect(chartSourceCaption(restingSeries(end, 7, apple, [garmin]))).toBe(APPLE_AND_GARMIN_SOURCE);

    expect(chartSourceCaption(distanceSeries(end, 7, [], apple))).toBe(APPLE_SOURCE);
    expect(chartSourceCaption(distanceSeries(end, 7, [garmin]))).toBe(GARMIN_SOURCE);
    expect(chartSourceCaption(distanceSeries(end, 7, [garmin], apple))).toBe(APPLE_AND_GARMIN_SOURCE);

    expect(chartSourceCaption(floorsSeries(end, 7, [], apple))).toBe(APPLE_SOURCE);
    expect(chartSourceCaption(floorsSeries(end, 7, [garmin]))).toBe(GARMIN_SOURCE);
    expect(chartSourceCaption(floorsSeries(end, 7, [garmin], apple))).toBe(APPLE_AND_GARMIN_SOURCE);

    const charts = readFileSync('src/ui/DailyActivity.tsx', 'utf8');
    expect(charts).toContain('chartSourceCaption(exercise, { vigorous: true })');
    expect(charts).toContain('chartSourceCaption(calories)');
    expect(charts).toContain('chartSourceCaption(stepPoints)');
    expect(charts).toContain('chartSourceCaption(distance)');
    expect(charts).toContain('chartSourceCaption(floors)');
    expect(charts).toContain('chartSourceCaption(resting)');
    expect(charts).not.toContain('seriesUsesGarmin');
    expect(charts).toContain('EXERCISE_PERMISSION_HINT');
    expect(charts).toContain('openAppSettings()');
    expect(readFileSync('src/app/(main)/workouts.tsx', 'utf8')).toContain('exercisePermissionMissing(visibility)');
    expect(readFileSync('src/app/(main)/health.tsx', 'utf8')).toContain('<MovementCharts');
    expect(readFileSync('src/app/(main)/health-plan.tsx', 'utf8')).toContain('<MovementCharts');
    expect(readFileSync('src/app/(main)/stats.tsx', 'utf8')).toContain('<MovementCharts');
  });
});
