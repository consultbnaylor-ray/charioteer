import { informativeActivityType, parseWorkoutActivityType, workoutTypeLabel } from '@/domain/fitnessSnapshot';
import { formatUkCompactDay, londonDay, shiftDay } from '@/domain/healthInsights';
import { formatUkDate } from '@/domain/dates';
import { bucketChartPoints, chartBucketForPeriod, formatChartValue, type ChartBucket, type ChartPoint } from '@/domain/readingChart';
import { periodDayCount, periodPhrase, rollingWindow, type StatPeriod } from '@/domain/statWindow';

/**
 * Range chips on Workout History.
 * Day and 6 months stay on the other stat pages. This row matches the longer nutrition ranges.
 */
export const WORKOUT_HISTORY_PERIODS = ['7', '30', '60', '90', '12m'] as const satisfies readonly StatPeriod[];

export type WorkoutHistoryPeriod = (typeof WORKOUT_HISTORY_PERIODS)[number];

export type WorkoutSeriesOrigin = 'garmin' | 'apple';

export type WorkoutHistorySample = {
  startedAt: string;
  durationMinutes: number;
  label: string;
  /** HealthKit activity id when the row has one. Garmin place names still carry this. */
  activityType?: number;
  origin?: WorkoutSeriesOrigin;
};

export type WorkoutPlaceDay = {
  activity: string;
  place: string;
  minutes: number;
  sessions: number;
  origins: readonly WorkoutSeriesOrigin[];
};

