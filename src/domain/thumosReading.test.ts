import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { APPLE_HEALTH_READ_TYPES } from '@/health/connection';
import { GOAL_LABEL } from '@/domain/nutrition';
import { SCALE_BIA_LINE } from '@/domain/scaleReading';
import { VISIBLE_SAFETY_LINE } from '@/domain/visibleSafety';
import {
  THUMOS_BMI_AND_FAT,
  THUMOS_BMI_LINE,
  THUMOS_BMI_MUSCLE,
  THUMOS_BODY_FAT_HIGH,
  THUMOS_BOTH_OFF_LINE,
  THUMOS_EMPTY_LINE,
  THUMOS_FAILED_LINE,
  THUMOS_HEALTH_OFF_LINE,
  THUMOS_LOCAL_LINE,
  THUMOS_OFF_LINE,
  THUMOS_ANALYSE_AGAIN,
  THUMOS_NO_SLEEP,
  THUMOS_NO_TIME_ESTIMATE,
  THUMOS_READING_LABEL,
  thumosDetailLines,
  THUMOS_READING_PROMPT,
  guardReadingComment,
  latestKind,
  showReadingDraft,
  sumKindSince,
  figuresForNote,
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
  it('shows a guarded note and changes it when the weight reading changes', () => {
    const view = thumosReadingComment(sample({ storedDayCount: 7, targetKg: 72, sleepHours: 8, stepsDaily: 9000, stepsLow: false, proteinMet: true, proteinG: 140, vo2Level: 'Steady', workoutAim: 80 }));
    expect(view.sentences[0]).toContain('heading in the right direction');
    expect(view.sentences).toContain(THUMOS_BMI_LINE);
    expect(view.sentences.join(' ')).not.toContain('Weight is 74.2 kg');
    expect(view.sentences.join(' ')).not.toContain(VISIBLE_SAFETY_LINE);
    expect(view.sentences.join(' ')).not.toMatch(/\bkcal\b|lose weight|weight-loss/i);
    expect(view.more.join(' ')).toContain('74.2');
    const heavier = sample({
      weights: [{ day: '2026-10-01', kg: 70 }, { day: TODAY, kg: 80 }],
      storedDayCount: 7,
      targetKg: 65,
    });
    const next = thumosReadingComment(heavier);
    expect(next.sentences[0]).toContain('not yet clear');
    expect(next.more.join(' ')).toContain('80');
    const early = thumosReadingComment(sample({ storedDayCount: 3, targetKg: 72 }));
    expect(early.sentences[0]).toBe('Thumos needs at least 7 days of data.');
    expect(early.sentences.join(' ')).not.toContain('moving towards');
    expect(early.sentences.join(' ')).not.toContain('moving away');
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

  it('uses Your Fitness minutes and the VO2 chart, not the cardio mix or a stale Apple sample', () => {
    const today = '2026-10-27';
    const figures = figuresForNote({
      samples: [
        { kind: 'vo2_max', value: 41.4, recordedOn: `${today}T09:00:00Z` },
        { kind: 'cardio_minutes', value: 5, recordedOn: today },
        { kind: 'workout_minutes', value: 40, recordedOn: today },
        { kind: 'resting_heart_rate', value: 59, recordedOn: `${today}T08:00:00Z` },
        { kind: 'resting_heart_rate', value: 64, recordedOn: '2026-10-26' },
      ],
      today,
      period: '7',
      goalAge: 45,
      goalSex: 'male',
      userMetrics: [{ calendarDate: today, vo2Max: 45 }],
    });
    expect(figures.vo2).toBe(45);
    expect(figures.workoutMinutes7).toBe(40);
    expect(figures.cardioMinutes7).toBeNull();
    expect(figures.strengthRecorded).toBe(false);
    expect(figures.restingBpm).not.toBe(59);
    const note = thumosReadingComment(sample({
      ...figures,
      storedDayCount: 7,
      goal: 'elite_cruiser_boxer',
      goalAge: 45,
      goalSex: 'male',
      targetKg: null,
    }));
    expect(note.sentences.join(' ')).toContain('Strength is not recorded');
    expect(note.sentences.join(' ')).not.toContain('5 min');
    expect(note.sentences.join(' ')).not.toContain('41.4');
    expect(note.sentences.join(' ')).toContain('This is below the approximate athletic range for boxing, about 56 to 62 ml/kg/min.');
    expect(note.sentences.join(' ')).not.toContain('VO2 max is Strong');
    expect(note.sentences.join(' ')).not.toContain('What looks good: VO2 max is Strong');
  });

  it('treats verified strength and a modest body-fat reading as muscle, and says when body fat is high', () => {
    const muscle = thumosReadingComment(sample({
      storedDayCount: 7,
      build: 'muscular',
      goalSex: 'male',
      heightCm: 178,
      weights: [{ day: '2026-10-20', kg: 92 }, { day: TODAY, kg: 92 }],
      bodyFatPct: 18,
      strengthMinutes7: 80,
      strengthRecorded: true,
      targetKg: null,
    }));
    expect(muscle.sentences).toContain(THUMOS_BMI_MUSCLE);
    expect(muscle.sentences).not.toContain(THUMOS_BMI_AND_FAT);
    expect(muscle.sentences).toContain(SCALE_BIA_LINE);
    const fat = thumosReadingComment(sample({
      storedDayCount: 7,
      build: 'muscular',
      goalSex: 'male',
      heightCm: 178,
      weights: [{ day: '2026-10-20', kg: 92 }, { day: TODAY, kg: 92 }],
      bodyFatPct: 30,
      strengthMinutes7: 80,
      strengthRecorded: true,
      targetKg: null,
    }));
    expect(fat.sentences).toContain(THUMOS_BMI_AND_FAT);
    expect(fat.sentences).not.toContain(THUMOS_BMI_MUSCLE);
    expect(fat.sentences.join(' ')).not.toContain('largely due to muscle');
    const unverified = thumosReadingComment(sample({
      storedDayCount: 7,
      build: 'muscular',
      goalSex: 'male',
      heightCm: 178,
      weights: [{ day: TODAY, kg: 92 }],
      bodyFatPct: 18,
      strengthMinutes7: null,
      strengthRecorded: false,
      workoutMinutes7: null,
      targetKg: null,
    }));
    expect(unverified.sentences).not.toContain(THUMOS_BMI_MUSCLE);
    expect(unverified.sentences).not.toContain(THUMOS_BODY_FAT_HIGH);
    expect(unverified.sentences.join(' ')).toContain(SCALE_BIA_LINE);
    expect(unverified.sentences.join(' ')).toContain('Do not skip drinks to chase a lower reading.');
  });

  it('counts Garmin strength in the Today window the same way as Your Fitness', () => {
    const today = '2026-10-21';
    const figures = figuresForNote({
      samples: [
        { kind: 'workout_type_50', value: 40, recordedOn: today, source: 'healthkit' },
        { kind: 'strength_minutes', value: 40, recordedOn: today, source: 'healthkit' },
        { kind: 'workout_minutes', value: 40, recordedOn: today, source: 'healthkit' },
      ],
      today,
      period: 'day',
      goalAge: 42,
      goalSex: 'male',
      goal: 'elite_cruiser_boxer',
    });
    expect(figures.strengthRecorded).toBe(true);
    expect(figures.strengthMinutes7).toBe(40);
    expect(figures.windowLabel).toBe('today');
  });
});
