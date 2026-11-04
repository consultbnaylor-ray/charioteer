import { type FitnessGoal } from './fitnessGoal.ts';
import { VO2_WEEKLY_GAIN, athleticVo2Target, vo2ForFitnessGoal } from './fitnessSnapshot.ts';
import type { NutritionGoal, NutritionSex } from './nutrition.ts';
import { addIsoDays, formatIsoDay, isoDaysBetween, roundKg } from './targetWeight.ts';

export type DatedValue = { day: string; value: number };

export type GoalProgressSeries = {
  start: string;
  end: string;
  weightActual: DatedValue[];
  vo2Actual: DatedValue[];
  /** Straight path when a target weight and a target date are both set. */
  weightPath: DatedValue[] | null;
  /** Straight path to the dated VO2 target. It starts at the latest reading. */
  vo2Path: DatedValue[] | null;
  weightTarget: number | null;
  /** The level the dashed path aims at by the target date, after the weekly cap. */
  vo2Target: number | null;
  /** The published long-term level. Same as vo2Target when the date can reach it. */
  vo2LongTerm: number | null;
  /** Set when the date cannot reach the long-term level at the weekly cap. */
  vo2Note: string | null;
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
  straight = false,
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
    if (straight) {
      d += ` L ${place(point)}`;
      continue;
    }
    const x1 = xFor(previous.day);
    const y1 = yFor(previous.value);
    const x2 = xFor(point.day);
    const y2 = yFor(point.value);
    const mid = (x1 + x2) / 2;
    d += ` C ${roundCoord(mid)} ${roundCoord(y1)}, ${roundCoord(mid)} ${roundCoord(y2)}, ${roundCoord(x2)} ${roundCoord(y2)}`;
  }
  return d;
}

export type Vo2ChartSource = 'garmin' | 'apple';

export type Vo2ChartPoint = DatedValue & { source: Vo2ChartSource };

const MERGED_VO2 = 'merged:vo2_max:';

/**
 * One real VO2 max a day. No filled days and no cycling estimate.
 * Garmin's running value wins on a day that has one. Apple Health is kept on the other days.
 * Several Apple samples on one day keep the latest timestamp.
 */
export function chartVo2Readings(input: {
  apple: readonly { recordedOn: string; value: number; id?: string | null }[];
  garmin: readonly { day: string; value: number | null | undefined }[];
}): { points: Vo2ChartPoint[]; sourceLabel: string | null } {
  const apple = new Map<string, { at: string; value: number }>();
  const garmin = new Map<string, number>();
  for (const row of input.garmin) {
    if (row.value == null || !(row.value > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(row.day)) continue;
    garmin.set(row.day, Math.round(row.value * 10) / 10);
  }
  for (const row of input.apple) {
    if (!(row.value > 0)) continue;
    const day = row.recordedOn.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const value = Math.round(row.value * 10) / 10;
    if (row.id?.startsWith(MERGED_VO2)) {
      if (!garmin.has(day)) garmin.set(day, value);
      continue;
    }
    const previous = apple.get(day);
    if (!previous || row.recordedOn >= previous.at) apple.set(day, { at: row.recordedOn, value });
  }
  const points: Vo2ChartPoint[] = [...new Set([...apple.keys(), ...garmin.keys()])].sort().map((day) => {
    const watch = garmin.get(day);
    if (watch != null) return { day, value: watch, source: 'garmin' as const };
    return { day, value: apple.get(day)?.value ?? 0, source: 'apple' as const };
  }).filter((point) => point.value > 0);
  const sources = new Set(points.map((point) => point.source));
  const sourceLabel = sources.size === 0
    ? null
    : sources.size === 2
      ? 'Garmin and Apple Health. A day with a Garmin running VO2 max uses that. Apple Health is kept on days Garmin has none. Cycling VO2 max is not used.'
      : sources.has('garmin')
        ? 'Garmin running VO2 max. Cycling VO2 max is not used.'
        : 'Apple Health VO2 max.';
  return { points, sourceLabel };
}

/** The long-term level, or as far as VO2_WEEKLY_GAIN can go before the target date. */
export function pacedVo2Target(input: {
  longTerm: number;
  current: number | null;
  today: string;
  targetOn: string | null;
}): { byDate: number; limited: boolean } {
  if (input.current == null || !(input.current > 0) || input.targetOn == null || input.targetOn <= input.today) {
    return { byDate: input.longTerm, limited: false };
  }
  if (input.current >= input.longTerm) return { byDate: input.longTerm, limited: false };
  const weeks = Math.max(1, isoDaysBetween(input.today, input.targetOn)) / 7;
  const byDate = Math.round((input.current + VO2_WEEKLY_GAIN * weeks) * 10) / 10;
  if (byDate >= input.longTerm) return { byDate: input.longTerm, limited: false };
  return { byDate, limited: true };
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
  age?: number | null;
  fitnessGoal?: FitnessGoal | null;
  weight: readonly { day: string; kg: number }[];
  vo2: readonly DatedValue[];
  weightTargetKg: number | null;
  weightStartKg: number | null;
}): GoalProgressSeries {
  const weightActual = clean(input.weight.map((row) => ({ day: row.day, value: row.kg })));
  const vo2Actual = clean(input.vo2);
  const fromAge = input.fitnessGoal ? vo2ForFitnessGoal(input.age ?? null, input.sex, input.fitnessGoal) : null;
  const vo2Band = athleticVo2Target(input.goal, input.sex);
  const vo2LongTerm = fromAge?.target ?? (vo2Band ? vo2Band.low : null);
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
  const pace = vo2LongTerm == null
    ? null
    : pacedVo2Target({
      longTerm: vo2LongTerm,
      current: lastVo2?.value ?? null,
      today: input.today,
      targetOn: dated ? input.targetOn : null,
    });
  const vo2Target = pace?.byDate ?? null;
  const vo2End = dated ? input.targetOn as string : lastVo2?.day ?? null;
  const vo2Path = vo2Target != null && lastVo2 && vo2End
    ? dated
      ? [
        { day: lastVo2.day, value: lastVo2.value },
        { day: vo2End, value: vo2Target },
      ]
      : [
        { day: firstVo2?.day ?? lastVo2.day, value: vo2Target },
        { day: lastVo2.day, value: vo2Target },
      ]
    : null;
  const vo2Note = pace?.limited && input.targetOn
    ? `By ${formatIsoDay(input.targetOn)}, about ${vo2Target} ml/kg/min. The long-term level is ${vo2LongTerm} ml/kg/min. The rise is capped at ${VO2_WEEKLY_GAIN} ml/kg/min a week.`
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
    vo2LongTerm,
    vo2Note,
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
