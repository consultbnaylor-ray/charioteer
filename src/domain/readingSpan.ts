import { formatAxisNumber } from '@/domain/readingChart';

export type ReadingPoint = { day: string; value: number };

export type ReadingSpan = {
  latest: ReadingPoint;
  lowest: ReadingPoint;
  highest: ReadingPoint;
};

export type ReadingHeadlines = {
  latest: string;
  lowest: string;
  highest: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Latest, lowest, and highest reading inside an inclusive day range.
 * A tie keeps the earliest day. The latest reading is the newest day,
 * and the later sample when one day has more than one.
 * Readings outside the range, and values that are not finite, are left out.
 */
export function readingSpan(
  points: readonly ReadingPoint[],
  range?: { start: string; end: string },
): ReadingSpan | null {
  const start = range ? (range.start <= range.end ? range.start : range.end) : null;
  const end = range ? (range.start <= range.end ? range.end : range.start) : null;
  const rows = points.flatMap((point, index) => {
    if (!Number.isFinite(point.value)) return [];
    if (start && (point.day < start || point.day > end!)) return [];
    return [{ day: point.day, value: point.value, index }];
  });
  if (rows.length === 0) return null;
  rows.sort((left, right) => (left.day < right.day ? -1 : left.day > right.day ? 1 : left.index - right.index));
  const latest = rows[rows.length - 1]!;
  let lowest = rows[0]!;
  let highest = rows[0]!;
  for (const point of rows) {
    if (point.value < lowest.value) lowest = point;
    if (point.value > highest.value) highest = point;
  }
  return {
    latest: { day: latest.day, value: latest.value },
    lowest: { day: lowest.day, value: lowest.value },
    highest: { day: highest.day, value: highest.value },
  };
}

/** UK day and month. The year is added when it is not the reference year. */
export function readingDayLabel(iso: string, today: string): string {
  const day = Number(iso.slice(8, 10));
  const month = MONTHS[(Number(iso.slice(5, 7)) || 1) - 1] ?? '';
  if (iso.slice(0, 4) === today.slice(0, 4)) return `${day} ${month}`;
  return `${day} ${month} ${iso.slice(0, 4)}`;
}

/** Kilograms keep one decimal. Other units follow the chart axis. */
export function formatSpanAmount(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;
  const text = unit === 'kg' ? rounded.toFixed(1) : formatAxisNumber(rounded);
  return unit ? `${text} ${unit}` : text;
}

export function formatReadingSpan(span: ReadingSpan, unit: string, today: string): ReadingHeadlines {
  const line = (name: string, point: ReadingPoint) => (
    `${name} ${formatSpanAmount(point.value, unit)} on ${readingDayLabel(point.day, today)}`
  );
  return {
    latest: line('Latest', span.latest),
    lowest: line('Lowest', span.lowest),
    highest: line('Highest', span.highest),
  };
}
