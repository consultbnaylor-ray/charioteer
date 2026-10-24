import { recentCheckInDays, type CheckInPoint } from '@/domain/checkIns';
import { dailyValues, seriesForWindow, type HealthPoint } from '@/domain/healthInsights';
import { nutritionTrendDays, weightPointsFrom, type FoodLog, type TrendDay } from '@/domain/nutrition';
import { ascendingByDay, type ChartPoint } from '@/domain/readingChart';
import { waistWindow } from '@/domain/weightEntry';

/** Health Stats, sleep, steps, heart rate, and the other sample charts. */
export function healthSampleChart(samples: readonly HealthPoint[], kind: string, today: string): ChartPoint[] {
  return ascendingByDay(dailyValues([...samples], kind).filter((point) => point.day <= today));
}

/** One health page chart for the selected number of days. */
export function healthWindowChart(
  samples: readonly HealthPoint[],
  kind: string,
  today: string,
  windowDays: number,
): ChartPoint[] {
  return ascendingByDay(seriesForWindow([...samples], kind, today, windowDays));
}

/** Nutrition weight chart. */
export function weightChart(
  samples: readonly { kind: string; value: number; recordedOn: string }[],
): ChartPoint[] {
  return weightPointsFrom(samples).map((point) => ({ day: point.day, value: point.kg }));
}

/** Logged calories and protein. Blank days stay off the line. */
export function loggedNutritionChart(days: readonly TrendDay[], pick: (day: TrendDay) => number): ChartPoint[] {
  return ascendingByDay(days.flatMap((day) => {
    if (!day.logged) return [];
    const value = pick(day);
    return value > 0 ? [{ day: day.day, value }] : [];
  }));
}

/** Mood, craving, and check-in lines. */
export function checkInChart(days: readonly { day: string; value: number | null }[]): ChartPoint[] {
  return ascendingByDay(days.flatMap((day) => (day.value == null || !Number.isFinite(day.value) ? [] : [{ day: day.day, value: day.value }])));
}

/** Check-in days from newest-first rows, still oldest on the left. */
export function checkInDayChart(checkIns: readonly CheckInPoint[], today: Date, count: number): ChartPoint[] {
  return checkInChart(recentCheckInDays([...checkIns], today, count).map((day) => ({ day: day.day, value: day.mood })));
}

/** Health Plan and Today fitness series. */
export function fitnessSeriesChart(points: readonly ChartPoint[]): ChartPoint[] {
  return ascendingByDay(points.filter((point) => Number.isFinite(point.value)));
}

/** Waist chart. The reading list under it stays newest first. */
export function waistChart(
  rows: readonly { recordedOn: string; waistCm: number | null; createdAt: string }[],
  today: string,
  windowDays: number,
): ChartPoint[] {
  return ascendingByDay(waistWindow(rows, today, windowDays).points.map((point) => ({ day: point.day, value: point.cm })));
}

/** Profile and public-profile shared health trends. */
export function profileTrendChart(points: readonly ChartPoint[]): ChartPoint[] {
  return ascendingByDay(points.filter((point) => Number.isFinite(point.value)));
}

/** Stats overview weight and lean lines. */
export function overviewLineChart(points: readonly ChartPoint[]): ChartPoint[] {
  return profileTrendChart(points);
}

/** Stats overview mood and craving lines. */
export function overviewScoreChart(days: readonly { day: string; value: number | null }[]): ChartPoint[] {
  return checkInChart(days);
}

/** Sparklines and mini trends. Values follow the day order. */
export function sparklineFromDays(points: readonly ChartPoint[]): number[] {
  return ascendingByDay(points.filter((point) => Number.isFinite(point.value))).map((point) => point.value);
}

/** Body fat, waist, and lean mass rows. */
export function bodyCompositionChart(
  rows: readonly { recordedOn: string; value: number | null }[],
): ChartPoint[] {
  return ascendingByDay(rows.flatMap((row) => {
    if (row.value == null || !Number.isFinite(row.value)) return [];
    return [{ day: row.recordedOn.slice(0, 10), value: row.value }];
  }));
}

/** Meal-logging dots, oldest day on the left. */
export function loggingChart<T extends { day: string }>(dots: readonly T[]): T[] {
  return ascendingByDay(dots);
}

/** Logged nutrition days from a newest-first food log. */
export function nutritionTrendChart(logs: readonly FoodLog[], today: string, span: number, pick: (day: TrendDay) => number): ChartPoint[] {
  return loggedNutritionChart(nutritionTrendDays(logs, today, span), pick);
}
