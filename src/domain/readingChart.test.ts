import { describe, expect, it } from 'vitest';

import {
  bucketChartPoints,
  chartBucketCaption,
  chartBucketForPeriod,
  formatAxisNumber,
  formatChartDate,
  xAxisTicks,
  yAxisTicks,
} from '@/domain/readingChart';
import { minuteUnit, periodDayCount, periodPhrase, rollingWindow, scaledPeriodTarget } from '@/domain/statWindow';

describe('chart axes', () => {
  it('labels a week with weekdays and a longer range with UK dates', () => {
    expect(xAxisTicks('2026-10-13', '2026-10-19').map((tick) => tick.label)).toEqual(['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon']);
    const month = xAxisTicks('2026-09-20', '2026-10-19');
    expect(month.length).toBeGreaterThanOrEqual(3);
    expect(month.length).toBeLessThanOrEqual(5);
    expect(month[0]?.label).toBe('20 Sep');
    expect(month.at(-1)?.label).toBe('19 Oct');
    const year = xAxisTicks('2025-10-20', '2026-10-19');
    expect(year.length).toBeGreaterThanOrEqual(3);
    expect(year.length).toBeLessThanOrEqual(5);
    expect(year[0]?.label).toBe('Oct 25');
    expect(year.at(-1)?.label).toBe('Oct 26');
    expect(formatChartDate('2026-10-19')).toBe('19 Oct 2026');
  });

  it('draws three to five y ticks that cover the readings', () => {
    const ticks = yAxisTicks([54, 62, 71]);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks[0]).toBeLessThanOrEqual(54);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(71);
    expect(ticks).toEqual([...ticks].sort((left, right) => left - right));
    const flat = yAxisTicks([62, 62]);
    expect(flat.length).toBeGreaterThanOrEqual(3);
    expect(flat[0]).toBeLessThan(62);
    expect(flat.at(-1)).toBeGreaterThan(62);
    expect(formatAxisNumber(1200)).toBe('1,200');
    expect(formatAxisNumber(62.5)).toBe('62.5');
  });
});

describe('chart buckets', () => {
  it('keeps daily readings through 90 days and groups longer ranges without filling gaps', () => {
    expect(chartBucketForPeriod('day')).toBe('day');
    expect(chartBucketForPeriod('90')).toBe('day');
    expect(chartBucketForPeriod('6m')).toBe('week');
    expect(chartBucketForPeriod('12m')).toBe('month');
    expect(chartBucketCaption('week', 'mean')).toBe('Weekly averages. Oldest to newest.');
    expect(chartBucketCaption('month', 'sum')).toBe('Monthly totals. Oldest to newest.');
    const daily = bucketChartPoints([
      { day: '2026-10-01', value: 60 },
      { day: '2026-10-03', value: 70 },
    ], 'day', 'mean');
    expect(daily).toEqual([
      { day: '2026-10-01', value: 60 },
      { day: '2026-10-03', value: 70 },
    ]);
    const weeks = bucketChartPoints([
      { day: '2026-10-13', value: 60 },
      { day: '2026-10-14', value: 80 },
      { day: '2026-10-20', value: 90 },
    ], 'week', 'mean');
    expect(weeks).toEqual([
      { day: '2026-10-12', value: 70 },
      { day: '2026-10-19', value: 90 },
    ]);
    const months = bucketChartPoints([
      { day: '2026-09-02', value: 10 },
      { day: '2026-09-20', value: 30 },
      { day: '2026-11-01', value: 5 },
    ], 'month', 'sum');
    expect(months).toEqual([
      { day: '2026-09-01', value: 40 },
      { day: '2026-11-01', value: 5 },
    ]);
  });
});

describe('longer periods', () => {
  it('scales targets and names rolling windows through 12 months', () => {
    expect(periodDayCount('60')).toBe(60);
    expect(periodDayCount('90')).toBe(90);
    expect(periodDayCount('6m')).toBe(183);
    expect(periodDayCount('12m')).toBe(365);
    expect(rollingWindow('2026-10-19', '90').days).toHaveLength(90);
    expect(rollingWindow('2026-10-19', '12m').start).toBe('2025-10-20');
    expect(scaledPeriodTarget(150, '90')).toBe(1929);
    expect(scaledPeriodTarget(6, '12m')).toBe(313);
    expect(minuteUnit('90')).toBe('min in last 90 days');
    expect(minuteUnit('6m')).toBe('min in last 6 months');
    expect(periodPhrase('12m')).toBe('the last 12 months');
  });
});
