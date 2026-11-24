/**
 * Matches a saved route to workouts the wearable actually recorded.
 * Garmin is preferred when both watches stored the same session.
 * A start point confirms the match. Without one, the same date, type, and
 * distance is kept and labelled likely.
 */

import { averagePaceSecPerKm, clock, distanceLabel, paceLabel } from '@/domain/activitySession';
import { parseWorkoutActivityType } from '@/domain/fitnessSnapshot';
import type { GarminActivity, GarminActivityDetail } from '@/domain/garminConnect';
import { formatUkCompactDay, londonDay } from '@/domain/healthInsights';
import { metresBetween, type OutdoorPoint, type OutdoorRoute } from '@/domain/outdoorRoute';
import type { DeviceWorkout } from '@/domain/workoutRoute';

export type RouteActivityKind = 'walk' | 'run' | 'cycle' | 'hike';

export type RouteMatchConfidence = 'matched' | 'likely';

/** Start points closer than this are the same place. Metres. */
export const ROUTE_START_NEAR_M = 300;

/** A recorded length within this share of the route can be that route. */
export const ROUTE_DISTANCE_RATIO = 0.25;

/** Short routes still allow this many metres of difference. */
export const ROUTE_DISTANCE_FLOOR_M = 200;

export const ROUTE_MATCH_EMPTY =
  "Not matched to a recorded workout yet. Record it on your watch and it'll appear here.";

const TWO_MINUTES_MS = 2 * 60 * 1000;

export type RecordedRouteWorkout = {
  id: string;
  source: 'garmin' | 'apple';
  /** Null when the wearable did not name walk, run, cycle, or hike. */
  activity: RouteActivityKind | null;
  startedAt: string;
  durationSeconds: number;
  distanceMetres: number | null;
  averageHeartRate: number | null;
  energyKcal: number | null;
  elevationGainM: number | null;
  start: OutdoorPoint | null;
};

export type SavedRouteForMatch = {
  id: string;
  createdAt: string;
  distanceM: number;
  activity: RouteActivityKind | null;
  start: OutdoorPoint | null;
};

export type RouteCompletion = {
  workoutId: string;
  routeId: string;
  confidence: RouteMatchConfidence;
  source: 'garmin' | 'apple';
  activity: RouteActivityKind | null;
  startedAt: string;
  durationSeconds: number;
  distanceMetres: number;
  averagePaceSecPerKm: number | null;
  averageSpeedKmh: number | null;
  averageHeartRate: number | null;
  energyKcal: number | null;
  elevationGainM: number | null;
};

export type RouteCompletionHistory = {
  byRoute: Record<string, RouteCompletion[]>;
  all: RouteCompletion[];
};

export function routeActivityKind(activityType: number): RouteActivityKind | null {
  if (activityType === 52) return 'walk';
  if (activityType === 37) return 'run';
  if (activityType === 13) return 'cycle';
  if (activityType === 24) return 'hike';
  return null;
}

/** Positive climbs of at least two metres. A flat line is zero. Too few samples is null. */
export function elevationGainMetres(altitudes: readonly number[]): number | null {
  const usable = altitudes.filter((value) => Number.isFinite(value));
  if (usable.length < 2) return null;
  let gain = 0;
  for (let index = 1; index < usable.length; index += 1) {
    const delta = usable[index] - usable[index - 1];
    if (delta >= 2) gain += delta;
  }
  return Math.round(gain);
}

export function savedRouteForMatch(route: OutdoorRoute): SavedRouteForMatch {
  return {
    id: route.id,
    createdAt: route.createdAt,
    distanceM: route.distanceM,
    activity: route.kind === 'craving_walk' ? 'walk' : null,
    start: route.points[0] ?? null,
  };
}

function garminIndoor(activityType: string, name: string): boolean {
  return /indoor|treadmill|virtual/i.test(`${activityType} ${name}`);
}

export function garminRouteWorkout(
  activity: GarminActivity,
  detail: GarminActivityDetail | null,
): RecordedRouteWorkout | null {
  if (!activity.summaryId || garminIndoor(activity.activityType, activity.activityName)) return null;
  const started = Date.parse(activity.startedAt);
  if (!Number.isFinite(started)) return null;
  const activityType = parseWorkoutActivityType(activity.activityType, activity.activityName);
  const kind = routeActivityKind(activityType);
  if (activityType > 0 && activityType !== 3000 && kind == null) return null;
  const durationSeconds = activity.durationSeconds > 0
    ? activity.durationSeconds
    : (detail?.durationSeconds ?? 0);
  if (!(durationSeconds > 0)) return null;
  const distance = detail?.distanceMetres;
  return {
    id: `garmin:${activity.summaryId}`,
    source: 'garmin',
    activity: kind,
    startedAt: new Date(started).toISOString(),
    durationSeconds,
    distanceMetres: distance != null && distance > 0 ? distance : null,
    averageHeartRate: activity.averageHeartRateBpm ?? detail?.averageHeartRateBpm ?? null,
    energyKcal: detail?.activeKilocalories != null && detail.activeKilocalories > 0 ? detail.activeKilocalories : null,
    elevationGainM: null,
    start: null,
  };
}

