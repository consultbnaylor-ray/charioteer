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
  goalDayLine,
  goalMealNote,
  goalShareLine,
  kcalFloor,
  mealStreakDays,
  mifflinBmr,
  nutritionContextLines,
  nutritionHealthQuantities,
  nutritionPatternLines,
  parseSharedNutrition,
  presentSharedNutrition,
  progressShareLine,
  proteinGramsFor,
  samplePhotoMeal,
  sugarCravingNote,
  suggestGoalTargets,
  targetLine,
  weightTrendLine,
  defaultNutritionSettings,
  GOAL_LABEL,
  LOW_BMI_NOTE,
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
    expect(off.goal).toBeNull();

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
    expect(GOAL_LABEL.lose_weight).toBe('Lose Weight');
    expect(GOAL_LABEL.lose_fat_build_muscle).toBe('Lose Fat & Build Muscle');
    expect(GOAL_LABEL.maintain).toBe('Maintain Weight');
    expect(GOAL_LABEL.increase).toBe('Increase Weight');
    expect(screen).toContain('GOAL_LABEL[id]');
    expect(screen).not.toContain('Loose');
    expect(Object.values(GOAL_LABEL).join(' ')).not.toContain('Loose');
    expect(screen).toContain('Suggest targets');
    expect(screen).toContain('Share the goal and progress');
    expect(screen).toContain('Daily protein (g)');
    expect(readFileSync('src/app/(main)/sharing.tsx', 'utf8')).toContain('Share the goal and progress');
    const goals = readFileSync('supabase/migrations/20261014040000_nutrition_goals.sql', 'utf8');
    expect(goals).toContain('add column if not exists goal text');
    expect(goals).toContain('add column if not exists share_goal boolean not null default false');
    expect(goals).toContain('lose_fat_build_muscle');
    expect(goals).toContain('function public.shared_nutrition');
    expect(goals).toContain('community_visible is not true');
    expect(goals).toContain('age_confirmed_18 is not true');
    expect(goals).toContain('public.blocks');
    expect(goals).toContain("'bmiLow'");
    expect(goals).toContain("'direction'");
    expect(goals).not.toContain('public_profile');
    expect(goals).not.toContain('profile_interests');
    expect(goals).not.toMatch(/drop table/i);
    expect(goals).not.toMatch(/delete from/i);
  });
});

