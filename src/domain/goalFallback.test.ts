import { describe, expect, it } from 'vitest';

import {
  FALLBACK_STEPS,
  REFERENCE_NOT_A_TARGET,
  fallbackReport,
  metricFallback,
  restingSexNote,
  specificAim,
  type FallbackCite,
  type FallbackStep,
} from '@/domain/healthBands';

const CRUISER = 'Elite Athlete (Cruiserweight Boxer)';
const RUNNER = 'Elite Athlete (Lean Runner etc.)';
const LOSE_FAT = 'Lose Fat & Build Muscle';

const SAMPLE: FallbackCite = {
  who: 'the sample group',
  source: 'Sample source, 2020',
  detail: 'a sample figure of 1 to 2',
};

function used(step: FallbackStep, goalLabel = CRUISER) {
  const published = Object.fromEntries(FALLBACK_STEPS.map((name) => [name, name === step ? SAMPLE : null])) as Partial<
    Record<FallbackStep, FallbackCite | null>
  >;
  return metricFallback({
    metricId: 'resting_heart_rate',
    metricName: 'resting heart rate',
    goalLabel,
    published,
  });
}

describe('goal range fallback', () => {
  it('names a cruiserweight boxer without calling the stand-in their own range', () => {
    expect(specificAim(CRUISER)).toBe('a cruiserweight boxer');
    expect(specificAim(RUNNER)).toBe('a lean runner');
    expect(specificAim(LOSE_FAT)).toBe(LOSE_FAT);
  });

  it('uses a goal-specific figure when one is published, and does not call it a stand-in', () => {
    const result = used('goal');
    expect(result.used).toBe('goal');
    expect(result.goalSpecific).toBe(true);
    expect(result.sentence).toContain(`The published resting heart rate range for ${CRUISER}`);
    expect(result.sentence).toContain('Sample source, 2020');
    expect(result.sentence).not.toMatch(/stand-in|no published/i);
    expect(result.sentence.match(/This is a reference, not a target\./g)).toHaveLength(1);
    expect(result.chain.map((step) => step.step)).toEqual([...FALLBACK_STEPS]);
  });

  it('falls back to the goal family when the aim itself has no figure', () => {
    const result = used('family');
    expect(result.used).toBe('family');
    expect(result.goalSpecific).toBe(false);
    expect(result.chain.find((step) => step.step === 'goal')?.cite).toBeNull();
    expect(result.sentence).toContain('no published resting heart rate range for a cruiserweight boxer specifically');
    expect(result.sentence).toContain('the sample group');
    expect(result.sentence).toContain(`This stand-in is not the ${CRUISER} range.`);
  });

  it('falls back to a general elite figure only when that step is the first one with a cite', () => {
    const result = used('elite');
    expect(result.used).toBe('elite');
    expect(result.chain.filter((step) => step.step === 'goal' || step.step === 'family').every((step) => step.cite == null)).toBe(true);
    expect(result.sentence).toContain('so this compares you with the sample group (Sample source, 2020: a sample figure of 1 to 2)');
    expect(result.sentence).not.toContain(`range for ${CRUISER} is`);
  });

  it('falls back to an athlete or active adult when no elite figure is cited', () => {
    const result = used('athlete');
    expect(result.used).toBe('athlete');
    expect(result.chain.find((step) => step.step === 'elite')?.cite).toBeNull();
    expect(result.sentence).toContain('an athlete or a more active person'.replace('an athlete or a more active person', 'the sample group'));
    expect(result.sentence).toContain(REFERENCE_NOT_A_TARGET);
  });

  it('falls back to a general adult when no closer figure is cited', () => {
    const result = used('adult', LOSE_FAT);
    expect(result.used).toBe('adult');
    expect(result.chain.slice(0, 4).every((step) => step.cite == null)).toBe(true);
    expect(result.sentence).toContain('no published resting heart rate range for Lose Fat & Build Muscle specifically');
    expect(result.sentence).toContain('a general adult'.replace('a general adult', 'the sample group'));
    expect(result.sentence).not.toMatch(/elite athlete|as low as 40/i);
  });

  it('compares a cruiserweight resting rate with the AHA athlete figure, not an invented elite band', () => {
    const result = metricFallback({ metricId: 'resting_heart_rate', goalLabel: CRUISER });
    expect(result.used).toBe('athlete');
    expect(result.chain.find((step) => step.step === 'goal')?.skippedBecause).toMatch(/No published range/);
    expect(result.chain.find((step) => step.step === 'family')?.cite).toBeNull();
    expect(result.chain.find((step) => step.step === 'elite')?.cite).toBeNull();
    expect(result.chain.find((step) => step.step === 'elite')?.skippedBecause).toMatch(/not a separate elite band/);
    expect(result.sentence).toBe(
      'There is no published resting heart rate range for a cruiserweight boxer specifically, so this compares you with an athlete or a more active person (American Heart Association, 2024: a resting rate may be as low as 40 bpm). This stand-in is not the Elite Athlete (Cruiserweight Boxer) range. This is a reference, not a target.',
    );
    const sheet = `${restingSexNote(CRUISER)} The band is the same for a day, a week, or a month. Population averages vary by person, medication and fitness. Not medical advice.`;
    expect(sheet.match(/This is a reference, not a target\./g)).toHaveLength(1);
    expect(sheet.match(/Not medical advice/gi)).toHaveLength(1);
    expect(sheet).not.toMatch(/this goal|your goal/i);
  });

  it('keeps a non-athlete aim on the general adult resting range', () => {
    const result = metricFallback({ metricId: 'resting_heart_rate', goalLabel: LOSE_FAT });
    expect(result.used).toBe('adult');
    expect(result.chain.find((step) => step.step === 'athlete')?.skippedBecause).toMatch(/not an athlete aim/);
    expect(result.sentence).toContain('British Heart Foundation, 2026');
    expect(result.sentence).not.toContain('40 bpm');
  });

  it('skips a level with no citable figure instead of guessing one', () => {
    const stress = metricFallback({ metricId: 'stress', goalLabel: CRUISER });
    const battery = metricFallback({ metricId: 'body_battery', goalLabel: CRUISER });
    const breath = metricFallback({ metricId: 'respiration', goalLabel: CRUISER });
    for (const result of [stress, battery, breath]) {
      expect(result.used).toBeNull();
      expect(result.chain.every((step) => step.cite == null)).toBe(true);
      expect(result.sentence).toContain('no citable stand-in');
      expect(result.sentence).not.toMatch(/\d/);
    }
    const vo2 = metricFallback({ metricId: 'vo2_max', goalLabel: RUNNER });
    expect(vo2.used).toBeNull();
    expect(vo2.chain.find((step) => step.step === 'elite')?.skippedBecause).toMatch(/Kim, Song, and Min/);
  });

  it('reports the built-in chain for each metric', () => {
    const report = fallbackReport(CRUISER);
    const usedById = Object.fromEntries(report.map((row) => [row.metricId, row.used]));
    expect(usedById).toEqual({
      resting_heart_rate: 'athlete',
      session_heart_rate: 'adult',
      walking_heart_rate: 'adult',
      heart_rate_recovery: 'adult',
      hrv: 'adult',
      vo2_max: null,
      steps: 'adult',
      sleep_hours: 'adult',
      stress: null,
      body_battery: null,
      weight_kg: 'adult',
      intensity_minutes: 'adult',
      respiration: null,
    });
    expect(report.find((row) => row.metricId === 'session_heart_rate')?.sentence).toContain('Tanaka, Monahan, and Seals, 2001');
    expect(report.find((row) => row.metricId === 'hrv')?.sentence).toContain('32 to 93 ms');
    expect(report.find((row) => row.metricId === 'steps')?.sentence).toContain('The Lancet Public Health, 2025');
    expect(report.find((row) => row.metricId === 'sleep_hours')?.sentence).toContain('7 to 9 hours');
    expect(report.find((row) => row.metricId === 'weight_kg')?.sentence).toContain('18.5 to 24.9');
    expect(report.every((row) => (row.sentence.match(/This is a reference, not a target\./g) ?? []).length === 1)).toBe(true);
    expect(report.map((row) => row.sentence).join(' ')).not.toMatch(/this goal|your goal/i);
  });
});
