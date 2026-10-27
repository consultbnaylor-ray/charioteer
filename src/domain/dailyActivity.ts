import {
  EXERCISE_APPLE_CAPTION,
  EXERCISE_BOTH_CAPTION,
  EXERCISE_GARMIN_CAPTION,
  MODERATE_EMPTY,
  VIGOROUS_EMPTY,
} from '@/domain/activityMinutes';
import type { GarminDaily } from '@/domain/garminConnect';
import { weekdayShort } from '@/domain/healthInsights';
import { chartDayLabel, chartDays } from '@/domain/workoutDay';

/** Garmin intensity minutes: one vigorous minute counts as two. Moderate stays one for one. */
export const GARMIN_VIGOROUS_MINUTE_WEIGHT = 2;

export const DAILY_ACTIVITY_TITLE = 'Daily activity';

export const DAILY_ACTIVITY_RINGS_HINT =
  'Rings and exercise minutes include all your movement, not just recorded workouts.';

export const DAILY_ACTIVITY_TAP_HINT = "Tap a bar to see that day's activity.";

export const DAILY_ACTIVITY_CONSENT =
  'Health data is off. Turn it on in Privacy & consent to see this.';

/** Appended when that day's exercise minutes came from Garmin. */
export const GARMIN_EXERCISE_SOURCE = '(Garmin, vigorous counted twice)';

/** Appended when that day's active calories came from Garmin. */
export const GARMIN_CALORIE_SOURCE = '(Garmin)';

export const APPLE_SOURCE = '(Apple Health)';

export const GARMIN_SOURCE = '(Garmin)';

/** Whole-chart caption when the days on screen use both sources. */
export const APPLE_AND_GARMIN_SOURCE = '(Apple Health and Garmin)';

export const EXERCISE_PERMISSION_HINT = 'Exercise minutes need permission in Apple Health.';

export const EXERCISE_PERMISSION_BUTTON = 'Open Health permissions';

/** Shown for the chart's last day when neither Apple Health nor Garmin has steps. */
export const NO_STEPS_YET_TODAY = 'No steps yet today';

export type ActivitySource = 'apple' | 'garmin';

export type DailyActivityPoint = {
  day: string;
  value: number;
  source: ActivitySource | null;
  label: string;
  /** A day with no reading. Zero with this unset is still drawn as an empty slot by older charts. */
  empty?: boolean;
};

export type AppleDayValue = { day: string; value: number };

export type AppleDailyActivity = {
  exerciseMinutes: AppleDayValue[];
  activeKcal: AppleDayValue[];
};

export function emptyAppleDailyActivity(): AppleDailyActivity {
  return { exerciseMinutes: [], activeKcal: [] };
}

/** `Thu 22 Oct`. */
export function activityDayName(day: string): string {
  return `${weekdayShort(day)} ${chartDayLabel(day)}`;
}

/**
 * Garmin's own intensity-minute rule. A day with neither duration is not a reading.
 * Stored minutes stay as Garmin sent them. The double count happens only here.
 */
export function garminExerciseMinutes(
  moderate: number | null | undefined,
  vigorous: number | null | undefined,
): number | null {
  if (moderate == null && vigorous == null) return null;
  const minutes = (moderate ?? 0) + GARMIN_VIGOROUS_MINUTE_WEIGHT * (vigorous ?? 0);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  return Math.round(minutes);
}

