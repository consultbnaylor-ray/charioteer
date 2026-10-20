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
  WORKOUT_MIX_TITLE,
  periodActiveMinutes,
  sessionSplitRows,
  sessionTypeCounts,
  workoutMixReport,
  RESTING_WHAT,
  VO2_WHAT,
  whyCardioMatters,
  whyMinutesMatter,
  whyRestingMatters,
  dedupeWorkouts,
  rebucketStoredMinutes,
  withWorkoutBucket,
  workoutBucket,
  workoutTypeKind,
  workoutTypeLabel,
  workoutTypeMinutes,
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
    expect(view.minutes?.unit).toBe('min in last 7 days');
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
    expect(denied.missing).toContain('No data found from Apple Health');
    expect(denied.missing).toContain('profile picture (top right) > Privacy > Apps > Charioteer');
    expect(denied.missing).toContain('Settings > Health > Data Access & Devices > Charioteer');
    expect(denied.missing).not.toMatch(/access is off|switched off/i);
  });

  it('sorts workout types into strength, cardio, conditioning, and other', () => {
    expect(workoutBucket(50)).toBe('strength');
    expect(workoutBucket(20)).toBe('strength');
    expect(workoutBucket(59)).toBe('strength');
    expect(workoutBucket(11)).toBe('strength');
    expect(workoutBucket(37)).toBe('cardio');
    expect(workoutBucket(52)).toBe('cardio');
    expect(workoutBucket(16)).toBe('cardio');
    expect(workoutBucket(35)).toBe('cardio');
    expect(workoutBucket(44)).toBe('cardio');
    expect(workoutBucket(8)).toBe('conditioning');
    expect(workoutBucket(63)).toBe('conditioning');
    expect(workoutBucket(65)).toBe('conditioning');
    expect(workoutBucket(73)).toBe('conditioning');
    expect(workoutBucket(30)).toBe('conditioning');
    expect(workoutBucket(28)).toBe('conditioning');
    expect(workoutBucket(57)).toBe('other');
    expect(workoutBucket(66)).toBe('other');
    expect(workoutBucket(62)).toBe('other');
    expect(workoutBucket(80)).toBe('other');
    expect(workoutBucket(3000)).toBe('other');
    expect(workoutBucket(999)).toBe('other');
    expect(workoutBucket(Number.NaN)).toBe('other');
    expect(workoutBucket(0)).toBe('other');
    expect(workoutTypeLabel(3000)).toBe('Other');
    expect(workoutTypeLabel(20)).toBe('Functional strength');
    expect(workoutTypeLabel(73)).toBe('Mixed cardio');
    expect(workoutBucket(73, { '73': 'strength' })).toBe('strength');
    expect(withWorkoutBucket({}, 73, 'strength')).toEqual({ '73': 'strength' });
    expect(withWorkoutBucket({ '73': 'strength' }, 73, 'conditioning')).toEqual({});
  });

  it('follows named segments inside an Other workout and keeps the same minutes', () => {
    const parent = workoutTypeMinutes({ activityType: 50, durationMin: 40 });
    expect(parent).toEqual([{ activityType: 50, minutes: 40 }]);
    const unnamed = workoutTypeMinutes({ activityType: 0, durationMin: 20 });
    expect(unnamed).toEqual([{ activityType: 3000, minutes: 20 }]);
    expect(workoutBucket(unnamed[0]?.activityType ?? 0)).toBe('other');
    const split = workoutTypeMinutes({
      activityType: 3000,
      durationMin: 60,
      activities: [
        { activityType: 50, duration: 45 * 60 },
        { activityType: 52, duration: 15 * 60 },
        { activityType: 3000, duration: 5 * 60 },
      ],
    });
    expect(split).toEqual([
      { activityType: 50, minutes: 45 },
      { activityType: 52, minutes: 15 },
    ]);
    expect(split.reduce((sum, part) => sum + part.minutes, 0)).toBe(60);
    expect(workoutBucket(50)).toBe('strength');
    expect(workoutBucket(20)).toBe('strength');
    expect(workoutBucket(59)).toBe('strength');
    const samples = [
      { kind: 'workout_minutes' as const, value: 60, recordedOn: '2026-10-16', source: 'healthkit' as const },
      ...split.map((part) => ({
        kind: workoutTypeKind(part.activityType),
        value: part.minutes,
        recordedOn: '2026-10-16',
        source: 'healthkit' as const,
      })),
    ];
    const active = periodActiveMinutes({ samples, today: '2026-10-17', start: '2026-10-11' });
    expect(active.minutes).toBe(60);
    expect(active.report.total).toBe(60);
    expect(active.report.strength).toBe(45);
    expect(active.report.cardio).toBe(15);
    expect(active.report.other).toBe(0);
    const rows = sessionSplitRows(active.report);
    expect(rows.map((row) => row.label)).toEqual(['Strength', 'Cardio', 'Conditioning', 'Other']);
    expect(rows[0]).toMatchObject({ minutes: 45, share: 75 });
    expect(sessionTypeCounts(active.report.types)).toEqual([
      { label: 'Traditional strength', minutes: 45 },
      { label: 'Walking', minutes: 15 },
    ]);
    expect(sessionTypeCounts([{ label: 'Other', minutes: 0 }, { label: '  Core training ', minutes: 12.4 }])).toEqual([
      { label: 'Core training', minutes: 12 },
    ]);
  });

  it('counts one session once when the Watch and another app both wrote it', () => {
    const start = Date.parse('2026-10-17T10:00:00Z');
    const minute = 60 * 1000;
    const kept = dedupeWorkouts([
      { activityType: 50, startMs: start, endMs: start + 45 * minute, durationMin: 40, sourceId: 'com.apple.health' },
      { activityType: 73, startMs: start + 2 * minute, endMs: start + 47 * minute, durationMin: 45, sourceId: 'com.example.gym' },
      { activityType: 37, startMs: start + 3 * 60 * minute, endMs: start + 4 * 60 * minute, durationMin: 50, sourceId: 'com.apple.health' },
    ]);
    expect(kept.map((row) => row.activityType)).toEqual([50, 37]);
    expect(kept.reduce((sum, row) => sum + row.durationMin, 0)).toBe(90);
  });

  it('ignores stale cardio totals when the workout type is strength', () => {
    const view = buildFitnessSnapshot(input({
      health: [
        { kind: 'workout_type_50', value: 300, recordedOn: '2026-10-16', source: 'healthkit' },
        { kind: 'workout_type_8', value: 40, recordedOn: '2026-10-15', source: 'healthkit' },
        { kind: 'workout_type_50', value: 300, recordedOn: '2026-10-16', source: 'manual' },
        { kind: 'cardio_minutes', value: 900, recordedOn: '2026-10-16', source: 'healthkit' },
        { kind: 'strength_minutes', value: 10, recordedOn: '2026-10-16', source: 'healthkit' },
        { kind: 'workout_type_62', value: 15, recordedOn: '2026-10-14', source: 'healthkit' },
        { kind: 'workout_type_80', value: 10, recordedOn: '2026-10-14', source: 'healthkit' },
        { kind: 'workout_type_3000', value: 12, recordedOn: '2026-10-13', source: 'healthkit' },
      ],
      sourceApps: [
        { day: '2026-10-16', activityType: 50, minutes: 200, sourceName: 'Apple Watch' },
        { day: '2026-10-16', activityType: 50, minutes: 100, sourceName: 'Strong' },
      ],
    }));
    expect(view.mix?.words).toContain('mostly strength');
    expect(view.mix?.words).toContain('Strength 80%');
    expect(view.mix?.words).toContain('cardio 0%');
    expect(view.mix?.words).toContain('conditioning 11%');
    const lines = view.mix?.lines.join('\n') ?? '';
    expect(lines).toContain('Traditional strength: 300 min, strength. Apple Watch 200 min, Strong 100 min.');
    expect(lines).toContain('Boxing: 40 min, conditioning.');
    expect(lines).toContain('Flexibility: 15 min, other.');
    expect(lines).toContain('Cooldown: 10 min, other.');
    expect(lines).toContain('Other: 12 min, other.');
    expect(lines).toContain('not a session count');
    expect(lines).toContain('counts as other, not cardio');
    expect(lines).not.toMatch(/heart rate|gps|latitude/i);
    const report = workoutMixReport({
      samples: [
        { kind: 'workout_type_20', value: 10, recordedOn: '2026-10-16' },
        { kind: 'workout_type_20', value: 50, recordedOn: '2026-10-15' },
      ],
      today: '2026-10-17',
    });
    expect(report.types[0]?.minutes).toBe(60);
    expect(report.types).toHaveLength(1);
  });

  it('rebuilds bucket minutes from the stored workout types', () => {
    const rows = rebucketStoredMinutes(
      [
        { kind: 'workout_type_20', value: 40, recordedOn: '2026-10-16' },
        { kind: 'workout_type_73', value: 30, recordedOn: '2026-10-16' },
        { kind: 'workout_type_16', value: 15, recordedOn: '2026-10-15' },
      ],
      { '73': 'strength' },
    );
    const on = (kind: string, day: string) => rows.find((row) => row.kind === kind && row.recordedOn === day)?.value;
    expect(on('strength_minutes', '2026-10-16')).toBe(70);
    expect(on('conditioning_minutes', '2026-10-16')).toBe(0);
    expect(on('cardio_minutes', '2026-10-15')).toBe(15);
    expect(on('strength_minutes', '2026-10-15')).toBe(0);
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
    const buckets = readFileSync('supabase/migrations/20261017140000_workout_buckets.sql', 'utf8');
    expect(buckets).toContain('conditioning_minutes');
    expect(buckets).toContain('workout_type_');
    expect(buckets).toContain('workout_buckets');
    expect(buckets).not.toMatch(/drop table/i);
    expect(sync).toContain('dedupeWorkouts');
    expect(sync).toContain('does not choose the bucket');
    expect(readFileSync('src/domain/healthStatTiles.ts', 'utf8')).toContain('MIX_HOW');
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
    expect(card).toContain('WORKOUT_MIX_TITLE');
    expect(card).toContain('Fix ');
    expect(card).toContain('sessionSplitRows');
    expect(card).toContain('sessionTypeCounts');
    expect(card).toContain('periodHeading(period)');
    expect(card).toContain('CONDITIONING_NOTE');
    expect(card).toContain(' · ');
    expect(card).not.toContain('{view.mix?.words} {periodPhrase');
    expect(sync).toContain('workoutTypeMinutes');
    expect(WORKOUT_MIX_TITLE).toBe('How this is worked out');
    expect(readFileSync('src/domain/healthStatTiles.ts', 'utf8')).toContain('workoutMixReport');
    expect(readFileSync('supabase/functions/_shared/fitnessSnapshot.ts', 'utf8')).toContain('export function workoutMixReport');
    expect(readFileSync('supabase/functions/_shared/nutritionLoad.ts', 'utf8')).toContain('workoutBuckets: settings.workoutBuckets');
    expect(readFileSync('supabase/functions/health-plan/index.ts', 'utf8')).toContain('parseWorkoutBuckets');
    expect(readFileSync('src/health/sync.ios.ts', 'utf8')).toContain('saveWorkoutSources');
    expect(readFileSync('src/health/sync.ios.ts', 'utf8')).not.toContain('latitude');
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
    const superMiddle = buildFitnessSnapshot(input({
      goal: 'elite_super_middle_boxer',
      health: [{ kind: 'vo2_max', value: 42.6, recordedOn: '2026-10-16' }],
    }));
    const cruiser = buildFitnessSnapshot(input({
      goal: 'elite_cruiser_boxer',
      health: [{ kind: 'vo2_max', value: 42.6, recordedOn: '2026-10-16' }],
    }));
    expect(superMiddle.cardio?.compare.goal).toEqual({
      low: 59,
      high: 65,
      label: 'Typical for Elite Athlete (Super Middleweight Boxer)',
    });
    expect(cruiser.cardio?.compare.goal).toEqual({
      low: 56,
      high: 62,
      label: 'Typical for Elite Athlete (Cruiserweight Boxer)',
    });
    const feather = buildFitnessSnapshot(input({
      goal: 'elite_feather_boxer',
      health: [{ kind: 'vo2_max', value: 42.6, recordedOn: '2026-10-16' }],
    }));
    expect(feather.cardio?.compare.goal).toEqual({
      low: 59,
      high: 65,
      label: 'Typical for Elite Athlete (Featherweight Boxer)',
    });
    expect(whyCardioMatters('elite_light_heavy_boxer')).toContain('Elite Athlete (Light Heavyweight Boxer)');
    expect(whyCardioMatters('elite_light_heavy_boxer')).toContain('approximate');
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
