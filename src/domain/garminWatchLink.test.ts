import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  GARMIN_WATCH_LINK_GAP_MS,
  GARMIN_WATCH_LINK_HIDE,
  GARMIN_WATCH_LINK_HOUR,
  GARMIN_WATCH_LINK_HOW,
  GARMIN_WATCH_LINK_NOTE,
  GARMIN_WATCH_LINK_STEPS,
  garminWatchLinkDismissed,
  garminWatchLinkDue,
  latestGarminDailyDay,
  withGarminWatchLinkDismissed,
} from './healthRefresh';
import { GARMIN_CONNECT_BUTTON } from './garminTip';

const noon = Date.parse('2026-11-11T10:00:00Z');

describe('Garmin watch link note', () => {
  it('waits until mid-morning and a 12 hour gap, and stays off when today has data', () => {
    expect(GARMIN_WATCH_LINK_HOUR).toBe(10);
    expect(GARMIN_WATCH_LINK_GAP_MS).toBe(12 * 60 * 60 * 1000);
    expect(GARMIN_WATCH_LINK_NOTE).toBe("Garmin data hasn't synced recently.");
    expect(GARMIN_WATCH_LINK_HOW).toBe('How to fix');
    expect([...GARMIN_WATCH_LINK_STEPS]).toEqual([
      "Restart the Garmin Connect app and check it's connected to your watch (device icon).",
      "If you use a VPN, turn it off or make sure Garmin Connect's region (in its advanced settings) matches your country, e.g. UK.",
      'Then pull to refresh.',
    ]);
    const copy = [GARMIN_WATCH_LINK_NOTE, ...GARMIN_WATCH_LINK_STEPS].join(' ');
    expect(copy).not.toMatch(/diagnos|doctor|illness|reconnect Garmin/i);
    expect(copy).not.toMatch(/>/);
    const lastNight = new Date(noon - GARMIN_WATCH_LINK_GAP_MS).toISOString();
    const base = {
      connected: true,
      lastPushAt: lastNight,
      latestDailyDay: '2026-11-10',
      now: noon,
      today: '2026-11-11',
    };
    expect(garminWatchLinkDue({ ...base, hour: 10 })).toBe(true);
    expect(garminWatchLinkDue({ ...base, hour: 9 })).toBe(false);
    expect(garminWatchLinkDue({ ...base, hour: 7 })).toBe(false);
    expect(garminWatchLinkDue({ ...base, connected: false, hour: 11 })).toBe(false);
    expect(garminWatchLinkDue({ ...base, lastPushAt: null, latestDailyDay: null, hour: 12 })).toBe(false);
    expect(garminWatchLinkDue({ ...base, latestDailyDay: '2026-11-11', hour: 15 })).toBe(false);
    expect(garminWatchLinkDue({
      ...base,
      lastPushAt: '2026-11-11T08:00:00Z',
      latestDailyDay: '2026-11-10',
      hour: 15,
    })).toBe(false);
    const laterEvening = '2026-11-10T23:00:00Z';
    expect(garminWatchLinkDue({ ...base, lastPushAt: laterEvening, hour: 10 })).toBe(false);
    expect(garminWatchLinkDue({ ...base, lastPushAt: laterEvening, now: Date.parse('2026-11-11T11:00:00Z'), hour: 11 })).toBe(true);
    expect(latestGarminDailyDay(['2026-11-09', 'bad', '2026-11-10'])).toBe('2026-11-10');
  });

  it('hides for today only, and the reconnect button stays the other path', () => {
    expect(garminWatchLinkDismissed(null, 'user', '2026-11-11')).toBe(false);
    const stored = withGarminWatchLinkDismissed(null, 'user', '2026-11-11');
    expect(garminWatchLinkDismissed(stored, 'user', '2026-11-11')).toBe(true);
    expect(garminWatchLinkDismissed(stored, 'user', '2026-11-12')).toBe(false);
    expect(garminWatchLinkDismissed(stored, 'other', '2026-11-11')).toBe(false);
    expect(GARMIN_CONNECT_BUTTON).toBe('Connect Garmin');
    const bar = readFileSync('src/ui/HealthRefresh.tsx', 'utf8');
    const row = readFileSync('src/ui/GarminConnectRow.tsx', 'utf8');
    const note = readFileSync('src/ui/GarminWatchLinkNote.tsx', 'utf8');
    expect(bar).toContain('<GarminWatchLinkNote');
    expect(row).toContain('<GarminWatchLinkNote');
    expect(note).toContain('GARMIN_WATCH_LINK_NOTE');
    expect(note).toContain('title={GARMIN_WATCH_LINK_HOW}');
    expect(note).toContain('GARMIN_WATCH_LINK_STEPS');
    expect(note).toContain('GARMIN_WATCH_LINK_HIDE');
    expect(note).not.toContain('ErrorNote');
    expect(readFileSync('src/app/(main)/health.tsx', 'utf8')).toContain('latestDailyDay={latestGarminDailyDay');
    expect(readFileSync('src/app/(main)/workouts.tsx', 'utf8')).toContain('latestDailyDay={latestGarminDailyDay');
    expect(readFileSync('src/ui/GarminTip.tsx', 'utf8')).not.toContain('GarminWatchLinkNote');
  });
});
