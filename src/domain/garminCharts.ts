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

export const BODY_BATTERY_ZONES = '0–25 very low, 26–50 low, 51–75 medium, 76–100 high';

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
  const goalLine = goal == null ? '' : ` Your Garmin step goal is ${countText(goal)} steps a day.`;
  return {
    dailyTypical,
    periodTypical,
    target: goal == null ? null : { value: goal, label: `Your Garmin step goal, ${countText(goal)} steps a day` },
    ownAverage: null,
    legend: `Common daily target ${countText(STEPS_TYPICAL_LOW)}–${countText(STEPS_TYPICAL_HIGH)} steps. For ${grouped(period)}, that is about ${countText(periodTypical.low)}–${countText(periodTypical.high)} steps. The shaded band is the daily target.${goalLine} ${GENERAL_GUIDANCE}`,
    about: `Steps are how many steps that day. The shaded band is a common daily target of ${countText(STEPS_TYPICAL_LOW)}–${countText(STEPS_TYPICAL_HIGH)} steps. The line, when Garmin sent a step goal, is your own target. ${GENERAL_GUIDANCE}`,
    outside: null,
  };
}

export function restingChartGuide(period: StatPeriod, points: readonly { value: number }[]): ChartGuide {
  const latest = latestPositive(points);
  let outside: string | null = null;
  if (latest != null && latest < RESTING_TYPICAL_LOW) outside = ATHLETE_RESTING_NOTE;
  if (latest != null && latest > RESTING_TYPICAL_HIGH) outside = OUTSIDE_RANGE_NOTE;
  const band = { low: RESTING_TYPICAL_LOW, high: RESTING_TYPICAL_HIGH };
  return {
    dailyTypical: band,
    periodTypical: band,
    target: null,
    ownAverage: null,
    legend: `Typical adult range ${RESTING_TYPICAL_LOW}–${RESTING_TYPICAL_HIGH} bpm for ${grouped(period)}. Athletes often sit lower. ${GENERAL_GUIDANCE}`,
    about: `Resting heart rate is the beats per minute Garmin or Apple Health stored for that day. The shaded band is a general adult range of ${RESTING_TYPICAL_LOW}–${RESTING_TYPICAL_HIGH} bpm. It is not adjusted for age. ${GENERAL_GUIDANCE}`,
    outside,
  };
}

export function distanceChartGuide(period: StatPeriod, points: readonly { value: number }[]): ChartGuide {
  const mean = averageOf(positiveValues(points));
  const own = mean == null ? null : { value: mean, label: `Your average distance ${grouped(period)}: ${distanceText(mean)}` };
  return {
    dailyTypical: null,
    periodTypical: null,
    target: null,
    ownAverage: own,
    legend: own
      ? `${own.label}. ${NO_STANDARD_RANGE}. ${GENERAL_GUIDANCE}`
      : `${NO_STANDARD_RANGE}. ${GENERAL_GUIDANCE}`,
    about: `Distance is how far that day. ${NO_STANDARD_RANGE}. The line is your own average of the days in ${grouped(period)} that have a distance. ${GENERAL_GUIDANCE}`,
    outside: null,
  };
}

export function floorsChartGuide(period: StatPeriod, points: readonly { value: number }[]): ChartGuide {
  const mean = averageOf(positiveValues(points));
  const own = mean == null ? null : { value: mean, label: `Your average floors ${grouped(period)}: ${oneDecimal(mean)} floors` };
  return {
    dailyTypical: null,
    periodTypical: null,
    target: null,
    ownAverage: own,
    legend: own
      ? `${own.label}. ${NO_STANDARD_RANGE}. ${GENERAL_GUIDANCE}`
      : `${NO_STANDARD_RANGE}. ${GENERAL_GUIDANCE}`,
    about: `Floors climbed that day. ${NO_STANDARD_RANGE}. The line is your own average of the days in ${grouped(period)} that have a number. ${GENERAL_GUIDANCE}`,
    outside: null,
  };
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
  return {
    dailyTypical,
    periodTypical,
    target: null,
    ownAverage: null,
    legend: `WHO guidance is ${WHO_MODERATE_LOW}–${WHO_MODERATE_HIGH} min of moderate activity a week, or ${WHO_MODERATE_LOW / 2}–${WHO_MODERATE_HIGH / 2} min vigorous. For ${grouped(period)}, that is about ${countText(periodTypical.low)}–${countText(periodTypical.high)} moderate minutes (${countText(vigorous.low)}–${countText(vigorous.high)} vigorous). The shaded band is the daily share of the moderate range. Garmin vigorous minutes count twice. ${GENERAL_GUIDANCE}`,
    about: `Intensity minutes add moderate minutes to vigorous minutes, and Garmin counts each vigorous minute twice. The shaded band is the daily share of the WHO moderate range, ${WHO_MODERATE_LOW}–${WHO_MODERATE_HIGH} minutes a week. ${GENERAL_GUIDANCE}`,
    outside: null,
  };
}