export type WorkoutDayTotal = {
  day: string;
  minutes: number;
  sessions: number;
  byType: Readonly<Record<string, number>>;
  typeSessions: Readonly<Record<string, number>>;
  typeOrigins: Readonly<Record<string, readonly WorkoutSeriesOrigin[]>>;
  places: Readonly<Record<string, WorkoutPlaceDay>>;
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
 * A known activity type is grouped under that type. The Garmin name is not the series.
 */
export function workoutDailyTotals(
  workouts: readonly WorkoutHistorySample[],
  today: string,
  period: WorkoutHistoryPeriod,
): WorkoutDayTotal[] {
  const range = rollingWindow(today, period);
  const byDay = new Map<string, DayRow>();
  for (const day of range.days) byDay.set(day, emptyDay());
  for (const workout of workouts) {
    if (!(workout.durationMinutes > 0)) continue;
    const row = byDay.get(londonDay(workout.startedAt));
    if (!row) continue;
    const activity = seriesLabel(workout);
    const place = seriesPlace(workout, activity);
    row.minutes += workout.durationMinutes;
    row.sessions += 1;
    row.byType[activity] = (row.byType[activity] ?? 0) + workout.durationMinutes;
    row.typeSessions[activity] = (row.typeSessions[activity] ?? 0) + 1;
    row.typeOrigins[activity] = withOrigin(row.typeOrigins[activity], workout.origin);
    if (!place) continue;
    const key = placeKey(activity, place);
    const cell = row.places[key] ?? { activity, place, minutes: 0, sessions: 0, origins: [] };
    cell.minutes += workout.durationMinutes;
    cell.sessions += 1;
    cell.origins = withOrigin(cell.origins, workout.origin);
    row.places[key] = cell;
  }
  return range.days.map((day) => {
    const row = byDay.get(day) ?? emptyDay();
    return {
      day,
      minutes: row.minutes,
      sessions: row.sessions,
      byType: row.byType,
      typeSessions: row.typeSessions,
      typeOrigins: row.typeOrigins,
      places: row.places,
    };
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
  const minutes = positivePoints(days, (day) => day.minutes);
  const sessions = positivePoints(days, (day) => day.sessions);
  const totals = new Map<string, number>();
  for (const day of days) {
    for (const [label, value] of Object.entries(day.byType)) totals.set(label, (totals.get(label) ?? 0) + value);
  }
  const types = [...totals.entries()]
    .sort(byTotalThenName)
    .map(([label]) => ({
      label,
      average: meanOver(fullDays, (day) => day.byType[label] ?? 0),
      points: positivePoints(days, (day) => day.byType[label] ?? 0),
    }));
  return { minutes, sessions, types };
}

/** Summed into the chart grain. A day stays a day. A year becomes one total per month. */
export function bucketWorkoutSeries(points: readonly ChartPoint[], period: WorkoutHistoryPeriod): ChartPoint[] {
  return bucketChartPoints(points, workoutHistoryBucket(period), 'sum');
}

/** A line needs two plotted points. One session, or one month in a year, is a sentence instead. */
export function workoutSeriesChartable(plotted: readonly ChartPoint[]): boolean {
  return plotted.length >= 2;
}

export type WorkoutHistorySeries = {
  label: string;
  title: string;
  subtitle: string;
  unit: string;
  points: ChartPoint[];
  average: number | null;
  averageLine: string;
  sessions: number;
  minutes: number;
  chartable: boolean;
  summary: string;
  rangeLine: string;
  /** Latest day with a value. A one-point row opens this day. */
  day: string | null;
};

export type WorkoutPlaceSeries = WorkoutHistorySeries & {
  activity: string;
  place: string;
};

export type WorkoutHistoryChartModel = {
  period: WorkoutHistoryPeriod;
  bucket: ChartBucket;
  start: string;
  end: string;
  days: WorkoutDayTotal[];
  minutes: ChartPoint[];
  sessions: ChartPoint[];
  types: WorkoutHistorySeries[];
  places: WorkoutPlaceSeries[];
  minuteSeries: WorkoutHistorySeries;
  sessionSeries: WorkoutHistorySeries;
  /** Shown instead of the two overall charts when the range has a single point. */
  headline: string;
  /** One activity is already the minutes chart, so that row is not repeated. */
  foldSingleType: boolean;
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
  const bucket = workoutHistoryBucket(period);
  const count = periodDayCount(period);
  const fullDays = days.filter((day) => day.day < today);
  const overallOrigins = unionOrigins(days.flatMap((day) => Object.values(day.typeOrigins).flat()));
  const totalMinutes = days.reduce((sum, day) => sum + day.minutes, 0);
  const totalSessions = days.reduce((sum, day) => sum + day.sessions, 0);
  const activeDays = days.filter((day) => day.minutes > 0).map((day) => day.day);
  const minuteSeries = overallSeries({
    label: 'All workouts',
    title: 'Workout minutes',
    summaryLabel: 'All workouts',
    unit: 'min',
    kind: 'minutes',
    points: points.minutes,
    minutes: totalMinutes,
    sessions: totalSessions,
    average: average.minutes,
    fullDayCount: average.days,
    origins: overallOrigins,
    bucket,
    period,
    days: activeDays,
  });
  const sessionSeries = overallSeries({
    label: 'Workouts',
    title: 'Workouts',
    summaryLabel: 'Workouts',
    unit: 'workouts',
    kind: 'sessions',
    points: points.sessions,
    minutes: totalMinutes,
    sessions: totalSessions,
    average: average.sessions,
    fullDayCount: average.days,
    origins: overallOrigins,
    bucket,
    period,
    days: activeDays,
  });
  const types = points.types.map((type) => {
    const origins = unionOrigins(days.flatMap((day) => day.typeOrigins[type.label] ?? []));
    const sessions = days.reduce((sum, day) => sum + (day.typeSessions[type.label] ?? 0), 0);
    const minutes = days.reduce((sum, day) => sum + (day.byType[type.label] ?? 0), 0);
    const active = days.filter((day) => (day.byType[type.label] ?? 0) > 0).map((day) => day.day);
    return finishSeries({
      label: type.label,
      title: type.label,
      summaryLabel: type.label,
      subtitle: workoutSeriesSubtitle({ kind: 'activity', label: type.label, origins, bucket }),
      unit: 'min',
      points: type.points,
      average: type.average,
      averageKind: 'minutes',
      fullDayCount: average.days,
      sessions,
      minutes,
      bucket,
      period,
      days: active,
    });
  });
  const places = placeSeries(days, fullDays, average.days, bucket, period);
  const onlyType = types.length === 1 ? types[0] : null;
  if (onlyType) {
    minuteSeries.title = onlyType.title;
    minuteSeries.subtitle = onlyType.subtitle;
  }
  const headline = minuteSeries.chartable
    ? ''
    : onlyType?.summary ?? minuteSeries.summary;
  return {
    period,
    bucket,
    start: days[0]?.day ?? shiftDay(today, -(count - 1)),
    end: days[days.length - 1]?.day ?? today,
    days,
    minutes: points.minutes,
    sessions: points.sessions,
    types,
    places,
    minuteSeries,
    sessionSeries,
    headline,
    foldSingleType: types.length === 1,
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

const EXTRA_ACTIVITY_WORDS: Record<string, readonly string[]> = {
  Walking: ['walk'],
  Running: ['run'],
  Cycling: ['cycle', 'bike', 'biking', 'ride'],
  Hiking: ['hike'],
  Swimming: ['swim'],
  Rowing: ['row'],
  'Traditional strength': ['weights', 'weight'],
  'Functional strength': ['weights'],
  'Mixed cardio': ['cardio'],
  'Core training': ['core'],
};

const PLACE_QUALIFIERS = new Set([
  'morning', 'evening', 'afternoon', 'night', 'noon', 'indoor', 'outdoor', 'easy', 'long', 'tempo',
  'recovery', 'brisk', 'casual', 'speed', 'lunch', 'interval', 'intervals', 'workout', 'session',
  'the', 'a', 'an', 'in', 'at', 'of', 'to',
]);

const SMALL_PLACE_WORDS = new Set(['on', 'upon', 'under', 'over', 'near', 'by']);

const PLACE_HEAD: Record<string, string> = {
  Walking: 'Walks',
  Running: 'Runs',
  Cycling: 'Rides',
  Hiking: 'Hikes',
  Swimming: 'Swims',
  Rowing: 'Rows',
};

/**
 * The place Garmin put in front of the sport, such as "South Derbyshire" in
 * "South Derbyshire Walking". A plain "Walking" or "Morning run" has no place.
 */
export function workoutPlaceName(rawLabel: string, typeLabel: string): string | null {
  const words = rawLabel.trim().split(/[\s,/|–—-]+/).filter(Boolean);
  if (words.length < 2) return null;
  const activity = activityWords(typeLabel);
  const hadActivity = words.some((word) => activity.has(wordKey(word)));
  if (!hadActivity) return null;
  const kept = words.filter((word) => {
    const key = wordKey(word);
    return key && !activity.has(key) && !PLACE_QUALIFIERS.has(key);
  });
  if (kept.length === 0) return null;
  return titleCasePlace(kept.join(' '));
}

/** "Walks in South Derbyshire". Boxing and other sports keep their name. */
export function workoutPlaceTitle(typeLabel: string, place: string): string {
  const head = PLACE_HEAD[typeLabel] ?? typeLabel;
  return `${head} in ${place}`;
}

/** One sentence for a series that does not have two points to draw. */
export function workoutSparseSummary(
  label: string,
  sessions: number,
  minutes: number,
  days: readonly string[],
  period: WorkoutHistoryPeriod,
): string {
  const noun = sessions === 1 ? 'session' : 'sessions';
  const first = days[0] ?? '';
  const last = days[days.length - 1] ?? first;
  const crossYear = first.slice(0, 4) !== last.slice(0, 4);
  const when = days.length <= 1
    ? `on ${shortDay(first, crossYear)}`
    : `from ${shortDay(first, crossYear)} to ${shortDay(last, crossYear)}`;
  return `${label}: ${sessions} ${noun} in ${periodPhrase(period)}, ${Math.round(minutes)} min ${when}.`;
}

/**
 * Lowest and highest plotted points, with the day they fell on.
 * "Lowest 5 min (17 Nov) · Highest 25 min (21 Nov)".
 */
export function workoutRangeLine(
  points: readonly ChartPoint[],
  unit: string,
  bucket: ChartBucket = 'day',
): string {
  if (points.length === 0) return '';
  let low = points[0];
  let high = points[0];
  if (!low || !high) return '';
  for (const point of points) {
    if (point.value < low.value || (point.value === low.value && point.day < low.day)) low = point;
    if (point.value > high.value || (point.value === high.value && point.day > high.day)) high = point;
  }
  const crossYear = low.day.slice(0, 4) !== high.day.slice(0, 4);
  const lowText = `${valueWithUnit(low.value, unit)} (${pointWhen(low.day, bucket, crossYear)})`;
  const highText = `${valueWithUnit(high.value, unit)} (${pointWhen(high.day, bucket, crossYear)})`;
  if (low.day === high.day) return `${valueWithUnit(low.value, unit)} on ${pointWhen(low.day, bucket, false)}`;
  return `Lowest ${lowText} · Highest ${highText}`;
}

/** The line under a title. It names the measure, the grain, and the source. */
export function workoutSeriesSubtitle(input: {
  kind: 'minutes' | 'sessions' | 'activity' | 'place';
  label: string;
  origins: readonly WorkoutSeriesOrigin[];
  bucket: ChartBucket;
  place?: string;
}): string {
  const recorded = recordedPhrase(input.origins);
  const grain = grainPhrase(input.bucket);
  if (input.kind === 'sessions') return `How many workouts were ${recorded} ${grain}.`;
  if (input.kind === 'minutes') return `Total minutes from every workout, ${recorded} ${grain}.`;
  const sport = input.label === 'HIIT' ? 'HIIT' : input.label.toLowerCase();
  if (input.kind === 'place' && input.place) {
    return `Minutes of ${sport} in ${input.place}, ${recorded} ${grain}. Already included in ${input.label}.`;
  }
  return `Minutes of ${sport} ${recorded} ${grain}.`;
}

type DayRow = {
  minutes: number;
  sessions: number;
  byType: Record<string, number>;
  typeSessions: Record<string, number>;
  typeOrigins: Record<string, WorkoutSeriesOrigin[]>;
  places: Record<string, {
    activity: string;
    place: string;
    minutes: number;
    sessions: number;
    origins: WorkoutSeriesOrigin[];
  }>;
};

function emptyDay(): DayRow {
  return { minutes: 0, sessions: 0, byType: {}, typeSessions: {}, typeOrigins: {}, places: {} };
}

/**
 * Activity type when the row has one, so "South Derbyshire Walking" joins Walking.
 * A row with no type keeps its label, which is how a planned Cardio or Strength session is named.
 */
function seriesLabel(sample: WorkoutHistorySample): string {
  if (typeof sample.activityType !== 'number') return sample.label.trim() || 'Workout';
  const parsed = parseWorkoutActivityType(sample.activityType, sample.label);
  if (informativeActivityType(parsed)) return workoutTypeLabel(parsed);
  return sample.label.trim() || 'Workout';
}

function seriesPlace(sample: WorkoutHistorySample, activity: string): string | null {
  if (typeof sample.activityType !== 'number') return null;
  if (!informativeActivityType(parseWorkoutActivityType(sample.activityType, sample.label))) return null;
  return workoutPlaceName(sample.label, activity);
}

function placeKey(activity: string, place: string): string {
  return `${activity}::${place}`;
}

function withOrigin(current: readonly WorkoutSeriesOrigin[] | undefined, origin: WorkoutHistorySample['origin']): WorkoutSeriesOrigin[] {
  const next = new Set(current ?? []);
  if (origin === 'garmin' || origin === 'apple') next.add(origin);
  return originList(next);
}

function originList(origins: Iterable<WorkoutSeriesOrigin>): WorkoutSeriesOrigin[] {
  const found = new Set(origins);
  const list: WorkoutSeriesOrigin[] = [];
  if (found.has('garmin')) list.push('garmin');
  if (found.has('apple')) list.push('apple');
  return list;
}

function unionOrigins(origins: readonly WorkoutSeriesOrigin[]): WorkoutSeriesOrigin[] {
  return originList(origins);
}

function positivePoints(days: readonly WorkoutDayTotal[], valueOf: (day: WorkoutDayTotal) => number): ChartPoint[] {
  return days.flatMap((day) => {
    const value = valueOf(day);
    return value > 0 ? [{ day: day.day, value }] : [];
  });
}

function meanOver(days: readonly WorkoutDayTotal[], valueOf: (day: WorkoutDayTotal) => number): number | null {
  if (days.length === 0) return null;
  return days.reduce((sum, day) => sum + valueOf(day), 0) / days.length;
}

function byTotalThenName(left: [string, number], right: [string, number]): number {
  return right[1] - left[1] || left[0].localeCompare(right[0]);
}

function activityWords(typeLabel: string): Set<string> {
  const extra = EXTRA_ACTIVITY_WORDS[typeLabel] ?? [];
  return new Set([...typeLabel.toLowerCase().split(/\s+/), ...extra]);
}

function wordKey(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function titleCasePlace(value: string): string {
  return value.split(/\s+/).filter(Boolean).map((word, index) => {
    const lower = word.toLowerCase();
    if (index > 0 && SMALL_PLACE_WORDS.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
}

function recordedPhrase(origins: readonly WorkoutSeriesOrigin[]): string {
  const garmin = origins.includes('garmin');
  const apple = origins.includes('apple');
  if (garmin && apple) return 'recorded by your Garmin and Apple Health';
  if (garmin) return 'recorded by your Garmin';
  if (apple) return 'recorded in Apple Health';
  return 'recorded by your Garmin or Apple Health';
}

function grainPhrase(bucket: ChartBucket): string {
  if (bucket === 'week') return 'each week';
  if (bucket === 'month') return 'each month';
  return 'each day';
}

function shortDay(iso: string, withYear: boolean): string {
  const text = formatUkCompactDay(iso);
  if (withYear) return text;
  return text.replace(/ \d{4}$/, '');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pointWhen(day: string, bucket: ChartBucket, withYear: boolean): string {
  if (bucket === 'month') {
    const month = MONTHS[(Number(day.slice(5, 7)) || 1) - 1] ?? '';
    return withYear ? `${month} ${day.slice(0, 4)}` : month;
  }
  return shortDay(day, withYear);
}

function valueWithUnit(value: number, unit: string): string {
  if (unit !== 'workouts') return formatChartValue(value, unit);
  const rounded = Math.round(value * 10) / 10;
  const text = formatChartValue(value, '');
  return `${text} ${rounded === 1 ? 'workout' : 'workouts'}`;
}

function finishSeries(input: {
  label: string;
  title: string;
  summaryLabel: string;
  subtitle: string;
  unit: string;
  points: ChartPoint[];
  average: number | null;
  averageKind: 'minutes' | 'workouts';
  fullDayCount: number;
  sessions: number;
  minutes: number;
  bucket: ChartBucket;
  period: WorkoutHistoryPeriod;
  days: readonly string[];
}): WorkoutHistorySeries {
  const plotted = bucketChartPoints(input.points, input.bucket, 'sum');
  return {
    label: input.label,
    title: input.title,
    subtitle: input.subtitle,
    unit: input.unit,
    points: input.points,
    average: input.average,
    averageLine: workoutAverageLine(input.averageKind, input.average, input.fullDayCount),
    sessions: input.sessions,
    minutes: input.minutes,
    chartable: workoutSeriesChartable(plotted),
    summary: input.sessions > 0
      ? workoutSparseSummary(input.summaryLabel, input.sessions, input.minutes, input.days, input.period)
      : '',
    rangeLine: workoutRangeLine(plotted, input.unit, input.bucket),
    day: input.days[input.days.length - 1] ?? null,
  };
}

function overallSeries(input: {
  label: string;
  title: string;
  summaryLabel: string;
  unit: string;
  kind: 'minutes' | 'sessions';
  points: ChartPoint[];
  minutes: number;
  sessions: number;
  average: number | null;
  fullDayCount: number;
  origins: readonly WorkoutSeriesOrigin[];
  bucket: ChartBucket;
  period: WorkoutHistoryPeriod;
  days: readonly string[];
}): WorkoutHistorySeries {
  return finishSeries({
    label: input.label,
    title: input.title,
    summaryLabel: input.summaryLabel,
    subtitle: workoutSeriesSubtitle({ kind: input.kind, label: input.label, origins: input.origins, bucket: input.bucket }),
    unit: input.unit,
    points: input.points,
    average: input.average,
    averageKind: input.kind === 'sessions' ? 'workouts' : 'minutes',
    fullDayCount: input.fullDayCount,
    sessions: input.sessions,
    minutes: input.minutes,
    bucket: input.bucket,
    period: input.period,
    days: input.days,
  });
}

function placeSeries(
  days: readonly WorkoutDayTotal[],
  fullDays: readonly WorkoutDayTotal[],
  fullDayCount: number,
  bucket: ChartBucket,
  period: WorkoutHistoryPeriod,
): WorkoutPlaceSeries[] {
  const totals = new Map<string, { activity: string; place: string; minutes: number }>();
  for (const day of days) {
    for (const [key, place] of Object.entries(day.places)) {
      const current = totals.get(key) ?? { activity: place.activity, place: place.place, minutes: 0 };
      current.minutes += place.minutes;
      totals.set(key, current);
    }
  }
  return [...totals.entries()]
    .sort((left, right) => right[1].minutes - left[1].minutes || left[1].place.localeCompare(right[1].place))
    .map(([key, place]) => {
      const points = positivePoints(days, (day) => day.places[key]?.minutes ?? 0);
      const sessions = days.reduce((sum, day) => sum + (day.places[key]?.sessions ?? 0), 0);
      const origins = unionOrigins(days.flatMap((day) => day.places[key]?.origins ?? []));
      const active = days.filter((day) => (day.places[key]?.minutes ?? 0) > 0).map((day) => day.day);
      const title = workoutPlaceTitle(place.activity, place.place);
      const series = finishSeries({
        label: title,
        title,
        summaryLabel: title,
        subtitle: workoutSeriesSubtitle({
          kind: 'place',
          label: place.activity,
          origins,
          bucket,
          place: place.place,
        }),
        unit: 'min',
        points,
        average: meanOver(fullDays, (day) => day.places[key]?.minutes ?? 0),
        averageKind: 'minutes',
        fullDayCount,
        sessions,
        minutes: place.minutes,
        bucket,
        period,
        days: active,
      });
      return { ...series, activity: place.activity, place: place.place };
    });
}
