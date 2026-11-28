import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { formatUkCompactDay } from '@/domain/healthInsights';
import { checkInWeekFigure } from '@/domain/measureFigures';

import {
  CHECK_IN_CHART_PERIODS,
  CHECK_IN_CRAVING_HIGH,
  CHECK_IN_CRAVING_RISING,
  CHECK_IN_HISTORY_DAYS,
  CHECK_IN_MOOD_LOWER,
  CHECK_IN_ONE_SO_FAR,
  CHECK_IN_PAGE_SIZE,
  checkInChartMeaning,
  checkInChartPeriod,
  checkInDayForPoint,
  checkInHistorySince,
  checkInLoggedSplit,
  checkInPageContinues,
  checkInPreviousWindow,
  checkInRangeFigure,
  checkInWindow,
} from './checkInCharts';

const TODAY = new Date(2026, 10, 23, 12, 0, 0);

function at(daysAgo: number): string {
  const date = new Date(TODAY);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

describe('check-in chart range', () => {
  it('uses the workout history chips and keeps a stored Day on 7 days', () => {
    expect(CHECK_IN_CHART_PERIODS).toEqual(['7', '30', '60', '90', '12m']);
    expect(checkInChartPeriod('7')).toBe('7');
    expect(checkInChartPeriod('12m')).toBe('12m');
    expect(checkInChartPeriod('day')).toBe('7');
    expect(checkInChartPeriod('6m')).toBe('90');
  });

  it('builds the selected window and the equal stretch before it', () => {
    const checkIns = [
      { mood: 8, craving: 2, createdAt: at(0) },
      { mood: 4, craving: 6, createdAt: at(400) },
      { mood: 6, craving: 1, createdAt: at(200) },
    ];
    const week = checkInWindow(checkIns, TODAY, '7');
    const before = checkInPreviousWindow(checkIns, TODAY, '7');
    expect(week).toHaveLength(7);
    expect(week[0]?.day).toBe('2026-11-17');
    expect(week[6]?.day).toBe('2026-11-23');
    expect(week[6]).toMatchObject({ mood: 8, craving: 2 });
    expect(before).toHaveLength(7);
    expect(before[0]?.day).toBe('2026-11-10');
    expect(before[6]?.day).toBe('2026-11-16');
    expect(before.some((day) => day.day >= '2026-11-17')).toBe(false);

    const month = checkInWindow(checkIns, TODAY, '30');
    expect(month).toHaveLength(30);
    const year = checkInWindow(checkIns, TODAY, '12m');
    expect(year).toHaveLength(365);
    expect(year.some((day) => day.mood === 4)).toBe(false);
    expect(year.some((day) => day.mood === 6)).toBe(true);
  });

  it('drops the odd logged-days sentence and keeps a 7-day ring', () => {
    const split = checkInLoggedSplit(1, 7);
    expect(split.caption).toBe('');
    expect(split.leftLabel).toBe('Logged days 1');
    expect(split.rightLabel).toBe('Open days 6');
    expect(`${split.leftLabel} ${split.rightLabel} ${split.caption}`).not.toContain('Fewer logged days');
    expect(checkInRangeFigure(1, 7)).toEqual(checkInWeekFigure(1));
    expect(checkInRangeFigure(1, 30)).toMatchObject({ centre: '1', unit: 'of 30', status: '29 days to go' });
  });

  it('opens the latest logged day in a tapped month', () => {
    const days = [
      { day: '2026-10-16', mood: 4 },
      { day: '2026-10-20', mood: 8 },
      { day: '2026-11-02', mood: 6 },
    ];
    expect(checkInDayForPoint('2026-10-01', 'month', days, '2026-11-23')).toBe('2026-10-20');
    expect(checkInDayForPoint('2026-11-02', 'day', days, '2026-11-23')).toBe('2026-11-02');
    expect(checkInDayForPoint('2026-12-01', 'day', [], '2026-11-23')).toBe('2026-11-23');
  });

  it('keeps paging until the page is older than 12 months', () => {
    const now = new Date('2026-11-23T12:00:00.000Z');
    const since = checkInHistorySince(now);
    expect(now.getTime() - new Date(since).getTime()).toBe((CHECK_IN_HISTORY_DAYS - 1) * 86_400_000);
    expect(checkInPageContinues({
      batch: [{ createdAt: '2026-11-01T00:00:00.000Z' }],
      pageSize: CHECK_IN_PAGE_SIZE,
      sinceIso: since,
    })).toBe(false);
    expect(checkInPageContinues({
      batch: [
        { createdAt: '2026-11-20T00:00:00.000Z' },
        { createdAt: '2026-06-01T00:00:00.000Z' },
      ],
      pageSize: 2,
      sinceIso: since,
    })).toBe(true);
    expect(checkInPageContinues({
      batch: [
        { createdAt: '2026-02-01T00:00:00.000Z' },
        { createdAt: '2025-01-01T00:00:00.000Z' },
      ],
      pageSize: 2,
      sinceIso: since,
    })).toBe(false);
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    expect(repo).toContain('loadCheckIns');
    expect(repo).toContain('checkInPageContinues');
    expect(repo).toContain(".from('check_ins')");
    expect(repo).toContain('.range(');
  });
});

describe('check-in chart meaning', () => {
  const moodScale = 'Mood runs from 1 to 10. 1 is very low and 10 is very high. It is a note of the day, not a score of how well you are doing.';
  const cravingScale = 'Craving runs from 0 to 10. 0 is none, 1 is very low, and 10 is as strong as it gets.';

  it('explains one reading without inventing a trend', () => {
    const lines = checkInChartMeaning({
      kind: 'craving',
      period: '7',
      current: [
        { day: '2026-11-22', value: null },
        { day: '2026-11-23', value: 1 },
      ],
      previous: [{ day: '2026-11-16', value: 8 }],
    });
    expect(lines[0]).toBe(CHECK_IN_ONE_SO_FAR);
    expect(lines).toContain(cravingScale);
    expect(lines).toContain(`Craving was 1 on ${formatUkCompactDay('2026-11-23')}.`);
    expect(lines.join(' ')).not.toMatch(/up from|down from|Older/);
    expect(lines.join(' ')).not.toContain(CHECK_IN_CRAVING_RISING);
  });

  it('compares the range with the previous one and names the high and low days', () => {
    const lines = checkInChartMeaning({
      kind: 'mood',
      period: '30',
      current: [
        { day: '2026-11-20', value: 3 },
        { day: '2026-11-22', value: 9 },
      ],
      previous: [
        { day: '2026-10-20', value: 4 },
        { day: '2026-10-22', value: 4 },
      ],
    });
    expect(lines).toContain(moodScale);
    expect(lines).toContain('Mood in the last 30 days averages 6, up from 4 in the 30 days before.');
    expect(lines).toContain(`Highest mood was 9 on ${formatUkCompactDay('2026-11-22')}.`);
    expect(lines).toContain(`Lowest mood was 3 on ${formatUkCompactDay('2026-11-20')}.`);
    expect(lines.join(' ')).not.toContain(CHECK_IN_MOOD_LOWER);
    expect(lines.join(' ')).not.toContain('Older');
  });

  it('calls a small change steady, and a drop in mood a gentle note', () => {
    const steady = checkInChartMeaning({
      kind: 'mood',
      period: '7',
      current: [{ day: '2026-11-22', value: 6 }, { day: '2026-11-23', value: 6 }],
      previous: [{ day: '2026-11-15', value: 6.2 }, { day: '2026-11-16', value: 6.2 }],
    });
    expect(steady).toContain('Mood in the last 7 days averages 6, about the same as 6.2 in the 7 days before.');
    expect(steady).toContain('It stayed at 6 on the days you logged.');

    const lower = checkInChartMeaning({
      kind: 'mood',
      period: '7',
      current: [{ day: '2026-11-22', value: 3 }, { day: '2026-11-23', value: 4 }],
      previous: [{ day: '2026-11-15', value: 8 }, { day: '2026-11-16', value: 8 }],
    });
    expect(lower).toContain('Mood in the last 7 days averages 3.5, down from 8 in the 7 days before.');
    expect(lower).toContain(CHECK_IN_MOOD_LOWER);
  });

  it('points a rising or high craving toward Breathe and People, without medical advice', () => {
    const rising = checkInChartMeaning({
      kind: 'craving',
      period: '60',
      current: [{ day: '2026-11-20', value: 6 }, { day: '2026-11-23', value: 8 }],
      previous: [{ day: '2026-09-20', value: 2 }, { day: '2026-09-21', value: 2 }],
    });
    expect(rising).toContain('Craving in the last 60 days averages 7, up from 2 in the 60 days before.');
    expect(rising).toContain(CHECK_IN_CRAVING_RISING);
    expect(rising.join(' ')).not.toContain(CHECK_IN_CRAVING_HIGH);
    expect(CHECK_IN_CRAVING_RISING).toContain('Breathe');
    expect(CHECK_IN_CRAVING_RISING).toContain('People');
    expect(CHECK_IN_CRAVING_RISING).toContain('not medical advice');

    const high = checkInChartMeaning({
      kind: 'craving',
      period: '7',
      current: [{ day: '2026-11-22', value: 7 }, { day: '2026-11-23', value: 7 }],
      previous: [{ day: '2026-11-15', value: 7 }, { day: '2026-11-16', value: 7 }],
    });
    expect(high).toContain(CHECK_IN_CRAVING_HIGH);
    expect(high.join(' ')).not.toContain(CHECK_IN_CRAVING_RISING);
  });

  it('does not invent a comparison when the earlier stretch is missing or empty', () => {
    const current = [
      { day: '2026-11-22', value: 5 },
      { day: '2026-11-23', value: 7 },
    ];
    const unknown = checkInChartMeaning({ kind: 'mood', period: '90', current, previous: null });
    expect(unknown.join(' ')).not.toMatch(/up from|not enough earlier/);
    const empty = checkInChartMeaning({ kind: 'mood', period: '90', current, previous: [{ day: '2026-08-01', value: null }] });
    expect(empty).toContain('There are not enough earlier check-ins to compare with the 90 days before.');
    const none = checkInChartMeaning({ kind: 'mood', period: '7', current: [{ day: '2026-11-23', value: null }], previous: [] });
    expect(none[0]).toBe('No check-ins in the last 7 days.');
    expect(none).toContain(moodScale);
  });

  it('says a 12-month chart is monthly averages', () => {
    const lines = checkInChartMeaning({
      kind: 'mood',
      period: '12m',
      current: [{ day: '2026-01-10', value: 4 }, { day: '2026-11-23', value: 8 }],
      previous: [{ day: '2025-06-01', value: 4 }, { day: '2025-08-01', value: 4 }],
    });
    expect(lines).toContain('Each point is the average for that month.');
    expect(lines).toContain('Mood in the last 12 months averages 6, up from 4 in the 12 months before.');
  });

  it('wires the range, the tap, and the explanation on the check-in card', () => {
    const week = readFileSync('src/ui/CheckInWeek.tsx', 'utf8');
    const screen = readFileSync('src/app/(main)/check-in.tsx', 'utf8');
    expect(week).toContain('StatPeriodToggle');
    expect(week).toContain('CHECK_IN_CHART_PERIODS');
    expect(week).toContain('useStatPeriod');
    expect(week).toContain('meaning="none"');
    expect(week).toContain('title="What this means"');
    expect(week).toContain('checkInChartMeaning');
    expect(week).toContain('onSelectDay');
    expect(week).toContain('aggregate="mean"');
    expect(week).toContain('formatMoodAverage');
    expect(week).toContain('weeklyMoodAverage');
    expect(week).not.toContain('CHART_DIRECTION_HINT');
    expect(week).not.toContain('Older');
    expect(week).not.toContain('Fewer logged days');
    expect(screen).toContain('<CheckInWeek checkIns={checkIns} ranged />');
  });
});
