import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { soberMilestoneRing } from './distance';
import { defaultNutritionSettings, type FoodItem, type FoodLog } from './nutrition';
import { APP_SECTIONS, TAB_SECTIONS } from './sections';
import { buildStatsOverview, type StatsOverviewInput } from './statsOverview';
import { statsToneColors } from '@/ui/statsPalette';

function food(partial: Partial<FoodItem> & Pick<FoodItem, 'name'>): FoodItem {
  return {
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    sugarG: 0,
    fibreG: 0,
    unsaturatedG: 0,
    saturatedG: 0,
    transG: 0,
    sodiumMg: 0,
    processed: false,
    ...partial,
  };
}

function log(day: string, items: FoodItem[]): FoodLog {
  return {
    id: day,
    userId: 'user',
    eatenOn: day,
    meal: 'lunch',
    source: 'manual',
    note: '',
    items,
    estimated: false,
    eatenAt: null,
    portion: 1,
    createdAt: `${day}T12:00:00.000Z`,
    previewUrl: null,
  };
}

function input(patch: Partial<StatsOverviewInput> = {}): StatsOverviewInput {
  return {
    now: new Date(2026, 9, 14, 17, 41),
    stage: 'stopped',
    sobrietyStartedAt: '2026-08-01T00:00:00.000Z',
    plannedQuitAt: null,
    drinkFreeOn: [],
    drinkFreeDaysGoal: null,
    checkIns: [],
    health: [],
    heightCm: 178,
    nutrition: defaultNutritionSettings(),
    foodLogs: [],
    waterDays: [],
    bodyComposition: [],
    gratitude: [],
    ...patch,
  };
}

function byId(tiles: ReturnType<typeof buildStatsOverview>, id: string) {
  const tile = tiles.find((item) => item.id === id);
  if (!tile) throw new Error(`missing ${id}`);
  return tile;
}

