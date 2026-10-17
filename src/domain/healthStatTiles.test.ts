import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  BMI_MUSCLE_NOTE,
  buildHealthStatBoard,
  detailShowsStatusAgain,
  gapForStat,
  healthSharingSteps,
  healthTypesForGaps,
  HEALTH_STAT_CATALOGUE,
  HEALTH_STAT_SECTIONS,
  HEALTH_STATS_MISSING,
  HEALTH_TURN_ON,
  missingHealthAction,
  parseBodyGap,
  PERIOD_DAILY_AVERAGE,
  PERIOD_LAST_28,
  PERIOD_LAST_NIGHT,
  PERIOD_LATEST,
  PERIOD_LATEST_DAY,
  PERIOD_THIS_WEEK,
  PERIOD_TODAY,
  type HealthStatBoardInput,
  type HealthStatTile,
} from '@/domain/healthStatTiles';
import { APPLE_HEALTH_READ_TYPES } from '@/health/connection';
import { MIX_HOW } from '@/domain/fitnessSnapshot';
import { HEALTH_KINDS } from '@/domain/healthInsights';

const today = '2026-10-17';

function input(overrides: Partial<HealthStatBoardInput> = {}): HealthStatBoardInput {
  return {
    today,
    samples: [],
    body: [],
    activityEnergyKcal: null,
    heightCm: 178,
    adult: true,
    goalAge: 42,
    goalSex: 'male',
    goal: 'lose_fat_build_muscle',
    build: 'muscular',
    ...overrides,
  };
}

function alex(overrides: Partial<HealthStatBoardInput> = {}): HealthStatBoardInput {
  return input({
    samples: [
      { kind: 'steps', value: 9100, recordedOn: '2026-10-17' },
      { kind: 'steps', value: 8800, recordedOn: '2026-10-16' },
      { kind: 'sleep_hours', value: 7.4, recordedOn: '2026-10-17' },
      { kind: 'sleep_hours', value: 7.2, recordedOn: '2026-10-16' },
      { kind: 'resting_heart_rate', value: 62, recordedOn: '2026-10-17' },
      { kind: 'resting_heart_rate', value: 61, recordedOn: '2026-10-16' },
      { kind: 'hrv_sdnn', value: 48, recordedOn: '2026-10-17' },
      { kind: 'hrv_sdnn', value: 46, recordedOn: '2026-10-16' },
      { kind: 'workout_minutes', value: 32, recordedOn: '2026-10-17' },
      { kind: 'workout_minutes', value: 45, recordedOn: '2026-10-15' },
      { kind: 'workout_minutes', value: 20, recordedOn: '2026-10-12' },
      { kind: 'workout_minutes', value: 40, recordedOn: '2026-10-09' },
      { kind: 'strength_minutes', value: 40, recordedOn: '2026-10-17' },
      { kind: 'strength_minutes', value: 35, recordedOn: '2026-10-15' },
      { kind: 'cardio_minutes', value: 15, recordedOn: '2026-10-12' },
      { kind: 'vo2_max', value: 42, recordedOn: '2026-10-16' },
      { kind: 'vo2_max', value: 41, recordedOn: '2026-10-07' },
      { kind: 'walking_heart_rate', value: 96, recordedOn: '2026-10-15' },
      { kind: 'heart_rate_recovery', value: 22, recordedOn: '2026-10-17' },
      { kind: 'session_heart_rate', value: 132, recordedOn: '2026-10-17' },
      { kind: 'weight_kg', value: 74.2, recordedOn: '2026-10-17' },
      { kind: 'weight_kg', value: 74.6, recordedOn: '2026-10-10' },
    ],
    body: [{ recordedOn: today, bodyFatPct: 15, leanMassKg: 63, waistCm: 84 }],
    activityEnergyKcal: null,
    ...overrides,
  });
}

function tile(board: ReturnType<typeof buildHealthStatBoard>, id: string): HealthStatTile {
  const found = board.sections.flatMap((section) => section.tiles).find((item) => item.id === id);
  if (!found) throw new Error(`missing tile ${id}`);
  return found;
}

