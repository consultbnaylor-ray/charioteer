import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { elapsedMs, pauseTiming, resumeTiming, type BreathTiming } from '@/domain/breathPause';
import {
  WIM_HOF_BREATHS,
  WIM_HOF_HOLD_SECONDS,
  WIM_HOF_SAFETY_LINE,
  buildWimHofPlan,
  isWimHofRounds,
  wimHofAt,
  wimHofFigure,
  wimHofLengthText,
  wimHofScale,
  wimHofSecondsLeft,
  wimHofSpokenLine,
  wimHofTotalMs,
} from '@/domain/wimHof';

describe('Wim Hof plan', () => {
  it('has 30 breaths, a big breath, a 15 second hold and a breath out in every round', () => {
    for (const rounds of [3, 4] as const) {
      const plan = buildWimHofPlan(rounds);
      for (let round = 1; round <= rounds; round += 1) {
        const steps = plan.filter((step) => step.round === round);
        expect(steps.filter((step) => step.kind === 'in')).toHaveLength(WIM_HOF_BREATHS);
        expect(steps.filter((step) => step.kind === 'out')).toHaveLength(WIM_HOF_BREATHS);
        const tail = steps.slice(-3).map((step) => step.kind);
        expect(tail).toEqual(['bigIn', 'hold', 'letGo']);
        const hold = steps.find((step) => step.kind === 'hold');
        expect(hold?.ms).toBe(WIM_HOF_HOLD_SECONDS * 1000);
        expect(steps[0].kind).toBe('ready');
      }
      expect(Math.max(...plan.map((step) => step.round))).toBe(rounds);
    }
  });

  it('defaults to 3 rounds and only accepts 3 or 4', () => {
    expect(Math.max(...buildWimHofPlan().map((step) => step.round))).toBe(3);
    expect(isWimHofRounds(3)).toBe(true);
    expect(isWimHofRounds(4)).toBe(true);
    expect(isWimHofRounds(5)).toBe(false);
    expect(Math.max(...buildWimHofPlan(9 as never).map((step) => step.round))).toBe(3);
  });

  it('lays steps end to end with no gaps', () => {
    const plan = buildWimHofPlan(4);
    for (let i = 1; i < plan.length; i += 1) {
      expect(plan[i].startMs).toBe(plan[i - 1].startMs + plan[i - 1].ms);
    }
    expect(wimHofTotalMs(plan)).toBe(4 * (4_000 + 30 * 3_500 + 3_000 + 15_000 + 4_000));
  });

  it('counts each deep breath in then out', () => {
    const plan = buildWimHofPlan(3);
    const first = wimHofAt(plan, 0);
    expect(first.step.kind).toBe('ready');
    const breathOne = wimHofAt(plan, 4_000);
    expect(breathOne.step).toMatchObject({ kind: 'in', breath: 1, label: 'Breathe in' });
    expect(wimHofAt(plan, 4_000 + 2_000).step).toMatchObject({ kind: 'out', breath: 1 });
    expect(wimHofAt(plan, 4_000 + 3_500).step).toMatchObject({ kind: 'in', breath: 2 });
    expect(wimHofAt(plan, 4_000 + 29 * 3_500 + 100).step).toMatchObject({ kind: 'in', breath: 30 });
    expect(wimHofAt(plan, 4_000 + 30 * 3_500).step.kind).toBe('bigIn');
  });

  it('shows the hold seconds counting down', () => {
    const plan = buildWimHofPlan(3);
    const holdStart = plan.find((step) => step.kind === 'hold')!.startMs;
    expect(wimHofSecondsLeft(wimHofAt(plan, holdStart))).toBe(15);
    expect(wimHofSecondsLeft(wimHofAt(plan, holdStart + 14_100))).toBe(1);
    expect(wimHofAt(plan, holdStart + 15_000).step.kind).toBe('letGo');
    const ring = wimHofFigure(wimHofAt(plan, holdStart + 5_000), 3);
    expect(ring).toMatchObject({ centre: '10', unit: 's', status: 'Round 1 of 3' });
  });

  it('moves to the next round and finishes at the end', () => {
    const plan = buildWimHofPlan(3);
    const round2 = plan.find((step) => step.round === 2)!;
    expect(wimHofAt(plan, round2.startMs).step).toMatchObject({ kind: 'ready', round: 2 });
    const end = wimHofAt(plan, wimHofTotalMs(plan));
    expect(end.done).toBe(true);
    expect(wimHofAt(plan, wimHofTotalMs(plan) - 1).done).toBe(false);
    expect(wimHofAt(plan, -50).index).toBe(0);
    expect(wimHofAt(plan, Number.NaN).index).toBe(0);
  });

  it('grows the circle on the in breath and shrinks it on the out breath', () => {
    const plan = buildWimHofPlan(3);
    expect(wimHofScale(wimHofAt(plan, 4_000))).toBeCloseTo(0.72);
    expect(wimHofScale(wimHofAt(plan, 4_000 + 1_000))).toBeCloseTo(0.86);
    expect(wimHofScale(wimHofAt(plan, 4_000 + 1_999))).toBeGreaterThan(0.99);
    expect(wimHofScale(wimHofAt(plan, 4_000 + 3_499))).toBeLessThan(0.73);
    const holdStart = plan.find((step) => step.kind === 'hold')!.startMs;
    expect(wimHofScale(wimHofAt(plan, holdStart + 7_000))).toBe(1);
  });

  it('shows the breath count, not the seconds, during the deep breaths', () => {
    const plan = buildWimHofPlan(4);
    const ring = wimHofFigure(wimHofAt(plan, 4_000 + 3_500 * 11 + 100), 4);
    expect(ring).toMatchObject({ centre: '12', unit: 'of 30', status: 'Round 1 of 4' });
    expect(ring.fill).toBeGreaterThan(11 / 30);
    expect(ring.fill).toBeLessThan(12 / 30);
  });

  it('pauses with the shared breath clock and picks up where it left off', () => {
    const plan = buildWimHofPlan(3);
    let clock: BreathTiming = { phaseMs: wimHofTotalMs(plan), carriedMs: 0, startedAt: 1_000 };
    clock = pauseTiming(clock, 1_000 + 20_000);
    expect(wimHofAt(plan, elapsedMs(clock, 99_000)).stepElapsedMs).toBe(wimHofAt(plan, 20_000).stepElapsedMs);
    clock = resumeTiming(clock, 99_000);
    expect(elapsedMs(clock, 99_000 + 5_000)).toBe(25_000);
  });

  it('speaks only at the turning points', () => {
    const plan = buildWimHofPlan(3);
    const spoken = plan.map((step) => wimHofSpokenLine(step, 3)).filter(Boolean);
    expect(spoken).toHaveLength(3 * 4);
    expect(wimHofSpokenLine(plan[0], 3)).toContain('In through the nose, out through the mouth');
    expect(plan.filter((step) => step.kind === 'in' || step.kind === 'out').every((step) => wimHofSpokenLine(step, 3) === null)).toBe(true);
  });

  it('gives the length in plain words', () => {
    expect(wimHofLengthText(3)).toBe('about 7 minutes');
    expect(wimHofLengthText(4)).toBe('about 9 minutes');
  });

  it('carries the safety note', () => {
    expect(WIM_HOF_SAFETY_LINE).toMatch(/water/);
    expect(WIM_HOF_SAFETY_LINE).toMatch(/driving/);
    expect(WIM_HOF_SAFETY_LINE).toMatch(/standing/);
    expect(WIM_HOF_SAFETY_LINE).toMatch(/dizzy/);
    expect(WIM_HOF_SAFETY_LINE).toMatch(/pregnant/);
    expect(WIM_HOF_SAFETY_LINE).toMatch(/heart/);
    expect(WIM_HOF_SAFETY_LINE).toMatch(/epilepsy/);
  });
});

describe('Wim Hof screen', () => {
  const screen = readFileSync('src/ui/WimHofBreathing.tsx', 'utf8');
  const breathe = readFileSync('src/app/(main)/breathe.tsx', 'utf8');

  it('sits on the Breathe screen as its own choice', () => {
    expect(breathe).toContain('<WimHofBreathing />');
    expect(breathe).toContain("'wimhof'");
  });

  it('shows the safety note before starting, keeps the screen on, and uses gated speech', () => {
    expect(screen).toContain('WIM_HOF_SAFETY_LINE');
    expect(screen).toContain('expo-keep-awake');
    expect(screen).toContain('speakIfGated');
    expect(screen).toContain('stopSpeaking');
    expect(screen).toContain('acceptPauseTap');
    expect(screen).toContain('minHeight: 52');
    expect(screen).not.toMatch(/Picker|ScrollView/);
  });
});
