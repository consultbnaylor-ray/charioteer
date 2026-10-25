import { publishedCardioBand } from '@/domain/fitnessSnapshot';
import type { NutritionSex } from '@/domain/nutrition';
import { scaledPeriodTarget } from '@/domain/statWindow';

/** NHS usual adult resting range, from the supraventricular tachycardia page: 60 to 100 bpm. */
export const NHS_RESTING_LOW = 60;
export const NHS_RESTING_HIGH = 100;

/** A month needs about two weeks of readings before a pattern is described. */
export const RESTING_MONTH_DAYS = 30;
export const RESTING_RELIABLE_DAYS = 14;

/** More than half the month, in line with the NHS “most days” activity spread. */
export const ACTIVE_DAYS_FOR_FITNESS = 16;

const MONTHLY_MODERATE_MINUTES = scaledPeriodTarget(150, '30');

export const RESTING_NOT_ADVICE = 'This is not a diagnosis and not medical advice.';

/** Kept on the card, including the urgent and crisis lines. */
export const RESTING_CARE =
  'Not medical advice. This is not a diagnosis. If you need advice, contact your GP or NHS 111. Call 999 if you have chest pain, shortness of breath, or feel faint. Samaritans 116 123.';

export type RestingReading = { day: string; bpm: number };
export type RestingActivityDay = { day: string; moderateMinutes: number; vigorousMinutes: number };

export type RestingFitnessInput = {
  today: string;
  resting: readonly RestingReading[];
  activity: readonly RestingActivityDay[];
  vo2Max: number | null;
  age: number | null;
  sex: NutritionSex | null;
};

export type RestingTier = 'early' | 'reassuring' | 'might' | 'unhealthy' | 'dangerous';

export type RestingFitnessComment = {
  tier: RestingTier;
  /** Bright warning only for a sustained rate above the NHS usual range. */
  warning: boolean;
  /** Full sentence for the chart, including the diagnosis line. */
  text: string;
  /** Same reading without a second “not medical advice”, for a tile that already shows one. */
  note: string;
};

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function inMonth(day: string, today: string): boolean {
  return day <= today && day >= shiftDay(today, -(RESTING_MONTH_DAYS - 1));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return sorted[mid] ?? 0;
}

function average(values: readonly number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function comment(tier: RestingTier, warning: boolean, note: string, trend: string): RestingFitnessComment {
  const body = [note, trend].filter(Boolean).join(' ');
  return {
    tier,
    warning,
    note: body,
    text: `${body} ${RESTING_NOT_ADVICE}`,
  };
}

function trendSentence(readings: readonly RestingReading[]): string {
  if (readings.length < RESTING_RELIABLE_DAYS) return '';
  const ordered = [...readings].sort((left, right) => left.day.localeCompare(right.day));
  const mid = Math.floor(ordered.length / 2);
  const earlier = average(ordered.slice(0, mid).map((row) => row.bpm));
  const later = average(ordered.slice(mid).map((row) => row.bpm));
  const gap = Math.round(later - earlier);
  if (Math.abs(gap) < 5) return '';
  const way = gap > 0 ? 'higher' : 'lower';
  return `The later readings in this month are about ${Math.abs(gap)} bpm ${way} than the earlier ones. That is a trend, not a diagnosis.`;
}

function fitnessMatch(input: RestingFitnessInput, today: string): { matched: boolean; activityReady: boolean } {
  const rows = input.activity.filter((row) => inMonth(row.day, today));
  const byDay = new Map<string, { moderate: number; vigorous: number }>();
  for (const row of rows) {
    const current = byDay.get(row.day) ?? { moderate: 0, vigorous: 0 };
    current.moderate += Math.max(0, row.moderateMinutes);
    current.vigorous += Math.max(0, row.vigorousMinutes);
    byDay.set(row.day, current);
  }
  const activityReady = byDay.size >= RESTING_RELIABLE_DAYS;
  let activeDays = 0;
  let equivalent = 0;
  for (const day of byDay.values()) {
    equivalent += day.moderate + day.vigorous * 2;
    if (day.moderate + day.vigorous > 0) activeDays += 1;
  }
  const band = publishedCardioBand(input.age, input.sex);
  const midpoint = band ? (band.low + band.high) / 2 : null;
  const vo2High = input.vo2Max != null && midpoint != null && input.vo2Max >= midpoint;
  const matched = activityReady && activeDays >= ACTIVE_DAYS_FOR_FITNESS && equivalent >= MONTHLY_MODERATE_MINUTES && vo2High;
  return { matched, activityReady };
}

/**
 * A month of resting readings, not one number.
 * Dangerous uses only the NHS usual range (above 100 bpm) when that side is sustained.
 */
export function restingFitnessComment(input: RestingFitnessInput): RestingFitnessComment {
  const readings = input.resting.filter((row) => inMonth(row.day, input.today) && row.bpm > 0 && Number.isFinite(row.bpm));
  const byDay = new Map<string, number>();
  for (const row of readings) byDay.set(row.day, row.bpm);
  const days = [...byDay.entries()].map(([day, bpm]) => ({ day, bpm }));
  if (days.length < RESTING_RELIABLE_DAYS) {
    return comment(
      'early',
      false,
      "There are fewer than about two weeks of resting readings, so the monthly view isn't reliable yet. A single reading is not used.",
      '',
    );
  }
  const values = days.map((row) => row.bpm);
  const mid = median(values);
  const highDays = values.filter((value) => value > NHS_RESTING_HIGH).length;
  const lowDays = values.filter((value) => value < NHS_RESTING_LOW).length;
  const sustainedHigh = highDays >= 7 && highDays > values.length / 2 && mid > NHS_RESTING_HIGH;
  const sustainedLow = lowDays >= 7 && lowDays > values.length / 2 && mid < NHS_RESTING_LOW;
  const trend = trendSentence(days);
  if (sustainedHigh) {
    return comment(
      'dangerous',
      true,
      'These resting readings have stayed above 100 bpm across the last month. That is outside the usual adult range of 60 to 100 bpm published by the NHS. Contact your GP or NHS 111. If you also have chest pain, shortness of breath, or feel faint, call 999. This might be a sustained fast resting rate. It is consistent with that pattern. It is not a comment on one reading.',
      trend,
    );
  }
  if (sustainedLow) {
    const fitness = fitnessMatch(input, input.today);
    if (fitness.matched) {
      return comment(
        'might',
        false,
        'A low resting heart rate like this might be normal. It is consistent with exercising most days and the cardio fitness you have recorded.',
        trend,
      );
    }
    const activityLine = fitness.activityReady
      ? 'The last month of exercise is below the UK guide of about 150 minutes of moderate activity a week, spread through the week, or the cardio-fitness figure is not in the upper half of the published band.'
      : "There are fewer than about two weeks of exercise readings, so the monthly activity view isn't reliable yet. This is not used as a sign of fitness.";
    return comment(
      'unhealthy',
      false,
      `A resting rate that stays under 60 bpm might need a closer look. ${activityLine} A practical step is to build toward that activity guide if a doctor says it is suitable, and to seek professional guidance from your GP.`,
      trend,
    );
  }
  return comment(
    'reassuring',
    false,
    'These resting readings sit in the usual adult range of 60 to 100 bpm, or they have not stayed outside it. A single reading is not used.',
    trend,
  );
}