describe('nutrition goals', () => {
  const body = { weightKg: 80, heightCm: 180, age: 40, sex: 'male' as const };

  it('suggests a modest deficit from Mifflin-St Jeor and keeps a kcal floor', () => {
    expect(mifflinBmr(body)).toBe(1730);
    const lose = suggestGoalTargets({ ...body, goal: 'lose_weight', activeEnergyKcal: null });
    expect(lose.ok).toBe(true);
    if (!lose.ok) return;
    expect(lose.suggestion.kcal).toBe(2282);
    expect(lose.suggestion.proteinG).toBe(128);
    expect(lose.suggestion.blockedLoss).toBe(false);
    expect(proteinGramsFor('lose_fat_build_muscle', 80)).toBe(144);
    const recomp = suggestGoalTargets({ ...body, goal: 'lose_fat_build_muscle', activeEnergyKcal: null });
    expect(recomp.ok && recomp.suggestion.kcal).toBe(2382);
    expect(recomp.ok && recomp.suggestion.proteinG).toBe(144);
    const active = suggestGoalTargets({ ...body, goal: 'lose_weight', activeEnergyKcal: 500 });
    expect(active.ok && active.suggestion.kcal).toBe(1830);
    expect(active.ok && active.suggestion.usedActiveEnergy).toBe(true);
    const floored = suggestGoalTargets({
      goal: 'lose_weight',
      weightKg: 45,
      heightCm: 155,
      age: 70,
      sex: 'female',
      activeEnergyKcal: null,
    });
    expect(floored.ok && floored.suggestion.kcal).toBe(1200);
    expect(floored.ok && floored.suggestion.floor).toBe(kcalFloor(floored.ok ? floored.suggestion.bmr : 0, 'female'));
  });

  it('does not suggest a deficit when BMI is under 18.5', () => {
    const low = suggestGoalTargets({
      goal: 'lose_weight',
      weightKg: 50,
      heightCm: 175,
      age: 40,
      sex: 'male',
      activeEnergyKcal: null,
    });
    expect(low.ok).toBe(true);
    if (!low.ok) return;
    expect(low.suggestion.blockedLoss).toBe(true);
    expect(low.suggestion.note).toBe(LOW_BMI_NOTE);
    expect(low.suggestion.kcal).toBeGreaterThan(2000);
    const line = goalDayLine({
      goal: 'lose_weight',
      hideCalories: false,
      kcal: 1800,
      kcalTarget: 1500,
      proteinG: 40,
      proteinTarget: 80,
      blockedLoss: true,
    });
    expect(line).toContain('A lower intake is not being suggested.');
    expect(line).not.toContain('eating less');
  });

  it('hides kcal from the goal line and keeps a shared goal qualitative', () => {
    const hidden = goalDayLine({
      goal: 'lose_fat_build_muscle',
      hideCalories: true,
      kcal: 2200,
      kcalTarget: 1800,
      proteinG: 90,
      proteinTarget: 140,
      blockedLoss: false,
    });
    expect(hidden).toContain('Protein');
    expect(hidden).toContain('Calories stay hidden');
    expect(hidden).not.toMatch(/kcal/i);
    const shared = presentSharedNutrition({
      ...defaultNutritionSettings(),
      goal: 'lose_weight',
      shareGoal: true,
      proteinTarget: 128,
      hideCalories: true,
    }, [], '2026-10-14', {
      heightCm: 180,
      weights: [{ day: '2026-10-01', kg: 80.4 }, { day: '2026-10-14', kg: 79.6 }],
    });
    expect(shared.goal?.line).toContain('Lose Weight');
    expect(shared.goal?.line).toContain('eased down');
    expect(shared.goal?.line).not.toMatch(/kcal|\bkg\b/i);
    expect(presentSharedNutrition({
      ...defaultNutritionSettings(),
      goal: 'lose_weight',
      shareGoal: false,
    }, [], '2026-10-14').goal).toBeNull();
    const parsed = parseSharedNutrition({
      mealsShared: false,
      goal: { id: 'increase', proteinG: 40, proteinTargetG: 120, direction: 'up', hideCalories: false, bmiLow: false },
    });
    expect(parsed?.goal?.line).toBe(goalShareLine({
      goal: 'increase',
      proteinG: 40,
      proteinTarget: 120,
      direction: 'up',
      hideCalories: false,
      blockedLoss: false,
    }));
    expect(parsed?.goal?.line).not.toMatch(/\d+\s*kcal|\bkg\b/);
  });

  it('gives Thumos a gentle goal line and a photo note', () => {
    const lines = nutritionContextLines({
      logs: [],
      settings: { ...defaultNutritionSettings(), goal: 'lose_weight', proteinTarget: 128, kcalTarget: 2282 },
      waterMl: 0,
      checkIns: [],
      soberDays: null,
      unitsAvoided: 0,
      today: '2026-10-14',
      body: { weightKg: 50, heightCm: 175, weights: [{ day: '2026-10-01', kg: 51 }, { day: '2026-10-14', kg: 50 }] },
    });
    const text = lines.join('\n');
    expect(text).toContain('Their goal is Lose Weight.');
    expect(text).toContain('A lower intake is not being suggested.');
    expect(text).not.toMatch(/eat less|shame|lazy|weak/i);
    const hidden = nutritionContextLines({
      logs: [],
      settings: { ...defaultNutritionSettings(), goal: 'maintain', hideCalories: true, kcalTarget: 2000 },
      waterMl: 0,
      checkIns: [],
      soberDays: null,
      unitsAvoided: 0,
      today: '2026-10-14',
    });
    expect(hidden.join('\n')).not.toMatch(/kcal/i);
    const note = goalMealNote({
      goal: 'lose_weight',
      items: samplePhotoMeal(),
      hideCalories: false,
      blockedLoss: false,
    });
    expect(note).toContain('One meal does not decide the day.');
    expect(goalMealNote({ goal: 'lose_weight', items: samplePhotoMeal(), hideCalories: false, blockedLoss: true }))
      .toBe('This is an estimate. A lower intake is not being suggested.');
    expect(weightTrendLine([
      { day: '2026-09-30', kg: 74.8 },
      { day: '2026-10-14', kg: 74.2 },
    ], 'lose_weight')).toContain('gentle move');
  });
});
