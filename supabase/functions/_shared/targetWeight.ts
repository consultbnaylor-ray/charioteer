import type { NutritionGoal, NutritionSettings } from './nutrition.ts';

/**
 * A private target weight. Kilograms are canonical.
 * A preset goal and this target are not on together: picking one clears the other.
 */

export const TARGET_BMI_FLOOR = 18.5;

export const TARGET_BELOW_HEALTHY = 'This target is lower than a healthy range for your height';

export const TARGET_DATE_FAST =
  "That date would need a faster loss than is safe, so we'll pace it at a safer rate and show the later date";

export const TARGET_DATE_FAST_GAIN =
  "That date would need a faster gain than is safe, so we'll pace it at a safer rate and show the later date";

export const TARGET_NOT_ENOUGH =
  "There isn't enough weight data yet to estimate a date.";

export const TARGET_TREND_FLAT =
  "There isn't an estimated date. The recent weight trend is not moving toward this target.";

/** Gentle loss or gain used for the calorie suggestion. */
export const GENTLE_WEEKLY_KG = 0.25;

/** Nothing faster than this, and nothing faster than about 1% of body weight. */
export const MAX_WEEKLY_KG = 0.5;

export const MAX_WEEKLY_FRACTION = 0.01;

/** Fewer than this many readings is not enough to estimate a date from the trend. */
export const TARGET_READING_MIN = 3;

export const KCAL_PER_KG = 7700;

export type TargetDirection = 'lose' | 'hold' | 'gain';

export type WeightReading = { day: string; kg: number };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function roundKg(kg: number): number {
  return Math.round(kg * 10) / 10;
}

export function targetBmi(weightKg: number, heightCm: number): number | null {
  if (!(heightCm >= 50 && heightCm <= 250) || !(weightKg > 0)) return null;
  const metres = heightCm / 100;
  return Math.round((weightKg / (metres * metres)) * 10) / 10;
}

/** The fastest weekly change that stays inside the cap. Never above 0.5 kg, never above 1% of body weight. */
export function safeWeeklyChangeKg(currentKg: number): number {
  if (!(currentKg > 0)) return GENTLE_WEEKLY_KG;
  const cap = Math.min(MAX_WEEKLY_KG, currentKg * MAX_WEEKLY_FRACTION);
  return roundKg(cap);
}

/** The pace used for suggestions. Gentle, and never above the safe cap. */
export function plannedWeeklyChangeKg(currentKg: number): number {
  const gentle = Math.min(GENTLE_WEEKLY_KG, safeWeeklyChangeKg(currentKg));
  return Math.round(gentle * 100) / 100;
}

export function targetDirection(currentKg: number, targetKg: number): TargetDirection {
  const gap = roundKg(targetKg - currentKg);
  if (Math.abs(gap) < 0.3) return 'hold';
  return gap < 0 ? 'lose' : 'gain';
}

export function goalForTargetDirection(direction: TargetDirection): NutritionGoal {
  if (direction === 'lose') return 'lose_weight';
  if (direction === 'gain') return 'increase';
  return 'maintain';
}

export function addIsoDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1));
  next.setUTCDate(next.getUTCDate() + Math.round(days));
  return next.toISOString().slice(0, 10);
}

export function isoDaysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

export function formatIsoDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const name = MONTHS[(month ?? 1) - 1] ?? '';
  return `${date ?? 1} ${name} ${year ?? ''}`.trim();
}

export type TargetReview =
  | { ok: false; note: string }
  | {
    ok: true;
    targetKg: number;
    direction: TargetDirection;
    /** Null when they did not pick a date. The later safe date when their date was too fast. */
    targetOn: string | null;
    /** Set when the chosen date was replaced. */
    note: string | null;
    paced: boolean;
  };

/**
 * Refuse a target under BMI 18.5. A date that needs a faster change is kept only as a later, safer date.
 */
export function reviewTargetWeight(input: {
  currentKg: number | null;
  heightCm: number | null;
  targetKg: number;
  targetOn: string | null;
  today: string;
}): TargetReview {
  const targetKg = roundKg(input.targetKg);
  if (!(targetKg >= 30 && targetKg <= 300)) {
    return { ok: false, note: 'Enter a target between 30 and 300 kg.' };
  }
  if (input.heightCm != null) {
    const bmi = targetBmi(targetKg, input.heightCm);
    if (bmi != null && bmi < TARGET_BMI_FLOOR) {
      return { ok: false, note: TARGET_BELOW_HEALTHY };
    }
  }
  const currentKg = input.currentKg;
  if (currentKg == null || !(currentKg > 0)) {
    return { ok: true, targetKg, direction: 'hold', targetOn: input.targetOn, note: null, paced: false };
  }
  const direction = targetDirection(currentKg, targetKg);
  if (direction === 'hold' || input.targetOn == null) {
    return { ok: true, targetKg, direction, targetOn: input.targetOn, note: null, paced: false };
  }
  const gap = Math.abs(targetKg - currentKg);
  const cap = safeWeeklyChangeKg(currentKg);
  const weeks = cap > 0 ? gap / cap : 0;
  const soonest = addIsoDays(input.today, Math.ceil(weeks * 7));
  if (input.targetOn < soonest) {
    return {
      ok: true,
      targetKg,
      direction,
      targetOn: soonest,
      note: direction === 'lose' ? TARGET_DATE_FAST : TARGET_DATE_FAST_GAIN,
      paced: true,
    };
  }
  return { ok: true, targetKg, direction, targetOn: input.targetOn, note: null, paced: false };
}

