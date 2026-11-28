import { describe, expect, it } from 'vitest';

import { soberDaysThisMonth, soberRecord } from './soberRecord';

describe('sober record after a slip', () => {
  const now = new Date(2026, 10, 22, 18, 0, 0);

  it('keeps the total and the badges when the current streak is short', () => {
    const started = new Date(2026, 10, 12, 8, 0, 0);
    const record = soberRecord(started, [{ daysKept: 100, occurredAt: '2026-11-12T08:00:00.000Z', previousStartedAt: '2026-08-04T08:00:00.000Z' }], now);
    expect(record.streakDays).toBe(10);
    expect(record.longestDays).toBe(100);
    expect(record.totalDays).toBe(110);
    expect(record.earned.has('90d')).toBe(true);
    expect(record.earned.has('30d')).toBe(true);
    expect(record.earned.has('24h')).toBe(true);
    expect(record.next?.key).toBe('30d');
  });

  it('does not show a wiped record on the day of a slip', () => {
    const started = new Date(2026, 10, 22, 18, 0, 0);
    const record = soberRecord(started, [{ daysKept: 47 }], now);
    expect(record.streakDays).toBe(0);
    expect(record.totalDays).toBe(47);
    expect(record.longestDays).toBe(47);
    expect(record.earned.has('30d')).toBe(true);
    expect(record.earned.has('7d')).toBe(true);
  });

  it('counts this month from the open stretch and a reset that fell inside it', () => {
    const started = new Date(2026, 10, 20, 9, 0, 0);
    const month = soberDaysThisMonth(started, [{
      daysKept: 40,
      previousStartedAt: '2026-10-11T09:00:00.000Z',
      occurredAt: '2026-11-20T09:00:00.000Z',
    }], now);
    expect(month.days).toBeGreaterThan(2);
    expect(month.resets).toHaveLength(1);
    expect(month.resets[0]?.daysKept).toBe(40);
  });
});
