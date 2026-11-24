import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { dailyRowsFor, garminCoachLines, mapGarminPush, missingColumn, readingsFromRows } from '../../supabase/functions/_shared/garmin';
import { HEALTH_KINDS, weekdayShort } from './healthInsights';
import { periodDayCount } from './statWindow';
import {
  DAILY_ACTIVITY_RINGS_HINT,
  DAILY_ACTIVITY_TAP_HINT,
  APPLE_AND_GARMIN_SOURCE,
  APPLE_SOURCE,
  GARMIN_CALORIE_SOURCE,
  GARMIN_SOURCE,
  GARMIN_VIGOROUS_MINUTE_WEIGHT,
  NO_STEPS_YET_TODAY,
  activityDayName,
  activityAverageLine,
  activityBarAxis,
  activityFullDayStats,
  calorieSeries,
  chartSourceCaption,
  distanceSeries,
  weekDistanceSummary,
  exerciseChartCaption,
  exerciseSeries,
  garminMinuteSeries,
  floorsSeries,
  garminLatestLines,
  restingSeries,
  stepsSeries,
  garminExerciseMinutes,
  activityAxisPlan,
  activityScaleLine,
  chartScalePeak,
  mostInOneDay,
  rangeScaleLine,
  viewedDayHeading,
} from './dailyActivity';

const end = '2026-10-22';

