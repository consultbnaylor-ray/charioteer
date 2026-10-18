import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { draftHealthPlan, HEALTH_PLAN_PROMPT } from './healthPlan';
import { buildGoalLed, figuresForLondonWeek, goalFocusLine, goalProgressLine } from './goalLed';
import type { FoodLog } from './nutrition';
import { goalShareLine, NUTRITION_GOALS, NUTRITION_PROMPT_LINE } from './nutrition';
import { buildSystemPrompt, buildThumosContext } from './thumos';

function meal(eatenOn: string, proteinG: number): FoodLog {
  return {
    id: eatenOn,
    userId: 'ben',
    eatenOn,
    eatenAt: null,
    meal: 'lunch',
    source: 'manual',
    note: '',
    items: [{
      name: 'Meal',
      kcal: 600,
      proteinG,
      carbsG: 40,
      sugarG: 0,
      fibreG: 0,
      unsaturatedG: 0,
      saturatedG: 0,
      transG: 0,
      sodiumMg: 0,
      processed: false,
    }],
    estimated: false,
    portion: 1,
    createdAt: `${eatenOn}T12:00:00.000Z`,
    previewUrl: null,
  };
}

const base = {
  stage: 'stopped' as const,
  hideCalories: false,
  kcalTarget: 2200,
  proteinTarget: 140,
  weightClassKg: null,
  blockedLoss: false,
  todayLogged: true,
  todayKcal: 1800,
  todayProtein: 100,
  workoutsKnown: true,
  workoutDays: 2,
  workoutMinutes: 60,
  scheduledDays: 4,
  weightKg: 80,
  previousWeightKg: 80.2,
  sleepHours: 7.5,
};

