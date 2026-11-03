import type { GarminReadings } from '@/domain/garminConnect';
import { FITNESS_GOAL_LABEL, fuelTradeOffLine } from '@/domain/fitnessGoal';
import { athleticVo2Target, publishedCardioBand, vo2ForFitnessGoal } from '@/domain/fitnessSnapshot';
import { heartRateMaxFrom } from '@/domain/trainingGuidance';
import { CMO_VIGOROUS_MINUTES_WEEK } from '@/domain/guidance';
import { activeMinutesByDay } from '@/domain/healthSources';
import { readingFor, type MetricContext } from '@/domain/metricRegistry';
import { buildDailyTargets } from '@/domain/dailyTargets';
import { GOAL_LABEL, isAnyBoxer, proteinGramsFor, type NutritionGoal, type NutritionSex } from '@/domain/nutrition';
import {
  ANALYSIS_STAT_NAMES,
  analysisParagraphs,
  analysisSectionsFromText,
  coerceAnalysisSections,
  localStatsVerdict,
  nutritionBriefFromLogs,
  nutritionReviewLines,
  sanitizeStatsAnalysis,
  withNutritionReview,
  type AnalysisSection,
  type AnalysisStat,
  type AnalysisStatId,
  type StatsAnalysisPayload,
} from '../../supabase/functions/_shared/statsAnalysis.ts';

export {
  analysisParagraphs,
  analysisSectionsFromText,
  coerceAnalysisSections,
  localStatsVerdict,
  nutritionBriefFromLogs,
  nutritionReviewLines,
  sanitizeStatsAnalysis,
  withNutritionReview,
  type AnalysisSection,
  type AnalysisStat,
  type StatsAnalysisPayload,
};

export const THUMOS_ANALYSE = 'Have Thumos Analyze your data';

export const THUMOS_ANALYSE_CREDIT = 'This uses one AI credit.';

export const THUMOS_ANALYSE_LOCAL = 'Written on this phone because the coach did not answer.';

export const THUMOS_ANALYSIS_CAVEAT =
  'Not medical advice. Not a diagnosis. If you feel unwell, contact your GP or NHS 111. Call 999 for chest pain, fainting or breathlessness. If you are in distress, call Samaritans on 116 123. Call 999 if you are in immediate danger.';

type Point = { day: string; value: number };

type BuildInput = {
  today: string;
  age: number | null;
  sex: NutritionSex | null;
  goal: NutritionGoal | null;
  heightCm: number | null;
  samples: readonly { kind: string; value: number; recordedOn: string }[];
  readings: GarminReadings;
  targetWeightKg?: number | null;
  targetOn?: string | null;
  activeEnergyKcal?: number | null;
  fitnessGoal?: import('@/domain/fitnessGoal').FitnessGoal | null;
  kcalTarget?: number | null;
  proteinTarget?: number | null;
  hideCalories?: boolean;
  build?: import('@/domain/nutrition').BodyBuild | null;
  phase?: import('@/domain/nutrition').BuilderPhase | null;
  logs?: readonly { eatenOn: string; meal?: string; note?: string; estimated?: boolean; portion?: number; items: readonly { name?: string; kcal?: number; proteinG?: number }[] }[];
};

const WHOLE_IDS = new Set<AnalysisStatId>([
  'steps',
  'sleep_score',
  'stress',
  'stress_detail',
  'body_battery_charged',
  'body_battery_drained',
  'body_battery_highest',
  'body_battery_lowest',
  'resting_heart_rate',
  'snapshot_heart',
  'fitness_age',
  'hrv',
  'hrv_sdnn',
  'vigorous',
  'weekly_active_minutes',
  'epoch_minutes',
  'move_iq',
  'activity_detail',
  'blood_pressure',
  'diastolic',
  'pulse_ox',
]);

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function presentNumber(id: AnalysisStatId, value: number): number {
  return WHOLE_IDS.has(id) ? Math.round(value) : round(value);
}

