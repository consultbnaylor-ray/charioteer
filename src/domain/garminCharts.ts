import {
  EXERCISE_MORE_INFO,
  INTENSITY_MORE_INFO,
  MODERATE_MORE_INFO,
  VIGOROUS_MORE_INFO,
} from '@/domain/activityMinutes';
import {
  GARMIN_SOURCE,
  activityDayName,
  chartSourceCaption,
  distanceText,
  garminExerciseMinutes,
  type ActivitySource,
  type DailyActivityPoint,
} from '@/domain/dailyActivity';
import type {
  GarminDaily,
  GarminHrvSummary,
  GarminPulseOx,
  GarminRespiration,
  GarminSleep,
  GarminUserMetric,
} from '@/domain/garminConnect';
import { publishedCardioBand } from '@/domain/fitnessSnapshot';
import type { NutritionSex } from '@/domain/nutrition';
import type { RestingFitnessComment, RestingInfoSection } from '@/domain/restingFitness';
import { RESTING_CARE, RESTING_CARD_CARE } from '@/domain/restingFitness';
import { NHS_ADULT_SLEEP_MAX_HOURS, NHS_ADULT_SLEEP_MIN_HOURS } from '@/domain/guidance';
import { periodDayCount, periodPhrase, scaledPeriodTarget, type StatPeriod } from '@/domain/statWindow';
import { STATS_SIGNAL } from '@/domain/statsOverview';
import { chartDays } from '@/domain/workoutDay';

export const GARMIN_DETAILS_TITLE = 'More Garmin Stats';

export const TAP_FOR_MORE = 'Tap for more';

export const NO_DATA = 'No data';

export const NO_STANDARD_RANGE = 'No standard range for this';

export const GENERAL_GUIDANCE =
  'Approximate general guidance. Individual results vary. This is not medical advice.';

export const OUTSIDE_RANGE_NOTE =
  'This sits outside the usual adult range. If it keeps happening, speak to a doctor. This is general guidance, not a diagnosis.';

export const GARMIN_SCORE_NOTE = "Garmin's own score, not a medical measure.";

/**
 * Garmin's own sleep-score bands, not a clinical scale.
 * Garmin, 14 March 2025: excellent 90–100, good 80–89, fair 60–79, poor 0–60.
 * The same page says a score below 60 is the poor group.
 * A Garmin support reply says poor is below 60. This app treats 60 as Fair.
 * https://www.garmin.com/en-US/blog/fitness/how-well-do-you-sleep-new-data-examines-garmin-users-sleep/
 */
export const GARMIN_SLEEP_SCORE_POOR_BELOW = 60;
export const GARMIN_SLEEP_SCORE_FAIR_HIGH = 79;
export const GARMIN_SLEEP_SCORE_GOOD_LOW = 80;
export const GARMIN_SLEEP_SCORE_GOOD_HIGH = 89;
export const GARMIN_SLEEP_SCORE_EXCELLENT_LOW = 90;

export const GARMIN_SLEEP_SCORE_BANDS =
  "Garmin's own bands for this score: Poor below 60, Fair 60–79, Good 80–89, Excellent 90–100.";

export const GARMIN_SLEEP_SCORE_AVERAGE =
  'Garmin said its average user score was 72 from February 2024 to January 2025. That average is not a personal target.';

/** Good through Excellent. Fair and Poor sit below this lime band. */
export const GARMIN_SLEEP_SCORE_LIME = { low: GARMIN_SLEEP_SCORE_GOOD_LOW, high: 100 };

export type GarminSleepScoreBand = 'Poor' | 'Fair' | 'Good' | 'Excellent';

export function garminSleepScoreBand(score: number): GarminSleepScoreBand | null {
  if (!Number.isFinite(score) || score <= 0 || score > 100) return null;
  if (score < GARMIN_SLEEP_SCORE_POOR_BELOW) return 'Poor';
  if (score <= GARMIN_SLEEP_SCORE_FAIR_HIGH) return 'Fair';
  if (score <= GARMIN_SLEEP_SCORE_GOOD_HIGH) return 'Good';
  return 'Excellent';
}

