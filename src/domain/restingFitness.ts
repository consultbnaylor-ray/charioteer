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

/** The one advice line on a Stats chart. The longer care block stays in More info. */
export const CARD_NOT_ADVICE = 'Not medical advice. Not a diagnosis.';

/** Kept for More info. It is not repeated on the card, except the dangerous contact line. */
export const RESTING_CARE =
  'If you need advice, contact your GP or NHS 111. Call 999 if you have chest pain, shortness of breath, or feel faint. Samaritans 116 123.';

export const RESTING_CARD_CARE = 'Contact your GP or NHS 111.';

/** Follows the under-60 closer-look line. It says the low rate could be fitness. It does not say it is. */
export const LOW_RATE_COULD_BE_FIT = 'But a heart rate below 60 bpm could mean you are very fit.';

function lowRateCloserLook(sentence: string): string {
  return `${sentence} ${LOW_RATE_COULD_BE_FIT}`;
}

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

export type RestingInfoSection = { heading: string; body: string };

export type RestingFitnessComment = {
  tier: RestingTier;
  /** Bright warning only for a sustained rate above the NHS usual range. */
  warning: boolean;
  /** One short sentence for the card. It does not repeat the advice line. */
  verdict: string;
  /** Short blocks for More info. */
  sections: readonly RestingInfoSection[];
  /** Joined detail for a sheet that already shows one advice line. */
  note: string;
  /** Detail plus the diagnosis line. The card uses `verdict` instead. */
  text: string;
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

function comment(
  tier: RestingTier,
  warning: boolean,
  verdict: string,
  sections: readonly RestingInfoSection[],
  trend: string,
): RestingFitnessComment {
  const blocks = trend ? [...sections, { heading: 'Across the month', body: trend }] : [...sections];
  const note = blocks.map((section) => section.body).join(' ');
  return {
    tier,
    warning,
    verdict,
    sections: blocks,
    note,
    text: note ? `${note} ${RESTING_NOT_ADVICE}` : RESTING_NOT_ADVICE,
  };
}

function shownBpm(days: readonly RestingReading[]): number | null {
  if (!days.length) return null;
  const ordered = [...days].sort((left, right) => left.day.localeCompare(right.day));
  return ordered[ordered.length - 1]?.bpm ?? null;
}

/** Names the latest reading. Under 60 is mentioned only when that reading is under 60. */
function earlyVerdict(bpm: number | null): string {
  if (bpm == null || !Number.isFinite(bpm)) return "There isn't enough data yet for a month view.";
  const shown = Math.round(bpm);
  if (shown < NHS_RESTING_LOW) {
    return lowRateCloserLook("There isn't enough data yet for a month view. A reading under 60 bpm might need a closer look.");
  }
  if (shown > NHS_RESTING_HIGH) {
    return `There isn't enough data yet for a month view, and ${shown} bpm is above the usual adult range of 60-100 bpm (NHS).`;
  }
  return `There isn't enough data yet for a month view, and ${shown} bpm is within the usual adult range of 60-100 bpm (NHS).`;
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
    const latest = shownBpm(days);
    return comment(
      'early',
      false,
      earlyVerdict(latest),
      [{
        heading: 'The month',
        body: "Fewer than about two weeks of resting readings, so a month view isn't reliable yet. A single reading is not used.",
      }],
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
  const latest = shownBpm(days);
  const lowReading = latest != null && latest < NHS_RESTING_LOW;
  if (sustainedHigh) {
    return comment(
      'dangerous',
      true,
      'These resting readings have stayed above 100 bpm.',
      [
        {
          heading: 'The month',
          body: 'These resting readings have stayed above 100 bpm across the last month. That is outside the usual adult range of 60 to 100 bpm published by the NHS. This might be a sustained fast resting rate. It is consistent with that pattern. It is not a comment on one reading.',
        },
        {
          heading: 'If you need help',
          body: 'Contact your GP or NHS 111. If you also have chest pain, shortness of breath, or feel faint, call 999. Samaritans 116 123.',
        },
      ],
      trend,
    );
  }
  if (sustainedLow || lowReading) {
    const fitness = fitnessMatch(input, input.today);
    const activityBody = fitness.activityReady
      ? 'The last month of exercise is below the UK guide of about 150 minutes of moderate activity a week, spread through the week, or the cardio-fitness figure is not in the upper half of the published band.'
      : "There are fewer than about two weeks of exercise readings, so this is not used as a sign of fitness.";
    const sections: RestingInfoSection[] = [
      {
        heading: 'Fitness',
        body: fitness.matched
          ? 'A low resting heart rate like this might be normal. It is consistent with exercising most days and the cardio fitness you have recorded.'
          : activityBody,
      },
      {
        heading: 'Activity',
        body: 'The UK guide is about 150 minutes of moderate activity a week, spread through the week.',
      },
      {
        heading: 'A practical step',
        body: 'Build toward that activity guide if a doctor says it is suitable, and seek professional guidance from your GP.',
      },
    ];
    if (fitness.matched) {
      return comment(
        'might',
        false,
        'A low resting rate might be normal with your exercise and cardio fitness.',
        sections,
        trend,
      );
    }
    return comment(
      sustainedLow ? 'unhealthy' : 'might',
      false,
      lowRateCloserLook(
        sustainedLow
          ? 'A resting rate that stays under 60 bpm might need a closer look.'
          : 'A reading under 60 bpm might need a closer look.',
      ),
      sections,
      trend,
    );
  }
  return comment(
    'reassuring',
    false,
    'These readings sit in the usual adult range of 60-100 bpm.',
    [{
      heading: 'The month',
      body: 'These resting readings sit in the usual adult range of 60 to 100 bpm, or they have not stayed outside it. A single reading is not used.',
    }],
    trend,
  );
}
