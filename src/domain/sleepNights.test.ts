import { describe, expect, it } from 'vitest';

import { sleepHoursByWakeDay, type SleepSpan } from '@/domain/sleepNights';

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function span(value: number, startIso: string, endIso: string): SleepSpan {
  return { value, startMs: Date.parse(startIso), endMs: Date.parse(endIso) };
}

describe('sleep nights from Apple Health', () => {
  it('keeps a night that crosses midnight on the morning it ended', () => {
    const days = sleepHoursByWakeDay(
      [
        span(3, '2026-09-24T22:00:00.000Z', '2026-09-24T23:30:00.000Z'),
        span(4, '2026-09-24T23:30:00.000Z', '2026-09-25T01:00:00.000Z'),
        span(5, '2026-09-25T01:00:00.000Z', '2026-09-25T06:30:00.000Z'),
      ],
      utcDay,
    );
    expect(days.size).toBe(1);
    expect(days.get('2026-09-25')).toBeCloseTo(8.5, 5);
  });

  it('uses watch stages when a plain asleep sample covers the same night', () => {
    const days = sleepHoursByWakeDay(
      [
        span(1, '2026-10-16T22:00:00.000Z', '2026-10-17T06:00:00.000Z'),
        span(3, '2026-10-16T22:00:00.000Z', '2026-10-17T02:00:00.000Z'),
        span(4, '2026-10-17T02:00:00.000Z', '2026-10-17T04:00:00.000Z'),
        span(5, '2026-10-17T04:00:00.000Z', '2026-10-17T06:00:00.000Z'),
        span(2, '2026-10-17T03:00:00.000Z', '2026-10-17T03:20:00.000Z'),
      ],
      utcDay,
    );
    expect(days.get('2026-10-17')).toBeCloseTo(8, 5);
  });

  it('keeps a night that is only time in bed, and leaves awake time out', () => {
    const days = sleepHoursByWakeDay(
      [
        span(0, '2026-10-17T23:00:00.000Z', '2026-10-18T07:00:00.000Z'),
        span(2, '2026-10-18T02:00:00.000Z', '2026-10-18T02:30:00.000Z'),
      ],
      utcDay,
    );
    expect(days.get('2026-10-18')).toBeCloseTo(8, 5);
  });

  it('does not join two nights that are hours apart', () => {
    const days = sleepHoursByWakeDay(
      [
        span(1, '2026-09-24T22:00:00.000Z', '2026-09-25T06:00:00.000Z'),
        span(1, '2026-09-25T22:30:00.000Z', '2026-09-26T06:12:00.000Z'),
      ],
      utcDay,
    );
    expect(days.get('2026-09-25')).toBeCloseTo(8, 5);
    expect(days.get('2026-09-26')).toBeCloseTo(7.7, 5);
    expect(days.size).toBe(2);
  });
});
