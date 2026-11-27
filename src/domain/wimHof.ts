import type { MeasureRing } from '@/domain/measureFigures';

/**
 * Wim Hof style breathing, as pure timing.
 * Each round: a short get-ready, 30 deep breaths (in through the nose, out through the mouth),
 * one big breath in, a 15 second hold, then a long breath out.
 * The screen keeps one session clock and asks this module where that clock sits.
 */

export const WIM_HOF_BREATHS = 30;
export const WIM_HOF_HOLD_SECONDS = 15;
export const WIM_HOF_ROUND_CHOICES = [3, 4] as const;
export type WimHofRounds = (typeof WIM_HOF_ROUND_CHOICES)[number];
export const WIM_HOF_DEFAULT_ROUNDS: WimHofRounds = 3;

export const WIM_HOF_READY_MS = 4_000;
export const WIM_HOF_IN_MS = 2_000;
export const WIM_HOF_OUT_MS = 1_500;
export const WIM_HOF_BIG_IN_MS = 3_000;
export const WIM_HOF_LET_GO_MS = 4_000;

export const WIM_HOF_TITLE = 'Wim Hof style';
export const WIM_HOF_SUMMARY = `${WIM_HOF_BREATHS} deep breaths, then one big breath held for ${WIM_HOF_HOLD_SECONDS} seconds. That is one round.`;
export const WIM_HOF_SAFETY_LINE =
  'Sit or lie down first. Never do this in water, while driving, or standing up. Stop and breathe normally if you feel dizzy or faint. If you are pregnant, or have a heart condition or epilepsy, check with your doctor before you try it.';
export const WIM_HOF_DONE_LINE = 'All rounds done. Breathe normally for a minute before you stand up.';

/** Circle sizes, matching the other breathing exercises: 0.68 small, 1 full. */
const REST = 0.72;
const FULL = 1;

export type WimHofStepKind = 'ready' | 'in' | 'out' | 'bigIn' | 'hold' | 'letGo';

export type WimHofStep = {
  kind: WimHofStepKind;
  cue: 'in' | 'out' | 'hold' | 'ready';
  label: string;
  /** Short how-to under the label, such as "Through the nose". */
  hint: string;
  round: number;
  /** 1 to 30 during the deep breaths, otherwise null. */
  breath: number | null;
  ms: number;
  fromScale: number;
  toScale: number;
  /** Where this step starts on the session clock. */
  startMs: number;
};

export function isWimHofRounds(value: unknown): value is WimHofRounds {
  return value === 3 || value === 4;
}

export function buildWimHofPlan(rounds: WimHofRounds = WIM_HOF_DEFAULT_ROUNDS): WimHofStep[] {
  const count = isWimHofRounds(rounds) ? rounds : WIM_HOF_DEFAULT_ROUNDS;
  const steps: WimHofStep[] = [];
  let at = 0;
  const push = (step: Omit<WimHofStep, 'startMs'>) => {
    steps.push({ ...step, startMs: at });
    at += step.ms;
  };
  for (let round = 1; round <= count; round += 1) {
    push({ kind: 'ready', cue: 'ready', label: 'Get ready', hint: `Round ${round} of ${count}`, round, breath: null, ms: WIM_HOF_READY_MS, fromScale: REST, toScale: REST });
    for (let breath = 1; breath <= WIM_HOF_BREATHS; breath += 1) {
      push({ kind: 'in', cue: 'in', label: 'Breathe in', hint: 'Deep, through the nose', round, breath, ms: WIM_HOF_IN_MS, fromScale: REST, toScale: FULL });
      push({ kind: 'out', cue: 'out', label: 'Breathe out', hint: 'Let it go through the mouth', round, breath, ms: WIM_HOF_OUT_MS, fromScale: FULL, toScale: REST });
    }
    push({ kind: 'bigIn', cue: 'in', label: 'Big breath in', hint: 'Fill right up', round, breath: null, ms: WIM_HOF_BIG_IN_MS, fromScale: REST, toScale: FULL });
    push({ kind: 'hold', cue: 'hold', label: 'Hold', hint: 'Stay relaxed', round, breath: null, ms: WIM_HOF_HOLD_SECONDS * 1000, fromScale: FULL, toScale: FULL });
    push({ kind: 'letGo', cue: 'out', label: 'Breathe out', hint: 'Slowly, all the way', round, breath: null, ms: WIM_HOF_LET_GO_MS, fromScale: FULL, toScale: REST });
  }
  return steps;
}

