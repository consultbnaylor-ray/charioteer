import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { GOAL_PROGRESS_BUCKET, goalProgressObjectPath, goalProgressPhotosFromRows, goalProgressSeries, goalProgressSignStub, progressLinePath, withGoalProgressPreviews } from '@/domain/goalProgress';
import { signedStorageRef } from '@/domain/ownerPhotos';
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

  it('builds one path per series in date order from unsorted weigh-ins', () => {
    const series = goalProgressSeries({
      today: '2026-11-03',
      targetOn: '2026-12-31',
      goal: 'elite_super_middle_boxer',
      sex: 'male',
      weight: [
        { day: '2026-10-20', kg: 86 },
        { day: '2026-09-02', kg: 90 },
        { day: '2026-11-03', kg: 84.2 },
        { day: '2026-09-18', kg: 88.4 },
        { day: '2026-10-04', kg: 87.1 },
        { day: '2026-09-02', kg: 89.6 },
      ],
      vo2: [
        { day: '2026-10-15', value: 44 },
        { day: '2026-09-10', value: 41.5 },
        { day: '2026-11-01', value: 45.2 },
      ],
      weightTargetKg: 76.2,
      weightStartKg: 89.6,
    });
    expect(series.weightActual.map((point) => point.day)).toEqual([
      '2026-09-02',
      '2026-09-18',
      '2026-10-04',
      '2026-10-20',
      '2026-11-03',
    ]);
    expect(series.weightActual[0]?.value).toBe(89.6);
    expect(series.weightActual.at(-1)?.value).toBe(84.2);
    expect(series.vo2Actual.map((point) => point.day)).toEqual(['2026-09-10', '2026-10-15', '2026-11-01']);
    const days = series.weightPath?.map((point) => point.day) ?? [];
    expect(days).toEqual([...days].sort());
    const xFor = (day: string) => Date.parse(`${day}T00:00:00Z`);
    const yFor = (value: number) => value;
    const weightPath = progressLinePath(
      [series.weightActual[3], series.weightActual[0], series.weightActual[4], series.weightActual[1], series.weightActual[2]].filter((point) => point != null),
      xFor,
      yFor,
    );
    const vo2Path = progressLinePath([...series.vo2Actual].reverse(), xFor, yFor);
    const dashed = progressLinePath(series.weightPath ?? [], xFor, yFor);
    for (const path of [weightPath, vo2Path, dashed]) {
      expect(path.startsWith('M ')).toBe(true);
      expect(path.split(' M ').length).toBe(1);
    }
    expect(weightPath.match(/ C /g)?.length).toBe(series.weightActual.length - 1);
    expect(vo2Path.match(/ C /g)?.length).toBe(series.vo2Actual.length - 1);
    expect(dashed.match(/ C /g)?.length).toBe((series.weightPath?.length ?? 1) - 1);
    expect(weightPath.startsWith(`M ${xFor('2026-09-02')} 89.6`)).toBe(true);
    expect(weightPath.endsWith(`${xFor('2026-11-03')} 84.2`)).toBe(true);
    expect(vo2Path.startsWith(`M ${xFor('2026-09-10')} 41.5`)).toBe(true);
    const chart = readFileSync('src/ui/DailyTargets.tsx', 'utf8');
    expect(chart.match(/progressLinePath\(/g)?.length).toBe(2);
    expect(chart).toContain('No VO2 max readings yet');
    expect(chart).toContain('Take a Time Stamped Photo to track Progress Visually');
    expect(chart).not.toContain('SeriesLine');
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
    expect(readFileSync('src/ui/DailyTargets.tsx', 'utf8')).toContain('Take a Time Stamped Photo to track Progress Visually');
    expect(readFileSync('src/ui/DailyTargets.tsx', 'utf8')).toContain('not sent to Thumos');
    expect(readFileSync('supabase/functions/account-delete/index.ts', 'utf8')).toContain('goal-progress-photos');
    expect(readFileSync('src/domain/sharedPhotos.ts', 'utf8')).toContain('NSCameraUsageDescription'.replace('NSCameraUsageDescription', 'progress photo'));
  });

  it('signs a goal progress photo from the object path inside the bucket', () => {
    const objectPath = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg';
    expect(goalProgressObjectPath(objectPath)).toBe(objectPath);
    expect(goalProgressObjectPath(`/${GOAL_PROGRESS_BUCKET}/${objectPath}`)).toBe(objectPath);
    expect(goalProgressObjectPath('../secret.jpg')).toBeNull();
    expect(goalProgressObjectPath(`${GOAL_PROGRESS_BUCKET}/../secret.jpg`)).toBeNull();
    expect(signedStorageRef(goalProgressSignStub(objectPath))).toEqual({ bucket: GOAL_PROGRESS_BUCKET, path: objectPath });
    const signed = new Map([[objectPath, 'https://signed.example/progress.jpg']]);
    expect(withGoalProgressPreviews([{ storagePath: `${GOAL_PROGRESS_BUCKET}/${objectPath}`, previewUrl: null }], signed)[0]?.previewUrl).toBe('https://signed.example/progress.jpg');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const load = repo.slice(repo.indexOf('loadGoalProgressPhotos'), repo.indexOf('async addGoalProgressPhoto'));
    expect(load).toContain('GOAL_PROGRESS_BUCKET');
    expect(load).toContain('createSignedUrls');
    expect(load).toContain('goalProgressObjectPath');
    expect(load).toContain('GOAL_PROGRESS_SIGNED_URL_SECONDS');
    expect(repo).toContain('bucket === GOAL_PROGRESS_BUCKET');
    const screen = readFileSync('src/ui/DailyTargets.tsx', 'utf8');
    expect(screen).toContain('ActivityIndicator');
    expect(screen).toContain('accessibilityLabel="Loading photo"');
    expect(screen).toContain('VO2 max: not logged');
    expect(screen).toContain('`VO2 max ${formatAxisNumber(vo2Here)} ml/kg/min`');
    expect(screen).toContain('PHOTO_RETRY');
    expect(screen).toContain('goalProgressSignStub');
    expect(screen).toContain('width: box');
    expect(screen.match(/<T>\{stamp\}<\/T>/g)?.length).toBe(1);
  });
});
