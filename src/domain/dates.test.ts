import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { clampToPast, formatUkCompact, formatUkDate, formatUkLong, formatUkLongWhen, formatUkWhen, isoDay, parseIsoDay } from './dates';

const tenth = new Date(2026, 9, 10, 18, 5);
const eleventh = new Date(2026, 6, 11, 9, 0);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
  });
}

describe('UK dates', () => {
  it('formats a local day in long, weekday, and compact forms', () => {
    expect(formatUkLong(tenth)).toBe('10 October 2026');
    expect(formatUkDate(tenth)).toBe('Sat 10 Oct 2026');
    expect(formatUkCompact(tenth)).toBe('10 Oct 2026');
    expect(formatUkWhen(tenth)).toBe('Sat 10 Oct 2026, 18:05');
    expect(formatUkLongWhen(new Date(2026, 9, 11, 9, 10))).toBe('11 October 2026 09:10');
  });

  it('writes 11 July 2026 in long form and 11 Jul 2026 when space is tight', () => {
    expect(formatUkLong(eleventh)).toBe('11 July 2026');
    expect(formatUkCompact(eleventh)).toBe('11 Jul 2026');
    expect(formatUkLong(eleventh)).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(formatUkCompact(eleventh)).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('reads a stored calendar day without shifting it, and keeps ISO for storage only', () => {
    expect(formatUkLong(parseIsoDay('2026-10-10'))).toBe('10 October 2026');
    expect(formatUkDate('2026-10-10')).toBe('Sat 10 Oct 2026');
    expect(isoDay(parseIsoDay('2026-10-10'))).toBe('2026-10-10');
    expect(formatUkDate(tenth)).not.toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(formatUkCompact(tenth)).not.toContain('T');
  });

  it('does not format a calendar day as a numeric slash date', () => {
    const formatter = readFileSync('src/domain/dates.ts', 'utf8');
    expect(formatter).not.toContain("day: '2-digit', month: '2-digit'");
    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    const milestones = home.slice(home.indexOf('>Milestones'), home.lastIndexOf('CheckInWeek'));
    expect(milestones).toContain('formatUkLong');
    expect(milestones).not.toContain('formatUkCompact');
    const health = readFileSync('src/app/(main)/health.tsx', 'utf8');
    expect(health).toContain('formatUkLong');
    expect(health).not.toContain('formatUkCompact');
    const problems = files('src')
      .filter((path) => !path.endsWith('.test.ts'))
      .filter((path) => readFileSync(path, 'utf8').includes("day: '2-digit', month: '2-digit'"));
    expect(problems).toEqual([]);
  });

  it('refuses a day in the future', () => {
    const today = new Date(2026, 9, 10, 15, 0);
    expect(isoDay(clampToPast(new Date(2026, 9, 11, 9, 0), today))).toBe('2026-10-10');
    expect(isoDay(clampToPast(new Date(2026, 9, 2), today))).toBe('2026-10-02');
  });
});
