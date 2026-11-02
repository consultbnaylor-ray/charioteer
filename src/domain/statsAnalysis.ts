import type { GarminReadings } from '@/domain/garminConnect';
import { readingFor, type MetricContext } from '@/domain/metricRegistry';
import { GOAL_LABEL, type NutritionGoal, type NutritionSex } from '@/domain/nutrition';
import {
  localStatsVerdict,
  sanitizeStatsAnalysis,
  type AnalysisStat,
  type AnalysisStatId,
  type StatsAnalysisPayload,
} from '../../supabase/functions/_shared/statsAnalysis.ts';

export { localStatsVerdict, sanitizeStatsAnalysis, type AnalysisStat, type StatsAnalysisPayload };

export const THUMOS_ANALYSE = 'Have Thumos Analyze your data';

export const THUMOS_ANALYSE_CREDIT = 'This uses one AI credit.';

export const THUMOS_ANALYSE_LOCAL = 'Written on this phone because the coach did not answer. Not medical advice. Not a diagnosis.';

type Point = { day: string; value: number };

type BuildInput = {
  today: string;
  age: number | null;
  sex: NutritionSex | null;
  goal: NutritionGoal | null;
  heightCm: number | null;
  samples: readonly { kind: string; value: number; recordedOn: string }[];
  readings: GarminReadings;
};

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function trendOf(points: readonly Point[]): AnalysisStat['trend'] {
  if (points.length < 2) return 'none';
  const latest = points[points.length - 1]?.value ?? 0;
  const earlier = points.slice(0, -1);
  const base = earlier.reduce((sum, point) => sum + point.value, 0) / earlier.length;
  if (!Number.isFinite(base)) return 'none';
  const delta = base === 0 ? latest : (latest - base) / Math.abs(base);
  if (Math.abs(delta) < 0.08) return 'steady';
  return latest > base ? 'up' : 'down';
}

function statFrom(id: AnalysisStatId, points: readonly Point[], ctx: MetricContext): AnalysisStat | null {
  const ordered = points
    .filter((point) => Number.isFinite(point.value))
    .sort((left, right) => left.day.localeCompare(right.day))
    .slice(-30);
  if (ordered.length === 0) return null;
  const latest = ordered[ordered.length - 1]?.value ?? null;
  if (latest == null) return null;
  const average = ordered.reduce((sum, point) => sum + point.value, 0) / ordered.length;
  const reading = readingFor(id, latest, ctx);
  return {
    id,
    latest: round(latest),
    average: round(average),
    trend: trendOf(ordered),
    rating: reading.pending ? 'No rating yet' : reading.label,
    range: reading.where.replace(/\s+/g, ' ').trim().slice(0, 220),
  };
}

function byDay(rows: readonly { day: string; value: number | null | undefined }[]): Point[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.day || row.value == null || !Number.isFinite(row.value)) continue;
    map.set(row.day, row.value);
  }
  return [...map.entries()].map(([day, value]) => ({ day, value }));
}

function samplesOf(samples: BuildInput['samples'], kind: string): Point[] {
  return samples.flatMap((sample) => {
    const day = sample.recordedOn.slice(0, 10);
    if (sample.kind !== kind || !(sample.value > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
    return [{ day, value: sample.value }];
  });
}

function sumByDay(rows: readonly { day: string; value: number }[]): Point[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.day || !Number.isFinite(row.value)) continue;
    map.set(row.day, (map.get(row.day) ?? 0) + row.value);
  }
  return [...map.entries()].map(([day, value]) => ({ day, value }));
}