describe('daily activity', () => {
  it('names today, yesterday, and an earlier UK date', () => {
    expect(viewedDayHeading('2026-11-04', '2026-11-04', new Date('2026-11-04T06:00:00Z'))).toBe('Today so far');
    expect(viewedDayHeading('2026-11-03', '2026-11-04')).toBe('Yesterday');
    expect(viewedDayHeading('2026-11-03', '2026-11-05')).toBe('On Tue 3 Nov');
    expect(rangeScaleLine({
      points: [{ day: '2026-11-03', value: 8000, source: 'garmin' }],
      unit: 'steps',
      days: 1,
      today: '2026-11-04',
    })).toBe('Yesterday: 8,000 steps (Garmin)');
  });

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
    expect(exercise.find((point) => point.day === '2026-10-22')?.label).toBe('Exercise minutes, Thu 22 Oct: 34 min. Apple Health. Not doubled.');
    expect(exercise.find((point) => point.day === '2026-10-21')?.label).toBe('Exercise minutes, Wed 21 Oct: 40 min. Garmin. 20 moderate and 10 vigorous, vigorous counted twice.');
    expect(exercise.find((point) => point.day === '2026-10-20')?.label).toBe('No exercise minutes for Tue 20 Oct.');
    expect(activityDayName('2026-10-22')).toBe('Thu 22 Oct');
    expect(mostInOneDay(exercise, 'min')).toBe('Most in one day 40 min (Garmin)');
    expect(rangeScaleLine({
      points: [{ value: 4357, source: 'garmin' }],
      unit: 'steps',
      days: 1,
      cumulative: true,
      now: new Date('2026-11-03T10:14:00Z'),
    })).toBe('Today so far: 4,357 steps (Garmin)');
    expect(rangeScaleLine({
      points: [{ value: 4357, source: 'garmin' }],
      unit: 'steps',
      days: 1,
      cumulative: true,
      now: new Date('2026-11-03T18:00:00Z'),
    })).toBe('Today: 4,357 steps (Garmin)');
    expect(rangeScaleLine({
      points: [{ value: 40, source: 'garmin' }, { value: 20, source: 'garmin' }],
      unit: 'min',
      days: 7,
    })).toBe('Most in one day 40 min (Garmin)');
    expect(rangeScaleLine({
      points: [{ value: 62, source: 'garmin' }],
      unit: 'bpm',
      days: 1,
      cumulative: false,
      now: new Date('2026-11-03T10:14:00Z'),
    })).toBe('Today: 62 bpm (Garmin)');

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
    expect(list.indexOf('<WorkoutHistoryCharts')).toBeLessThan(list.indexOf('<DailyActivityCharts'));
    expect(list.indexOf('<DailyActivityCharts')).toBeLessThan(list.indexOf('<WorkoutHistory '));
    const diaryStart = charts.indexOf('<MovementCharts');
    const diary = charts.slice(diaryStart, charts.indexOf('/>', diaryStart));
    expect(diary).toContain('showHealthStats={false}');
    expect(diary).toContain('showIntensity={false}');
    const health = readFileSync('src/app/(main)/health.tsx', 'utf8');
    const healthCharts = health.slice(health.indexOf('<MovementCharts'), health.indexOf('/>', health.indexOf('<MovementCharts')));
    expect(healthCharts).not.toContain('showHealthStats');
    expect(healthCharts).toContain('steps=');
    expect(healthCharts).toContain('restingHeart=');
    expect(charts).toContain('Activity charts');
    expect(readFileSync('src/ui/WorkoutHistoryCharts.tsx', 'utf8')).toContain('Workout History Charts');
    expect(charts).toContain('const [chartsOpen, setChartsOpen] = useState(false)');
    expect(charts).toContain('title={chart.title}');
    expect(charts).toContain('Not medical advice. Not a diagnosis.');
    expect(charts).toContain('title="Steps"');
    expect(charts).toContain('title="Distance"');
    expect(charts).toContain('title="Resting heart rate"');
    expect(charts).toContain('title="Heart rate variability"');
    expect(charts).toContain('showHealthStats && fitnessChart');
    expect(charts).toContain('showHealthStats && (foldDetails.length > 0 || placeholders.length > 0)');
    expect(readFileSync('src/app/(main)/garmin-stats.tsx', 'utf8')).toContain('<MovementCharts');
    expect(charts).toContain('{DAILY_ACTIVITY_RINGS_HINT}');
    expect(charts).toContain('{DAILY_ACTIVITY_TAP_HINT}');
    expect(charts).toContain('accessibilityLabel={`${point.day === today ? \'Today so far. \' : \'\'}${point.label}. Select this day.`}');
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
    const fullerWatch = stepsSeries(end, 7, [{ day: '2026-10-22', value: 3799 }], [
      { calendarDate: '2026-10-22', restingHeartRateBpm: null, averageHeartRateBpm: null, moderateMinutes: null, vigorousMinutes: null, steps: 7880 },
    ]);
    expect(fullerWatch.find((point) => point.day === '2026-10-22')).toMatchObject({ value: 7880, source: 'garmin' });
    expect(fullerWatch.find((point) => point.day === '2026-10-22')?.label).toContain('(Garmin)');
    expect(fullerWatch.find((point) => point.day === '2026-10-22')?.value).not.toBe(3799 + 7880);
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
    const sameDay = restingSeries(end, 7, [{ day: '2026-10-21', value: 61 }], [
      { calendarDate: '2026-10-21', restingHeartRateBpm: 52, averageHeartRateBpm: 70, moderateMinutes: null, vigorousMinutes: null },
    ]);
    expect(sameDay.find((point) => point.day === '2026-10-21')).toMatchObject({ value: 52, source: 'garmin' });
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
    expect(charts).toContain('GARMIN_DETAILS_TITLE');
    expect(charts).toContain('useStatPeriod');
    expect(charts).not.toContain('garminLatestLines');
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
    const buildNumber = JSON.parse(readFileSync('app.json', 'utf8')).expo.ios.buildNumber as string;
    expect(buildNumber).toMatch(/^\d+$/);
    expect(Number(buildNumber)).toBeGreaterThanOrEqual(71);
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

    expect(exerciseChartCaption(exerciseSeries(end, 7, apple, []))).toBe('Apple Health. Plain minutes. Not doubled.');
    expect(exerciseChartCaption(exerciseSeries(end, 7, [], [garmin]))).toBe('Garmin. Each vigorous minute is counted twice.');
    expect(exerciseChartCaption(exerciseSeries(end, 7, apple, [garmin]))).toBe('Apple days are plain exercise minutes. Garmin days count each vigorous minute twice.');
    const exerciseZero = exerciseSeries(today, 7, [{ day: '2026-10-22', value: 60 }], [zero]);
    expect(exerciseZero.find((point) => point.day === today)?.source).toBeNull();
    expect(exerciseChartCaption(exerciseZero)).toBe('Apple Health. Plain minutes. Not doubled.');
    const moderate = garminMinuteSeries(today, 7, [garmin, zero], 'moderate');
    expect(moderate.find((point) => point.day === '2026-10-21')).toMatchObject({ value: 10, source: 'garmin', empty: false });
    expect(moderate.find((point) => point.day === '2026-10-23')).toMatchObject({ value: 0, source: 'garmin', empty: false });
    expect(moderate.find((point) => point.day === '2026-10-22')?.empty).toBe(true);
    expect(moderate.find((point) => point.day === '2026-10-22')?.label).toContain('No Garmin moderate minutes');
    const vigorous = garminMinuteSeries(end, 7, [garmin], 'vigorous');
    expect(vigorous.find((point) => point.day === '2026-10-21')?.label).toBe('Vigorous minutes, Wed 21 Oct: 5 min. Garmin.');

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
    expect(charts).toContain('exerciseChartCaption(exercise)');
    expect(charts).toContain('{exerciseDay.label}');
    expect(charts).toContain('title="Moderate minutes"');
    expect(charts).toContain('title="Vigorous minutes"');
    expect(charts.indexOf('title="Exercise minutes"')).toBeLessThan(charts.indexOf('title="Moderate minutes"'));
    expect(charts.indexOf('title="Moderate minutes"')).toBeLessThan(charts.indexOf('title="Vigorous minutes"'));
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
    expect(readFileSync('src/app/(main)/health-plan.tsx', 'utf8')).not.toContain('<MovementCharts');
    expect(charts).toContain('Not medical advice. Not a diagnosis.');
    expect(charts).toContain('numberOfLines={1}');
    expect(charts).toContain('activityBarAxis');
    expect(charts).toContain('goodZoneBand');
    expect(charts).not.toContain('barSourceName');
  });

  it('marks Mondays on a month chart and month names on a longer one', () => {
    const month = daysEnding('2026-11-01', 30);
    const monthMarks = activityAxisPlan(month).filter((mark) => mark.label);
    expect(monthMarks.map((mark) => mark.label)).toEqual(['5 Oct', '12 Oct', '19 Oct', '26 Oct', '1 Nov']);
    expect(monthMarks.filter((mark) => mark.divider).map((mark) => month[mark.index])).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(activityAxisPlan(daysEnding('2026-11-03', 30)).filter((mark) => mark.label).at(-1)?.label).toBe('3 Nov');
    expect(activityAxisPlan(daysEnding('2026-11-03', 30)).some((mark) => mark.label === '2 Nov')).toBe(false);
    const quarter = activityAxisPlan(daysEnding('2026-11-01', 90)).filter((mark) => mark.label);
    expect(quarter.map((mark) => mark.label)).toEqual(['Sep', 'Oct', 'Nov']);
    expect(activityAxisPlan(daysEnding('2026-10-22', 7))).toEqual([]);
    expect(chartScalePeak([
      { value: 0, source: null },
      { value: 9000, empty: true, source: 'garmin' },
      { value: 4200, source: 'apple' },
    ], [8000])).toBe(8000);
    expect(activityScaleLine('Most in one day 68 bpm (Apple Health)', '(Apple Health and Garmin)')).toBe('Most in one day 68 bpm (Apple Health and Garmin)');
    expect(activityScaleLine('Most in one day 40 min (Garmin)', 'Garmin. Plain minutes, not doubled.')).toBe('Most in one day 40 min. Garmin. Plain minutes, not doubled.');
    expect(activityScaleLine('Most in one day 4.2 km', '(Garmin)')).toBe('Most in one day 4.2 km (Garmin)');
  });

  it('averages full days only and says today so far only on an open today', () => {
    const points = [
      { day: '2026-11-14', value: 11600 },
      { day: '2026-11-15', value: 4800 },
      { day: '2026-11-20', value: 5200 },
    ];
    const open = weekDistanceSummary(points, '2026-11-20', new Date('2026-11-20T08:00:00Z'));
    expect(open?.total).toBe('21.6 km');
    expect(open?.average).toBe('8.2 km/day avg');
    expect(open?.line).toContain('Today 5.2 km so far');
    expect(open?.line).not.toMatch(/Today so far.*Today so far/);
    const past = weekDistanceSummary(points, '2026-11-21', new Date('2026-11-21T08:00:00Z'));
    expect(past?.line).not.toContain('Today so far');
    expect(past?.line).not.toContain('so far');
    expect(past?.average).toBe('7.2 km/day avg');
  });
});

