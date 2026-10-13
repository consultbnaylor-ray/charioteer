import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { APP_SECTIONS, TAB_SECTIONS } from './sections';
import {
  ESTIMATE_LABEL,
  FAT_SCIENCE,
  HIDE_CALORIES_LINE,
  NO_SHAME_OVER,
  SUGAR_CRAVING_NOTE,
  WAGON_PUBLIC_LINE,
  WAGON_SUPPORT,
  alcoholKcalSaved,
  alcoholSavedLine,
  caloriesShareLine,
  estimateFromText,
  fatBalance,
  mealStreakDays,
  nutritionContextLines,
  nutritionHealthQuantities,
  nutritionPatternLines,
  parseSharedNutrition,
  presentSharedNutrition,
  progressShareLine,
  samplePhotoMeal,
  sugarCravingNote,
  targetLine,
  defaultNutritionSettings,
  type FoodLog,
} from './nutrition';

function log(partial: Partial<FoodLog> & Pick<FoodLog, 'eatenOn' | 'meal'>): FoodLog {
  return {
    id: partial.id ?? '11111111-1111-4111-8111-111111111111',
    userId: 'user',
    source: 'text',
    note: '',
    items: [],
    estimated: true,
    createdAt: partial.eatenOn,
    previewUrl: null,
    ...partial,
  };
}

