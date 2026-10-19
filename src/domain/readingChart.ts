import { shiftDay } from '@/domain/healthInsights';
import { periodDayCount, type StatPeriod } from '@/domain/statWindow';

export type ChartPoint = { day: string; value: number };
export type ChartAggregate = 'mean' | 'sum';
export type ChartBucket = 'day' | 'week' | 'month';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Daily through 90 days, weekly for 6 months, monthly for 12 months. */
export function chartBucketForPeriod(period: StatPeriod): ChartBucket {
  const days = periodDayCount(period);
  if (days <= 90) return 'day';
  if (days <= 200) return 'week';
  return 'month';
}

export function chartBucketCaption(bucket: ChartBucket, aggregate: ChartAggregate): string {
  if (bucket === 'day') return 'Oldest to newest.';
  const grain = bucket === 'week' ? 'Weekly' : 'Monthly';
  const kind = aggregate === 'sum' ? 'totals' : 'averages';
  return `${grain} ${kind}. Oldest to newest.`;
}

/** Real readings only. A day, week, or month with nothing is left out. */
export function bucketChartPoints(
  points: readonly ChartPoint[],
  bucket: ChartBucket,
  aggregate: ChartAggregate,
): ChartPoint[] {
  const groups = new Map<string, number[]>();
  for (const point of points) {
    if (!Number.isFinite(point.value)) continue;
    const key = bucketKey(point.day, bucket);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(point.value);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : 1))
    .map(([day, values]) => ({
      day,
      value: roundChart(aggregate === 'sum' ? values.reduce((sum, value) => sum + value, 0) : values.reduce((sum, value) => sum + value, 0) / values.length),
    }));
}

export function chartExtent(points: readonly ChartPoint[]): { latest: ChartPoint; min: number; max: number } | null {
  if (points.length === 0) return null;
  const latest = points[points.length - 1];
  if (!latest) return null;
  let min = latest.value;
  let max = latest.value;
  for (const point of points) {
    if (point.value < min) min = point.value;
    if (point.value > max) max = point.value;
  }
  return { latest, min, max };
}

/** Three to five ticks that cover the readings. A flat line still has room above and below. */
export function yAxisTicks(values: readonly number[]): number[] {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return [];
  let low = Math.min(...finite);
  let high = Math.max(...finite);
  if (low === high) {
    const pad = low === 0 ? 1 : Math.max(Math.abs(low) * 0.1, 1);
    low -= pad;
    high += pad;
  }
  let step = niceStep((high - low) / 3);
  let ticks = ticksBetween(low, high, step);
  if (ticks.length < 3) {
    step = niceStep((high - low) / 2);
    ticks = ticksBetween(low, high, step);
  }
  let guard = 0;
  while (ticks.length > 5 && guard < 6) {
    step = niceStep(step * 2);
    ticks = ticksBetween(low, high, step);
    guard += 1;
  }
  if (ticks.length < 3) return [roundTick(low), roundTick((low + high) / 2), roundTick(high)];
  return ticks;
}

export function formatAxisNumber(value: number): string {
  const rounded = roundTick(value);
  const digits = Number.isInteger(rounded) ? 0 : 1;
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(rounded);
}

export function formatChartValue(value: number, unit: string): string {
  const text = formatAxisNumber(value);
  return unit ? `${text} ${unit}` : text;
}

export function formatChartDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/** UK labels for the window: weekdays, '19 Oct', 'Oct', or 'Oct 26'. */
export function xAxisTicks(start: string, end: string): { day: string; label: string }[] {
  const span = Math.max(1, daySpan(start, end));
  if (span <= 7) {
    return Array.from({ length: span }, (_, index) => {
      const day = shiftDay(start, index);
      return { day, label: WEEKDAYS[utcWeekday(day)] ?? '' };
    });
  }
  const count = span <= 31 ? 4 : 5;
  const days: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = Math.round((index * (span - 1)) / (count - 1));
    days.push(shiftDay(start, offset));
  }
  const unique = [...new Set(days)];
  const crossYear = start.slice(0, 4) !== end.slice(0, 4);
  return unique.map((day) => ({ day, label: xLabel(day, span, crossYear) }));
}

export function daySpan(start: string, end: string): number {
  const [ay, am, ad] = start.split('-').map(Number);
  const [by, bm, bd] = end.split('-').map(Number);
  const from = Date.UTC(ay ?? 1970, (am ?? 1) - 1, ad ?? 1);
  const to = Date.UTC(by ?? 1970, (bm ?? 1) - 1, bd ?? 1);
  return Math.round((to - from) / 86_400_000) + 1;
}

function xLabel(day: string, span: number, crossYear: boolean): string {
  const month = MONTHS[(Number(day.slice(5, 7)) || 1) - 1] ?? '';
  if (span > 120) return crossYear ? `${month} ${day.slice(2, 4)}` : month;
  const text = `${Number(day.slice(8, 10))} ${month}`;
  return crossYear ? `${text} ${day.slice(2, 4)}` : text;
}

function bucketKey(day: string, bucket: ChartBucket): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (bucket === 'day') return day;
  if (bucket === 'month') return `${day.slice(0, 7)}-01`;
  const weekday = utcWeekday(day);
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return shiftDay(day, delta);
}

function utcWeekday(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1)).getUTCDay();
}

function niceStep(rough: number): number {
  if (!(rough > 0) || !Number.isFinite(rough)) return 1;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / pow;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * pow;
}

function ticksBetween(low: number, high: number, step: number): number[] {
  if (!(step > 0)) return [];
  const start = Math.floor(low / step) * step;
  const end = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step * 0.001 && ticks.length < 8; value += step) {
    ticks.push(roundTick(value));
  }
  return ticks;
}

function roundTick(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundChart(value: number): number {
  return Math.round(value * 10) / 10;
}
