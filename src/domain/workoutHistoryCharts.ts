import { londonDay, shiftDay } from '@/domain/healthInsights';
import { formatUkDate } from '@/domain/dates';
import { bucketChartPoints, chartBucketForPeriod, type ChartBucket, type ChartPoint } from '@/domain/readingChart';
import { periodDayCount, rollingWindow, type StatPeriod } from '@/domain/statWindow';

/**
 * Range chips on Workout History.
 * Day and 6 months stay on the other stat pages. This row matches the longer nutrition ranges.
 */
export const WORKOUT_HISTORY_PERIODS = ['7', '30', '60', '90', '12m'] as const satisfies readonly StatPeriod[];

export type WorkoutHistoryPeriod = (typeof WORKOUT_HISTORY_PERIODS)[number];

export type WorkoutHistorySample = {
  startedAt: string;
  durationMinutes: number;
  label: string;
};

export type WorkoutDayTotal = {
  day: string;
  minutes: number;
  sessions: number;
  byType: Readonly<Record<string, number>>;
};

/** The stored period, narrowed to a chip this chart can show. A Day view uses 7 days. Six months uses 90 days. */
export function workoutHistoryPeriod(period: StatPeriod): WorkoutHistoryPeriod {
  if (period === '7' || period === '30' || period === '60' || period === '90' || period === '12m') return period;
  if (period === '6m') return '90';
  return '7';
}

/** Daily through 90 days. Twelve months uses months, the same grain as the other year charts. */
export function workoutHistoryBucket(period: WorkoutHistoryPeriod): ChartBucket {
  return chartBucketForPeriod(period);
}

/**
 * One row for every calendar day in the range, ending on `today`.
 * A day with no workout is zero. A workout is counted on the London day it started.
 */
export function workoutDailyTotals(
  workouts: readonly WorkoutHistorySample[],
  today: string,
  period: WorkoutHistoryPeriod,
): WorkoutDayTotal[] {
  const window = rollingWindow(today, period);
  const byDay = new Map<string, { minutes: number; sessions: number; byType: Record<string, number> }>();
  for (const day of window.days) byDay.set(day, { minutes: 0, sessions: 0, byType: {} });
  for (const workout of workouts) {
    if (!(workout.durationMinutes > 0)) continue;
    const row = byDay.get(londonDay(workout.startedAt));
    if (!row) continue;
    row.minutes += workout.durationMinutes;
    row.sessions += 1;
    const label = workout.label.trim() || 'Workout';
    row.byType[label] = (row.byType[label] ?? 0) + workout.durationMinutes;
  }
  return window.days.map((day) => {
    const row = byDay.get(day) ?? { minutes: 0, sessions: 0, byType: {} };
    return { day, minutes: row.minutes, sessions: row.sessions, byType: row.byType };
  });
}

/**
 * Mean over finished days only. The current day is still open, so it stays out.
 * A finished day with no workout counts as zero.
 */
export function workoutFullDayAverage(
  days: readonly { day: string; minutes: number; sessions: number }[],
  today: string,
): { minutes: number | null; sessions: number | null; days: number } {
  const full = days.filter((day) => day.day < today);
  if (full.length === 0) return { minutes: null, sessions: null, days: 0 };
  return {
    minutes: full.reduce((sum, day) => sum + day.minutes, 0) / full.length,
    sessions: full.reduce((sum, day) => sum + day.sessions, 0) / full.length,
    days: full.length,
  };
}

/** Days with a workout, oldest first. Rest days stay off the line so the stroke is not pulled to zero. */
export function workoutChartPoints(days: readonly WorkoutDayTotal[]): {
  minutes: ChartPoint[];
  sessions: ChartPoint[];
  types: { label: string; points: ChartPoint[]; average: number | null }[];
} {
  const today = days.length > 0 ? days[days.length - 1]?.day ?? '' : '';
  const fullDays = days.filter((day) => day.day < today);
  const minutes = days.flatMap((day) => (day.minutes > 0 ? [{ day: day.day, value: day.minutes }] : []));
  const sessions = days.flatMap((day) => (day.sessions > 0 ? [{ day: day.day, value: day.sessions }] : []));
  const totals = new Map<string, number>();
  for (const day of days) {
    for (const [label, value] of Object.entries(day.byType)) totals.set(label, (totals.get(label) ?? 0) + value);
  }
  const types = [...totals.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label]) => {
      const average = fullDays.length === 0
        ? null
        : fullDays.reduce((sum, day) => sum + (day.byType[label] ?? 0), 0) / fullDays.length;
      return {
        label,
        average,
        points: days.flatMap((day) => {
          const value = day.byType[label] ?? 0;
          return value > 0 ? [{ day: day.day, value }] : [];
        }),
      };
    });
  return { minutes, sessions, types };
}

