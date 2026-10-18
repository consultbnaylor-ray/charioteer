import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { APPLE_HEALTH_READ_TYPES } from '@/health/connection';
import {
  daysInLookback,
  healthReadSetChanged,
  healthReadSetKey,
  healthReadTitle,
  healthVisibilityLine,
  HEALTH_ASK_AGAIN,
  HEALTH_CHECK_AGAIN,
  HEALTH_SAMPLE_DAYS,
  HEALTH_VISIBILITY_NOTE,
  HEALTH_VISIBILITY_TITLE,
  unaskedHealthTypes,
} from '@/domain/healthVisibility';
import { buildHealthStatBoard } from '@/domain/healthStatTiles';

const now = new Date(2026, 9, 17, 15, 0, 0);

describe('what Charioteer can see', () => {
  it('asks again only when the read set has changed', () => {
    expect(healthReadSetChanged(null, APPLE_HEALTH_READ_TYPES)).toBe(true);
    const stored = healthReadSetKey(APPLE_HEALTH_READ_TYPES);
    expect(healthReadSetChanged(stored, APPLE_HEALTH_READ_TYPES)).toBe(false);
    expect(healthReadSetChanged(stored, APPLE_HEALTH_READ_TYPES.slice(0, -1))).toBe(true);
    const older = healthReadSetKey(APPLE_HEALTH_READ_TYPES.filter((type) => !type.includes('HeartRateRecovery')));
    expect(healthReadSetChanged(older, APPLE_HEALTH_READ_TYPES)).toBe(true);
  });

  it('counts sample days in the last 8 weeks and ignores today being empty', () => {
    expect(HEALTH_SAMPLE_DAYS).toBe(56);
    expect(daysInLookback(['2026-10-17', '2026-10-17'], now)).toBe(1);
    expect(daysInLookback(['2026-09-27', '2026-09-20'], now)).toBe(2);
    expect(daysInLookback(['2026-08-01'], now)).toBe(0);
    expect(daysInLookback(['2026-10-18'], now)).toBe(0);
  });

  it('says asked and days, and does not claim a read was allowed', () => {
    expect(healthVisibilityLine({ title: 'Heart rate recovery', asked: 'yes', days: 0 })).toBe(
      'Heart rate recovery: asked: yes; no data found in the last 8 weeks',
    );
    expect(healthVisibilityLine({ title: 'Body fat', asked: 'no', days: 1 })).toBe(
      'Body fat: asked: no; data found in the last 8 weeks: 1 day',
    );
    expect(healthVisibilityLine({ title: 'Lean mass', asked: 'yes', days: 3 })).toBe(
      'Lean mass: asked: yes; data found in the last 8 weeks: 3 days',
    );
    expect(healthVisibilityLine({ title: 'Workouts', asked: 'yes', days: 0 })).not.toMatch(/switched off|access is off/i);
    expect(HEALTH_VISIBILITY_NOTE).toContain('does not tell an app whether a read was allowed');
    expect(HEALTH_VISIBILITY_NOTE).toContain('No data found');
    expect(HEALTH_VISIBILITY_NOTE).not.toMatch(/switched off/i);
    expect(HEALTH_VISIBILITY_TITLE).toBe('What Charioteer can see');
    expect(HEALTH_VISIBILITY_NOTE).not.toMatch(/Denied or unknown/);
    expect(unaskedHealthTypes([
      { type: 'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute', asked: 'no' },
      { type: 'HKQuantityTypeIdentifierBodyFatPercentage', asked: 'yes' },
    ])).toEqual(['HKQuantityTypeIdentifierHeartRateRecoveryOneMinute']);
    for (const type of APPLE_HEALTH_READ_TYPES) {
      expect(healthReadTitle(type)).not.toBe(type);
    }
  });

  it('keeps an older reading on the tile when today has none', () => {
    const board = buildHealthStatBoard({
      today: '2026-10-17',
      samples: [{ kind: 'heart_rate_recovery', value: 22, recordedOn: '2026-09-20' }],
      body: [{ recordedOn: '2026-09-27', bodyFatPct: 18, leanMassKg: 70, waistCm: null }],
      activityEnergyKcal: null,
      heightCm: 178,
      adult: true,
      goalAge: 42,
      goalSex: 'male',
      goal: 'elite_heavy_boxer',
      build: 'muscular',
    });
    const ids = board.gaps.map((gap) => gap.id);
    expect(ids).not.toContain('heart_rate_recovery');
    expect(ids).not.toContain('body_fat');
    expect(ids).not.toContain('lean_mass');
    const recovery = board.sections.flatMap((section) => section.tiles).find((tile) => tile.id === 'heart_rate_recovery');
    expect(recovery?.empty).toBe(true);
    expect(recovery?.valueText).toBe('Latest 22 bpm · 20 Sep');
    expect(recovery?.period).toBe('older than the last 7 days');
    expect(recovery?.status).toBe('This reading is older than the last 7 days.');
    const month = buildHealthStatBoard({
      today: '2026-10-17',
      period: '30',
      samples: [{ kind: 'heart_rate_recovery', value: 22, recordedOn: '2026-09-20' }],
      body: [{ recordedOn: '2026-09-27', bodyFatPct: 18, leanMassKg: 70, waistCm: null }],
      activityEnergyKcal: null,
      heightCm: 178,
      adult: true,
      goalAge: 42,
      goalSex: 'male',
      goal: 'elite_heavy_boxer',
      build: 'muscular',
    });
    const kept = month.sections.flatMap((section) => section.tiles).find((tile) => tile.id === 'heart_rate_recovery');
    expect(kept?.valueText).toBe('22');
    expect(month.sections.flatMap((section) => section.tiles).find((tile) => tile.id === 'body_fat')?.valueText).toBe('18');
  });

  it('requests the full set when it changes, and queries the three readings over 8 weeks', () => {
    const sync = readFileSync('src/health/sync.ios.ts', 'utf8');
    const ios = readFileSync('src/health/link.ios.ts', 'utf8');
    const see = readFileSync('src/health/visibility.ios.ts', 'utf8');
    const panel = readFileSync('src/ui/HealthVisibility.tsx', 'utf8');
    const screen = readFileSync('src/app/(main)/health.tsx', 'utf8');
    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    expect(sync).toContain('HEALTH_SAMPLE_DAYS');
    expect(sync).toContain('sleepHoursByWakeDay');
    const sleepQuery = sync.slice(sync.indexOf('HKCategoryTypeIdentifierSleepAnalysis'), sync.indexOf('HKCategoryTypeIdentifierSleepAnalysis') + 140);
    expect(sleepQuery).toContain('fitnessFilter');
    expect(sync).toContain("queryQuantitySamples('HKQuantityTypeIdentifierHeartRateRecoveryOneMinute'");
    expect(sync).toContain("queryQuantitySamples('HKQuantityTypeIdentifierBodyFatPercentage'");
    expect(sync).toContain("queryQuantitySamples('HKQuantityTypeIdentifierLeanBodyMass'");
    const fat = sync.slice(sync.lastIndexOf('HKQuantityTypeIdentifierBodyFatPercentage'), sync.lastIndexOf('HKQuantityTypeIdentifierBodyFatPercentage') + 160);
    const lean = sync.slice(sync.lastIndexOf('HKQuantityTypeIdentifierLeanBodyMass'), sync.lastIndexOf('HKQuantityTypeIdentifierLeanBodyMass') + 140);
    const recovery = sync.slice(sync.indexOf('HKQuantityTypeIdentifierHeartRateRecoveryOneMinute'), sync.indexOf('HKQuantityTypeIdentifierHeartRateRecoveryOneMinute') + 180);
    expect(fat).toContain('fitnessFilter');
    expect(lean).toContain('fitnessFilter');
    expect(recovery).toContain('fitnessFilter');
    expect(ios).toContain('healthReadSetChanged');
    expect(ios).toContain('requestAuthorization({ toRead: [...APPLE_HEALTH_READ_TYPES] })');
    expect(ios).toContain('ensureCurrentAppleHealthReads');
    expect(see).toContain('getRequestStatusForAuthorization({ toRead: [type] })');
    expect(see).toContain('HKQuantityTypeIdentifierHeartRateRecoveryOneMinute');
    expect(see).toContain('HKQuantityTypeIdentifierBodyFatPercentage');
    expect(see).toContain('HKQuantityTypeIdentifierLeanBodyMass');
    expect(see).toContain('HEALTH_SAMPLE_DAYS');
    expect(panel).toContain('useState(false)');
    expect(panel).toContain('HEALTH_VISIBILITY_TITLE');
    expect(panel).toContain('label={HEALTH_ASK_AGAIN}');
    expect(panel).toContain('label={HEALTH_CHECK_AGAIN}');
    expect(panel).toContain('onCheck');
    expect(HEALTH_ASK_AGAIN).toBe('Ask Health again');
    expect(HEALTH_CHECK_AGAIN).toBe('Check again');
    expect(screen).toContain('<HealthVisibility');
    expect(screen).toContain('onCheck={loadVisibility}');
    expect(screen).toContain('catchUpAppleHealthReads');
    expect(layout).toContain('catchUpAppleHealthReads');
  });
});