import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { APPLE_HEALTH_READ_TYPES } from '@/health/connection';
import { GOAL_LABEL } from '@/domain/nutrition';
import { VISIBLE_SAFETY_LINE } from '@/domain/visibleSafety';
import {
  THUMOS_BMI_LINE,
  THUMOS_BOTH_OFF_LINE,
  THUMOS_EMPTY_LINE,
  THUMOS_FAILED_LINE,
  THUMOS_HEALTH_OFF_LINE,
  THUMOS_LOCAL_LINE,
  THUMOS_OFF_LINE,
  THUMOS_ANALYSE_AGAIN,
  THUMOS_LOOKING_GOOD,
  THUMOS_LOOKING_GOOD_TARGET,
  THUMOS_MIXED,
  THUMOS_MIXED_TARGET,
  THUMOS_NEEDS_WORK_TARGET,
  THUMOS_NO_SLEEP,
  THUMOS_NO_TIME_ESTIMATE,
  THUMOS_PROTEIN_SHORT,
  THUMOS_READING_LABEL,
  THUMOS_RESTING_HIGH,
  THUMOS_STRENGTH_NOT_RECORDED,
  THUMOS_VO2_DEVELOPING,
  THUMOS_WEIGHT_AWAY_CHANGE,
  figuresForNote,
  thumosDetailLines,
  THUMOS_READING_PROMPT,
  guardReadingComment,
  latestKind,
  showReadingDraft,
  sumKindSince,
  thumosReadingComment,
  trainsForReading,
  type ThumosReadingInput,
} from '@/domain/thumosReading';

const TODAY = '2026-10-27';

function sample(overrides: Partial<ThumosReadingInput> = {}): ThumosReadingInput {
  return {
    today: TODAY,
    consentAi: true,
    consentHealth: true,
    weights: [
      { day: '2026-10-13', kg: 74.8 },
      { day: '2026-10-20', kg: 74.6 },
      { day: '2026-10-27', kg: 74.2 },
    ],
    bodyFatPct: 15,
    leanMassKg: 63,
    strengthMinutes7: 75,
    workoutMinutes7: 97,
    goal: 'lose_fat_build_muscle',
    targetKg: null,
    vo2: 42,
    restingBpm: 62,
    build: 'muscular',
    ...overrides,
  };
}

function quiet(overrides: Partial<ThumosReadingInput> = {}): ThumosReadingInput {
  return sample({
    bodyFatPct: null,
    leanMassKg: null,
    strengthMinutes7: null,
    workoutMinutes7: null,
    goal: 'maintain',
    targetKg: null,
    vo2: null,
    restingBpm: 61,
    build: null,
    ...overrides,
  });
}

