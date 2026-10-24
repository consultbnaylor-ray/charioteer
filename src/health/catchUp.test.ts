import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { catchUpAppleHealthReads, healthCatchUpGate, healthCatchUpImports } from './catchUp';

describe('Apple Health catch-up', () => {
  it('imports when the read set is already current, and skips a device with no Health store', () => {
    expect(healthCatchUpImports('current')).toBe(true);
    expect(healthCatchUpImports('requested')).toBe(true);
    expect(healthCatchUpImports('unavailable')).toBe(false);
    expect(healthCatchUpImports('web')).toBe(false);
    expect(healthCatchUpImports('waiting')).toBe(false);
  });

  it('waits until the profile is loaded and does not log that pause', async () => {
    expect(healthCatchUpGate({ profile: null })).toBe('wait');
    expect(healthCatchUpGate({ profile: { consentHealth: false } })).toBe('skip');
    expect(healthCatchUpGate({ profile: { consentHealth: true } })).toBe('run');

    const source = readFileSync('src/health/catchUp.ts', 'utf8');
    const run = source.slice(source.indexOf('async function runCatchUp'));
    expect(run.indexOf("healthCatchUpGate(repo.getSnapshot()) !== 'run'")).toBeLessThan(run.indexOf('deps.ensureReads()'));
    expect(run.indexOf('deps.ensureReads()')).toBeLessThan(run.indexOf('deps.refresh('));
    expect(run).toContain("console.warn('[health] authorization request failed')");
    expect(run.indexOf('try {')).toBeLessThan(run.indexOf('deps.ensureReads()'));
    const upload = source.slice(source.lastIndexOf('} catch (error) {'));
    expect(upload.indexOf('profile == null')).toBeGreaterThan(-1);
    expect(upload.indexOf('profile == null')).toBeLessThan(upload.indexOf('reportHealthRefresh'));
    expect(source).not.toContain('Health data stays off until you give consent.');

    let profile: { consentHealth: boolean } | null = null;
    const logs: string[] = [];
    const listeners: Array<() => void> = [];
    const repo = {
      getSnapshot: () => ({ profile }),
      subscribe: (listener: () => void) => {
        listeners.push(listener);
        return () => {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        };
      },
      logClientError: async (screen: string, message: string) => {
        logs.push(`${screen} ${message}`);
        return true;
      },
      saveHealth: async () => {
        throw new Error('Health data stays off until you give consent.');
      },
      saveBodyComposition: async () => undefined,
      setNutritionSettings: async () => undefined,
    };
    let refreshes = 0;
    const waiting = catchUpAppleHealthReads(repo as never, {
      ensureReads: async () => 'current',
      refresh: async () => {
        refreshes += 1;
        return { ok: true, syncedAt: '2026-10-22T00:00:00.000Z' };
      },
    });
    await Promise.resolve();
    expect(refreshes).toBe(0);
    expect(logs).toEqual([]);
    expect(listeners).toHaveLength(1);

    profile = { consentHealth: false };
    listeners[0]?.();
    const skipped = await waiting;
    expect(skipped).toEqual({ status: 'waiting', imported: false, syncedAt: null, error: null });
    expect(refreshes).toBe(0);
    expect(logs).toEqual([]);

    profile = { consentHealth: true };
    const ran = await catchUpAppleHealthReads(repo as never, {
      ensureReads: async () => 'current',
      refresh: async () => {
        refreshes += 1;
        return { ok: true, syncedAt: '2026-10-22T00:00:00.000Z' };
      },
    });
    expect(ran.error).toBeNull();
    expect(ran.imported).toBe(true);
    expect(refreshes).toBe(1);
    expect(logs).toEqual([]);
  });

  it('returns a visible error and does not authorise again on the automatic import', () => {
    const source = readFileSync('src/health/catchUp.ts', 'utf8');
    expect(source).toContain('healthCatchUpImports(status)');
    expect(source).toContain('{ authorize: false }');
    expect(source).toContain('shownError');
    expect(source).toContain('APPLE_HEALTH_READ_ERROR');
    expect(source).toContain("logClientError('health-refresh'");
    expect(source).not.toContain("status !== 'requested'");
    const sync = readFileSync('src/health/sync.ios.ts', 'utf8');
    const body = sync.slice(sync.indexOf('export async function syncAppleHealth'), sync.indexOf('const end = new Date()'));
    expect(body).toContain('options?.authorize !== false');
    expect(body).toContain('requestAuthorization');
  });

  it('shows the failure on the health screen and retries the import when the app resumes', () => {
    const screen = readFileSync('src/app/(main)/health.tsx', 'utf8');
    expect(screen).toContain('result.error');
    expect(screen).toContain('setRefreshError(result.error)');
    expect(screen).not.toContain('.catch(() => undefined)');
    expect(screen).toContain("AppState.addEventListener('change'");
    expect(screen).toContain("router.push('/sign-in'");
    expect(screen).toContain('setUpdatedAt(pulled.syncedAt)');
    expect(screen).toContain('setUpdatedAt(result.syncedAt)');
    expect(screen).toContain('updatedAt={updatedAt}');
    expect(screen).toContain('const saveBar = Boolean(value.trim()) || savePending || savedNote != null;');
    expect(screen).toContain('footer={saveBar ?');
    expect(screen).not.toContain('weightDraft');
    const weight = readFileSync('src/app/(main)/weight-waist.tsx', 'utf8');
    expect(weight).toContain('const saveBar = weightDraft != null || savePending || savedNote != null;');
    expect(weight).toContain('footer={saveBar ?');
    expect(weight).toContain('<PlanTick done');
    expect(weight).toContain('setRefreshError(result.error)');
    expect(weight).toContain("AppState.addEventListener('change'");
    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    const resume = layout.slice(layout.indexOf("AppState.addEventListener('change'"), layout.indexOf('const arrivals'));
    expect(resume).toContain('catchUpAppleHealthReads');
    expect(resume).toContain('result.error');
    const ui = readFileSync('src/ui/ui.tsx', 'utf8');
    expect(ui).toContain('style={{ flex: 1 }}');
    expect(ui).toContain('footer ? 24 : 0');
    const card = readFileSync('src/ui/AppleHealthCard.tsx', 'utf8');
    expect(card).toContain('label="Sign in"');
    expect(card).toContain('refreshError === SIGN_IN_FIRST');
    expect(card).toContain('appleHealthUpdatedLine(updatedAt)');
  });
});
