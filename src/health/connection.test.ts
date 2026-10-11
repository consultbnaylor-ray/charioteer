import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  APPLE_HEALTH_CONSENT,
  APPLE_HEALTH_DENIED,
  APPLE_HEALTH_INTRO,
  APPLE_HEALTH_READ_TYPES,
  APPLE_HEALTH_WEB,
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
    expect(APPLE_HEALTH_INTRO).toContain('never writes');
    expect(APPLE_HEALTH_INTRO).toContain('Settings > Health > Data Access & Devices');
    const connected = healthCardState({ consent: true, ios: true, access: 'connected', syncedAt: synced });
    expect(connected).toEqual({
      kind: 'connected',
      line: 'Connected to Apple Health · last synced 11 October 2026 09:10',
    });
    expect(connectedAppleHealthLine(null)).toBe('Connected to Apple Health');
    expect(healthCardState({ consent: true, ios: true, access: 'denied', syncedAt: null }).kind).toBe('denied');
    expect(APPLE_HEALTH_DENIED).toBe(
      'Apple Health access is off. Turn it on in Settings > Health > Data Access & Devices > Charioteer.',
    );
    expect(isHealthAccessDenied('Apple Health access was not granted.')).toBe(true);
    expect(isHealthAccessDenied('Apple Health is not available on this device.')).toBe(false);
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
    expect(readFileSync('src/ui/SectionDrawer.tsx', 'utf8')).toContain('<Pulse');
    expect(screen).toContain('AppleHealthCard');
    expect(screen).toContain("router.push('/privacy'");
    expect(screen).not.toContain('Sync from Apple Health');
    expect(card).toContain('Connect Apple Health');
    expect(card).toContain('Sync now');
    expect(card).toContain('Manage in Health app');
    expect(card).toContain('Open Settings');
    expect(card).toContain('Turn on health data');
  });

  it('opens the Health app and falls back to Settings', () => {
    expect(ios).toContain("Linking.openURL('x-apple-health://')");
    expect(ios).toContain('Linking.openSettings()');
    expect(ios).toContain('requestAuthorization');
    for (const type of APPLE_HEALTH_READ_TYPES) {
      expect(readFileSync('src/health/sync.ios.ts', 'utf8')).toContain('APPLE_HEALTH_READ_TYPES');
      expect(APPLE_HEALTH_READ_TYPES).toContain(type);
    }
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
