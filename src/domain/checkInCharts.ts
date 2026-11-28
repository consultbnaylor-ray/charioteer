import { isoDay } from '@/domain/dates';
import { formatUkCompactDay } from '@/domain/healthInsights';
import { checkInWeekFigure, countSplit, type MeasureRing, type MeasureSplit } from '@/domain/measureFigures';
import { chartBucketForPeriod, type ChartBucket } from '@/domain/readingChart';
import { periodDayCount, periodPhrase, type StatPeriod } from '@/domain/statWindow';
import { workoutBucketEnd, workoutHistoryPeriod, WORKOUT_HISTORY_PERIODS, type WorkoutHistoryPeriod } from '@/domain/workoutHistoryCharts';

import { recentCheckInDays, type CheckInDay, type CheckInPoint } from './checkIns';

/** Same chips as Workout History. Day and 6 months stay on the other stat pages. */
export const CHECK_IN_CHART_PERIODS = WORKOUT_HISTORY_PERIODS;

/** PostgREST returns at most this many rows in one response. */
export const CHECK_IN_PAGE_SIZE = 1000;

/** A little past a year, so the first day of a 12-month chart is included. */
export const CHECK_IN_HISTORY_DAYS = 370;

export const CHECK_IN_ONE_SO_FAR = 'One check-in so far; trends appear after a few more days.';
export const CHECK_IN_CRAVING_RISING = 'Craving is higher than the stretch before. The Breathe tab can help in the moment, and People is there if you want to reach someone. This is not medical advice.';
export const CHECK_IN_CRAVING_HIGH = 'The latest craving is on the high side. The Breathe tab can help in the moment, and People is there if you want to reach someone. This is not medical advice.';
export const CHECK_IN_MOOD_LOWER = 'Mood is lower than the stretch before. You do not have to sit with that alone. People is there if you want to reach someone.';

const SCALE: Record<CheckInSeriesKind, string> = {
  mood: 'Mood runs from 1 to 10. 1 is very low and 10 is very high. It is a note of the day, not a score of how well you are doing.',
  craving: 'Craving runs from 0 to 10. 0 is none, 1 is very low, and 10 is as strong as it gets.',
};

const SERIES_NAME: Record<CheckInSeriesKind, string> = {
  mood: 'Mood',
  craving: 'Craving',
};

export type CheckInSeriesKind = 'mood' | 'craving';

type Direction = 'up' | 'down' | 'steady' | 'unknown';

/** The stored period, narrowed to a chip this chart can show. A Day view uses 7 days. */
export function checkInChartPeriod(period: StatPeriod): WorkoutHistoryPeriod {
  return workoutHistoryPeriod(period);
}

/** Days ending today for the selected chip. Blank days stay in the list. */
export function checkInWindow(
  checkIns: readonly CheckInPoint[],
  today: Date,
  period: WorkoutHistoryPeriod,
): CheckInDay[] {
  return recentCheckInDays([...checkIns], today, periodDayCount(period));
}

/** The equal stretch immediately before `checkInWindow`. The two ranges do not overlap. */
export function checkInPreviousWindow(
  checkIns: readonly CheckInPoint[],
  today: Date,
  period: WorkoutHistoryPeriod,
): CheckInDay[] {
  const count = periodDayCount(period);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - count);
  return recentCheckInDays([...checkIns], end, count);
}

/** Logged days and open days, without comparing the two counts in a sentence. */
export function checkInLoggedSplit(logged: number, total: number): MeasureSplit {
  return { ...countSplit(logged, total, 'logged days', 'open days'), caption: '' };
}

/** Check-ins against the length of the selected range. Seven days keeps the week wording. */
export function checkInRangeFigure(logged: number, total: number): MeasureRing {
  const span = Math.max(1, Math.round(total));
  if (span === 7) return checkInWeekFigure(logged);
  const count = Math.max(0, Math.min(span, Math.round(logged)));
  const left = span - count;
  const status = count >= span
    ? 'Every day in this range is logged'
    : count === 0
      ? 'None in this range'
      : left === 1
        ? '1 day to go'
        : `${left} days to go`;
  return {
    centre: String(count),
    unit: `of ${span}`,
    fill: count / span,
    status,
    tone: count / span >= 5 / 7 ? 'good' : 'info',
  };
}

/**
 * The day a tapped point should open.
 * A daily point is that day. A month opens the latest logged day inside it.
 */
export function checkInDayForPoint(
  pointDay: string,
  bucket: ChartBucket,
  days: readonly { day: string; mood: number | null }[],
  today: string,
): string {
  const end = workoutBucketEnd(pointDay, bucket);
  let best: string | null = null;
  for (const day of days) {
    if (day.day < pointDay || day.day > end || day.day > today || day.mood == null) continue;
    if (!best || day.day > best) best = day.day;
  }
  if (best) return best;
  return pointDay <= today ? pointDay : today;
}

