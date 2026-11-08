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
  GarminActivityDetail,
  GarminBloodPressure,
  GarminBodyComp,
  GarminDaily,
  GarminEpoch,
  GarminHealthSnapshot,
  GarminHrvSummary,
  GarminMoveIq,
  GarminPulseOx,
  GarminRespiration,
  GarminSkinTemp,
  GarminSleep,
  GarminStressDetail,
  GarminUserMetric,
} from '@/domain/garminConnect';
import { publishedCardioBand } from '@/domain/fitnessSnapshot';
import { GARMIN_EPOCH_EXPLAIN, readingFor, type MetricContext, type MetricReading } from '@/domain/metricRegistry';
import type { NutritionGoal, NutritionSex } from '@/domain/nutrition';
import type { RestingFitnessComment, RestingInfoSection } from '@/domain/restingFitness';
import { RESTING_CARE, RESTING_CARD_CARE } from '@/domain/restingFitness';
import { completedDayStats, londonToday, periodDayCount, periodPhrase, scaledPeriodTarget, type StatPeriod } from '@/domain/statWindow';
import { heartRateMaxFrom } from '@/domain/trainingGuidance';
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
  /** Rating, source, and tips from the shared metric registry. */
  rating?: MetricReading;
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
  /** One plain sentence on the card when the chart has no readings yet. */
  note?: string;
};

export const NO_READINGS_YET = 'No readings yet';

export type GarminChartInput = {
  endDay: string;
  period: StatPeriod;
  dailies: readonly GarminDaily[];
  sleep: readonly GarminSleep[];
  respiration: readonly GarminRespiration[];
  pulseOx: readonly GarminPulseOx[];
  hrv: readonly GarminHrvSummary[];
  userMetrics?: readonly GarminUserMetric[];
  bloodPressure?: readonly GarminBloodPressure[];
  bodyComp?: readonly GarminBodyComp[];
  skinTemp?: readonly GarminSkinTemp[];
  stress?: readonly GarminStressDetail[];
  epochs?: readonly GarminEpoch[];
  healthSnapshot?: readonly GarminHealthSnapshot[];
  moveIq?: readonly GarminMoveIq[];
  activityDetails?: readonly GarminActivityDetail[];
  age?: number | null;
  sex?: NutritionSex | null;
  goal?: NutritionGoal | null;
};

/** Shown when Garmin is connected and that summary has not arrived yet. */
export const GARMIN_EXTRA_EMPTY: readonly { id: string; line: string }[] = [
  { id: 'stress', line: 'Stress is Garmin\'s daytime stress score. Wear the watch and it will appear here.' },
  { id: 'body_battery_charged', line: 'Body battery is Garmin\'s charge and drain through the day. It appears after a sync.' },
  { id: 'respiration', line: 'Breathing rate is Garmin\'s breaths per minute while you are still.' },
  { id: 'pulse_ox', line: 'Pulse ox is Garmin\'s blood oxygen while you are still. Wear the watch and it will appear here.' },
  { id: 'skin_temp', line: 'Skin temperature is Garmin\'s overnight change from your usual temperature.' },
  { id: 'blood_pressure', line: 'Blood pressure is a Garmin cuff or watch reading. It appears after that reading syncs.' },
  { id: 'body_fat', line: 'Body composition is Garmin\'s scale or watch estimate of weight, fat, and BMI.' },
  { id: 'fitness_age', line: 'Fitness age is Garmin\'s estimate beside VO2 max. It appears after a sync.' },
  { id: 'snapshot_heart', line: 'Health snapshot is a short Garmin check of heart rate, oxygen, and breathing.' },
  { id: 'epoch_minutes', line: 'Epochs are Garmin\'s 15-minute activity slices. They appear after a sync.' },
  { id: 'move_iq', line: 'Move IQ is movement Garmin noticed without a started activity.' },
];

/**
 * Health stats omit `span`, so the shared Day / 7 days / 30 days control decides the window.
 * Workouts pass 7 or 30 from that screen's chart-days control.
 */
