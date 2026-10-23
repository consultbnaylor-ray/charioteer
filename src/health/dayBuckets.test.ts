import { describe, expect, it } from 'vitest';

import { isoDay, startOfLocalDay } from '@/domain/dates';
import { dailyStatisticsAnchor, dailyStatisticsEnd } from './dayBuckets';

describe('daily statistics buckets', () => {
  it('starts the open day at local midnight instead of the query clock', () => {
    const now = new Date(2026, 9, 23, 23, 39, 0);
    const anchor = dailyStatisticsAnchor(now);
    expect(anchor).toEqual(startOfLocalDay(now));
    expect(anchor.getHours()).toBe(0);
    expect(anchor.getMinutes()).toBe(0);
    expect(anchor.getTime()).toBeLessThan(now.getTime());
    expect(isoDay(anchor)).toBe(isoDay(now));
    expect(dailyStatisticsEnd(now).getTime()).toBeGreaterThan(now.getTime());
    expect(isoDay(new Date(dailyStatisticsEnd(now).getTime() - 60 * 1000))).toBe(isoDay(now));

    const clockAnchor = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    expect(clockAnchor.getHours()).toBe(23);
    expect(clockAnchor.getMinutes()).toBe(39);
    const dayMs = 24 * 60 * 60 * 1000;
    const index = Math.floor((now.getTime() - clockAnchor.getTime()) / dayMs);
    const openBucket = new Date(clockAnchor.getTime() + index * dayMs);
    expect(openBucket.getTime()).toBe(now.getTime());
    const morning = new Date(2026, 9, 23, 8, 0, 0);
    const morningBucket = new Date(clockAnchor.getTime() + Math.floor((morning.getTime() - clockAnchor.getTime()) / dayMs) * dayMs);
    expect(isoDay(morningBucket)).not.toBe(isoDay(now));
    expect(isoDay(dailyStatisticsAnchor(morning))).toBe(isoDay(now));
  });

  it('keeps Thursday afternoon on Thursday when the clock is 23:53', () => {
    const now = new Date(2026, 9, 23, 23, 53, 0);
    const clockAnchor = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dayMs = 24 * 60 * 60 * 1000;
    const thursdayAfternoon = new Date(2026, 9, 22, 16, 0, 0);
    const clockBucket = new Date(clockAnchor.getTime() + Math.floor((thursdayAfternoon.getTime() - clockAnchor.getTime()) / dayMs) * dayMs);
    expect(isoDay(clockBucket)).toBe('2026-10-21');
    expect(isoDay(dailyStatisticsAnchor(thursdayAfternoon))).toBe('2026-10-22');
    const fridayMorning = new Date(2026, 9, 23, 8, 0, 0);
    const fridayClock = new Date(clockAnchor.getTime() + Math.floor((fridayMorning.getTime() - clockAnchor.getTime()) / dayMs) * dayMs);
    expect(isoDay(fridayClock)).toBe('2026-10-22');
    expect(isoDay(dailyStatisticsAnchor(fridayMorning))).toBe('2026-10-23');
  });
});