function scoreGuide(period: StatPeriod, title: string, zones: string): ChartGuide {
  return {
    dailyTypical: null,
    periodTypical: null,
    target: null,
    ownAverage: null,
    legend: `${title} for ${grouped(period)}. ${zones}. ${GARMIN_SCORE_NOTE} ${GENERAL_GUIDANCE}`,
    about: `${title} uses Garmin's own scale: ${zones}. ${GARMIN_SCORE_NOTE} ${GENERAL_GUIDANCE}`,
    outside: null,
  };
}

function hrvGuide(period: StatPeriod, points: readonly GarminChartPoint[]): ChartGuide {
  const mean = averageOf(points.flatMap((point) => (point.empty || point.value == null ? [] : [point.value])));
  const own = mean == null ? null : { value: mean, label: `Your average overnight HRV ${grouped(period)}: ${Math.round(mean)} ms` };
  return {
    dailyTypical: null,
    periodTypical: null,
    target: null,
    ownAverage: own,
    legend: own
      ? `${own.label}. HRV varies a lot between people and with age, so this is your own recent average, not a healthy range for everyone. ${GENERAL_GUIDANCE}`
      : `HRV varies a lot between people and with age. There is no population healthy band here. ${GENERAL_GUIDANCE}`,
    about: `Overnight HRV is Garmin's last-night average in milliseconds. There is no population healthy band. The line is your own average of the nights in ${grouped(period)} that have a number. HRV varies a lot between people and with age. ${GENERAL_GUIDANCE}`,
    outside: null,
  };
}

function plainGuide(period: StatPeriod, about: string): ChartGuide {
  return {
    dailyTypical: null,
    periodTypical: null,
    target: null,
    ownAverage: null,
    legend: `${NO_STANDARD_RANGE} for ${grouped(period)}. ${GENERAL_GUIDANCE}`,
    about: `${about} ${NO_STANDARD_RANGE}. ${GENERAL_GUIDANCE}`,
    outside: null,
  };
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
  return {
    dailyTypical: band,
    periodTypical: band,
    target: null,
    ownAverage: null,
    legend: `Typical adult range ${input.low}–${input.high} ${input.unit} for ${grouped(input.period)}. ${GENERAL_GUIDANCE}`,
    about: `${input.what} The shaded band is a general adult range of ${input.low}–${input.high} ${input.unit}. ${GENERAL_GUIDANCE}`,
    outside,
  };
}

function vo2Guide(period: StatPeriod, age: number | null, sex: NutritionSex | null): ChartGuide {
  const band = publishedCardioBand(age, sex);
  if (!band) {
    return plainGuide(
      period,
      'VO2 max is Garmin\'s stored estimate of how much oxygen you can use at full effort, in ml/kg/min. A cycling estimate is not used.',
    );
  }
  return {
    dailyTypical: band,
    periodTypical: band,
    target: null,
    ownAverage: null,
    legend: `Typical for your age and sex, ${oneDecimal(band.low)}–${oneDecimal(band.high)} ml/kg/min, for ${grouped(period)}. From Kaminsky, Arena, and Myers, 2015. ${GENERAL_GUIDANCE}`,
    about: `VO2 max is Garmin's stored running estimate in ml/kg/min. A cycling estimate is not used. The shaded band is the published 25th to 75th percentile for your age and sex (Kaminsky, Arena, and Myers, Mayo Clinic Proceedings, 2015), for ages 20–79. ${GENERAL_GUIDANCE}`,
    outside: null,
  };
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
    guide: scoreGuide(input.period, 'Average stress', STRESS_ZONES),
  });
  const battery = (
    id: string,
    title: string,
    values: ReadonlyMap<string, number>,
  ) => {
    add({
      id,
      title,
      unit: 'score',
      points: seriesFrom(input.endDay, input.period, values, title, 'score', countText, true),
      includeZero: true,
      guide: scoreGuide(input.period, title, BODY_BATTERY_ZONES),
    });
  };
  battery('body_battery_charged', 'Body battery charged', charged);
  battery('body_battery_drained', 'Body battery drained', drained);
  battery('body_battery_highest', 'Body battery highest', highest);
  battery('body_battery_lowest', 'Body battery lowest', lowest);
  add({
    id: 'sleep_score',
    title: 'Sleep score',
    unit: 'score',
    points: seriesFrom(input.endDay, input.period, sleepScore, 'Sleep score', 'score', countText, false),
    includeZero: false,
    guide: plainGuide(input.period, 'Sleep score is Garmin\'s score for that night.'),
  });
  add({
    id: 'sleep_duration',
    title: 'Sleep duration',
    unit: 'hours',
    points: seriesFrom(input.endDay, input.period, sleepHours, 'Sleep duration', 'hours', oneDecimal, false),
    includeZero: false,
    guide: plainGuide(input.period, 'Sleep duration is the hours Garmin stored for that night.'),
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
      what: 'Breathing rate is the average breaths per minute Garmin stored for that day.',
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
      what: 'Blood oxygen is the average resting oxygen saturation Garmin stored for that day.',
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
