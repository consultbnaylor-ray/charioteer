import { describe, expect, it } from 'vitest';

import { clampToPast, formatUkCompact, formatUkDate, formatUkLong, formatUkWhen, isoDay, parseIsoDay } from './dates';

const tenth = new Date(2026, 9, 10, 18, 5);

describe('UK dates', () => {
  it('formats a local day in long, weekday, and compact forms', () => {
    expect(formatUkLong(tenth)).toBe('10 October 2026');
    expect(formatUkDate(tenth)).toBe('Sat 10 Oct 2026');
    expect(formatUkCompact(tenth)).toBe('10/10/2026');
    expect(formatUkWhen(tenth)).toBe('Sat 10 Oct 2026, 18:05');
  });

  it('reads a stored calendar day without shifting it, and keeps ISO for storage only', () => {
    expect(formatUkLong(parseIsoDay('2026-10-10'))).toBe('10 October 2026');
    expect(formatUkDate('2026-10-10')).toBe('Sat 10 Oct 2026');
    expect(isoDay(parseIsoDay('2026-10-10'))).toBe('2026-10-10');
    expect(formatUkDate(tenth)).not.toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(formatUkCompact(tenth)).not.toContain('T');
  });

  it('refuses a day in the future', () => {
    const today = new Date(2026, 9, 10, 15, 0);
    expect(isoDay(clampToPast(new Date(2026, 9, 11, 9, 0), today))).toBe('2026-10-10');
    expect(isoDay(clampToPast(new Date(2026, 9, 2), today))).toBe('2026-10-02');
  });
});