export function movementPeriod(span: number | undefined, shared: StatPeriod): { period: StatPeriod; days: number } {
  if (span == null) return { period: shared, days: periodDayCount(shared) };
  if (span <= 1) return { period: 'day', days: 1 };
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

function fillMetricContext(partial: Partial<MetricContext> | undefined, period?: StatPeriod): MetricContext {
  return {
    age: partial?.age ?? null,
    sex: partial?.sex ?? null,
    goal: partial?.goal ?? null,
    fitnessGoal: partial?.fitnessGoal ?? null,
    ownUsual: partial?.ownUsual ?? null,
    heightCm: partial?.heightCm ?? null,
    realAge: partial?.realAge ?? partial?.age ?? null,
    vo2: partial?.vo2 ?? null,
    restingHr: partial?.restingHr ?? null,
    bmi: partial?.bmi ?? null,
    bodyFat: partial?.bodyFat ?? null,
    vigorousWeek: partial?.vigorousWeek ?? null,
    windowDays: partial?.windowDays ?? (period ? periodDayCount(period) : null),
    dayFraction: partial?.dayFraction ?? null,
    maxHeartRate: partial?.maxHeartRate ?? null,
    calorieTarget: partial?.calorieTarget ?? null,
    proteinTarget: partial?.proteinTarget ?? null,
    drinkFreeGoal: partial?.drinkFreeGoal ?? null,
    processedCount: partial?.processedCount ?? null,
    wholeCount: partial?.wholeCount ?? null,
    basis: partial?.basis ?? null,
    scale: partial?.scale ?? null,
    build: partial?.build ?? null,
    viewedDay: partial?.viewedDay ?? null,
  };
}

/** Attach the registry rating without writing the caveat into `about` (some charts forbid that phrase there). */
function sameWords(left: string, right: string): boolean {
  return left.replace(/\s+/g, ' ').trim() === right.replace(/\s+/g, ' ').trim();
}

function withMetric(guide: ChartGuide, id: string, value: number | null, ctx: MetricContext): ChartGuide {
  const rating = readingFor(id, value, ctx);
  const face = rating.pending ? rating.where : `${rating.label}. ${rating.where}`;
  const source = rating.source.trim();
  const sourceRepeats = sameWords(source, rating.where) || sameWords(source, face) || face.includes(source) || rating.where.includes(source);
  const already = guide.sections?.some((section) => section.heading === 'Source');
  const sections = already
    ? guide.sections
    : [
      ...(guide.sections ?? []).filter((section) => section.heading !== 'Where you sit'),
      ...(rating.goalLine && !sameWords(rating.goalLine, face) ? [{ heading: 'Your aim', body: rating.goalLine }] : []),
      ...(rating.tips.length ? [{ heading: 'How to improve', body: rating.tips.join(' ') }] : []),
      ...(sourceRepeats ? [] : [{ heading: 'Source', body: source }]),
    ];
  const band = rating.draw && rating.band ? rating.band : null;
  return {
    ...guide,
    rating,
    sections,
    dailyTypical: guide.dailyTypical ?? band,
    periodTypical: guide.periodTypical ?? band,
  };
}

function seriesStats(points: readonly { value: number; empty?: boolean }[]): { latest: number | null; usual: number | null; sum: number | null } {
  const values = points.flatMap((point) => (point.empty || !(point.value > 0) ? [] : [point.value]));
  if (values.length === 0) return { latest: null, usual: null, sum: null };
  const earlier = values.slice(0, -1);
  return {
    latest: values[values.length - 1] ?? null,
    usual: earlier.length ? earlier.reduce((sum, value) => sum + value, 0) / earlier.length : null,
    sum: values.reduce((sum, value) => sum + value, 0),
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

/**
 * Mean of positive points. When a day is stamped and the window includes
 * calendar today plus earlier days, today is left out of the average.
 */
function averageCompleted(
  points: readonly { day?: string; value: number | null; empty?: boolean }[],
  today?: string,
): number | null {
  const valued = points.flatMap((point) => (
    point.empty || point.value == null || !(point.value > 0) ? [] : [{ day: point.day, value: point.value }]
  ));
  if (valued.length === 0) return null;
  const stamped = valued.flatMap((point) => (point.day ? [{ day: point.day, value: point.value }] : []));
  const mixedWithToday = today != null
    && stamped.length === valued.length
    && stamped.some((point) => point.day === today)
    && stamped.some((point) => point.day < today);
  if (mixedWithToday && today) return completedDayStats(stamped, today).average;
  return averageOf(valued.map((point) => point.value));
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
  ctx: Partial<MetricContext> = {},
): ChartGuide {
  const days = periodDayCount(period);
  const band = stepResearchBand(age);
  const periodTypical = { low: band.low * days, high: band.high * days };
  const dailyTypical = { low: band.low, high: band.high };
  const goal = stepGoal != null && stepGoal > 0 ? Math.round(stepGoal) : null;
  const goalLine = goal == null ? '' : ` The line is your Garmin step goal, ${countText(goal)} steps a day.`;
  return withMetric(advised(
    `Steps are how many steps that day. There is no UK daily step target. ${stepsResearchMeaning(dailyAverage)} For ${grouped(period)}, the lime band is about ${countText(periodTypical.low)}–${countText(periodTypical.high)} steps (${band.why}).${goalLine} It is a reference, not a personal target.`,
    {
      dailyTypical,
      periodTypical,
      target: goal == null ? null : { value: goal, label: `Your Garmin step goal, ${countText(goal)} steps a day` },
    },
  ), 'steps', dailyAverage, fillMetricContext({ ...ctx, age: ctx.age ?? age }, period));
}

export function restingChartGuide(
  period: StatPeriod,
  points: readonly { value: number; empty?: boolean }[],
  fitness?: RestingFitnessComment | null,
  ctx: Partial<MetricContext> = {},
): ChartGuide {
  const band = { low: RESTING_TYPICAL_LOW, high: RESTING_TYPICAL_HIGH };
  const stats = seriesStats(points);
  return withMetric(advised(
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
  ), 'resting_heart_rate', stats.latest, fillMetricContext({ ...ctx, ownUsual: ctx.ownUsual ?? stats.usual }, period));
}

export function distanceChartGuide(period: StatPeriod, points: readonly { day?: string; value: number; empty?: boolean }[], ctx: Partial<MetricContext> = {}, today?: string): ChartGuide {
  const mean = averageCompleted(points, today);
  const own = mean == null ? null : { value: mean, label: `Your average distance ${grouped(period)}: ${distanceText(mean)}` };
  const stats = seriesStats(points);
  return withMetric(advised(
    `Distance is how far you moved that day. ${NO_STANDARD_RANGE}. The line is your own average of the days in ${grouped(period)} that have a distance. Compare a day with your own usual days.`,
    { ownAverage: own },
  ), 'distance', stats.latest, fillMetricContext({ ...ctx, ownUsual: stats.usual }, period));
}

export function floorsChartGuide(period: StatPeriod, points: readonly { day?: string; value: number; empty?: boolean }[], ctx: Partial<MetricContext> = {}, today?: string): ChartGuide {
  const mean = averageCompleted(points, today);
  const own = mean == null ? null : { value: mean, label: `Your average floors ${grouped(period)}: ${oneDecimal(mean)} floors` };
  const stats = seriesStats(points);
  return withMetric(advised(
    `Floors are how many floors were climbed that day. ${NO_STANDARD_RANGE}. The line is your own average of the days in ${grouped(period)} that have a number. Compare a day with your own usual days.`,
    { ownAverage: own },
  ), 'floors', stats.latest, fillMetricContext({ ...ctx, ownUsual: stats.usual }, period));
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
export function activityChartGuide(period: StatPeriod, ctx: Partial<MetricContext> = {}, value: number | null = null): ChartGuide {
  return withMetric(advised(INTENSITY_MORE_INFO, weightedMinuteBands(period)), 'intensity', value, fillMetricContext(ctx, period));
}

export function exerciseChartGuide(period: StatPeriod, ctx: Partial<MetricContext> = {}, value: number | null = null): ChartGuide {
  return withMetric(advised(EXERCISE_MORE_INFO, weightedMinuteBands(period)), 'exercise', value, fillMetricContext(ctx, period));
}

/** Real minutes. The weekly range is not drawn on a chart that shows only one type. */
export function moderateChartGuide(ctx: Partial<MetricContext> = {}, value: number | null = null): ChartGuide {
  return withMetric(advised(MODERATE_MORE_INFO), 'moderate', value, fillMetricContext(ctx));
}

export function vigorousChartGuide(ctx: Partial<MetricContext> = {}, value: number | null = null): ChartGuide {
  return withMetric(advised(VIGOROUS_MORE_INFO), 'vigorous', value, fillMetricContext(ctx));
}

/** Active calories have no published kilocalorie range. The rating says so. */
export function activeEnergyChartGuide(ctx: Partial<MetricContext> = {}, value: number | null = null): ChartGuide {
  return withMetric(
    advised('Active calories are the energy stored for movement that day, from Apple Health or Garmin. There is no single published kilocalorie range for that figure. Compare a day with your own usual days.'),
    'active_energy',
    value,
    fillMetricContext(ctx),
  );
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

/**
 * Nunan, Sandercock and Brodie, 2010. Short-term SDNN in healthy adults.
 * https://onlinelibrary.wiley.com/doi/10.1111/j.1540-8159.2010.02841.x
 * The review is not split by sex. Sammito and Böckelmann, 2016, found 24-hour SDNN
 * falls with age; a watch night is not that recording.
 * https://pubmed.ncbi.nlm.nih.gov/26883166/
 */
export const HRV_SDNN_RANGE =
  'A review of short-term SDNN in healthy adults found study averages from about 32 to 93 ms, with an overall mean near 50 ms (Nunan, Sandercock and Brodie, 2010). That review is not split by sex. 24-hour SDNN falls with age (Sammito and Böckelmann, 2016), and a watch night is not a 24-hour recording. Ranges vary widely. Your own trend matters more than one night and more than a published average. Not medical advice.';

export const HRV_MEASURES_DIFFER =
  'Apple Health HRV is SDNN. Garmin overnight HRV is RMSSD. They are different measures, so they are not averaged together.';

/** One source line on the Garmin card. Not mixed with the Apple figure. */
export const GARMIN_HRV_SOURCE = 'Garmin overnight HRV';

export const GARMIN_HRV_EMPTY =
  'Garmin records HRV overnight on supported watches; wear it to sleep and it will appear here.';

/** One source line on the Apple card. Not mixed with the Garmin figure. */
export const APPLE_HRV_SOURCE = 'Apple Health (SDNN)';

export const APPLE_HRV_EMPTY = 'Apple Health HRV comes from Apple Watch.';

function hrvGuide(period: StatPeriod, points: readonly GarminChartPoint[], today?: string): ChartGuide {
  const mean = averageCompleted(points, today);
  const own = mean == null ? null : { value: mean, label: `Your average Garmin overnight HRV ${grouped(period)}: ${Math.round(mean)} ms` };
  return advised(
    `Garmin overnight HRV is last night's RMSSD. A 2010 review found short-term averages around 42 ms. It is not Apple's SDNN.`,
    { ownAverage: own },
  );
}

export function sdnnGuide(period: StatPeriod, points: readonly { day?: string; value: number; empty?: boolean }[], ctx: Partial<MetricContext> = {}, today?: string): ChartGuide {
  const mean = averageCompleted(points, today);
  const own = mean == null ? null : { value: mean, label: `Your average Apple Health SDNN ${grouped(period)}: ${Math.round(mean)} ms` };
  const stats = seriesStats(points);
  return withMetric(advised(
    `Apple Health HRV is SDNN. A 2010 review found short-term averages from about 32 to 93 ms. It is not Garmin's overnight RMSSD.`,
    { ownAverage: own },
  ), 'hrv_sdnn', stats.latest, fillMetricContext({ ...ctx, ownUsual: stats.usual }, period));
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
  signed = false,
): GarminChartPoint[] {
  return chartDays(endDay, periodDayCount(period)).map((day) => {
    const stored = values.get(day);
    const missing = stored == null || (!signed && (zeroIsValue ? stored < 0 : !(stored > 0)));
    if (missing) {
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

function latestMapValue(values: ReadonlyMap<string, number>): number | null {
  let day = '';
  let value: number | null = null;
  for (const [key, stored] of values) {
    if (key >= day) {
      day = key;
      value = stored;
    }
  }
  return value;
}

function detailContext(input: GarminChartInput, vo2: number | null): MetricContext {
  const week = new Set(chartDays(input.endDay, 7));
  let vigorous = 0;
  let sawVigorous = false;
  let resting: number | null = null;
  let restingDay = '';
  for (const daily of input.dailies) {
    if (!week.has(daily.calendarDate)) continue;
    if (daily.vigorousMinutes != null && daily.vigorousMinutes > 0) {
      vigorous += daily.vigorousMinutes;
      sawVigorous = true;
    }
    if (daily.restingHeartRateBpm != null && daily.restingHeartRateBpm > 0 && daily.calendarDate >= restingDay) {
      restingDay = daily.calendarDate;
      resting = daily.restingHeartRateBpm;
    }
  }
  let bodyFat: number | null = null;
  let bmi: number | null = null;
  let bodyDay = '';
  for (const row of input.bodyComp ?? []) {
    if (row.calendarDate < bodyDay) continue;
    bodyDay = row.calendarDate;
    if (row.bodyFatPct != null && row.bodyFatPct > 0) bodyFat = row.bodyFatPct;
    if (row.bmi != null && row.bmi > 0) bmi = row.bmi;
  }
  return fillMetricContext({
    age: input.age ?? null,
    sex: input.sex ?? null,
    goal: input.goal ?? null,
    realAge: input.age ?? null,
    vo2,
    restingHr: resting,
    bodyFat,
    bmi,
    vigorousWeek: sawVigorous ? vigorous : null,
    windowDays: periodDayCount(input.period),
    maxHeartRate: heartRateMaxFrom({
      age: input.age ?? null,
      recorded: input.dailies.map((day) => day.maxHeartRateBpm),
    }),
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
  for (const row of byDay(input.stress ?? [])) {
    if (stress.has(row.calendarDate)) continue;
    remember(stress, row.calendarDate, finite(row.averageStress, true) == null ? null : Math.round(row.averageStress ?? 0));
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
  const metricCtx = detailContext(input, latestMapValue(vo2));
  const add = (chart: GarminDetailChart) => {
    if (!hasReading(chart.points)) return;
    const values = chart.points.flatMap((point) => (point.empty || point.value == null ? [] : [point.value]));
    const earlier = values.slice(0, -1);
    const ownUsual = earlier.length ? earlier.reduce((sum, value) => sum + value, 0) / earlier.length : null;
    charts.push({
      ...chart,
      guide: withMetric(chart.guide, chart.id, latestStored(chart.points), { ...metricCtx, ownUsual }),
    });
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
  add({
    id: 'sleep_score',
    title: 'Sleep score',
    unit: 'score',
    points: seriesFrom(input.endDay, input.period, sleepScore, 'Sleep score', 'score', countText, false),
    includeZero: false,
    guide: advised(`Sleep score is Garmin's own score for that night. Garmin's bands are Excellent 90–100, Good 80–89, Fair 60–79, and Poor under 60. The lime band is Good and Excellent, 80–100, for ${grouped(input.period)}. It is not a medical sleep measure.`),
  });
  add({
    id: 'sleep_duration',
    title: 'Sleep duration',
    unit: 'hours',
    points: seriesFrom(input.endDay, input.period, sleepHours, 'Sleep duration', 'hours', oneDecimal, false),
    includeZero: false,
    guide: advised(`Sleep duration is the hours Garmin stored for that night. For adults the NHS and the National Sleep Foundation describe about 7 to 9 hours (Hirshkowitz and colleagues, Sleep Health, 2015). From age 65 the Foundation's range is about 7 to 8 hours. The lime band follows that, for ${grouped(input.period)}.`),
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
    title: 'Heart rate variability (Garmin overnight RMSSD)',
    unit: 'ms',
    points: hrvPoints,
    includeZero: false,
    guide: hrvGuide(input.period, hrvPoints, londonToday()),
  });
  add({
    id: 'vo2',
    title: 'VO2 max',
    unit: 'ml/kg/min',
    points: seriesFrom(input.endDay, input.period, vo2, 'VO2 max', 'ml/kg/min', oneDecimal, false),
    includeZero: false,
    guide: vo2Guide(input.period, input.age ?? null, input.sex ?? null),
  });
  const fitnessAge = new Map<string, number>();
  for (const row of byDay(input.userMetrics ?? [])) {
    remember(fitnessAge, row.calendarDate, finite(row.fitnessAge, false) == null ? null : Math.round(row.fitnessAge ?? 0));
  }
  add(metricChart(input, 'fitness_age', 'Fitness age', 'years', fitnessAge, 'Fitness age is Garmin\'s estimate of fitness compared with age. It is not your birthday and not a diagnosis.'));
  add(metricChart(input, 'skin_temp', 'Skin temperature', '°C', dailyNumber(input.skinTemp ?? [], (row) => row.deviationC, true), 'Skin temperature is how far Garmin\'s overnight reading sat from your usual skin temperature, in °C. The band is about 1 degree either side of usual. Not medical advice.', { low: -1, high: 1 }, true));
  add(metricChart(input, 'blood_pressure', 'Blood pressure', 'mmHg', dailyNumber(input.bloodPressure ?? [], (row) => row.systolic), 'Blood pressure here is the systolic reading Garmin stored, in mmHg. The band is a general adult reference of 90–120. Diastolic is a separate number and is not mixed into this bar. Not medical advice.', { low: 90, high: 120 }));
  add(metricChart(input, 'diastolic', 'Diastolic pressure', 'mmHg', dailyNumber(input.bloodPressure ?? [], (row) => row.diastolic), 'Diastolic pressure is the lower Garmin blood-pressure number, in mmHg. The band is a general adult reference of 60–80. It is not averaged with systolic. Not medical advice.', { low: 60, high: 80 }));
  add(metricChart(input, 'body_fat', 'Body fat', '%', dailyNumber(input.bodyComp ?? [], (row) => row.bodyFatPct), 'Measured body fat % from Garmin\'s scale or watch. It is not estimated from BMI. The lime band, when sex is set, is the ACE athlete-to-fitness span. ACE categories are not split by age. It is a reference, not a diagnosis.'));
  add(metricChart(input, 'bmi', 'BMI', 'BMI', dailyNumber(input.bodyComp ?? [], (row) => row.bmi), 'BMI is Garmin\'s stored body mass index. The band is the general adult reference of 18.5–24.9. BMI misreads people who lift weights. With a muscular build this is a reference only, not a rating. A measured body fat % is used when there is one. It is not a diagnosis.', { low: 18.5, high: 24.9 }));
  add(metricChart(input, 'snapshot_heart', 'Health snapshot heart rate', 'bpm', dailyNumber(input.healthSnapshot ?? [], (row) => row.restingHeartRateBpm ?? row.heartRateBpm), 'Health snapshot heart rate is the heart rate from Garmin\'s short check, in bpm. The band is a general adult resting range of 60–100. Not medical advice.', { low: 60, high: 100 }));
  const epochs = metricChart(input, 'epoch_minutes', 'Epoch active minutes', 'min', epochMinutes(input), GARMIN_EPOCH_EXPLAIN);
  epochs.note = GARMIN_EPOCH_EXPLAIN;
  add(epochs);
  add(metricChart(input, 'move_iq', 'Move IQ', 'min', dailyNumber(input.moveIq ?? [], (row) => (row.durationSeconds == null ? null : row.durationSeconds / 60)), 'Move IQ is movement Garmin noticed without a started activity, in minutes. Not medical advice.'));
  add(metricChart(input, 'activity_detail', 'Activity detail', 'min', dailyNumber(input.activityDetails ?? [], (row) => (row.durationSeconds == null ? null : row.durationSeconds / 60)), 'Activity detail is the length Garmin stored for a recorded activity, in minutes. The sample trace is not kept. Not medical advice.'));
  return charts;
}

function dailyNumber<T extends { calendarDate: string }>(rows: readonly T[], pick: (row: T) => number | null, signed = false): Map<string, number> {
  const values = new Map<string, number>();
  for (const row of byDay(rows)) {
    const value = pick(row);
    if (value == null || !Number.isFinite(value)) continue;
    if (!signed && !(value > 0)) continue;
    values.set(row.calendarDate, value);
  }
  return values;
}

function epochMinutes(input: GarminChartInput): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of input.epochs ?? []) {
    if (row.activeSeconds == null || !(row.activeSeconds > 0)) continue;
    totals.set(row.calendarDate, (totals.get(row.calendarDate) ?? 0) + row.activeSeconds / 60);
  }
  return totals;
}

function metricChart(
  input: GarminChartInput,
  id: string,
  title: string,
  unit: string,
  values: ReadonlyMap<string, number>,
  about: string,
  band?: { low: number; high: number },
  signed = false,
): GarminDetailChart {
  const points = seriesFrom(input.endDay, input.period, values, title, unit, oneDecimal, false, GARMIN_SOURCE, signed);
  return {
    id,
    title,
    unit,
    points,
    includeZero: false,
    guide: band
      ? rangeGuide({ period: input.period, low: band.low, high: band.high, unit, what: about, latest: latestStored(points) })
      : advised(about),
  };
}

/** Every More Garmin Stats card, including the ones that have not synced yet. Activity files are not a card: the file itself is not stored. */
export const GARMIN_CARD_CATALOGUE: readonly { id: string; title: string; unit: string; line: string; signed?: boolean }[] = [
  { id: 'stress', title: 'Average stress', unit: 'score', line: 'Stress is Garmin\'s daytime stress score. Wear the watch and it will appear here.' },
  { id: 'body_battery_charged', title: 'Body battery charged', unit: 'score', line: 'Body battery is Garmin\'s charge and drain through the day. It appears after a sync.' },
  { id: 'body_battery_drained', title: 'Body battery drained', unit: 'score', line: 'Drained is how many Body Battery points the day took off. It appears after a sync.' },
  { id: 'body_battery_highest', title: 'Body battery highest', unit: 'score', line: 'Highest is the top Body Battery level that day. It appears after a sync.' },
  { id: 'body_battery_lowest', title: 'Body battery lowest', unit: 'score', line: 'Lowest is the bottom Body Battery level that day. It appears after a sync.' },
  { id: 'sleep_score', title: 'Sleep score', unit: 'score', line: 'Sleep score is Garmin\'s own score for that night. It appears after a night on the watch.' },
  { id: 'sleep_duration', title: 'Sleep duration', unit: 'hours', line: 'Sleep duration is the hours Garmin stored for that night. It appears after a night on the watch.' },
  { id: 'respiration', title: 'Breathing rate', unit: 'breaths/min', line: 'Breathing rate is Garmin\'s breaths per minute while you are still.' },
  { id: 'pulse_ox', title: 'Pulse ox', unit: '%', line: 'Pulse ox is Garmin\'s blood oxygen while you are still. Wear the watch and it will appear here.' },
  { id: 'hrv', title: 'Heart rate variability', unit: 'ms', line: GARMIN_HRV_EMPTY },
  { id: 'vo2', title: 'VO2 max', unit: 'ml/kg/min', line: 'VO2 max is Garmin\'s running estimate. It appears after a qualifying activity syncs.' },
  { id: 'fitness_age', title: 'Fitness age', unit: 'years', line: 'Fitness age is Garmin\'s estimate beside VO2 max. It appears after a sync.' },
  { id: 'skin_temp', title: 'Skin temperature', unit: '°C', line: 'Skin temperature is Garmin\'s overnight change from your usual temperature.', signed: true },
  { id: 'blood_pressure', title: 'Blood pressure', unit: 'mmHg', line: 'Blood pressure is a Garmin cuff or watch reading. It appears after that reading syncs.' },
  { id: 'diastolic', title: 'Diastolic pressure', unit: 'mmHg', line: 'Diastolic pressure is the lower Garmin blood-pressure number. It is not mixed into the systolic card.' },
  { id: 'body_fat', title: 'Body composition', unit: '%', line: 'Body composition is Garmin\'s scale or watch estimate of weight, fat, and BMI.' },
  { id: 'bmi', title: 'BMI', unit: 'BMI', line: 'BMI is Garmin\'s stored body mass index. It appears with a body-composition sync.' },
  { id: 'snapshot_heart', title: 'Health snapshot', unit: 'bpm', line: 'Health snapshot is a short Garmin check of heart rate, oxygen, and breathing.' },
  { id: 'epoch_minutes', title: 'Epochs', unit: 'min', line: GARMIN_EPOCH_EXPLAIN },
  { id: 'move_iq', title: 'Move IQ', unit: 'min', line: 'Move IQ is movement Garmin noticed without a started activity.' },
  { id: 'activity_detail', title: 'Activity detail', unit: 'min', line: 'Activity detail is the length Garmin stored for a recorded activity. The sample trace is not kept.' },
];

/** Empty cards for Garmin metrics that have not arrived. Each one is a real chart, rated from the registry. */
export function garminPlaceholderCharts(input: GarminChartInput, shownIds: ReadonlySet<string>): GarminDetailChart[] {
  const ctx = detailContext(input, null);
  return GARMIN_CARD_CATALOGUE.filter((spec) => !shownIds.has(spec.id)).map((spec) => {
    const points = seriesFrom(input.endDay, input.period, new Map(), spec.title, spec.unit, oneDecimal, false, GARMIN_SOURCE, spec.signed === true);
    return {
      id: spec.id,
      title: spec.title,
      unit: spec.unit,
      points,
      includeZero: spec.id === 'stress' || spec.id.startsWith('body_battery'),
      note: spec.line,
      guide: withMetric(advised(spec.line), spec.id, null, ctx),
    };
  });
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
