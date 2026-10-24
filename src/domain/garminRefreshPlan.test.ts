import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GARMIN_PERMISSION } from './healthRefresh';
import {
  GARMIN_PERMISSIONS_URL,
  garminAllHistoricalRefusal,
  garminBackfillDecision,
  garminBackfillTypes,
  garminBackfillWindow,
  garminHistoryBody,
  garminHistoryCooling,
  garminPermissionText,
  readGarminPermissions,
} from '../../supabase/functions/_shared/garmin';

const now = Date.parse('2026-10-23T12:00:00Z');
const day = 24 * 60 * 60;

describe('Garmin refresh permissions and window', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clamps the backfill window to connect time and the last seven days', () => {
    const end = Math.floor(now / 1000);
    const old = new Date(now - 10 * day * 1000).toISOString();
    const twoDays = new Date(now - 2 * day * 1000).toISOString();
    const justNow = new Date(now - 10 * 1000).toISOString();
    expect(garminBackfillWindow(old, now)).toEqual({ start: end - 7 * day, end });
    expect(garminBackfillWindow(null, now)).toEqual({ start: end - 7 * day, end });
    expect(garminBackfillWindow(twoDays, now)).toEqual({
      start: Math.floor(Date.parse(twoDays) / 1000),
      end,
    });
    expect(garminBackfillWindow(justNow, now)).toBeNull();
    expect(garminBackfillWindow(new Date(now + 60_000).toISOString(), now)).toBeNull();
    expect(garminBackfillWindow(twoDays, now)!.start).toBeGreaterThanOrEqual(Math.floor(Date.parse(twoDays) / 1000));
  });

  it('asks only for the exports Garmin has granted, and every type when that list is unknown', () => {
    expect(garminBackfillTypes(null)).toEqual(['dailies', 'activities', 'sleeps', 'userMetrics']);
    expect(garminBackfillTypes('HEALTH_EXPORT')).toEqual(['dailies', 'sleeps', 'userMetrics']);
    expect(garminBackfillTypes('ACTIVITY_EXPORT')).toEqual(['activities']);
    expect(garminBackfillTypes('ACTIVITY_EXPORT HEALTH_EXPORT')).toEqual(['dailies', 'activities', 'sleeps', 'userMetrics']);
    expect(garminBackfillTypes('')).toEqual([]);
  });

  it('continues after 412, returns permission when every type is refused, and starts cooldown only after an accept', () => {
    expect(garminBackfillDecision([412, 202])).toEqual({ code: 'asked', accepted: true });
    expect(garminBackfillDecision([412, 403])).toEqual({ code: 'permission', accepted: false });
    expect(garminBackfillDecision([403, 412, 403])).toEqual({ code: 'permission', accepted: false });
    expect(garminBackfillDecision([202, 429])).toEqual({ code: 'rate', accepted: true });
    expect(garminBackfillDecision([429])).toEqual({ code: 'rate', accepted: false });
    expect(garminBackfillDecision([400, 500])).toEqual({ code: 'backfill', accepted: false });
    expect(garminBackfillDecision([])).toEqual({ code: 'permission', accepted: false });
    const refresh = readFileSync('supabase/functions/garmin-refresh/index.ts', 'utf8');
    expect(refresh.indexOf('garminBackfillDecision(statuses)')).toBeLessThan(refresh.indexOf('last_manual_refresh_at: new Date'));
    expect(refresh).toContain('if (decision.accepted)');
    expect(refresh).toContain("code: 'permission'");
    expect(refresh).toContain("code: 'rate'");
    expect(refresh).not.toContain('response.text()');
    expect(refresh).not.toContain('response.json()');
    expect(garminAllHistoricalRefusal([412, 412, 412, 412])).toBe(true);
    expect(garminAllHistoricalRefusal([412, 202])).toBe(false);
    expect(garminAllHistoricalRefusal([412, 403])).toBe(false);
    expect(garminAllHistoricalRefusal([])).toBe(false);
    const day = 24 * 60 * 60 * 1000;
    expect(garminHistoryCooling(new Date(now - day + 1000).toISOString(), now)).toBe(true);
    expect(garminHistoryCooling(new Date(now - day).toISOString(), now)).toBe(false);
    expect(garminHistoryCooling(null, now)).toBe(false);
    expect(garminHistoryBody()).toEqual({ ok: true, garmin: 'recent', code: 'history' });
    expect(refresh).toContain('garminHistoryBody()');
    expect(refresh).toContain("code: 'rate' }, 200");
    expect(refresh).toContain("code: 'permission', missing }, 200");
    expect(refresh).toContain("code: 'unauthorised' }, 401");
    expect(refresh).not.toContain("code: 'rate' }, 429");
    expect(refresh).not.toContain("code: 'permission' }, 403");
    expect(refresh).toContain('history_backfill_refused_at');
    const sql = readFileSync('supabase/migrations/20261023210000_garmin_history_refusal.sql', 'utf8');
    expect(sql).toContain('history_backfill_refused_at');
    expect(sql).toContain('last_push_at');
    expect(sql).not.toMatch(/latitude|longitude/);
    expect(sql).not.toMatch(/grant /i);
  });

  it('stores null when the permissions lookup fails, and logs the status only', async () => {
    expect(garminPermissionText(['HEALTH_EXPORT', 'nope', 'ACTIVITY_EXPORT'])).toBe('HEALTH_EXPORT ACTIVITY_EXPORT');
    expect(garminPermissionText([])).toBe('');
    expect(garminPermissionText({ permissions: ['HEALTH_EXPORT'] })).toBe('HEALTH_EXPORT');
    expect(garminPermissionText({ unexpected: true })).toBeNull();
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((message?: unknown) => {
      errors.push(String(message));
    });
    const token = 'secret-access-token';
    const ok = await readGarminPermissions(token, async (url, init) => {
      expect(String(url)).toBe(GARMIN_PERMISSIONS_URL);
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${token}`);
      return new Response(JSON.stringify(['HEALTH_EXPORT']), { status: 200 });
    });
    expect(ok).toBe('HEALTH_EXPORT');
    const refused = await readGarminPermissions(token, async () => new Response('historical data permission not granted', { status: 412 }));
    expect(refused).toBeNull();
    const thrown = await readGarminPermissions(token, async () => {
      throw new Error(`boom ${token}`);
    });
    expect(thrown).toBeNull();
    expect(errors).toContain('garmin-permissions: 412');
    expect(errors).toContain('garmin-permissions: 0');
    expect(errors.join('\n')).not.toContain(token);
    expect(errors.join('\n')).not.toContain('historical data');
    const callback = readFileSync('supabase/functions/garmin-oauth-callback/index.ts', 'utf8');
    expect(callback).toContain('readGarminPermissions(tokens.accessToken)');
    expect(callback).toContain('permissions,');
    expect(callback).not.toContain("return ''");
    const sql = readFileSync('supabase/migrations/20261023190000_garmin_permissions_null.sql', 'utf8');
    expect(sql).toContain('alter column permissions drop not null');
    expect(sql).not.toMatch(/latitude|longitude/);
    expect(sql).not.toMatch(/grant /i);
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    expect(repo).toContain('readGarminRefreshBody');
    expect(repo).toContain("code === 'permission'");
    expect(repo).toContain('GARMIN_PERMISSION');
    expect(repo).toContain("code === 'rate'");
    expect(repo).toContain('Could not ask Garmin for new data.');
    expect(GARMIN_PERMISSION).toBe("Garmin hasn't given Charioteer permission yet. In Garmin Connect, open Charioteer under connected apps, turn on Activities and Daily Health Stats, then disconnect and reconnect Garmin here. Automatic syncing still works once those are on.");
  });
});
