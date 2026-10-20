import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  GARMIN_TIP_BODY,
  GARMIN_TIP_DEVICE,
  GARMIN_TIP_TITLE,
  garminTipDismissedIn,
  garminTipProfileKey,
  withGarminTipDismissed,
} from './garminTip';

const OTHER_APPS = /strava|whoop|polar|suunto|coros|fitbit|oura|peloton|zwift/i;

describe('Garmin tip', () => {
  it('says how Garmin reaches Charioteer, and what it leaves out', () => {
    expect(GARMIN_TIP_TITLE).toBe('Using a Garmin?');
    expect(GARMIN_TIP_BODY).toBe(
      "Charioteer reads from Apple Health. In the Garmin Connect app, go to the Apple Health connection setting and switch on sharing, so workouts, heart rate, steps and sleep flow in. Garmin doesn't send VO2 max or GPS routes to Apple Health, so the VO2 card and route maps need an Apple Watch or iPhone-recorded workout.",
    );
    expect(GARMIN_TIP_BODY).not.toMatch(/this goal|your goal/i);
    expect(`${GARMIN_TIP_TITLE} ${GARMIN_TIP_BODY}`).not.toMatch(OTHER_APPS);
  });

  it('remembers a dismiss for one profile, and keeps a device fallback', () => {
    expect(garminTipProfileKey(' alex ')).toBe('alex');
    expect(garminTipProfileKey('')).toBe(GARMIN_TIP_DEVICE);
    expect(garminTipProfileKey(null)).toBe(GARMIN_TIP_DEVICE);
    expect(garminTipDismissedIn(null, 'alex')).toBe(false);
    expect(garminTipDismissedIn(null, '')).toBe(false);
    const saved = withGarminTipDismissed(null, 'alex');
    expect(garminTipDismissedIn(saved, 'alex')).toBe(true);
    expect(garminTipDismissedIn(saved, 'sam')).toBe(false);
    expect(garminTipDismissedIn(withGarminTipDismissed(saved, 'sam'), 'alex')).toBe(true);
    expect(garminTipDismissedIn('{', 'alex')).toBe(false);
    expect(garminTipDismissedIn('[]', 'alex')).toBe(false);
    expect(withGarminTipDismissed(null, '')).toBe('{}');
  });

  it('sits by Apple Health and the fitness card, collapsed, monochrome, and dismissible', () => {
    const health = readFileSync('src/app/(main)/health.tsx', 'utf8');
    const fitness = readFileSync('src/ui/YourFitness.tsx', 'utf8');
    const tip = readFileSync('src/ui/GarminTip.tsx', 'utf8');
    const store = readFileSync('src/ui/garminTipStore.ts', 'utf8');
    expect(health).toContain('<GarminTip />');
    expect(health.indexOf('<AppleHealthCard')).toBeLessThan(health.indexOf('<GarminTip />'));
    expect(health.indexOf('<GarminTip />')).toBeLessThan(health.indexOf('<HealthVisibility\n'));
    expect(fitness).toContain('<GarminTip />');
    expect(fitness.indexOf('Your fitness')).toBeLessThan(fitness.indexOf('<GarminTip />'));
    expect(tip).toContain('GARMIN_TIP_TITLE');
    expect(tip).toContain('GARMIN_TIP_BODY');
    expect(tip).toContain("open ? 'Hide' : 'Show'");
    expect(tip).toContain('accessibilityState={{ expanded: open }}');
    expect(tip).toContain('Dismiss Using a Garmin?');
    expect(tip).toContain('>Dismiss<');
    expect(tip).toContain('minHeight: 44');
    expect(tip).toContain('useState(false)');
    expect(tip).toContain('dismissed !== false');
    expect(tip).toContain('theme.colors.ink');
    expect(tip).not.toMatch(/statsTone|danger/);
    expect(tip).not.toMatch(OTHER_APPS);
    expect(store).toContain('charioteer.garmin.tip.v1');
    expect(store).toContain('markGarminTipDismissed');
  });
});