describe('goal led summary', () => {
  it('names what matters for each goal and keeps two or three measures', () => {
    for (const goal of NUTRITION_GOALS) {
      const view = buildGoalLed({ ...base, goal });
      expect(view.name?.length).toBeGreaterThan(0);
      expect(view.matters.toLowerCase()).toContain('what matters most');
      expect(view.measures.length).toBeGreaterThanOrEqual(2);
      expect(view.measures.length).toBeLessThanOrEqual(3);
      expect(view.ticks.length).toBe(view.measures.length);
      expect(view.progressWords.length).toBeGreaterThan(10);
      expect(`${view.matters} ${view.progressWords} ${view.nudges.join(' ')}`).not.toMatch(/runna|mileage|5k|10k|progressive distance/i);
    }
  });

  it('says when protein is short, and leaves Save-style calorie talk out when calories are hidden', () => {
    const short = buildGoalLed({ ...base, goal: 'lose_fat_build_muscle', todayProtein: 100, proteinTarget: 140 });
    expect(short.measures.find((item) => item.id === 'protein')).toMatchObject({
      centre: '100',
      status: 'Avg 100 g/day, target hit on 0 of 1 logged day',
    });
    expect(short.nudges.some((line) => line === 'Avg 100 g/day, target hit on 0 of 1 logged day.')).toBe(true);
    const hidden = buildGoalLed({ ...base, goal: 'maintain', hideCalories: true, kcalTarget: 2000 });
    const text = `${hidden.matters} ${hidden.progressWords} ${hidden.nudges.join(' ')} ${hidden.measures.map((item) => `${item.label} ${item.words} ${item.unit}`).join(' ')}`;
    expect(text).not.toMatch(/kcal/i);
    expect(goalProgressLine({ ...base, goal: 'maintain', hideCalories: true })).not.toMatch(/kcal/i);
    const logged = buildGoalLed({
      ...base,
      goal: 'lose_fat_build_muscle',
      proteinTarget: null,
      todayProtein: 7,
      kcalTarget: null,
      scheduledDays: null,
      workoutDays: 3,
      workoutMinutes: 97,
    });
    expect(logged.progressWords).toContain('protein is logged');
    expect(logged.progressWords).toContain('training is 97 min');
    expect(logged.progressWords).toContain('no calorie target yet');
    expect(logged.progressWords).not.toContain('not logged yet');
  });

  it('keeps a middleweight change small and does not turn a runner into a distance plan', () => {
    const boxer = buildGoalLed({ ...base, goal: 'elite_middle_boxer', weightClassKg: 75, weightKg: 79, previousWeightKg: 78 });
    expect(boxer.caution).toMatch(/No rapid cut/);
    expect(boxer.caution).toMatch(/doctor/i);
    expect(boxer.matters).toMatch(/small change/i);
    expect(`${boxer.matters} ${boxer.progressWords}`).not.toMatch(/sauna|dehydrat|skip drinks to make/i);
    const runner = buildGoalLed({ ...base, goal: 'elite_runner' });
    expect(runner.matters).toMatch(/sessions you already do/i);
    expect(runner.matters).toMatch(/sleep/i);
    expect(runner.measures.map((item) => item.id)).toEqual(['sessions', 'protein', 'sleep']);
    const quiet = buildGoalLed({ ...base, goal: 'elite_heavy_boxer', sleepHours: null });
    expect(quiet.measures.find((item) => item.id === 'sleep')?.words).toBe('A check-in records sleep for Elite Athlete (Heavy Weight Boxer).');
    const shortSleep = buildGoalLed({ ...base, goal: 'elite_runner', sleepHours: 5 });
    expect(shortSleep.measures.find((item) => item.id === 'sleep')?.words).toContain('Recovery matters for Elite Athlete (Lean Runner etc.)');
    const share = goalShareLine({
      goal: 'elite_heavy_boxer',
      proteinG: 80,
      proteinTarget: 140,
      direction: 'steady',
      hideCalories: false,
      blockedLoss: false,
    });
    expect(share).toContain('Progress on Elite Athlete (Heavy Weight Boxer) is about training, recovery, and body composition.');
    expect(share).not.toMatch(/this goal/i);
    const cruiser = buildGoalLed({ ...base, goal: 'elite_cruiser_boxer', weightKg: 94 });
    expect(cruiser.name).toBe('Elite Athlete (Cruiserweight Boxer)');
    expect(cruiser.caution).toMatch(/No rapid cut/);
    expect(cruiser.caution).toMatch(/doctor/i);
    expect(cruiser.matters).toMatch(/cruiserweight limit/);
    expect(cruiser.measures.find((item) => item.id === 'weight')?.words).toContain('above the cruiserweight limit of 90.7 kg');
    expect(goalFocusLine('elite_super_middle_boxer')).toContain('super middleweight');
    expect(goalFocusLine('elite_super_light_boxer')).toContain('super lightweight');
    const feather = buildGoalLed({ ...base, goal: 'elite_feather_boxer', weightKg: 62 });
    expect(feather.name).toBe('Elite Athlete (Featherweight Boxer)');
    expect(feather.measures.find((item) => item.id === 'weight')?.words).toContain('above the featherweight limit of 57.2 kg');
  });

  it('averages protein across the London week, including Sunday', () => {
    const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];
    const grams = [150, 130, 160, 140, 120, 152];
    const logs = days.map((eatenOn, index) => meal(eatenOn, grams[index] ?? 0));
    const sunday = figuresForLondonWeek({
      now: new Date('2026-10-18T07:00:00.000Z'),
      logs,
      health: [
        { kind: 'workout_minutes', value: 40, recordedOn: '2026-10-13' },
        { kind: 'workout_minutes', value: 35, recordedOn: '2026-10-16' },
        { kind: 'weight_kg', value: 93.4, recordedOn: '2026-10-11' },
        { kind: 'weight_kg', value: 92.8, recordedOn: '2026-10-17' },
      ],
      checkIns: [],
    });
    expect(sunday.week).toMatchObject({ start: '2026-10-12', end: '2026-10-18', today: '2026-10-18' });
    expect(sunday.weekProtein).toEqual(grams);
    const view = buildGoalLed({
      ...base,
      goal: 'elite_cruiser_boxer',
      proteinTarget: 140,
      weekProtein: sunday.weekProtein,
      todayLogged: false,
      todayProtein: 0,
      workoutDays: sunday.workoutDays,
      workoutMinutes: sunday.workoutMinutes,
      weightKg: sunday.weightKg,
      previousWeightKg: sunday.previousWeightKg,
    });
    const protein = view.measures.find((item) => item.id === 'protein');
    expect(protein?.centre).toBe('142');
    expect(protein?.status).toBe('Avg 142 g/day, target hit on 4 of 6 logged days');
    expect(protein?.status).not.toBe('Nothing logged yet');
    expect(view.progressWords).toContain('avg 142 g/day, target hit on 4 of 6 logged days');
    expect(view.progressWords).not.toContain('protein is not logged yet');
    expect(view.measures.find((item) => item.id === 'sessions')?.centre).toBe('2');
    expect(sunday.weightKg).toBe(92.8);
    expect(sunday.previousWeightKg).toBe(93.4);

    const mondayMorning = figuresForLondonWeek({
      now: new Date('2026-10-18T23:30:00.000Z'),
      logs,
      health: [],
      checkIns: [],
    });
    expect(mondayMorning.week).toMatchObject({ start: '2026-10-19', today: '2026-10-19', days: ['2026-10-19'] });
    expect(mondayMorning.weekProtein).toEqual([]);
    const fresh = buildGoalLed({ ...base, goal: 'elite_cruiser_boxer', weekProtein: mondayMorning.weekProtein, todayLogged: false, todayProtein: 0 });
    expect(fresh.measures.find((item) => item.id === 'protein')?.status).toBe('Nothing logged yet');

    const stillSunday = figuresForLondonWeek({
      now: new Date('2026-10-18T22:30:00.000Z'),
      logs,
      health: [],
      checkIns: [],
    });
    expect(stillSunday.week.today).toBe('2026-10-18');
    expect(stillSunday.weekProtein).toHaveLength(6);
  });

  it('stays quiet until a goal is chosen', () => {
    const empty = buildGoalLed({ ...base, goal: null });
    expect(empty.measures).toEqual([]);
    expect(empty.nudges).toEqual([]);
    expect(empty.ticks).toEqual([]);
    expect(empty.matters).toMatch(/Pick a goal on You/);
  });

  it('puts the same check on Today and Stats, and ties the plan and Thumos to the goal', () => {
    expect(readFileSync('src/app/(main)/home.tsx', 'utf8')).toContain('<YourGoal place="today" />');
    expect(readFileSync('src/app/(main)/stats.tsx', 'utf8')).toContain('<YourGoal place="stats" />');
    expect(readFileSync('src/app/(main)/health-plan.tsx', 'utf8')).toContain('<YourGoal place="plan" />');
    expect(readFileSync('src/ui/YourGoal.tsx', 'utf8')).toContain('towardGoal(view.name)');
    expect(readFileSync('src/app/(main)/stats.tsx', 'utf8')).toContain('<GoalLine />');
    expect(readFileSync('src/app/(main)/health.tsx', 'utf8')).toContain('<GoalLine />');
    expect(readFileSync('src/ui/YourGoal.tsx', 'utf8')).toContain('<PlanTick');
    const focus = goalFocusLine('lose_fat_build_muscle');
    expect(focus).toMatch(/protein/i);
    expect(focus).toMatch(/sessions you already do/i);
    const plan = draftHealthPlan({
      now: new Date('2026-10-16T12:00:00Z'),
      salt: 'goal-led',
      displayName: 'Alex',
      stage: 'stopped',
      sobrietyStartedAt: '2026-09-01',
      heightCm: 180,
      visionStatement: '',
      visionCaptions: [],
      interestLabels: [],
      reasons: [],
      limits: '',
      goal: 'lose_fat_build_muscle',
      goalSex: null,
      goalAge: null,
      build: null,
      kcalTarget: 2200,
      proteinTarget: 140,
      hideCalories: false,
      foodLogs: [],
      checkIns: [],
      health: [],
      bodyFatPct: null,
      leanMassKg: null,
      waistCm: null,
      doneTexts: [],
    });
    expect(plan.focus.map((item) => item.text).join(' ')).toContain(focus);
    expect(HEALTH_PLAN_PROMPT).toMatch(/Do not write a running plan/);
    expect(HEALTH_PLAN_PROMPT).toMatch(/Never prescribe fewer sessions/);
    expect(NUTRITION_PROMPT_LINE).toMatch(/tie one remark back to that goal/);
    expect(NUTRITION_PROMPT_LINE).toMatch(/crash diet/);
    expect(NUTRITION_PROMPT_LINE).toMatch(/rapid weight cut/);
    const progress = goalProgressLine({ ...base, goal: 'lose_fat_build_muscle' });
    const context = buildThumosContext({
      now: new Date('2026-10-16T12:00:00Z'),
      displayName: 'Alex',
      sobrietyStartedAt: null,
      reasons: [],
      weeklySpendGbp: null,
      weeklyUnits: null,
      checkIns: [],
      health: [],
      mode: 'steady',
      safety: { selfHarm: false, withdrawal: false, reasons: [] },
      stage: 'stopped',
      nutritionLines: progress ? [progress] : [],
    });
    expect(context).toContain("How they're doing toward");
    expect(buildSystemPrompt(context, 'steady')).toContain('tie one remark back to that goal');
    expect(readFileSync('supabase/functions/_shared/nutritionLoad.ts', 'utf8')).toContain('goalProgressLine');
    expect(readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8')).toContain('loadNutritionLines');
    expect(readFileSync('supabase/functions/thumos-voice-token/index.ts', 'utf8')).toContain('loadNutritionLines');
  });
});