export function appleRouteWorkout(
  workout: DeviceWorkout,
  extra?: { start?: OutdoorPoint | null; elevationGainM?: number | null },
): RecordedRouteWorkout | null {
  if (!workout.routeExpected || !workout.id) return null;
  const kind = routeActivityKind(workout.activityType);
  if (!kind) return null;
  const started = Date.parse(workout.startedAt);
  if (!Number.isFinite(started) || !(workout.durationMinutes > 0)) return null;
  const distance = workout.distanceMetres;
  return {
    id: workout.id,
    source: 'apple',
    activity: kind,
    startedAt: new Date(started).toISOString(),
    durationSeconds: Math.round(workout.durationMinutes * 60),
    distanceMetres: distance != null && distance > 0 ? distance : null,
    averageHeartRate: workout.averageHeartRate,
    energyKcal: workout.energyKcal != null && workout.energyKcal > 0 ? workout.energyKcal : null,
    elevationGainM: extra?.elevationGainM ?? null,
    start: extra?.start ?? null,
  };
}

export function workoutsForRouteMatch(input: {
  activities: readonly GarminActivity[];
  activityDetails: readonly GarminActivityDetail[];
  apple: readonly DeviceWorkout[];
  extras?: Readonly<Record<string, { start?: OutdoorPoint | null; elevationGainM?: number | null }>>;
}): RecordedRouteWorkout[] {
  const details = new Map(input.activityDetails.map((row) => [row.summaryId, row]));
  const garmin = input.activities.flatMap((activity) => {
    const row = garminRouteWorkout(activity, details.get(activity.summaryId) ?? null);
    return row ? [row] : [];
  });
  const apple = input.apple.flatMap((workout) => {
    const row = appleRouteWorkout(workout, input.extras?.[workout.id]);
    return row ? [row] : [];
  });
  return dedupeRouteWorkouts([...garmin, ...apple]);
}

/** One session counts once. Garmin keeps the row. Apple fills anything Garmin did not store. */
export function dedupeRouteWorkouts(rows: readonly RecordedRouteWorkout[]): RecordedRouteWorkout[] {
  const garmin = collapseSame(rows.filter((row) => row.source === 'garmin'));
  const apple = collapseSame(rows.filter((row) => row.source === 'apple'));
  const used = new Set<number>();
  const merged: RecordedRouteWorkout[] = [];
  for (const row of garmin) {
    let best = -1;
    let bestScore = 0;
    apple.forEach((other, index) => {
      if (used.has(index)) return;
      const score = sessionScore(row, other);
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });
    if (best < 0) {
      merged.push(row);
      continue;
    }
    used.add(best);
    merged.push(fillFromApple(row, apple[best]));
  }
  apple.forEach((row, index) => {
    if (!used.has(index)) merged.push(row);
  });
  return merged;
}

export function matchRouteCompletions(
  routes: readonly SavedRouteForMatch[],
  workouts: readonly RecordedRouteWorkout[],
): RouteCompletionHistory {
  const byRoute: Record<string, RouteCompletion[]> = {};
  for (const route of routes) byRoute[route.id] = [];
  type Pair = {
    route: SavedRouteForMatch;
    workout: RecordedRouteWorkout;
    confidence: RouteMatchConfidence;
    startGapM: number | null;
    distanceGapM: number;
  };
  const pairs: Pair[] = [];
  for (const route of routes) {
    for (const workout of workouts) {
      const judged = judge(route, workout);
      if (!judged) continue;
      pairs.push({ route, workout, ...judged });
    }
  }
  pairs.sort(betterPair);
  const used = new Set<string>();
  const all: RouteCompletion[] = [];
  for (const pair of pairs) {
    if (used.has(pair.workout.id)) continue;
    used.add(pair.workout.id);
    const completion = completionFrom(pair.route.id, pair.workout, pair.confidence);
    byRoute[pair.route.id] = byRoute[pair.route.id] ?? [];
    byRoute[pair.route.id].push(completion);
    all.push(completion);
  }
  for (const routeId of Object.keys(byRoute)) {
    byRoute[routeId].sort(newestFirst);
  }
  all.sort(newestFirst);
  return { byRoute, all };
}