describe('meal estimates', () => {
  it('reads a short sentence and labels the result as an estimate', () => {
    const items = estimateFromText('2 eggs on toast');
    expect(items.map((item) => item.name)).toEqual(['2 × Egg', 'Slice of toast']);
    expect(items[0]?.kcal).toBe(156);
    expect(items[0]?.proteinG).toBe(12.8);
    expect(samplePhotoMeal().map((item) => item.name)).toEqual(['Chicken', 'Avocado']);
    expect(ESTIMATE_LABEL).toBe('Estimate');
  });

  it('keeps calories out of the quality view and does not shame a day over target', () => {
    expect(targetLine(2200, 2000, false)).toBe(NO_SHAME_OVER);
    expect(targetLine(2200, 2000, true)).toBeNull();
    expect(HIDE_CALORIES_LINE).toContain('food quality');
    expect(alcoholSavedLine(3, true)).toBeNull();
    expect(alcoholKcalSaved(3)).toBe(222);
    expect(alcoholSavedLine(3, false)).toContain('222 kcal');
  });

  it('treats unsaturated fat as the fat to lean on', () => {
    const balance = fatBalance([
      {
        name: 'Olive oil',
        kcal: 120,
        proteinG: 0,
        carbsG: 0,
        sugarG: 0,
        fibreG: 0,
        unsaturatedG: 11,
        saturatedG: 2,
        transG: 0,
        sodiumMg: 0,
        processed: false,
      },
    ]);
    expect(balance.line).toContain('unsaturated');
    expect(FAT_SCIENCE).toContain('olive oil');
    expect(FAT_SCIENCE).toContain('Trans fats');
  });

  it('notes sugar cravings only in the early weeks', () => {
    expect(sugarCravingNote(47)).toBe(SUGAR_CRAVING_NOTE);
    expect(sugarCravingNote(91)).toBeNull();
    expect(SUGAR_CRAVING_NOTE).toContain('not medical advice');
  });

  it('spots more snacks after short sleep or a low mood, without using kcal', () => {
    const lines = nutritionPatternLines(
      [
        log({ eatenOn: '2026-10-11', meal: 'snack' }),
        log({ eatenOn: '2026-10-12', meal: 'breakfast' }),
      ],
      [
        { createdAt: '2026-10-11T20:00:00.000Z', mood: 3, sleepHours: 5 },
        { createdAt: '2026-10-12T20:00:00.000Z', mood: 8, sleepHours: 7.5 },
      ],
    );
    expect(lines.join(' ')).toContain('under 6 hours');
    expect(lines.join(' ')).toContain('Lower-mood');
    expect(lines.join(' ')).not.toContain('kcal');
  });

  it('hides kcal from Thumos and treats the wagon flag as a safety moment', () => {
    const hidden = nutritionContextLines({
      logs: [log({
        eatenOn: '2026-10-13',
        meal: 'lunch',
        items: [{
          name: 'Chicken',
          kcal: 165,
          proteinG: 31,
          carbsG: 0,
          sugarG: 0,
          fibreG: 0,
          unsaturatedG: 2,
          saturatedG: 1,
          transG: 0,
          sodiumMg: 70,
          processed: false,
        }],
      })],
      settings: { ...defaultNutritionSettings(), hideCalories: true, wagonOn: true, wagonNote: 'Rough night' },
      waterMl: 350,
      checkIns: [],
      soberDays: 47,
      unitsAvoided: 30,
      today: '2026-10-13',
    });
    const text = hidden.join('\n');
    expect(text).toContain('fallen off the wagon');
    expect(text).toContain('116 123');
    expect(text).toContain('Rough night');
    expect(text).toContain('calories hidden');
    expect(text).not.toContain('165 kcal');
    expect(text).not.toMatch(/\dkcal/);
    expect(text).toContain('350 ml');
  });

  it('shares each nutrition item only when its own switch is on', () => {
    const meal = log({
      eatenOn: '2026-10-13',
      meal: 'breakfast',
      items: [{
        name: 'Porridge',
        kcal: 180,
        proteinG: 6,
        carbsG: 28,
        sugarG: 1,
        fibreG: 3,
        unsaturatedG: 2,
        saturatedG: 0.6,
        transG: 0,
        sodiumMg: 40,
        processed: false,
      }],
    });
    const off = presentSharedNutrition(defaultNutritionSettings(), [meal], '2026-10-13');
    expect(off.meals).toBeNull();
    expect(off.calories).toBeNull();
    expect(off.quality).toBeNull();
    expect(off.progress).toBeNull();
    expect(off.wagon).toBeNull();

    const diary = presentSharedNutrition({
      ...defaultNutritionSettings(),
      shareFoodDiary: true,
    }, [meal], '2026-10-13');
    expect(diary.meals?.[0]?.detail).toContain('Porridge');
    expect(diary.meals?.[0]?.detail).toContain(ESTIMATE_LABEL);
    expect(diary.meals?.[0]?.detail).not.toMatch(/kcal/i);
    expect(diary.calories).toBeNull();
    expect(diary.quality).toBeNull();
    expect(presentSharedNutrition({ ...defaultNutritionSettings(), shareFoodDiary: true }, [meal], '2026-10-14').meals).toEqual([]);

    const calories = presentSharedNutrition({ ...defaultNutritionSettings(), shareCalories: true }, [meal], '2026-10-13');
    expect(calories.meals).toBeNull();
    expect(calories.calories).toContain('180 kcal');
    expect(calories.calories).toContain('protein 6 g');
    expect(calories.calories).not.toMatch(/unsaturated|sodium/i);
    const hiddenCalories = presentSharedNutrition({
      ...defaultNutritionSettings(),
      shareCalories: true,
      hideCalories: true,
    }, [meal], '2026-10-13');
    expect(hiddenCalories.calories).not.toMatch(/kcal/i);
    expect(hiddenCalories.calories).toContain('protein 6 g');

    const quality = presentSharedNutrition({ ...defaultNutritionSettings(), shareQuality: true }, [meal], '2026-10-13');
    expect(quality.quality?.line).toContain('unsaturated');
    expect(quality.calories).toBeNull();
    expect(quality.meals).toBeNull();

    expect(mealStreakDays([meal, log({ eatenOn: '2026-10-12', meal: 'lunch' })], '2026-10-13')).toBe(2);
    expect(mealStreakDays([log({ eatenOn: '2026-10-12', meal: 'lunch' })], '2026-10-13')).toBe(1);
    expect(mealStreakDays([log({ eatenOn: '2026-10-11', meal: 'lunch' })], '2026-10-13')).toBe(0);
    const progress = presentSharedNutrition({ ...defaultNutritionSettings(), shareProgress: true }, [meal], '2026-10-13');
    expect(progress.progress).toBe(progressShareLine(1));
    expect(progress.calories).toBeNull();
    expect(caloriesShareLine([], false)).toBe('No calories or macros logged today.');

    const wagon = presentSharedNutrition({
      ...defaultNutritionSettings(),
      wagonOn: true,
      wagonVisible: true,
      wagonNote: 'Hard day',
    }, [meal], '2026-10-13');
    expect(wagon.wagon).toEqual({ note: 'Hard day' });
    expect(wagon.meals).toBeNull();
    expect(presentSharedNutrition({
      ...defaultNutritionSettings(),
      wagonOn: false,
      wagonVisible: true,
    }, [meal], '2026-10-13').wagon).toBeNull();

    const parsed = parseSharedNutrition({
      mealsShared: true,
      meals: [{ meal: 'breakfast', names: 'Porridge', estimated: true, note: '', items: [{ name: 'Porridge', kcal: 180 }] }],
      calories: { kcal: 180, proteinG: 6, carbsG: 28, sugarG: 1, fibreG: 3 },
      quality: null,
      progressDays: null,
      wagonOn: false,
    });
    expect(parsed?.meals?.[0]?.detail).toContain('Porridge');
    expect(parsed?.meals?.[0]?.detail).not.toMatch(/180/);
    expect(parsed?.calories).toContain('180 kcal');
    expect(parseSharedNutrition({ mealsShared: false, meals: [{ meal: 'breakfast', names: 'Secret', kcal: 999 }] })?.meals).toBeNull();
    expect(parseSharedNutrition(null)).toBeNull();
  });
});

