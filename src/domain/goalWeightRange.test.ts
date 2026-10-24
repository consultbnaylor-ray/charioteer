import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { draftHealthPlan, healthPlanModelContext, HEALTH_PLAN_PROMPT, type PlanInput } from './healthPlan';
import { NUTRITION_PROMPT_LINE } from './nutrition';
import {
  DOCTOR_NOTE,
  LOSS_PACE_KG,
  NOT_BELOW,
  boxingClassWindow,
  classStatus,
  formatWeightAmount,
  goalBandLegend,
  goalWeightRange,
} from './goalWeightRange';

const adult = { heightCm: 170, age: 40, sex: 'male' as const };

function planInput(partial: Partial<PlanInput> = {}): PlanInput {
  return {
    now: new Date('2026-10-15T09:00:00.000Z'),
    salt: 'range',
    displayName: 'Alex Hart',
    stage: 'exploring',
    sobrietyStartedAt: null,
    heightCm: 178,
    visionStatement: '',
    visionCaptions: [],
    interestLabels: [],
    reasons: [],
    limits: '',
    goal: 'lose_weight',
    goalSex: 'male',
    goalAge: 34,
    build: null,
    kcalTarget: null,
    proteinTarget: null,
    hideCalories: false,
    foodLogs: [],
    checkIns: [],
    health: [{ kind: 'weight_kg', value: 90, recordedOn: '2026-10-14' }],
    bodyFatPct: null,
    leanMassKg: null,
    waistCm: null,
    doneTexts: [],
    ...partial,
  };
}

