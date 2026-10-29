import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  GARMIN_CONNECT_BUTTON,
  GARMIN_CONNECT_HINT,
  GARMIN_CONNECTED_LABEL,
  GARMIN_ONBOARDING_CARD,
  GARMIN_SKIP,
} from './garminTip';

const OTHER_APPS = /strava|whoop|polar|suunto|coros|fitbit|oura|peloton|zwift/i;

describe('Garmin connect card', () => {
  it('says how to connect, and that route maps still need an Apple workout', () => {
    expect(GARMIN_CONNECT_BUTTON).toBe('Connect Garmin');
    expect(GARMIN_CONNECT_HINT).toBe(
      'Connect your Garmin to bring in workouts, heart rate and sleep. Route maps still need an Apple Watch or iPhone-recorded workout.',
    );
    expect(GARMIN_CONNECTED_LABEL).toBe('Garmin connected ✓');
    expect(GARMIN_ONBOARDING_CARD).toBe('Using a Garmin? Connect it to bring in workouts, heart rate and sleep.');
    expect(GARMIN_SKIP).toBe('Skip for now');
    expect(`${GARMIN_CONNECT_HINT} ${GARMIN_ONBOARDING_CARD}`).not.toMatch(/this goal|your goal/i);
    expect(`${GARMIN_CONNECT_BUTTON} ${GARMIN_CONNECT_HINT} ${GARMIN_ONBOARDING_CARD}`).not.toMatch(OTHER_APPS);
  });

  it('puts an obvious connect card on Health and Your fitness, with no dismiss', () => {
    const health = readFileSync('src/app/(main)/health.tsx', 'utf8');
    const fitness = readFileSync('src/ui/YourFitness.tsx', 'utf8');
    const tip = readFileSync('src/ui/GarminTip.tsx', 'utf8');
    expect(health).toContain('<GarminTip />');
    expect(health.indexOf('<AppleHealthCard')).toBeLessThan(health.indexOf('<GarminTip />'));
    expect(health.indexOf('<GarminTip />')).toBeLessThan(health.indexOf('<HealthVisibility\n'));
    expect(fitness).toContain('<GarminTip />');
    expect(fitness.indexOf('Your fitness')).toBeLessThan(fitness.indexOf('<GarminTip />'));
    expect(tip).toContain('GARMIN_CONNECT_BUTTON');
    expect(tip).toContain('GARMIN_CONNECT_HINT');
    expect(tip).toContain('GARMIN_CONNECTED_LABEL');
    expect(tip).toContain('useGarminConnect');
    expect(tip).toContain('label="Disconnect"');
    expect(tip).not.toMatch(/Hide|Dismiss|statsTone|danger|PlanTick/);
    expect(tip).not.toMatch(OTHER_APPS);
  });

  it('offers Connect Garmin during onboarding, and a return stays on that step', () => {
    const onboarding = readFileSync('src/app/onboarding.tsx', 'utf8');
    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    expect(onboarding).toContain('const STEPS = 9');
    expect(onboarding).toContain('const GARMIN_STEP = 7');
    expect(onboarding).toContain('GARMIN_ONBOARDING_CARD');
    expect(onboarding).toContain('GARMIN_CONNECT_BUTTON');
    expect(onboarding).toContain('GARMIN_SKIP');
    expect(onboarding).toContain('<PlanTick done />');
    expect(onboarding).toContain('GARMIN_CONNECTED_LABEL');
    expect(onboarding).toContain('onboardingResumesOnGarmin()');
    expect(layout).toContain('holdOnboardingGarminStep()');
    expect(layout).toContain("pathnameRef.current === '/onboarding' || !onboardedRef.current");
    const stay = layout.indexOf('stayOnOnboarding');
    const profile = layout.indexOf('/profile?garmin=');
    expect(stay).toBeGreaterThan(-1);
    expect(profile).toBeGreaterThan(stay);
  });
});