export function wimHofTotalMs(plan: WimHofStep[]): number {
  const last = plan[plan.length - 1];
  return last ? last.startMs + last.ms : 0;
}

export type WimHofPosition = {
  index: number;
  step: WimHofStep;
  /** Time spent in this step. */
  stepElapsedMs: number;
  stepRemainingMs: number;
  /** 0 to 1 through this step. */
  stepProgress: number;
  done: boolean;
};

/** Where the session clock sits. Past the end returns the last step, marked done. */
export function wimHofAt(plan: WimHofStep[], elapsedMs: number): WimHofPosition {
  if (plan.length === 0) throw new Error('Empty Wim Hof plan');
  const at = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const total = wimHofTotalMs(plan);
  if (at >= total) {
    const index = plan.length - 1;
    return { index, step: plan[index], stepElapsedMs: plan[index].ms, stepRemainingMs: 0, stepProgress: 1, done: true };
  }
  let lo = 0;
  let hi = plan.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (plan[mid].startMs <= at) lo = mid;
    else hi = mid - 1;
  }
  const step = plan[lo];
  const stepElapsedMs = at - step.startMs;
  return {
    index: lo,
    step,
    stepElapsedMs,
    stepRemainingMs: step.ms - stepElapsedMs,
    stepProgress: step.ms <= 0 ? 1 : stepElapsedMs / step.ms,
    done: false,
  };
}

/** Circle size for a position, easing from the step's start size to its end size. */
export function wimHofScale(position: WimHofPosition): number {
  const { fromScale, toScale } = position.step;
  const t = Math.min(1, Math.max(0, position.stepProgress));
  const eased = 0.5 - Math.cos(Math.PI * t) / 2;
  return fromScale + (toScale - fromScale) * eased;
}

/** Whole seconds still showing, including the second underway. */
export function wimHofSecondsLeft(position: WimHofPosition): number {
  return Math.max(0, Math.ceil(position.stepRemainingMs / 1000));
}

/**
 * The ring under the label: the breath count during the deep breaths, otherwise the seconds left in the step.
 * The circle carries the cue words, so the ring does not repeat them.
 */
export function wimHofFigure(position: WimHofPosition, rounds: number): MeasureRing {
  const { step } = position;
  const roundText = `Round ${step.round} of ${rounds}`;
  if (step.breath != null) {
    return {
      centre: String(step.breath),
      unit: `of ${WIM_HOF_BREATHS}`,
      fill: Math.min(1, Math.max(0, (step.breath - 1 + (step.kind === 'out' ? 0.5 + position.stepProgress / 2 : position.stepProgress / 2)) / WIM_HOF_BREATHS)),
      status: roundText,
      tone: 'info',
    };
  }
  return {
    centre: String(wimHofSecondsLeft(position)),
    unit: 's',
    fill: Math.min(1, Math.max(0, position.stepProgress)),
    status: roundText,
    tone: 'info',
  };
}

/**
 * A spoken line when a step begins, or null. Only the turning points speak.
 * Calling every one of the 60 quick breaths would talk over the breathing.
 */
export function wimHofSpokenLine(step: WimHofStep, rounds: number): string | null {
  switch (step.kind) {
    case 'ready':
      return step.round === 1
        ? `Round 1 of ${rounds}. Thirty deep breaths. In through the nose, out through the mouth.`
        : `Round ${step.round} of ${rounds}. Thirty more breaths.`;
    case 'bigIn':
      return 'Big breath in. Fill right up.';
    case 'hold':
      return `Hold for ${WIM_HOF_HOLD_SECONDS} seconds.`;
    case 'letGo':
      return 'Breathe out.';
    default:
      return null;
  }
}

export function wimHofDoneSpoken(): string {
  return 'All rounds done. Breathe normally.';
}

/** Total time as plain words, such as "about 6 minutes". */
export function wimHofLengthText(rounds: WimHofRounds): string {
  const minutes = Math.round(wimHofTotalMs(buildWimHofPlan(rounds)) / 60_000);
  return `about ${minutes} minutes`;
}
