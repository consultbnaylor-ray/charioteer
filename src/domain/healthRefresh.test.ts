import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { REFRESH_APPLE, REFRESH_BOTH, lastUpdatedLine, refreshButtonLabel, refreshCooling } from '@/domain/healthRefresh';
import { workoutWeekSummary } from '@/domain/workoutDay';

describe('manual health refresh', () => {
  it('names Garmin only when it is connected, and waits a minute', () => {
    expect(refreshButtonLabel(false)).toBe(REFRESH_APPLE);
    expect(refreshButtonLabel(true)).toBe(REFRESH_BOTH);
    expect(refreshCooling(1_000, 1_000 + 59_000)).toBe(true);
    expect(refreshCooling(1_000, 1_000 + 60_000)).toBe(false);
    expect(lastUpdatedLine(null)).toBe('Last updated —');
    expect(lastUpdatedLine('2026-10-23T20:04:00Z')).toMatch(/^Last updated \d{2}:\d{2}$/);
  });

  it('puts the control at the top of Health, Workouts, and Fitness', () => {
    for (const path of [
      'src/app/(main)/health.tsx',
      'src/app/(main)/health-plan.tsx',
      'src/app/(main)/workouts.tsx',
      'src/app/(main)/stats.tsx',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source, path).toContain('<HealthRefreshBar');
      expect(source, path).toContain('onRefresh={() => void manual.run()}');
      expect(source.indexOf('<HealthRefreshBar'), path).toBeLessThan(source.indexOf('<HealthRefreshBar') + 20);
    }
    const plan = readFileSync('src/app/(main)/health-plan.tsx', 'utf8');
    expect(plan.indexOf('<HealthRefreshBar')).toBeLessThan(plan.indexOf('<GoalChoices'));
    expect(plan.indexOf('variant="label">Fitness')).toBeLessThan(plan.indexOf('<WorkoutsLink'));
    expect(plan.indexOf('<WorkoutsLink')).toBeLessThan(plan.indexOf('variant="label">Wellbeing'));
    expect(readFileSync('src/ui/WorkoutsLink.tsx', 'utf8')).toContain('Workouts: see your workout calendar and history');
    expect(workoutWeekSummary(
      [{ startedAt: '2026-10-21T07:00:00Z', durationMinutes: 30 }],
      '2026-10-23',
    )).toBe('This week: 1 workout, 30 min');
    const bar = readFileSync('src/ui/HealthRefresh.tsx', 'utf8');
    expect(bar).toContain('refreshAppleHealth');
    expect(bar).toContain('consentHealth');
    expect(bar).toContain('refreshGarmin');
    expect(bar).toContain('<PlanTick done />');
    expect(readFileSync('src/domain/healthRefresh.ts', 'utf8')).toContain('Asked Garmin for your latest data');
    expect(bar).toContain('GARMIN_ASKED');
  });
});
