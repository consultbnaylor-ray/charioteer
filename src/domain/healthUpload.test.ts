import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { NewHealthSample } from '@/data/types';
import {
  APPLE_HEALTH_READ_ERROR,
  HEALTH_UPLOAD_CHUNK,
  HEALTH_UPLOAD_DAYS,
  chunkHealthRows,
  healthRefreshLogLine,
  healthRowsToUpload,
  shiftIsoDay,
} from './healthUpload';

function sample(day: string, value: number, extra: Partial<NewHealthSample> = {}): NewHealthSample {
  return { kind: 'steps', value, unit: 'steps', recordedOn: day, source: 'healthkit', ...extra };
}

describe('health refresh upload', () => {
  it('sends the full read once, then only new or changed rows from the last 14 days, in chunks of 300', () => {
    const today = '2026-10-21';
    const year = Array.from({ length: 650 }, (_, index) => sample(shiftIsoDay('2024-01-01', index), index + 1));
    const first = healthRowsToUpload(year, { firstImport: true, today, stored: [] });
    expect(first).toHaveLength(650);
    expect(HEALTH_UPLOAD_DAYS).toBe(14);
    expect(HEALTH_UPLOAD_CHUNK).toBe(300);
    expect(chunkHealthRows(first).map((chunk) => chunk.length)).toEqual([300, 300, 50]);

    const earliest = shiftIsoDay(today, 1 - HEALTH_UPLOAD_DAYS);
    expect(earliest).toBe('2026-10-08');
    const stored = [sample('2026-10-21', 10), sample('2026-10-20', 8), sample(earliest, 4, { unit: 'count' })];
    const next = healthRowsToUpload([
      sample('2026-10-21', 10),
      sample('2026-10-20', 9),
      sample('2026-10-19', 4),
      sample(earliest, 4),
      sample('2026-10-07', 3),
      sample('2026-10-01', 99),
    ], { firstImport: false, today, stored });
    expect(next.map((row) => `${row.recordedOn}:${row.value}:${row.unit}`)).toEqual([
      '2026-10-20:9:steps',
      '2026-10-19:4:steps',
      '2026-10-08:4:steps',
    ]);
  });

  it('names a Health read failure and logs the step and error type without the values', () => {
    expect(APPLE_HEALTH_READ_ERROR).toBe("Apple Health couldn't be read");
    const line = healthRefreshLogLine('read', new Error('HKError timeout reading 8421 steps, heart 72'));
    expect(line).toBe('read: timeout');
    expect(line).not.toMatch(/\d|steps|heart/);
    expect(healthRefreshLogLine('upload', new Error('The request timed out'))).toBe('upload: offline');
    const refresh = readFileSync('src/health/catchUp.ts', 'utf8');
    const readTry = refresh.indexOf('await reportHealthRefresh(repo, \'read\'');
    const uploadTry = refresh.indexOf('await reportHealthRefresh(repo, \'upload\'');
    expect(readTry).toBeGreaterThan(0);
    expect(uploadTry).toBeGreaterThan(readTry);
    expect(refresh).toContain('healthRowsToUpload');
    expect(refresh).toContain('APPLE_HEALTH_READ_ERROR');
    expect(refresh).not.toMatch(/logClientError\([^)]*samples|logClientError\([^)]*value/);
    const screen = readFileSync('src/app/(main)/health.tsx', 'utf8');
    expect(screen).toContain('refreshAppleHealth(repo)');
    expect(screen).not.toContain('saveHealth(result.samples)');
  });
});
