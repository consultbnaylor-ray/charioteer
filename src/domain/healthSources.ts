import type { HealthSample } from '@/data/types';
import type { GarminActivity, GarminDaily, GarminReadings, GarminSleep } from '@/domain/garminConnect';
import { londonDay } from '@/domain/healthInsights';
import type { DeviceWorkout } from '@/domain/workoutRoute';

/** Shown on the workout detail screen only. */
export const WORKOUT_SOURCE_GARMIN = 'From Garmin';

/** Shown on the workout detail screen only. */
export const WORKOUT_SOURCE_APPLE = 'From Apple Health';

const TWO_MINUTES_MS = 2 * 60 * 1000;

type Span = DeviceWorkout & { durationMs: number };

export function workoutSourceLine(origin: DeviceWorkout['origin']): string | null {
  if (origin === 'garmin') return WORKOUT_SOURCE_GARMIN;
  if (origin === 'apple') return WORKOUT_SOURCE_APPLE;
  return null;
}

/**
 * One workout list. A session that arrives from both feeds counts once.
 * Garmin wins, and Apple Health fills anything Garmin did not record.
 */
export function mergeWorkouts(apple: readonly DeviceWorkout[], activities: readonly GarminActivity[]): DeviceWorkout[] {
  const garmin = collapseGarmin(activities.flatMap(garminWorkout));
  const pool = apple.map(markApple);
  const used = new Set<number>();
  const merged: DeviceWorkout[] = [];
  for (const row of garmin) {
    let best = -1;
    let bestScore = 0;
    pool.forEach((other, index) => {
      if (used.has(index)) return;
      const score = matchScore(row, other);
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });
    if (best < 0) {
      merged.push(strip(row));
      continue;
    }
    used.add(best);
    merged.push(combine(row, pool[best]));
  }
  pool.forEach((row, index) => {
    if (!used.has(index)) merged.push(strip(row));
  });
  return merged.sort((left, right) => (left.startedAt < right.startedAt ? -1 : left.startedAt > right.startedAt ? 1 : 0));
}

/**
 * One resting heart rate, one sleep total, and one workout-minute total per day.
 * A day Garmin recorded replaces that day's Apple Health value. The two are never added.
 */
export function mergeHealthSamples(
  samples: readonly HealthSample[],
  readings: GarminReadings,
  workouts: readonly DeviceWorkout[],
): HealthSample[] {
  const heart = garminHeartByDay(readings.dailies);
  const sleep = garminSleepByDay(readings.sleep);
  const minutes = garminWorkoutMinutesByDay(workouts);
  const kept = samples.filter((sample) => {
    const day = dayKey(sample.recordedOn);
    if (sample.kind === 'resting_heart_rate' && heart.has(day)) return false;
    if (sample.kind === 'sleep_hours' && sleep.has(day)) return false;
    if (sample.kind === 'workout_minutes' && minutes.has(day)) return false;
    return true;
  });
  const added: HealthSample[] = [
    ...[...heart].map(([day, value]) => mergedSample('resting_heart_rate', value, day, 'bpm')),
    ...[...sleep].map(([day, value]) => mergedSample('sleep_hours', value, day, 'h')),
    ...[...minutes].map(([day, value]) => mergedSample('workout_minutes', value, day, 'min')),
  ];
  return [...kept, ...added];
}

/**
 * One active-minutes figure per day. Garmin's moderate plus vigorous minutes win when
 * that day has them. Otherwise the day's workout minutes are used. The sources are not added.
 */
