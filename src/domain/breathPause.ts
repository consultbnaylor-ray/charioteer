/** Ignore a second tap until this long after the one that was accepted. */
export const PAUSE_TAP_GUARD_MS = 300;

export type BreathTiming = {
  /** Length of the current phase. */
  phaseMs: number;
  /** Time already spent in this phase. Frozen while `startedAt` is null. */
  carriedMs: number;
  /** Wall clock when the current running stretch began. Null while paused. */
  startedAt: number | null;
};

export function idlePhase(phaseSeconds: number): BreathTiming {
  return { phaseMs: phaseMs(phaseSeconds), carriedMs: 0, startedAt: null };
}

export function beginPhase(phaseSeconds: number, now: number): BreathTiming {
  return { phaseMs: phaseMs(phaseSeconds), carriedMs: 0, startedAt: now };
}

export function elapsedMs(timing: BreathTiming, now: number): number {
  const live = timing.startedAt == null ? 0 : Math.max(0, now - timing.startedAt);
  return Math.min(timing.phaseMs, timing.carriedMs + live);
}

export function remainingMs(timing: BreathTiming, now: number): number {
  return Math.max(0, timing.phaseMs - elapsedMs(timing, now));
}

/** Whole seconds still showing, including the second that is underway. */
export function remainingSeconds(timing: BreathTiming, now: number): number {
  return Math.ceil(remainingMs(timing, now) / 1000);
}

/** 0 at the start of the phase, 1 when the phase is over. Stays put while paused. */
export function phaseProgress(timing: BreathTiming, now: number): number {
  if (timing.phaseMs <= 0) return 1;
  return elapsedMs(timing, now) / timing.phaseMs;
}

export function pauseTiming(timing: BreathTiming, now: number): BreathTiming {
  return {
    phaseMs: timing.phaseMs,
    carriedMs: elapsedMs(timing, now),
    startedAt: null,
  };
}

export function resumeTiming(timing: BreathTiming, now: number): BreathTiming {
  if (timing.startedAt != null) return timing;
  if (timing.carriedMs >= timing.phaseMs) return timing;
  return { ...timing, startedAt: now };
}

export function isPhaseDone(timing: BreathTiming, now: number): boolean {
  return remainingMs(timing, now) <= 0;
}

export function acceptPauseTap(lastTapAt: number | null, now: number, guardMs = PAUSE_TAP_GUARD_MS): boolean {
  if (lastTapAt == null) return true;
  return now - lastTapAt >= guardMs;
}

/** Where the circle sits for a stored progress, from the phase's start scale to its end scale. */
export function scaleAtProgress(from: number, to: number, progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return from + (to - from) * t;
}

function phaseMs(phaseSeconds: number): number {
  if (!Number.isFinite(phaseSeconds) || phaseSeconds <= 0) return 0;
  return Math.round(phaseSeconds * 1000);
}
