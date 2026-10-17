import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildHealthStatBoard,
  HEALTH_STAT_CATALOGUE,
  HEALTH_STAT_SECTIONS,
  HEALTH_STATS_MISSING,
  type HealthStatBoardInput,
  type HealthStatTile,
} from '@/domain/healthStatTiles';
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
    expect(minutes.unit).toBe('min this week');
    expect(minutes.valueText).toBe('97');
    expect(minutes.status).toBe('53 minutes to 150');
    expect(minutes.mark).toBe('Note');
    expect(minutes.hasGuideline).toBe(true);
    if (minutes.visual.kind === 'zone') expect(minutes.visual.zoneLow).toBe(150);

    const weight = tile(board, 'weight_kg');
    expect(weight.unit).toBe('kg');
    expect(weight.status).toBe('Within the healthy BMI band');
    expect(weight.meaning).toContain('18.5 to 24.9');
    expect(weight.meaning).toContain('not a weight cut');
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
    expect(mix.hasGuideline).toBe(false);
    expect(mix.status).toContain('Mostly strength');
    expect(mix.status).toContain('no guideline mix');
    if (mix.visual.kind === 'bars') {
      expect(mix.visual.bars.map((bar) => bar.key)).toEqual(['strength', 'cardio', 'other']);
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

  it('keeps the new readings off the public profile and leaves sharing on the existing switches', () => {
    expect(HEALTH_KINDS).not.toContain('vo2_max');
    expect(HEALTH_KINDS).not.toContain('walking_heart_rate');
    expect(HEALTH_KINDS).not.toContain('heart_rate_recovery');
    expect(HEALTH_KINDS).not.toContain('session_heart_rate');
    expect(HEALTH_KINDS).not.toContain('strength_minutes');
    const screen = readFileSync('src/app/(main)/health.tsx', 'utf8');
    const board = readFileSync('src/ui/HealthStatBoard.tsx', 'utf8');
    const share = readFileSync('src/ui/HealthBoard.tsx', 'utf8');
    expect(screen).toContain('samples={snap.health}');
    expect(screen).toContain('body={snap.bodyComposition}');
    expect(screen).toContain('activityEnergyKcal={snap.nutrition.activityEnergyKcal}');
    expect(screen).not.toContain('communityPhotos');
    expect(screen).toContain('<HealthSectionShare />');
    expect(screen.indexOf('<HealthStatBoard')).toBeLessThan(screen.indexOf('<HealthBoard'));
    expect(board).toContain('More info about');
    expect(board).toContain('More info');
    expect(board).toContain('label="Close"');
    expect(board).toContain('accessibilityState={{ expanded: open }}');
    expect(board).not.toContain('ShareOnProfile');
    expect(board).not.toContain('community');
    expect(share).toContain('<ShareOnProfile');
    expect(readFileSync('src/domain/healthStatTiles.ts', 'utf8')).toContain(HEALTH_STATS_MISSING);
  });
});
