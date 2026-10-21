import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CHART_DIRECTION_HINT } from '@/domain/readingChart';
import {
  DIFFICULTY_LIST_FOLD,
  DIFFICULTY_NOTE,
  EFFORT_NAME,
  HEART_DIFFICULTY_NAME,
  ROUTE_MARK,
  WORKOUT_LIST_FOLD,
  chartDays,
  difficultyFor,
  difficultyMarks,
  durationBars,
  durationScaleLabel,
  foldedCount,
  londonClock,
  nextWorkoutDay,
  previousWorkoutDay,
  workoutActivityDays,
  workoutDaySummary,
  workoutRowLine,
  workoutWeek,
  workoutsOnDay,
} from '@/domain/workoutDay';
import { devFixtureWorkout, type DeviceWorkout } from '@/domain/workoutRoute';
import { londonDay } from '@/domain/healthInsights';

function workout(partial: Partial<DeviceWorkout> & Pick<DeviceWorkout, 'id' | 'startedAt'>): DeviceWorkout {
  return {
    activityType: 52,
    label: 'Walking',
    durationMinutes: 30,
    distanceMetres: null,
    energyKcal: null,
    averageHeartRate: null,
    routeExpected: false,
    ...partial,
  };
}

describe('workout day list', () => {
  const walk = devFixtureWorkout();

  it('writes the selected day as one line in London time', () => {
    expect(londonDay(walk.startedAt)).toBe('2026-10-18');
    expect(londonClock(walk.startedAt)).toBe('11:16');
    expect(workoutRowLine(walk)).toBe('Walking · 11:16 · 109 min · 6.3 km');
    expect(workoutRowLine(walk)).not.toContain('Oct');
    expect(workoutRowLine({ ...walk, distanceMetres: null, routeExpected: false })).toBe('Walking · 11:16 · 109 min');
  });

  it('summarises one day and dots only the days that have a workout', () => {
    const strength = workout({
      id: 'strength',
      label: 'Traditional Strength Training',
      startedAt: '2026-10-18T16:00:00.000Z',
      durationMinutes: 40,
      energyKcal: 280,
      routeExpected: false,
    });
    const day = workoutsOnDay([strength, walk], '2026-10-18');
    expect(day.map((row) => row.id)).toEqual([walk.id, strength.id]);
    expect(workoutDaySummary(day)).toBe('Total 149 min · Distance 6.3 km · Active energy 760 kcal');
    expect(workoutDaySummary([])).toBe('No workouts');
    expect(workoutDaySummary([strength])).toBe('Total 40 min · Active energy 280 kcal');
    const dots = workoutActivityDays([walk, strength]);
    expect(dots.has('2026-10-18')).toBe(true);
    expect(dots.has('2026-10-21')).toBe(false);
  });

  it('moves one day at a time and keeps the week on Monday', () => {
    expect(workoutWeek('2026-10-21')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(previousWorkoutDay('2026-10-21')).toBe('2026-10-20');
    expect(nextWorkoutDay('2026-10-20', '2026-10-21')).toBe('2026-10-21');
    expect(nextWorkoutDay('2026-10-21', '2026-10-21')).toBe('2026-10-21');
  });

  it('stacks duration oldest on the left and names every minute', () => {
    const older = workout({ id: 'older', startedAt: '2026-10-16T09:00:00.000Z', durationMinutes: 20, label: 'Running' });
    const bars = durationBars([walk, older], '2026-10-21', 7);
    expect(bars).toHaveLength(7);
    expect(bars[0]?.day).toBe('2026-10-15');
    expect(bars[bars.length - 1]?.day).toBe('2026-10-21');
    expect(bars.map((bar) => bar.day)).toEqual(chartDays('2026-10-21', 7));
    const friday = bars.find((bar) => bar.day === '2026-10-16');
    const sunday = bars.find((bar) => bar.day === '2026-10-18');
    expect(friday?.label).toBe('16 Oct 2026 · Duration 20 min · Running 20 min');
    expect(sunday?.segments).toEqual([{ label: 'Walking', minutes: 109 }]);
    expect(sunday?.label).toContain('Duration 109 min');
    expect(sunday?.label).toContain('Walking 109 min');
    expect(durationScaleLabel(bars)).toBe('Most in one day 109 min');
    const month = durationBars([walk], '2026-10-21', 30);
    expect(month).toHaveLength(30);
    expect(month[0]?.day < month[29]?.day).toBe(true);
    expect(month[0]?.totalMinutes).toBe(0);
    expect(month[0]?.label).toContain('Duration 0 min');
  });

  it('uses the effort score when Health has one, otherwise heart rate as a percent of max', () => {
    expect(difficultyFor(walk, 42)?.caption).toBe('Walking · 11:16 · Average heart rate 63% of max');
    expect(difficultyFor(walk, null)).toBeNull();
    const scored = difficultyFor({ ...walk, effortScore: 7, averageHeartRate: 112 }, null);
    expect(scored?.measureName).toBe(EFFORT_NAME);
    expect(scored?.unit).toBe('effort');
    expect(scored?.caption).toBe('Walking · 11:16 · Workout effort score 7 effort');
    expect(scored?.fill).toBeCloseTo(0.7);
    expect(difficultyFor({ ...walk, effortScore: 7, averageHeartRate: 112 }, 42)?.measureName).toBe(EFFORT_NAME);
    expect(difficultyFor({ ...walk, effortScore: 0, averageHeartRate: null }, 42)).toBeNull();
    const marks = difficultyMarks(
      [walk, workout({ id: 'later', startedAt: '2026-10-20T08:00:00.000Z', averageHeartRate: 150, effortScore: 8 })],
      '2026-10-21',
      7,
      42,
    );
    expect(marks.map((mark) => mark.id)).toEqual([walk.id, 'later']);
    expect(marks[0]?.measureName).toBe(HEART_DIFFICULTY_NAME);
    expect(marks[1]?.caption).toContain('Workout effort score 8 effort');
    expect(marks[0] && marks[1] && marks[0].day < marks[1].day).toBe(true);
    const outside = difficultyMarks([walk], '2026-11-20', 7, 42);
    expect(outside).toEqual([]);
  });

  it('folds a long day and keeps the chart hint on the list', () => {
    expect(foldedCount(WORKOUT_LIST_FOLD, WORKOUT_LIST_FOLD)).toBe(0);
    expect(foldedCount(WORKOUT_LIST_FOLD + 3, WORKOUT_LIST_FOLD)).toBe(3);
    expect(foldedCount(DIFFICULTY_LIST_FOLD + 1, DIFFICULTY_LIST_FOLD)).toBe(1);
    expect(CHART_DIRECTION_HINT).toBe('Older ← → Newer');
    expect(DIFFICULTY_NOTE).toContain(EFFORT_NAME);
    expect(DIFFICULTY_NOTE).toContain('% of max');
    const list = readFileSync('src/ui/WorkoutList.tsx', 'utf8');
    const calendar = readFileSync('src/ui/WorkoutCalendar.tsx', 'utf8');
    const reader = readFileSync('src/health/workoutRoute.ios.ts', 'utf8');
    expect(list).toContain('/workout/');
    expect(list).toContain('CHART_DIRECTION_HINT');
    expect(list).toContain(ROUTE_MARK);
    expect(list).not.toContain('No GPS route');
    expect(list).not.toContain('scrollTo');
    expect(calendar).toContain('View route');
    expect(calendar).not.toContain('No GPS route');
    expect(reader).toContain('HKQuantityTypeIdentifierWorkoutEffortScore');
    expect(reader).toContain('filter: { date: { startDate: start, endDate: end } }');
    const listed = reader.slice(reader.indexOf('export async function listDeviceWorkouts'), reader.indexOf('async function heartSamples'));
    expect(listed).not.toContain('requestAuthorization');
    expect(listed).not.toContain('getWorkoutRoutes');
    expect(listed).not.toContain('if (!isHealthDataAvailable()) return []');
    expect(listed.indexOf('devFixtureWorkout()')).toBeGreaterThan(listed.lastIndexOf('isHealthDataAvailable'));
  });
});