describe('workout history activity range', () => {
  const today = '2026-11-24';
  const blank = {
    restingHeartRateBpm: null,
    averageHeartRateBpm: null,
    moderateMinutes: null,
    vigorousMinutes: null,
  };

  it('maps the selected range to one bar per day and leaves today out of the average', () => {
    const days = periodDayCount('7');
    const exercise = exerciseSeries(today, days, [
      { day: today, value: 53 },
      { day: '2026-11-22', value: 10 },
      { day: '2026-11-18', value: 30 },
      { day: '2026-11-17', value: 80 },
    ], []);
    expect(exercise).toHaveLength(7);
    expect(exercise.map((point) => point.day)).toEqual([
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
      '2026-11-24',
    ]);
    expect(exercise.find((point) => point.day === '2026-11-22')?.value).toBe(10);
    expect(exercise.find((point) => point.day === today)?.value).toBe(53);
    expect(exercise.some((point) => point.day === '2026-11-17')).toBe(false);

    const stats = activityFullDayStats(exercise, today);
    expect(stats.days).toBe(6);
    expect(stats.sum).toBe(40);
    expect(stats.average).toBe(40 / 6);
    expect(stats.average).not.toBe((40 + 53) / 6);
    expect(stats.average).not.toBe((40 + 53) / 7);
    expect(activityAverageLine(stats.average, stats.days, '7 min')).toBe('Average 7 min a day over 6 full days.');
    expect(activityAverageLine(stats.average, stats.days, '7 min')).not.toMatch(/Today/);
    expect(activityAverageLine(null, 0, '')).toBe('Not enough finished days for an average yet.');

    const onlyToday = activityFullDayStats(exerciseSeries(today, days, [{ day: today, value: 53 }], []), today);
    expect(onlyToday).toEqual({ sum: null, average: null, days: 0 });
  });

  it('counts quiet days after the first reading and ignores days before any reading', () => {
    const steps = stepsSeries(today, periodDayCount('30'), [{ day: '2026-11-20', value: 8000 }], []);
    expect(steps).toHaveLength(30);
    expect(steps.filter((point) => point.value > 0).map((point) => point.day)).toEqual(['2026-11-20']);
    const stats = activityFullDayStats(steps, today);
    expect(stats.days).toBe(4);
    expect(stats.sum).toBe(8000);
    expect(stats.average).toBe(2000);
    expect(steps.some((point) => point.day < '2026-11-20' && point.value > 0)).toBe(false);

    const distance = distanceSeries(today, periodDayCount('90'), [
      { calendarDate: '2026-11-22', restingHeartRateBpm: null, averageHeartRateBpm: null, moderateMinutes: null, vigorousMinutes: null, distanceMetres: 4200 },
    ]);
    expect(distance).toHaveLength(90);
    expect(distance.find((point) => point.day === '2026-11-22')?.value).toBe(4200);
    expect(activityFullDayStats(distance, today)).toMatchObject({ days: 2, sum: 4200, average: 2100 });

    const resting = restingSeries(today, periodDayCount('7'), [
      { day: '2026-11-20', value: 60 },
      { day: '2026-11-23', value: 58 },
    ], []);
    expect(resting).toHaveLength(7);
    expect(resting.find((point) => point.day === '2026-11-23')).toMatchObject({ value: 58, source: 'apple' });
    expect(activityFullDayStats(resting, today, 'skip')).toEqual({ days: 2, sum: 118, average: 59 });
    expect(activityFullDayStats(resting, today).days).toBe(4);

    const moderate = garminMinuteSeries(today, periodDayCount('7'), [
      { ...blank, calendarDate: '2026-11-22', moderateMinutes: 20, vigorousMinutes: 0 },
      { ...blank, calendarDate: '2026-11-23', moderateMinutes: 0, vigorousMinutes: 0 },
    ], 'moderate');
    expect(moderate).toHaveLength(7);
    expect(moderate.find((point) => point.day === '2026-11-22')).toMatchObject({ value: 20, empty: false });
    expect(moderate.find((point) => point.day === '2026-11-23')).toMatchObject({ value: 0, source: 'garmin', empty: false });
    expect(moderate.find((point) => point.day === '2026-11-21')?.empty).toBe(true);
    expect(activityFullDayStats(moderate, today)).toEqual({ sum: 20, average: 10, days: 2 });

    const vigorous = garminMinuteSeries(today, periodDayCount('30'), [
      { ...blank, calendarDate: '2026-11-10', moderateMinutes: 0, vigorousMinutes: 12 },
    ], 'vigorous');
    expect(vigorous).toHaveLength(30);
    const vigorousStats = activityFullDayStats(vigorous, today);
    expect(vigorousStats.sum).toBe(12);
    expect(vigorousStats.days).toBe(14);
    expect(vigorousStats.average).toBe(12 / 14);
    expect(vigorousStats.days).not.toBe(29);
  });

  it('uses weekday initials on a week and thins dates on a longer range', () => {
    const weekDays = daysEnding('2026-10-22', 7);
    const week = activityBarAxis(weekDays);
    expect(week.labels).toEqual(weekDays.map((day) => weekdayShort(day).slice(0, 1)));
    expect(week.dividers).toEqual([]);
    expect(week.labels).toHaveLength(7);

    const monthDays = daysEnding('2026-11-01', 30);
    const month = activityBarAxis(monthDays);
    expect(month.labels.filter(Boolean)).toEqual(['5 Oct', '12 Oct', '19 Oct', '26 Oct', '1 Nov']);
    expect(month.dividers.map((index) => monthDays[index])).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(month.labels.filter(Boolean).length).toBeLessThan(monthDays.length);

    const quarterDays = daysEnding('2026-11-01', 90);
    const quarter = activityBarAxis(quarterDays);
    expect(quarter.labels.filter(Boolean)).toEqual(['Sep', 'Oct', 'Nov']);
    expect(quarter.labels.filter(Boolean).length).toBeLessThan(10);

    const year = activityBarAxis(daysEnding(today, periodDayCount('12m')));
    expect(year.labels).toHaveLength(periodDayCount('12m'));
    expect(year.labels.filter(Boolean).length).toBeLessThan(20);
  });

  it('draws the workout bars from the shared range and keeps the rating and the explanation', () => {
    const charts = readFileSync('src/ui/DailyActivity.tsx', 'utf8');
    expect(charts).toContain('span={trendDays}');
    expect(charts).toContain('selected={endDay}');
    expect(charts).toContain('rangeBars');
    expect(charts).toContain("activityFullDayStats(points, today, cumulative ? 'zero' : 'skip')");
    expect(charts).toContain('onSelect={pickDay}');
    expect(charts).not.toContain('exerciseSeries(endDay, span');
    expect(charts).toContain('explanation={chart.explanation}');
    expect(charts).toContain('<RatingChip');
    expect(charts).toContain('<DataMeaning about={title}>');
    expect(charts).toContain('maxWidth: rangeBars ? 16 : undefined');
    const history = charts.slice(charts.indexOf('Activity charts'), charts.indexOf('title="Exercise minutes"'));
    expect(history).toContain('explanation={chart.explanation}');
    expect(history).not.toContain('meaning="none"');
  });
});

function daysEnding(end: string, count: number): string[] {
  const [year, month, date] = end.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(Date.UTC(year, month - 1, date - (count - 1 - index)));
    return day.toISOString().slice(0, 10);
  });
}