describe('goal weight range', () => {
  it('asks for height, sex, and age and does not guess a range', () => {
    const noHeight = goalWeightRange({ goal: 'lose_weight', weightKg: 80, heightCm: null, age: 40, sex: 'male' });
    const noSex = goalWeightRange({ goal: 'lose_weight', weightKg: 80, heightCm: 170, age: 40, sex: null });
    const noAge = goalWeightRange({ goal: 'lose_weight', weightKg: 80, heightCm: 170, age: null, sex: 'female' });
    expect(noHeight.healthy).toBeNull();
    expect(noHeight.prompt).toContain('height');
    expect(noHeight.prompt).toContain('Nothing here is guessed');
    expect(noHeight.contextLine).not.toMatch(/\d+(\.\d+)? kg/);
    expect(noSex.prompt).toContain('sex');
    expect(noSex.healthy).toBeNull();
    expect(noAge.prompt).toContain('age');
    expect(noAge.gap).toBeNull();
  });

  it('does not show an adult range under 18', () => {
    const young = goalWeightRange({ goal: 'lose_weight', weightKg: 60, heightCm: 170, age: 17, sex: 'female' });
    expect(young.status).toBe('prompt');
    expect(young.healthy).toBeNull();
    expect(young.prompt).toContain('under 18');
    expect(young.prompt).toContain('NHS BMI calculator');
    expect(young.contextLine).not.toMatch(/\d+(\.\d+)? kg/);
  });

  it('gives the gap to the top of the healthy band and never below the healthy minimum', () => {
    const over = goalWeightRange({ ...adult, goal: 'lose_weight', weightKg: 78 });
    expect(over.healthy?.lowKg).toBe(53.5);
    expect(over.healthy?.highKg).toBe(72);
    expect(over.gap).toBe('About 6 kg to lose to reach the top of this range');
    expect(over.pace).toBe(LOSS_PACE_KG);
    expect(over.doctor).toBe(DOCTOR_NOTE);
    expect(over.words).not.toMatch(/crash/i);
    expect((over.healthy?.highKg ?? 0) >= (over.healthy?.lowKg ?? 0)).toBe(true);
    const low = goalWeightRange({ ...adult, goal: 'lose_weight', weightKg: 50 });
    expect(low.gap).toContain('to gain to reach the bottom of this range');
    expect(low.gap).not.toContain('to lose');
    expect(low.floorNote).toBe(NOT_BELOW);
    const heavy = goalWeightRange({ ...adult, heightCm: 180, goal: 'lose_weight', weightKg: 140 });
    expect(heavy.gap).toContain('to lose to reach the top of this range');
    expect(heavy.healthy?.highKg).toBeGreaterThanOrEqual(heavy.healthy?.lowKg ?? 0);
  });

  it('hides the gap inside the range', () => {
    const inside = goalWeightRange({ ...adult, sex: 'female', goal: 'maintain', weightKg: 70 });
    expect(inside.withinRange).toBe(true);
    expect(inside.gap).toBeNull();
    expect(inside.words).toBe('Within range');
    expect(inside.pace).toBeNull();
  });

  it('gives a steady gap for carrying extra weight, with a doctor check and no crash plan', () => {
    const over = goalWeightRange({ ...adult, goal: 'lose_weight', weightKg: 90, build: 'carrying_extra' });
    expect(over.gap).toBe('About 18 kg to lose to reach the top of this range');
    expect(over.pace).toBe(LOSS_PACE_KG);
    expect(over.doctor).toBe(DOCTOR_NOTE);
    expect(over.muscle).toContain('Waist and body fat tell you more');
    expect(over.muscle).toContain('steady pace');
    expect(over.words).not.toMatch(/crash|rapid cut|skip meals/i);
    expect(over.contextLine).toContain(DOCTOR_NOTE);
    expect(over.contextLine).toContain('0.5 to 1 kg');
    const inside = goalWeightRange({ ...adult, goal: 'lose_weight', weightKg: 70, build: 'carrying_extra' });
    expect(inside.withinRange).toBe(true);
    expect(inside.gap).toBeNull();
  });

  it('does not push a muscular person, or a logged body-fat reading, down to the BMI band', () => {
    const muscular = goalWeightRange({ ...adult, goal: 'lose_weight', weightKg: 90, build: 'muscular' });
    expect(muscular.gap).toBeNull();
    expect(muscular.words).not.toContain('to lose');
    expect(muscular.muscle).toContain('rough guide');
    expect(muscular.muscle).toMatch(/muscle/i);
    const fat = goalWeightRange({ ...adult, goal: 'lose_weight', weightKg: 90, bodyFatPct: 18 });
    expect(fat.withinRange).toBe(true);
    expect(fat.gap).toBeNull();
    expect(fat.muscle).toMatch(/body fat or waist/i);
    const waist = goalWeightRange({ ...adult, goal: 'maintain', weightKg: 90, waistCm: 100 });
    expect(waist.gap).toBeNull();
    expect(waist.words).toMatch(/waist/i);
    expect(waist.words).not.toContain('to lose');
  });

  it('does not invent a higher target for increase, or a scale cut for a body builder', () => {
    const above = goalWeightRange({ ...adult, goal: 'increase', weightKg: 90 });
    expect(above.gap).toBeNull();
    expect(above.words).toContain('Increase Weight has no separate published weight above the healthy band');
    expect(above.words).not.toContain('to lose');
    const gain = goalWeightRange({ ...adult, goal: 'increase', weightKg: 50 });
    expect(gain.gap).toContain('to gain');
    expect(gain.floorNote).toBe(NOT_BELOW);
    const cut = goalWeightRange({ ...adult, goal: 'body_builder', phase: 'cut', weightKg: 90 });
    expect(cut.gap).toBeNull();
    expect(`${cut.words} ${cut.goalNote}`).not.toContain('to lose');
    expect(cut.goalNote).toMatch(/healthy minimum/);
    const runner = goalWeightRange({ ...adult, goal: 'elite_runner', weightKg: 90 });
    expect(runner.goalNote).toContain('Elite Athlete (Lean Runner etc.)');
    expect(runner.goalNote).toContain('no separate published weight range');
    expect(runner.gap).toBeNull();
    expect(runner.words).toContain('For Elite Athlete (Lean Runner etc.)');
    expect(runner.words).not.toMatch(/to lose/i);
  });

  it('shows boxing class limits as a reference and never as a cut', () => {
    const over = goalWeightRange({
      goal: 'elite_middle_boxer',
      weightKg: 82,
      heightCm: 178,
      age: 28,
      sex: 'male',
      weightClassKg: 75,
    });
    expect(`${over.gap ?? ''} ${over.words}`).not.toMatch(/to lose/i);
    expect(over.classReference).toContain('72.6 kg (160 lb)');
    expect(over.classReference).toContain('over 71 kg to 75 kg');
    expect(over.classReference).toContain('for reference only');
    expect(over.classReference).toContain('You noted a limit of 75 kg');
    expect(over.classReference).toContain('will not plan a weight cut');
    expect(over.classReference).toContain('dehydration');
    expect(over.sources.map((source) => source.name).join(' ')).toContain('IBA Technical and Competition Rules');
    const inside = goalWeightRange({
      goal: 'elite_middle_boxer',
      weightKg: 71,
      heightCm: 178,
      age: 28,
      sex: 'male',
    });
    expect(inside.withinRange).toBe(true);
    expect(inside.gap).toBeNull();
    expect(inside.words).toBe('✓ Inside the class (69.9–72.6 kg) · 1.1 kg above the lower limit, 1.6 kg below the upper limit. The professional limit is about 72.6 kg (160 lb).');
    expect(inside.words).not.toMatch(/under the class/i);
    expect(inside.goal?.label).toBe('Middleweight limit (reference)');
    expect(inside.goal?.lowKg).toBe(69.9);
    expect(inside.goal?.highKg).toBe(72.6);
    const heavy = goalWeightRange({
      goal: 'elite_heavy_boxer',
      weightKg: 110,
      heightCm: 185,
      age: 30,
      sex: 'male',
    });
    expect(heavy.withinRange).toBe(true);
    expect(heavy.gap).toBeNull();
    expect(heavy.words).toBe('✓ Inside the class, in the super heavyweight class, over 100 kg. This is a reference, not a target.');
    expect(heavy.words).toContain('super heavyweight');
    expect(heavy.classReference).toContain('over 92 kg to 100 kg');
    expect(heavy.classReference).toContain('over 100 kg');
    expect(`${heavy.gap ?? ''} ${heavy.words}`).not.toMatch(/to lose/);
    const lightHeavy = goalWeightRange({
      goal: 'elite_heavy_boxer',
      weightKg: 88,
      heightCm: 185,
      age: 30,
      sex: 'male',
    });
    expect(lightHeavy.words).toBe('Under the class · 4 kg under the lower limit (over 92 kg up to 100 kg). This is a reference, not a target.');
    expect(lightHeavy.withinRange).toBe(false);
    expect(lightHeavy.gap).toBeNull();
    expect(lightHeavy.words).not.toMatch(/to lose|to gain/i);
    const sheet = goalWeightRange({
      goal: 'elite_heavy_boxer',
      weightKg: 84.1,
      heightCm: 172,
      age: 30,
      sex: 'male',
    });
    expect(sheet.healthy?.lowKg).toBe(54.7);
    expect(sheet.healthy?.highKg).toBe(73.7);
    expect(sheet.goal?.label).toBe('Heavyweight class (reference)');
    expect(sheet.goal?.lowExclusive).toBe(true);
    expect(sheet.words).toBe('Under the class · 7.9 kg under the lower limit (over 92 kg up to 100 kg). This is a reference, not a target.');
    expect(sheet.gap).toBeNull();
    expect(sheet.classReference).toContain('IBA');
    expect(sheet.classReference).toContain('over 92 kg to 100 kg');
    expect(sheet.classReference).toContain('will not plan a weight cut');
    expect(sheet.words).not.toMatch(/to lose|to gain|weight cut/i);
    expect(sheet.contextLine).toContain('Heavyweight class (reference): over 92 kg up to 100 kg');
    expect(sheet.contextLine).toContain('Under the class · 7.9 kg under the lower limit');
    expect(sheet.doctor).toBe(DOCTOR_NOTE);
  });

  it('sets a super middleweight, light heavyweight, and cruiserweight against the professional limit', () => {
    const over = goalWeightRange({
      goal: 'elite_super_middle_boxer',
      weightKg: 80,
      heightCm: 178,
      age: 28,
      sex: 'male',
    });
    expect(over.goal?.label).toBe('Super middleweight limit (reference)');
    expect(over.goal?.lowKg).toBe(72.6);
    expect(over.goal?.highKg).toBe(76.2);
    expect(over.words).toContain('Over the class · 3.8 kg over the upper limit (over 72.6 kg up to 76.2 kg).');
    expect(over.words).toContain('will not plan a weight cut');
    expect(over.words).toContain('The professional limit is about 76.2 kg (168 lb).');
    expect(over.words).not.toMatch(/to lose|to gain/i);
    expect(over.gap).toBeNull();
    expect(`${over.gap ?? ''} ${over.words}`).not.toMatch(/to lose/i);
    expect(over.classReference).toContain('over 75 kg to 80 kg');
    expect(over.classReference).toContain('for reference only');
    expect(over.classReference).toContain('will not plan a weight cut');
    expect(over.classReference).toContain('Muscular boxers can sit above the BMI band');
    expect(over.doctor).toBe(DOCTOR_NOTE);
    const inside = goalWeightRange({
      goal: 'elite_light_heavy_boxer',
      weightKg: 78,
      heightCm: 178,
      age: 28,
      sex: 'male',
    });
    expect(inside.withinRange).toBe(true);
    expect(inside.words).toContain('✓ Inside the class (76.2–79.4 kg) · 1.8 kg above the lower limit, 1.4 kg below the upper limit');
    expect(inside.words).toContain('79.4 kg (175 lb)');
    expect(inside.words).not.toMatch(/under the class/i);
    expect(inside.classReference).toContain('IBA light heavyweight is over 86 kg to 92 kg');
    const under = goalWeightRange({
      goal: 'elite_cruiser_boxer',
      weightKg: 70,
      heightCm: 178,
      age: 28,
      sex: 'female',
    });
    expect(under.words).toContain('Under the class · 9.4 kg under the lower limit (over 79.4 kg up to 90.7 kg).');
    expect(under.words).not.toMatch(/to gain|to lose/i);
    expect(under.words).toContain('90.7 kg (200 lb)');
    expect(under.classReference).toContain('over 81 kg');
    expect(under.classReference).toContain('for reference only');
    const heavy = goalWeightRange({
      goal: 'elite_heavy_boxer',
      weightKg: 110,
      heightCm: 185,
      age: 30,
      sex: 'male',
    });
    expect(heavy.words).toContain('super heavyweight');
    expect(heavy.words).not.toContain('76.2 kg');
    const feather = goalWeightRange({
      goal: 'elite_feather_boxer',
      weightKg: 60,
      heightCm: 170,
      age: 28,
      sex: 'male',
    });
    expect(feather.goal?.label).toBe('Featherweight limit (reference)');
    expect(feather.goal?.highKg).toBe(57.2);
    expect(feather.words).toContain('Over the class · 2.8 kg over the upper limit (up to 57.2 kg).');
    expect(feather.words).toContain('will not plan a weight cut');
    expect(feather.words).not.toMatch(/to lose|to gain/i);
    expect(feather.words).toContain('57.2 kg (126 lb)');
    expect(feather.classReference).toContain('over 54 kg to 57 kg');
    expect(feather.classReference).toContain('for reference only');
    expect(feather.contextLine).toContain('Featherweight limit (reference): up to 57.2 kg');
    expect(`${feather.gap ?? ''} ${feather.words}`).not.toMatch(/to lose/i);
    const welter = goalWeightRange({
      goal: 'elite_super_welter_boxer',
      weightKg: 68,
      heightCm: 175,
      age: 30,
      sex: 'female',
    });
    expect(welter.withinRange).toBe(true);
    expect(welter.words).toContain('69.9 kg (154 lb)');
    expect(welter.classReference).toContain('light middleweight');
    expect(welter.classReference).toContain('over 66 kg to 70 kg');
    expect(welter.words).toContain('✓ Inside the class');
    expect(welter.words).not.toMatch(/under the class/i);
  });

  it('calls Ben inside cruiserweight and names both edges', () => {
    const inside = goalWeightRange({
      goal: 'elite_cruiser_boxer',
      weightKg: 83.8,
      heightCm: 178,
      age: 30,
      sex: 'male',
    });
    const line = '✓ Inside the class (79.4–90.7 kg) · 4.4 kg above the lower limit, 6.9 kg below the upper limit.';
    expect(inside.withinRange).toBe(true);
    expect(inside.gap).toBeNull();
    expect(inside.words.startsWith(line)).toBe(true);
    expect(inside.words).toContain('The professional limit is about 90.7 kg (200 lb).');
    expect(inside.words).not.toMatch(/under the class|to lose|to gain/i);
    expect(inside.doctor).toBe(DOCTOR_NOTE);
    expect(inside.classReference).toContain('will not plan a weight cut');
    expect(inside.contextLine).toContain(line);
    expect(inside.contextLine).toContain('Cruiserweight limit (reference): over 79.4 kg up to 90.7 kg');
    expect(inside.contextLine).toContain(DOCTOR_NOTE);
    const edges = boxingClassWindow('elite_cruiser_boxer', 'male');
    const status = classStatus(83.8, edges ?? { lowKg: null, highKg: null });
    expect(status.place).toBe('inside');
    expect(status.signal).toBe('Inside the class');
    expect(status.tone).toBe('good');
    expect(status.line).toBe(line);
    expect(status.fill).toBeCloseTo(4.4 / 11.3, 5);
    expect(status.fill).not.toBeCloseTo(83.8 / 90.7, 2);
    const below = classStatus(79.4, { lowKg: 79.4, highKg: 90.7 });
    expect(below.place).toBe('below');
    expect(below.line).toContain('Under the class');
    expect(below.line).not.toMatch(/to gain/i);
    const over = classStatus(90.8, { lowKg: 79.4, highKg: 90.7 });
    expect(over.place).toBe('above');
    expect(over.signal).toBe('Over the class');
    expect(over.line).toContain('over the upper limit');
    expect(over.line).toContain('will not plan a weight cut');
    expect(over.line).not.toMatch(/to lose/i);
    expect(goalBandLegend({
      label: 'Cruiserweight limit (reference)',
      lowKg: 79.4,
      highKg: 90.7,
      lowExclusive: true,
      ceilingOnly: false,
    })).toBe('Cruiserweight limit (reference): over 79.4 kg up to 90.7 kg');
    const plan = healthPlanModelContext(planInput({
      goal: 'elite_cruiser_boxer',
      goalSex: 'male',
      goalAge: 30,
      heightCm: 178,
      health: [{ kind: 'weight_kg', value: 83.8, recordedOn: '2026-10-14' }],
    }), draftHealthPlan(planInput({
      goal: 'elite_cruiser_boxer',
      goalSex: 'male',
      goalAge: 30,
      heightCm: 178,
      health: [{ kind: 'weight_kg', value: 83.8, recordedOn: '2026-10-14' }],
    })));
    expect(plan.weightRange).toContain(line);
    expect(plan.weightRange).toContain('up to 90.7 kg');
    expect(plan.weightRange).not.toMatch(/under the class/i);
  });

  it('uses stones and pounds when that unit is asked for', () => {
    const stones = goalWeightRange({ ...adult, goal: 'lose_weight', weightKg: 78, unit: 'stlb' });
    expect(stones.gap).toBe(`About ${formatWeightAmount(6, 'stlb')} to lose to reach the top of this range`);
    expect(stones.pace).toContain('1 to 2 lb');
    expect(stones.contextLine).toContain('About 6 kg to lose to reach the top of this range');
  });

  it('passes the same figures to Thumos', () => {
    const view = goalWeightRange({ ...adult, goal: 'lose_weight', weightKg: 78 });
    expect(view.contextLine).toContain('78 kg');
    expect(view.contextLine).toContain('53.5 kg to 72 kg');
    expect(view.contextLine).toContain('About 6 kg to lose to reach the top of this range');
    expect(view.contextLine).toContain(DOCTOR_NOTE);
    expect(view.contextLine).toContain(LOSS_PACE_KG);
    const plan = draftHealthPlan(planInput());
    const context = healthPlanModelContext(planInput(), plan);
    expect(context.weightRange).toContain('Weight range');
    expect(context.weightRange).toContain('to lose to reach the top of this range');
    expect(context.weightRange).toContain(DOCTOR_NOTE);
    expect(HEALTH_PLAN_PROMPT).toContain('weightRange');
    expect(HEALTH_PLAN_PROMPT).toContain('Do not turn a boxing class limit into a weight cut');
    expect(NUTRITION_PROMPT_LINE).toContain('weight range');
    expect(NUTRITION_PROMPT_LINE).toContain('healthy minimum');
    expect(readFileSync('supabase/functions/_shared/nutritionLoad.ts', 'utf8')).toContain('goalWeightRange');
    expect(readFileSync('src/voice/briefing.ts', 'utf8')).toContain('goalWeightRange');
  });

  it('places the bar on the goal overview, Stats, and the health plan', () => {
    const goal = readFileSync('src/ui/YourGoal.tsx', 'utf8');
    const card = readFileSync('src/ui/GoalWeightRange.tsx', 'utf8');
    expect(goal).toContain('GoalWeightRange');
    expect(goal).toContain("place === 'plan'");
    expect(readFileSync('src/app/(main)/stats.tsx', 'utf8')).toContain('YourGoal');
    expect(readFileSync('src/app/(main)/health-plan.tsx', 'utf8')).toContain('<GoalWeightRange />');
    expect(card).toContain('about="these ranges"');
    expect(card).toContain('APPROXIMATE');
    expect(card).toContain('goalBandLegend');
    expect(card).toContain('view.words');
    expect(card).toContain('Within range');
    expect(card).toContain('st-lb');
    expect(card).toContain('view.doctor');
    expect(card).toContain('A reference, not a target. Not medical advice.');
    expect(card).toContain('withoutProfessionalLimit');
    expect(card).toContain('The professional limit is about');
    expect(card).not.toMatch(/crash diet|weight cutting advice/i);
  });
});
