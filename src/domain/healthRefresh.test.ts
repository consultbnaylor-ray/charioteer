import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  GARMIN_CHECK_AGAIN,
  GARMIN_CHECK_DEBOUNCE_MS,
  GARMIN_CHECK_FAILED,
  GARMIN_DATA_HINT,
  GARMIN_HISTORY_NOTE,
  GARMIN_JUST_ARRIVED,
  GARMIN_PULL_TO_SYNC,
  GARMIN_WAITING,
  garminAfterCheckLine,
  garminNothingNewLine,
  syncClock,
  REFRESH_APPLE,
  REFRESH_BOTH,
  SYNC_REFRESH,
  appleCheckIsFresh,
  garminCheckCooling,
  garminCheckFoundNew,
  garminReceiptAdvanced,
  garminStoredMark,
  lastUpdatedLine,
  readGarminRefreshBody,
  refreshButtonLabel,
  refreshCooling,
  syncStatusShowsRefresh,
  syncStatusText,
} from '@/domain/healthRefresh';
import { workoutWeekSummary } from '@/domain/workoutDay';

describe('manual health refresh', () => {
  it('names Garmin only when it is connected, and waits a minute', () => {
    expect(refreshButtonLabel(false)).toBe(REFRESH_APPLE);
    expect(refreshButtonLabel(true)).toBe(REFRESH_BOTH);
    expect(refreshCooling(1_000, 1_000 + 59_000)).toBe(true);
    expect(refreshCooling(1_000, 1_000 + 60_000)).toBe(false);
    expect(lastUpdatedLine(null)).toBe('Last updated —');
    expect(lastUpdatedLine('2026-10-23T20:04:00Z')).toMatch(/^Last updated \d{2}:\d{2}$/);
  });

  it('names the last Apple check and the last Garmin push, and never claims the data is complete', () => {
    const now = Date.parse('2026-10-23T21:50:00Z');
    const apple = new Date(now - 2 * 60 * 1000).toISOString();
    const garmin = new Date(now - 10 * 60 * 1000).toISOString();
    const stale = new Date(now - 16 * 60 * 1000).toISOString();
    const line = syncStatusText({ appleCheckedAt: apple, garminConnected: true, garminReceivedAt: garmin });
    expect(line).toMatch(/^Apple Health checked \d{2}:\d{2} · Garmin data received \d{2}:\d{2}$/);
    expect(syncStatusText({ appleCheckedAt: apple, garminConnected: true, garminReceivedAt: null })).toBe(
      `Apple Health checked ${line.slice('Apple Health checked '.length, line.indexOf(' ·'))} · ${GARMIN_WAITING}`,
    );
    expect(syncStatusText({ appleCheckedAt: null, garminConnected: false, garminReceivedAt: null })).toBe('Apple Health not checked yet');
    expect(syncStatusText({ appleCheckedAt: apple, garminConnected: false, garminReceivedAt: garmin })).not.toContain('Garmin');
    expect(appleCheckIsFresh(apple, now)).toBe(true);
    expect(appleCheckIsFresh(stale, now)).toBe(false);
    expect(appleCheckIsFresh(null, now)).toBe(false);
    expect(syncStatusShowsRefresh({ appleCheckedAt: apple, now, error: false })).toBe(false);
    expect(syncStatusShowsRefresh({ appleCheckedAt: stale, now, error: false })).toBe(true);
    expect(syncStatusShowsRefresh({ appleCheckedAt: apple, now, error: true })).toBe(true);
    expect(`${line} ${GARMIN_DATA_HINT} ${GARMIN_HISTORY_NOTE} ${SYNC_REFRESH}`).not.toMatch(/up to date/i);
    expect(readFileSync('src/ui/HealthRefresh.tsx', 'utf8')).not.toMatch(/up to date/i);
    expect(readFileSync('src/domain/healthRefresh.ts', 'utf8')).not.toMatch(/up to date/i);
    expect(GARMIN_CHECK_AGAIN).toBe('Check again');
    expect(GARMIN_JUST_ARRIVED).toBe('New Garmin data just arrived');
    expect(GARMIN_PULL_TO_SYNC).toBe('Pull down in Garmin Connect to sync your watch.');
    expect(GARMIN_CHECK_FAILED).toBe("Couldn't check stored Garmin data just now.");
    expect(GARMIN_CHECK_DEBOUNCE_MS).toBe(10_000);
    const checked = '2026-10-24T06:45:00Z';
    const received = '2026-10-23T22:24:00Z';
    expect(garminNothingNewLine(checked, received)).toBe(`Checked ${syncClock(checked)} · nothing new from Garmin since ${syncClock(received)}`);
    expect(garminNothingNewLine(checked, received)).toMatch(/^Checked \d{2}:\d{2} · nothing new from Garmin since \d{2}:\d{2}$/);
    expect(garminNothingNewLine(checked, null)).toBe(`Checked ${syncClock(checked)} · nothing new from Garmin`);
    expect(garminAfterCheckLine({ view: 'arrived', checkedAt: checked, receivedAt: received })).toBe(GARMIN_JUST_ARRIVED);
    expect(garminAfterCheckLine({ view: 'nothing', checkedAt: checked, receivedAt: received })).toBe(garminNothingNewLine(checked, received));
    expect(garminAfterCheckLine({ view: 'failed', checkedAt: checked, receivedAt: received })).toBe(GARMIN_CHECK_FAILED);
    expect(garminAfterCheckLine({ view: 'idle', checkedAt: null, receivedAt: received })).toBe(`Garmin data received ${syncClock(received)}`);
    expect(garminAfterCheckLine({ view: 'idle', checkedAt: null, receivedAt: null })).toBe(GARMIN_WAITING);
    expect(garminCheckCooling(1_000, 1_000 + 9_999)).toBe(true);
    expect(garminCheckCooling(1_000, 1_000 + 10_000)).toBe(false);
    const earlier = '2026-10-23T21:40:00Z';
    const later = '2026-10-23T21:48:00Z';
    expect(garminReceiptAdvanced(null, later)).toBe(true);
    expect(garminReceiptAdvanced(earlier, later)).toBe(true);
    expect(garminReceiptAdvanced(later, earlier)).toBe(false);
    expect(garminReceiptAdvanced(later, later)).toBe(false);
    const before = { lastPushAt: earlier, mark: '1' };
    expect(garminCheckFoundNew(before, { connected: true, lastPushAt: later, mark: '1' })).toBe(true);
    expect(garminCheckFoundNew(before, { connected: true, lastPushAt: earlier, mark: '2' })).toBe(true);
    expect(garminCheckFoundNew(before, { connected: true, lastPushAt: earlier, mark: '1' })).toBe(false);
    expect(garminCheckFoundNew(before, { connected: false, lastPushAt: null, mark: '' })).toBe(false);
    const mark = garminStoredMark({
      dailies: [{ calendarDate: '2026-10-23', moderateMinutes: 1, vigorousMinutes: 0, restingHeartRateBpm: 60, steps: 100 }],
      activities: [],
      sleep: [],
      userMetrics: [],
    });
    const more = garminStoredMark({
      dailies: [{ calendarDate: '2026-10-23', moderateMinutes: 1, vigorousMinutes: 0, restingHeartRateBpm: 60, steps: 200 }],
      activities: [],
      sleep: [],
      userMetrics: [],
    });
    expect(more).not.toBe(mark);
  });

  it('reads a Garmin code from the error body when the status is not 2xx', async () => {
    const fromData = await readGarminRefreshBody({ ok: false, code: 'rate' }, { context: { json: async () => ({ code: 'permission' }) } });
    expect(fromData).toEqual({ ok: false, code: 'rate' });
    const fromContext = await readGarminRefreshBody(null, { context: { json: async () => ({ ok: false, code: 'permission' }) } });
    expect(fromContext).toEqual({ ok: false, code: 'permission' });
    const broken = await readGarminRefreshBody(null, { context: { json: async () => { throw new Error('consumed'); } } });
    expect(broken).toBeNull();
    expect(readFileSync('src/data/supabase-repository.ts', 'utf8')).toContain('readGarminRefreshBody');
    expect(readFileSync('src/ui/HealthRefresh.tsx', 'utf8')).toContain('GARMIN_HISTORY_NOTE');
    expect(readFileSync('src/ui/HealthRefresh.tsx', 'utf8')).toContain("garmin.code === 'history'");
    expect(readFileSync('src/ui/HealthRefresh.tsx', 'utf8')).toContain("garmin.code === 'permission'");
  });

  it('puts the control at the top of Health, Workouts, and Fitness', () => {
    for (const path of [
      'src/app/(main)/health.tsx',
      'src/app/(main)/health-plan.tsx',
      'src/app/(main)/workouts.tsx',
      'src/app/(main)/stats.tsx',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source, path).toContain('<HealthRefreshBar');
      expect(source, path).toContain('onRefresh={() => void manual.run()}');
      expect(source.indexOf('<HealthRefreshBar'), path).toBeLessThan(source.indexOf('<HealthRefreshBar') + 20);
    }
    const plan = readFileSync('src/app/(main)/health-plan.tsx', 'utf8');
    expect(plan.indexOf('<HealthRefreshBar')).toBeLessThan(plan.indexOf('<GoalChoices'));
    expect(plan.indexOf('variant="label">Fitness')).toBeLessThan(plan.indexOf('<WorkoutsLink'));
    expect(plan.indexOf('<WorkoutsLink')).toBeLessThan(plan.indexOf('variant="label">Wellbeing'));
    expect(readFileSync('src/ui/WorkoutsLink.tsx', 'utf8')).toContain('Workouts: see your workout calendar and history');
    expect(workoutWeekSummary(
      [{ startedAt: '2026-10-21T07:00:00Z', durationMinutes: 30 }],
      '2026-10-23',
    )).toBe('This week: 1 workout, 30 min');
    const bar = readFileSync('src/ui/HealthRefresh.tsx', 'utf8');
    expect(bar).toContain('refreshAppleHealth');
    expect(bar).toContain('consentHealth');
    expect(bar).toContain('refreshGarmin');
    expect(bar).toContain('<PlanTick done />');
    expect(bar).toContain('SYNC_REFRESH');
    expect(bar).toContain('GARMIN_DATA_HINT');
    expect(bar).toContain('GARMIN_PULL_TO_SYNC');
    expect(bar).toContain('garminAfterCheckLine');
    expect(bar).toContain('appleCheckIsFresh');
    expect(bar).toContain('GARMIN_CHECK_AGAIN');
    expect(bar).toContain('loadGarmin');
    expect(bar).toContain('ActivityIndicator');
    expect(bar).toContain('accessibilityLabel="Checking Garmin"');
    expect(bar).not.toContain('garmin-refresh');
    const checkStart = bar.indexOf('const checkStored');
    const check = bar.slice(checkStart, bar.indexOf('reloadHealthSources()', checkStart));
    expect(check).toContain('repo.loadGarmin()');
    expect(check).not.toContain('refreshGarmin');
    expect(check).not.toContain('garmin-refresh');
    for (const path of [
      'src/app/(main)/health.tsx',
      'src/app/(main)/health-plan.tsx',
      'src/app/(main)/workouts.tsx',
      'src/app/(main)/stats.tsx',
    ]) {
      expect(readFileSync(path, 'utf8'), path).toContain('garminMark={garminStoredMark(readings)}');
    }
    expect(readFileSync('src/domain/healthRefresh.ts', 'utf8')).toContain('Asked Garmin for your latest data');
    expect(bar).toContain('GARMIN_ASKED');
    expect(bar).not.toContain('REFRESH_BOTH');
  });
});
