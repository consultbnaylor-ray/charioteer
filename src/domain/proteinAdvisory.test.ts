import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mealImprovements } from '../../supabase/functions/_shared/statsAnalysis.ts';
import {
  MEAL_ESTIMATE_PROMPT,
  NUTRITION_PROMPT_LINE,
  PROTEIN_NO_UPPER_LIMIT,
  PROTEIN_OVER_CALORIES,
  PROTEIN_WITHOUT_CALORIES,
  estimateFromText,
  foodFigureKind,
  foodFigureNote,
  nutritionContextLines,
  powderReadingNote,
  proteinIntakeAdvisory,
  defaultNutritionSettings,
  type FoodItem,
  type FoodLog,
  type ProteinDay,
} from './nutrition';
import { THUMOS_BIA_PROTEIN_SHORT, THUMOS_PROTEIN_SHORT } from './thumosReading';

const BANNED = /\b(danger|dangerous|toxic|unsafe|warning)\b/i;
const REASSURANCE = /\b(this is safe|you are safe|safe for you|amount is safe)\b/i;

function day(partial: Partial<ProteinDay> & Pick<ProteinDay, 'day' | 'proteinG'>): ProteinDay {
  return { estimated: true, uncertain: false, ...partial };
}

function item(partial: Partial<FoodItem> & Pick<FoodItem, 'name' | 'kcal' | 'proteinG'>): FoodItem {
  return {
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

function log(partial: Partial<FoodLog> & Pick<FoodLog, 'eatenOn' | 'items'>): FoodLog {
  return {
    id: partial.eatenOn,
    userId: 'user',
    meal: 'snack',
    source: 'text',
    note: '',
    estimated: true,
    eatenAt: null,
    portion: 1,
    createdAt: partial.eatenOn,
    previewUrl: null,
    ...partial,
  };
}

describe('protein intake review', () => {
  const weights = [{ day: '2026-11-06', kg: 84 }];
  const target = 184;

  it('does not invent a danger line, and does not call a lower day safe', () => {
    const several = proteinIntakeAdvisory({
      today: '2026-11-07',
      days: [
        day({ day: '2026-11-04', proteinG: 273 }),
        day({ day: '2026-11-05', proteinG: 244 }),
        day({ day: '2026-11-06', proteinG: 209 }),
      ],
      weights,
      proteinTarget: target,
      age: 40,
    });
    const atTarget = proteinIntakeAdvisory({
      today: '2026-11-07',
      days: [day({ day: '2026-11-07', proteinG: 184, estimated: false })],
      weights,
      proteinTarget: target,
      age: 40,
    });
    const text = [several.standing, several.review, atTarget.standing, atTarget.review, PROTEIN_NO_UPPER_LIMIT].join('\n');
    expect(several.kind).toBe('several-days');
    expect(several.review).toMatch(/no established safe upper limit/i);
    expect(several.review).toContain('6 Nov 2026');
    expect(several.review).toContain('estimate');
    expect(several.review).not.toMatch(/\b2\.3\b/);
    expect(atTarget.kind).toBe('none');
    expect(atTarget.review).toBeNull();
    expect(text).toMatch(/no established safe upper limit/i);
    expect(text).toMatch(/not a safety clearance|not a safety limit/);
    expect(text).not.toMatch(BANNED);
    expect(text).not.toMatch(REASSURANCE);
  });

  it('uses a softer note for one high day, and skips a stale or missing weight', () => {
    const one = proteinIntakeAdvisory({
      today: '2026-11-07',
      days: [
        day({ day: '2026-11-05', proteinG: 150, estimated: false }),
        day({ day: '2026-11-06', proteinG: 209 }),
      ],
      weights,
      proteinTarget: target,
      age: null,
    });
    expect(one.kind).toBe('one-day');
    expect(one.review).toContain('One day is not a pattern');
    const stale = proteinIntakeAdvisory({
      today: '2026-11-07',
      days: [day({ day: '2026-11-06', proteinG: 244 })],
      weights: [{ day: '2026-09-01', kg: 84 }],
      proteinTarget: target,
      age: 40,
    });
    expect(stale.kind).toBe('needs-weight');
    expect(stale.review).toContain('too old');
    expect(stale.review).not.toMatch(/g per kg/);
    const missing = proteinIntakeAdvisory({
      today: '2026-11-07',
      days: [day({ day: '2026-11-06', proteinG: 244 })],
      weights: [],
      proteinTarget: target,
      age: 40,
    });
    expect(missing.kind).toBe('needs-weight');
    expect(missing.review).toContain('measured weight');
    expect(missing.review).not.toMatch(/\b\d+(\.\d+)? g per kg\b/);
    const child = proteinIntakeAdvisory({
      today: '2026-11-07',
      days: [day({ day: '2026-11-06', proteinG: 244 })],
      weights,
      proteinTarget: target,
      age: 16,
    });
    expect(child.kind).toBe('adults-only');
    expect(child.review).toContain('not used here');
    expect(child.review).not.toMatch(/g per kg, using/);
  });

  it('keeps impossible figures as entered and does not treat unknown calories as a contradiction', () => {
    const shake = item({ name: 'Protein shake', kcal: 120, proteinG: 45 });
    const before = { ...shake };
    expect(foodFigureKind(shake)).toBe('protein-over-calories');
    expect(foodFigureNote(shake)).toBe(PROTEIN_OVER_CALORIES);
    expect(shake).toEqual(before);
    expect(foodFigureKind(item({ name: '65g protein shake', kcal: 239, proteinG: 65 }))).toBe('protein-over-calories');
    expect(foodFigureKind(item({ name: 'Protein', kcal: 0, proteinG: 30 }))).toBe('protein-without-calories');
    expect(foodFigureNote(item({ name: 'Protein', kcal: 0, proteinG: 30 }))).toBe(PROTEIN_WITHOUT_CALORIES);
    expect(foodFigureKind(item({ name: 'Chicken', kcal: 165, proteinG: 31 }))).toBe('ok');
    expect(foodFigureNote(item({ name: 'Chicken', kcal: 165, proteinG: 31 }))).toBeNull();
  });

  it('does not turn powder grams or scoops into protein, and keeps a stated protein amount', () => {
    const powder = estimateFromText('65g protein shake');
    expect(powder).toHaveLength(1);
    expect(powder[0]?.proteinG).toBe(0);
    expect(powder[0]?.name).toContain('65g protein shake');
    expect(powderReadingNote('65g protein shake')).toMatch(/not protein grams/i);
    const scoops = estimateFromText('three scoops');
    expect(scoops[0]?.proteinG).toBe(0);
    expect(scoops[0]?.proteinG).not.toBe(30);
    const stated = estimateFromText('3 scoops, 30g protein');
    expect(stated).toHaveLength(1);
    expect(stated[0]?.proteinG).toBe(30);
    expect(stated[0]?.kcal).toBe(0);
    expect(stated[0]?.known).toEqual(['proteinG']);
    expect(powderReadingNote('3 scoops, 30g protein')).toBeNull();
    expect(estimateFromText('2 eggs on toast').map((row) => row.name)).toEqual(['2 × Egg', 'Slice of toast']);
    expect(MEAL_ESTIMATE_PROMPT).toContain('is not protein grams');
    expect(MEAL_ESTIMATE_PROMPT).not.toContain('10 g');
  });

  it('tells the coach not to add a shake for a small gap, and reviews a sustained high week', () => {
    expect(THUMOS_PROTEIN_SHORT).not.toMatch(/another protein meal|close the gap/i);
    expect(THUMOS_PROTEIN_SHORT).toContain('not a reason for another shake');
    expect(THUMOS_BIA_PROTEIN_SHORT).toContain('not a reason for another shake');
    expect(NUTRITION_PROMPT_LINE).toContain('no established safe upper limit');
    expect(NUTRITION_PROMPT_LINE).toContain('Do not call a high intake dangerous');
    expect(NUTRITION_PROMPT_LINE).toContain('Do not suggest another shake');
    const slight = mealImprovements(
      [{ day: '2026-11-06', slot: 'Breakfast', name: 'Toast', kcal: 200, proteinG: 8, estimated: true }],
      { calorieTarget: 2200, proteinTargetG: 184, averageKcal: 2100, averageProteinG: 170 },
    );
    expect(slight.join(' ')).not.toMatch(/shake|eggs|yoghurt|chicken/i);
    const lines = nutritionContextLines({
      logs: [
        log({ eatenOn: '2026-11-04', items: [item({ name: 'Meals', kcal: 2200, proteinG: 273 })] }),
        log({ eatenOn: '2026-11-05', items: [item({ name: 'Meals', kcal: 2100, proteinG: 244 })] }),
        log({ eatenOn: '2026-11-06', items: [item({ name: 'Meals', kcal: 2000, proteinG: 209 })] }),
      ],
      settings: { ...defaultNutritionSettings(), goal: 'maintain', proteinTarget: 184, goalAge: 40 },
      waterMl: 0,
      checkIns: [],
      soberDays: null,
      unitsAvoided: 0,
      today: '2026-11-07',
      body: { weightKg: 84, heightCm: 180, weights },
    });
    const text = lines.join('\n');
    expect(text).toContain('Several recent days');
    expect(text).not.toMatch(BANNED);
    expect(text).not.toMatch(/jpeg|base64|postcode/i);
    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    expect(screen).toContain('proteinIntakeAdvisory');
    expect(screen).toContain('draftFigureNote');
    expect(screen).not.toContain('dangerous');
  });
});
