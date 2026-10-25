import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildHealthStatBoard, narrowHealthStatBoard } from '@/domain/healthStatTiles';
import { buildHealthInsights } from '@/domain/healthInsights';
import {
  healthStatsOmittedTiles,
  hideWeightHealthRows,
  SHOW_WEIGHT_SECTION,
  WEIGHT_SECTION_HEALTH_TYPES,
  WEIGHT_SECTION_TILE_IDS,
  withoutWeightSamples,
} from '@/domain/weightSection';
import { BODY_ENTRY_SOURCES, BODY_SOURCE_LABEL } from '@/domain/nutrition';
import { APPLE_HEALTH_INTRO, APPLE_HEALTH_READ_TYPES, APPLE_HEALTH_SHARE } from '@/health/connection';

const today = '2026-10-17';

describe('Health Stats weight section', () => {
  it('parks the body cards behind one flag and leaves the data path in place', () => {
    expect(SHOW_WEIGHT_SECTION).toBe(false);
    expect(healthStatsOmittedTiles()).toEqual([...WEIGHT_SECTION_TILE_IDS]);
    expect(WEIGHT_SECTION_TILE_IDS).toEqual(['weight_kg', 'body_fat', 'waist', 'lean_mass']);

    const samples = [
      { kind: 'weight_kg', value: 74 },
      { kind: 'steps', value: 8000 },
    ];
    expect(withoutWeightSamples(samples)).toEqual([{ kind: 'steps', value: 8000 }]);
    expect(withoutWeightSamples([{ kind: 'steps', value: 1 }])).toEqual([{ kind: 'steps', value: 1 }]);

    const rows = [
      { type: 'HKQuantityTypeIdentifierBodyMass', title: 'Weight' },
      { type: 'HKQuantityTypeIdentifierBodyFatPercentage', title: 'Body fat' },
      { type: 'HKQuantityTypeIdentifierLeanBodyMass', title: 'Lean mass' },
      { type: 'HKQuantityTypeIdentifierHeight', title: 'Height' },
      { type: 'HKQuantityTypeIdentifierStepCount', title: 'Steps' },
    ];
    expect(hideWeightHealthRows(rows).map((row) => row.title)).toEqual(['Height', 'Steps']);
    expect(WEIGHT_SECTION_HEALTH_TYPES).toEqual([
      'HKQuantityTypeIdentifierBodyMass',
      'HKQuantityTypeIdentifierBodyFatPercentage',
      'HKQuantityTypeIdentifierLeanBodyMass',
    ]);

    const board = narrowHealthStatBoard(
      buildHealthStatBoard({
        today,
        samples: [
          { kind: 'steps', value: 9100, recordedOn: today },
          { kind: 'weight_kg', value: 74.2, recordedOn: today },
        ],
        body: [{ recordedOn: today, bodyFatPct: 15, leanMassKg: 63, waistCm: 84 }],
        activityEnergyKcal: null,
        heightCm: 178,
        adult: true,
        goalAge: 42,
        goalSex: 'male',
        goal: null,
        build: null,
      }),
      { omit: healthStatsOmittedTiles() },
    );
    expect(board.sections.map((section) => section.id)).not.toContain('body');
    expect(board.sections.map((section) => section.title)).not.toContain('Body');
    const ids = board.sections.flatMap((section) => section.tiles.map((tile) => tile.id));
    expect(ids).toEqual(expect.arrayContaining(['steps']));
    expect(ids).not.toEqual(expect.arrayContaining([...WEIGHT_SECTION_TILE_IDS]));
    expect(board.gaps.map((gap) => gap.id)).not.toEqual(expect.arrayContaining([...WEIGHT_SECTION_TILE_IDS]));
    expect(board.missingLine ?? '').not.toMatch(/Weight|Body fat|Waist|Lean mass/);

    const week = buildHealthInsights({
      today,
      soberOn: null,
      samples: withoutWeightSamples([
        { kind: 'weight_kg', value: 80, unit: 'kg', recordedOn: '2026-07-01', source: 'manual' },
        { kind: 'weight_kg', value: 74, unit: 'kg', recordedOn: '2026-10-11', source: 'manual' },
        { kind: 'steps', value: 8000, unit: 'count', recordedOn: today, source: 'manual' },
      ]),
    });
    expect(week.headlines.join(' ')).not.toMatch(/[Ww]eight/);
    const weightKind = week.kinds.find((kind) => kind.kind === 'weight_kg');
    expect(weightKind?.lines ?? []).toEqual([]);
    expect(weightKind?.flags ?? []).toEqual([]);
    expect(BODY_ENTRY_SOURCES.map((id) => BODY_SOURCE_LABEL[id])).toEqual(['Smart scale', 'Gym scan', 'DEXA', 'Other']);
  });

  it('hides the section on Health Stats and Today, and leaves Profile, the body page, and Apple Health reads', () => {
    const health = readFileSync('src/app/(main)/health.tsx', 'utf8');
    expect(health).toContain('omitTiles={healthStatsOmittedTiles()}');
    expect(health).toContain('gaps={hideWeightHealthRows(healthMissingReadings(visibility))}');
    expect(health).toContain('rows: hideWeightHealthRows(visibility.rows)');
    expect(health).toContain('SHOW_WEIGHT_SECTION ? <WeightWaistLink');
    expect(health).toContain('onSaveBody={SHOW_WEIGHT_SECTION ? saveBodyGap : undefined}');
    expect(health).toContain("router.replace('/weight-waist'");
    expect(health).toContain("omitKinds={['weight_kg']}");
    expect(health).toContain('async function saveBodyGap');

    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    expect(home).toContain('withoutWeightSamples(withPlannedMinutes');
    expect(home).toContain('>Health Stats<');

    const board = readFileSync('src/ui/HealthBoard.tsx', 'utf8');
    expect(board).toContain("kinds?.includes('weight_kg')");
    expect(board).toContain('withoutWeightSamples(samples)');
    expect(board).toContain('SHOW_WEIGHT_SECTION && report.headlines');

    const tiles = readFileSync('src/ui/HealthStatBoard.tsx', 'utf8');
    expect(tiles).toContain('SHOW_WEIGHT_SECTION && tileFaceMentionsWeight');
    expect(tiles).toContain('SHOW_WEIGHT_SECTION && tileMentionsWeight');
    expect(tiles).toContain('Save body reading');
    expect(tiles).toContain('BODY_ENTRY_SOURCES');
    expect(tiles).toContain('Body fat (%)');
    expect(tiles).toContain('Lean body mass (kg)');

    expect(readFileSync('src/ui/HealthVisibility.tsx', 'utf8')).toContain('SHOW_WEIGHT_SECTION && report?.kind');
    expect(readFileSync('src/app/(main)/profile.tsx', 'utf8')).toContain('<WeightWaistPanel');
    const sheet = readFileSync('src/app/(main)/weight-waist.tsx', 'utf8');
    expect(sheet).toContain('<BodyCompositionCard');
    expect(sheet).toContain("kinds={['weight_kg']}");
    expect(sheet).toContain("onlyTiles={['weight_kg', 'waist']}");
    expect(readFileSync('src/ui/BodyComposition.tsx', 'utf8')).toContain('label="Save body reading"');
    expect(readFileSync('src/domain/sections.ts', 'utf8')).toContain("label: 'Body: weight, waist and BMI'");

    for (const type of WEIGHT_SECTION_HEALTH_TYPES) {
      expect(APPLE_HEALTH_READ_TYPES).toContain(type);
    }
    expect(APPLE_HEALTH_READ_TYPES).toContain('HKQuantityTypeIdentifierHeight');
    expect(APPLE_HEALTH_SHARE).toContain('weight, height, body fat, lean body mass');
    expect(APPLE_HEALTH_INTRO).toContain('weight, and body readings');

    const app = readFileSync('app.json', 'utf8');
    expect(app).toContain('plus weight, height, body fat, lean body mass, active energy, and exercise minutes.');
    expect(app).toContain('It does not write steps, sleep, heart rate, workouts, or weight.');
    expect(app).toContain('Charioteer does not record audio. Voice is switched off in this version. Apple requires this note because an audio component is included in the app.');
    expect(app).toContain('Charioteer does not use Face ID. Apple requires this note because a component in the app can reference it.');
  });
});