/** Summed into the chart grain. A day stays a day. A year becomes one total per month. */
export function bucketWorkoutSeries(points: readonly ChartPoint[], period: WorkoutHistoryPeriod): ChartPoint[] {
  return bucketChartPoints(points, workoutHistoryBucket(period), 'sum');
}

export type WorkoutHistoryChartModel = {
  period: WorkoutHistoryPeriod;
  bucket: ChartBucket;
  start: string;
  end: string;
  days: WorkoutDayTotal[];
  minutes: ChartPoint[];
  sessions: ChartPoint[];
  types: { label: string; points: ChartPoint[]; average: number | null }[];
  minuteBuckets: ChartPoint[];
  sessionBuckets: ChartPoint[];
  averageMinutes: number | null;
  averageSessions: number | null;
  fullDays: number;
};

/** The series the Workout History charts draw. `today` is the London day the range ends on. */
export function buildWorkoutHistoryCharts(
  workouts: readonly WorkoutHistorySample[],
  today: string,
  period: WorkoutHistoryPeriod,
): WorkoutHistoryChartModel {
  const days = workoutDailyTotals(workouts, today, period);
  const points = workoutChartPoints(days);
  const average = workoutFullDayAverage(days, today);
  const count = periodDayCount(period);
  return {
    period,
    bucket: workoutHistoryBucket(period),
    start: days[0]?.day ?? shiftDay(today, -(count - 1)),
    end: days[days.length - 1]?.day ?? today,
    days,
    minutes: points.minutes,
    sessions: points.sessions,
    types: points.types,
    minuteBuckets: bucketWorkoutSeries(points.minutes, period),
    sessionBuckets: bucketWorkoutSeries(points.sessions, period),
    averageMinutes: average.minutes,
    averageSessions: average.sessions,
    fullDays: average.days,
  };
}

/** The last day of a week (Sunday) or month bucket. A day bucket is that day. */
export function workoutBucketEnd(start: string, bucket: ChartBucket): string {
  if (bucket === 'week') return shiftDay(start, 6);
  if (bucket !== 'month') return start;
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  if (!year || !month) return start;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${start.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

/**
 * The day a tapped point should open.
 * A daily point is that day. A week or month opens the day in the bucket with the most minutes.
 */
export function workoutDayForPoint(
  pointDay: string,
  bucket: ChartBucket,
  days: readonly { day: string; minutes: number }[],
  today: string,
): string {
  const end = workoutBucketEnd(pointDay, bucket);
  let best: { day: string; minutes: number } | null = null;
  for (const day of days) {
    if (day.day < pointDay || day.day > end || day.day > today || !(day.minutes > 0)) continue;
    if (!best || day.minutes > best.minutes || (day.minutes === best.minutes && day.day > best.day)) best = day;
  }
  if (best) return best.day;
  return pointDay <= today ? pointDay : today;
}

/** Date heading for the selected day. A past day is named by its date. */
export function workoutSelectedHeading(day: string): string {
  return formatUkDate(day);
}

/** One line under a chart. It does not call the current day "Today". */
export function workoutAverageLine(kind: 'minutes' | 'workouts', average: number | null, fullDays: number): string {
  const noun = fullDays === 1 ? 'day' : 'days';
  if (average == null || fullDays === 0) return 'Not enough finished days for an average yet.';
  if (kind === 'minutes') return `Average ${Math.round(average)} min a day over ${fullDays} full ${noun}.`;
  const shown = Math.round(average * 10) / 10;
  const workout = shown === 1 ? 'workout' : 'workouts';
  return `Average ${shown} ${workout} a day over ${fullDays} full ${noun}.`;
}
