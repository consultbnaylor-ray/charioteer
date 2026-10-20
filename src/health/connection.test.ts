import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  APPLE_HEALTH_CONSENT,
  APPLE_HEALTH_DENIED,
  APPLE_HEALTH_DETAILS,
  APPLE_HEALTH_INTRO,
  APPLE_HEALTH_READ_TYPES,
  APPLE_HEALTH_REFRESH,
  APPLE_HEALTH_TURN_ON,
  APPLE_HEALTH_WEB,
  appleHealthStatusLine,
  appleHealthUpdatedLine,
  connectedAppleHealthLine,
  healthCardState,
  isHealthAccessDenied,
} from './connection';

describe('Apple Health card', () => {
  const synced = new Date(2026, 9, 11, 9, 10).toISOString();

  it('asks for consent before it offers a connection', () => {
    expect(healthCardState({ consent: false, ios: true, access: 'prompt', syncedAt: null })).toEqual({ kind: 'consent' });
    expect(healthCardState({ consent: false, ios: false, access: 'web', syncedAt: null })).toEqual({ kind: 'consent' });
    expect(APPLE_HEALTH_CONSENT).toContain('Privacy & consent');
  });

  it('tells a web visitor to use the iPhone app', () => {
    expect(healthCardState({ consent: true, ios: false, access: 'web', syncedAt: null })).toEqual({ kind: 'web' });
    expect(APPLE_HEALTH_WEB).toBe('Apple Health connects in the iPhone app. Here you can log readings yourself.');
  });

  it('offers connect, then a synced line, and a denied line', () => {
    expect(healthCardState({ consent: true, ios: true, access: null, syncedAt: null }).kind).toBe('checking');
    expect(healthCardState({ consent: true, ios: true, access: 'prompt', syncedAt: null }).kind).toBe('prompt');
    expect(APPLE_HEALTH_INTRO).toContain('writes only the meals and water you save');
    expect(APPLE_HEALTH_INTRO).toContain('does not write steps, sleep, heart rate, or weight');
    expect(APPLE_HEALTH_INTRO).toContain('Settings > Health > Data Access & Devices');
    const connected = healthCardState({ consent: true, ios: true, access: 'connected', syncedAt: synced });
    expect(connected).toEqual({
      kind: 'connected',
      line: 'Connected to Apple Health · last synced 11 October 2026 09:10',
    });
    expect(connectedAppleHealthLine(null)).toBe('Connected to Apple Health');
    expect(healthCardState({ consent: true, ios: true, access: 'denied', syncedAt: null }).kind).toBe('denied');
    expect(APPLE_HEALTH_DENIED).toContain('profile picture (top right) > Privacy > Apps > Charioteer');
    expect(APPLE_HEALTH_DENIED).toContain('Settings > Health > Data Access & Devices > Charioteer');
    expect(APPLE_HEALTH_DENIED).not.toMatch(/access is off|switched off/i);
    expect(isHealthAccessDenied('Apple Health access was not granted.')).toBe(true);
    expect(isHealthAccessDenied('Apple Health is not available on this device.')).toBe(false);
  });

  it('names connected with the clock, or not connected, or each missing reading', () => {
    const base = { consent: true, ios: true, access: 'connected' as const, syncedAt: synced, missingTitles: [] as string[] };
    expect(appleHealthStatusLine(base)).toBe('Apple Health: connected, last updated 09:10');
    expect(appleHealthStatusLine({ ...base, syncedAt: null })).toBe('Apple Health: connected');
    expect(appleHealthStatusLine({
      ...base,
      missingTitles: ['Heart rate recovery', 'Body fat', 'Lean mass'],
    })).toBe('Apple Health: Missing: Heart rate recovery, Body fat, Lean mass');
    expect(appleHealthStatusLine({ ...base, access: 'denied' })).toBe('Apple Health: Not connected');
    expect(appleHealthStatusLine({ ...base, access: 'prompt' })).toBe('Apple Health: Not connected');
    expect(appleHealthStatusLine({ ...base, access: null })).toBe('Apple Health: checking');
    expect(appleHealthStatusLine({ ...base, consent: false })).toBe('Apple Health: Not connected');
    expect(appleHealthStatusLine({ ...base, ios: false, access: 'web' })).toBe('Apple Health: Not connected');
    expect(APPLE_HEALTH_REFRESH).toBe('Refresh now');
    expect(appleHealthUpdatedLine(synced)).toBe('Updated 09:10');
    expect(APPLE_HEALTH_TURN_ON).toBe('Turn on in Apple Health');
    expect(APPLE_HEALTH_DETAILS).toBe('Details');
  });
});

