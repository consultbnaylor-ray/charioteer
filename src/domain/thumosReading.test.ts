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
  THUMOS_READING_LABEL,
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
  it('shows a guarded note and changes it when the weight reading changes', () => {
    const view = thumosReadingComment(sample());
    expect(view.sentences.length).toBeGreaterThanOrEqual(2);
    expect(view.sentences.length).toBeLessThanOrEqual(3);
    expect(guardReadingComment(view.sentences.join(' '), sample())).toBeNull();
    expect(view.sentences).toContain(THUMOS_BMI_LINE);
    expect(view.sentences.join(' ')).toContain('74.2');
    expect(view.sentences.join(' ')).not.toContain(VISIBLE_SAFETY_LINE);
    const heavier = sample({ weights: [{ day: TODAY, kg: 80 }] });
    const next = thumosReadingComment(heavier);
    expect(next.sentences.join(' ')).toContain('80');
    expect(next.sentences.join(' ')).not.toBe(view.sentences.join(' '));
    expect(guardReadingComment(next.sentences.join(' '), heavier)).toBeNull();
  });

  it('leaves out a figure that was not stored and still passes the guard', () => {
    const input = quiet();
    const view = thumosReadingComment(input);
    expect(guardReadingComment(view.sentences.join(' '), input)).toBeNull();
    const note = [...view.sentences, ...view.more].join(' ');
    expect(view.sentences.join(' ')).not.toContain('Body fat');
    expect(view.sentences.join(' ')).not.toContain(THUMOS_BMI_LINE);
    expect(note).toContain('74.2');
    expect(note).toContain('61');
    const withFat = thumosReadingComment(sample());
    const withoutFat = thumosReadingComment(sample({ bodyFatPct: null }));
    expect(withoutFat.sentences.join(' ') + withoutFat.more.join(' ')).not.toContain('Body fat is');
    expect(withFat.more.join(' ')).toContain('Body fat is 15%.');
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
    expect(readFileSync('src/app/(main)/weight-waist.tsx', 'utf8')).toContain('<ThumosReadingComment />');
    expect(readFileSync('src/app/(main)/health-plan.tsx', 'utf8')).toContain('<ThumosReadingComment />');
    expect(readFileSync('src/ui/YourFitness.tsx', 'utf8')).not.toContain('ThumosReadingComment');
    expect(APPLE_HEALTH_READ_TYPES).not.toContain('HKQuantityTypeIdentifierBodyMassIndex');
    expect(readFileSync('app.json', 'utf8')).not.toContain('metabolic age');
    expect(THUMOS_READING_LABEL).toBe('Thumos');
  });
});
