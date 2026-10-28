import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  BMI_MUSCLE_NOTE,
  buildHealthStatBoard,
  narrowHealthStatBoard,
  detailShowsStatusAgain,
  restingTileShowsFitLine,
  gapForStat,
  healthSharingSteps,
  healthTurnOnPlan,
  healthTypesForGaps,
  HEALTH_PRIVACY_STEPS,
  HEALTH_SETTINGS_STEPS,
  HEALTH_SHEET_ASKED,
  HEALTH_SHEET_LIMIT,
  HEALTH_SHEET_WONT_SHOW,
  HEALTH_STAT_CATALOGUE,
  HEALTH_STAT_SECTIONS,
  HEALTH_STATS_MISSING,
  HEALTH_TURN_ON,
  missingHealthAction,
  parseBodyGap,
  PERIOD_LAST_7,
  PERIOD_LAST_30,
  PERIOD_LAST_NIGHT,
  PERIOD_LATEST,
  PERIOD_TODAY,
  parseHealthStatPeriod,
  scaledActivityMinutes,
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

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
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
    expect(cardio.title).toBe('VO2 max');
    expect(cardio.unit).toBe('ml/kg/min');
    expect(cardio.valueText).toBe('42');
    expect(cardio.status).toBe('Steady for your age and sex');
    expect(cardio.mark).toBe('On track');
    expect(cardio.hasGuideline).toBe(true);
    expect(cardio.visual.kind).toBe('ring');
    if (cardio.visual.kind === 'ring') {
      expect(cardio.visual.centre).toBe('42');
      expect(cardio.visual.unit).toBe('ml/kg/min');
      expect(cardio.visual.status).toBe('Steady for your age and sex');
      expect(cardio.visual.fill).toBeGreaterThan(0);
      expect(cardio.visual.fill).toBeLessThan(1);
    }
    expect(readFileSync('src/ui/HealthStatBoard.tsx', 'utf8')).toContain("stacked={section.id === 'fitness'}");
    expect(cardio.meaning).not.toMatch(/56 to 62|59 to 65/);
    expect(cardio.about).toContain('per kg of body weight per minute');
    expect(gapForStat('vo2_max', 'VO2 max').source).toBe('VO2 max comes from Apple Watch after outdoor walks or runs.');
    const boardSource = readFileSync('src/ui/HealthStatBoard.tsx', 'utf8');
    expect(boardSource).toContain('{VO2_CARD_LINE}');
    expect(boardSource).toContain('<Vo2MeasureBanner />');
    expect(boardSource.indexOf('<Vo2MeasureBanner />')).toBeLessThan(boardSource.indexOf('{OUTSIDE_SAFETY_LINE}'));
    expect(boardSource).toContain('vo2MeasuredLine(measuredOn, vo2Source)');
    expect(boardSource).toContain('{OUTSIDE_SAFETY_LINE}');
    expect(boardSource).toContain('{OUTSIDE_CRISIS_LINE}');

    const resting = tile(board, 'resting_heart_rate');
    expect(resting.unit).toBe('bpm');
    expect(resting.valueText).toBe('62');
    expect(resting.status).toBe('Within 60 to 100 bpm');
    expect(resting.mark).toBe('On track');
    expect(resting.hasGuideline).toBe(true);
    expect(restingTileShowsFitLine(resting)).toBe(false);
    if (resting.visual.kind === 'zone') {
      expect(resting.visual.zoneLow).toBe(60);
      expect(resting.visual.zoneHigh).toBe(100);
    }

    const sleep = tile(board, 'sleep_hours');
    expect(sleep.unit).toBe('h');
    expect(sleep.status).toBe('Within 7 to 9 hours. Average of 2 nights.');
    if (sleep.visual.kind === 'zone') {
      expect(sleep.visual.zoneLow).toBe(7);
      expect(sleep.visual.zoneHigh).toBe(9);
    }

    const minutes = tile(board, 'weekly_active_minutes');
    expect(minutes.unit).toBe('min');
    expect(minutes.period).toBe(PERIOD_LAST_7);
    expect(minutes.valueText).toBe('97');
    expect(minutes.status).toBe('The 150 minute figure is a moderate-activity reference. It fits the Garmin days. It does not grade the logged workouts.');
    expect(minutes.weeklyLine).toBe('Garmin days count vigorous minutes twice. Other days are the length of logged workouts, and this app cannot tell how hard those were.');
    expect(minutes.about).toBe('Active minutes: Garmin moderate minutes plus vigorous minutes counted twice, on days Garmin sent them. On other days, the length of workouts logged that day. The unit is minutes.');
    expect(minutes.mark).toBe('Note');
    expect(minutes.hasGuideline).toBe(true);
    if (minutes.visual.kind === 'zone') {
      expect(minutes.visual.zoneLow).toBe(150);
      expect(minutes.visual.zoneCaption).toBe('At least 150 min in 7 days');
    }

    const weight = tile(board, 'weight_kg');
    expect(weight.unit).toBe('kg');
    expect(weight.status).toBe('Within the healthy BMI band');
    expect(weight.meaning).toContain('18.5 to 24.9');
    expect(weight.meaning).toContain('not a weight cut');
    expect(weight.meaning).toContain('will not plan a weight cut');
    expect(weight.meaning).toContain('Body fat and waist');
    expect(weight.meaning).not.toMatch(/to lose/i);
    expect(weight.trend).toBe('Down from the 7 days before.');

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
    expect(lean.status).toBe('No published guideline.');
    expect(lean.rangeNote).toContain('No published guideline.');
    expect(lean.rangeNote).toContain('kilogram band is not shown');

    const session = tile(board, 'session_heart_rate');
    expect(session.unit).toBe('bpm');
    expect(session.valueText).toBe('132');
    expect(session.hasGuideline).toBe(true);
    expect(session.tone).toBe('info');
    expect(session.status).toContain('Inside the moderate zone');
    expect(session.status).toContain('114 to 136');
    expect(session.workedOut).toContain('208 − 0.7 × age');
    expect(session.workedOut).toContain('did not change with sex');
    expect(session.workedOut).toContain('not a target to reach the top');
    expect(session.sheet?.measures).toContain('Session heart rate');
    expect(session.rangeNote).toContain('no published session heart rate range for Lose Fat & Build Muscle specifically');
    expect(session.rangeNote).toContain('This is a reference, not a target.');
    expect(session.meaning).toContain('Population averages vary by person, medication and fitness.');
    if (session.visual.kind === 'zone') {
      expect(session.visual.zoneLow).toBe(114);
      expect(session.visual.zoneHigh).toBe(136);
      expect(session.visual.goalLow).toBe(138);
      expect(session.visual.goalHigh).toBe(170);
      expect(session.visual.goalCaption).not.toContain('This is a reference, not a target.');
      expect(session.meaning.match(/This is a reference, not a target\./g)).toHaveLength(1);
    }
    expect(session.sources?.map((source) => source.url)).toEqual([
      'https://www.jacc.org/doi/full/10.1016/S0735-1097(00)01054-8',
      'https://journals.lww.com/acsm-healthfitness/fulltext/2023/11000/estimating_maximal_heart_rate.4.aspx',
      'https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/target-heart-rates',
      'https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/',
    ]);

    const walking = tile(board, 'walking_heart_rate');
    expect(walking.valueText).toBe('96');
    expect(walking.hasGuideline).toBe(true);
    expect(walking.tone).toBe('info');
    expect(walking.status).toContain('Below the moderate zone');
    expect(walking.status).toContain('This is an approximation.');
    expect(walking.status).not.toContain('gentle effort');
    if (walking.visual.kind === 'zone') {
      expect(walking.visual.value).toBeLessThan(walking.visual.zoneLow);
    }
    expect(walking.rangeNote).toContain('Approximation, not an Apple norm.');
    expect(walking.meaning).toContain('Apple publishes no normal range');
    expect(walking.trend).toBeNull();
    expect(walking.sources?.[0]?.url).toBe('https://www.apple.com/health/pdf/Heart_Rate_Calorimetry_Activity_on_Apple_Watch_November_2024.pdf');

    const recovery = tile(board, 'heart_rate_recovery');
    expect(recovery.valueText).toBe('22');
    expect(recovery.hasGuideline).toBe(true);
    expect(recovery.tone).toBe('info');
    expect(recovery.status).toContain('Above 12 bpm');
    expect(recovery.meaning).toContain('not a healthy population');
    expect(recovery.rangeNote).toContain('12 to 23 bpm');
    expect(recovery.meaning.match(/This is a reference, not a target\./g)).toHaveLength(1);
    expect(recovery.sources?.[0]?.year).toBe(1999);
    if (recovery.visual.kind === 'zone') {
      expect(recovery.visual.zoneLow).toBe(12);
      expect(recovery.visual.zoneHigh).toBe(23);
      expect(recovery.visual.goalLow).toBeNull();
    }

    const steps = tile(board, 'steps');
    expect(steps.unit).toBe('steps');
    expect(steps.valueText).toBe('17,900');
    expect(steps.period).toBe(PERIOD_LAST_7);
    expect(steps.hasGuideline).toBe(true);
    expect(steps.visual.kind).not.toBe('zone');
    expect(steps.meaning).toContain('Paluch');
    expect(steps.meaning).toContain('Ding');
    expect(steps.status).toBe('Compared with published step research. Not an NHS step target.');
    expect(steps.meaning).toContain('do not set a daily step target');
    expect(steps.trend).toBe('Up from the earlier days in this period.');

    const hrv = tile(board, 'hrv_sdnn');
    expect(hrv.unit).toBe('ms');
    expect(hrv.valueText).toBe('47');
    expect(hrv.hasGuideline).toBe(true);
    expect(hrv.tone).toBe('info');
    expect(hrv.status).toBe('Study averages ran from 32 to 93 ms. Overall mean 50 ms.');
    expect(hrv.meaning).toContain('not split by age or sex');
    expect(hrv.meaning).toContain('24-hour age table');
    expect(hrv.rangeNote).toContain('no published heart-rate variability range for Lose Fat & Build Muscle specifically');
    expect(hrv.sources?.[0]?.url).toBe('https://onlinelibrary.wiley.com/doi/10.1111/j.1540-8159.2010.02841.x');
    expect(hrv.trend).toBeNull();
    if (hrv.visual.kind === 'zone') {
      expect(hrv.visual.zoneLow).toBe(32);
      expect(hrv.visual.zoneHigh).toBe(93);
    }

    const compared = buildHealthStatBoard(alex({
      samples: [
        ...alex().samples.filter((sample) => sample.kind !== 'hrv_sdnn'),
        { kind: 'hrv_sdnn', value: 45, recordedOn: '2026-10-12' },
        { kind: 'hrv_sdnn', value: 45, recordedOn: '2026-10-13' },
        { kind: 'hrv_sdnn', value: 45, recordedOn: '2026-10-14' },
        { kind: 'hrv_sdnn', value: 45, recordedOn: '2026-10-15' },
        { kind: 'hrv_sdnn', value: 45, recordedOn: '2026-10-16' },
        { kind: 'hrv_sdnn', value: 48, recordedOn: '2026-10-17' },
      ],
    }));
    expect(tile(compared, 'hrv_sdnn').trend).toBe('HRV 48 ms, up 7% vs your 30-day average');

    const mix = tile(board, 'mix');
    expect(mix.unit).toBe('min');
    expect(mix.valueText).toBe('90');
    expect(mix.period).toBe(PERIOD_LAST_7);
    expect(mix.weeklyLine).toBeNull();
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
    expect(workouts.meaning).toContain('No published guideline for these logged minutes');
    expect(workouts.trend).toBe('Up from the 7 days before.');
    expect(minutes.trend).toBe('Up from the 7 days before.');
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
    for (const id of ['walking_heart_rate', 'heart_rate_recovery', 'session_heart_rate', 'hrv_sdnn']) {
      const item = tile(young, id);
      expect(item.hasGuideline).toBe(false);
      expect(item.visual.kind).not.toBe('zone');
      expect(item.status).toContain('under 18');
    }

    const ageless = buildHealthStatBoard(alex({ goalAge: null }));
    const unplaced = tile(ageless, 'session_heart_rate');
    expect(unplaced.hasGuideline).toBe(false);
    expect(unplaced.visual.kind).not.toBe('zone');
    expect(unplaced.status).toContain('Add an age');
    expect(unplaced.meaning).toContain('Nothing here is guessed');
    expect(tile(ageless, 'walking_heart_rate').hasGuideline).toBe(false);
    expect(tile(ageless, 'heart_rate_recovery').hasGuideline).toBe(true);

    const cruiser = buildHealthStatBoard(alex({ goal: 'elite_cruiser_boxer' }));
    const athleteRest = tile(cruiser, 'resting_heart_rate');
    expect(athleteRest.meaning).toContain('as low as 40');
    expect(athleteRest.meaning).toContain('a cruiserweight boxer specifically');
    expect(athleteRest.meaning).toContain('This stand-in is not the Elite Athlete (Cruiserweight Boxer) range.');
    expect(athleteRest.meaning.match(/This is a reference, not a target\./g)).toHaveLength(1);
    expect(athleteRest.meaning.match(/Not medical advice/gi)).toHaveLength(1);
    expect(athleteRest.sources?.map((source) => source.name)).toEqual([
      'British Heart Foundation, 2026',
      'American Heart Association, 2024',
    ]);
    if (athleteRest.visual.kind === 'zone') {
      expect(athleteRest.visual.zoneLow).toBe(60);
      expect(athleteRest.visual.zoneHigh).toBe(100);
      expect(athleteRest.visual.goalLow ?? null).toBeNull();
    }
    const cruiserCardio = tile(cruiser, 'vo2_max');
    expect(cruiserCardio.meaning).toContain('56 to 62');
    expect(cruiserCardio.meaning).toContain('This is a reference, not a target.');
    expect(cruiserCardio.sources?.[0]?.year).toBe(2015);
    expect(cruiserCardio.sources?.[0]?.url).toBe('https://pmc.ncbi.nlm.nih.gov/articles/PMC4919021/');

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
    expect(cardio.status).toBe('Strong for your age and sex');
    expect(cardio.mark).toBe('On track');
    expect(cardio.visual.kind).toBe('ring');
    if (cardio.visual.kind === 'ring') {
      expect(cardio.visual.fill).toBe(1);
      expect(cardio.visual.status).toBe('Strong for your age and sex');
    }
  });

  it('shows active energy as a single figure with no band and no invented trend', () => {
    const board = buildHealthStatBoard(input({ activityEnergyKcal: 1840 }));
    const energy = tile(board, 'active_energy');
    expect(energy.unit).toBe('kcal');
    expect(energy.valueText).toBe('12,880');
    expect(energy.period).toBe(PERIOD_LAST_7);
    expect(energy.status).toBe('From the recent daily average.');
    expect(energy.weeklyLine).toBeNull();
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
    expect(tile(down, 'resting_heart_rate').trend).toBe('Down from the 7 days before.');
    expect(restingTileShowsFitLine(tile(down, 'resting_heart_rate'))).toBe(false);
    const atSixty = buildHealthStatBoard(input({
      samples: [{ kind: 'resting_heart_rate', value: 60, recordedOn: today }],
    }));
    expect(tile(atSixty, 'resting_heart_rate').valueText).toBe('60');
    expect(restingTileShowsFitLine(tile(atSixty, 'resting_heart_rate'))).toBe(false);

    const lowToday = '2026-10-27';
    const week = [53, 64, 56, 58, 55, 60, 59];
    const before = [66, 66, 66, 66, 66, 66, 66];
    const earlier = Array.from({ length: 16 }, () => 52);
    const lowSamples = [
      ...earlier.map((value, index) => ({ kind: 'resting_heart_rate' as const, value, recordedOn: shiftDay(lowToday, -(29 - index)) })),
      ...before.map((value, index) => ({ kind: 'resting_heart_rate' as const, value, recordedOn: shiftDay(lowToday, -(13 - index)) })),
      ...week.map((value, index) => ({ kind: 'resting_heart_rate' as const, value, recordedOn: shiftDay(lowToday, -(6 - index)) })),
    ];
    const lowBoard = buildHealthStatBoard(input({ today: lowToday, samples: lowSamples, goalAge: 42, adult: true }));
    const lowRest = tile(lowBoard, 'resting_heart_rate');
    expect(lowRest.valueText).toBe('58');
    expect(lowRest.period).toBe(PERIOD_LAST_7);
    expect(lowRest.mark).toBe('Note');
    expect(lowRest.status).toBe('Seek professional guidance.');
    expect(lowRest.trend).toBe('Down from the 7 days before.');
    expect(restingTileShowsFitLine(lowRest)).toBe(true);
    expect(lowRest.visual.kind).toBe('zone');
    if (lowRest.visual.kind === 'zone') {
      expect(lowRest.visual.value).toBe(58);
      expect(lowRest.visual.zoneLow).toBe(60);
      expect(lowRest.visual.zoneHigh).toBe(100);
      expect(lowRest.visual.scaleMin).toBe(40);
      expect(lowRest.visual.scaleMax).toBe(120);
      const span = lowRest.visual.scaleMax - lowRest.visual.scaleMin;
      expect((lowRest.visual.value - lowRest.visual.scaleMin) / span).toBeCloseTo(18 / 80, 5);
      expect((lowRest.visual.zoneLow - lowRest.visual.scaleMin) / span).toBeCloseTo(20 / 80, 5);
    }
    const shown = lowRest.readings.map((point) => point.value);
    expect(Math.min(...shown)).toBe(53);
    expect(Math.max(...shown)).toBe(64);
    expect(shown[shown.length - 1]).toBe(59);
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
    expect(weight.meaning).toContain('Under the class · 7.9 kg under the lower limit (over 92 kg up to 100 kg).');
    expect(weight.meaning).not.toMatch(/to lose|to gain/i);
    expect(weight.meaning).toContain('over 92 kg to 100 kg');
    expect(weight.meaning).toContain('will not plan a weight cut');
    expect(weight.meaning).not.toMatch(/to lose/i);
    expect(weight.visual.kind).toBe('zone');
    if (weight.visual.kind === 'zone') {
      expect(weight.visual.zoneCaption).toBe('Healthy BMI band 54.7–73.7 kg');
      expect(weight.visual.goalCaption).toBe('Heavyweight class (reference): over 92 kg up to 100 kg');
      expect(weight.visual.goalLow).toBe(92);
      expect(weight.visual.goalHigh).toBe(100);
      expect(weight.visual.status).toBe(weight.status);
    }
    expect(weight.extraSourceName).toContain('IBA Technical and Competition Rules');
    expect(weight.extraSourceUrl).toContain('iba.sport');
    const klass = buildHealthStatBoard(input({
      goal: 'elite_super_middle_boxer',
      goalSex: 'male',
      goalAge: 30,
      heightCm: 178,
      build: 'muscular',
      body: [],
      samples: [{ kind: 'weight_kg', value: 80, recordedOn: today }],
    }));
    const bar = tile(klass, 'weight_kg');
    expect(bar.status).toBe(BMI_MUSCLE_NOTE);
    expect(bar.meaning).toContain('Over the class · 3.8 kg over the upper limit (over 72.6 kg up to 76.2 kg).');
    expect(bar.meaning).toContain('76.2 kg (168 lb)');
    expect(bar.meaning).toContain('for reference only');
    expect(bar.meaning).not.toMatch(/to lose/i);
    if (bar.visual.kind === 'zone') {
      expect(bar.visual.goalCaption).toBe('Super middleweight limit (reference): over 72.6 kg up to 76.2 kg');
      expect(bar.visual.goalHigh).toBe(76.2);
    }
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
    expect(screen).toContain('samples={healthSamples}');
    expect(screen).toContain('useHealthSources');
    expect(readFileSync('src/health/useHealthSources.ts', 'utf8')).toContain('mergeHealthSamples(snap.health');
    expect(screen).toContain('body={snap.bodyComposition}');
    expect(screen).toContain('activityEnergyKcal={snap.nutrition.activityEnergyKcal}');
    expect(screen).toContain('period={period}');
    expect(screen).toContain('<StatPeriodToggle');
    const toggle = readFileSync('src/ui/StatPeriodToggle.tsx', 'utf8');
    const periodHook = readFileSync('src/health/useStatPeriod.ts', 'utf8');
    expect(toggle).toContain('HEALTH_STAT_PERIODS');
    expect(toggle).toContain('accessibilityLabel="Period"');
    expect(periodHook).toContain('loadHealthStatPeriod');
    expect(periodHook).toContain('saveHealthStatPeriod');
    expect(screen).not.toContain('communityPhotos');
    expect(screen).toContain('<HealthSectionShare />');
    expect(screen.indexOf('<HealthStatBoard')).toBeLessThan(screen.indexOf('<HealthBoard'));
    const moved = narrowHealthStatBoard(buildHealthStatBoard(alex()), { omit: ['weight_kg', 'waist'] });
    const movedIds = moved.sections.flatMap((section) => section.tiles.map((item) => item.id));
    expect(movedIds).not.toContain('weight_kg');
    expect(movedIds).not.toContain('waist');
    expect(movedIds).toContain('body_fat');
    const sheet = narrowHealthStatBoard(buildHealthStatBoard(alex()), { only: ['weight_kg', 'waist'] });
    expect(sheet.sections.flatMap((section) => section.tiles.map((item) => item.id))).toEqual(['weight_kg', 'waist']);
    expect(sheet.missingLine ?? '').not.toMatch(/Body fat|Lean mass|Steps/);
    expect(board).toContain('valueWithPeriod');
    expect(board).toContain('tile.weeklyLine');
    expect(board).toContain('tile.empty');
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
    expect(board).toContain('pendingLabel="Asking..."');
    expect(board).toContain('HEALTH_SHEET_WONT_SHOW');
    expect(board).toContain('HEALTH_SHEET_ASKED');
    expect(board).not.toContain('Sharing > Apps');
    expect(readFileSync('src/domain/healthStatTiles.ts', 'utf8')).toContain(HEALTH_TURN_ON);
    expect(board).toContain('healthSharingSteps');
    expect(board).toContain('Save body reading');
    expect(board).toContain('Body fat (%)');
    expect(board).toContain('Lean body mass (kg)');
    expect(screen).toContain('turnOnAppleHealthReads');
    expect(screen).toContain('onSaveBody={SHOW_WEIGHT_SECTION ? saveBodyGap : undefined}');
    const ios = readFileSync('src/health/link.ios.ts', 'utf8');
    const turnOn = ios.slice(ios.indexOf('export async function turnOnAppleHealthReads'), ios.indexOf('export async function ensureCurrentAppleHealthReads'));
    expect(ios).toContain('turnOnAppleHealthReads');
    expect(turnOn).toContain('getRequestStatusForAuthorization({ toRead })');
    expect(turnOn).toContain('healthTurnOnPlan');
    expect(turnOn).toContain('requestAuthorization({ toRead })');
    expect(turnOn).toContain("plan === 'explain'");
    expect(turnOn).toContain('openHealthApp()');
    expect(turnOn.indexOf('requestAuthorization({ toRead })')).toBeLessThan(turnOn.indexOf('openHealthApp()'));
    expect(turnOn).not.toContain('types.filter');
    expect(ios).toContain('const toRead = [...APPLE_HEALTH_READ_TYPES]');
    const screenTurn = screen.slice(screen.indexOf('async function turnOnMissing'), screen.indexOf('async function askUnasked'));
    expect(screenTurn).toContain('loadVisibility()');
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
    const steps = healthSharingSteps(['Heart rate recovery', 'Body fat', 'Lean mass']);
    expect(steps).toContain('Heart rate recovery, Body fat, Lean mass');
    expect(steps).toContain(HEALTH_SHEET_LIMIT);
    expect(steps).toContain(HEALTH_PRIVACY_STEPS);
    expect(steps).toContain(HEALTH_SETTINGS_STEPS);
    expect(steps).toContain('Health app > profile picture (top right) > Privacy > Apps > Charioteer');
    expect(steps).toContain('Settings > Health > Data Access & Devices > Charioteer');
    expect(steps).not.toContain('Sharing > Apps');
    expect(steps).not.toMatch(/switched off/i);
    expect(healthTypesForGaps([recovery!, fat!, lean!])).toEqual([
      'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute',
      'HKQuantityTypeIdentifierBodyFatPercentage',
      'HKQuantityTypeIdentifierLeanBodyMass',
    ]);
    expect(missingHealthAction('shouldRequest')).toBe('request');
    expect(missingHealthAction('unknown')).toBe('request');
    expect(missingHealthAction('unnecessary')).toBe('open');
    expect(healthTurnOnPlan('shouldRequest')).toBe('sheet');
    expect(healthTurnOnPlan('unknown')).toBe('sheet');
    expect(healthTurnOnPlan('unnecessary')).toBe('explain');
    expect(HEALTH_STATS_MISSING).toBe('No data found yet');
    expect(HEALTH_TURN_ON).toBe('Ask Apple Health');
    expect(HEALTH_SHEET_WONT_SHOW).toContain('will not appear');
    expect(HEALTH_SHEET_ASKED).toContain('asked again');
    for (const item of HEALTH_STAT_CATALOGUE) {
      const gap = gapForStat(item.id, item.title);
      if (gap.healthType) expect(APPLE_HEALTH_READ_TYPES).toContain(gap.healthType);
    }
    expect(APPLE_HEALTH_READ_TYPES).toEqual(expect.arrayContaining([
      'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute',
      'HKQuantityTypeIdentifierBodyFatPercentage',
      'HKQuantityTypeIdentifierLeanBodyMass',
      'HKQuantityTypeIdentifierVO2Max',
      'HKWorkoutTypeIdentifier',
    ]));
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
    expect(mix.period).toBe(PERIOD_LAST_7);
    expect(mix.valueText).toBe('920');
    expect(mix.weeklyLine).toBeNull();
    expect(mix.breakdown?.map((row) => row.bucket)).toEqual(['strength', 'cardio', 'strength']);
    if (mix.visual.kind === 'bars') {
      expect(mix.visual.bars.find((bar) => bar.key === 'strength')?.value).toBe(620);
      expect(mix.visual.bars.find((bar) => bar.key === 'cardio')?.value).toBe(300);
      expect(mix.visual.bars.find((bar) => bar.key === 'conditioning')?.value).toBe(0);
    }
  });

  it('puts the period on the value line of every tile, and a week average on a 30-day total', () => {
    const board = buildHealthStatBoard(alex());
    const periods: Record<string, string> = {
      resting_heart_rate: PERIOD_LAST_7,
      walking_heart_rate: PERIOD_LAST_7,
      heart_rate_recovery: PERIOD_LAST_7,
      session_heart_rate: PERIOD_LAST_7,
      vo2_max: PERIOD_LATEST,
      mix: PERIOD_LAST_7,
      sleep_hours: PERIOD_LAST_7,
      hrv_sdnn: PERIOD_LAST_7,
      weight_kg: PERIOD_LAST_7,
      body_fat: PERIOD_LAST_7,
      waist: PERIOD_LAST_7,
      lean_mass: PERIOD_LAST_7,
      steps: PERIOD_LAST_7,
      workouts: PERIOD_LAST_7,
      weekly_active_minutes: PERIOD_LAST_7,
    };
    for (const [id, period] of Object.entries(periods)) {
      const item = tile(board, id);
      expect(item.period).toBe(period);
      expect(item.empty).toBe(false);
      expect(`${item.valueText} ${item.unit} - ${item.period}`).toContain(period);
      if (id === 'weekly_active_minutes') {
        expect(item.weeklyLine).toBe('Garmin days count vigorous minutes twice. Other days are the length of logged workouts, and this app cannot tell how hard those were.');
      } else {
        expect(item.weeklyLine).toBeNull();
      }
    }
    expect(tile(board, 'sleep_hours').valueText).toBe('7.3');
    expect(tile(board, 'resting_heart_rate').valueText).toBe('62');
    expect(tile(board, 'vo2_max').valueText).toBe('42');
    expect(tile(board, 'vo2_max').trend).toBe('Steady against the 7 days before.');
    expect(tile(board, 'workouts').valueText).toBe('97');

    const earlier = buildHealthStatBoard(input({
      period: 'day',
      samples: [{ kind: 'steps', value: 4200, recordedOn: '2026-10-16' }],
    }));
    const quietSteps = tile(earlier, 'steps');
    expect(quietSteps.empty).toBe(true);
    expect(quietSteps.valueText).toBe('Latest 4,200 steps · 16 Oct');
    expect(quietSteps.unit).toBe('');
    expect(quietSteps.period).toBe('older than today');
    expect(quietSteps.status).toBe('This reading is older than today.');
    expect(quietSteps.hasGuideline).toBe(false);
    expect(earlier.missing).not.toContain('Steps');

    const energy = buildHealthStatBoard(input({ activityEnergyKcal: 1840 }));
    expect(tile(energy, 'active_energy').period).toBe(PERIOD_LAST_7);
    expect(tile(energy, 'active_energy').status).toBe('From the recent daily average.');

    const long = buildHealthStatBoard(input({
      period: '30',
      samples: [{ kind: 'strength_minutes', value: 1198, recordedOn: today }],
    }));
    const mix = tile(long, 'mix');
    expect(mix.valueText).toBe('1,198');
    expect(mix.period).toBe(PERIOD_LAST_30);
    expect(mix.weeklyLine).toBe('About 280 min a week.');
    expect(readFileSync('src/ui/HealthStatBoard.tsx', 'utf8')).toContain('{valueWithPeriod(tile)}');
    expect(readFileSync('src/ui/HealthStatBoard.tsx', 'utf8')).toContain('if (!tile.unit)');
    expect(readFileSync('src/domain/healthStatTiles.ts', 'utf8')).not.toContain("caption: 'Last 28 days'");
    const periodFile = readFileSync('supabase/functions/_shared/statWindow.ts', 'utf8');
    expect(periodFile).toContain("day: 'Day'");
    expect(periodFile).toContain("'7': '7 days'");
    expect(periodFile).toContain("'30': '30 days'");
    expect(periodFile).toContain("'60': '60 days'");
    expect(periodFile).toContain("'90': '90 days'");
    expect(periodFile).toContain("'6m': '6 months'");
    expect(periodFile).toContain("'12m': '12 months'");
  });

  it('switches totals, averages, the latest VO2 reading, and the activity guide with the period', () => {
    expect(parseHealthStatPeriod(undefined)).toBe('7');
    expect(parseHealthStatPeriod('nope')).toBe('7');
    expect(parseHealthStatPeriod('day')).toBe('day');
    expect(scaledActivityMinutes(150, 'day')).toBe(21);
    expect(scaledActivityMinutes(150, '7')).toBe(150);
    expect(scaledActivityMinutes(150, '30')).toBe(643);
    expect(scaledActivityMinutes(75, 'day')).toBe(11);
    expect(scaledActivityMinutes(75, '30')).toBe(321);

    const day = buildHealthStatBoard(alex({ period: 'day' }));
    expect(tile(day, 'sleep_hours').valueText).toBe('7.4');
    expect(tile(day, 'sleep_hours').period).toBe(PERIOD_LAST_NIGHT);
    expect(tile(day, 'sleep_hours').status).toBe('Within 7 to 9 hours. 1 night.');
    expect(tile(day, 'steps').valueText).toBe('9,100');
    expect(tile(day, 'steps').period).toBe(PERIOD_TODAY);
    expect(tile(day, 'steps').status).toBe('Compared with published step research. Not an NHS step target.');
    expect(tile(day, 'steps').trend).toBe('Up from the day before.');
    expect(tile(day, 'workouts').valueText).toBe('32');
    const dayMinutes = tile(day, 'weekly_active_minutes');
    expect(dayMinutes.valueText).toBe('32');
    expect(dayMinutes.status).toBe('The 150 minute figure is a moderate-activity reference. It fits the Garmin days. It does not grade the logged workouts.');
    if (dayMinutes.visual.kind === 'zone') {
      expect(dayMinutes.visual.zoneLow).toBe(21);
      expect(dayMinutes.visual.zoneCaption).toBe('At least 21 min today');
    }
    expect(dayMinutes.meaning).toContain('150 minutes of moderate activity a week');
    expect(dayMinutes.meaning).toContain('A vigorous minute can stand in for two moderate minutes.');
    expect(dayMinutes.meaning).not.toContain('at least 21 minutes');
    expect(tile(day, 'vo2_max').valueText).toBe('42');
    expect(tile(day, 'vo2_max').period).toBe(PERIOD_LATEST);
    expect(tile(day, 'vo2_max').trend).toBe('No readings today.');
    expect(tile(day, 'vo2_max').history).toEqual([]);
    expect(tile(day, 'walking_heart_rate').empty).toBe(true);
    expect(tile(day, 'walking_heart_rate').valueText).toBe('Latest 96 bpm · 15 Oct');
    expect(tile(day, 'walking_heart_rate').period).toBe('older than today');
    expect(tile(day, 'walking_heart_rate').status).toBe('This reading is older than today.');
    expect(day.missing).not.toContain('Walking heart rate');
    const daySleep = tile(day, 'sleep_hours');
    expect(daySleep.visual.kind).toBe('zone');
    if (daySleep.visual.kind === 'zone') {
      expect(daySleep.visual.zoneLow).toBe(7);
      expect(daySleep.visual.zoneHigh).toBe(9);
    }
    const dayResting = tile(day, 'resting_heart_rate');
    if (dayResting.visual.kind === 'zone') {
      expect(dayResting.visual.zoneLow).toBe(60);
      expect(dayResting.visual.zoneHigh).toBe(100);
    }

    const month = buildHealthStatBoard(alex({ period: '30' }));
    expect(tile(month, 'steps').valueText).toBe('17,900');
    expect(tile(month, 'steps').weeklyLine).toBe('About 4,177 steps a week.');
    expect(tile(month, 'workouts').valueText).toBe('137');
    expect(tile(month, 'workouts').weeklyLine).toBe('About 32 min a week.');
    const monthMinutes = tile(month, 'weekly_active_minutes');
    expect(monthMinutes.valueText).toBe('137');
    expect(monthMinutes.status).toBe('The 150 minute figure is a moderate-activity reference. It fits the Garmin days. It does not grade the logged workouts.');
    expect(monthMinutes.weeklyLine).toContain('About 32 min a week.');
    expect(monthMinutes.weeklyLine).toContain('cannot tell how hard those were');
    if (monthMinutes.visual.kind === 'zone') {
      expect(monthMinutes.visual.zoneLow).toBe(643);
      expect(monthMinutes.visual.zoneCaption).toBe('At least 643 min in 30 days');
    }
    expect(monthMinutes.meaning).toContain('75 minutes of vigorous activity');
    expect(monthMinutes.meaning).not.toContain('321 minutes of vigorous activity');
    expect(tile(month, 'mix').valueText).toBe('90');
    expect(tile(month, 'mix').weeklyLine).toBe('About 21 min a week.');
    expect(tile(month, 'sleep_hours').valueText).toBe('7.3');
    expect(tile(month, 'weight_kg').valueText).toBe('74.4');
    expect(tile(month, 'weight_kg').trend).toBe('Down from the earlier days in this period.');
    expect(tile(month, 'vo2_max').history).toEqual([41, 42]);
    expect(tile(month, 'vo2_max').trend).toBe('Steady against the earlier days in this period.');
    expect(tile(month, 'resting_heart_rate').history).toEqual([61, 62]);

    const monthEnergy = buildHealthStatBoard(input({ period: '30', activityEnergyKcal: 1840 }));
    const energy = tile(monthEnergy, 'active_energy');
    expect(energy.valueText).toBe('55,200');
    expect(energy.period).toBe(PERIOD_LAST_30);
    expect(energy.weeklyLine).toBe('About 12,880 kcal a week.');
    expect(energy.trend).toBeNull();
    expect(energy.status).toBe('From the recent daily average.');

    const dayEnergy = buildHealthStatBoard(input({ period: 'day', activityEnergyKcal: 1840 }));
    expect(tile(dayEnergy, 'active_energy').valueText).toBe('1,840');
    expect(tile(dayEnergy, 'active_energy').period).toBe(PERIOD_TODAY);

    const recategorised = buildHealthStatBoard(input({
      period: '30',
      samples: [
        { kind: 'workout_type_20', value: 540, recordedOn: today },
        { kind: 'workout_type_16', value: 300, recordedOn: today },
        { kind: 'workout_type_73', value: 80, recordedOn: today },
      ],
      workoutBuckets: { '73': 'strength' },
    }));
    expect(tile(recategorised, 'mix').weeklyLine).toBe('About 215 min a week.');
  });

  it('averages the nights in the period, and names an older night when the period is empty', () => {
    const recent = buildHealthStatBoard(input({
      period: '7',
      samples: [
        { kind: 'sleep_hours', value: 8, recordedOn: '2026-10-15' },
        { kind: 'sleep_hours', value: 6, recordedOn: '2026-10-16' },
        { kind: 'sleep_hours', value: 7, recordedOn: '2026-10-17' },
      ],
    }));
    const averaged = tile(recent, 'sleep_hours');
    expect(averaged.valueText).toBe('7');
    expect(averaged.unit).toBe('h');
    expect(averaged.period).toBe(PERIOD_LAST_7);
    expect(averaged.status).toBe('Within 7 to 9 hours. Average of 3 nights.');
    expect(averaged.meaning).toContain('Average of 3 nights.');
    expect(averaged.empty).toBe(false);

    const stale = buildHealthStatBoard(input({
      today: '2026-10-17',
      period: '7',
      samples: [
        { kind: 'sleep_hours', value: 5.8, recordedOn: '2026-09-25' },
        { kind: 'resting_heart_rate', value: 58, recordedOn: '2026-09-25' },
        { kind: 'hrv_sdnn', value: 41, recordedOn: '2026-09-20' },
        { kind: 'weight_kg', value: 76.4, recordedOn: '2026-09-25' },
      ],
      body: [{ recordedOn: '2026-09-25', bodyFatPct: 19.5, leanMassKg: null, waistCm: null }],
    }));
    const sleep = tile(stale, 'sleep_hours');
    expect(sleep.valueText).toBe('Latest night 5h 48m · 25 Sep');
    expect(sleep.period).toBe('older than the last 7 days');
    expect(sleep.status).toBe('This reading is older than the last 7 days.');
    expect(sleep.meaning).toContain('Latest night 5h 48m · 25 Sep');
    expect(sleep.status).not.toContain('No readings');
    expect(tile(stale, 'resting_heart_rate').valueText).toBe('Latest 58 bpm · 25 Sep');
    expect(tile(stale, 'hrv_sdnn').valueText).toBe('Latest 41 ms · 20 Sep');
    expect(tile(stale, 'weight_kg').valueText).toBe('Latest 76.4 kg · 25 Sep');
    expect(tile(stale, 'body_fat').valueText).toBe('Latest 19.5% · 25 Sep');
    expect(tile(stale, 'body_fat').period).toBe('older than the last 7 days');

    const lastNight = buildHealthStatBoard(input({
      period: 'day',
      samples: [{ kind: 'sleep_hours', value: 5.8, recordedOn: '2026-09-25' }],
    }));
    expect(tile(lastNight, 'sleep_hours').valueText).toBe('Latest night 5h 48m · 25 Sep');
    expect(tile(lastNight, 'sleep_hours').period).toBe('older than last night');

    const month = buildHealthStatBoard(input({
      period: '30',
      samples: [{ kind: 'sleep_hours', value: 5.8, recordedOn: '2026-09-01' }],
    }));
    expect(tile(month, 'sleep_hours').period).toBe('older than the last 30 days');
    expect(tile(month, 'sleep_hours').valueText).toBe('Latest night 5h 48m · 1 Sep');
  });
});
