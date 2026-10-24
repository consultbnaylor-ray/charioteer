import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  acceptPauseTap,
  beginPhase,
  elapsedMs,
  idlePhase,
  isPhaseDone,
  pauseTiming,
  PAUSE_TAP_GUARD_MS,
  phaseProgress,
  remainingMs,
  remainingSeconds,
  resumeTiming,
  scaleAtProgress,
} from './breathPause';

describe('breath pause and resume', () => {
  it('freezes a phase in the middle and resumes the remainder', () => {
    const started = beginPhase(4, 1_000);
    const pausedAt = 1_000 + 1_500;
    const paused = pauseTiming(started, pausedAt);

    expect(paused.startedAt).toBeNull();
    expect(paused.carriedMs).toBe(1_500);
    expect(remainingMs(paused, pausedAt)).toBe(2_500);
    expect(remainingSeconds(paused, pausedAt)).toBe(3);
    expect(phaseProgress(paused, pausedAt)).toBeCloseTo(0.375);
    expect(scaleAtProgress(0.72, 1, phaseProgress(paused, pausedAt))).toBeCloseTo(0.825);
    expect(isPhaseDone(paused, pausedAt)).toBe(false);

    const later = pausedAt + 2_000;
    expect(remainingMs(paused, later)).toBe(2_500);
    expect(phaseProgress(paused, later)).toBeCloseTo(0.375);
    expect(elapsedMs(paused, later)).toBe(1_500);

    const resumed = resumeTiming(paused, 10_000);
    expect(resumed.startedAt).toBe(10_000);
    expect(remainingMs(resumed, 10_000)).toBe(2_500);
    expect(isPhaseDone(resumed, 12_499)).toBe(false);
    expect(isPhaseDone(resumed, 12_500)).toBe(true);
    expect(remainingSeconds(resumed, 12_000)).toBe(1);
    expect(remainingSeconds(resumed, 12_500)).toBe(0);
  });

  it('does not move a paused phase and ignores a second pause', () => {
    const paused = pauseTiming(beginPhase(8, 0), 3_200);
    const again = pauseTiming(paused, 9_000);
    expect(again.carriedMs).toBe(3_200);
    expect(again.startedAt).toBeNull();
    expect(remainingMs(again, 9_000)).toBe(4_800);
    expect(resumeTiming(resumeTiming(again, 9_100), 9_100).startedAt).toBe(9_100);
  });

  it('starts an idle phase only when resume is asked for', () => {
    const idle = idlePhase(2);
    expect(remainingMs(idle, 5_000)).toBe(2_000);
    expect(phaseProgress(idle, 8_000)).toBe(0);
    const running = resumeTiming(idle, 8_000);
    expect(elapsedMs(running, 8_400)).toBe(400);
    expect(isPhaseDone(beginPhase(0, 0), 0)).toBe(true);
  });

  it('accepts the first tap and drops a repeat inside the guard', () => {
    expect(PAUSE_TAP_GUARD_MS).toBe(300);
    expect(acceptPauseTap(null, 1_000)).toBe(true);
    expect(acceptPauseTap(1_000, 1_299)).toBe(false);
    expect(acceptPauseTap(1_000, 1_300)).toBe(true);
  });

  it('keeps a paused phase still when the clock is polled again', () => {
    const running = beginPhase(6, 500);
    const paused = pauseTiming(running, 2_100);
    expect(phaseProgress(paused, 2_100)).toBeCloseTo(1_600 / 6_000);
    expect(phaseProgress(paused, 4_000)).toBe(phaseProgress(paused, 2_100));
    expect(remainingSeconds(paused, 4_000)).toBe(remainingSeconds(paused, 2_100));
    const continued = resumeTiming(paused, 4_000);
    expect(remainingMs(continued, 4_000 + 1_600)).toBe(6_000 - 3_200);
  });
});

describe('breathe screen pause control', () => {
  const source = readFileSync(new URL('../app/(main)/breathe.tsx', import.meta.url), 'utf8');

  it('stops motion in the press handler and ignores a rapid second tap', () => {
    expect(source).toContain('stopAnimation');
    expect(source).toContain('clearInterval');
    expect(source).toContain('clearTimeout');
    expect(source).toContain('acceptPauseTap');
    expect(source).toContain('pauseTiming');
    expect(source).toContain('resumeTiming');
    expect(source).toContain('onPressIn={onPress}');
    expect(source).toContain('ImpactFeedbackStyle.Light');
    expect(source).toContain('minHeight: 52');
    expect(source).toContain('minWidth: 44');
    expect(source).not.toContain('setRunning((value) => !value)');
  });
});