describe('Apple Health screen and entitlement', () => {
  const screen = readFileSync('src/app/(main)/health.tsx', 'utf8');
  const card = readFileSync('src/ui/AppleHealthCard.tsx', 'utf8');
  const ios = readFileSync('src/health/link.ios.ts', 'utf8');
  const app = readFileSync('app.json', 'utf8');
  const plugin = readFileSync('node_modules/@react-native-healthkit/core/src/plugin/index.ts', 'utf8');

  it('replaces the developer intro with the connection card and keeps manual entry', () => {
    expect(screen).not.toContain('dev build');
    expect(screen).toContain('eyebrow="Health Stats"');
    expect(screen).toContain('Or add a reading yourself');
    expect(screen).toContain('HealthBoard');
    expect(screen).toContain('HealthReadings');
    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    expect(home).toContain('Health Stats');
    expect(home).toContain('See all');
    expect(home).toContain("router.push('/health'");
    expect(home).toContain('buildHealthInsights');
    expect(home).not.toContain('>Body<');
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    expect(you).not.toContain('Health readings');
    expect(you).toContain('ConsentChoices');
    const sections = readFileSync('src/domain/sections.ts', 'utf8');
    expect(sections).toContain("label: 'Health Stats'");
    expect(sections).toContain("href: '/health'");
    expect(sections).toContain("icon: 'pulse'");
    expect(sections).toContain("group: 'tools'");
    expect(readFileSync('src/ui/SectionDrawer.tsx', 'utf8')).toContain('<MenuGlyph');
    expect(readFileSync('src/ui/menuIcons.tsx', 'utf8')).toContain("name === 'pulse'");
    expect(screen).toContain('AppleHealthCard');
    expect(screen).toContain("router.push('/privacy'");
    expect(screen).not.toContain('Sync from Apple Health');
    const cardAt = screen.indexOf('<AppleHealthCard');
    const seeAt = screen.indexOf('<HealthVisibility\n');
    const periodAt = screen.indexOf('<StatPeriodToggle');
    expect(readFileSync('src/ui/StatPeriodToggle.tsx', 'utf8')).toContain('accessibilityLabel="Period"');
    const boardAt = screen.indexOf('<HealthStatBoard');
    expect(cardAt).toBeGreaterThan(-1);
    expect(cardAt).toBeLessThan(seeAt);
    expect(seeAt).toBeLessThan(periodAt);
    expect(periodAt).toBeLessThan(boardAt);
    expect(screen).toContain('onRefresh={() => void refreshNow()}');
    expect(screen).toContain('request={seeRequest}');
    expect(screen).toContain('healthMissingReadings');
    expect(card).toContain('HEALTH_MISSING_DETAIL');
    expect(card).toContain('missingOpen');
    expect(card).toContain('gap.line');
    expect(card).toContain('Connect Apple Health');
    expect(card).toContain('APPLE_HEALTH_REFRESH');
    expect(card).toContain('appleHealthUpdatedLine');
    expect(card).toContain('SIGN_IN_FIRST');
    expect(card).toContain('label="Sign in"');
    expect(card).toContain('APPLE_HEALTH_TURN_ON');
    expect(card).toContain('HEALTH_VISIBILITY_TITLE');
    expect(card).toContain('PlanTick');
    expect(card).toContain('useState(false)');
    expect(card).toContain('ErrorNote');
    expect(card).not.toContain('Sync now');
    expect(card).toContain('Manage in Health app');
    expect(card).toContain('Open Settings');
    expect(card).toContain('Turn on health data');
    expect(card).toContain('APPLE_HEALTH_INTRO');
  });

  it('opens the Health app and falls back to Settings', () => {
    expect(ios).toContain("Linking.openURL('x-apple-health://')");
    expect(ios).toContain('Linking.openSettings()');
    expect(ios).toContain('requestAuthorization');
    const sync = readFileSync('src/health/sync.ios.ts', 'utf8');
    for (const type of APPLE_HEALTH_READ_TYPES) {
      expect(sync).toContain('APPLE_HEALTH_READ_TYPES');
      expect(APPLE_HEALTH_READ_TYPES).toContain(type);
    }
    expect(sync).toContain("queryQuantitySamples('HKQuantityTypeIdentifierBodyMass'");
    expect(sync).toContain("queryQuantitySamples('HKQuantityTypeIdentifierHeight'");
    expect(sync).toContain("queryQuantitySamples('HKQuantityTypeIdentifierBodyFatPercentage'");
    expect(sync).toContain("queryQuantitySamples('HKQuantityTypeIdentifierLeanBodyMass'");
    expect(APPLE_HEALTH_READ_TYPES).toContain('HKQuantityTypeIdentifierBodyFatPercentage');
    expect(APPLE_HEALTH_READ_TYPES).toContain('HKQuantityTypeIdentifierLeanBodyMass');
    expect(sync).toContain('readAppleHealthBody');
    expect(APPLE_HEALTH_READ_TYPES).toContain('HKQuantityTypeIdentifierHeight');
    expect(sync).toContain("rows('weight_kg', 'kg'");
  });

  it('ships the HealthKit entitlement and the share description for the next archive', () => {
    expect(app).toContain('"com.apple.developer.healthkit": true');
    expect(app).toContain('NSHealthShareUsageDescription');
    expect(app).toContain('x-apple-health');
    expect(app).toContain('"background": false');
    expect(plugin).toContain("configPlist.modResults['com.apple.developer.healthkit'] = true");
    expect(plugin).toContain('NSHealthShareUsageDescription');
  });
});