export function activeMinutesByDay(
  samples: readonly { kind: string; value: number; recordedOn: string }[],
  dailies: readonly GarminDaily[],
): { day: string; value: number }[] {
  const garmin = new Map<string, number>();
  for (const daily of dailies) {
    if (daily.moderateMinutes == null && daily.vigorousMinutes == null) continue;
    garmin.set(daily.calendarDate, Math.round((daily.moderateMinutes ?? 0) + (daily.vigorousMinutes ?? 0)));
  }
  const apple = new Map<string, number>();
  for (const sample of samples) {
    if (sample.kind !== 'workout_minutes' || !(sample.value > 0)) continue;
    const day = dayKey(sample.recordedOn);
    if (garmin.has(day)) continue;
    apple.set(day, (apple.get(day) ?? 0) + sample.value);
  }
  return [...new Set([...garmin.keys(), ...apple.keys()])]
    .sort()
    .map((day) => ({ day, value: garmin.get(day) ?? apple.get(day) ?? 0 }));
}

/** Adds the chosen daily values. A day is included once. */
export function sumDaily(points: readonly { day: string; value: number }[], start: string, end: string): number {
  return points.reduce((sum, point) => (point.day >= start && point.day <= end ? sum + point.value : sum), 0);
}

function markApple(workout: DeviceWorkout): Span {
  return { ...workout, origin: 'apple', durationMs: Math.max(0, workout.durationMinutes) * 60 * 1000 };
}

function garminWorkout(activity: GarminActivity): Span[] {
  const start = Date.parse(activity.startedAt);
  if (!activity.summaryId || !Number.isFinite(start) || !(activity.durationSeconds > 0)) return [];
  return [{
    id: `garmin:${activity.summaryId}`,
    activityType: 0,
    label: garminLabel(activity),
    startedAt: new Date(start).toISOString(),
    durationMinutes: Math.max(1, Math.round(activity.durationSeconds / 60)),
    durationMs: activity.durationSeconds * 1000,
    distanceMetres: null,
    energyKcal: null,
    averageHeartRate: activity.averageHeartRateBpm,
    effortScore: null,
    routeExpected: false,
    origin: 'garmin',
    trainingEffect: activity.trainingEffect,
    anaerobicEffect: activity.anaerobicEffect,
  }];
}

function collapseGarmin(rows: Span[]): Span[] {
  const kept: Span[] = [];
  for (const row of rows) {
    const index = kept.findIndex((other) => sameSession(row, other));
    if (index < 0) kept.push(row);
    else kept[index] = richerGarmin(kept[index], row);
  }
  return kept;
}

function richerGarmin(left: Span, right: Span): Span {
  const primary = richness(left) >= richness(right) ? left : right;
  const other = primary === left ? right : left;
  return {
    ...primary,
    label: primary.label === 'Workout' ? other.label : primary.label,
    durationMinutes: Math.max(primary.durationMinutes, other.durationMinutes),
    durationMs: Math.max(primary.durationMs, other.durationMs),
    averageHeartRate: primary.averageHeartRate ?? other.averageHeartRate,
    trainingEffect: primary.trainingEffect ?? other.trainingEffect,
    anaerobicEffect: primary.anaerobicEffect ?? other.anaerobicEffect,
  };
}

function richness(row: Span): number {
  return (row.trainingEffect != null ? 2 : 0) + (row.averageHeartRate != null ? 1 : 0) + (row.anaerobicEffect != null ? 1 : 0) + row.durationMs / 1000;
}

function combine(garmin: Span, apple: Span): DeviceWorkout {
  return strip({
    ...garmin,
    id: apple.routeExpected ? apple.id : garmin.id,
    activityType: apple.activityType || garmin.activityType,
    label: garmin.label || apple.label,
    durationMinutes: garmin.durationMinutes || apple.durationMinutes,
    distanceMetres: garmin.distanceMetres ?? apple.distanceMetres,
    energyKcal: garmin.energyKcal ?? apple.energyKcal,
    averageHeartRate: garmin.averageHeartRate ?? apple.averageHeartRate,
    effortScore: apple.effortScore ?? garmin.effortScore,
    routeExpected: apple.routeExpected,
    origin: 'garmin',
    trainingEffect: garmin.trainingEffect,
    anaerobicEffect: garmin.anaerobicEffect,
  });
}

