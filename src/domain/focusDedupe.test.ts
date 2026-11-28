import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { dedupeAdviceLines, dedupeFocusItems, finishAdviceText } from '@/domain/adviceDedupe';
import {
  applyFitnessFocus,
  draftHealthPlan,
  guardHealthPlan,
  healthPlanFromStored,
  parseSharedHealthPlan,
  type HealthPlan,
  type PlanInput,
} from '@/domain/healthPlan';
import { VO2_FOCUS_LINE, VO2_ZONE2_TIP, ZONE2_BESIDE_WORK } from '@/domain/trainingGuidance';

const SHORT_VO2 = VO2_FOCUS_LINE.slice(0, VO2_FOCUS_LINE.indexOf('.') + 1);
const CUT_VO2 = VO2_FOCUS_LINE.slice(0, 160);
const SLEEP_PROTEIN = 'Keep sleep and protein with the sessions you already do.';
const FITNESS_GOAL = 'Fitness goal: Elite Athlete.';

function input(partial: Partial<PlanInput> = {}): PlanInput {
  return {
    now: new Date('2026-10-15T09:00:00.000Z'),
    salt: 'focus-dedupe',
    displayName: 'Alex Hart',
    stage: 'exploring',
    sobrietyStartedAt: null,
    heightCm: 178,
    visionStatement: '',
    visionCaptions: [],
    interestLabels: [],
    reasons: [],
    limits: '',
    goal: 'maintain',
    goalSex: 'male',
    goalAge: 34,
    build: null,
    kcalTarget: 2200,
    proteinTarget: 140,
    hideCalories: false,
    foodLogs: [],
    checkIns: [],
    health: [{ kind: 'weight_kg', value: 80, recordedOn: '2026-10-14' }],
    bodyFatPct: null,
    leanMassKg: null,
    waistCm: null,
    doneTexts: [],
    ...partial,
  };
}

function planWith(focus: HealthPlan['focus']): HealthPlan {
  return {
    focus,
    nutrition: { targets: 'Keep meals steady.', habits: [], swaps: [] },
    fitness: { intro: 'Keep the week you already do.', sessions: [] },
    wellbeing: { habits: [] },
    limits: '',
    disclaimer: '',
    updatedAt: '2026-11-23T12:00:00.000Z',
  };
}