export type TargetEstimate = { text: string; date: string | null };

/** A date from the recent trend only. Fewer than a few readings is not a prediction. */
export function targetTrendEstimate(input: {
  currentKg: number | null;
  targetKg: number;
  readings: readonly WeightReading[];
}): TargetEstimate {
  const readings = [...input.readings]
    .filter((row) => row.kg > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.day))
    .sort((left, right) => left.day.localeCompare(right.day));
  if (readings.length < TARGET_READING_MIN || input.currentKg == null) {
    return { text: TARGET_NOT_ENOUGH, date: null };
  }
  const first = readings[0];
  const last = readings[readings.length - 1];
  if (!first || !last || first.day === last.day) return { text: TARGET_NOT_ENOUGH, date: null };
  const weeks = Math.max(isoDaysBetween(first.day, last.day) / 7, 1 / 7);
  const perWeek = (last.kg - first.kg) / weeks;
  const direction = targetDirection(input.currentKg, input.targetKg);
  const moving = direction === 'lose' ? perWeek < -0.05 : direction === 'gain' ? perWeek > 0.05 : Math.abs(perWeek) < 0.05;
  if (direction === 'hold') {
    return { text: 'Estimate, from your recent weight trend: weight is near the target. This is an estimate, not a promise.', date: null };
  }
  if (!moving) return { text: TARGET_TREND_FLAT, date: null };
  const gap = Math.abs(input.targetKg - input.currentKg);
  const weeksLeft = gap / Math.abs(perWeek);
  const date = addIsoDays(last.day, Math.ceil(weeksLeft * 7));
  return {
    text: `Estimate, from your recent weight trend: about ${formatIsoDay(date)}. This is an estimate, not a promise.`,
    date,
  };
}

export function targetProgressFill(startKg: number | null, currentKg: number | null, targetKg: number): number {
  if (startKg == null || currentKg == null) return 0;
  const span = targetKg - startKg;
  if (Math.abs(span) < 0.05) return Math.abs(currentKg - targetKg) < 0.3 ? 1 : 0;
  return Math.min(1, Math.max(0, (currentKg - startKg) / span));
}

export function settingsForPreset(current: NutritionSettings, goal: NutritionGoal): NutritionSettings {
  return {
    ...current,
    goal,
    targetWeightKg: null,
    targetOn: null,
    targetStartKg: null,
  };
}

export function settingsForTarget(
  current: NutritionSettings,
  review: Extract<TargetReview, { ok: true }>,
  startKg: number | null,
): NutritionSettings {
  return {
    ...current,
    goal: null,
    goalPhase: null,
    weightClassKg: null,
    targetWeightKg: review.targetKg,
    targetOn: review.targetOn,
    targetStartKg: startKg ?? current.targetStartKg,
  };
}

/** Coach context. Only called from the path that already required AI coach consent. */
export function targetCoachLines(input: {
  targetKg: number | null;
  currentKg: number | null;
  direction: TargetDirection | null;
  heightCm: number | null;
}): string[] {
  if (input.targetKg == null) return [];
  const lines = [
    `They set a private target weight of ${roundKg(input.targetKg).toFixed(1)} kg. Do not share that number with anyone else.`,
  ];
  if (input.currentKg != null) {
    lines.push(`Current weight is ${roundKg(input.currentKg).toFixed(1)} kg.`);
  }
  if (input.direction) lines.push(`The direction is ${input.direction}.`);
  if (input.heightCm != null && targetBmi(input.targetKg, input.heightCm) != null && (targetBmi(input.targetKg, input.heightCm) ?? 0) < TARGET_BMI_FLOOR) {
    lines.push(`${TARGET_BELOW_HEALTHY}. Do not help them chase that target.`);
  }
  lines.push('Do not praise rapid loss. Do not shame. Do not suggest skipped meals, a crash diet, or a faster loss than about 0.5 kg a week, and never more than about 1% of body weight a week.');
  lines.push('Do not suggest other tracking apps. Do not offer a training programme. Samaritans on 116 123 and 999 stay the crisis replies.');
  return lines;
}

export function targetWeightStatusLine(input: {
  currentKg: number | null;
  targetKg: number | null;
  startKg: number | null;
}): string | null {
  if (input.targetKg == null) return null;
  const parts = [`Target weight ${roundKg(input.targetKg).toFixed(1)} kg`];
  if (input.currentKg != null) parts.push(`Current weight ${roundKg(input.currentKg).toFixed(1)} kg, latest reading`);
  if (input.startKg != null) parts.push(`Start weight ${roundKg(input.startKg).toFixed(1)} kg, when this target was set`);
  return parts.join('. ') + '.';
}