export function routeHistorySummary(
  completions: readonly RouteCompletion[],
  now = new Date(),
): { completions: number; distanceMetresThisMonth: number } {
  const month = londonDay(now).slice(0, 7);
  let distanceMetresThisMonth = 0;
  for (const row of completions) {
    if (londonDay(row.startedAt).slice(0, 7) !== month) continue;
    distanceMetresThisMonth += row.distanceMetres;
  }
  return { completions: completions.length, distanceMetresThisMonth };
}

export function routeHistorySummaryLine(summary: { completions: number; distanceMetresThisMonth: number }): string {
  const times = summary.completions === 1 ? '1 completion' : `${summary.completions} completions`;
  return `${times} · ${distanceLabel(summary.distanceMetresThisMonth)} this month`;
}

export function routeCompletionSummaryLine(rows: readonly RouteCompletion[]): string {
  const times = rows.length === 1 ? '1 time' : `${rows.length} times`;
  const last = [...rows].sort(newestFirst)[0];
  if (!last) return times;
  return `${times} · Last ${formatUkCompactDay(londonDay(last.startedAt))}`;
}

export function routeCompletionStatLine(row: RouteCompletion): string {
  const movement = row.activity === 'cycle'
    ? (row.averageSpeedKmh != null ? `${row.averageSpeedKmh.toFixed(1)} km/h` : null)
    : paceOrNull(row.averagePaceSecPerKm);
  const parts = [
    formatUkCompactDay(londonDay(row.startedAt)),
    row.confidence === 'likely' ? 'Likely' : null,
    distanceLabel(row.distanceMetres),
    clock(row.durationSeconds * 1000),
    movement,
    row.averageHeartRate != null ? `${Math.round(row.averageHeartRate)} bpm` : null,
    row.energyKcal != null ? `${Math.round(row.energyKcal)} kcal` : null,
    row.elevationGainM != null ? `Elevation gain ${Math.round(row.elevationGainM)} m` : null,
    row.source === 'garmin' ? 'Garmin' : 'Apple Health',
  ].filter((part): part is string => part != null && part.length > 0);
  return parts.join(' · ');
}

function paceOrNull(secPerKm: number | null): string | null {
  const label = paceLabel(secPerKm);
  return label === '—' ? null : label;
}

function judge(
  route: SavedRouteForMatch,
  workout: RecordedRouteWorkout,
): { confidence: RouteMatchConfidence; startGapM: number | null; distanceGapM: number } | null {
  if (!onOrAfter(workout.startedAt, route.createdAt)) return null;
  if (!typeOk(route.activity, workout.activity)) return null;
  if (workout.distanceMetres == null || !distanceOk(route.distanceM, workout.distanceMetres)) return null;
  const startGapM = route.start && workout.start ? metresBetween(route.start, workout.start) : null;
  if (startGapM != null && startGapM > ROUTE_START_NEAR_M) return null;
  return {
    confidence: startGapM != null ? 'matched' : 'likely',
    startGapM,
    distanceGapM: Math.abs(route.distanceM - workout.distanceMetres),
  };
}

function onOrAfter(startedAt: string, createdAt: string): boolean {
  const started = Date.parse(startedAt);
  const created = Date.parse(createdAt);
  if (!Number.isFinite(started) || !Number.isFinite(created)) return false;
  return started >= created;
}

function typeOk(route: RouteActivityKind | null, workout: RouteActivityKind | null): boolean {
  if (route == null || workout == null) return true;
  return route === workout;
}

function distanceOk(routeM: number, workoutM: number): boolean {
  if (!(routeM > 0) || !(workoutM > 0)) return false;
  const allowance = Math.max(ROUTE_DISTANCE_FLOOR_M, routeM * ROUTE_DISTANCE_RATIO);
  return Math.abs(routeM - workoutM) <= allowance;
}

function betterPair(
  left: { confidence: RouteMatchConfidence; startGapM: number | null; distanceGapM: number; route: SavedRouteForMatch },
  right: { confidence: RouteMatchConfidence; startGapM: number | null; distanceGapM: number; route: SavedRouteForMatch },
): number {
  if (left.confidence !== right.confidence) return left.confidence === 'matched' ? -1 : 1;
  const leftGap = left.startGapM ?? Number.POSITIVE_INFINITY;
  const rightGap = right.startGapM ?? Number.POSITIVE_INFINITY;
  if (leftGap !== rightGap) return leftGap - rightGap;
  if (left.distanceGapM !== right.distanceGapM) return left.distanceGapM - right.distanceGapM;
  if (left.route.createdAt === right.route.createdAt) return 0;
  return left.route.createdAt < right.route.createdAt ? 1 : -1;
}