export function garminSleepScoreVerdict(score: number): string | null {
  const band = garminSleepScoreBand(score);
  if (!band) return null;
  const signal = band === 'Poor' ? STATS_SIGNAL.watch : band === 'Fair' ? STATS_SIGNAL.info : STATS_SIGNAL.good;
  return `${signal}. ${band}. ${GARMIN_SCORE_NOTE}`;
}

/** NHS adults, 7 to 9 hours. The same edges as the Sleep hours card. */
export function sleepDurationVerdict(hours: number): string | null {
  if (!Number.isFinite(hours) || hours <= 0) return null;
  if (hours < NHS_ADULT_SLEEP_MIN_HOURS) return `${STATS_SIGNAL.watch}. Under 7 hours.`;
  if (hours > NHS_ADULT_SLEEP_MAX_HOURS) return `${STATS_SIGNAL.info}. Over 9 hours, not a warning on its own.`;
  return `${STATS_SIGNAL.good}. Within 7 to 9 hours.`;
}

export const STRESS_ZONES = '0–25 resting, 26–50 low, 51–75 medium, 76–100 high';

/**
 * Garmin's bands for the Body Battery level, from 0 to 100.
 * Charged and drained are points gained or lost, so these bands are not shown there.
 */
export const BODY_BATTERY_ZONES = '0–25 very low, 26–50 low, 51–75 medium, 76–100 high';

export const BODY_BATTERY_WHAT =
  "Body Battery is Garmin's own 0–100 estimate of your energy reserve through the day. The watch works it out from heart rate variability, stress, sleep and activity.";

/** Full care block for Average stress. Shown inside More info, with the card line left as the short advice sentence. */
export const STRESS_CARE =
  'If you feel persistently low, anxious, or unable to cope, speak to your GP or NHS 111. If you are in crisis or at risk of harm, call 999 or the Samaritans on 116 123.';

/**
 * Research span used when age is not set.
 * Paluch 2022 is 6,000–8,000 at 60 or over and 8,000–10,000 under 60.
 * 7,000–10,000 covers that wider span and the Ding 2025 inflection. It is not an NHS target.
 */
export const STEPS_TYPICAL_LOW = 7000;

export const STEPS_TYPICAL_HIGH = 10000;

export const PALUCH_OLDER_LOW = 6000;
export const PALUCH_OLDER_HIGH = 8000;
export const PALUCH_YOUNGER_LOW = 8000;
export const PALUCH_YOUNGER_HIGH = 10000;

export const RESTING_TYPICAL_LOW = 60;

export const RESTING_TYPICAL_HIGH = 100;

/** WHO moderate minutes a week. Vigorous guidance is half of this. */
export const WHO_MODERATE_LOW = 150;

export const WHO_MODERATE_HIGH = 300;

export const SPO2_TYPICAL_LOW = 95;

export const SPO2_TYPICAL_HIGH = 100;

export const BREATH_TYPICAL_LOW = 12;

export const BREATH_TYPICAL_HIGH = 20;

export type GuideSpan = { low: number; high: number };

export type ChartGuide = {
  /** Shaded band on a daily bar. Null when this measure has no standard range. */
  dailyTypical: GuideSpan | null;
  /**
   * The same guidance expressed for the selected period.
   * A daily target is multiplied by the day count. A weekly target uses the shared period scale.
   * A rate such as bpm stays the same number and names the period in the legend.
   */
  periodTypical: GuideSpan | null;
  /** Thin line, such as Garmin's step goal. */
  target: { value: number; label: string } | null;
  /** Thin line for the user's own average of days that have a number. */
  ownAverage: { value: number; label: string } | null;
  legend: string;
  about: string;
  outside: string | null;
  /** One short sentence on the card. Longer notes stay in More info. */
  verdict?: string | null;
  /** Short blocks inside More info. */
  sections?: readonly RestingInfoSection[];
  /** Full care block. Shown inside More info, not on the card. */
  care?: string | null;
  /** Dangerous resting tier only. Stays on the yellow warning. */
  cardCare?: string | null;
  /** Sustained resting rate above the NHS usual range. Draws the yellow warning. */
  warning?: boolean;
};

export type GarminChartPoint = {
  day: string;
  value: number | null;
  source: ActivitySource | null;
  label: string;
  empty: boolean;
};

