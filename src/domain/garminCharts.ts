import {
  GARMIN_EXERCISE_SOURCE,
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
import { periodDayCount, periodPhrase, scaledPeriodTarget, type StatPeriod } from '@/domain/statWindow';
import { chartDays } from '@/domain/workoutDay';

export const GARMIN_DETAILS_TITLE = 'More Garmin Stats';

export const TAP_FOR_MORE = 'Tap for more';

export const NO_DATA = 'No data';

export const NO_STANDARD_RANGE = 'No standard range for this';

export const GENERAL_GUIDANCE =
  'Approximate general guidance. Individual results vary. This is not medical advice.';

export const OUTSIDE_RANGE_NOTE =
  'This sits outside the usual adult range. If it keeps happening, speak to a doctor. This is general guidance, not a diagnosis.';

export const ATHLETE_RESTING_NOTE =
  'Athletes often sit below 60 bpm. This is general guidance, not a diagnosis.';

export const GARMIN_SCORE_NOTE = "Garmin's own score, not a medical measure.";

export const STRESS_ZONES = '0–25 resting, 26–50 low, 51–75 medium, 76–100 high';

/**
 * Garmin's bands for the Body Battery level, from 0 to 100.
 * Charged and drained are points gained or lost, so these bands are not shown there.
 */
export const BODY_BATTERY_ZONES = '0–25 very low, 26–50 low, 51–75 medium, 76–100 high';

export const BODY_BATTERY_WHAT =
  "Body Battery is Garmin's own 0–100 estimate of your energy reserve through the day. The watch works it out from heart rate variability, stress, sleep and activity.";

/** Visible on Average stress. Crisis lines stay on the card, not inside More info. */
export const STRESS_CARE =
  'If you feel persistently low, anxious, or unable to cope, speak to your GP or NHS 111. If you are in crisis or at risk of harm, call 999 or the Samaritans on 116 123.';

/** Common daily step target. The period total is this times the number of days. */
export const STEPS_TYPICAL_LOW = 7000;

export const STEPS_TYPICAL_HIGH = 10000;

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
  /** Urgent care. Shown on the card, never inside More info. */
  care?: string | null;
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
    care: extra.care ?? null,
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

function latestPositive(points: readonly { value: number }[]): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index]?.value ?? 0;
    if (value > 0) return value;
  }
  return null;
}

export function stepsChartGuide(period: StatPeriod, stepGoal: number | null): ChartGuide {
  const days = periodDayCount(period);
  const periodTypical = { low: STEPS_TYPICAL_LOW * days, high: STEPS_TYPICAL_HIGH * days };
  const dailyTypical = { low: STEPS_TYPICAL_LOW, high: STEPS_TYPICAL_HIGH };
  const goal = stepGoal != null && stepGoal > 0 ? Math.round(stepGoal) : null;
  const goalLine = goal == null ? '' : ` The line is your Garmin step goal, ${countText(goal)} steps a day.`;
  return advised(
    `Steps are how many steps that day. There is no UK daily step target. A common range used in research is ${countText(STEPS_TYPICAL_LOW)}–${countText(STEPS_TYPICAL_HIGH)} steps a day. For ${grouped(period)}, that is about ${countText(periodTypical.low)}–${countText(periodTypical.high)} steps. The shaded band is that daily range.${goalLine} It is a reference, not a personal target.`,
    {
      dailyTypical,
      periodTypical,
      target: goal == null ? null : { value: goal, label: `Your Garmin step goal, ${countText(goal)} steps a day` },
    },
  );
}

export function restingChartGuide(period: StatPeriod, points: readonly { value: number }[]): ChartGuide {
  const latest = latestPositive(points);
  let outside: string | null = null;
  if (latest != null && latest < RESTING_TYPICAL_LOW) outside = ATHLETE_RESTING_NOTE;
  if (latest != null && latest > RESTING_TYPICAL_HIGH) outside = OUTSIDE_RANGE_NOTE;
  const band = { low: RESTING_TYPICAL_LOW, high: RESTING_TYPICAL_HIGH };
  return advised(
    `Resting heart rate is the beats per minute stored for that day, from Garmin or Apple Health. The shaded band is a general adult range of ${RESTING_TYPICAL_LOW}–${RESTING_TYPICAL_HIGH} bpm for ${grouped(period)}. It is not adjusted for age. Athletes often sit lower. It is a reference, not a diagnosis.`,
    { dailyTypical: band, periodTypical: band, outside },
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

export function activityChartGuide(period: StatPeriod): ChartGuide {
  const periodTypical = {
    low: scaledPeriodTarget(WHO_MODERATE_LOW, period),
    high: scaledPeriodTarget(WHO_MODERATE_HIGH, period),
  };
  const vigorous = {
    low: scaledPeriodTarget(WHO_MODERATE_LOW / 2, period),
    high: scaledPeriodTarget(WHO_MODERATE_HIGH / 2, period),
  };
  const dailyTypical = {
    low: WHO_MODERATE_LOW / 7,
    high: WHO_MODERATE_HIGH / 7,
  };
  return advised(
    `Intensity minutes add moderate minutes to vigorous minutes. Garmin counts each vigorous minute twice. A published activity range is ${WHO_MODERATE_LOW}–${WHO_MODERATE_HIGH} minutes of moderate activity a week, or ${WHO_MODERATE_LOW / 2}–${WHO_MODERATE_HIGH / 2} minutes if it is vigorous. For ${grouped(period)}, that is about ${countText(periodTypical.low)}–${countText(periodTypical.high)} moderate minutes (${countText(vigorous.low)}–${countText(vigorous.high)} vigorous). The shaded band is the daily share of the moderate range. It is a reference, not a personal target or a diagnosis.`,
    { dailyTypical, periodTypical },
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
    `${input.what} The shaded band is a general adult range of ${input.low}–${input.high} ${input.unit} for ${grouped(input.period)}. It is a reference, not a diagnosis.`,
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
    `VO2 max is Garmin's stored running estimate in ml/kg/min. A cycling estimate is not used. The shaded band is the published 25th to 75th percentile for your age and sex, ${oneDecimal(band.low)}–${oneDecimal(band.high)}, from Kaminsky, Arena, and Myers, Mayo Clinic Proceedings, 2015, for ages 20–79. Shown for ${grouped(period)}. It is a reference, not a target.`,
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
  const values = new Map<string, number>();
  for (const daily of byDay(dailies)) {
    const minutes = garminExerciseMinutes(daily.moderateMinutes, daily.vigorousMinutes);
    remember(values, daily.calendarDate, finite(minutes, false));
  }
  return seriesFrom(endDay, period, values, 'Intensity minutes', 'min', (value) => String(Math.round(value)), false, GARMIN_EXERCISE_SOURCE);
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
  add({
    id: 'sleep_score',
    title: 'Sleep score',
    unit: 'score',
    points: seriesFrom(input.endDay, input.period, sleepScore, 'Sleep score', 'score', countText, false),
    includeZero: false,
    guide: advised(`Sleep score is Garmin's own score for that night. ${NO_STANDARD_RANGE} for ${grouped(input.period)}. It is not a medical sleep measure. Compare a night with your own usual nights.`),
  });
  add({
    id: 'sleep_duration',
    title: 'Sleep duration',
    unit: 'hours',
    points: seriesFrom(input.endDay, input.period, sleepHours, 'Sleep duration', 'hours', oneDecimal, false),
    includeZero: false,
    guide: advised(`Sleep duration is the hours Garmin stored for that night. ${NO_STANDARD_RANGE} for ${grouped(input.period)}. Compare a night with your own usual nights.`),
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
