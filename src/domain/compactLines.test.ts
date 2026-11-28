import { describe, expect, it } from 'vitest';

import { buildGoalLed } from '@/domain/goalLed';

import { dailyTargetChip, goalRingLabel, insightChip, splitUrgentCopy, weightRangeChip } from './compactLines';

const base = {
  stage: 'stopped' as const,
  hideCalories: false,
  kcalTarget: 2200,
  proteinTarget: 184,
  weightClassKg: null,
  blockedLoss: false,
  todayLogged: true,
  todayKcal: 1800,
  todayProtein: 150,
  workoutsKnown: true,
  workoutDays: 2,
  workoutMinutes: 60,
  scheduledDays: 4,
  weightKg: 82.5,
  previousWeightKg: 82,
  sleepHours: 5,
  weekProtein: [184, 184, 184, 184, 184, 184, 184, 126, 126, 126, 126, 126, 126, 126, 126, 126, 126],
};

describe('compact goal rings', () => {
  it('keeps a one-line protein and class label, and leaves the safety sentences on the view', () => {
    const view = buildGoalLed({ ...base, goal: 'elite_light_heavy_boxer' });
    const protein = view.measures.find((item) => item.id === 'protein');
    const weight = view.measures.find((item) => item.id === 'weight');
    expect(protein).toBeTruthy();
    expect(weight).toBeTruthy();
    expect(goalRingLabel(protein!)).toBe('Protein 150 / 184 g');
    expect(goalRingLabel(weight!)).toBe('Weight 3.1 kg over class');
    expect(view.caution).toMatch(/No rapid cut/);
    expect(view.caution).toMatch(/doctor/i);
    expect(view.caution).toMatch(/Keep every meal/);
    expect(weight?.words).toMatch(/will not plan a weight cut/);
    expect(weight?.words).toMatch(/Keep every meal/);
    expect(goalRingLabel(protein!)).not.toMatch(/hit on|doctor|sauna/i);
    expect(goalRingLabel(weight!)).not.toMatch(/reference|sauna|doctor/i);
  });

  it('shortens training, sleep, calories, and an empty ring', () => {
    const view = buildGoalLed({ ...base, goal: 'elite_runner', sleepHours: 5, workoutDays: 2, scheduledDays: 4 });
    const training = view.measures.find((item) => item.id === 'sessions');
    const sleep = view.measures.find((item) => item.id === 'sleep');
    expect(goalRingLabel(training!)).toBe('Training 2 / 4 days');
    expect(goalRingLabel(sleep!)).toBe('Sleep 5 h · short');
    const calories = buildGoalLed({ ...base, goal: 'maintain', hideCalories: false, kcalTarget: 2200, todayKcal: 1800, todayLogged: true });
    const kcal = calories.measures.find((item) => item.id === 'kcal');
    expect(goalRingLabel(kcal!)).toBe('Calories 1,800 / 2,200 kcal');
    const empty = buildGoalLed({ ...base, goal: 'elite_runner', weekProtein: [], todayLogged: false, todayProtein: 0 });
    expect(goalRingLabel(empty.measures.find((item) => item.id === 'protein')!)).toBe('Protein · nothing logged');
  });
});

describe('compact insight chips', () => {
  it('turns the sleep headline into one line and keeps the sentence for About', () => {
    const headline = 'Sleep has been under 6 hours on 3 of the last 7 nights.';
    expect(insightChip(headline)).toBe('Sleep · under 6h on 3 of 7 nights');
    expect(headline).toContain('under 6 hours');
    expect(insightChip('Resting heart rate has been above 100 bpm on 4 of the last 7 days.')).toBe('Resting HR · over 100 bpm on 4 of 7 days');
    expect(insightChip('Resting heart rate is 12 bpm higher than the previous 7 days.')).toBe('Resting HR · 12 bpm higher');
    expect(insightChip('Heart rate variability has been below your usual level for a few days.')).toBe('HRV · below your usual');
    expect(insightChip('Weight is about 6% lower than a reading from around 3 months ago.')).toBe('Weight · 6% lower');
    expect(insightChip('Steps up 12% on the previous 7 days')).toBe('Steps · up 12%');
    expect(insightChip('Not enough readings yet to compare the last 7 days with the 7 before.')).toBe('No 7-day comparison yet');
    expect(insightChip('Range 52–61 bpm.')).toBe('Range 52–61 bpm.');
  });
});

describe('compact daily targets and weight range', () => {
  it('shows the calorie figure and parks the urgent sentence', () => {
    expect(dailyTargetChip({
      intake: 'Drop calorie intake by 400 kcal/day (target 1,800 kcal).',
      targetKcal: 1800,
    })).toBe('1,800 kcal · drop 400');
    const pace = 'Competition weight cut: about 1.2 kg a week until 1 Dec 2026. Dizziness, fainting, confusion, or a racing heart means stop and get urgent help. See a qualified coach.';
    const split = splitUrgentCopy(pace);
    expect(split.shown).toContain('urgent help');
    expect(split.shown).toContain('fainting');
    expect(split.rest).toContain('Competition weight cut');
    expect(split.rest).not.toContain('urgent help');
    expect(split.rest).toContain('qualified coach');
  });

  it('shortens a class line without dropping the wording the chip came from', () => {
    const words = 'Over the class · 3.1 kg over the upper limit (over 76.2 kg up to 79.4 kg). This is a reference, not a target. This app will not plan a weight cut.';
    expect(weightRangeChip(words)).toBe('3.1 kg over class');
    expect(words).toContain('will not plan a weight cut');
    expect(weightRangeChip('Under the class · 4 kg under the lower limit (over 92 kg up to 100 kg). This is a reference, not a target.')).toBe('4 kg under class');
    expect(weightRangeChip('✓ Inside the class (76.2–79.4 kg) · 1.8 kg above the lower limit.')).toBe('Inside the class');
    expect(weightRangeChip('Within range')).toBe('Within range');
    expect(weightRangeChip('About 3.1 kg to lose to reach the top of this range')).toBe('3.1 kg above the range');
  });
});