export type GarminDetailChart = {
  id: string;
  title: string;
  unit: string;
  points: GarminChartPoint[];
  /** True when a stored zero is a real score, as with stress and Body Battery. */
  includeZero: boolean;
  guide: ChartGuide;
};

export type GarminChartInput = {
  endDay: string;
  period: StatPeriod;
  dailies: readonly GarminDaily[];
  sleep: readonly GarminSleep[];
  respiration: readonly GarminRespiration[];
  pulseOx: readonly GarminPulseOx[];
  hrv: readonly GarminHrvSummary[];
  userMetrics?: readonly GarminUserMetric[];
  age?: number | null;
  sex?: NutritionSex | null;
};

/**
 * Health stats omit `span`, so the shared Day / 7 days / 30 days control decides the window.
 * Workouts pass 7 or 30 from that screen's chart-days control.
 */
export function movementPeriod(span: number | undefined, shared: StatPeriod): { period: StatPeriod; days: number } {
  if (span == null) return { period: shared, days: periodDayCount(shared) };
  const period: StatPeriod = span >= 28 ? '30' : '7';
  return { period, days: Math.max(1, Math.floor(span)) };
}

export function stepGoalInPeriod(dailies: readonly GarminDaily[], endDay: string, period: StatPeriod): number | null {
  const days = new Set(chartDays(endDay, periodDayCount(period)));
  let goal: number | null = null;
  let day = '';
  for (const daily of dailies) {
    if (!days.has(daily.calendarDate)) continue;
    const value = daily.stepGoal;
    if (value == null || !Number.isFinite(value) || value <= 0) continue;
    if (daily.calendarDate >= day) {
      day = daily.calendarDate;
      goal = Math.round(value);
    }
  }
  return goal;
}

function grouped(period: StatPeriod): string {
  return period === 'day' ? 'today' : periodPhrase(period);
}

/** One More info paragraph. The disclaimer is in that paragraph once, so the card can show it outside as well. */
function advised(about: string, extra: Partial<ChartGuide> = {}): ChartGuide {
  const body = about.replace(/\s+/g, ' ').trim().replace(/\s*Not medical advice\.?$/i, '');
  return {
    dailyTypical: extra.dailyTypical ?? null,
    periodTypical: extra.periodTypical ?? null,
    target: extra.target ?? null,
    ownAverage: extra.ownAverage ?? null,
    legend: '',
    about: body,
    outside: extra.outside ?? null,
    verdict: extra.verdict ?? null,
    sections: extra.sections ?? [],
    care: extra.care ?? null,
    cardCare: extra.cardCare ?? null,
    warning: extra.warning ?? false,
  };
}

function countText(value: number): string {
  return Math.round(value).toLocaleString('en-GB');
}

function oneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function averageOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function positiveValues(points: readonly { value: number }[]): number[] {
  return points.flatMap((point) => (point.value > 0 ? [point.value] : []));
}

/** Age picks the Paluch 2022 range. Unknown age keeps the wider 7,000–10,000 span. */
export function stepResearchBand(age: number | null | undefined): { low: number; high: number; why: string } {
  if (age != null && age >= 60) {
    return { low: PALUCH_OLDER_LOW, high: PALUCH_OLDER_HIGH, why: 'Paluch and colleagues, 2022, for age 60 or over' };
  }
  if (age != null && age < 60) {
    return { low: PALUCH_YOUNGER_LOW, high: PALUCH_YOUNGER_HIGH, why: 'Paluch and colleagues, 2022, for under 60' };
  }
  return { low: STEPS_TYPICAL_LOW, high: STEPS_TYPICAL_HIGH, why: 'the wider span used when age is not set' };
}

