import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { bucketChartPoints } from '@/domain/readingChart';
import {
  bucketWorkoutSeries,
  buildWorkoutHistoryCharts,
  workoutAverageLine,
  workoutBucketEnd,
  workoutDailyTotals,
  workoutDayForPoint,
  workoutFullDayAverage,
  workoutHistoryBucket,
  workoutHistoryPeriod,
  workoutPlaceName,
  workoutPlaceTitle,
  workoutRangeLine,
  workoutSelectedHeading,
  workoutSeriesChartable,
  workoutSeriesSubtitle,
  workoutSparseSummary,
  WORKOUT_HISTORY_PERIODS,
  type WorkoutHistorySample,
} from '@/domain/workoutHistoryCharts';

const TODAY = '2026-11-23';

function session(day: string, minutes: number, label: string, hour = 8): WorkoutHistorySample {
  return {
    startedAt: `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`,
    durationMinutes: minutes,
    label,
  };
}

describe('workout history range', () => {
  const workouts = [
    session('2026-11-18', 11, 'Cardio', 7),
    session('2026-11-18', 36, 'Strength', 7),
    session('2026-11-23', 20, 'Cardio', 9),
    session('2026-11-18', 0, 'Walking', 12),
  ];

  it('uses the shared ranges and keeps a stored Day or 6 months on a chip this chart has', () => {
    expect(WORKOUT_HISTORY_PERIODS).toEqual(['7', '30', '60', '90', '12m']);
    expect(workoutHistoryPeriod('30')).toBe('30');
    expect(workoutHistoryPeriod('12m')).toBe('12m');
    expect(workoutHistoryPeriod('day')).toBe('7');
    expect(workoutHistoryPeriod('6m')).toBe('90');
    expect(workoutHistoryBucket('7')).toBe('day');
    expect(workoutHistoryBucket('90')).toBe('day');
    expect(workoutHistoryBucket('12m')).toBe('month');
  });

  it('averages finished days only, including rest days, and leaves the current day out', () => {
    const days = workoutDailyTotals(workouts, TODAY, '7');
    expect(days).toHaveLength(7);
    expect(days[0]?.day).toBe('2026-11-17');
    expect(days[days.length - 1]?.day).toBe(TODAY);
    expect(days.find((day) => day.day === '2026-11-18')).toMatchObject({
      minutes: 47,
      sessions: 2,
      byType: { Cardio: 11, Strength: 36 },
    });
    expect(days.find((day) => day.day === '2026-11-17')).toMatchObject({ minutes: 0, sessions: 0 });
    expect(days.find((day) => day.day === TODAY)?.minutes).toBe(20);

    const average = workoutFullDayAverage(days, TODAY);
    expect(average.days).toBe(6);
    expect(average.minutes).toBe(47 / 6);
    expect(average.sessions).toBe(2 / 6);
    expect(average.minutes).not.toBe((47 + 20) / 6);
    expect(average.minutes).not.toBe(47);
    expect(workoutAverageLine('minutes', average.minutes, average.days)).toBe('Average 8 min a day over 6 full days.');
    expect(workoutAverageLine('workouts', average.sessions, average.days)).toBe('Average 0.3 workouts a day over 6 full days.');
    expect(workoutAverageLine('minutes', average.minutes, average.days)).not.toMatch(/Today/);
    expect(workoutAverageLine('minutes', null, 0)).toBe('Not enough finished days for an average yet.');
  });

  it('names a past day by its date', () => {
    expect(workoutSelectedHeading('2026-11-16')).toBe('Mon 16 Nov 2026');
    expect(workoutSelectedHeading('2026-11-16')).not.toMatch(/Today/);
    expect(workoutSelectedHeading(TODAY)).toBe('Mon 23 Nov 2026');
  });

  it('buckets 12 months by month, and a week by the Monday the other charts use', () => {
    const year = [
      session('2025-01-01', 99, 'Running'),
      session('2026-01-05', 30, 'Strength'),
      session('2026-01-12', 20, 'Strength'),
      session('2026-10-16', 40, 'Cardio'),
      session(TODAY, 15, 'Cardio'),
    ];
    const model = buildWorkoutHistoryCharts(year, TODAY, '12m');
    expect(model.days).toHaveLength(365);
    expect(model.bucket).toBe('month');
    expect(model.fullDays).toBe(364);
    expect(model.averageMinutes).toBe(90 / 364);
    expect(model.averageSessions).toBe(3 / 364);
    expect(model.minuteBuckets.map((point) => point.day)).toEqual(['2026-01-01', '2026-10-01', '2026-11-01']);
    expect(model.minuteBuckets).toEqual([
      { day: '2026-01-01', value: 50 },
      { day: '2026-10-01', value: 40 },
      { day: '2026-11-01', value: 15 },
    ]);
    expect(model.sessionBuckets.find((point) => point.day === '2026-01-01')?.value).toBe(2);
    expect(model.types.map((type) => type.label)).toEqual(['Cardio', 'Strength']);
    expect(model.types.find((type) => type.label === 'Strength')?.average).toBe(50 / 364);
    expect(model.types.find((type) => type.label === 'Cardio')?.average).toBe(40 / 364);
    expect(model.minutes.some((point) => point.day === '2025-01-01')).toBe(false);

    const week = bucketChartPoints([
      { day: '2026-10-12', value: 10 },
      { day: '2026-10-14', value: 15 },
      { day: '2026-10-19', value: 20 },
    ], 'week', 'sum');
    expect(week).toEqual([
      { day: '2026-10-12', value: 25 },
      { day: '2026-10-19', value: 20 },
    ]);
    expect(workoutBucketEnd('2026-10-12', 'week')).toBe('2026-10-18');
    expect(workoutBucketEnd('2026-10-01', 'month')).toBe('2026-10-31');
    expect(bucketWorkoutSeries([{ day: '2026-11-18', value: 47 }], '7')).toEqual([{ day: '2026-11-18', value: 47 }]);
  });

  it('opens the busiest day in a tapped week or month', () => {
    const days = [
      { day: '2026-10-16', minutes: 40 },
      { day: '2026-10-18', minutes: 10 },
      { day: '2026-10-20', minutes: 10 },
      { day: '2026-11-02', minutes: 12 },
    ];
    expect(workoutDayForPoint('2026-10-01', 'month', days, TODAY)).toBe('2026-10-16');
    expect(workoutDayForPoint('2026-10-19', 'week', [
      { day: '2026-10-19', minutes: 10 },
      { day: '2026-10-21', minutes: 10 },
    ], TODAY)).toBe('2026-10-21');
    expect(workoutDayForPoint('2026-11-18', 'day', [{ day: '2026-11-18', minutes: 47 }], TODAY)).toBe('2026-11-18');
    expect(workoutDayForPoint('2026-12-01', 'day', [], TODAY)).toBe(TODAY);
  });

  it('draws the range charts with the shared period and a date heading', () => {
    const list = readFileSync('src/ui/WorkoutList.tsx', 'utf8');
    const charts = readFileSync('src/ui/WorkoutHistoryCharts.tsx', 'utf8');
    expect(list.indexOf('<WorkoutHistoryCharts')).toBeLessThan(list.indexOf('<HowItFelt'));
    expect(list.indexOf('<WorkoutHistoryCharts')).toBeLessThan(list.indexOf('<DailyActivityCharts'));
    expect(list).toContain('workoutSelectedHeading(day)');
    expect(list).not.toContain('>Today<');
    expect(list).not.toContain('Today so far');
    expect(list).not.toContain('<DurationChart');
    expect(charts).toContain('Workout History Charts');
    expect(charts).toContain('useStatPeriod');
    expect(charts).toContain('StatPeriodToggle');
    expect(charts).toContain('WORKOUT_HISTORY_PERIODS');
    expect(charts).toContain('<ReadingChart');
    expect(charts).toContain('meaning="none"');
    expect(charts).toContain('<DataMeaning');
    expect(charts).toContain('{WORKOUT_HISTORY_HINT}');
    expect(charts).toContain('CHART_DIRECTION_HINT');
    expect(charts).toContain('workoutTypeColor');
    expect(charts).toContain('chartAccent');
    expect(charts).toContain('title={series.title}');
    expect(charts).toContain('subtitle={series.subtitle}');
    expect(charts).toContain('rangeLine={series.rangeLine}');
    expect(charts).toContain('series.chartable');
    expect(charts).toContain('series.summary');
    expect(charts).toContain('>Places<');
    expect(charts).toContain('useState(false)');
    expect(charts).toContain('memo(');
    expect(charts).not.toContain('Today so far');
    expect(charts).not.toContain('>Today<');
    expect(charts).not.toContain('`${type.label} minutes`');
  });
});