export function garminActiveKcal(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

/**
 * One value per day, oldest first. Apple wins on a day with a total above zero.
 * A missing or zero Apple day uses Garmin when Garmin has a figure. The two are never added.
 */
export function dailyActivitySeries(
  endDay: string,
  span: number,
  apple: readonly AppleDayValue[],
  garmin: ReadonlyMap<string, number>,
  labelFor: (day: string, value: number, source: ActivitySource | null) => string,
): DailyActivityPoint[] {
  const appleByDay = new Map<string, number>();
  for (const row of apple) {
    if (!(row.value > 0)) continue;
    appleByDay.set(row.day, (appleByDay.get(row.day) ?? 0) + row.value);
  }
  return chartDays(endDay, span).map((day) => {
    const appleValue = appleByDay.get(day);
    if (appleValue != null && appleValue > 0) {
      const value = Math.round(appleValue);
      return { day, value, source: 'apple' as const, label: labelFor(day, value, 'apple') };
    }
    if (garmin.has(day)) {
      const value = garmin.get(day) ?? 0;
      return { day, value, source: 'garmin' as const, label: labelFor(day, value, 'garmin') };
    }
    return { day, value: 0, source: null, label: labelFor(day, 0, null) };
  });
}

export function exerciseMinutesLabel(
  day: string,
  minutes: number,
  source: ActivitySource | null,
  parts?: { moderate: number; vigorous: number },
): string {
  const name = activityDayName(day);
  if (source == null) return `No exercise minutes for ${name}.`;
  if (source === 'apple') return `Exercise minutes, ${name}: ${minutes} min. Apple Health. Not doubled.`;
  const moderate = parts?.moderate ?? 0;
  const vigorous = parts?.vigorous ?? 0;
  return `Exercise minutes, ${name}: ${minutes} min. Garmin. ${moderate} moderate and ${vigorous} vigorous, vigorous counted twice.`;
}

/** The line under Exercise minutes. It names only the sources that have a bar. */
export function exerciseChartCaption(
  points: readonly { value: number; source: ActivitySource | null }[],
): string | null {
  let apple = false;
  let garmin = false;
  for (const point of points) {
    if (point.source == null || !(point.value > 0)) continue;
    if (point.source === 'apple') apple = true;
    if (point.source === 'garmin') garmin = true;
  }
  if (apple && garmin) return EXERCISE_BOTH_CAPTION;
  if (garmin) return EXERCISE_GARMIN_CAPTION;
  if (apple) return EXERCISE_APPLE_CAPTION;
  return null;
}

export function activeCaloriesLabel(day: string, kcal: number, source: ActivitySource | null): string {
  const line = `Active calories, ${activityDayName(day)}: ${kcal} kcal`;
  if (source === 'garmin') return `${line} ${GARMIN_CALORIE_SOURCE}`;
  if (source === 'apple') return `${line} ${APPLE_SOURCE}`;
  return line;
}

/**
 * Caption for the days that actually have a number.
 * A zero or a Garmin row that was not used does not count.
 */
export function chartSourceCaption(
  points: readonly { value: number; source: ActivitySource | null }[],
  options?: { vigorous?: boolean; includeZero?: boolean },
): string | null {
  let apple = false;
  let garmin = false;
  for (const point of points) {
    if (point.source == null || !Number.isFinite(point.value)) continue;
    if (!options?.includeZero && !(point.value > 0)) continue;
    if (point.source === 'apple') apple = true;
    if (point.source === 'garmin') garmin = true;
  }
  if (apple && garmin) {
    return options?.vigorous ? '(Apple Health and Garmin, vigorous counted twice)' : APPLE_AND_GARMIN_SOURCE;
  }
  if (garmin) return options?.vigorous ? GARMIN_EXERCISE_SOURCE : GARMIN_SOURCE;
  if (apple) return APPLE_SOURCE;
  return null;
}

export function exerciseSeries(
  endDay: string,
  span: number,
  apple: readonly AppleDayValue[],
  dailies: readonly GarminDaily[],
): DailyActivityPoint[] {
  const garmin = new Map<string, number>();
  const parts = new Map<string, { moderate: number; vigorous: number }>();
  for (const daily of dailies) {
    const minutes = garminExerciseMinutes(daily.moderateMinutes, daily.vigorousMinutes);
    if (minutes == null || minutes <= 0) continue;
    garmin.set(daily.calendarDate, minutes);
    parts.set(daily.calendarDate, {
      moderate: Math.round(daily.moderateMinutes ?? 0),
      vigorous: Math.round(daily.vigorousMinutes ?? 0),
    });
  }
  return dailyActivitySeries(endDay, span, apple, garmin, (day, value, source) => (
    exerciseMinutesLabel(day, value, source, source === 'garmin' ? parts.get(day) : undefined)
  ));
}

/** Garmin moderate or vigorous minutes, one for one. A missing number is an empty slot. A stored 0 is a zero bar. */
export function garminMinuteSeries(
  endDay: string,
  span: number,
  dailies: readonly GarminDaily[],
  kind: 'moderate' | 'vigorous',
): DailyActivityPoint[] {
  const stored = new Map<string, number>();
  for (const daily of dailies) {
    const raw = kind === 'moderate' ? daily.moderateMinutes : daily.vigorousMinutes;
    if (raw == null || !Number.isFinite(raw) || raw < 0) continue;
    stored.set(daily.calendarDate, Math.round(raw));
  }
  const title = kind === 'moderate' ? 'Moderate minutes' : 'Vigorous minutes';
  return chartDays(endDay, span).map((day) => {
    const value = stored.get(day);
    if (value == null) {
      const missing = kind === 'moderate'
        ? `No Garmin moderate minutes for ${activityDayName(day)}. Apple exercise time is on Exercise minutes.`
        : `No Garmin vigorous minutes for ${activityDayName(day)}. Apple exercise time is on Exercise minutes.`;
      return { day, value: 0, source: null, empty: true, label: missing };
    }
    return {
      day,
      value,
      source: 'garmin' as const,
      empty: false,
      label: `${title}, ${activityDayName(day)}: ${value} min. Garmin.`,
    };
  });
}

export function minuteTypeEmpty(kind: 'moderate' | 'vigorous'): string {
  return kind === 'moderate' ? MODERATE_EMPTY : VIGOROUS_EMPTY;
}

export function calorieSeries(
  endDay: string,
  span: number,
  apple: readonly AppleDayValue[],
  dailies: readonly GarminDaily[],
): DailyActivityPoint[] {
  const garmin = new Map<string, number>();
  for (const daily of dailies) {
    const kcal = garminActiveKcal(daily.activeKilocalories);
    if (kcal == null || kcal <= 0) continue;
    garmin.set(daily.calendarDate, kcal);
  }
  return dailyActivitySeries(endDay, span, apple, garmin, activeCaloriesLabel);
}

export function mostInOneDay(points: readonly { value: number }[], unit: string): string | null {
  const most = points.reduce((max, point) => Math.max(max, point.value), 0);
  if (most <= 0) return null;
  return `Most in one day ${most} ${unit}`;
}

export function appleDayValues(
  samples: readonly { kind: string; value: number; recordedOn: string }[],
  kind: string,
): AppleDayValue[] {
  return samples.flatMap((sample) => {
    if (sample.kind !== kind || !(sample.value > 0)) return [];
    const day = sample.recordedOn.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
    return [{ day, value: sample.value }];
  });
}

function sourced(name: string, day: string, value: string, unit: string, source: ActivitySource | null): string {
  return withSource(`${name}, ${activityDayName(day)}: ${value} ${unit}`, source);
}

function withSource(line: string, source: ActivitySource | null): string {
  if (source === 'apple') return `${line} ${APPLE_SOURCE}`;
  if (source === 'garmin') return `${line} ${GARMIN_SOURCE}`;
  return line;
}

function garminNumber(dailies: readonly GarminDaily[], pick: (daily: GarminDaily) => number | null | undefined): Map<string, number> {
  const garmin = new Map<string, number>();
  for (const daily of dailies) {
    const value = pick(daily);
    if (value == null || !Number.isFinite(value) || value <= 0) continue;
    garmin.set(daily.calendarDate, Math.round(value));
  }
  return garmin;
}

export function stepsSeries(
  endDay: string,
  span: number,
  apple: readonly AppleDayValue[],
  dailies: readonly GarminDaily[],
): DailyActivityPoint[] {
  return dailyActivitySeries(endDay, span, apple, garminNumber(dailies, (daily) => daily.steps), (day, value, source) => {
    if (day === endDay && !(value > 0)) return NO_STEPS_YET_TODAY;
    return sourced('Steps', day, value.toLocaleString('en-GB'), 'steps', source);
  });
}

export function distanceText(metres: number): string {
  if (metres >= 1000) {
    const km = Math.round(metres / 100) / 10;
    return `${Number.isInteger(km) ? String(km) : km.toFixed(1)} km`;
  }
  return `${Math.round(metres)} m`;
}

export function distanceSeries(
  endDay: string,
  span: number,
  dailies: readonly GarminDaily[],
  apple: readonly AppleDayValue[] = [],
): DailyActivityPoint[] {
  return dailyActivitySeries(endDay, span, apple, garminNumber(dailies, (daily) => daily.distanceMetres), (day, value, source) => (
    withSource(`Distance, ${activityDayName(day)}: ${distanceText(value)}`, source)
  ));
}

export function floorsSeries(
  endDay: string,
  span: number,
  dailies: readonly GarminDaily[],
  apple: readonly AppleDayValue[] = [],
): DailyActivityPoint[] {
  return dailyActivitySeries(endDay, span, apple, garminNumber(dailies, (daily) => daily.floorsClimbed), (day, value, source) => (
    sourced('Floors', day, String(value), 'floors', source)
  ));
}

export function restingSeries(
  endDay: string,
  span: number,
  apple: readonly AppleDayValue[],
  dailies: readonly GarminDaily[],
): DailyActivityPoint[] {
  return dailyActivitySeries(endDay, span, apple, garminNumber(dailies, (daily) => daily.restingHeartRateBpm), (day, value, source) => (
    sourced('Resting heart rate', day, String(value), 'bpm', source)
  ));
}

export function seriesHasValue(points: readonly { value: number }[]): boolean {
  return points.some((point) => point.value > 0);
}

export function garminLatestLines(input: {
  dailies: readonly GarminDaily[];
  sleep: readonly { calendarDate: string; sleepScore: number | null }[];
  respiration: readonly { calendarDate: string; averageBreathsPerMinute: number | null }[];
  pulseOx: readonly { calendarDate: string; averageSpo2: number | null }[];
  hrv: readonly { calendarDate: string; lastNightAvgMs: number | null }[];
}): string[] {
  const daily = [...input.dailies].sort((left, right) => left.calendarDate.localeCompare(right.calendarDate)).at(-1) ?? null;
  const lines: string[] = [];
  const push = (name: string, day: string, value: string, unit: string) => {
    lines.push(`${name}, ${activityDayName(day)}: ${value} ${unit} ${GARMIN_SOURCE}`);
  };
  if (daily?.stepGoal != null) push('Step goal', daily.calendarDate, daily.stepGoal.toLocaleString('en-GB'), 'steps');
  if (daily?.averageStressLevel != null) push('Average stress', daily.calendarDate, String(daily.averageStressLevel), 'score');
  if (daily?.bodyBatteryCharged != null) push('Body battery charged', daily.calendarDate, String(daily.bodyBatteryCharged), 'score');
  if (daily?.bodyBatteryDrained != null) push('Body battery drained', daily.calendarDate, String(daily.bodyBatteryDrained), 'score');
  if (daily?.bodyBatteryHighest != null) push('Body battery highest', daily.calendarDate, String(daily.bodyBatteryHighest), 'score');
  if (daily?.bodyBatteryLowest != null) push('Body battery lowest', daily.calendarDate, String(daily.bodyBatteryLowest), 'score');
  const night = [...input.sleep].filter((row) => row.sleepScore != null).sort((left, right) => left.calendarDate.localeCompare(right.calendarDate)).at(-1);
  if (night?.sleepScore != null) push('Sleep score', night.calendarDate, String(night.sleepScore), 'score');
  const breath = [...input.respiration].filter((row) => row.averageBreathsPerMinute != null).sort((left, right) => left.calendarDate.localeCompare(right.calendarDate)).at(-1);
  if (breath?.averageBreathsPerMinute != null) push('Respiration', breath.calendarDate, String(breath.averageBreathsPerMinute), 'breaths/min');
  const oxygen = [...input.pulseOx].filter((row) => row.averageSpo2 != null).sort((left, right) => left.calendarDate.localeCompare(right.calendarDate)).at(-1);
  if (oxygen?.averageSpo2 != null) push('Pulse ox', oxygen.calendarDate, String(oxygen.averageSpo2), '%');
  const hrv = [...input.hrv].filter((row) => row.lastNightAvgMs != null).sort((left, right) => left.calendarDate.localeCompare(right.calendarDate)).at(-1);
  if (hrv?.lastNightAvgMs != null) push('Overnight HRV', hrv.calendarDate, String(hrv.lastNightAvgMs), 'ms');
  return lines;
}

export function seriesUsesGarmin(points: readonly { source: ActivitySource | null }[]): boolean {
  return points.some((point) => point.source === 'garmin');
}
