import { describe, expect, it } from 'vitest';

import { defaultNutritionSettings, nutritionContextLines, suggestGoalTargets } from '@/domain/nutrition';
import {
  MAX_WEEKLY_KG,
  TARGET_BELOW_HEALTHY,
  TARGET_DATE_FAST,
  TARGET_NOT_ENOUGH,
  plannedWeeklyChangeKg,
  reviewTargetWeight,
  safeWeeklyChangeKg,
  settingsForPreset,
  settingsForTarget,
  targetCoachLines,
  targetTrendEstimate,
} from '@/domain/targetWeight';

describe('target weight', () => {
  const today = '2026-10-24';

  it('refuses a target under a healthy BMI and keeps a safe pace', () => {
    const low = reviewTargetWeight({ currentKg: 70, heightCm: 180, targetKg: 50, targetOn: null, today });
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.note).toBe(TARGET_BELOW_HEALTHY);
    expect(safeWeeklyChangeKg(70)).toBeLessThanOrEqual(MAX_WEEKLY_KG);
    expect(safeWeeklyChangeKg(40)).toBe(0.4);
    expect(plannedWeeklyChangeKg(90)).toBe(0.25);
  });

  it('moves a too-soon date out to the safe week and leaves a later date', () => {
    const rushed = reviewTargetWeight({ currentKg: 80, heightCm: 180, targetKg: 74, targetOn: '2026-10-30', today });
    expect(rushed.ok).toBe(true);
    if (rushed.ok) {
      expect(rushed.paced).toBe(true);
      expect(rushed.note).toBe(TARGET_DATE_FAST);
      expect(rushed.targetOn! > '2026-10-30').toBe(true);
    }
    const later = reviewTargetWeight({ currentKg: 80, heightCm: 180, targetKg: 78, targetOn: '2027-04-01', today });
    expect(later.ok).toBe(true);
    if (later.ok) expect(later.targetOn).toBe('2027-04-01');
  });

  it('clears the other choice, and does not invent a date from two readings', () => {
    const preset = settingsForPreset({ ...defaultNutritionSettings(), targetWeightKg: 75, targetOn: '2027-01-01', targetStartKg: 82 }, 'maintain');
    expect(preset.goal).toBe('maintain');
    expect(preset.targetWeightKg).toBeNull();
    const review = reviewTargetWeight({ currentKg: 82, heightCm: 180, targetKg: 78, targetOn: null, today });
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    const saved = settingsForTarget(defaultNutritionSettings(), review, 82);
    expect(saved.goal).toBeNull();
    expect(saved.targetWeightKg).toBe(78);
    expect(saved.targetStartKg).toBe(82);
    expect(targetTrendEstimate({ currentKg: 82, targetKg: 78, readings: [{ day: '2026-10-01', kg: 82 }, { day: '2026-10-20', kg: 81 }] }).text).toBe(TARGET_NOT_ENOUGH);
  });

  it('tells the coach the private target and keeps the calorie suggestion inside the cap', () => {
    const lines = targetCoachLines({ targetKg: 78, currentKg: 82, direction: 'lose', heightCm: 180 });
    expect(lines.join(' ')).toContain('private target weight');
    expect(lines.join(' ')).toContain('0.5 kg');
    const suggested = suggestGoalTargets({
      goal: 'lose_weight',
      weightKg: 82,
      heightCm: 180,
      age: 40,
      sex: 'male',
      activeEnergyKcal: null,
      build: null,
      bodyFatPct: null,
      waistCm: null,
      phase: null,
      weightClassKg: null,
      targetPace: 'lose',
    });
    expect(suggested.ok).toBe(true);
    if (suggested.ok) expect(suggested.suggestion.note).toContain('0.25 kg a week');
    const context = nutritionContextLines({
      logs: [],
      settings: { ...defaultNutritionSettings(), targetWeightKg: 78 },
      waterMl: 0,
      checkIns: [],
      soberDays: null,
      unitsAvoided: 0,
      today,
      body: { weightKg: 82, heightCm: 180, weights: [], bodyFatPct: null, leanMassKg: null, waistCm: null },
      activity: [],
    });
    expect(context.some((line) => line.includes('private target weight of 78.0 kg'))).toBe(true);
  });
});