/** Named studies. The NHS publishes minutes, not a step count. */
export function stepsResearchMeaning(dailyAverage: number | null): string {
  const average = dailyAverage == null ? '' : ` Your daily average here is ${countText(dailyAverage)} steps.`;
  return `The NHS and the UK Chief Medical Officers do not set a daily step target. They publish minutes of activity, not a step count. Paluch and colleagues, Lancet Public Health, 2022 (doi:10.1016/S2468-2667(21)00302-9), found the association with mortality levelled off until about 6,000–8,000 steps a day at age 60 or over, and until about 8,000–10,000 under 60. Ding and colleagues, Lancet Public Health, 2025 (doi:10.1016/S2468-2667(25)00164-1), found an inflection around 5,000–7,000 steps a day. Compared with 2,000 steps a day, 7,000 was associated with a 47% lower risk of death from any cause (hazard ratio 0.53, 95% CI 0.46–0.60). Saint-Maurice and colleagues, JAMA, 2020 (doi:10.1001/jama.2020.1382), found that 8,000 steps a day had a hazard ratio of about 0.49 compared with 4,000, and 12,000 about 0.35. Tudor-Locke and Bassett, Sports Medicine, 2004 (doi:10.2165/00007256-200434010-00001), published a preliminary index that calls 10,000 steps a day active. That index is not an NHS target.${average} The lime band is that research range for a day, not an NHS guideline.`;
}

export function stepsChartGuide(
  period: StatPeriod,
  stepGoal: number | null,
  age: number | null = null,
  dailyAverage: number | null = null,
): ChartGuide {
  const days = periodDayCount(period);
  const band = stepResearchBand(age);
  const periodTypical = { low: band.low * days, high: band.high * days };
  const dailyTypical = { low: band.low, high: band.high };
  const goal = stepGoal != null && stepGoal > 0 ? Math.round(stepGoal) : null;
  const goalLine = goal == null ? '' : ` The line is your Garmin step goal, ${countText(goal)} steps a day.`;
  return advised(
    `Steps are how many steps that day. There is no UK daily step target. ${stepsResearchMeaning(dailyAverage)} For ${grouped(period)}, the lime band is about ${countText(periodTypical.low)}–${countText(periodTypical.high)} steps (${band.why}).${goalLine} It is a reference, not a personal target.`,
    {
      dailyTypical,
      periodTypical,
      target: goal == null ? null : { value: goal, label: `Your Garmin step goal, ${countText(goal)} steps a day` },
    },
  );
}

export function restingChartGuide(
  period: StatPeriod,
  _points: readonly { value: number }[],
  fitness?: RestingFitnessComment | null,
): ChartGuide {
  const band = { low: RESTING_TYPICAL_LOW, high: RESTING_TYPICAL_HIGH };
  return advised(
    `Resting heart rate is the beats per minute stored for that day, from Garmin or Apple Health. The lime band is the usual adult range of ${RESTING_TYPICAL_LOW}–${RESTING_TYPICAL_HIGH} bpm published by the NHS, for ${grouped(period)}. It is not adjusted for age. A comment uses the last month of readings, not one day.`,
    {
      dailyTypical: band,
      periodTypical: band,
      verdict: fitness?.verdict ?? null,
      sections: [
        { heading: 'What this shows', body: 'The lime band is a reference, not a diagnosis. It is not adjusted for age.' },
        ...(fitness?.sections ?? []),
      ],
      warning: fitness?.warning ?? false,
      cardCare: fitness?.warning ? RESTING_CARD_CARE : null,
      care: fitness ? RESTING_CARE : null,
    },
  );
}

export function distanceChartGuide(period: StatPeriod, points: readonly { value: number }[]): ChartGuide {
  const mean = averageOf(positiveValues(points));
  const own = mean == null ? null : { value: mean, label: `Your average distance ${grouped(period)}: ${distanceText(mean)}` };
  return advised(
    `Distance is how far you moved that day. ${NO_STANDARD_RANGE}. The line is your own average of the days in ${grouped(period)} that have a distance. Compare a day with your own usual days.`,
    { ownAverage: own },
  );
}

export function floorsChartGuide(period: StatPeriod, points: readonly { value: number }[]): ChartGuide {
  const mean = averageOf(positiveValues(points));
  const own = mean == null ? null : { value: mean, label: `Your average floors ${grouped(period)}: ${oneDecimal(mean)} floors` };
  return advised(
    `Floors are how many floors were climbed that day. ${NO_STANDARD_RANGE}. The line is your own average of the days in ${grouped(period)} that have a number. Compare a day with your own usual days.`,
    { ownAverage: own },
  );
}

function weightedMinuteBands(period: StatPeriod): { dailyTypical: GuideSpan; periodTypical: GuideSpan } {
  return {
    periodTypical: {
      low: scaledPeriodTarget(WHO_MODERATE_LOW, period),
      high: scaledPeriodTarget(WHO_MODERATE_HIGH, period),
    },
    dailyTypical: {
      low: WHO_MODERATE_LOW / 7,
      high: WHO_MODERATE_HIGH / 7,
    },
  };
}

