import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  GARMIN_CONNECT_SETTINGS_URL,
  GARMIN_NOT_SENDING,
  GARMIN_PERMISSIONS_ALLOW,
  GARMIN_PERMISSIONS_FIX,
  GARMIN_PERMISSIONS_NEED,
  GARMIN_PERMISSIONS_OK,
  GARMIN_PERMISSIONS_SETTINGS,
  garminMissingPermissions,
  garminPermissionCheckDue,
  garminPermissionStatus,
} from './garminPermission';

const now = Date.parse('2026-10-23T12:00:00Z');
const day = 24 * 60 * 60 * 1000;

describe('Garmin permission detection', () => {
  it('names the exports that are missing, and both when the list is unknown', () => {
    expect(garminMissingPermissions(null)).toEqual(['ACTIVITY_EXPORT', 'HEALTH_EXPORT']);
    expect(garminMissingPermissions('')).toEqual(['ACTIVITY_EXPORT', 'HEALTH_EXPORT']);
    expect(garminMissingPermissions('ACTIVITY_EXPORT')).toEqual(['HEALTH_EXPORT']);
    expect(garminMissingPermissions('HEALTH_EXPORT')).toEqual(['ACTIVITY_EXPORT']);
    expect(garminMissingPermissions('ACTIVITY_EXPORT HEALTH_EXPORT')).toEqual([]);
    expect(garminMissingPermissions('ACTIVITY_EXPORT_EXTRA HEALTH_EXPORT')).toEqual(['ACTIVITY_EXPORT']);
  });

  it('asks again a day after the last permissions read', () => {
    expect(garminPermissionCheckDue(null, now)).toBe(true);
    expect(garminPermissionCheckDue('not-a-date', now)).toBe(true);
    expect(garminPermissionCheckDue(new Date(now - day + 1000).toISOString(), now)).toBe(false);
    expect(garminPermissionCheckDue(new Date(now - day).toISOString(), now)).toBe(true);
  });

  it('needs a repair when an export is missing, a refresh was refused, or a day passed with no rows', () => {
    const connectedAt = new Date(now - 2 * day).toISOString();
    const recent = new Date(now - 60 * 60 * 1000).toISOString();
    expect(garminPermissionStatus({
      connected: false,
      connectedAt,
      nowMs: now,
      garminRowCount: 0,
      storedNeeds: true,
      storedMissing: 'ACTIVITY_EXPORT HEALTH_EXPORT',
    })).toEqual({ needs: false, missing: [] });
    expect(garminPermissionStatus({
      connected: true,
      connectedAt: recent,
      nowMs: now,
      garminRowCount: 0,
      storedNeeds: null,
      storedMissing: 'HEALTH_EXPORT',
    })).toEqual({ needs: true, missing: ['HEALTH_EXPORT'] });
    expect(garminPermissionStatus({
      connected: true,
      connectedAt,
      nowMs: now,
      garminRowCount: 0,
      storedNeeds: null,
      storedMissing: '',
    })).toEqual({ needs: true, missing: [] });
    expect(garminPermissionStatus({
      connected: true,
      connectedAt: recent,
      nowMs: now,
      garminRowCount: 0,
      storedNeeds: null,
      storedMissing: '',
    })).toEqual({ needs: false, missing: [] });
    expect(garminPermissionStatus({
      connected: true,
      connectedAt,
      nowMs: now,
      garminRowCount: 2,
      storedNeeds: false,
      storedMissing: '',
      refreshRefused: true,
    })).toEqual({ needs: true, missing: [] });
    expect(garminPermissionStatus({
      connected: true,
      connectedAt,
      nowMs: now,
      garminRowCount: 2,
      storedNeeds: true,
      storedMissing: 'ACTIVITY_EXPORT',
    })).toEqual({ needs: true, missing: ['ACTIVITY_EXPORT'] });
    expect(garminPermissionStatus({
      connected: true,
      connectedAt,
      nowMs: now,
      garminRowCount: 0,
      storedNeeds: false,
      storedMissing: '',
    }).needs).toBe(false);
  });

  it('publishes the flag on the status view and keeps tokens off it', () => {
    const sql = readFileSync('supabase/migrations/20261023200000_garmin_permission_status.sql', 'utf8');
    expect(sql).toContain('permissions_checked_at');
    expect(sql).toContain('as needs_permissions');
    expect(sql).toContain('as missing_permissions');
    expect(sql).toContain("'ACTIVITY_EXPORT'");
    expect(sql).toContain("'HEALTH_EXPORT'");
    expect(sql).toContain("connected_at < now() - interval '24 hours'");
    expect(sql).not.toMatch(/\bpermissions,/);
    expect(sql).not.toMatch(/\baccess_token\b/);
    expect(sql).not.toMatch(/latitude|longitude/);
    expect(sql).not.toMatch(/grant /i);
    const refresh = readFileSync('supabase/functions/garmin-refresh/index.ts', 'utf8');
    expect(refresh).toContain("check === 'permissions'");
    expect(refresh).toContain('garminPermissionCheckDue');
    expect(refresh.indexOf('if (permissionCheck)')).toBeLessThan(refresh.indexOf('garminBackfillUrl(type'));
    const webhook = readFileSync('supabase/functions/garmin-webhook/index.ts', 'utf8');
    expect(webhook).toContain('permissions: change.permissions');
    expect(webhook).toContain('permissions_checked_at');
    expect(webhook).toContain("includes('permissions_checked_at')");
  });

  it('shows the repair banner on the Garmin cards and in the refresh error', () => {
    expect(GARMIN_NOT_SENDING).toBe("Garmin isn't sending your data yet");
    expect(GARMIN_PERMISSIONS_NEED).toBe('Charioteer needs permission for Activities and Daily Health Stats.');
    expect(GARMIN_PERMISSIONS_FIX).toBe('Fix Garmin permissions');
    expect(GARMIN_PERMISSIONS_ALLOW).toBe('Turn on every switch, then tap Allow.');
    expect(GARMIN_PERMISSIONS_SETTINGS).toBe('Open Garmin Connect settings');
    expect(GARMIN_PERMISSIONS_OK).toBe('Garmin permissions OK');
    expect(GARMIN_CONNECT_SETTINGS_URL).toBe('https://connect.garmin.com/modern/settings/accountInformation');
    const notice = readFileSync('src/ui/GarminPermissionNotice.tsx', 'utf8');
    expect(notice).toContain('GARMIN_NOT_SENDING');
    expect(notice).toContain('GARMIN_PERMISSIONS_FIX');
    expect(notice).toContain('GARMIN_PERMISSIONS_ALLOW');
    expect(notice).toContain('GARMIN_CONNECT_SETTINGS_URL');
    expect(notice).toContain('<PlanTick done />');
    expect(notice).toContain('GARMIN_PERMISSIONS_OK');
    expect(notice).toContain('fixPermissions');
    expect(notice).not.toContain('gcm-ciq');
    expect(readFileSync('src/ui/GarminTip.tsx', 'utf8')).toContain('<GarminPermissionNotice />');
    expect(readFileSync('src/ui/YourFitness.tsx', 'utf8')).toContain('<GarminTip />');
    expect(readFileSync('src/app/(main)/health.tsx', 'utf8')).toContain('<GarminTip />');
    expect(readFileSync('src/app/(main)/health-plan.tsx', 'utf8')).toContain('<YourFitness');
    expect(readFileSync('src/app/(main)/stats.tsx', 'utf8')).toContain('<YourFitness />');
    expect(readFileSync('src/app/(main)/workouts.tsx', 'utf8')).toContain('<GarminPermissionNotice />');
    const bar = readFileSync('src/ui/HealthRefresh.tsx', 'utf8');
    expect(bar).toContain("garmin.code === 'permission'");
    expect(bar).toContain('<GarminPermissionNotice force />');
    const hook = readFileSync('src/ui/useGarminConnect.ts', 'utf8');
    expect(hook).toContain('checkGarminPermissions(true)');
    expect(hook).toContain('startGarminConnect');
    expect(hook).toContain('garminPermissionProbeDue');
    expect(hook).toContain('checkGarminPermissions(false)');
  });
});
