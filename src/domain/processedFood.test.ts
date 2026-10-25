import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  PROCESSED_LIST_FOLD,
  defaultNutritionSettings,
  processedFoodCopy,
  processedFoodHeading,
  processedFoodNotes,
  processedSeeLabel,
  type FoodItem,
  type FoodLog,
} from './nutrition';
import { buildStatsOverview } from './statsOverview';

function item(partial: Partial<FoodItem> & Pick<FoodItem, 'name' | 'processed'>): FoodItem {
  return {
    kcal: 100,
    proteinG: 2,
    carbsG: 10,
    sugarG: 1,
    fibreG: 1,
    unsaturatedG: 1,
    saturatedG: 1,
    transG: 0,
    sodiumMg: 20,
    ...partial,
  };
}

function log(partial: Partial<FoodLog> & Pick<FoodLog, 'id' | 'eatenOn' | 'meal' | 'items'>): FoodLog {
  return {
    userId: 'alex',
    source: 'manual',
    note: '',
    estimated: false,
    eatenAt: null,
    portion: 1,
    createdAt: `${partial.eatenOn}T12:00:00.000Z`,
    previewUrl: null,
    ...partial,
  };
}

describe('highly processed foods', () => {
  it('lists the same foods the count uses, newest first, with a meal, date, reason and swap', () => {
    const logs = [
      log({
        id: 'older',
        eatenOn: '2026-10-18',
        meal: 'snack',
        createdAt: '2026-10-18T15:00:00.000Z',
        items: [item({ name: 'Crisps', processed: true }), item({ name: 'Apple', processed: false })],
      }),
      log({
        id: 'newer',
        eatenOn: '2026-10-20',
        meal: 'lunch',
        eatenAt: '2026-10-20T12:30:00.000Z',
        createdAt: '2026-10-20T12:40:00.000Z',
        items: [item({ name: 'Shop pie', processed: true })],
      }),
      log({
        id: 'outside',
        eatenOn: '2026-10-01',
        meal: 'dinner',
        items: [item({ name: 'Biscuits', processed: true })],
      }),
    ];
    const notes = processedFoodNotes(logs, ['2026-10-18', '2026-10-19', '2026-10-20']);
    const counted = logs
      .filter((row) => row.eatenOn >= '2026-10-18')
      .flatMap((row) => row.items)
      .filter((food) => food.processed);
    expect(notes).toHaveLength(counted.length);
    expect(notes.map((note) => note.name)).toEqual(['Shop pie', 'Crisps']);
    expect(notes[0]).toMatchObject({
      meal: 'Lunch',
      day: '2026-10-20',
      date: '20 Oct 2026',
      reason: 'This was logged as highly processed.',
      suggestion: 'A whole food such as fruit, eggs, or plain meat instead.',
    });
    expect(notes[1]).toMatchObject({
      meal: 'Snack',
      date: '18 Oct 2026',
      reason: 'Crisps are a packaged snack made in a factory.',
      suggestion: 'A piece of fruit or a handful of nuts instead.',
    });
    expect(notes[0]?.suggestion.split('\n')).toHaveLength(1);
    expect(processedFoodCopy('Biscuits').reason).toContain('factory-made');
    expect(processedFoodHeading(65, 6)).toBe('65 whole · 6 processed');
    expect(processedSeeLabel(6)).toBe('See the 6 items ›');
    expect(processedSeeLabel(1)).toBe('See the 1 item ›');
    expect(`${notes.map((note) => `${note.reason} ${note.suggestion}`).join(' ')}`).not.toMatch(/this goal|your goal/i);
  });

  it('keeps the food quality tile count equal to the list, and shows that list from More info', () => {
    const tiles = buildStatsOverview({
      now: new Date(2026, 9, 20, 12),
      period: '7',
      stage: 'stopped',
      sobrietyStartedAt: '2026-08-01T00:00:00.000Z',
      plannedQuitAt: null,
      drinkFreeOn: [],
      drinkFreeDaysGoal: null,
      checkIns: [],
      health: [],
      heightCm: 178,
      nutrition: defaultNutritionSettings(),
      foodLogs: [
        log({ id: 'a', eatenOn: '2026-10-20', meal: 'breakfast', items: [item({ name: 'Egg', processed: false })] }),
        log({ id: 'b', eatenOn: '2026-10-19', meal: 'snack', items: [item({ name: 'Chocolate', processed: true }), item({ name: 'Crisps', processed: true })] }),
      ],
      waterDays: [],
      bodyComposition: [],
      gratitude: [],
    });
    const quality = tiles.find((tile) => tile.id === 'quality');
    expect(quality?.value).toBe('1 whole · 2 processed');
    expect(quality?.periodLine).toBe('Last 7 days');
    expect(quality?.processedNotes?.map((note) => note.name)).toEqual(['Chocolate', 'Crisps']);
    expect(quality?.chart.kind === 'bars' ? quality.chart.bars.map((bar) => bar.value) : []).toEqual([1, 2]);

    const tile = readFileSync('src/ui/StatTile.tsx', 'utf8');
    const list = readFileSync('src/ui/ProcessedFoodList.tsx', 'utf8');
    const charts = readFileSync('src/ui/NutritionCharts.tsx', 'utf8');
    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    expect(tile).toContain('<ProcessedFoodList notes={tile.processedNotes ?? []} />');
    expect(tile).toContain('tile.periodLine');
    expect(tile).toContain('router.push(tile.href');
    expect(list).toContain('processedSeeLabel');
    expect(list).toContain('MoreInfoButton');
    expect(list).toContain("open ? 'Less info' : 'More info'");
    expect(list).not.toContain('<T variant="muted">More info</T>');
    expect(list).toContain('PROCESSED_LIST_FOLD');
    expect(list).toContain('note.meal');
    expect(list).toContain('note.date');
    expect(list).toContain('note.reason');
    expect(list).toContain('note.suggestion');
    expect(list).toContain('useState(false)');
    expect(list).not.toMatch(/scrollTo|scrollIntoView|statsTone|danger/);
    expect(charts).toContain('id="quality"');
    expect(charts).toContain('processedFoodNotes');
    expect(charts).toContain('<ProcessedFoodList notes={picture.quality.notes} cue="more" />');
    expect(screen).toContain('cue="more"');
    expect(screen).toContain('processedFoodNotes');
    expect(PROCESSED_LIST_FOLD).toBe(5);
  });
});
