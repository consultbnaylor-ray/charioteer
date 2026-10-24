import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_NOT_A_PROMISE,
  ACTIVITY_NOT_ENOUGH,
  TOWARD_TARGET_TITLE,
  WEEKLY_MINUTES_HIGH,
  targetActivityPlan,
  targetCoachActivityLines,
} from '@/domain/targetActivity';

function days(today: string, count: number, minutes: number, steps: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - index);
    return {
      day: date.toISOString().slice(0, 10),
      steps,
      stepsSource: 'Apple Health',
      exerciseMinutes: minutes,
      vigorousMinutes: 0,
      minutesSource: 'Apple Health',
    };
  });
}

describe('activity toward a target weight', () => {
  const today = '2026-10-24';

  it('stays quiet until a few days of activity exist', () => {
    const plan = targetActivityPlan({
      direction: 'lose',
      today,
      readings: days(today, 2, 30, 6000),
    });
    expect(plan.enough).toBe(false);
    expect(plan.suggestions).toEqual([]);
    expect(plan.notes).toEqual([ACTIVITY_NOT_ENOUGH]);
  });

  it('suggests about ten percent more, and stops at the weekly cap', () => {
    const plan = targetActivityPlan({
      direction: 'lose',
      today,
      readings: days(today, 5, 20, 4000),
    });
    expect(plan.title).toBe(TOWARD_TARGET_TITLE);
    const minutes = plan.suggestions.find((item) => item.id === 'minutes');
    expect(minutes?.added).toBe(10);
    expect(minutes?.text).toContain(String(WEEKLY_MINUTES_HIGH));
    expect(plan.notes).toContain(ACTIVITY_NOT_A_PROMISE);
    const full = targetActivityPlan({
      direction: 'lose',
      today,
      readings: days(today, 5, 60, 8000),
    });
    const held = full.suggestions.find((item) => item.unit === 'min');
    expect(held?.added).toBe(0);
    expect(held?.text).toContain('Hold there');
  });

  it('reaches the coach and the fitness and workout screens only as a suggestion', () => {
    const plan = targetActivityPlan({
      direction: 'gain',
      today,
      readings: days(today, 4, 25, 5000),
    });
    const lines = targetCoachActivityLines(plan);
    expect(lines.join(' ')).toContain('Do not turn these into a training programme');
    expect(readFileSync('src/ui/YourFitness.tsx', 'utf8')).toContain('<TowardTargetActivity />');
    expect(readFileSync('src/ui/WorkoutList.tsx', 'utf8')).toContain('<TowardTargetActivity compact />');
    expect(readFileSync('src/ui/GoalChoices.tsx', 'utf8')).toContain('label="Target weight"');
    expect(readFileSync('src/voice/briefing.ts', 'utf8')).toContain('activity: activityReadingsFromSamples');
  });
});