describe('health stat tiles', () => {
  it('lists every reading the app stores, and names the one gap once', () => {
    const board = buildHealthStatBoard(alex());
    expect(board.sections.map((section) => section.title)).toEqual([
      'Heart',
      'Fitness',
      'Sleep and recovery',
      'Body',
      'Activity',
    ]);
    expect(board.sections.flatMap((section) => section.tiles.map((item) => item.id))).toEqual([
      'resting_heart_rate',
      'walking_heart_rate',
      'heart_rate_recovery',
      'session_heart_rate',
      'vo2_max',
      'mix',
      'sleep_hours',
      'hrv_sdnn',
      'weight_kg',
      'body_fat',
      'waist',
      'lean_mass',
      'steps',
      'workouts',
      'weekly_active_minutes',
    ]);
    expect(board.missing).toEqual(['Active energy']);
    expect(board.missingLine).toBe(`${HEALTH_STATS_MISSING}: Active energy`);
  });

  it('uses the unit, a word beside the tone, and a shaded band only where a guide exists', () => {
    const board = buildHealthStatBoard(alex());
    const cardio = tile(board, 'vo2_max');
    expect(cardio.unit).toBe('ml/kg/min');
    expect(cardio.valueText).toBe('42');
    expect(cardio.status).toBe('Steady for your age and sex');
    expect(cardio.mark).toBe('On track');
    expect(cardio.hasGuideline).toBe(true);
    expect(cardio.visual.kind).toBe('zone');
    if (cardio.visual.kind === 'zone') {
      expect(cardio.visual.zoneLow).toBe(31.9);
      expect(cardio.visual.zoneHigh).toBe(45);
      expect(cardio.visual.zoneCaption).toBe('Typical for your age and sex');
    }
    expect(cardio.meaning).not.toMatch(/56 to 62|59 to 65/);
    expect(cardio.about).toContain('per kg of body weight per minute');

    const resting = tile(board, 'resting_heart_rate');
    expect(resting.unit).toBe('bpm');
    expect(resting.status).toBe('Within 60 to 100 bpm');
    expect(resting.mark).toBe('On track');
    expect(resting.hasGuideline).toBe(true);
    if (resting.visual.kind === 'zone') {
      expect(resting.visual.zoneLow).toBe(60);
      expect(resting.visual.zoneHigh).toBe(100);
    }

    const sleep = tile(board, 'sleep_hours');
    expect(sleep.unit).toBe('h');
    expect(sleep.status).toBe('Within 7 to 9 hours');
    if (sleep.visual.kind === 'zone') {
      expect(sleep.visual.zoneLow).toBe(7);
      expect(sleep.visual.zoneHigh).toBe(9);
    }

    const minutes = tile(board, 'weekly_active_minutes');
    expect(minutes.unit).toBe('min');
    expect(minutes.period).toBe(PERIOD_THIS_WEEK);
    expect(minutes.valueText).toBe('97');
    expect(minutes.weeklyLine).toBeNull();
    expect(minutes.status).toBe('53 minutes to 150');
    expect(minutes.mark).toBe('Note');
    expect(minutes.hasGuideline).toBe(true);
    if (minutes.visual.kind === 'zone') expect(minutes.visual.zoneLow).toBe(150);

    const weight = tile(board, 'weight_kg');
    expect(weight.unit).toBe('kg');
    expect(weight.status).toBe('Within the healthy BMI band');
    expect(weight.meaning).toContain('18.5 to 24.9');
    expect(weight.meaning).toContain('not a weight cut');
    expect(weight.meaning).toContain('will not plan a weight cut');
    expect(weight.meaning).toContain('Body fat and waist');
    expect(weight.meaning).not.toMatch(/to lose/i);
    expect(weight.trend).toBe('Down from the earlier reading.');

    const fat = tile(board, 'body_fat');
    expect(fat.unit).toBe('%');
    expect(fat.status).toBe('Within the screen band');
    expect(fat.meaning).toContain('not an NHS category');
    if (fat.visual.kind === 'zone') {
      expect(fat.visual.zoneLow).toBe(6);
      expect(fat.visual.zoneHigh).toBe(25);
    }

    const waist = tile(board, 'waist');
    expect(waist.unit).toBe('cm');
    expect(waist.valueText).toBe('84');
    expect(waist.status).toBe('Within the healthy range');
    expect(waist.hasGuideline).toBe(true);

    const lean = tile(board, 'lean_mass');
    expect(lean.unit).toBe('kg');
    expect(lean.valueText).toBe('63');
    expect(lean.hasGuideline).toBe(false);
    expect(lean.visual.kind).not.toBe('zone');
    expect(lean.rangeNote).toBe('There is no guideline band here.');

    for (const id of ['walking_heart_rate', 'heart_rate_recovery', 'session_heart_rate']) {
      const heart = tile(board, id);
      expect(heart.unit).toBe('bpm');
      expect(heart.hasGuideline).toBe(false);
      expect(heart.visual.kind).not.toBe('zone');
      expect(heart.rangeNote).toBe('There is no guideline band here.');
    }
    expect(tile(board, 'walking_heart_rate').valueText).toBe('96');
    expect(tile(board, 'heart_rate_recovery').valueText).toBe('22');
    expect(tile(board, 'session_heart_rate').valueText).toBe('132');
    expect(tile(board, 'walking_heart_rate').trend).toBeNull();

    const steps = tile(board, 'steps');
    expect(steps.unit).toBe('steps');
    expect(steps.valueText).toBe('9,100');
    expect(steps.hasGuideline).toBe(false);
    expect(steps.status).toBe('There is no daily step target.');
    expect(steps.trend).toBe('Higher than your recent average.');

    const hrv = tile(board, 'hrv_sdnn');
    expect(hrv.unit).toBe('ms');
    expect(hrv.hasGuideline).toBe(false);
    expect(hrv.status).toBe('There is no official UK target.');
    expect(hrv.trend).toBe('Near your own usual level.');

    const mix = tile(board, 'mix');
    expect(mix.unit).toBe('min');
    expect(mix.period).toBe(PERIOD_LAST_28);
    expect(mix.weeklyLine).toBe('About 23 min a week.');
    expect(mix.hasGuideline).toBe(false);
    expect(mix.status).toContain('Mostly strength');
    expect(mix.status).toContain('no guideline mix');
    expect(mix.trend).toBe(MIX_HOW);
    expect(mix.about).toContain('not heart rate');
    if (mix.visual.kind === 'bars') {
      expect(mix.visual.bars.map((bar) => bar.key)).toEqual(['strength', 'cardio', 'conditioning', 'other']);
      expect(mix.visual.caption).toBe('');
    }

    const workouts = tile(board, 'workouts');
    expect(workouts.unit).toBe('min');
    expect(workouts.valueText).toBe('97');
    expect(workouts.hasGuideline).toBe(false);
    expect(workouts.status).toContain('may not include walking');
    expect(workouts.trend).toBe('Up from the week before.');
    expect(minutes.trend).toBe('Up from the week before.');
  });

  it('hides every empty stat behind one Apple Health line', () => {
    const board = buildHealthStatBoard(input());
    expect(board.sections).toEqual([]);
    expect(board.missing).toEqual(HEALTH_STAT_CATALOGUE.map((item) => item.title));
    expect(board.missingLine).toBe(`${HEALTH_STATS_MISSING}: ${board.missing.join(', ')}`);
    expect(board.gaps.map((gap) => gap.title)).toEqual(board.missing);
    for (const gap of board.gaps) {
      expect(gap.source.length).toBeGreaterThan(10);
      if (gap.healthType) expect(APPLE_HEALTH_READ_TYPES).toContain(gap.healthType);
    }
    expect(HEALTH_STAT_SECTIONS.map((section) => section.title)).toEqual([
      'Heart',
      'Fitness',
      'Sleep and recovery',
      'Body',
      'Activity',
    ]);
  });

  it('does not guess an adult band when age or height is missing', () => {
    const young = buildHealthStatBoard(alex({ adult: false, goalAge: 16, goal: 'elite_heavy_boxer' }));
    for (const id of ['sleep_hours', 'resting_heart_rate', 'weight_kg', 'body_fat', 'waist']) {
      const item = tile(young, id);
      expect(item.hasGuideline).toBe(false);
      expect(item.visual.kind).not.toBe('zone');
      expect(item.status).toContain('under 18');
      expect(item.status).toContain('Nothing here is guessed');
    }
    const cardio = tile(young, 'vo2_max');
    expect(cardio.hasGuideline).toBe(false);
    expect(cardio.visual.kind).not.toBe('zone');
    expect(cardio.meaning).not.toMatch(/56 to 62/);

    const short = buildHealthStatBoard(alex({ heightCm: null }));
    expect(tile(short, 'weight_kg').hasGuideline).toBe(false);
    expect(tile(short, 'weight_kg').meaning).toContain('Nothing here is guessed');
    expect(tile(short, 'waist').hasGuideline).toBe(false);
    expect(tile(short, 'waist').meaning).toContain('Nothing here is guessed');
    expect(tile(short, 'body_fat').hasGuideline).toBe(true);
  });

  it('keeps a female boxing goal off the male study range', () => {
    const board = buildHealthStatBoard(input({
      goal: 'elite_heavy_boxer',
      goalSex: 'female',
      goalAge: 30,
      samples: [{ kind: 'vo2_max', value: 42, recordedOn: today }],
    }));
    const cardio = tile(board, 'vo2_max');
    expect(cardio.meaning).toContain('not shown');
    expect(cardio.visual.kind).toBe('zone');
    if (cardio.visual.kind === 'zone') {
      expect(cardio.visual.zoneLow).toBe(25.3);
      expect(cardio.visual.zoneHigh).toBe(36.1);
    }
  });

  it('shows active energy as a single figure with no band and no invented trend', () => {
    const board = buildHealthStatBoard(input({ activityEnergyKcal: 1840 }));
    const energy = tile(board, 'active_energy');
    expect(energy.unit).toBe('kcal');
    expect(energy.valueText).toBe('1,840');
    expect(energy.status).toBe('Recent daily average');
    expect(energy.trend).toBeNull();
    expect(energy.hasGuideline).toBe(false);
    expect(energy.visual.kind).not.toBe('zone');
    expect(board.missing).not.toContain('Active energy');
  });

  it('states a trend only when an earlier reading exists', () => {
    const down = buildHealthStatBoard(input({
      samples: [
        { kind: 'resting_heart_rate', value: 62, recordedOn: today },
        { kind: 'resting_heart_rate', value: 70, recordedOn: '2026-10-10' },
      ],
    }));
    expect(tile(down, 'resting_heart_rate').trend).toBe('Down from the earlier reading.');
    const once = buildHealthStatBoard(input({
      samples: [{ kind: 'walking_heart_rate', value: 96, recordedOn: today }],
    }));
    expect(tile(once, 'walking_heart_rate').trend).toBeNull();
    expect(tile(once, 'walking_heart_rate').history).toEqual([96]);
  });

  it('names a heavyweight class on the weight bar and does not warn a boxer for BMI', () => {
    const board = buildHealthStatBoard(input({
      goal: 'elite_heavy_boxer',
      goalSex: 'male',
      goalAge: 30,
      heightCm: 172,
      build: null,
      body: [],
      samples: [{ kind: 'weight_kg', value: 84.1, recordedOn: today }],
    }));
    const weight = tile(board, 'weight_kg');
    expect(weight.valueText).toBe('84.1');
    expect(weight.status).toBe(BMI_MUSCLE_NOTE);
    expect(weight.tone).toBe('info');
    expect(weight.mark).toBe('Note');
    expect(weight.status).not.toBe('Over the healthy BMI band');
    expect(weight.meaning).toContain('For Elite Athlete (Heavy Weight Boxer), you are under this class.');
    expect(weight.meaning).toContain('The gap to the bottom of this class is about 7.9 kg');
    expect(weight.meaning).toContain('over 92 kg to 100 kg');
    expect(weight.meaning).toContain('will not plan a weight cut');
    expect(weight.meaning).not.toMatch(/to lose/i);
    expect(weight.visual.kind).toBe('zone');
    if (weight.visual.kind === 'zone') {
      expect(weight.visual.zoneCaption).toBe('Healthy BMI band 54.7–73.7 kg');
      expect(weight.visual.goalCaption).toBe('Heavyweight class (reference): over 92 kg to 100 kg');
      expect(weight.visual.goalLow).toBe(92);
      expect(weight.visual.goalHigh).toBe(100);
      expect(weight.visual.status).toBe(weight.status);
    }
    expect(weight.extraSourceName).toContain('IBA Technical and Competition Rules');
    expect(weight.extraSourceUrl).toContain('iba.sport');
    expect(detailShowsStatusAgain('zone')).toBe(false);
    expect(detailShowsStatusAgain('ring')).toBe(false);
    expect(detailShowsStatusAgain('bars')).toBe(true);
  });

  it('softens the BMI line when body fat or waist is logged and fine, and keeps a plain warning otherwise', () => {
    const fine = buildHealthStatBoard(input({
      goal: 'lose_weight',
      goalSex: 'male',
      goalAge: 40,
      heightCm: 170,
      build: null,
      body: [{ recordedOn: today, bodyFatPct: 18, leanMassKg: null, waistCm: null }],
      samples: [{ kind: 'weight_kg', value: 90, recordedOn: today }],
    }));
    const softened = tile(fine, 'weight_kg');
    expect(softened.status).toBe(BMI_MUSCLE_NOTE);
    expect(softened.tone).toBe('info');
    expect(softened.meaning).not.toMatch(/to lose/i);
    if (softened.visual.kind === 'zone') expect(softened.visual.goalCaption ?? null).toBeNull();

    const plain = buildHealthStatBoard(input({
      goal: 'lose_weight',
      goalSex: 'male',
      goalAge: 40,
      heightCm: 170,
      build: null,
      body: [],
      samples: [{ kind: 'weight_kg', value: 90, recordedOn: today }],
    }));
    expect(tile(plain, 'weight_kg').status).toBe('Over the healthy BMI band');
    expect(tile(plain, 'weight_kg').tone).toBe('watch');

    const carrying = buildHealthStatBoard(input({
      goal: 'lose_weight',
      goalSex: 'male',
      goalAge: 40,
      heightCm: 170,
      build: 'carrying_extra',
      body: [],
      samples: [{ kind: 'weight_kg', value: 90, recordedOn: today }],
    }));
    const extra = tile(carrying, 'weight_kg');
    expect(extra.status).toBe('Over the healthy BMI band');
    expect(extra.status).not.toBe(BMI_MUSCLE_NOTE);
    expect(extra.tone).toBe('watch');
    expect(extra.meaning).toContain('steady change');
    expect(extra.meaning).toContain('Check with a doctor');
    expect(extra.meaning).not.toMatch(/crash|rapid cut/i);

    const builder = buildHealthStatBoard(input({
      goal: 'body_builder',
      goalSex: 'male',
      goalAge: 34,
      heightCm: 178,
      build: null,
      body: [],
      samples: [{ kind: 'weight_kg', value: 96, recordedOn: today }],
    }));
    const built = tile(builder, 'weight_kg');
    expect(built.status).toBe(BMI_MUSCLE_NOTE);
    expect(built.meaning).toContain('For Body Builder');
    expect(built.meaning).toContain('no separate published weight range');
    expect(built.meaning).not.toMatch(/to lose/i);
    if (built.visual.kind === 'zone') expect(built.visual.goalLow ?? null).toBeNull();
  });

  it('keeps the new readings off the public profile and leaves sharing on the existing switches', () => {
    expect(HEALTH_KINDS).not.toContain('vo2_max');
    expect(HEALTH_KINDS).not.toContain('walking_heart_rate');
    expect(HEALTH_KINDS).not.toContain('heart_rate_recovery');
    expect(HEALTH_KINDS).not.toContain('session_heart_rate');
    expect(HEALTH_KINDS).not.toContain('strength_minutes');
    expect(HEALTH_KINDS).not.toContain('conditioning_minutes');
    const screen = readFileSync('src/app/(main)/health.tsx', 'utf8');
    const board = readFileSync('src/ui/HealthStatBoard.tsx', 'utf8');
    const share = readFileSync('src/ui/HealthBoard.tsx', 'utf8');
    expect(screen).toContain('samples={snap.health}');
    expect(screen).toContain('body={snap.bodyComposition}');
    expect(screen).toContain('activityEnergyKcal={snap.nutrition.activityEnergyKcal}');
    expect(screen).not.toContain('communityPhotos');
    expect(screen).toContain('<HealthSectionShare />');
    expect(screen.indexOf('<HealthStatBoard')).toBeLessThan(screen.indexOf('<HealthBoard'));
    expect(board).toContain('valueWithPeriod');
    expect(board).toContain('tile.weeklyLine');
    expect(board).toContain('Each workout type');
    expect(board).toContain('onSetWorkoutBucket');
    expect(board).toContain('More info about');
    expect(board).toContain('More info');
    expect(board).toContain('detailShowsStatusAgain');
    expect(board).toContain('label="Close"');
    expect(board).toContain('accessibilityState={{ expanded: open }}');
    expect(board).not.toContain('ShareOnProfile');
    expect(board).not.toContain('community');
    expect(share).toContain('<ShareOnProfile');
    expect(readFileSync('src/domain/healthStatTiles.ts', 'utf8')).toContain(HEALTH_STATS_MISSING);
    expect(board).toContain('label={HEALTH_TURN_ON}');
    expect(readFileSync('src/domain/healthStatTiles.ts', 'utf8')).toContain(HEALTH_TURN_ON);
    expect(board).toContain('healthSharingSteps');
    expect(board).toContain('Save body reading');
    expect(board).toContain('Body fat (%)');
    expect(board).toContain('Lean body mass (kg)');
    expect(screen).toContain('turnOnAppleHealthReads');
    expect(screen).toContain('onSaveBody={saveBodyGap}');
    const ios = readFileSync('src/health/link.ios.ts', 'utf8');
    expect(ios).toContain('turnOnAppleHealthReads');
    expect(ios).toContain('getRequestStatusForAuthorization({ toRead })');
    expect(ios).toContain('missingHealthAction');
    expect(ios).toContain('requestAuthorization({ toRead })');
    expect(ios).toContain('openHealthApp()');
  });

  it('explains a missing boxer reading and offers body fat and lean mass in the app', () => {
    const board = buildHealthStatBoard(input());
    const recovery = board.gaps.find((gap) => gap.id === 'heart_rate_recovery');
    const fat = board.gaps.find((gap) => gap.id === 'body_fat');
    const lean = board.gaps.find((gap) => gap.id === 'lean_mass');
    expect(recovery).toEqual(gapForStat('heart_rate_recovery', 'Heart rate recovery'));
    expect(recovery?.source).toBe('Heart rate recovery needs a recent Apple Watch workout.');
    expect(recovery?.manual).toBe(false);
    expect(fat?.source).toBe('Body fat comes from a smart scale or manual entry in Health.');
    expect(fat?.manual).toBe(true);
    expect(fat?.healthType).toBe('HKQuantityTypeIdentifierBodyFatPercentage');
    expect(lean?.source).toBe('Lean mass comes from a smart scale or manual entry in Health.');
    expect(lean?.manual).toBe(true);
    expect(lean?.healthType).toBe('HKQuantityTypeIdentifierLeanBodyMass');
    expect(healthSharingSteps(['Heart rate recovery', 'Body fat', 'Lean mass'])).toBe(
      'Health > Sharing > Apps > Charioteer > turn on Heart rate recovery, Body fat, Lean mass.',
    );
    expect(healthTypesForGaps([recovery!, fat!, lean!])).toEqual([
      'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute',
      'HKQuantityTypeIdentifierBodyFatPercentage',
      'HKQuantityTypeIdentifierLeanBodyMass',
    ]);
    expect(missingHealthAction('shouldRequest')).toBe('request');
    expect(missingHealthAction('unknown')).toBe('request');
    expect(missingHealthAction('unnecessary')).toBe('open');
    expect(parseBodyGap('15', '63')).toEqual({ ok: true, bodyFatPct: 15, leanMassKg: 63 });
    expect(parseBodyGap('', '63')).toEqual({ ok: true, bodyFatPct: null, leanMassKg: 63 });
    expect(parseBodyGap('1', '')).toEqual({ ok: false, error: 'Body fat sits between 2% and 70%.' });
    expect(parseBodyGap('', '')).toEqual({ ok: false, error: 'Add body fat or lean mass.' });
    const logged = buildHealthStatBoard(alex());
    expect(logged.gaps.map((gap) => gap.id)).toEqual(['active_energy']);
    expect(logged.gaps[0]?.manual).toBe(false);
  });

  it('lists each workout type and follows a saved recategorisation', () => {
    const board = buildHealthStatBoard(input({
      samples: [
        { kind: 'workout_type_20', value: 540, recordedOn: today },
        { kind: 'workout_type_16', value: 300, recordedOn: today },
        { kind: 'workout_type_73', value: 80, recordedOn: today },
      ],
      workoutBuckets: { '73': 'strength' },
    }));
    const mix = tile(board, 'mix');
    expect(mix.meaning).toContain('Functional strength 540 min');
    expect(mix.meaning).toContain('Elliptical 300 min');
    expect(mix.meaning).toContain('Mixed cardio 80 min');
    expect(mix.meaning).toContain('shown on its own');
    expect(mix.period).toBe(PERIOD_LAST_28);
    expect(mix.valueText).toBe('920');
    expect(mix.weeklyLine).toBe('About 230 min a week.');
    expect(mix.breakdown?.map((row) => row.bucket)).toEqual(['strength', 'cardio', 'strength']);
    if (mix.visual.kind === 'bars') {
      expect(mix.visual.bars.find((bar) => bar.key === 'strength')?.value).toBe(620);
      expect(mix.visual.bars.find((bar) => bar.key === 'cardio')?.value).toBe(300);
      expect(mix.visual.bars.find((bar) => bar.key === 'conditioning')?.value).toBe(0);
    }
  });

  it('puts the period on the value line of every tile, and a week average on a 28-day total', () => {
    const board = buildHealthStatBoard(alex());
    const periods: Record<string, string> = {
      resting_heart_rate: PERIOD_LATEST,
      walking_heart_rate: PERIOD_LATEST,
      heart_rate_recovery: PERIOD_LATEST,
      session_heart_rate: PERIOD_LATEST,
      vo2_max: PERIOD_LATEST,
      mix: PERIOD_LAST_28,
      sleep_hours: PERIOD_LAST_NIGHT,
      hrv_sdnn: PERIOD_LATEST,
      weight_kg: PERIOD_LATEST,
      body_fat: PERIOD_LATEST,
      waist: PERIOD_LATEST,
      lean_mass: PERIOD_LATEST,
      steps: PERIOD_TODAY,
      workouts: PERIOD_THIS_WEEK,
      weekly_active_minutes: PERIOD_THIS_WEEK,
    };
    for (const [id, period] of Object.entries(periods)) {
      const item = tile(board, id);
      expect(item.period).toBe(period);
      expect(`${item.valueText} ${item.unit} - ${item.period}`).toContain(period);
      if (id !== 'mix') expect(item.weeklyLine).toBeNull();
    }
    expect(tile(board, 'sleep_hours').valueText).toBe('7.4');
    expect(tile(board, 'vo2_max').valueText).toBe('42');
    expect(tile(board, 'workouts').valueText).toBe('97');

    const earlier = buildHealthStatBoard(input({
      samples: [{ kind: 'steps', value: 4200, recordedOn: '2026-10-16' }],
    }));
    expect(tile(earlier, 'steps').period).toBe(PERIOD_LATEST_DAY);

    const energy = buildHealthStatBoard(input({ activityEnergyKcal: 1840 }));
    expect(tile(energy, 'active_energy').period).toBe(PERIOD_DAILY_AVERAGE);

    const long = buildHealthStatBoard(input({
      samples: [{ kind: 'strength_minutes', value: 1198, recordedOn: today }],
    }));
    const mix = tile(long, 'mix');
    expect(mix.valueText).toBe('1,198');
    expect(mix.period).toBe(PERIOD_LAST_28);
    expect(mix.weeklyLine).toBe('About 300 min a week.');
    expect(readFileSync('src/ui/HealthStatBoard.tsx', 'utf8')).toContain('{valueWithPeriod(tile)}');
    expect(readFileSync('src/domain/healthStatTiles.ts', 'utf8')).not.toContain("caption: 'Last 28 days'");
  });
});