describe('Thumos reading guard', () => {
  it('accepts a short encouraging note that uses only the readings given', () => {
    const input = quiet();
    const note = 'Resting heart rate is 61 bpm. That is a useful picture to keep beside the scales.';
    expect(guardReadingComment(note, input)).toBeNull();
    expect(guardReadingComment(
      'Weight is 74.2 kg, down from 74.8 kg. BMI cannot tell muscle from fat. There is something here to work with.',
      sample(),
    )).toBeNull();
  });

  it('rejects a verdict, a diagnosis, a pushed target, and shaming', () => {
    const input = quiet();
    const tail = ' That is a useful picture to keep beside the scales.';
    expect(guardReadingComment(`The reading looks overweight.${tail}`, input)).toBe('banned');
    expect(guardReadingComment(`The reading looks obese.${tail}`, input)).toBe('banned');
    expect(guardReadingComment(`You are healthy.${tail}`, input)).toBe('banned');
    expect(guardReadingComment(`This note is a diagnosis.${tail}`, input)).toBe('banned');
    expect(guardReadingComment(`This is a medical treatment.${tail}`, input)).toBe('banned');
    expect(guardReadingComment(`Cut 500 kcal a day.${tail}`, input)).toBe('banned');
    expect(guardReadingComment(`Set a weight-loss target.${tail}`, input)).toBe('banned');
    expect(guardReadingComment(`You should lose weight.${tail}`, input)).toBe('banned');
    expect(guardReadingComment(`Do not be lazy about this.${tail}`, input)).toBe('banned');
  });

  it('rejects the wrong length, a flat tone, a missing figure, and a made-up number', () => {
    const input = quiet();
    expect(guardReadingComment('That is a useful picture to keep beside the scales.', input)).toBe('length');
    expect(guardReadingComment(
      'Weight is 74.2 kg. Resting heart rate is 61 bpm. Body fat is 15%. That is worth another look.',
      input,
    )).toBe('length');
    expect(guardReadingComment('Weight is 74.2 kg. Resting heart rate is 61 bpm.', input)).toBe('tone');
    expect(guardReadingComment('Body fat is in the note. That is a useful picture to keep beside the scales.', input)).toBe('missing');
    expect(guardReadingComment('Weight is 99 kg. That is a useful picture to keep beside the scales.', input)).toBe('number');
    expect(guardReadingComment('Not medical advice. That is a useful picture to keep beside the scales.', input)).toBe('safety');
  });

  it('requires the muscle line only when the person trains', () => {
    const trained = 'Weight is 74.2 kg. That is a useful picture to keep beside the scales.';
    expect(guardReadingComment(trained, sample())).toBe('bmi');
    expect(guardReadingComment(`${trained} ${THUMOS_BMI_LINE}`, quiet())).toBe('bmi');
    expect(trainsForReading(sample())).toBe(true);
    expect(trainsForReading(quiet())).toBe(false);
  });

  it('allows the saved aim even when that aim says Lose Weight', () => {
    const input = quiet({ goal: 'lose_weight', weights: [], restingBpm: null });
    const note = `The aim saved here is ${GOAL_LABEL.lose_weight}. That is a useful picture to keep beside the scales.`;
    expect(guardReadingComment(note, input)).toBeNull();
    expect(guardReadingComment('You should lose weight. That is a useful picture to keep beside the scales.', input)).toBe('banned');
  });

  it('keeps the guardrail prompt with the same bans', () => {
    expect(THUMOS_READING_PROMPT).toMatch(/two or three sentences/);
    expect(THUMOS_READING_PROMPT).toMatch(/encouraging/);
    expect(THUMOS_READING_PROMPT).toMatch(/only readings that are present/);
    expect(THUMOS_READING_PROMPT).toMatch(/Do not diagnose/);
    expect(THUMOS_READING_PROMPT).toMatch(/Overweight/);
    expect(THUMOS_READING_PROMPT).toMatch(/Obese/);
    expect(THUMOS_READING_PROMPT).toMatch(/Healthy/);
    expect(THUMOS_READING_PROMPT).toMatch(/calorie/);
    expect(THUMOS_READING_PROMPT).toMatch(/weight-loss/);
    expect(THUMOS_READING_PROMPT).toMatch(/medical claim/);
    expect(THUMOS_READING_PROMPT).toMatch(/shame/i);
    expect(THUMOS_READING_PROMPT).toContain(THUMOS_BMI_LINE);
    expect(THUMOS_READING_PROMPT).toMatch(/safety line/);
    expect(THUMOS_READING_PROMPT).not.toMatch(/\b999\b/);
  });
});