/** Lime band for the weighted total. The same band is used on Exercise minutes. */
export function activityChartGuide(period: StatPeriod): ChartGuide {
  return advised(INTENSITY_MORE_INFO, weightedMinuteBands(period));
}

export function exerciseChartGuide(period: StatPeriod): ChartGuide {
  return advised(EXERCISE_MORE_INFO, weightedMinuteBands(period));
}

/** Real minutes. The weekly range is not drawn on a chart that shows only one type. */
export function moderateChartGuide(): ChartGuide {
  return advised(MODERATE_MORE_INFO);
}

export function vigorousChartGuide(): ChartGuide {
  return advised(VIGOROUS_MORE_INFO);
}

function stressGuide(period: StatPeriod): ChartGuide {
  return advised(
    `Average stress is Garmin's own 0–100 score. The watch estimates it from heart rate variability, the tiny variation between heartbeats, while you are still. It reflects how much your body seems to be under strain. Exercise, illness, poor sleep, caffeine, and alcohol can raise it, not only feeling mentally stressed. It is a body-signal estimate, not a measure of emotions. The number here is the average across ${grouped(period)}. Garmin's published bands are ${STRESS_ZONES}. Lower is calmer. Compare it with your own usual days, and look at the trend over weeks rather than one day. A day or two of higher numbers usually needs no action. If it stays medium or high for a couple of weeks, or you feel overwhelmed, look at sleep, alcohol and caffeine, movement, time outdoors, and a breathing or relaxation exercise. Cravings can rise when stress is high. Open Breathe, talk it through in Thumos, or speak to a buddy or a friend. Watch fit and wearing the watch matter. ${GARMIN_SCORE_NOTE}`,
    { care: STRESS_CARE },
  );
}

function batteryGuide(period: StatPeriod, kind: 'charged' | 'drained' | 'highest' | 'lowest'): ChartGuide {
  const what = BODY_BATTERY_WHAT;
  const limits = `Each bar is score points for one day, for ${grouped(period)}. Garmin's own estimate, not a medical measure. Wearing the watch overnight and syncing Garmin Connect matters.`;
  const specific = {
    charged: 'Charged is how many points rest and sleep added back over the day. Drained is what stress and activity take off. A bigger charged number means you got more energy back. Compare it with your own usual days, not other people. A low number after a poor or short night can be normal.',
    drained: 'Drained is how many points your Body Battery dropped over the day, from stress and activity. Charged is what rest and sleep add back. A bigger drained number means a harder, more stressful or more active day. A big number is not bad by itself. What matters is whether sleep and rest charge you back up. Compare it with your own usual days, not other people.',
    highest: "Highest is the top Body Battery level reached that day, on the 0–100 scale. It is the level itself, not points gained or lost. A higher number means a fuller reserve. Compare it with your own usual days, not other people.",
    lowest: "Lowest is the bottom Body Battery level that day, on the 0–100 scale. It is the level itself, not points lost. A lower number means the reserve ran down further. Compare it with your own usual days, not other people. A low number after a poor or short night can be normal.",
  }[kind];
  return advised(`${what} ${specific} ${limits}`);
}

function hrvGuide(period: StatPeriod, points: readonly GarminChartPoint[]): ChartGuide {
  const mean = averageOf(points.flatMap((point) => (point.empty || point.value == null ? [] : [point.value])));
  const own = mean == null ? null : { value: mean, label: `Your average overnight HRV ${grouped(period)}: ${Math.round(mean)} ms` };
  return advised(
    `Overnight HRV is Garmin's average, in milliseconds, of the variation between heartbeats during last night's sleep. It varies a lot between people and with age, so this is your own recent average, not a healthy range for everyone. There is no population healthy band. The line is your own average of the nights in ${grouped(period)} that have a number.`,
    { ownAverage: own },
  );
}

