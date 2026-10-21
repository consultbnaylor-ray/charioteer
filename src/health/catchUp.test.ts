import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { healthCatchUpImports } from './catchUp';

describe('Apple Health catch-up', () => {
  it('imports when the read set is already current, and skips a device with no Health store', () => {
    expect(healthCatchUpImports('current')).toBe(true);
    expect(healthCatchUpImports('requested')).toBe(true);
    expect(healthCatchUpImports('unavailable')).toBe(false);
    expect(healthCatchUpImports('web')).toBe(false);
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
    expect(screen).toContain('const saveBar = Boolean(value.trim()) || weightDraft != null || savePending || savedNote != null');
    expect(screen).toContain('footer={saveBar ?');
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
