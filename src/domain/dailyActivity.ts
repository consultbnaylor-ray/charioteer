import type { GarminDaily } from '@/domain/garminConnect';
import { weekdayShort } from '@/domain/healthInsights';
import { chartDayLabel, chartDays, type WorkoutChartSpan } from '@/domain/workoutDay';

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

export type ActivitySource = 'apple' | 'garmin';

export type DailyActivityPoint = {
  day: string;
  value: number;
  source: ActivitySource | null;
  label: string;
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
  span: WorkoutChartSpan,
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

export function exerciseMinutesLabel(day: string, minutes: number, source: ActivitySource | null): string {
  const line = `Exercise minutes, ${activityDayName(day)}: ${minutes} min`;
  return source === 'garmin' ? `${line} ${GARMIN_EXERCISE_SOURCE}` : line;
}

export function activeCaloriesLabel(day: string, kcal: number, source: ActivitySource | null): string {
  const line = `Active calories, ${activityDayName(day)}: ${kcal} kcal`;
  return source === 'garmin' ? `${line} ${GARMIN_CALORIE_SOURCE}` : line;
}

export function exerciseSeries(
  endDay: string,
  span: WorkoutChartSpan,
  apple: readonly AppleDayValue[],
  dailies: readonly GarminDaily[],
): DailyActivityPoint[] {
  const garmin = new Map<string, number>();
  for (const daily of dailies) {
    const minutes = garminExerciseMinutes(daily.moderateMinutes, daily.vigorousMinutes);
    if (minutes == null) continue;
    garmin.set(daily.calendarDate, minutes);
  }
  return dailyActivitySeries(endDay, span, apple, garmin, exerciseMinutesLabel);
}

export function calorieSeries(
  endDay: string,
  span: WorkoutChartSpan,
  apple: readonly AppleDayValue[],
  dailies: readonly GarminDaily[],
): DailyActivityPoint[] {
  const garmin = new Map<string, number>();
  for (const daily of dailies) {
    const kcal = garminActiveKcal(daily.activeKilocalories);
    if (kcal == null) continue;
    garmin.set(daily.calendarDate, kcal);
  }
  return dailyActivitySeries(endDay, span, apple, garmin, activeCaloriesLabel);
}

export function mostInOneDay(points: readonly { value: number }[], unit: 'min' | 'kcal'): string | null {
  const most = points.reduce((max, point) => Math.max(max, point.value), 0);
  if (most <= 0) return null;
  return `Most in one day ${most} ${unit}`;
}

export function seriesUsesGarmin(points: readonly { source: ActivitySource | null }[]): boolean {
  return points.some((point) => point.source === 'garmin');
}
