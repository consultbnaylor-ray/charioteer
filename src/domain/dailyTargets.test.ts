import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildDailyTargets } from '@/domain/dailyTargets';
import { buildStatsAnalysis } from '@/domain/statsAnalysis';
import { emptyGarminReadings } from '@/domain/garminConnect';
import { TARGET_NOT_ENOUGH, TARGET_TREND_FLAT, targetTrendEstimate } from '@/domain/targetWeight';

describe('daily targets', () => {
  it('states the intake for a dated target and caps a crash date', () => {
    const steady = buildDailyTargets({
      currentKg: 90,
      targetKg: 76.2,
      targetOn: '2027-06-01',
      today: '2026-11-03',
      heightCm: 180,
      age: 45,
      sex: 'male',
      activeEnergyKcal: 400,
      startKg: 90,
      startDay: '2026-11-03',
    });
    expect(steady).not.toBeNull();
    if (!steady) return;
    expect(steady.headline).toContain('76.2 kg');
    expect(steady.headline).toContain('12 st');
    expect(steady.intake).toMatch(/target \d{1,3}(?:,\d{3})? kcal/);
    expect(steady.deficitKcal).toBeLessThanOrEqual(1000);
    expect(steady.targetKcal).toBeGreaterThanOrEqual(1500);
    expect(steady.weigh).toMatch(/once a week/);
    expect(steady.caveat).toContain('Not medical advice');
    expect(steady.path[0]?.kg).toBe(90);
    expect(steady.path[steady.path.length - 1]?.kg).toBe(76.2);

    const rushed = buildDailyTargets({
      currentKg: 90,
      targetKg: 76.2,
      targetOn: '2026-12-01',
      today: '2026-11-03',
      heightCm: 180,
      age: 45,
      sex: 'male',
      activeEnergyKcal: null,
      startKg: 90,
      startDay: '2026-11-03',
    });
    expect(rushed?.unrealistic).toBe(true);
    expect(rushed?.pace).toMatch(/faster than 1 kg a week/);
    expect(rushed?.deficitKcal).toBeLessThanOrEqual(1000);
    expect(rushed?.targetKcal).toBeGreaterThanOrEqual(1500);

    const cut = buildDailyTargets({
      currentKg: 80,
      targetKg: 77,
      targetOn: '2026-11-17',
      today: '2026-11-03',
      heightCm: 180,
      age: 30,
      sex: 'male',
      activeEnergyKcal: 2000,
      startKg: 80,
      startDay: '2026-11-03',
      competitionCut: true,
    });
    const capped = buildDailyTargets({
      currentKg: 80,
      targetKg: 77,
      targetOn: '2026-11-17',
      today: '2026-11-03',
      heightCm: 180,
      age: 30,
      sex: 'male',
      activeEnergyKcal: 2000,
      startKg: 80,
      startDay: '2026-11-03',
    });
    expect(cut?.targetKcal).toBeGreaterThanOrEqual(1500);
    expect(cut && capped && cut.targetKcal < capped.targetKcal).toBe(true);
    expect(cut?.deficitKcal).toBeGreaterThan(1000);
    expect(cut?.pace).toMatch(/will not suggest fluid restriction/);
    expect(cut?.pace).not.toMatch(/try a sauna|use a sweat suit|take a diuretic|take a laxative/i);

    const floored = buildDailyTargets({
      currentKg: 80,
      targetKg: 70,
      targetOn: '2026-11-10',
      today: '2026-11-03',
      heightCm: 180,
      age: 30,
      sex: 'male',
      activeEnergyKcal: 200,
      startKg: 80,
      startDay: '2026-11-03',
      competitionCut: true,
    });
    expect(floored?.targetKcal).toBeGreaterThanOrEqual(1500);
    expect(floored?.pace).toMatch(/stays at that floor/);

    const woman = buildDailyTargets({
      currentKg: 60,
      targetKg: 55,
      targetOn: '2026-11-10',
      today: '2026-11-03',
      heightCm: 165,
      age: 28,
      sex: 'female',
      activeEnergyKcal: 200,
      startKg: 60,
      startDay: '2026-11-03',
      competitionCut: true,
    });
    expect(woman?.targetKcal).toBeGreaterThanOrEqual(1200);
  });

  it('does not say there is no estimated date when a target date is set', () => {
    expect(TARGET_NOT_ENOUGH).toBe("Not enough weigh-ins yet to estimate when you'll get there.");
    expect(TARGET_NOT_ENOUGH.toLowerCase()).not.toContain('no estimated date');
    expect(TARGET_TREND_FLAT.toLowerCase()).not.toContain('no estimated date');
    expect(targetTrendEstimate({
      currentKg: 90,
      targetKg: 76.2,
      readings: [{ day: '2026-10-01', kg: 91 }, { day: '2026-10-20', kg: 90 }],
    }).text).toBe(TARGET_NOT_ENOUGH);
    const page = readFileSync('src/ui/TargetWeightGoal.tsx', 'utf8');
    expect(page).toContain('Target date');
    expect(page).toContain('{estimate.text}');
    expect(readFileSync('src/app/(main)/health-plan.tsx', 'utf8')).toContain('<DailyTargets />');
    expect(readFileSync('src/ui/DailyTargets.tsx', 'utf8')).toContain('Save weight');
    expect(readFileSync('src/ui/DailyTargets.tsx', 'utf8')).toContain('weightWaistWrite');
  });

  it('sends the same calorie line with the stats summary', () => {
    const summary = buildStatsAnalysis({
      today: '2026-11-03',
      age: 45,
      sex: 'male',
      goal: null,
      heightCm: 180,
      targetWeightKg: 76.2,
      targetOn: '2027-06-01',
      samples: [
        { kind: 'weight_kg', value: 90, recordedOn: '2026-11-01' },
        { kind: 'active_energy', value: 400, recordedOn: '2026-11-02' },
        { kind: 'steps', value: 8000, recordedOn: '2026-11-02' },
      ],
      readings: emptyGarminReadings(),
    });
    expect(summary.weightPlan).toMatch(/kcal/);
    expect(summary.weightPlan).toMatch(/76\.2 kg/);
    expect(summary.stats.some((stat) => stat.id === 'weight_kg')).toBe(true);
    const prompt = readFileSync('supabase/functions/_shared/statsAnalysis.ts', 'utf8');
    expect(prompt).toContain('weightPlan');
    expect(prompt).toContain('faster than 1 kg a week');
    expect(readFileSync('supabase/functions/health-plan/index.ts', 'utf8')).toContain('localOnly');
  });
});
