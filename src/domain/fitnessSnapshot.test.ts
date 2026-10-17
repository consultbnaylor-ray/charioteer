import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { APPLE_HEALTH_READ_TYPES } from '@/health/connection';
import { HEALTH_KINDS } from '@/domain/healthInsights';
import { HEALTH_PLAN_PROMPT, draftHealthPlan, type PlanInput } from '@/domain/healthPlan';
import { CARRYING_FITNESS_NOTE, NUTRITION_PROMPT_LINE } from '@/domain/nutrition';
import {
  ADDED_NOT_REDUCED,
  buildFitnessSnapshot,
  MINUTES_WHAT,
  RESTING_WHAT,
  VO2_WHAT,
  whyCardioMatters,
  whyMinutesMatter,
  whyRestingMatters,
  workoutBucket,
  type FitnessSnapshotInput,
} from '@/domain/fitnessSnapshot';

function input(partial: Partial<FitnessSnapshotInput> = {}): FitnessSnapshotInput {
  return {
    today: '2026-10-17',
    goal: 'lose_fat_build_muscle',
    goalAge: 42,
    goalSex: 'male',
    scheduleWeekMinutes: 180,
    health: [],
    permission: 'unknown',
    ...partial,
  };
}

describe('fitness snapshot', () => {
  it('rates cardio fitness against the published age and sex band', () => {
    const view = buildFitnessSnapshot(input({
      health: [
        { kind: 'vo2_max', value: 42, recordedOn: '2026-10-01' },
        { kind: 'vo2_max', value: 41, recordedOn: '2026-10-16' },
      ],
    }));
    expect(view.level).toBe('Steady');
    expect(view.levelWords).toContain('men in their 40s');
    expect(view.levelWords).toContain('ml/kg/min');
    expect(view.cardio?.status).toBe('Steady');
    expect(view.cardio?.unit).toBe('ml/kg/min');
    expect(view.cardio?.trend).toEqual([42, 41]);
    expect(view.cardio?.compare.age).toEqual({ low: 31.9, high: 45, label: 'Typical for your age and sex' });
    expect(view.cardio?.compare.goal).toBeNull();
    expect(view.cardio?.compare.words).toContain('41 ml/kg/min');
    expect(view.cardio?.compare.goalNote).toContain('Lose Fat & Build Muscle has no separate published cardio range');
    expect(view.cardio?.compare.sources.join(' ')).toContain('Kaminsky');
    expect(VO2_WHAT).toBe('VO2 max: how much oxygen your body can use at full effort, per kg of body weight per minute. Apple Watch estimates it.');
    expect(view.estimate).toContain('not a medical assessment');
    expect(view.contextLine).toContain('ml/kg/min');
    expect(view.contextLine).toContain('31.9 to 45');
    expect(view.contextLine).not.toMatch(/runna|mileage|5k|10k/i);
  });

  it('leaves the number without a level when age or sex is missing', () => {
    const view = buildFitnessSnapshot(input({
      goalAge: null,
      goalSex: null,
      health: [{ kind: 'vo2_max', value: 42, recordedOn: '2026-10-16' }],
    }));
    expect(view.level).toBeNull();
    expect(view.cardio?.status).toBe('No age or sex');
    expect(view.missing).toContain('Age and sex');
  });

  it('falls back to resting heart rate and weekly minutes', () => {
    const view = buildFitnessSnapshot(input({
      goalAge: null,
      health: [
        { kind: 'resting_heart_rate', value: 70, recordedOn: '2026-09-01' },
        { kind: 'resting_heart_rate', value: 62, recordedOn: '2026-10-16' },
        { kind: 'workout_minutes', value: 30, recordedOn: '2026-10-16' },
      ],
    }));
    expect(view.cardio).toBeNull();
    expect(view.level).toBe('Developing');
    expect(view.levelWords).toContain('resting heart rate');
    expect(view.minutes?.centre).toBe('30');
    expect(view.minutes?.unit).toBe('min this week');
    expect(view.resting?.reading).toBe('62 bpm');
    expect(view.resting?.words).toContain('lower');
  });

  it('asks for an easy cardio session when strength dominates a fat-loss week', () => {
    const view = buildFitnessSnapshot(input({
      health: [
        { kind: 'strength_minutes', value: 40, recordedOn: '2026-10-14' },
        { kind: 'strength_minutes', value: 40, recordedOn: '2026-10-16' },
        { kind: 'cardio_minutes', value: 10, recordedOn: '2026-10-15' },
        { kind: 'workout_minutes', value: 40, recordedOn: '2026-10-16' },
      ],
    }));
    expect(view.recommendations.map((item) => item.text)).toContain(
      'Add one easy aerobic session of 30 to 45 minutes at a conversational pace, beside the strength work you already do.',
    );
    expect(view.recommendations.map((item) => item.text).join(' ')).toContain('sleep and protein');
    expect(view.recommendations.length).toBeLessThanOrEqual(3);
    expect(view.mix?.words).toContain('mostly strength');
    expect(view.recommendations.some((item) => /fewer|drop a session|mileage|runna/i.test(item.text))).toBe(false);
  });

  it('keeps the week and eases off when resting heart rate is up and sleep is down', () => {
    const view = buildFitnessSnapshot(input({
      health: [
        { kind: 'resting_heart_rate', value: 58, recordedOn: '2026-09-20' },
        { kind: 'resting_heart_rate', value: 66, recordedOn: '2026-10-16' },
        { kind: 'sleep_hours', value: 8, recordedOn: '2026-09-20' },
        { kind: 'sleep_hours', value: 6, recordedOn: '2026-10-16' },
        { kind: 'strength_minutes', value: 40, recordedOn: '2026-10-16' },
        { kind: 'workout_minutes', value: 40, recordedOn: '2026-10-16' },
      ],
    }));
    expect(view.recommendations.map((item) => item.text)).toEqual([
      'Keep the sessions you already do, and make this an easier week.',
    ]);
    expect(view.recovery?.tone).toBe('watch');
    expect(view.recommendations[0]?.text).not.toMatch(/add one/i);
  });

  it('suggests conditioning for a boxer when cardio is a small share', () => {
    const view = buildFitnessSnapshot(input({
      goal: 'elite_middle_boxer',
      health: [
        { kind: 'strength_minutes', value: 50, recordedOn: '2026-10-14' },
        { kind: 'cardio_minutes', value: 5, recordedOn: '2026-10-15' },
        { kind: 'workout_minutes', value: 50, recordedOn: '2026-10-14' },
      ],
    }));
    expect(view.recommendations[0]?.text).toBe(
      'Add one easy aerobic session of 30 to 45 minutes at a conversational pace, beside the boxing you already do.',
    );
    expect(view.recommendations.map((item) => item.text)).toContain(
      'Add one short interval session a week, and build it up gradually, beside the sessions you already do.',
    );
    expect(view.recommendations.map((item) => item.text).join(' ')).toMatch(/sleep and protein/i);
    expect(view.recommendations.some((item) => /mile|km|5k|runna|mileage/i.test(item.text))).toBe(false);
    expect(view.contextLine).not.toMatch(/sauna|dehydrat|rapid cut/i);
  });

  it('holds a runner week without a distance build', () => {
    const view = buildFitnessSnapshot(input({
      goal: 'elite_runner',
      health: [
        { kind: 'cardio_minutes', value: 40, recordedOn: '2026-10-15' },
        { kind: 'workout_minutes', value: 40, recordedOn: '2026-10-15' },
      ],
    }));
    expect(view.recommendations[0]?.text).toBe('Hold the sessions you already do, and keep one of them easy.');
    expect(view.recommendations[0]?.text).not.toMatch(/mile|km|5k|runna/i);
  });

  it('says what is missing, and what to turn on when access is denied', () => {
    const empty = buildFitnessSnapshot(input({ health: [], permission: 'unknown' }));
    expect(empty.level).toBeNull();
    expect(empty.missing).toContain('Connect Apple Health');
    expect(empty.cardio).toBeNull();
    expect(empty.recommendations).toEqual([]);
    const denied = buildFitnessSnapshot(input({ health: [], permission: 'denied' }));
    expect(denied.missing).toContain('Settings > Health > Data Access & Devices > Charioteer');
  });

  it('sorts workout types into strength, cardio, and other', () => {
    expect(workoutBucket(50)).toBe('strength');
    expect(workoutBucket(37)).toBe('cardio');
    expect(workoutBucket(8)).toBe('cardio');
    expect(workoutBucket(57)).toBe('other');
  });

  it('puts an actionable line into the health plan focus and the prompts', () => {
    const planInput: PlanInput = {
      now: new Date(2026, 9, 17, 12),
      salt: 'fit',
      displayName: 'Alex Hart',
      stage: 'stopped',
      sobrietyStartedAt: '2026-08-01T00:00:00.000Z',
      heightCm: 178,
      visionStatement: '',
      visionCaptions: [],
      interestLabels: [],
      reasons: [],
      limits: '',
      goal: 'lose_fat_build_muscle',
      goalSex: 'male',
      goalAge: 42,
      build: 'muscular',
      kcalTarget: 2200,
      proteinTarget: 140,
      hideCalories: false,
      foodLogs: [],
      checkIns: [],
      health: [
        { kind: 'strength_minutes', value: 40, recordedOn: '2026-10-14' },
        { kind: 'strength_minutes', value: 40, recordedOn: '2026-10-16' },
        { kind: 'cardio_minutes', value: 10, recordedOn: '2026-10-15' },
        { kind: 'workout_minutes', value: 40, recordedOn: '2026-10-14' },
        { kind: 'workout_minutes', value: 40, recordedOn: '2026-10-16' },
      ],
      bodyFatPct: null,
      leanMassKg: null,
      waistCm: null,
      doneTexts: [],
    };
    const plan = draftHealthPlan(planInput);
    expect(plan.focus.some((item) => item.text.startsWith('Add one easy aerobic session'))).toBe(true);
    expect(plan.focus.length).toBeLessThanOrEqual(3);
    expect(plan.fitness.sessions.map((item) => item.text).join(' ')).not.toMatch(/runna|progressive distance/i);
    expect(HEALTH_PLAN_PROMPT).toContain('When fitnessSnapshot is present');
    expect(HEALTH_PLAN_PROMPT).toContain('Do not write a running plan');
    expect(NUTRITION_PROMPT_LINE).toContain('fitness snapshot');
    expect(NUTRITION_PROMPT_LINE).toContain('not a medical assessment');
  });

  it('asks to read the new types, not blood oxygen, and keeps them off the public profile', () => {
    expect(APPLE_HEALTH_READ_TYPES).toContain('HKQuantityTypeIdentifierVO2Max');
    expect(APPLE_HEALTH_READ_TYPES).toContain('HKQuantityTypeIdentifierWalkingHeartRateAverage');
    expect(APPLE_HEALTH_READ_TYPES).toContain('HKQuantityTypeIdentifierHeartRateRecoveryOneMinute');
    expect(APPLE_HEALTH_READ_TYPES).toContain('HKWorkoutTypeIdentifier');
    expect(APPLE_HEALTH_READ_TYPES.join(' ')).not.toMatch(/Oxygen|BloodOxygen/i);
    expect(HEALTH_KINDS).not.toContain('vo2_max');
    const app = readFileSync('app.json', 'utf8');
    expect(app).toContain('cardio fitness');
    expect(app).toContain('not used for ads');
    expect(app).toContain('does not write steps, sleep, heart rate, workouts, or weight');
    const sync = readFileSync('src/health/sync.ios.ts', 'utf8');
    expect(sync).toContain('HKQuantityTypeIdentifierVO2Max');
    expect(sync).toContain('totalEnergyBurned');
    expect(sync).toContain("getStatistic('HKQuantityTypeIdentifierHeartRate'");
    expect(sync).not.toContain('OxygenSaturation');
    const migration = readFileSync('supabase/migrations/20261017120000_fitness_snapshot_kinds.sql', 'utf8');
    expect(migration).toContain("'vo2_max'");
    expect(migration).toContain("'strength_minutes'");
    const privacy = readFileSync('docs/privacy.md', 'utf8');
    expect(privacy).toContain('not used for advertising');
    expect(privacy).toContain('does not read blood oxygen');
    expect(readFileSync('src/app/(main)/stats.tsx', 'utf8')).toContain('<YourFitness');
    expect(readFileSync('src/app/(main)/health-plan.tsx', 'utf8')).toContain('<YourFitness');
    const card = readFileSync('src/ui/YourFitness.tsx', 'utf8');
    expect(card).toContain('What is this?');
    expect(card).toContain('closerToGoal(goal)');
    expect(card).toContain('whyGoalMatters(goal)');
    expect(card).toContain('<GoalLine note={false} />');
    expect(card).toContain('About these ranges');
    expect(card).toContain('ml/kg/min');
    expect(card).toContain('Check with a doctor before big changes.');
    expect(card).toContain('More info');
    expect(card).toContain('label="Close"');
    expect(card).toContain('ADDED_NOT_REDUCED');
  });

  it('explains the measures in plain words without inventing a sport range', () => {
    expect(MINUTES_WHAT).toContain('minutes');
    expect(RESTING_WHAT).toContain('bpm');
    expect(ADDED_NOT_REDUCED).toContain('already do');
    expect(ADDED_NOT_REDUCED).toContain('shorter');
    expect(whyCardioMatters('elite_heavy_boxer')).toContain('Elite Athlete (Heavy Weight Boxer)');
    expect(whyCardioMatters('elite_heavy_boxer')).toContain('approximate estimate');
    expect(whyCardioMatters('elite_heavy_boxer')).not.toMatch(/\d/);
    expect(whyCardioMatters('elite_runner')).toContain('Elite Athlete (Lean Runner etc.)');
    expect(whyCardioMatters('elite_runner')).toContain('no separate published range');
    expect(whyCardioMatters('elite_runner')).not.toMatch(/\d/);
    expect(whyCardioMatters('body_builder')).toContain('no separate published cardio range');
    expect(whyCardioMatters(null)).toContain('estimate');
    expect(whyMinutesMatter()).toContain('does not cut the week');
    expect(whyRestingMatters()).toContain('earlier readings');
  });

  it('compares a male heavyweight boxer with a lower approximate range than a middleweight', () => {
    const heavy = buildFitnessSnapshot(input({
      goal: 'elite_heavy_boxer',
      health: [{ kind: 'vo2_max', value: 42.6, recordedOn: '2026-10-16' }],
    }));
    const middle = buildFitnessSnapshot(input({
      goal: 'elite_middle_boxer',
      health: [{ kind: 'vo2_max', value: 42.6, recordedOn: '2026-10-16' }],
    }));
    expect(heavy.cardio?.compare.goal).toEqual({ low: 56, high: 62, label: 'Typical for Elite Athlete (Heavy Weight Boxer)' });
    expect(middle.cardio?.compare.goal).toEqual({ low: 59, high: 65, label: 'Typical for Elite Athlete (Middle Weight Boxer)' });
    expect(heavy.cardio?.compare.words).toContain('Typical for Elite Athlete (Heavy Weight Boxer), approximate, is about 56 to 62');
    expect(heavy.cardio?.compare.goal?.low).toBeLessThan(middle.cardio?.compare.goal?.low ?? 0);
    expect(heavy.cardio?.compare.words).toContain('below that approximate range');
    expect(heavy.cardio?.compare.sources.join(' ')).toContain('Kim, Song, and Min');
    expect(heavy.cardio?.compare.sources.join(' ')).toContain('Kaminsky');
    expect(heavy.contextLine).toContain('42.6 ml/kg/min');
    expect(heavy.contextLine).toContain('56 to 62');
    expect(heavy.contextLine).toContain('Check with a doctor before big changes.');
    expect(heavy.recommendations.map((item) => item.text).join(' ')).toMatch(/30 to 45/);
    expect(heavy.recommendations.map((item) => item.text).join(' ')).toMatch(/conversational/);
    expect(heavy.recommendations.map((item) => item.text).join(' ')).not.toMatch(/mileage|runna|\bkm\b/i);
  });

  it('withholds the boxing range for women and does not invent one for a runner', () => {
    const woman = buildFitnessSnapshot(input({
      goal: 'elite_heavy_boxer',
      goalSex: 'female',
      health: [{ kind: 'vo2_max', value: 42, recordedOn: '2026-10-16' }],
    }));
    expect(woman.cardio?.compare.goal).toBeNull();
    expect(woman.cardio?.compare.age).not.toBeNull();
    expect(woman.cardio?.compare.goalNote).toContain('men on a national team');
    expect(woman.cardio?.compare.words).not.toMatch(/56 to 62/);
    const runner = buildFitnessSnapshot(input({
      goal: 'elite_runner',
      health: [{ kind: 'vo2_max', value: 50, recordedOn: '2026-10-16' }],
    }));
    expect(runner.cardio?.compare.goal).toBeNull();
    expect(runner.cardio?.compare.goalNote).toContain('Elite Athlete (Lean Runner etc.) has no separate published range');
    expect(runner.cardio?.compare.words).toContain('Typical for men in their 40s');
  });

  it('keeps a carrying-extra comparison on their own readings', () => {
    const view = buildFitnessSnapshot(input({
      goal: 'lose_weight',
      build: 'carrying_extra',
      health: [{ kind: 'vo2_max', value: 32, recordedOn: '2026-10-16' }],
    }));
    expect(view.cardio?.compare.words).toContain(CARRYING_FITNESS_NOTE);
    expect(view.contextLine).toContain('own readings');
    expect(view.contextLine).toContain('mileage plan');
    expect(view.contextLine).toContain('Check with a doctor');
    expect(view.recommendations.map((item) => item.text).join(' ')).not.toMatch(/mileage|crash|deficit/);
    const quiet = buildFitnessSnapshot(input({
      goal: 'lose_weight',
      build: 'carrying_extra',
      health: [],
      scheduleWeekMinutes: null,
    }));
    expect(quiet.levelWords).toContain(CARRYING_FITNESS_NOTE);
    expect(quiet.contextLine).toContain('Do not add a mileage plan');
  });
});
