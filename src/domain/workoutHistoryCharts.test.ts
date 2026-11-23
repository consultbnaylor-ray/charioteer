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
  workoutSelectedHeading,
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
    expect(charts).toContain('title="Workout minutes"');
    expect(charts).toContain('title="Workouts"');
    expect(charts).toContain('memo(');
    expect(charts).not.toContain('Today so far');
    expect(charts).not.toContain('>Today<');
  });
});
