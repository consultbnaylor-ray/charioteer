import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { goalProgressPhotosFromRows, goalProgressSeries } from '@/domain/goalProgress';
import { settingsForPreset } from '@/domain/targetWeight';
import { defaultNutritionSettings } from '@/domain/nutrition';

describe('goal progress', () => {
  it('keeps an optional target date when a fitness goal is chosen', () => {
    const preset = settingsForPreset({
      ...defaultNutritionSettings(),
      targetWeightKg: 76.2,
      targetOn: '2027-06-01',
      targetStartKg: 90,
    }, 'elite_cruiser_boxer');
    expect(preset.goal).toBe('elite_cruiser_boxer');
    expect(preset.targetWeightKg).toBeNull();
    expect(preset.targetOn).toBe('2027-06-01');
    expect(readFileSync('src/ui/GoalChoices.tsx', 'utf8')).toContain('<GoalTargetDate />');
  });

  it('draws weight and VO2 actuals, and a dashed path only when that target and a date exist', () => {
    const series = goalProgressSeries({
      today: '2026-11-03',
      targetOn: '2027-06-01',
      goal: 'elite_cruiser_boxer',
      sex: 'male',
      weight: [{ day: '2026-11-01', kg: 90 }, { day: '2026-11-03', kg: 89.4 }],
      vo2: [{ day: '2026-10-01', value: 42 }, { day: '2026-11-01', value: 43.2 }],
      weightTargetKg: null,
      weightStartKg: 90,
    });
    expect(series.weightActual).toHaveLength(2);
    expect(series.vo2Actual.map((point) => point.value)).toEqual([42, 43.2]);
    expect(series.weightPath).toBeNull();
    expect(series.vo2Target).toBe(56);
    expect(series.vo2Path?.[0]?.value).toBe(42);
    expect(series.vo2Path?.[series.vo2Path.length - 1]).toMatchObject({ day: '2027-06-01', value: 56 });

    const one = goalProgressSeries({
      today: '2026-11-03',
      targetOn: '2027-01-01',
      goal: null,
      sex: 'male',
      weight: [{ day: '2026-11-03', kg: 90 }],
      vo2: [],
      weightTargetKg: 76.2,
      weightStartKg: 90,
    });
    expect(one.weightActual).toHaveLength(1);
    expect(one.weightPath?.[0]).toMatchObject({ day: '2026-11-03', value: 90 });
    expect(one.weightPath?.[one.weightPath.length - 1]?.value).toBe(76.2);
    expect(one.vo2Path).toBeNull();
  });

  it('keeps progress photos private and off the coach', () => {
    const sql = readFileSync('supabase/migrations/20261103120000_goal_progress_photos.sql', 'utf8');
    expect(sql).toContain('create table public.goal_progress_photos');
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql).toContain("bucket_id = 'goal-progress-photos'");
    expect(sql).toContain('public = false');
    expect(sql).not.toMatch(/grant .+ to anon/i);
    expect(goalProgressPhotosFromRows([{ id: 'p1', recorded_on: '2026-11-03', storage_path: '../secret.jpg' }])).toEqual([]);
    const coach = [
      'supabase/functions/health-plan/index.ts',
      'supabase/functions/thumos-chat/index.ts',
      'supabase/functions/_shared/statsAnalysis.ts',
    ].map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(coach).not.toContain('goal_progress_photos');
    expect(coach).not.toContain('goal-progress-photos');
    expect(readFileSync('src/ui/DailyTargets.tsx', 'utf8')).toContain('Take a photo to track progress visually');
    expect(readFileSync('src/ui/DailyTargets.tsx', 'utf8')).toContain('not sent to Thumos');
    expect(readFileSync('supabase/functions/account-delete/index.ts', 'utf8')).toContain('goal-progress-photos');
    expect(readFileSync('src/domain/sharedPhotos.ts', 'utf8')).toContain('NSCameraUsageDescription'.replace('NSCameraUsageDescription', 'progress photo'));
  });
});