describe('workout history series', () => {
  function named(
    day: string,
    minutes: number,
    label: string,
    activityType: number,
    origin: 'garmin' | 'apple' = 'garmin',
    hour = 8,
  ): WorkoutHistorySample {
    return {
      startedAt: `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`,
      durationMinutes: minutes,
      label,
      activityType,
      origin,
    };
  }

  it('reads a place out of a Garmin activity name and leaves a plain type alone', () => {
    expect(workoutPlaceName('SOUTH DERBYSHIRE WALKING', 'Walking')).toBe('South Derbyshire');
    expect(workoutPlaceName('South Derbyshire Walking', 'Walking')).toBe('South Derbyshire');
    expect(workoutPlaceName('South Derbyshire - Walking', 'Walking')).toBe('South Derbyshire');
    expect(workoutPlaceName('Walking', 'Walking')).toBeNull();
    expect(workoutPlaceName('Morning run', 'Running')).toBeNull();
    expect(workoutPlaceName('Evening walk', 'Walking')).toBeNull();
    expect(workoutPlaceName('Cardio', 'Mixed cardio')).toBeNull();
    expect(workoutPlaceTitle('Walking', 'South Derbyshire')).toBe('Walks in South Derbyshire');
    expect(workoutPlaceTitle('Running', 'Richmond Park')).toBe('Runs in Richmond Park');
    expect(workoutPlaceTitle('Boxing', 'South Derbyshire')).toBe('Boxing in South Derbyshire');
  });

  it('keeps every day in range and groups place names into one activity', () => {
    const model = buildWorkoutHistoryCharts([
      named('2026-11-01', 40, 'SOUTH DERBYSHIRE WALKING', 52),
      named('2026-11-15', 30, 'Derby Walking', 52),
      named('2026-11-22', 56, 'South Derbyshire Walking', 52),
      named('2026-10-01', 99, 'SOUTH DERBYSHIRE WALKING', 52),
      named('2026-11-18', 20, 'Cardio', 73, 'apple', 18),
      named('2026-11-20', 25, 'Cardio', 73, 'apple', 18),
    ], TODAY, '30');

    const walking = model.types.find((type) => type.label === 'Walking');
    expect(walking?.points.map((point) => point.day)).toEqual(['2026-11-01', '2026-11-15', '2026-11-22']);
    expect(walking?.points.find((point) => point.day === '2026-11-22')?.value).toBe(56);
    expect(walking?.points.some((point) => point.day === '2026-10-01')).toBe(false);
    expect(walking?.chartable).toBe(true);
    expect(walking?.sessions).toBe(3);
    expect(walking?.subtitle).toBe('Minutes of walking recorded by your Garmin each day.');
    expect(walking?.rangeLine).toBe('Lowest 30 min (15 Nov) · Highest 56 min (22 Nov)');
    expect(model.types.map((type) => type.label)).toEqual(['Walking', 'Mixed cardio']);
    expect(model.places.map((place) => place.title)).toEqual([
      'Walks in South Derbyshire',
      'Walks in Derby',
    ]);
    const south = model.places.find((place) => place.place === 'South Derbyshire');
    expect(south?.points.map((point) => point.day)).toEqual(['2026-11-01', '2026-11-22']);
    expect(south?.chartable).toBe(true);
    expect(south?.minutes).toBe(96);
    expect(south?.subtitle).toBe('Minutes of walking in South Derbyshire, recorded by your Garmin each day. Already included in Walking.');
    const derby = model.places.find((place) => place.place === 'Derby');
    expect(derby?.chartable).toBe(false);
    expect(derby?.summary).toBe('Walks in Derby: 1 session in the last 30 days, 30 min on 15 Nov.');
    expect(model.minuteSeries.chartable).toBe(true);
    expect(model.minuteSeries.title).toBe('Workout minutes');
    expect(model.sessionSeries.title).toBe('Workouts');
    expect(model.minuteSeries.subtitle).toBe('Total minutes from every workout, recorded by your Garmin and Apple Health each day.');
    expect(model.headline).toBe('');
  });

  it('writes a short line when a series has fewer than two points', () => {
    const model = buildWorkoutHistoryCharts([
      named('2026-11-22', 40, 'SOUTH DERBYSHIRE WALKING', 52, 'garmin', 9),
      named('2026-11-22', 16, 'South Derbyshire Walking', 52, 'garmin', 18),
    ], TODAY, '30');

    expect(workoutSeriesChartable([{ day: '2026-11-22', value: 56 }])).toBe(false);
    expect(workoutSeriesChartable([
      { day: '2026-11-17', value: 5 },
      { day: '2026-11-21', value: 25 },
    ])).toBe(true);
    expect(model.minuteSeries.chartable).toBe(false);
    expect(model.foldSingleType).toBe(true);
    expect(model.headline).toBe('Walking: 2 sessions in the last 30 days, 56 min on 22 Nov.');
    expect(model.types[0]?.summary).toBe('Walking: 2 sessions in the last 30 days, 56 min on 22 Nov.');
    expect(model.places[0]?.summary).toBe('Walks in South Derbyshire: 2 sessions in the last 30 days, 56 min on 22 Nov.');
    expect(model.places[0]?.chartable).toBe(false);
    expect(model.headline).not.toMatch(/Today/);
    expect(model.averageMinutes).toBe(56 / 29);
    expect(model.fullDays).toBe(29);
    expect(model.days.find((day) => day.day === TODAY)?.minutes).toBe(0);

    const lone = buildWorkoutHistoryCharts([
      named('2026-11-22', 56, 'SOUTH DERBYSHIRE WALKING', 52),
    ], TODAY, '30');
    expect(lone.headline).toBe('Walking: 1 session in the last 30 days, 56 min on 22 Nov.');
    expect(workoutSparseSummary('Walking', 1, 56, ['2026-11-22'], '30')).toBe(lone.headline);
  });

  it('names the lowest and highest days and still leaves today out of the average', () => {
    expect(workoutRangeLine([
      { day: '2026-11-17', value: 5 },
      { day: '2026-11-19', value: 12 },
      { day: '2026-11-21', value: 25 },
    ], 'min')).toBe('Lowest 5 min (17 Nov) · Highest 25 min (21 Nov)');
    expect(workoutRangeLine([
      { day: '2026-11-17', value: 20 },
      { day: '2026-11-21', value: 20 },
    ], 'min')).toBe('Lowest 20 min (17 Nov) · Highest 20 min (21 Nov)');
    expect(workoutRangeLine([
      { day: '2026-10-01', value: 40 },
      { day: '2026-11-01', value: 15 },
    ], 'min', 'month')).toBe('Lowest 15 min (Nov) · Highest 40 min (Oct)');
    expect(workoutRangeLine([
      { day: '2026-11-17', value: 1 },
      { day: '2026-11-21', value: 2 },
    ], 'workouts')).toBe('Lowest 1 workout (17 Nov) · Highest 2 workouts (21 Nov)');
    expect(workoutSeriesSubtitle({
      kind: 'activity',
      label: 'Walking',
      origins: ['apple'],
      bucket: 'day',
    })).toBe('Minutes of walking recorded in Apple Health each day.');
    expect(workoutSeriesSubtitle({
      kind: 'activity',
      label: 'Walking',
      origins: ['garmin'],
      bucket: 'month',
    })).toBe('Minutes of walking recorded by your Garmin each month.');

    const model = buildWorkoutHistoryCharts([
      named('2026-11-22', 56, 'Walking', 52),
      named('2026-11-23', 10, 'Walking', 52),
    ], TODAY, '30');
    expect(model.foldSingleType).toBe(true);
    expect(model.minuteSeries.title).toBe('Walking');
    expect(model.minuteSeries.subtitle).toBe('Minutes of walking recorded by your Garmin each day.');
    expect(model.types[0]?.chartable).toBe(true);
    expect(model.types[0]?.points.map((point) => point.value)).toEqual([56, 10]);
    expect(model.averageMinutes).toBe(56 / 29);
    expect(model.averageMinutes).not.toBe(66 / 29);
    expect(model.types[0]?.average).toBe(56 / 29);
    expect(model.types[0]?.averageLine).toBe('Average 2 min a day over 29 full days.');
    expect(model.types[0]?.averageLine).not.toMatch(/Today/);
    expect(model.places).toEqual([]);
  });
});