function rangeGuide(input: {
  period: StatPeriod;
  low: number;
  high: number;
  unit: string;
  what: string;
  latest: number | null;
  belowNote?: string | null;
}): ChartGuide {
  const band = { low: input.low, high: input.high };
  let outside: string | null = null;
  if (input.latest != null && input.latest < input.low) outside = input.belowNote ?? OUTSIDE_RANGE_NOTE;
  if (input.latest != null && input.latest > input.high) outside = OUTSIDE_RANGE_NOTE;
  return advised(
    `${input.what} The lime band is a general adult range of ${input.low}–${input.high} ${input.unit} for ${grouped(input.period)}. It is a reference, not a diagnosis.`,
    { dailyTypical: band, periodTypical: band, outside },
  );
}

function sleepScoreGuide(period: StatPeriod, latest: number | null): ChartGuide {
  return advised(
    `Sleep score is Garmin's own score for that night, powered by Firstbeat. ${GARMIN_SLEEP_SCORE_BANDS} ${GARMIN_SLEEP_SCORE_AVERAGE} The lime band is Good through Excellent, 80–100, for ${grouped(period)}. It is not a medical sleep measure. Compare a night with your own usual nights.`,
    {
      dailyTypical: GARMIN_SLEEP_SCORE_LIME,
      periodTypical: GARMIN_SLEEP_SCORE_LIME,
      verdict: latest == null ? null : garminSleepScoreVerdict(latest),
    },
  );
}

function sleepDurationGuide(period: StatPeriod, latest: number | null): ChartGuide {
  const band = { low: NHS_ADULT_SLEEP_MIN_HOURS, high: NHS_ADULT_SLEEP_MAX_HOURS };
  return advised(
    `Sleep duration is the hours Garmin stored for that night. The NHS says adults need 7 to 9 hours a night. That range is not stretched across a week or a month. The National Heart, Lung, and Blood Institute also says adults should sleep 7 to 9 hours a night, and that more than 9 hours is not necessarily harmful. The lime band is 7–9 hours for ${grouped(period)}. Compare a night with your own usual nights.`,
    {
      dailyTypical: band,
      periodTypical: band,
      verdict: latest == null ? null : sleepDurationVerdict(latest),
    },
  );
}

function vo2Guide(period: StatPeriod, age: number | null, sex: NutritionSex | null): ChartGuide {
  const band = publishedCardioBand(age, sex);
  if (!band) {
    return advised(
      `VO2 max is Garmin's stored estimate of how much oxygen you can use at full effort, in ml/kg/min. A cycling estimate is not used. ${NO_STANDARD_RANGE} for ${grouped(period)} until age and sex are set. It is a reference, not a target.`,
    );
  }
  return advised(
    `VO2 max is Garmin's stored running estimate in ml/kg/min. A cycling estimate is not used. The lime band is the published 25th to 75th percentile for your age and sex, ${oneDecimal(band.low)}–${oneDecimal(band.high)}, from Kaminsky, Arena, and Myers, Mayo Clinic Proceedings, 2015, for ages 20–79. Shown for ${grouped(period)}. It is a reference, not a target.`,
    { dailyTypical: band, periodTypical: band },
  );
}

function finite(value: number | null | undefined, zeroIsValue: boolean): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (zeroIsValue) return value < 0 ? null : value;
  return value > 0 ? value : null;
}

function remember(map: Map<string, number>, day: string, value: number | null) {
  if (!day || value == null) return;
  map.set(day, value);
}

function seriesFrom(
  endDay: string,
  period: StatPeriod,
  values: ReadonlyMap<string, number>,
  name: string,
  unit: string,
  format: (value: number) => string,
  zeroIsValue: boolean,
  sourceLabel = GARMIN_SOURCE,
): GarminChartPoint[] {
  return chartDays(endDay, periodDayCount(period)).map((day) => {
    const stored = values.get(day);
    if (stored == null || (!zeroIsValue && !(stored > 0))) {
      return {
        day,
        value: null,
        source: null,
        empty: true,
        label: `${NO_DATA} for ${name}, ${activityDayName(day)}`,
      };
    }
    return {
      day,
      value: stored,
      source: 'garmin',
      empty: false,
      label: `${name}, ${activityDayName(day)}: ${format(stored)} ${unit} ${sourceLabel}`,
    };
  });
}

function latestStored(points: readonly GarminChartPoint[]): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point && !point.empty && point.value != null) return point.value;
  }
  return null;
}