function channel(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const linear = [red, green, blue].map((part) => {
    const share = part / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(ink: string, bg: string): number {
  const lighter = Math.max(channel(ink), channel(bg));
  const darker = Math.min(channel(ink), channel(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('stats overview', () => {
  it('keeps a plain line and a word for every tile, and does not add a tab', () => {
    const tiles = buildStatsOverview(input());
    expect(tiles.map((tile) => tile.id)).toEqual([
      'sober', 'mood', 'craving', 'check-ins', 'weight', 'body', 'calories', 'protein', 'quality', 'water', 'gratitude',
    ]);
    for (const tile of tiles) {
      expect(tile.meaning.length).toBeGreaterThan(0);
      expect(tile.signal.length).toBeGreaterThan(0);
      expect(tile.href).toMatch(/section=/);
    }
    expect(TAB_SECTIONS).toHaveLength(6);
    expect(APP_SECTIONS.find((section) => section.href === '/stats')?.tab).toBeUndefined();
    expect(APP_SECTIONS.map((section) => section.label)).toContain('Stats');
  });

  it('says slightly above for a small calorie overrun and does not use red', () => {
    const day = '2026-10-14';
    const tiles = buildStatsOverview(input({
      nutrition: { ...defaultNutritionSettings(), kcalTarget: 2000, proteinTarget: 160 },
      foodLogs: [log(day, [food({ name: 'Lunch', kcal: 2100, proteinG: 40, processed: true }), food({ name: 'Cake', kcal: 0, proteinG: 0, processed: true })])],
    }));
    const calories = byId(tiles, 'calories');
    expect(calories.meaning).toBe('Slightly above your target');
    expect(calories.tone).toBe('watch');
    expect(calories.signal).toBe('Watch');
    expect(calories.tone).not.toBe('attention');
    expect(calories.chart).toMatchObject({ kind: 'ring', status: '100 kcal over', fill: 1 });
    expect(byId(tiles, 'protein').meaning).toBe('Early days');
    expect(byId(tiles, 'protein').signal).toBe('Early days');
    expect(byId(tiles, 'protein').chart).toMatchObject({ kind: 'ring', status: '120 g left' });
    expect(byId(tiles, 'protein').tone).not.toBe('attention');
    expect(byId(tiles, 'quality').chart.kind).toBe('bars');
    expect(byId(tiles, 'quality').tone).toBe('watch');
    expect(byId(tiles, 'quality').value).toBe('0 whole · 2 processed');
    expect(byId(tiles, 'quality').periodLine).toBe('Last 7 days');
    expect(byId(tiles, 'quality').processedNotes).toHaveLength(2);
    expect(byId(tiles, 'quality').meaning).toBe('2 items look highly processed');
    expect(byId(tiles, 'quality').href).toBe('/nutrition?section=quality');
  });

  it('calls body fat within the healthy range and uses attention only under the BMI floor', () => {
    const onTrack = buildStatsOverview(input({
      bodyComposition: [{
        id: '1',
        recordedOn: '2026-10-14',
        bodyFatPct: 15,
        leanMassKg: 63,
        waistCm: 84,
        source: 'dexa',
        createdAt: '2026-10-14T12:00:00.000Z',
      }],
    }));
    expect(byId(onTrack, 'body')).toMatchObject({
      title: 'Body fat',
      value: '15%',
      meaning: 'Within healthy range',
      tone: 'good',
      signal: 'On track',
    });
    expect(byId(onTrack, 'body').chart).toMatchObject({ kind: 'range', status: 'Within healthy range' });

    const low = buildStatsOverview(input({
      health: [
        { kind: 'weight_kg', value: 50, recordedOn: '2026-10-01' },
        { kind: 'weight_kg', value: 50, recordedOn: '2026-10-14' },
      ],
      heightCm: 175,
      nutrition: { ...defaultNutritionSettings(), build: 'muscular' },
    }));
    expect(byId(low, 'body').tone).toBe('attention');
    expect(byId(low, 'body').signal).toBe('Needs attention');
    expect(byId(low, 'body').meaning).toBe('Below the healthy range');

    const highCraving = buildStatsOverview(input({
      checkIns: [{ mood: 4, craving: 8, createdAt: '2026-10-14T09:00:00.000Z' }],
    }));
    expect(byId(highCraving, 'craving').meaning).toBe('High just now');
    expect(byId(highCraving, 'craving').tone).toBe('watch');
  });

  it('reads waist-to-height when body fat is absent', () => {
    const tiles = buildStatsOverview(input({
      heightCm: 178,
      bodyComposition: [{
        id: '1',
        recordedOn: '2026-10-14',
        bodyFatPct: null,
        leanMassKg: null,
        waistCm: 84,
        source: 'other',
        createdAt: '2026-10-14T12:00:00.000Z',
      }],
    }));
    const body = byId(tiles, 'body');
    expect(body.title).toBe('Waist to height');
    expect(body.value).toBe('0.47');
    expect(body.tone).toBe('good');
    expect(body.href).toBe('/weight-waist?section=body');
    expect(body.meaning).toBe('Within healthy range');
    expect(body.chart).toMatchObject({ kind: 'range', status: 'Within healthy range' });
  });

  it('keeps the scales from judging a training goal, and tracks lean mass for a body builder', () => {
    const weights = [
      { kind: 'weight_kg', value: 80, recordedOn: '2026-10-01' },
      { kind: 'weight_kg', value: 79, recordedOn: '2026-10-14' },
    ];
    const runner = buildStatsOverview(input({
      health: weights,
      nutrition: { ...defaultNutritionSettings(), goal: 'elite_runner' },
    }));
    expect(byId(runner, 'weight').meaning).toBe('Body fat and training matter more than a small change');
    expect(byId(runner, 'weight').tone).toBe('info');
    const heavy = buildStatsOverview(input({
      health: weights,
      nutrition: { ...defaultNutritionSettings(), goal: 'elite_heavy_boxer' },
    }));
    expect(byId(heavy, 'weight').meaning).toBe('Size and power matter more than a small change');
    expect(byId(heavy, 'weight').tone).toBe('info');
    const boxer = buildStatsOverview(input({
      health: weights,
      nutrition: { ...defaultNutritionSettings(), goal: 'elite_middle_boxer' },
    }));
    expect(byId(boxer, 'weight').meaning).toBe('A middleweight limit is not a race on this screen');
    const cruiser = buildStatsOverview(input({
      health: weights,
      nutrition: { ...defaultNutritionSettings(), goal: 'elite_cruiser_boxer' },
    }));
    expect(byId(cruiser, 'weight').meaning).toBe('A cruiserweight limit is not a race on this screen');
    const builder = buildStatsOverview(input({
      health: weights,
      nutrition: { ...defaultNutritionSettings(), goal: 'body_builder' },
      bodyComposition: [{
        id: '1',
        recordedOn: '2026-09-01',
        bodyFatPct: 18,
        leanMassKg: 62,
        waistCm: null,
        source: 'dexa',
        createdAt: '2026-09-01T00:00:00.000Z',
      }, {
        id: '2',
        recordedOn: '2026-10-14',
        bodyFatPct: 16,
        leanMassKg: 63.4,
        waistCm: null,
        source: 'dexa',
        createdAt: '2026-10-14T00:00:00.000Z',
      }],
    }));
    expect(byId(builder, 'weight').meaning).toBe('Body fat and lean mass matter more than the scales');
    expect(byId(builder, 'lean')).toMatchObject({
      title: 'Lean mass',
      value: '63.4 kg',
      meaning: 'Higher than the earlier reading',
      tone: 'good',
      href: '/weight-waist?section=body',
    });
    expect(byId(builder, 'lean').chart.kind).toBe('line');
  });

  it('measures sober days, water, and gratitude against the next mark', () => {
    const now = new Date(2026, 9, 14, 17, 41);
    const tiles = buildStatsOverview(input({
      now,
      waterDays: [{ day: '2026-10-14', waterMl: 350 }],
      gratitude: [
        { entryDate: '2026-10-14' },
        { entryDate: '2026-10-13' },
        { entryDate: '2026-10-12' },
      ],
      health: [
        { kind: 'weight_kg', value: 80, recordedOn: '2026-10-01' },
        { kind: 'weight_kg', value: 79, recordedOn: '2026-10-14' },
      ],
      checkIns: [{ mood: 7, craving: 2, createdAt: '2026-10-14T09:00:00.000Z' }],
    }));
    expect(byId(tiles, 'sober').chart).toEqual({
      kind: 'ring',
      ...soberMilestoneRing(new Date('2026-08-01T00:00:00.000Z'), now),
    });
    expect(byId(tiles, 'water').chart).toMatchObject({ kind: 'ring', status: '1,650 ml left' });
    expect(byId(tiles, 'gratitude').chart).toMatchObject({ kind: 'ring', centre: '3', status: '4 lines to go' });
    expect(byId(tiles, 'mood').chart.kind).toBe('line');
    expect(byId(tiles, 'check-ins').chart.kind).toBe('bars');
    expect(byId(tiles, 'weight').chart.kind).toBe('line');
    expect(byId(tiles, 'calories').href).toBe('/nutrition?section=today');
    expect(byId(tiles, 'body').href).toBe('/weight-waist?section=body');
  });

  it('keeps the stats colours readable and off the rest of the app', () => {
    for (const scheme of ['light', 'dark'] as const) {
      for (const tone of Object.values(statsToneColors(scheme))) {
        expect(contrast(tone.ink, tone.bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
    const screen = readFileSync('src/app/(main)/stats.tsx', 'utf8');
    const tile = readFileSync('src/ui/StatTile.tsx', 'utf8');
    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    const you = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    expect(screen).toContain('statsToneColors');
    expect(screen).not.toContain('tab: true');
    expect(tile).toContain('tile.signal');
    expect(tile).toContain('<ToneMark');
    expect(tile).toContain('router.push(tile.href');
    expect(tile).toContain('<ProgressRing');
    expect(tile).toContain('<CompareBars');
    expect(tile).toContain('<TrendLine');
    expect(tile).toContain('<RangeTrack');
    expect(home).toContain("router.push('/stats'");
    expect(you).toContain("router.push('/stats'");
    expect(readFileSync('src/app/(main)/_layout.tsx', 'utf8')).toContain('TAB_SECTIONS');
    expect(readFileSync('src/app/(main)/weight-waist.tsx', 'utf8')).toContain('id="body"');
    expect(readFileSync('src/app/(main)/nutrition.tsx', 'utf8')).not.toContain('id="body"');
    expect(readFileSync('src/app/(main)/check-in.tsx', 'utf8')).toContain('id="craving"');
    expect(readFileSync('src/ui/theme.tsx', 'utf8')).toContain('statsPalette.ts');
    expect(home).toContain('tone="sos"');
    expect(readFileSync('src/app/(main)/_layout.tsx', 'utf8')).toContain('dangerFill');
  });
});