describe('on-phone Thumos reading note', () => {
  it('comments on the target instead of listing every figure', () => {
    const view = thumosReadingComment(sample({
      storedDayCount: 7,
      targetKg: 72,
      sleepHours: 8,
      stepsDaily: 9000,
      steps: 63000,
      stepsLow: false,
      proteinG: 140,
      proteinMet: true,
      workoutAim: 150,
      workoutMinutes7: 160,
      vo2Level: 'Steady',
      strengthRecorded: true,
    }));
    expect(view.sentences[0]).toBe(THUMOS_LOOKING_GOOD_TARGET);
    expect(view.sentences).toContain(THUMOS_BMI_LINE);
    expect(view.sentences.join(' ')).not.toContain('Weight is 74.2 kg');
    expect(view.sentences.join(' ')).not.toContain(VISIBLE_SAFETY_LINE);
    expect(view.sentences.join(' ')).not.toMatch(/\bkcal\b|lose weight/i);
    expect(view.more.join(' ')).toContain('74.2');
    const heavier = sample({
      weights: [{ day: '2026-10-01', kg: 70 }, { day: TODAY, kg: 80 }],
      storedDayCount: 7,
      targetKg: 65,
      sleepHours: 8,
      stepsDaily: 9000,
      stepsLow: false,
      proteinG: 140,
      proteinMet: true,
      workoutAim: 150,
      workoutMinutes7: 160,
      vo2Level: 'Steady',
      strengthRecorded: true,
    });
    const next = thumosReadingComment(heavier);
    expect(next.sentences[0]).toBe(THUMOS_NEEDS_WORK_TARGET);
    expect(next.sentences).toContain(THUMOS_WEIGHT_AWAY_CHANGE);
    expect(next.sentences.join(' ')).not.toContain('80 kg');
    const early = thumosReadingComment(sample({ storedDayCount: 3, targetKg: 72 }));
    expect(early.sentences[0]).toBe('Thumos needs at least 7 days of data.');
    expect(early.sentences.join(' ')).not.toContain('moving towards');
    expect(early.sentences.join(' ')).not.toContain('moving away');
    expect(early.sentences.join(' ')).not.toContain(THUMOS_LOOKING_GOOD_TARGET);
  });

  it('names a short list of changes and skips a verdict without a reference', () => {
    const mixed = thumosReadingComment(sample({
      storedDayCount: 7,
      targetKg: 72,
      restingBpm: 110,
      sleepHours: 5,
      stepsDaily: 3000,
      stepsLow: true,
      proteinMet: false,
      proteinG: 40,
      workoutAim: 150,
      vo2Level: 'Developing',
    }));
    expect(mixed.sentences[0]).toBe(THUMOS_NEEDS_WORK_TARGET);
    expect(mixed.sentences).toContain(THUMOS_RESTING_HIGH);
    expect(mixed.sentences).toContain(THUMOS_VO2_DEVELOPING);
    expect(mixed.sentences.filter((line) => line !== THUMOS_BMI_LINE).length).toBeLessThanOrEqual(4);
    expect(mixed.sentences.join(' ')).not.toContain('Steps are worth watching');
    const steady = thumosReadingComment(quiet({
      storedDayCount: 7,
      sleepHours: 8,
      stepsDaily: 8000,
      stepsLow: false,
      proteinG: 90,
      proteinMet: true,
      workoutMinutes7: 40,
      workoutAim: 30,
      strengthMinutes7: null,
      strengthRecorded: false,
      vo2: 42,
      vo2Level: null,
    }));
    expect(steady.sentences[0]).toBe(THUMOS_LOOKING_GOOD);
    expect(steady.sentences).toContain(THUMOS_STRENGTH_NOT_RECORDED);
    expect(steady.sentences.join(' ')).not.toContain('Logging them is the next focus');
    expect(steady.more).toContain('VO2 max is stored. Age and sex are not set, so this note skips a level.');
    const holding = thumosReadingComment(sample({
      weights: [{ day: '2026-10-01', kg: 74.2 }, { day: TODAY, kg: 74.3 }],
      storedDayCount: 7,
      targetKg: 72,
      sleepHours: 8,
      stepsDaily: 9000,
      stepsLow: false,
      proteinMet: true,
      proteinG: 140,
      workoutAim: 150,
      workoutMinutes7: 160,
      vo2Level: 'Steady',
    }));
    expect(holding.sentences[0]).toBe(THUMOS_MIXED_TARGET);
  });

  it('leaves out a figure that was not stored and still passes the guard', () => {
    const input = quiet();
    const view = thumosReadingComment(input);
    const note = [...view.sentences, ...view.more].join(' ');
    expect(view.sentences.join(' ')).not.toContain('Body fat');
    expect(view.sentences.join(' ')).not.toContain(THUMOS_BMI_LINE);
    expect(note).toContain('74.2');
    expect(note).toContain('61');
    const withFat = thumosReadingComment(sample());
    const withoutFat = thumosReadingComment(sample({ bodyFatPct: null }));
    expect(withoutFat.sentences.join(' ') + withoutFat.more.join(' ')).not.toContain('Body fat is');
    expect([...withFat.sentences, ...withFat.more].join(' ')).toContain('Body fat is 15%.');
  });

  it('uses the fixed lines when consent is off, nothing is stored, or the draft fails', () => {
    expect(thumosReadingComment(sample({ consentAi: false })).sentences).toEqual([THUMOS_OFF_LINE]);
    expect(thumosReadingComment(sample({ consentHealth: false })).sentences).toEqual([THUMOS_HEALTH_OFF_LINE]);
    expect(thumosReadingComment(sample({ consentAi: false, consentHealth: false })).sentences).toEqual([THUMOS_BOTH_OFF_LINE]);
    expect(thumosReadingComment(sample({
      weights: [],
      bodyFatPct: null,
      leanMassKg: null,
      strengthMinutes7: null,
      workoutMinutes7: null,
      goal: null,
      targetKg: null,
      vo2: null,
      restingBpm: null,
      build: null,
    })).sentences).toEqual([THUMOS_EMPTY_LINE]);
    expect(showReadingDraft('You are obese. Keep going anyway.', sample())).toEqual([THUMOS_FAILED_LINE]);
    expect(THUMOS_OFF_LINE).not.toContain('74.2');
    expect(THUMOS_FAILED_LINE).not.toContain('74.2');
    expect(thumosReadingComment(sample()).more).toContain(THUMOS_LOCAL_LINE);
  });

  it('sums the last seven days and does not call the coach', () => {
    const samples = [
      { kind: 'strength_minutes', value: 40, recordedOn: '2026-10-27' },
      { kind: 'strength_minutes', value: 35, recordedOn: '2026-10-25' },
      { kind: 'strength_minutes', value: 30, recordedOn: '2026-10-18' },
      { kind: 'vo2_max', value: 42, recordedOn: '2026-10-26' },
      { kind: 'vo2_max', value: 40, recordedOn: '2026-10-06' },
    ];
    expect(sumKindSince(samples, 'strength_minutes', TODAY)).toBe(75);
    expect(latestKind(samples, 'vo2_max', TODAY)).toBe(42);
    const ui = readFileSync('src/ui/ThumosReadingComment.tsx', 'utf8');
    const domain = readFileSync('src/domain/thumosReading.ts', 'utf8');
    expect(ui).not.toMatch(/thumos-chat|functions\/v1|xai|fetch\(|sendThumos/);
    expect(domain).not.toMatch(/thumos-chat|functions\/v1|xai|fetch\(|sendThumos/);
    expect(ui).toContain('{VISIBLE_SAFETY_LINE}');
    expect(ui).toContain('THUMOS_READING_LABEL');
    expect(ui).not.toContain('THUMOS_READING_PROMPT');
    expect(domain).not.toContain(VISIBLE_SAFETY_LINE);
    expect(readFileSync('src/app/(main)/weight-waist.tsx', 'utf8')).toContain('<ThumosReadingComment analyse />');
    const plan = readFileSync('src/app/(main)/health-plan.tsx', 'utf8');
    expect(plan).toContain('<ThumosReadingComment analyse />');
    expect(plan.match(/<ThumosReadingComment/g)).toEqual(['<ThumosReadingComment']);
    expect(plan.indexOf('<ThumosReadingComment analyse />')).toBeLessThan(plan.indexOf('<HealthRefreshBar'));
    expect(readFileSync('src/ui/ThumosReadingComment.tsx', 'utf8')).toContain('useHealthSources');
    expect(readFileSync('src/ui/ThumosReadingComment.tsx', 'utf8')).toContain('figuresForNote');
    expect(readFileSync('src/ui/ThumosReadingComment.tsx', 'utf8')).toContain('useStatPeriod');
    expect(readFileSync('src/ui/ThumosReadingComment.tsx', 'utf8')).not.toContain('proteinG * portion');
    expect(readFileSync('src/ui/ThumosReadingComment.tsx', 'utf8')).toContain('authorize: false');
    expect(THUMOS_ANALYSE_AGAIN).toBe('Have Thumos analyse your data again');
    expect(readFileSync('src/domain/scaleReading.ts', 'utf8')).toContain("export const SCALE_FROM_SCALES = 'From your smart scales';");
    expect(readFileSync('src/ui/YourFitness.tsx', 'utf8')).not.toContain('ThumosReadingComment');
    expect(APPLE_HEALTH_READ_TYPES).not.toContain('HKQuantityTypeIdentifierBodyMassIndex');
    expect(readFileSync('app.json', 'utf8')).not.toContain('metabolic age');
    expect(THUMOS_READING_LABEL).toBe('Thumos');
    expect(thumosReadingComment(sample()).sentences).not.toContain(THUMOS_FAILED_LINE);
    expect(thumosReadingComment(quiet()).sentences).not.toContain(THUMOS_FAILED_LINE);
  });

  it('names stored trends in more info and says when a stat is absent', () => {
    const detail = thumosDetailLines(sample({
      bodyFatEarlier: 18,
      leanEarlier: 60,
      waistCm: 84,
      heightCm: 178,
      cardioMinutes7: 15,
      sleepHours: 7.4,
      steps: 9100,
      proteinG: 80,
      caloriesStored: true,
      targetKg: 72,
    }));
    expect(detail).toContain('Body fat is down from the earlier reading.');
    expect(detail).toContain('Lean mass is up from the earlier reading.');
    expect(detail).toContain('Waist is 84 cm.');
    expect(detail.some((line) => line.startsWith('BMI is '))).toBe(true);
    expect(detail).toContain('Strength is 75 min and cardio is 15 min in the last 7 days.');
    expect(detail).toContain('Sleep for the last 7 days averages 7.4 hours.');
    expect(detail).toContain('Steps for the last 7 days are 9100.');
    expect(detail).toContain('Protein logged today is 80 g.');
    expect(detail).toContain('Calories are stored for today, and this note leaves them out.');
    expect(detail).toContain(THUMOS_NO_TIME_ESTIMATE);
    const absent = thumosDetailLines(quiet({ weights: [], restingBpm: null }));
    expect(absent).toContain(THUMOS_NO_SLEEP);
    expect(absent).toContain('No body fat reading is stored, so it is not in this note.');
    expect(absent.join(' ')).not.toMatch(/\bkcal\b/);
  });

  it('uses the same selectors as the other sections', () => {
    const today = '2026-10-27';
    const samples = [
      { kind: 'resting_heart_rate', value: 50, recordedOn: '2026-10-27T08:00:00Z', source: 'healthkit' },
      { kind: 'resting_heart_rate', value: 70, recordedOn: '2026-10-27T18:00:00Z', source: 'healthkit' },
      { kind: 'resting_heart_rate', value: 80, recordedOn: '2026-10-26', source: 'healthkit' },
      { kind: 'sleep_hours', value: 6, recordedOn: '2026-10-27', source: 'healthkit' },
      { kind: 'sleep_hours', value: 8, recordedOn: '2026-10-26', source: 'healthkit' },
      { kind: 'steps', value: 4000, recordedOn: '2026-10-27', source: 'healthkit' },
      { kind: 'steps', value: 9000, recordedOn: '2026-10-27T20:00:00Z', source: 'healthkit' },
      { kind: 'steps', value: 8000, recordedOn: '2026-10-26', source: 'healthkit' },
      { kind: 'workout_minutes', value: 30, recordedOn: '2026-10-27', source: 'healthkit' },
      { kind: 'vo2_max', value: 42, recordedOn: '2026-10-20', source: 'healthkit' },
      { kind: 'weight_kg', value: 74.2, recordedOn: '2026-10-27', source: 'healthkit' },
    ];
    const figures = figuresForNote({
      samples,
      today,
      period: '7',
      goalAge: 45,
      goalSex: 'male',
      logs: [{
        id: 'meal-1',
        userId: 'alex',
        eatenOn: today,
        eatenAt: null,
        meal: 'lunch',
        source: 'manual',
        note: '',
        items: [{ name: 'Chicken', kcal: 200, proteinG: 30, carbsG: 0, sugarG: 0, fibreG: 0, unsaturatedG: 0, saturatedG: 0, transG: 0, sodiumMg: 0, processed: false }],
        estimated: false,
        portion: 2,
        createdAt: today,
        previewUrl: null,
      }],
      ownerId: 'alex',
      proteinTarget: 40,
    });
    expect(figures.restingBpm).toBe(Math.round((50 + 80) / 2));
    expect(figures.sleepHours).toBe(7);
    expect(figures.steps).toBe(12000);
    expect(figures.stepsDaily).toBe(6000);
    expect(figures.stepsLow).toBe(true);
    expect(figures.workoutMinutes7).toBe(30);
    expect(figures.workoutAim).toBe(150);
    expect(figures.strengthRecorded).toBe(false);
    expect(figures.proteinG).toBe(30);
    expect(figures.proteinMet).toBe(false);
    expect(figures.vo2).toBe(42);
    expect(figures.vo2Level).toBe('Steady');
    expect(figures.windowLabel).toBe('the last 7 days');
    const note = thumosReadingComment(sample({
      ...figures,
      storedDayCount: 7,
      targetKg: null,
      sleepHours: figures.sleepHours,
    }));
    expect(note.sentences).toContain(THUMOS_STRENGTH_NOT_RECORDED);
    expect(note.sentences).toContain(THUMOS_PROTEIN_SHORT);
    expect(note.sentences[0]).toBe(THUMOS_MIXED);
    expect(note.sentences).not.toContain(THUMOS_VO2_DEVELOPING);
  });
});