describe('nutrition storage and coach', () => {
  const sql = readFileSync('supabase/migrations/20261013220000_nutrition.sql', 'utf8');
  const estimate = readFileSync('supabase/functions/estimate-meal/index.ts', 'utf8');
  const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
  const voice = readFileSync('supabase/functions/thumos-voice-token/index.ts', 'utf8');
  const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');

  it('adds owner-only tables and a gated share function without deleting existing rows', () => {
    expect(sql).toContain('create table public.nutrition_settings');
    expect(sql).toContain('share_food_diary boolean not null default false');
    expect(sql).toContain('wagon_on boolean not null default false');
    expect(sql).toContain('create table public.food_logs');
    expect(sql).toContain('create table public.nutrition_days');
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql).toContain("values ('food-photos', 'food-photos', false, 2097152");
    expect(sql).toContain('function public.shared_nutrition');
    expect(sql).toContain('community_visible is not true');
    expect(sql).toContain('age_confirmed_18 is not true');
    expect(sql).toContain('public.blocks');
    expect(sql).toContain("'food_logs'");
    expect(sql).not.toMatch(/delete from public\.profiles/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(nutritionHealthQuantities([{
      name: 'Salt',
      kcal: 0,
      proteinG: 0,
      carbsG: 0,
      sugarG: 0,
      fibreG: 0,
      unsaturatedG: 1,
      saturatedG: 1,
      transG: 1,
      sodiumMg: 1000,
      processed: false,
    }], 250).sodiumG).toBe(1);
  });

  it('sends a photo to the existing model only after coach consent', () => {
    expect(estimate).toContain('XAI_API_KEY');
    expect(estimate).toContain('consent_ai');
    expect(estimate).toContain('image_url');
    expect(estimate).toContain('completionsUrl');
    expect(readFileSync('supabase/config.toml', 'utf8')).toContain('[functions.estimate-meal]');
    expect(chat).toContain('loadNutritionLines');
    expect(voice).toContain('loadNutritionLines');
    expect(readFileSync('supabase/functions/_shared/thumos.ts', 'utf8')).toContain('NUTRITION_PROMPT_LINE');
  });

  it('keeps six equal tabs and gives Nutrition its own menu screen', () => {
    expect(TAB_SECTIONS).toHaveLength(6);
    expect(APP_SECTIONS.filter((section) => section.tab).map((section) => section.label)).not.toContain('Nutrition');
    const labels = APP_SECTIONS.map((section) => section.label);
    expect(labels.indexOf('Nutrition')).toBe(labels.indexOf('Health Stats') + 1);
    expect(screen).toContain("Share today's meals");
    expect(screen).toContain('Share daily calories and macros');
    expect(screen).toContain('Share food quality');
    expect(screen).toContain('Share progress and streaks');
    expect(screen).toContain('Share the wagon flag');
    expect(screen).toContain('I’ve fallen off the wagon');
    expect(screen).not.toContain('wagonVisible: value ? current.wagonVisible : false');
    expect(screen).toContain('Hide calories');
    expect(screen).toContain('{ESTIMATE_LABEL}');
    expect(screen).not.toContain('danger');
    expect(screen).not.toContain('xai');
    expect(screen).not.toContain('barcode');
    expect(WAGON_PUBLIC_LINE).toContain('private message');
    expect(WAGON_SUPPORT.join(' ')).toContain('116 123');
    const community = readFileSync('src/ui/CommunityProfile.tsx', 'utf8');
    expect(community).toContain('Reach out');
    expect(community).toContain('Message privately');
    expect(community).not.toMatch(/comment/i);
    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    expect(home).not.toContain('Open nutrition');
    expect(home).not.toContain('NutritionToday');
    expect(readFileSync('src/app/(main)/check-in.tsx', 'utf8')).not.toContain('/nutrition');
    expect(readFileSync('src/app/(main)/_layout.tsx', 'utf8')).toContain('flex: 1, minWidth: 0');
    const shares = readFileSync('supabase/migrations/20261013230000_nutrition_shares.sql', 'utf8');
    expect(shares).toContain('add column if not exists share_calories boolean not null default false');
    expect(shares).toContain('add column if not exists share_quality boolean not null default false');
    expect(shares).toContain('add column if not exists share_progress boolean not null default false');
    expect(shares).toContain('function public.shared_nutrition');
    expect(shares).toContain('community_visible is not true');
    expect(shares).toContain('age_confirmed_18 is not true');
    expect(shares).toContain('public.blocks');
    expect(shares).toContain("'mealsShared'");
    expect(shares).toContain("'names'");
    expect(shares).toContain('hide_calories');
    expect(shares).toContain("'progressDays'");
    expect(shares).not.toContain("'items'");
    expect(shares).not.toContain('sodium');
    expect(shares).not.toMatch(/drop table/i);
    expect(shares).not.toMatch(/delete from/i);
    expect(shares).not.toContain('public_profile');
    expect(shares).not.toContain('profile_interests');
  });
});
