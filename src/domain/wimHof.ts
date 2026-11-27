import type { MeasureRing } from '@/domain/measureFigures';

/**
 * Wim Hof style breathing, as pure timing.
 * Each round: a short get-ready, 30 deep breaths (in through the nose, out through the mouth),
 * an empty-lungs hold that lasts until the user taps Breathe in (capped at 3 minutes),
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
/** The empty-lungs hold ends when the user taps Breathe in, or at this safety cap. */
export const WIM_HOF_EMPTY_HOLD_CAP_MS = 180_000;
/** Used only for the time estimate on the round buttons. */
export const WIM_HOF_TYPICAL_EMPTY_HOLD_MS = 90_000;

export const WIM_HOF_TITLE = 'Wim Hof style';
export const WIM_HOF_SUMMARY = `${WIM_HOF_BREATHS} deep breaths, then breathe out and hold with empty lungs for as long as feels comfortable, then one big breath held for ${WIM_HOF_HOLD_SECONDS} seconds. That is one round.`;
export const WIM_HOF_SAFETY_LINE =
  'Sit or lie down first. Never do this in water, while driving, or standing up. Do not force the empty-lungs hold: tap Breathe in as soon as you need to. Tingling and light-headedness are common. Stop and breathe normally if you feel faint. If you are pregnant, or have a heart condition or epilepsy, check with your doctor before you try it.';
export const WIM_HOF_DONE_LINE = 'All rounds done. Breathe normally for a minute before you stand up.';

/** Circle sizes, matching the other breathing exercises: 0.68 small, 1 full. */
const REST = 0.72;
const FULL = 1;

export type WimHofStepKind = 'ready' | 'in' | 'out' | 'emptyHold' | 'bigIn' | 'hold' | 'letGo';

export type WimHofStep = {
  kind: WimHofStepKind;
  cue: 'in' | 'out' | 'hold' | 'ready';
  label: string;
  round: number;
  /** 1 to 30 during the deep breaths, otherwise null. */
  breath: number | null;
  ms: number;
  fromScale: number;
  toScale: number;
  /** Where this step starts on the session clock. */
  startMs: number;
  /** True for the empty-lungs hold, which ends early when the user taps Breathe in. */
  open: boolean;
};

/** Empty-lungs hold length per round, in ms. Missing rounds use the safety cap until the user taps. */
export type WimHofEmptyHolds = ReadonlyArray<number | undefined>;

export function isWimHofRounds(value: unknown): value is WimHofRounds {
  return value === 3 || value === 4;
}

export function buildWimHofPlan(rounds: WimHofRounds = WIM_HOF_DEFAULT_ROUNDS, emptyHolds: WimHofEmptyHolds = []): WimHofStep[] {
  const count = isWimHofRounds(rounds) ? rounds : WIM_HOF_DEFAULT_ROUNDS;
  const steps: WimHofStep[] = [];
  let at = 0;
  const push = (step: Omit<WimHofStep, 'startMs' | 'open'>, open = false) => {
    steps.push({ ...step, startMs: at, open });
    at += step.ms;
  };
  for (let round = 1; round <= count; round += 1) {
    push({ kind: 'ready', cue: 'ready', label: 'Get ready', round, breath: null, ms: WIM_HOF_READY_MS, fromScale: REST, toScale: REST });
    for (let breath = 1; breath <= WIM_HOF_BREATHS; breath += 1) {
      push({ kind: 'in', cue: 'in', label: 'Breathe in', round, breath, ms: WIM_HOF_IN_MS, fromScale: REST, toScale: FULL });
      push({ kind: 'out', cue: 'out', label: 'Breathe out', round, breath, ms: WIM_HOF_OUT_MS, fromScale: FULL, toScale: REST });
    }
    push({ kind: 'emptyHold', cue: 'hold', label: 'Breathe out and hold', round, breath: null, ms: emptyHoldMs(emptyHolds[round - 1]), fromScale: REST, toScale: REST }, true);
    push({ kind: 'bigIn', cue: 'in', label: 'Big breath in', round, breath: null, ms: WIM_HOF_BIG_IN_MS, fromScale: REST, toScale: FULL });
    push({ kind: 'hold', cue: 'hold', label: 'Hold', round, breath: null, ms: WIM_HOF_HOLD_SECONDS * 1000, fromScale: FULL, toScale: FULL });
    push({ kind: 'letGo', cue: 'out', label: 'Breathe out', round, breath: null, ms: WIM_HOF_LET_GO_MS, fromScale: FULL, toScale: REST });
  }
  return steps;
}

function emptyHoldMs(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return WIM_HOF_EMPTY_HOLD_CAP_MS;
  return Math.min(WIM_HOF_EMPTY_HOLD_CAP_MS, Math.max(0, Math.round(value)));
}

/**
 * The user tapped Breathe in during an empty-lungs hold at this point on the session clock.
 * Returns the holds with that round's length fixed, so the rebuilt plan puts the clock at the start of the big breath.
 * Returns null when the clock is not in an empty-lungs hold.
 */
export function endEmptyHold(plan: WimHofStep[], emptyHolds: WimHofEmptyHolds, elapsedMs: number): number[] | null {
  const position = wimHofAt(plan, elapsedMs);
  if (position.done || position.step.kind !== 'emptyHold') return null;
  const next: number[] = [];
  const rounds = Math.max(...plan.map((step) => step.round));
  for (let i = 0; i < rounds; i += 1) next[i] = emptyHolds[i] ?? Number.NaN;
  next[position.step.round - 1] = Math.round(position.stepElapsedMs);
  return next;
}

/** Each finished round's empty-lungs hold, in ms, in round order. Rounds not reached yet are left out. */
export function wimHofHoldTimes(plan: WimHofStep[], elapsedMs: number): number[] {
  const position = wimHofAt(plan, elapsedMs);
  return plan
    .filter((step) => step.kind === 'emptyHold' && (position.done || step.startMs + step.ms <= elapsedMs))
    .map((step) => step.ms);
}

/** 65 000 ms as "1:05". */
export function stopwatchText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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
  if (step.kind === 'emptyHold') {
    return {
      centre: stopwatchText(position.stepElapsedMs),
      unit: 'held',
      fill: Math.min(1, Math.max(0, position.stepElapsedMs / WIM_HOF_EMPTY_HOLD_CAP_MS)),
      status: roundText,
      tone: 'info',
      neutral: true,
    };
  }
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
    case 'emptyHold':
      return 'Breathe out and hold, lungs empty. Tap Breathe in when you need to.';
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

/** Said instead of the usual big-breath line when the empty-lungs hold reaches the safety cap. */
export function wimHofCapSpoken(): string {
  return 'Three minutes. Breathe in now, gently.';
}

export function wimHofDoneSpoken(): string {
  return 'All rounds done. Breathe normally.';
}

/** Total time as plain words, such as "about 11 minutes", assuming a typical 90 second empty-lungs hold. */
export function wimHofLengthText(rounds: WimHofRounds): string {
  const holds = Array.from({ length: rounds }, () => WIM_HOF_TYPICAL_EMPTY_HOLD_MS);
  const minutes = Math.round(wimHofTotalMs(buildWimHofPlan(rounds, holds)) / 60_000);
  return `about ${minutes} minutes`;
}
