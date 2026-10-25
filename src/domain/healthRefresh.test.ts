import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  GARMIN_CHECK_AGAIN,
  GARMIN_CHECK_DEBOUNCE_MS,
  GARMIN_CHECK_FAILED,
  GARMIN_CONNECT_APP_URL,
  GARMIN_CONNECT_NUDGE,
  GARMIN_CONNECT_NUDGE_MS,
  GARMIN_DAY_END_HOUR,
  GARMIN_DAY_START_HOUR,
  GARMIN_JUST_ARRIVED,
  GARMIN_PUSH_STALE_MS,
  GARMIN_SEND_HINT,
  GARMIN_STALE_PUSH_HINT,
  GARMIN_WAITING,
  garminAfterCheckLine,
  garminConnectNudge,
  garminConnectOpenUrl,
  garminHintLine,
  garminNothingNewLine,
  garminPushIsStale,
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
    expect(`${line} ${GARMIN_SEND_HINT} ${GARMIN_STALE_PUSH_HINT} ${SYNC_REFRESH}`).not.toMatch(/up to date/i);
    expect(readFileSync('src/ui/HealthRefresh.tsx', 'utf8')).not.toMatch(/up to date/i);
    expect(readFileSync('src/domain/healthRefresh.ts', 'utf8')).not.toMatch(/up to date/i);
    expect(GARMIN_CHECK_AGAIN).toBe('Check again');
    expect(GARMIN_JUST_ARRIVED).toBe('New Garmin data just arrived');
    expect(GARMIN_SEND_HINT).toBe('Garmin decides when to send data to Charioteer. It usually follows a watch sync, but can take a while.');
    expect(GARMIN_STALE_PUSH_HINT).toBe("If your watch has synced and nothing new has arrived, Charioteer can't tell why. Pull down in Garmin Connect to sync, then check again later.");
    expect(GARMIN_PUSH_STALE_MS).toBe(2 * 60 * 60 * 1000);
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
    const freshPush = new Date(now - 30 * 60 * 1000).toISOString();
    const almostStale = new Date(now - GARMIN_PUSH_STALE_MS + 1).toISOString();
    const stalePush = new Date(now - GARMIN_PUSH_STALE_MS).toISOString();
    expect(garminPushIsStale(null, now)).toBe(false);
    expect(garminPushIsStale('not-a-clock', now)).toBe(false);
    expect(garminPushIsStale(freshPush, now)).toBe(false);
    expect(garminPushIsStale(almostStale, now)).toBe(false);
    expect(garminPushIsStale(stalePush, now)).toBe(true);
    expect(garminHintLine(null, now)).toBe(GARMIN_SEND_HINT);
    expect(garminHintLine(freshPush, now)).toBe(GARMIN_SEND_HINT);
    expect(garminHintLine(stalePush, now)).toBe(`${GARMIN_SEND_HINT} ${GARMIN_STALE_PUSH_HINT}`);
    expect(garminHintLine(stalePush, now)).not.toContain('\n');
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
    expect(readFileSync('src/ui/HealthRefresh.tsx', 'utf8')).not.toContain('GARMIN_HISTORY_NOTE');
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
    expect(bar).toContain('garminAfterCheckLine');
    expect(bar.match(/garminHintLine\(/g)).toHaveLength(1);
    expect(bar).not.toMatch(/GARMIN_(DATA_HINT|HISTORY_NOTE|PULL_TO_SYNC|SEND_HINT|STALE_PUSH_HINT)/);
    for (const path of [
      'src/ui/HealthRefresh.tsx',
      'src/domain/healthRefresh.ts',
      'src/ui/GarminTip.tsx',
      'src/domain/garminTip.ts',
      'src/ui/GarminPermissionNotice.tsx',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source, path).not.toContain('New Garmin data arrives after your watch syncs');
      expect(source, path).not.toContain('Garmin sends new data automatically');
      expect(source, path).not.toContain('GARMIN_DATA_HINT');
      expect(source, path).not.toContain('GARMIN_PULL_TO_SYNC');
      expect(source, path).not.toContain('Pull down in Garmin Connect to sync your watch.');
    }
    expect(readFileSync('src/domain/garminTip.ts', 'utf8')).not.toContain('garminHintLine');
    expect(readFileSync('src/ui/GarminTip.tsx', 'utf8')).not.toContain('garminHintLine');
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
    expect(bar).toContain('<GarminConnectNudge');
    expect(bar.indexOf('garminAfterCheckLine')).toBeLessThan(bar.indexOf('<GarminConnectNudge'));
    expect(bar.indexOf('<GarminConnectNudge')).toBeLessThan(bar.indexOf('garminHintLine('));
    expect(readFileSync('src/domain/healthRefresh.ts', 'utf8')).toContain('Asked Garmin for your latest data');
    expect(bar).toContain('GARMIN_ASKED');
    expect(bar).not.toContain('REFRESH_BOTH');
  });

  it('offers Garmin Connect beside the existing clock when a daytime push is about three hours old', () => {
    expect(GARMIN_CONNECT_NUDGE).toBe('Not updating? Open Garmin Connect so your watch can sync.');
    expect(GARMIN_CONNECT_NUDGE).not.toMatch(/stuck|failed|error|alarm|warning|problem/i);
    expect(GARMIN_CONNECT_NUDGE_MS).toBe(3 * 60 * 60 * 1000);
    expect(GARMIN_DAY_START_HOUR).toBe(7);
    expect(GARMIN_DAY_END_HOUR).toBe(22);
    expect(GARMIN_CONNECT_APP_URL).toBe('gcm-ciq://');
    expect(garminConnectOpenUrl()).toBe('gcm-ciq://');
    expect(garminConnectOpenUrl('  gcm-ciq://  ')).toBe('gcm-ciq://');
    expect(garminConnectOpenUrl('GCM-CIQ://')).toBe('gcm-ciq://');
    expect(garminConnectOpenUrl('connect://')).toBeNull();
    expect(garminConnectOpenUrl('gcm-ciq://sync')).toBeNull();
    expect(garminConnectOpenUrl('https://connect.garmin.com')).toBeNull();
    expect(garminConnectOpenUrl('javascript:alert(1)')).toBeNull();
    const now = Date.parse('2026-10-24T12:00:00Z');
    const old = new Date(now - GARMIN_CONNECT_NUDGE_MS).toISOString();
    const almost = new Date(now - GARMIN_CONNECT_NUDGE_MS + 1).toISOString();
    expect(garminConnectNudge(old, now, 12)).toBe(true);
    expect(garminConnectNudge(almost, now, 12)).toBe(false);
    expect(garminConnectNudge(old, now, 7)).toBe(true);
    expect(garminConnectNudge(old, now, 21)).toBe(true);
    expect(garminConnectNudge(old, now, 6)).toBe(false);
    expect(garminConnectNudge(old, now, 22)).toBe(false);
    expect(garminConnectNudge(null, now, 12)).toBe(false);
    expect(garminConnectNudge('not-a-clock', now, 12)).toBe(false);
    const row = readFileSync('src/ui/GarminConnectNudge.tsx', 'utf8');
    expect(row).toContain('GARMIN_CONNECT_NUDGE');
    expect(row).toContain('garminConnectNudge(');
    expect(row).toContain('garminConnectOpenUrl');
    expect(row).toContain('Linking.canOpenURL');
    expect(row).toContain('Linking.openURL');
    expect(row).toContain('.catch(');
    expect(row).toContain("textDecorationLine: 'underline'");
    expect(row).not.toContain('Garmin updated at');
    expect(row).not.toMatch(/#|rgb\(|red/i);
    const app = readFileSync('app.json', 'utf8');
    expect(app).toContain('"gcm-ciq"');
    expect(app).toContain('"buildNumber": "66"');
    for (const path of [
      'src/app/(main)/health.tsx',
      'src/app/(main)/stats.tsx',
      'src/app/(main)/health-plan.tsx',
      'src/app/(main)/workouts.tsx',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source, path).toContain('<HealthRefreshBar');
      expect(source, path).toContain('garminReceivedAt={readings.lastPushAt}');
    }
  });
});