describe('weekly focus dedupe', () => {
  it('collapses a shorter line and a mid-word cut of the same advice into the full sentence', () => {
    expect(CUT_VO2.endsWith('hard enoug')).toBe(true);
    const merged = dedupeFocusItems([
      { id: 'goal', text: FITNESS_GOAL, done: true },
      { id: 'short', text: SHORT_VO2, done: true },
      { id: 'zone', text: ZONE2_BESIDE_WORK, done: true },
      { id: 'cut', text: CUT_VO2, done: false },
      { id: 'sleep', text: SLEEP_PROTEIN, done: false },
    ]);
    expect(merged.map((item) => item.text)).toEqual([
      FITNESS_GOAL,
      VO2_FOCUS_LINE,
      ZONE2_BESIDE_WORK,
      SLEEP_PROTEIN,
    ]);
    expect(merged.find((item) => item.text === VO2_FOCUS_LINE)?.done).toBe(true);
    expect(merged.find((item) => item.text === VO2_FOCUS_LINE)?.id).toBe('short');
    expect(merged.some((item) => item.text.endsWith('hard enoug'))).toBe(false);
    expect(merged.every((item) => /[.!?]$/.test(item.text))).toBe(true);
  });

  it('keeps the tick when only the cut copy was ticked, and keeps a slightly different wording as one row', () => {
    const paraphrase = 'Add one or two interval sessions a week for VO2 max: 4x4 min at about 85-95% max heart rate, with 3 min easy between.';
    const merged = dedupeFocusItems([
      { id: 'a', text: paraphrase, done: false },
      { id: 'b', text: CUT_VO2, done: true },
    ]);
    expect(merged).toEqual([{ id: 'a', text: VO2_FOCUS_LINE, done: true }]);
    const zone = dedupeFocusItems([
      { id: 'z', text: ZONE2_BESIDE_WORK, done: false },
      { id: 'tip', text: VO2_ZONE2_TIP, done: true },
    ]);
    expect(zone).toHaveLength(1);
    expect(zone[0]?.text).toBe(VO2_ZONE2_TIP);
    expect(zone[0]?.done).toBe(true);
  });

  it('does not cut a focus sentence mid-word when it is saved or read back', () => {
    const added = applyFitnessFocus(null, VO2_FOCUS_LINE, '2026-11-23T12:00:00.000Z');
    expect(added.focus.map((item) => item.text)).toEqual([VO2_FOCUS_LINE]);
    const huge = `${VO2_FOCUS_LINE} ${'Extra words '.repeat(30)}`;
    const trimmed = applyFitnessFocus(null, huge, '2026-11-23T12:00:00.000Z');
    expect(trimmed.focus[0]?.text).toBe(VO2_FOCUS_LINE);
    expect(trimmed.focus[0]?.text.endsWith('.')).toBe(true);
    const unfinished = 'Walk 30 minutes on Monday. Then add a sho';
    expect(finishAdviceText(unfinished, 'sentence')).toBe('Walk 30 minutes on Monday.');
    expect(finishAdviceText('Walk 30 minutes on Monday.', 'sentence')).toBe('Walk 30 minutes on Monday.');

    expect(dedupeFocusItems([{ id: 'cut', text: CUT_VO2, done: false }])).toEqual([
      { id: 'cut', text: VO2_FOCUS_LINE, done: false },
    ]);
    const stored = healthPlanFromStored({
      ...planWith([
        { id: 'short', text: SHORT_VO2, done: false },
        { id: 'cut', text: CUT_VO2, done: true },
      ]),
      updatedAt: '2026-11-23T12:00:00.000Z',
    });
    expect(stored?.focus).toEqual([{ id: 'short', text: VO2_FOCUS_LINE, done: true }]);

    const shared = parseSharedHealthPlan({
      headline: 'Health plan',
      focus: [
        { text: SHORT_VO2, done: true },
        { text: CUT_VO2, done: false },
      ],
    });
    expect(shared?.focus).toEqual([{ text: VO2_FOCUS_LINE, done: true }]);
    expect(shared?.ticked).toBe(1);
    expect(shared?.total).toBe(1);
  });

  it('merges a repeated line already stored on the plan instead of appending a cut copy', () => {
    const plan = planWith([
      { id: 'short', text: SHORT_VO2, done: true },
      { id: 'cut', text: CUT_VO2, done: false },
      { id: 'lunch', text: 'Keep lunch at the same time.', done: false },
    ]);
    const next = applyFitnessFocus(plan, VO2_FOCUS_LINE, '2026-11-23T12:00:00.000Z');
    const vo2 = next.focus.filter((item) => /vo2/i.test(item.text));
    expect(vo2).toHaveLength(1);
    expect(vo2[0]?.text).toBe(VO2_FOCUS_LINE);
    expect(vo2[0]?.done).toBe(false);
    expect(vo2[0]?.text.endsWith('hard enoug')).toBe(false);
    expect(next.focus.some((item) => item.text === 'Keep lunch at the same time.')).toBe(true);
    expect(next.focus.some((item) => item.text.endsWith('hard enoug'))).toBe(false);

    const base = draftHealthPlan(input());
    const guarded = guardHealthPlan({
      ...base,
      focus: [
        { id: 'short', text: SHORT_VO2, done: true },
        { id: 'cut', text: CUT_VO2, done: false },
        { id: 'lunch', text: 'Keep lunch at the same time.', done: false },
      ],
    }, input());
    const guardedVo2 = guarded.focus.filter((item) => /interval/i.test(item.text) && /vo2/i.test(item.text));
    expect(guardedVo2).toHaveLength(1);
    expect(guardedVo2[0]?.text).toBe(VO2_FOCUS_LINE);
    expect(guardedVo2[0]?.done).toBe(true);
    expect(guarded.focus.some((item) => item.text.endsWith('hard enoug'))).toBe(false);
  });

  it('leaves distinct actions side by side and dedupes on the plan screen', () => {
    const merged = dedupeFocusItems([
      { id: '1', text: 'Walk 30 minutes on Monday.', done: false },
      { id: '2', text: 'Keep lunch at the same time.', done: true },
    ]);
    expect(merged).toHaveLength(2);
    expect(dedupeAdviceLines([SHORT_VO2, `${VO2_FOCUS_LINE} Stay with that effort.`])).toEqual([
      `${VO2_FOCUS_LINE} Stay with that effort.`,
    ]);
    const page = readFileSync('src/app/(main)/health-plan.tsx', 'utf8');
    expect(page).toContain('dedupeFocusItems(plan.focus)');
    expect(page).toContain('dedupeFocusItems(current.focus)');
    expect(readFileSync('src/app/(main)/workouts.tsx', 'utf8')).not.toContain('matchingFocus');
    expect(readFileSync('src/app/(main)/home.tsx', 'utf8')).not.toContain('plan.focus.map');
  });
});