function sportGoal(goal: NutritionGoal | null): boolean {
  return goal != null && (isAnyBoxer(goal) || goal === 'elite_runner' || goal === 'body_builder');
}

/** The same targets the fitness-age card uses. A gap is only set when the figure is short of that target. */
function goalMark(id: AnalysisStatId, value: number, ctx: MetricContext): { goalTarget: string | null; goalGap: number | null } {
  if (ctx.fitnessGoal && id === 'vo2') {
    const aim = vo2ForFitnessGoal(ctx.age, ctx.sex, ctx.fitnessGoal);
    if (aim) {
      return {
        goalTarget: aim.label,
        goalGap: value < aim.target ? round(aim.target - value) : null,
      };
    }
  }
  if (ctx.fitnessGoal && id === 'fitness_age' && ctx.age != null) {
    const years = ctx.fitnessGoal === 'younger_2' ? 2 : ctx.fitnessGoal === 'younger_5' ? 5 : ctx.fitnessGoal === 'younger_10' ? 10 : 0;
    const aim = Math.max(20, Math.round(ctx.age) - years);
    const fitness = Math.round(value);
    return { goalTarget: `at or under age ${aim}`, goalGap: fitness > aim + 1 ? fitness - aim : null };
  }
  if (!sportGoal(ctx.goal)) return { goalTarget: null, goalGap: null };
  if (id === 'vo2') {
    const boxing = athleticVo2Target(ctx.goal, ctx.sex);
    if (boxing) {
      return {
        goalTarget: `${boxing.low}–${boxing.high} ml/kg/min`,
        goalGap: value < boxing.low ? round(boxing.low - value) : null,
      };
    }
    const ageBand = publishedCardioBand(ctx.age, ctx.sex);
    if (ageBand) {
      return {
        goalTarget: `at or above ${ageBand.high} ml/kg/min`,
        goalGap: value < ageBand.high ? round(ageBand.high - value) : null,
      };
    }
  }
  if (id === 'resting_heart_rate') {
    const bpm = Math.round(value);
    return { goalTarget: '40–60 bpm', goalGap: bpm > 60 ? bpm - 60 : null };
  }
  if (id === 'body_fat' && ctx.sex) {
    const high = ctx.sex === 'female' ? 20 : 13;
    const low = ctx.sex === 'female' ? 14 : 6;
    return { goalTarget: `${low}–${high}%`, goalGap: value > high ? round(value - high) : null };
  }
  if (id === 'vigorous') {
    const minutes = Math.round(value);
    return {
      goalTarget: `${CMO_VIGOROUS_MINUTES_WEEK} min in the last 7 days`,
      goalGap: minutes < CMO_VIGOROUS_MINUTES_WEEK ? CMO_VIGOROUS_MINUTES_WEEK - minutes : null,
    };
  }
  if (id === 'fitness_age' && ctx.age != null) {
    const age = Math.round(ctx.age);
    const fitness = Math.round(value);
    return { goalTarget: `at or under age ${age}`, goalGap: fitness > age + 1 ? fitness - age : null };
  }
  return { goalTarget: null, goalGap: null };
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

const PARTIAL_TODAY = new Set<AnalysisStatId>([
  'steps',
  'weekly_active_minutes',
  'vigorous',
  'epoch_minutes',
  'move_iq',
  'activity_detail',
  'stress',
  'stress_detail',
  'body_battery_charged',
  'body_battery_drained',
]);

function mean(points: readonly Point[]): number | null {
  if (points.length === 0) return null;
  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

function statFrom(
  id: AnalysisStatId,
  points: readonly Point[],
  ctx: MetricContext,
  today: string,
  mode: 'day' | 'week',
): AnalysisStat | null {
  const ordered = points
    .filter((point) => Number.isFinite(point.value))
    .sort((left, right) => left.day.localeCompare(right.day))
    .slice(-30);
  if (ordered.length === 0) return null;
  const partial = mode === 'week' || PARTIAL_TODAY.has(id);
  const complete = (partial ? ordered.filter((point) => point.day < today) : ordered).slice(-30);
  const todayPoint = ordered.find((point) => point.day === today) ?? null;
  const name = ANALYSIS_STAT_NAMES[id];
  if (complete.length === 0) {
    if (!partial || !todayPoint) return null;
    return {
      id,
      name,
      value: null,
      latest: null,
      average: null,
      today: presentNumber(id, todayPoint.value),
      trend: 'none',
      rating: 'No rating yet',
      range: 'Today is still in progress, so this figure is not rated.',
      tip: null,
      goalTarget: null,
      goalGap: null,
    };
  }
  const recent = mode === 'week'
    ? complete.filter((point) => point.day >= shift(today, -7))
    : complete.slice(-7);
  const ratedPoints = recent.length > 0 ? recent : complete.slice(-7);
  const dailyAverage = mean(ratedPoints);
  const rated = mode === 'week'
    ? ratedPoints.reduce((sum, point) => sum + point.value, 0)
    : dailyAverage;
  if (rated == null) return null;
  const latest = ratedPoints[ratedPoints.length - 1]?.value ?? complete[complete.length - 1]?.value ?? null;
  const earlier = complete.slice(0, -1);
  const reading = readingFor(id, rated, {
    ...ctx,
    ownUsual: earlier.length > 0 ? mean(earlier) : null,
    windowDays: mode === 'week' ? 7 : ctx.windowDays,
  });
  const showToday = partial && todayPoint != null && dailyAverage != null && todayPoint.value < dailyAverage * 0.6;
  const shown = presentNumber(id, rated);
  const mark = goalMark(id, shown, ctx);
  const lever = reading.label === 'Fair' || reading.label === 'Poor' || (mark.goalGap != null && mark.goalGap > 0);
  return {
    id,
    name,
    value: shown,
    latest: latest == null ? null : presentNumber(id, latest),
    average: dailyAverage == null ? null : presentNumber(id, dailyAverage),
    today: showToday && todayPoint ? presentNumber(id, todayPoint.value) : null,
    trend: trendOf(complete),
    rating: reading.pending ? 'No rating yet' : reading.label,
    range: reading.where.replace(/\s+/g, ' ').trim().slice(0, 220),
    tip: lever ? (reading.tips[0] ?? '').slice(0, 180) || null : null,
    goalTarget: mark.goalTarget,
    goalGap: mark.goalGap,
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

function mergeMax(left: readonly Point[], right: readonly Point[]): Point[] {
  const map = new Map<string, number>();
  for (const point of [...left, ...right]) {
    if (!point.day || !Number.isFinite(point.value)) continue;
    const current = map.get(point.day);
    map.set(point.day, current == null ? point.value : Math.max(current, point.value));
  }
  return [...map.entries()].map(([day, value]) => ({ day, value }));
}

function preferDays(primary: readonly Point[], fallback: readonly Point[]): Point[] {
  const taken = new Set(primary.map((point) => point.day));
  return [...primary, ...fallback.filter((point) => !taken.has(point.day))];
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
    fitnessGoal: input.fitnessGoal ?? null,
    ownUsual: null,
    heightCm: input.heightCm,
    realAge: input.age,
    vo2: latestVo2,
    restingHr: latestRest,
    bmi: latestComp?.bmi ?? null,
    bodyFat: latestComp?.bodyFatPct ?? null,
    vigorousWeek: vigorousWeek > 0 ? vigorousWeek : null,
  };
  const sleepHours = preferDays(
    samplesOf(input.samples, 'sleep_hours'),
    byDay((readings.sleep ?? []).map((row) => ({ day: row.calendarDate, value: row.durationSeconds > 0 ? row.durationSeconds / 3600 : null }))),
  );
  const groups: [AnalysisStatId, Point[], 'day' | 'week'][] = [
    ['steps', mergeMax(samplesOf(input.samples, 'steps'), byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.steps })))), 'day'],
    ['sleep_hours', sleepHours, 'day'],
    ['resting_heart_rate', preferDays(byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.restingHeartRateBpm }))), samplesOf(input.samples, 'resting_heart_rate')), 'day'],
    ['vo2', preferDays(byDay((readings.userMetrics ?? []).map((row) => ({ day: row.calendarDate, value: row.vo2Max }))), samplesOf(input.samples, 'vo2_max')), 'day'],
    ['weight_kg', preferDays(samplesOf(input.samples, 'weight_kg'), byDay((readings.bodyComp ?? []).map((row) => ({ day: row.calendarDate, value: row.weightKg })))), 'day'],
    ['weekly_active_minutes', activeMinutesByDay(input.samples, dailies).map((row) => ({ day: row.day, value: row.value })), 'week'],
    ['vigorous', byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.vigorousMinutes }))), 'week'],
    ['stress', byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.averageStressLevel }))), 'day'],
    ['stress_detail', byDay((readings.stress ?? []).map((row) => ({ day: row.calendarDate, value: row.averageStress }))), 'day'],
    ['body_battery_charged', byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.bodyBatteryCharged }))), 'day'],
    ['body_battery_drained', byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.bodyBatteryDrained }))), 'day'],
    ['body_battery_highest', byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.bodyBatteryHighest }))), 'day'],
    ['body_battery_lowest', byDay(dailies.map((row) => ({ day: row.calendarDate, value: row.bodyBatteryLowest }))), 'day'],
    ['sleep_score', byDay((readings.sleep ?? []).map((row) => ({ day: row.calendarDate, value: row.sleepScore }))), 'day'],
    ['sleep_duration', byDay((readings.sleep ?? []).map((row) => ({ day: row.calendarDate, value: row.durationSeconds > 0 ? row.durationSeconds / 3600 : null }))), 'day'],
    ['respiration', byDay((readings.respiration ?? []).map((row) => ({ day: row.calendarDate, value: row.averageBreathsPerMinute }))), 'day'],
    ['pulse_ox', byDay((readings.pulseOx ?? []).map((row) => ({ day: row.calendarDate, value: row.averageSpo2 }))), 'day'],
    ['skin_temp', byDay((readings.skinTemp ?? []).map((row) => ({ day: row.calendarDate, value: row.deviationC }))), 'day'],
    ['blood_pressure', byDay((readings.bloodPressure ?? []).map((row) => ({ day: row.calendarDate, value: row.systolic }))), 'day'],
    ['diastolic', byDay((readings.bloodPressure ?? []).map((row) => ({ day: row.calendarDate, value: row.diastolic }))), 'day'],
    ['body_fat', byDay((readings.bodyComp ?? []).map((row) => ({ day: row.calendarDate, value: row.bodyFatPct }))), 'day'],
    ['bmi', byDay((readings.bodyComp ?? []).map((row) => ({ day: row.calendarDate, value: row.bmi }))), 'day'],
    ['snapshot_heart', byDay((readings.healthSnapshot ?? []).map((row) => ({ day: row.calendarDate, value: row.restingHeartRateBpm ?? row.heartRateBpm }))), 'day'],
    ['epoch_minutes', sumByDay((readings.epochs ?? []).flatMap((row) => row.activeSeconds != null && row.activeSeconds > 0 ? [{ day: row.calendarDate, value: row.activeSeconds / 60 }] : [])), 'day'],
    ['move_iq', sumByDay((readings.moveIq ?? []).flatMap((row) => row.durationSeconds != null && row.durationSeconds > 0 ? [{ day: row.calendarDate, value: row.durationSeconds / 60 }] : [])), 'day'],
    ['activity_detail', sumByDay((readings.activityDetails ?? []).flatMap((row) => row.durationSeconds != null && row.durationSeconds > 0 ? [{ day: row.calendarDate, value: row.durationSeconds / 60 }] : [])), 'day'],
    ['hrv', byDay((readings.hrv ?? []).map((row) => ({ day: row.calendarDate, value: row.lastNightAvgMs }))), 'day'],
    ['hrv_sdnn', samplesOf(input.samples, 'hrv_sdnn'), 'day'],
    ['fitness_age', byDay((readings.userMetrics ?? []).map((row) => ({ day: row.calendarDate, value: row.fitnessAge }))), 'day'],
  ];
  const built = groups.flatMap(([id, points, mode]) => {
    const stat = statFrom(id, points, ctx, input.today, mode);
    return stat ? [stat] : [];
  });
  const present = new Set(built.map((stat) => stat.id));
  const stats = built.filter((stat) => {
    if (stat.id === 'sleep_duration' && present.has('sleep_hours')) return false;
    if (stat.id === 'stress_detail' && present.has('stress')) return false;
    return true;
  });
  const weightPoints = samplesOf(input.samples, 'weight_kg').sort((left, right) => left.day.localeCompare(right.day));
  const currentKg = weightPoints.length ? weightPoints[weightPoints.length - 1]?.value ?? null : null;
  const start = weightPoints[0];
  const recentEnergy = samplesOf(input.samples, 'active_energy').filter((point) => point.day <= input.today && point.day >= shift(input.today, -6));
  const activeEnergy = input.activeEnergyKcal ?? (recentEnergy.length
    ? recentEnergy.reduce((sum, point) => sum + point.value, 0) / recentEnergy.length
    : null);
  const plan = input.targetWeightKg != null && input.targetOn && currentKg != null
    ? buildDailyTargets({
      currentKg,
      targetKg: input.targetWeightKg,
      targetOn: input.targetOn,
      today: input.today,
      heightCm: input.heightCm,
      age: input.age,
      sex: input.sex,
      activeEnergyKcal: activeEnergy,
      startKg: start?.value ?? null,
      startDay: start?.day ?? null,
      fitnessGoal: input.fitnessGoal ?? null,
    })
    : null;
  const goalLabel = input.goal ? GOAL_LABEL[input.goal] : null;
  const fitnessLabel = input.fitnessGoal ? FITNESS_GOAL_LABEL[input.fitnessGoal] : null;
  const vo2Aim = input.fitnessGoal ? vo2ForFitnessGoal(input.age, input.sex, input.fitnessGoal) : null;
  const losing = input.goal === 'lose_weight' || input.goal === 'lose_fat_build_muscle';
  const maxHeartRate = heartRateMaxFrom({
    age: input.age,
    recorded: dailies.map((day) => day.maxHeartRateBpm),
  });
  const nutrition = nutritionBriefFromLogs({
    today: input.today,
    logs: input.logs ?? [],
    weightKg: currentKg,
    calorieTarget: input.hideCalories ? null : (plan?.targetKcal ?? input.kcalTarget ?? null),
    proteinTargetG: input.proteinTarget ?? null,
    goalProteinG: input.goal && currentKg != null ? proteinGramsFor(input.goal, currentKg, input.build ?? null, input.phase ?? null) : null,
    hideCalories: input.hideCalories === true,
  });
  return sanitizeStatsAnalysis({
    age: input.age,
    sex: input.sex,
    goal: [goalLabel, fitnessLabel ? `Fitness goal: ${fitnessLabel}` : null].filter(Boolean).join('. ') || null,
    weightPlan: plan?.analysisLine ?? null,
    fitnessGoal: fitnessLabel,
    vo2Goal: vo2Aim?.label ?? null,
    fuelNote: fuelTradeOffLine(losing, input.fitnessGoal ?? 'normal'),
    maxHeartRate,
    nutrition,
    stats,
  }) ?? { age: input.age, sex: input.sex, goal: goalLabel, weightPlan: plan?.analysisLine ?? null, maxHeartRate, nutrition, stats: [] };
}

function shift(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