function newestFirst(left: { startedAt: string }, right: { startedAt: string }): number {
  if (left.startedAt === right.startedAt) return 0;
  return left.startedAt < right.startedAt ? 1 : -1;
}

function completionFrom(
  routeId: string,
  workout: RecordedRouteWorkout,
  confidence: RouteMatchConfidence,
): RouteCompletion {
  const distanceMetres = workout.distanceMetres ?? 0;
  const movingMs = workout.durationSeconds * 1000;
  const averageSpeedKmh = workout.durationSeconds > 0
    ? Math.round((distanceMetres / 1000) / (workout.durationSeconds / 3600) * 10) / 10
    : null;
  return {
    workoutId: workout.id,
    routeId,
    confidence,
    source: workout.source,
    activity: workout.activity,
    startedAt: workout.startedAt,
    durationSeconds: workout.durationSeconds,
    distanceMetres,
    averagePaceSecPerKm: averagePaceSecPerKm(distanceMetres, movingMs),
    averageSpeedKmh,
    averageHeartRate: workout.averageHeartRate,
    energyKcal: workout.energyKcal,
    elevationGainM: workout.elevationGainM,
  };
}

function durationMs(row: RecordedRouteWorkout): number {
  return Math.max(0, row.durationSeconds) * 1000;
}

function sameSession(left: RecordedRouteWorkout, right: RecordedRouteWorkout): boolean {
  const leftMs = durationMs(left);
  const rightMs = durationMs(right);
  if (!(leftMs > 0) || !(rightMs > 0)) return false;
  const leftStart = Date.parse(left.startedAt);
  const rightStart = Date.parse(right.startedAt);
  if (!Number.isFinite(leftStart) || !Number.isFinite(rightStart)) return false;
  const overlap = Math.min(leftStart + leftMs, rightStart + rightMs) - Math.max(leftStart, rightStart);
  const shorter = Math.min(leftMs, rightMs);
  if (overlap >= shorter * 0.5) return true;
  const gap = Math.abs(leftStart - rightStart);
  if (gap > TWO_MINUTES_MS) return false;
  const longer = Math.max(leftMs, rightMs);
  return shorter >= longer * 0.8 || Math.abs(leftMs - rightMs) <= TWO_MINUTES_MS;
}

function sessionScore(left: RecordedRouteWorkout, right: RecordedRouteWorkout): number {
  if (!sameSession(left, right)) return 0;
  const leftMs = durationMs(left);
  const rightMs = durationMs(right);
  const leftStart = Date.parse(left.startedAt);
  const rightStart = Date.parse(right.startedAt);
  const overlap = Math.min(leftStart + leftMs, rightStart + rightMs) - Math.max(leftStart, rightStart);
  const shorter = Math.min(leftMs, rightMs);
  if (overlap > 0 && shorter > 0) return overlap / shorter;
  return 0.5;
}

function fillFromApple(garmin: RecordedRouteWorkout, apple: RecordedRouteWorkout): RecordedRouteWorkout {
  return {
    ...garmin,
    activity: garmin.activity ?? apple.activity,
    distanceMetres: garmin.distanceMetres ?? apple.distanceMetres,
    averageHeartRate: garmin.averageHeartRate ?? apple.averageHeartRate,
    energyKcal: garmin.energyKcal ?? apple.energyKcal,
    elevationGainM: garmin.elevationGainM ?? apple.elevationGainM,
    start: garmin.start ?? apple.start,
    source: 'garmin',
  };
}

function richness(row: RecordedRouteWorkout): number {
  return (row.distanceMetres != null ? 2 : 0)
    + (row.averageHeartRate != null ? 1 : 0)
    + (row.energyKcal != null ? 1 : 0)
    + (row.start != null ? 2 : 0)
    + row.durationSeconds;
}

function collapseSame(rows: readonly RecordedRouteWorkout[]): RecordedRouteWorkout[] {
  const kept: RecordedRouteWorkout[] = [];
  for (const row of rows) {
    const index = kept.findIndex((other) => sameSession(row, other));
    if (index < 0) {
      kept.push(row);
      continue;
    }
    kept[index] = richness(kept[index]) >= richness(row) ? fillGaps(kept[index], row) : fillGaps(row, kept[index]);
  }
  return kept;
}

function fillGaps(primary: RecordedRouteWorkout, other: RecordedRouteWorkout): RecordedRouteWorkout {
  return {
    ...primary,
    activity: primary.activity ?? other.activity,
    distanceMetres: primary.distanceMetres ?? other.distanceMetres,
    averageHeartRate: primary.averageHeartRate ?? other.averageHeartRate,
    energyKcal: primary.energyKcal ?? other.energyKcal,
    elevationGainM: primary.elevationGainM ?? other.elevationGainM,
    start: primary.start ?? other.start,
  };
}
