import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { recentCheckInDays } from './checkIns';

describe('recent check-ins', () => {
  const today = new Date(2026, 9, 11, 15, 0);

  it('labels the seven days ending today and keeps the latest check-in on each day', () => {
    const days = recentCheckInDays(
      [
        { mood: 2, craving: 6, createdAt: new Date(2026, 9, 11, 8, 0).toISOString() },
        { mood: 4, craving: 1, createdAt: new Date(2026, 9, 11, 14, 0).toISOString() },
        { mood: 3, craving: 2, createdAt: new Date(2026, 9, 10, 9, 0).toISOString() },
        { mood: 1, craving: 9, createdAt: new Date(2026, 9, 1, 9, 0).toISOString() },
      ],
      today,
    );
    expect(days.map((day) => day.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(days.map((day) => day.day)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(days[6]).toMatchObject({ mood: 4, craving: 1 });
    expect(days[5]).toMatchObject({ mood: 3, craving: 2 });
    expect(days.slice(0, 5).every((day) => day.mood == null && day.craving == null)).toBe(true);
  });

  it('still prefers the later check-in when an older one is listed after it', () => {
    const days = recentCheckInDays(
      [
        { mood: 4, craving: 1, createdAt: new Date(2026, 9, 11, 14, 0).toISOString() },
        { mood: 2, craving: 6, createdAt: new Date(2026, 9, 11, 8, 0).toISOString() },
      ],
      today,
    );
    expect(days[6]).toMatchObject({ mood: 4, craving: 1 });
  });

  it('leaves every day empty when nothing was logged this week', () => {
    const days = recentCheckInDays([], today);
    expect(days.every((day) => day.mood == null && day.craving == null)).toBe(true);
  });
});

describe('Today refresh and chart', () => {
  const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
  const chart = readFileSync('src/ui/CheckInWeek.tsx', 'utf8');
  const screen = readFileSync('src/ui/ui.tsx', 'utf8');

  it('refetches Today on focus and on pull to refresh, and shows the latest mood', () => {
    expect(home).toContain('useFocusEffect');
    expect(home).toContain('repo.reload()');
    expect(home).toContain('onRefresh');
    expect(home).toContain('CheckInWeek');
    expect(home).toContain('Mood ${today.mood}/5 · craving ${today.craving}/10');
    expect(home).not.toContain('Meter');
    expect(screen).toContain('RefreshControl');
    expect(screen).not.toContain('function Meter');
  });

  it('draws narrow bars with day labels instead of a stretched fill', () => {
    expect(chart).toContain('width: 8');
    expect(chart).toContain('flexGrow: 0');
    expect(chart).not.toContain('flex: 1');
    expect(chart).toContain('No check-ins in the last 7 days.');
    expect(chart).toContain('{day.label}');
  });
});