function strip(row: Span): DeviceWorkout {
  return {
    id: row.id,
    activityType: row.activityType,
    label: row.label,
    startedAt: row.startedAt,
    durationMinutes: row.durationMinutes,
    distanceMetres: row.distanceMetres,
    energyKcal: row.energyKcal,
    averageHeartRate: row.averageHeartRate,
    effortScore: row.effortScore,
    routeExpected: row.routeExpected,
    origin: row.origin,
    trainingEffect: row.trainingEffect,
    anaerobicEffect: row.anaerobicEffect,
  };
}

function sameSession(left: Span, right: Span): boolean {
  if (!(left.durationMs > 0) || !(right.durationMs > 0)) return false;
  if (!Number.isFinite(startMs(left)) || !Number.isFinite(startMs(right))) return false;
  const overlap = Math.min(endMs(left), endMs(right)) - Math.max(startMs(left), startMs(right));
  const shorter = Math.min(left.durationMs, right.durationMs);
  if (overlap >= shorter * 0.5) return true;
  const gap = Math.abs(startMs(left) - startMs(right));
  if (gap > TWO_MINUTES_MS) return false;
  const longer = Math.max(left.durationMs, right.durationMs);
  return shorter >= longer * 0.8 || Math.abs(left.durationMs - right.durationMs) <= TWO_MINUTES_MS;
}

function matchScore(left: Span, right: Span): number {
  if (!sameSession(left, right)) return 0;
  const overlap = Math.min(endMs(left), endMs(right)) - Math.max(startMs(left), startMs(right));
  const shorter = Math.min(left.durationMs, right.durationMs);
  if (overlap > 0 && shorter > 0) return overlap / shorter;
  return 0.5;
}

function startMs(row: Span): number {
  return Date.parse(row.startedAt);
}

function endMs(row: Span): number {
  return startMs(row) + row.durationMs;
}

function garminLabel(activity: GarminActivity): string {
  const name = activity.activityName.trim();
  if (name) return name;
  const type = activity.activityType.trim();
  if (!type) return 'Workout';
  return type.toLowerCase().replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function garminHeartByDay(dailies: readonly GarminDaily[]): Map<string, number> {
  const days = new Map<string, number>();
  for (const daily of dailies) {
    const value = daily.restingHeartRateBpm ?? daily.averageHeartRateBpm;
    if (value == null) continue;
    days.set(daily.calendarDate, Math.round(value));
  }
  return days;
}

function garminSleepByDay(rows: readonly GarminSleep[]): Map<string, number> {
  const days = new Map<string, number>();
  for (const row of rows) {
    if (!(row.durationSeconds > 0)) continue;
    const hours = Math.round((row.durationSeconds / 3600) * 10) / 10;
    const current = days.get(row.calendarDate);
    if (current == null || hours > current) days.set(row.calendarDate, hours);
  }
  return days;
}

/** Days that include a Garmin workout. The total is every merged workout that day, once. */
function garminWorkoutMinutesByDay(workouts: readonly DeviceWorkout[]): Map<string, number> {
  const totals = new Map<string, number>();
  const replace = new Set<string>();
  for (const workout of workouts) {
    const day = londonDay(workout.startedAt);
    totals.set(day, (totals.get(day) ?? 0) + workout.durationMinutes);
    if (workout.origin === 'garmin') replace.add(day);
  }
  for (const day of [...totals.keys()]) {
    if (!replace.has(day)) totals.delete(day);
  }
  return totals;
}

function mergedSample(kind: HealthSample['kind'], value: number, day: string, unit: string): HealthSample {
  return {
    id: `merged:${kind}:${day}`,
    kind,
    value,
    unit,
    recordedOn: day,
    source: 'healthkit',
  };
}

function dayKey(recordedOn: string): string {
  return recordedOn.slice(0, 10);
}