function hasReading(points: readonly GarminChartPoint[]): boolean {
  return points.some((point) => !point.empty && point.value != null);
}

type Dated = { calendarDate: string };

function byDay<T extends Dated>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => left.calendarDate.localeCompare(right.calendarDate));
}

export function intensitySeries(endDay: string, period: StatPeriod, dailies: readonly GarminDaily[]): GarminChartPoint[] {
  const byDate = new Map<string, GarminDaily>();
  for (const daily of byDay(dailies)) byDate.set(daily.calendarDate, daily);
  return chartDays(endDay, periodDayCount(period)).map((day) => {
    const daily = byDate.get(day);
    const minutes = daily ? garminExerciseMinutes(daily.moderateMinutes, daily.vigorousMinutes) : null;
    if (minutes == null || minutes <= 0) {
      return {
        day,
        value: null,
        source: null,
        empty: true,
        label: `${NO_DATA} for Intensity minutes, ${activityDayName(day)}`,
      };
    }
    const moderate = Math.round(daily?.moderateMinutes ?? 0);
    const vigorous = Math.round(daily?.vigorousMinutes ?? 0);
    return {
      day,
      value: minutes,
      source: 'garmin' as const,
      empty: false,
      label: `Intensity minutes, ${activityDayName(day)}: ${minutes} min. Garmin. ${moderate} moderate and ${vigorous} vigorous, vigorous counted twice.`,
    };
  });
}