/** Recent averages, latest, trend, and the on-phone rating. No raw slices, files, or coordinates. */
export function buildStatsAnalysis(input: BuildInput): StatsAnalysisPayload {
  const readings = input.readings;
  const dailies = readings.dailies ?? [];
  const vigorousWeek = dailies
    .filter((day) => day.calendarDate <= input.today && day.calendarDate >= shift(input.today, -6))
    .reduce((sum, day) => sum + (day.vigorousMinutes ?? 0), 0);
  const latestVo2 = [...(readings.userMetrics ?? [])].filter((row) => row.vo2Max != null).sort((a, b) => a.calendarDate.localeCompare(b.calendarDate)).at(-1)?.vo2Max ?? null;
  const latestRest = [...dailies].filter((row) => row.restingHeartRateBpm != null).sort((a, b) => a.calendarDate.localeCompare(b.calendarDate)).at(-1)?.restingHeartRateBpm ?? null;
  const latestComp = [...(readings.bodyComp ?? [])].sort((a, b) => a.calendarDate.localeCompare(b.calendarDate)).at(-1);
  const ctx: MetricContext = {
    age: input.age,
    sex: input.sex,
    goal: input.goal,
    ownUsual: null,
    heightCm: input.heightCm,
    realAge: input.age,
    vo2: latestVo2,
    restingHr: latestRest,
    bmi: latestComp?.bmi ?? null,
    bodyFat: latestComp?.bodyFatPct ?? null,
    vigorousWeek: vigorousWeek > 0 ? vigorousWeek : null,
  };
  const groups: [AnalysisStatId, Point[]][] = [
    ['steps', samplesOf(input.samples, 'steps')],
    ['sleep_hours', samplesOf(input.samples, 'sleep_hours')],
    ['resting_heart_rate', byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.restingHeartRateBpm })))],
    ['vo2', byDay((readings.userMetrics ?? []).map((row) => ({ day: row.calendarDate, value: row.vo2Max })))],
    ['weight_kg', samplesOf(input.samples, 'weight_kg')],
    ['weekly_active_minutes', samplesOf(input.samples, 'workout_minutes')],
    ['vigorous', byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.vigorousMinutes })))],
    ['stress', byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.averageStressLevel })))],
    ['stress_detail', byDay((readings.stress ?? []).map((row) => ({ day: row.calendarDate, value: row.averageStress })))],
    ['body_battery_charged', byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.bodyBatteryCharged })))],
    ['body_battery_drained', byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.bodyBatteryDrained })))],
    ['body_battery_highest', byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.bodyBatteryHighest })))],
    ['body_battery_lowest', byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.bodyBatteryLowest })))],
    ['sleep_score', byDay((readings.sleep ?? []).map((row) => ({ day: row.calendarDate, value: row.sleepScore })))],
    ['sleep_duration', byDay((readings.sleep ?? []).map((row) => ({ day: row.calendarDate, value: row.durationSeconds > 0 ? row.durationSeconds / 3600 : null })))],
    ['respiration', byDay((readings.respiration ?? []).map((row) => ({ day: row.calendarDate, value: row.averageBreathsPerMinute })))],
    ['pulse_ox', byDay((readings.pulseOx ?? []).map((row) => ({ day: row.calendarDate, value: row.averageSpo2 })))],
    ['skin_temp', byDay((readings.skinTemp ?? []).map((row) => ({ day: row.calendarDate, value: row.deviationC })))],
    ['blood_pressure', byDay((readings.bloodPressure ?? []).map((row) => ({ day: row.calendarDate, value: row.systolic })))],
    ['diastolic', byDay((readings.bloodPressure ?? []).map((row) => ({ day: row.calendarDate, value: row.diastolic })))],
    ['body_fat', byDay((readings.bodyComp ?? []).map((row) => ({ day: row.calendarDate, value: row.bodyFatPct })))],
    ['bmi', byDay((readings.bodyComp ?? []).map((row) => ({ day: row.calendarDate, value: row.bmi })))],
    ['snapshot_heart', byDay((readings.healthSnapshot ?? []).map((row) => ({ day: row.calendarDate, value: row.restingHeartRateBpm ?? row.heartRateBpm })))],
    ['epoch_minutes', sumByDay((readings.epochs ?? []).flatMap((row) => row.activeSeconds != null && row.activeSeconds > 0 ? [{ day: row.calendarDate, value: row.activeSeconds / 60 }] : []))],
    ['move_iq', sumByDay((readings.moveIq ?? []).flatMap((row) => row.durationSeconds != null && row.durationSeconds > 0 ? [{ day: row.calendarDate, value: row.durationSeconds / 60 }] : []))],
    ['activity_detail', sumByDay((readings.activityDetails ?? []).flatMap((row) => row.durationSeconds != null && row.durationSeconds > 0 ? [{ day: row.calendarDate, value: row.durationSeconds / 60 }] : []))],
    ['hrv', byDay((readings.hrv ?? []).map((row) => ({ day: row.calendarDate, value: row.lastNightAvgMs })))],
    ['fitness_age', byDay((readings.userMetrics ?? []).map((row) => ({ day: row.calendarDate, value: row.fitnessAge })))],
  ];
  const stats = groups.flatMap(([id, points]) => {
    const stat = statFrom(id, points, ctx);
    return stat ? [stat] : [];
  });
  return sanitizeStatsAnalysis({
    age: input.age,
    sex: input.sex,
    goal: input.goal ? GOAL_LABEL[input.goal] : null,
    stats,
  }) ?? { age: input.age, sex: input.sex, goal: input.goal ? GOAL_LABEL[input.goal] : null, stats: [] };
}

function shift(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
