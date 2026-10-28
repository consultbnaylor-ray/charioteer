import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { APPLE_HEALTH_READ_TYPES } from '@/health/connection';
import { GOAL_LABEL } from '@/domain/nutrition';
import { buildSystemPrompt, OFFLINE_COACH_MESSAGE, resolveThumosMode, SCRIPTED_COACH_REPLY } from '@/domain/thumos';
import { VISIBLE_SAFETY_LINE } from '@/domain/visibleSafety';
import {
  THUMOS_BMI_LINE,
  THUMOS_BOTH_OFF_LINE,
  THUMOS_EMPTY_LINE,
  THUMOS_FAILED_LINE,
  THUMOS_HEALTH_OFF_LINE,
  THUMOS_LOCAL_LINE,
  THUMOS_NOTE_ASK,
  THUMOS_OFF_LINE,
  THUMOS_ANALYSE_AGAIN,
  THUMOS_NO_SLEEP,
  THUMOS_NO_TIME_ESTIMATE,
  THUMOS_READING_LABEL,
  thumosDetailLines,
  THUMOS_READING_PROMPT,
  guardReadingComment,
  latestKind,
  shouldRequestThumosNote,
  showReadingDraft,
  sumKindSince,
  thumosReadingComment,
  trainsForReading,
  visibleCoachNote,
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
    const view = thumosReadingComment(sample({ storedDayCount: 7, targetKg: 72 }));
    expect(view.sentences.length).toBeGreaterThan(3);
    expect(view.sentences).toContain(THUMOS_BMI_LINE);
    expect(view.sentences).toContain('Weight is moving towards the target you chose.');
    expect(view.sentences.some((line) => line.startsWith('Weight is 74.2 kg'))).toBe(true);
    expect(view.sentences.join(' ')).not.toContain(VISIBLE_SAFETY_LINE);
    expect(view.sentences.join(' ')).not.toMatch(/\bkcal\b|lose weight|weight-loss/i);
    const heavier = sample({
      weights: [{ day: '2026-10-01', kg: 70 }, { day: TODAY, kg: 80 }],
      storedDayCount: 7,
      targetKg: 65,
    });
    const next = thumosReadingComment(heavier);
    expect(next.sentences.join(' ')).toContain('80');
    expect(next.sentences).toContain('Weight is moving away from the target you chose.');
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

  it('sums the last seven days and asks the coach only through the existing chat call', () => {
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
    const client = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    expect(ui).toContain("sendThumos(THUMOS_NOTE_ASK, 'note'");
    expect(ui).toContain("snap.mode === 'supabase'");
    expect(ui).toContain('shouldRequestThumosNote');
    expect(ui).not.toMatch(/thumos-chat|functions\/v1|xai|fetch\(/);
    expect(ui).not.toMatch(/sendThumos\([\s\S]{0,120}(weight|samples|bodyFat|bpm|kg)/);
    expect(domain).not.toMatch(/thumos-chat|functions\/v1|xai|fetch\(|sendThumos/);
    expect(client).toContain('const thumosBody = { content: text, mode: effectiveMode, request_id: requestId }');
    expect(chat).toContain("select('kind, value, unit, recorded_on')");
    expect(chat).toContain("mode !== 'note' && thumosReplyFaults(modelText, earlierAssistant)");
    expect(chat).not.toMatch(/console\.(log|info|debug)\(/);
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
    expect(detail).toContain('The latest stored sleep is 7.4 hours.');
    expect(detail).toContain('The latest stored steps are 9100.');
    expect(detail).toContain('Protein logged today is 80 g.');
    expect(detail).toContain('Calories are stored for today, and this note leaves them out.');
    expect(detail).toContain(THUMOS_NO_TIME_ESTIMATE);
    const absent = thumosDetailLines(quiet({ weights: [], restingBpm: null }));
    expect(absent).toContain(THUMOS_NO_SLEEP);
    expect(absent).toContain('No body fat reading is stored, so it is not in this note.');
    expect(absent.join(' ')).not.toMatch(/\bkcal\b/);
  });

  it('asks the coach only when both switches are on and seven days are stored', () => {
    expect(shouldRequestThumosNote({ consentAi: true, consentHealth: true, storedDayCount: 7 })).toBe(true);
    expect(shouldRequestThumosNote({ consentAi: true, consentHealth: true, storedDayCount: 6 })).toBe(false);
    expect(shouldRequestThumosNote({ consentAi: false, consentHealth: true, storedDayCount: 8 })).toBe(false);
    expect(shouldRequestThumosNote({ consentAi: true, consentHealth: false, storedDayCount: 8 })).toBe(false);
    expect(THUMOS_NOTE_ASK).not.toMatch(/\d/);
    expect(THUMOS_NOTE_ASK).not.toMatch(/kg|bpm|kcal|%/);
    expect(visibleCoachNote('Weight is moving towards the target you chose.')).toContain('towards');
    expect(visibleCoachNote('')).toBeNull();
    expect(visibleCoachNote(SCRIPTED_COACH_REPLY)).toBeNull();
    expect(visibleCoachNote(OFFLINE_COACH_MESSAGE)).toBeNull();
    expect(visibleCoachNote(`This is not the AI. ${SCRIPTED_COACH_REPLY}`)).toBeNull();
    const safety = { selfHarm: false, withdrawal: false };
    expect(resolveThumosMode({ requested: 'note', userText: THUMOS_NOTE_ASK, safety })).toBe('note');
    expect(resolveThumosMode({
      requested: 'note',
      userText: THUMOS_NOTE_ASK,
      safety: { selfHarm: true, withdrawal: false },
    })).toBe('support');
    expect(resolveThumosMode({
      requested: 'note',
      userText: 'The urge is loud tonight. I keep thinking about the off-licence.',
      safety,
    })).toBe('support');
    const prompt = buildSystemPrompt('CONTEXT', 'note', undefined, { healthAlreadySaid: true });
    expect(prompt).toContain('encouraging assessment');
    expect(prompt).toContain('up to three focuses');
    expect(prompt).toContain('Never invent a number');
    expect(prompt).toContain('say what is missing');
    expect(prompt).toContain('Do not diagnose');
    expect(prompt).toContain('Do not say Overweight, Obese, or Healthy.');
    expect(prompt).toContain('calorie target');
    expect(prompt).toContain('weight-loss target');
    expect(prompt).toContain('Do not estimate how long it will take to reach a target.');
    expect(prompt).toContain('not medical advice');
    expect(prompt).toContain('116 123');
    expect(prompt).toContain('NHS 111');
    expect(prompt).toContain('999');
    expect(prompt).not.toContain('do not put each point on its own line');
    expect(prompt).not.toContain('already mentioned in this conversation');
    expect(prompt).not.toContain('tie one remark back to that goal');
    expect(THUMOS_LOCAL_LINE).toBe('When Thumos and health data are on, and at least 7 days are stored, the coach writes this note from health data already loaded for Thumos. Otherwise this note stays on this phone. It is not a diagnosis, and it does not set a calorie target or a weight-loss target.');
    expect(THUMOS_OFF_LINE).toContain('It is not sent to the coach.');
    expect(THUMOS_BOTH_OFF_LINE).toContain('This note is not sent to the coach.');
    expect(readFileSync('src/ui/ThumosReadingComment.tsx', 'utf8')).toContain('.catch(');
  });
});
