import type { NewHealthSample } from '@/data/types';
import { isTransientNetworkError, UserFacingError } from '@/domain/errors';

/** Calendar days sent after the first full import. The active-energy average uses this same span. */
export const HEALTH_UPLOAD_DAYS = 14;

/** Rows in one health_samples upsert. A repeat of a chunk is the same write. */
export const HEALTH_UPLOAD_CHUNK = 300;

export const APPLE_HEALTH_READ_ERROR = "Apple Health couldn't be read";

export type HealthUploadRow = Pick<NewHealthSample, 'kind' | 'value' | 'unit' | 'recordedOn' | 'source'>;

export function shiftIsoDay(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(year, (month ?? 1) - 1, date ?? 1));
  utc.setUTCDate(utc.getUTCDate() + delta);
  return utc.toISOString().slice(0, 10);
}

export function inHealthUploadWindow(day: string, today: string, firstImport: boolean): boolean {
  if (firstImport) return true;
  const earliest = shiftIsoDay(today, 1 - HEALTH_UPLOAD_DAYS);
  return day >= earliest && day <= today;
}

function rowKey(row: HealthUploadRow): string {
  return `${row.kind}|${row.recordedOn}|${row.source}`;
}

/**
 * The first import sends every row. Later imports send the last 14 days,
 * and only a row that is new or whose value or unit changed.
 */
export function healthRowsToUpload<T extends HealthUploadRow>(
  samples: readonly T[],
  options: { firstImport: boolean; today: string; stored: readonly HealthUploadRow[] },
): T[] {
  const windowed = samples.filter((row) => inHealthUploadWindow(row.recordedOn, options.today, options.firstImport));
  if (options.firstImport) return [...windowed];
  const stored = new Map(options.stored.map((row) => [rowKey(row), row]));
  return windowed.filter((row) => {
    const previous = stored.get(rowKey(row));
    return previous == null || previous.value !== row.value || previous.unit !== row.unit;
  });
}

export function chunkHealthRows<T>(rows: readonly T[], size = HEALTH_UPLOAD_CHUNK): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) chunks.push(rows.slice(start, start + size));
  return chunks;
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return '';
}

/** `read: timeout` or `upload: offline`. The Health values stay out of the log. */
export function healthRefreshLogLine(step: 'read' | 'upload', error: unknown): string {
  let type = 'error';
  if (error instanceof UserFacingError && error.code === 'offline') type = 'offline';
  else if (isTransientNetworkError(error)) type = 'offline';
  else if (/timeout/i.test(errorText(error))) type = 'timeout';
  else if (error instanceof Error && error.name && error.name !== 'Error') type = error.name.replace(/[^A-Za-z]/g, '').slice(0, 40) || 'error';
  return `${step}: ${type}`;
}