export function garminDetailCharts(input: GarminChartInput): GarminDetailChart[] {
  const stress = new Map<string, number>();
  const charged = new Map<string, number>();
  const drained = new Map<string, number>();
  const highest = new Map<string, number>();
  const lowest = new Map<string, number>();
  for (const daily of byDay(input.dailies)) {
    remember(stress, daily.calendarDate, finite(daily.averageStressLevel, true) == null ? null : Math.round(daily.averageStressLevel ?? 0));
    remember(charged, daily.calendarDate, finite(daily.bodyBatteryCharged, true) == null ? null : Math.round(daily.bodyBatteryCharged ?? 0));
    remember(drained, daily.calendarDate, finite(daily.bodyBatteryDrained, true) == null ? null : Math.round(daily.bodyBatteryDrained ?? 0));
    remember(highest, daily.calendarDate, finite(daily.bodyBatteryHighest, true) == null ? null : Math.round(daily.bodyBatteryHighest ?? 0));
    remember(lowest, daily.calendarDate, finite(daily.bodyBatteryLowest, true) == null ? null : Math.round(daily.bodyBatteryLowest ?? 0));
  }
  const sleepScore = new Map<string, number>();
  const sleepHours = new Map<string, number>();
  for (const night of byDay(input.sleep)) {
    remember(sleepScore, night.calendarDate, finite(night.sleepScore, false) == null ? null : Math.round(night.sleepScore ?? 0));
    const hours = night.durationSeconds > 0 ? Math.round((night.durationSeconds / 3600) * 10) / 10 : null;
    remember(sleepHours, night.calendarDate, finite(hours, false));
  }
  const breath = new Map<string, number>();
  for (const row of byDay(input.respiration)) {
    const value = finite(row.averageBreathsPerMinute, false);
    remember(breath, row.calendarDate, value == null ? null : Math.round(value * 10) / 10);
  }
  const oxygen = new Map<string, number>();
  for (const row of byDay(input.pulseOx)) {
    remember(oxygen, row.calendarDate, finite(row.averageSpo2, false) == null ? null : Math.round(row.averageSpo2 ?? 0));
  }
  const hrv = new Map<string, number>();
  for (const row of byDay(input.hrv)) {
    remember(hrv, row.calendarDate, finite(row.lastNightAvgMs, false) == null ? null : Math.round(row.lastNightAvgMs ?? 0));
  }
  const vo2 = new Map<string, number>();
  for (const row of byDay(input.userMetrics ?? [])) {
    const value = finite(row.vo2Max, false);
    remember(vo2, row.calendarDate, value == null ? null : Math.round(value * 10) / 10);
  }

  const charts: GarminDetailChart[] = [];
  const add = (chart: GarminDetailChart) => {
    if (hasReading(chart.points)) charts.push(chart);
  };
  const stressPoints = seriesFrom(input.endDay, input.period, stress, 'Average stress', 'score', countText, true);
  add({
    id: 'stress',
    title: 'Average stress',
    unit: 'score',
    points: stressPoints,
    includeZero: true,
    guide: stressGuide(input.period),
  });
  const battery = (
    id: string,
    title: string,
    kind: 'charged' | 'drained' | 'highest' | 'lowest',
    values: ReadonlyMap<string, number>,
  ) => {
    add({
      id,
      title,
      unit: 'score',
      points: seriesFrom(input.endDay, input.period, values, title, 'score', countText, true),
      includeZero: true,
      guide: batteryGuide(input.period, kind),
    });
  };
  battery('body_battery_charged', 'Body battery charged', 'charged', charged);
  battery('body_battery_drained', 'Body battery drained', 'drained', drained);
  battery('body_battery_highest', 'Body battery highest', 'highest', highest);
  battery('body_battery_lowest', 'Body battery lowest', 'lowest', lowest);
  const scorePoints = seriesFrom(input.endDay, input.period, sleepScore, 'Sleep score', 'score', countText, false);
  add({
    id: 'sleep_score',
    title: 'Sleep score',
    unit: 'score',
    points: scorePoints,
    includeZero: false,
    guide: sleepScoreGuide(input.period, latestStored(scorePoints)),
  });
  const durationPoints = seriesFrom(input.endDay, input.period, sleepHours, 'Sleep duration', 'hours', oneDecimal, false);
  add({
    id: 'sleep_duration',
    title: 'Sleep duration',
    unit: 'hours',
    points: durationPoints,
    includeZero: false,
    guide: sleepDurationGuide(input.period, latestStored(durationPoints)),
  });
  const breathPoints = seriesFrom(input.endDay, input.period, breath, 'Breathing rate', 'breaths/min', oneDecimal, false);
  add({
    id: 'respiration',
    title: 'Breathing rate',
    unit: 'breaths/min',
    points: breathPoints,
    includeZero: false,
    guide: rangeGuide({
      period: input.period,
      low: BREATH_TYPICAL_LOW,
      high: BREATH_TYPICAL_HIGH,
      unit: 'breaths/min',
      what: 'Breathing rate is the average breaths per minute Garmin stored while you were still that day.',
      latest: latestStored(breathPoints),
    }),
  });
  const oxygenPoints = seriesFrom(input.endDay, input.period, oxygen, 'Blood oxygen', '%', countText, false);
  add({
    id: 'pulse_ox',
    title: 'Blood oxygen',
    unit: '%',
    points: oxygenPoints,
    includeZero: false,
    guide: rangeGuide({
      period: input.period,
      low: SPO2_TYPICAL_LOW,
      high: SPO2_TYPICAL_HIGH,
      unit: '%',
      what: 'Blood oxygen is the average resting oxygen saturation Garmin stored for that day. Watch fit can change the reading.',
      latest: latestStored(oxygenPoints),
    }),
  });
  const hrvPoints = seriesFrom(input.endDay, input.period, hrv, 'Overnight HRV', 'ms', countText, false);
  add({
    id: 'hrv',
    title: 'Overnight HRV',
    unit: 'ms',
    points: hrvPoints,
    includeZero: false,
    guide: hrvGuide(input.period, hrvPoints),
  });
  add({
    id: 'vo2',
    title: 'VO2 max',
    unit: 'ml/kg/min',
    points: seriesFrom(input.endDay, input.period, vo2, 'VO2 max', 'ml/kg/min', oneDecimal, false),
    includeZero: false,
    guide: vo2Guide(input.period, input.age ?? null, input.sex ?? null),
  });
  return charts;
}

/** Bar points for a Garmin chart. An empty day stays source-less so it cannot be captioned as Garmin. */
export function garminBarPoints(points: readonly GarminChartPoint[]): DailyActivityPoint[] {
  return points.map((point) => ({
    day: point.day,
    value: point.empty || point.value == null ? 0 : point.value,
    source: point.empty ? null : point.source,
    label: point.label,
    empty: point.empty,
  }));
}

export function garminSourceCaption(chart: Pick<GarminDetailChart, 'points' | 'includeZero'>): string | null {
  return chartSourceCaption(garminBarPoints(chart.points), { includeZero: chart.includeZero });
}
