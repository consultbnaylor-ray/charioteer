import { athleticVo2Target } from './fitnessSnapshot.ts';
import type { NutritionGoal, NutritionSex } from './nutrition.ts';
import { addIsoDays, isoDaysBetween, roundKg } from './targetWeight.ts';

export type DatedValue = { day: string; value: number };

export type GoalProgressSeries = {
  start: string;
  end: string;
  weightActual: DatedValue[];
  vo2Actual: DatedValue[];
  /** Straight path when a target weight and a target date are both set. */
  weightPath: DatedValue[] | null;
  /** Straight path to the goal's VO2 target when a target date is set. */
  vo2Path: DatedValue[] | null;
  weightTarget: number | null;
  vo2Target: number | null;
};

/** One reading per day, oldest first. A later duplicate day replaces the earlier one. */
export function orderReadings(rows: readonly DatedValue[]): DatedValue[] {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day) || !(row.value > 0)) continue;
    byDay.set(row.day, row.value);
  }
  return [...byDay.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([day, value]) => ({ day, value }));
}

function clean(rows: readonly DatedValue[]): DatedValue[] {
  return orderReadings(rows);
}

/**
 * One SVG path through the readings in date order.
 * A single M, then one cubic per step. Unsorted or duplicate days still produce that one path.
 */
export function progressLinePath(
  points: readonly DatedValue[],
  xFor: (day: string) => number,
  yFor: (value: number) => number,
): string {
  const ordered = orderReadings(points);
  const first = ordered[0];
  if (!first) return '';
  const place = (point: DatedValue) => `${roundCoord(xFor(point.day))} ${roundCoord(yFor(point.value))}`;
  let d = `M ${place(first)}`;
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const point = ordered[index];
    if (!previous || !point) continue;
    const x1 = xFor(previous.day);
    const y1 = yFor(previous.value);
    const x2 = xFor(point.day);
    const y2 = yFor(point.value);
    const mid = (x1 + x2) / 2;
    d += ` C ${roundCoord(mid)} ${roundCoord(y1)}, ${roundCoord(mid)} ${roundCoord(y2)}, ${roundCoord(x2)} ${roundCoord(y2)}`;
  }
  return d;
}

function roundCoord(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 10) / 10);
}

function pathFrom(startDay: string, startValue: number, endDay: string, endValue: number): DatedValue[] {
  if (endDay <= startDay) return [{ day: startDay, value: roundKg(startValue) }, { day: endDay, value: roundKg(endValue) }];
  const span = Math.max(1, isoDaysBetween(startDay, endDay));
  const steps = Math.min(8, span);
  const points: DatedValue[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const day = addIsoDays(startDay, Math.round((span * index) / steps));
    const value = startValue + ((endValue - startValue) * index) / steps;
    if (points[points.length - 1]?.day === day) continue;
    points.push({ day, value: Math.round(value * 10) / 10 });
  }
  return points;
}

/** Weight and VO2 actuals, plus a dashed path only when that series has a target and a date. */
export function goalProgressSeries(input: {
  today: string;
  targetOn: string | null;
  goal: NutritionGoal | null;
  sex: NutritionSex | null;
  weight: readonly { day: string; kg: number }[];
  vo2: readonly DatedValue[];
  weightTargetKg: number | null;
  weightStartKg: number | null;
}): GoalProgressSeries {
  const weightActual = clean(input.weight.map((row) => ({ day: row.day, value: row.kg })));
  const vo2Actual = clean(input.vo2);
  const vo2Band = athleticVo2Target(input.goal, input.sex);
  const vo2Target = vo2Band ? vo2Band.low : null;
  const dated = input.targetOn != null && /^\d{4}-\d{2}-\d{2}$/.test(input.targetOn) && input.targetOn > input.today;
  const firstWeight = weightActual[0];
  const lastWeight = weightActual[weightActual.length - 1];
  const firstVo2 = vo2Actual[0];
  const lastVo2 = vo2Actual[vo2Actual.length - 1];
  const days = [...weightActual, ...vo2Actual].map((row) => row.day).sort();
  const start = days[0] ?? input.today;
  const end = dated && input.targetOn ? input.targetOn : (days[days.length - 1] ?? input.today);
  const weightPath = dated && input.weightTargetKg != null && (input.weightStartKg != null || lastWeight)
    ? pathFrom(
      input.weightStartKg != null && firstWeight ? firstWeight.day : (lastWeight?.day ?? input.today),
      input.weightStartKg ?? lastWeight?.value ?? input.weightTargetKg,
      input.targetOn as string,
      input.weightTargetKg,
    )
    : null;
  const vo2Path = dated && vo2Target != null && lastVo2
    ? pathFrom(firstVo2?.day ?? lastVo2.day, firstVo2?.value ?? lastVo2.value, input.targetOn as string, vo2Target)
    : null;
  return {
    start,
    end,
    weightActual,
    vo2Actual,
    weightPath,
    vo2Path,
    weightTarget: input.weightTargetKg,
    vo2Target,
  };
}

export function chartScale(values: readonly number[]): { low: number; high: number } {
  if (!values.length) return { low: 0, high: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 0.8) return { low: min - 1, high: max + 1 };
  const pad = (max - min) * 0.12;
  return { low: min - pad, high: max + pad };
}
