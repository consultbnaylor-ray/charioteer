import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

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
    expect(byId(tiles, 'protein').meaning).toBe('Short of your target so far');
    expect(byId(tiles, 'protein').tone).not.toBe('attention');
    expect(byId(tiles, 'quality').tone).toBe('watch');
    expect(byId(tiles, 'quality').meaning).toBe('2 items look highly processed');
  });

  it('calls body fat on track inside the band and uses red only under the BMI floor', () => {
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
    expect(byId(onTrack, 'body')).toMatchObject({ title: 'Body fat', value: '15%', meaning: 'On track', tone: 'good' });

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
    expect(body.href).toBe('/nutrition?section=body');
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
    expect(home).toContain("router.push('/stats'");
    expect(you).toContain("router.push('/stats'");
    expect(readFileSync('src/app/(main)/_layout.tsx', 'utf8')).toContain('TAB_SECTIONS');
    expect(readFileSync('src/app/(main)/nutrition.tsx', 'utf8')).toContain('id="body"');
    expect(readFileSync('src/app/(main)/check-in.tsx', 'utf8')).toContain('id="craving"');
    expect(readFileSync('src/ui/theme.tsx', 'utf8')).toContain('statsPalette.ts');
    expect(home).toContain('tone="sos"');
    expect(readFileSync('src/app/(main)/_layout.tsx', 'utf8')).toContain('dangerFill');
  });
});