/** The newest check-in on a local day. */
export function latestCheckInOnDay<T extends { createdAt: string }>(checkIns: readonly T[], day: string): T | null {
  let best: T | null = null;
  for (const item of checkIns) {
    if (isoDay(new Date(item.createdAt)) !== day) continue;
    if (!best || item.createdAt > best.createdAt) best = item;
  }
  return best;
}

export type CheckInChartReading = { day: string; value: number | null };

/**
 * Plain lines for What this means. `previous` is the equal stretch before this one.
 * Null means that earlier stretch was not loaded, so the lines do not invent a comparison.
 */
export function checkInChartMeaning(input: {
  kind: CheckInSeriesKind;
  current: readonly CheckInChartReading[];
  previous: readonly CheckInChartReading[] | null;
  period: WorkoutHistoryPeriod;
}): string[] {
  const name = SERIES_NAME[input.kind];
  const points = logged(input.current);
  const scale = SCALE[input.kind];
  if (points.length === 0) {
    return [`No check-ins in ${periodPhrase(input.period)}.`, scale];
  }
  if (points.length === 1) {
    const only = points[0];
    const lines = [
      CHECK_IN_ONE_SO_FAR,
      scale,
      only ? `${name} was ${formatPoint(only.value)} on ${formatUkCompactDay(only.day)}.` : '',
    ].filter(Boolean);
    const note = supportLine(input.kind, 'unknown', only?.value ?? null);
    if (note) lines.push(note);
    return lines;
  }

  const lines = [scale];
  const earlier = input.previous == null ? null : logged(input.previous);
  const currentMean = mean(points);
  const previousMean = earlier == null ? null : mean(earlier);
  let direction: Direction = 'unknown';
  if (currentMean != null && previousMean != null) {
    const delta = currentMean - previousMean;
    direction = Math.abs(delta) < 0.5 ? 'steady' : delta > 0 ? 'up' : 'down';
    const way = direction === 'up' ? 'up from' : direction === 'down' ? 'down from' : 'about the same as';
    lines.push(`${name} in ${periodPhrase(input.period)} averages ${formatPoint(currentMean)}, ${way} ${formatPoint(previousMean)} in ${earlierPhrase(input.period)}.`);
  } else if (earlier != null) {
    lines.push(`There are not enough earlier check-ins to compare with ${earlierPhrase(input.period)}.`);
  }
  lines.push(...notableLines(name, points));
  const latest = points[points.length - 1]?.value ?? null;
  const note = supportLine(input.kind, direction, latest);
  if (note) lines.push(note);
  if (input.period === '12m') lines.push('Each point is the average for that month.');
  return lines;
}

/** ISO instant of the oldest row a 12-month chart still needs. */
export function checkInHistorySince(now: Date): string {
  return new Date(now.getTime() - (CHECK_IN_HISTORY_DAYS - 1) * 86_400_000).toISOString();
}

/**
 * True when this full page is still inside the 12-month window, so another page is required.
 * A short page, or a page whose oldest row is already past that window, stops the fetch.
 */
export function checkInPageContinues(input: {
  batch: readonly { createdAt: string }[];
  pageSize: number;
  sinceIso: string;
}): boolean {
  if (input.batch.length < input.pageSize) return false;
  const oldest = input.batch[input.batch.length - 1]?.createdAt ?? '';
  return oldest >= input.sinceIso;
}

function logged(days: readonly CheckInChartReading[]): { day: string; value: number }[] {
  return days.flatMap((day) => (
    day.value == null || !Number.isFinite(day.value) ? [] : [{ day: day.day, value: day.value }]
  ));
}

function mean(points: readonly { value: number }[]): number | null {
  if (points.length === 0) return null;
  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

function formatPoint(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function earlierPhrase(period: WorkoutHistoryPeriod): string {
  if (period === '12m') return 'the 12 months before';
  return `the ${period} days before`;
}

function notableLines(name: string, points: readonly { day: string; value: number }[]): string[] {
  let high = points[0];
  let low = points[0];
  if (!high || !low) return [];
  for (const point of points) {
    if (point.value > high.value || (point.value === high.value && point.day > high.day)) high = point;
    if (point.value < low.value || (point.value === low.value && point.day > low.day)) low = point;
  }
  if (high.value === low.value) return [`It stayed at ${formatPoint(high.value)} on the days you logged.`];
  const word = name.toLowerCase();
  return [
    `Highest ${word} was ${formatPoint(high.value)} on ${formatUkCompactDay(high.day)}.`,
    `Lowest ${word} was ${formatPoint(low.value)} on ${formatUkCompactDay(low.day)}.`,
  ];
}

function supportLine(kind: CheckInSeriesKind, direction: Direction, latest: number | null): string | null {
  if (kind === 'craving' && direction === 'up') return CHECK_IN_CRAVING_RISING;
  if (kind === 'craving' && latest != null && latest >= 7) return CHECK_IN_CRAVING_HIGH;
  if (kind === 'mood' && direction === 'down') return CHECK_IN_MOOD_LOWER;
  return null;
}

export function checkInChartBucket(period: WorkoutHistoryPeriod): ChartBucket {
  return chartBucketForPeriod(period);
}
