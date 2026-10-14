import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { communitySharingOn } from './profileSharing';
import { APP_SECTIONS, TAB_SECTIONS } from './sections';
import {
  APPLE_HEALTH_MEAL_NOTE,
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
  goalBodyForSuggestion,
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
  suggestedTargetsLine,
  suggestGoalTargets,
  targetLine,
  weightTrendLine,
  defaultNutritionSettings,
  GOAL_LABEL,
  BMI_ONLY_NOTE,
  BUILD_LABEL,
  LOW_BMI_NOTE,
  WEEK_CHART_EMPTY,
  assessWeight,
  compositionShareLine,
  fatFreeMassKg,
  ffmiPlain,
  ffmiValue,
  dayItems,
  parsePortion,
  scaleFoodItems,
  sumItems,
  parseBodyFatPct,
  parseWaistCm,
  waistToHeight,
  eatingInsights,
  loggingCaption,
  loggingDots,
  macroSplit,
  nutritionTrendDays,
  smoothWeight,
  todayRing,
  trendCaption,
  waterProgress,
  type FoodItem,
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
    eatenAt: null,
    portion: 1,
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
    expect(labels.indexOf('Stats')).toBe(labels.indexOf('Health Stats') - 1);
    expect(APP_SECTIONS.find((section) => section.id === 'stats')?.tab).toBeUndefined();
    expect(screen).toContain("Share today's meals");
    expect(screen).toContain('Share daily calories and macros');
    expect(screen).toContain('Share food quality');
    expect(screen).toContain('Share progress and streaks');
    const wagon = readFileSync('src/ui/NutritionShare.tsx', 'utf8');
    expect(screen).toContain('<WagonFlag');
    expect(readFileSync('src/app/(main)/profile.tsx', 'utf8')).toContain('<WagonFlag');
    expect(wagon).toContain('Share the wagon flag');
    expect(wagon).toContain('I’ve fallen off the wagon');
    expect(wagon).toContain('will not shame you');
    expect(wagon).toContain('setNutritionSettings');
    expect(wagon).toContain('wagonOn: value');
    expect(wagon).not.toContain('wagonVisible: value ? current.wagonVisible : false');
    expect(wagon).not.toContain('wagonVisible: false');
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
    expect(screen).toContain("pending={isPending('suggest')}");
    expect(screen).toContain('pendingLabel="Suggesting..."');
    expect(screen).toContain('readAppleHealthBody');
    expect(screen).toContain('goalBodyForSuggestion');
    expect(screen).toContain('label="Weight (kg)"');
    expect(screen).toContain('label="Height (cm)"');
    expect(screen).toContain('Or add them on Health Stats');
    const goalCard = screen.slice(screen.indexOf('variant="label">Goal'), screen.indexOf('variant="label">Logged today'));
    expect(goalCard).toContain('Suggest targets');
    expect(goalCard).toContain('{suggestNote}');
    expect(goalCard).toContain('label="Weight (kg)"');
    expect(goalCard).toContain('label="Height (cm)"');
    const suggestFn = screen.slice(screen.indexOf('function suggest()'), screen.indexOf('function openDraft'));
    expect(suggestFn).toContain("run('suggest'");
    expect(suggestFn).toContain('setSuggestNote(result.message)');
    expect(suggestFn).not.toContain('setError(result.message)');
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

  it('says exactly what is missing for Lose Fat & Build Muscle at age 45', () => {
    const ben = {
      goal: 'lose_fat_build_muscle' as const,
      age: 45,
      sex: 'male' as const,
      activeEnergyKcal: null,
    };
    const both = suggestGoalTargets({ ...ben, weightKg: null, heightCm: null });
    expect(both).toEqual({ ok: false, message: 'Add your weight and height' });
    const weightOnly = suggestGoalTargets({ ...ben, weightKg: null, heightCm: 180 });
    expect(weightOnly).toEqual({ ok: false, message: 'Add your weight' });
    const heightOnly = suggestGoalTargets({ ...ben, weightKg: 80, heightCm: null });
    expect(heightOnly).toEqual({ ok: false, message: 'Add your height' });
  });

  it('suggests from Apple Health when the weight box and profile have neither', () => {
    const fromHealth = goalBodyForSuggestion({
      box: null,
      healthWeight: { kg: 80, day: '2026-10-14' },
      profileHeightCm: null,
      healthHeightCm: 180,
      typedWeightKg: null,
      typedHeightCm: null,
    });
    expect(fromHealth).toEqual({
      weightKg: 80,
      heightCm: 180,
      weightFrom: 'health',
      heightFrom: 'health',
    });
    const result = suggestGoalTargets({
      goal: 'lose_fat_build_muscle',
      weightKg: fromHealth.weightKg,
      heightCm: fromHealth.heightCm,
      age: 45,
      sex: 'male',
      activeEnergyKcal: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion.kcal).toBe(2343);
    expect(result.suggestion.proteinG).toBe(144);
    expect(suggestedTargetsLine({
      kcal: result.suggestion.kcal,
      proteinG: result.suggestion.proteinG,
      hideCalories: false,
    })).toBe('Suggested 2,343 kcal and 144 g protein.');

    const laterBox = goalBodyForSuggestion({
      box: { kg: 82, day: '2026-10-14' },
      healthWeight: { kg: 80, day: '2026-10-01' },
      profileHeightCm: 178,
      healthHeightCm: 180,
      typedWeightKg: null,
      typedHeightCm: null,
    });
    expect(laterBox.weightKg).toBe(82);
    expect(laterBox.weightFrom).toBe('box');
    expect(laterBox.heightCm).toBe(178);
    expect(laterBox.heightFrom).toBe('profile');

    const typed = goalBodyForSuggestion({
      box: null,
      healthWeight: null,
      profileHeightCm: null,
      healthHeightCm: null,
      typedWeightKg: 80,
      typedHeightCm: 180,
    });
    expect(typed.weightFrom).toBe('typed');
    expect(typed.heightFrom).toBe('typed');
    expect(suggestedTargetsLine({ kcal: 2343, proteinG: 144, hideCalories: true })).toBe('Suggested 144 g protein.');
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

describe('nutrition charts', () => {
  function food(partial: Partial<FoodItem> & Pick<FoodItem, 'name' | 'kcal' | 'proteinG'>): FoodItem {
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

  it('draws today against the target, and protein when calories are hidden', () => {
    const shown = todayRing({
      hideCalories: false,
      kcal: 900,
      kcalTarget: 1800,
      proteinG: 40,
      proteinTarget: 100,
      logged: true,
    });
    expect(shown.kind).toBe('kcal');
    expect(shown.caption).toBe('900 of 1,800 kcal logged today.');
    expect(shown.fill).toBe(0.5);

    const hidden = todayRing({
      hideCalories: true,
      kcal: 900,
      kcalTarget: 1800,
      proteinG: 40,
      proteinTarget: 100,
      logged: true,
    });
    expect(hidden.kind).toBe('protein');
    expect(hidden.caption).toBe('40 of 100 g protein logged today.');
    expect(hidden.caption).not.toMatch(/kcal/i);

    const over = todayRing({
      hideCalories: false,
      kcal: 2200,
      kcalTarget: 1800,
      proteinG: 40,
      proteinTarget: 100,
      logged: true,
    });
    expect(over.fill).toBe(1);
    expect(over.caption).toBe('2,200 kcal logged, above 1,800 kcal.');

    const open = todayRing({
      hideCalories: false,
      kcal: 900,
      kcalTarget: null,
      proteinG: 40,
      proteinTarget: null,
      logged: true,
    });
    expect(open.caption).toBe('900 kcal logged. No target yet.');
    expect(todayRing({
      hideCalories: false,
      kcal: 0,
      kcalTarget: 1800,
      proteinG: 0,
      proteinTarget: 100,
      logged: false,
    }).caption).toBe('Nothing logged today.');
  });

  it('asks for a few meals before drawing an empty week or month', () => {
    const week = nutritionTrendDays([], '2026-10-14', 7);
    expect(week).toHaveLength(7);
    expect(week.every((day) => day.logged === false)).toBe(true);
    expect(week[6]?.day).toBe('2026-10-14');
    expect(trendCaption(week, { hideCalories: false, span: 7 })).toBe(WEEK_CHART_EMPTY);
    expect(WEEK_CHART_EMPTY).toBe('Log a few meals to see your week');
    expect(trendCaption(nutritionTrendDays([], '2026-10-14', 30), { hideCalories: false, span: 30 }))
      .toBe('Log a few meals to see the month.');

    const logged = nutritionTrendDays([
      log({
        eatenOn: '2026-10-14',
        meal: 'breakfast',
        items: [food({ name: 'Porridge', kcal: 900, proteinG: 40 })],
      }),
    ], '2026-10-14', 7);
    expect(trendCaption(logged, { hideCalories: false, span: 7 }))
      .toBe('Logged days average 900 kcal and 40 g protein.');
    const quiet = trendCaption(logged, { hideCalories: true, span: 7 });
    expect(quiet).toBe('Logged days average 40 g protein.');
    expect(quiet).not.toMatch(/kcal/i);
  });

  it('splits protein, carbohydrate and fat, and smooths weight without inventing days', () => {
    const empty = macroSplit([]);
    expect(empty.slices).toEqual([]);
    expect(empty.caption).toBe('Log a meal to see protein, carbohydrate and fat.');
    const split = macroSplit([
      food({ name: 'Chicken', kcal: 200, proteinG: 30, carbsG: 0, unsaturatedG: 2, saturatedG: 1 }),
      food({ name: 'Rice', kcal: 180, proteinG: 4, carbsG: 40 }),
    ]);
    expect(split.slices.map((slice) => slice.label)).toEqual(['Protein', 'Carbs', 'Fat']);
    const shares = split.slices.reduce((sum, slice) => sum + slice.share, 0);
    expect(shares).toBeCloseTo(1, 5);

    const smoothed = smoothWeight([
      { day: '2026-10-01', kg: 80 },
      { day: '2026-10-08', kg: 82 },
      { day: '2026-10-14', kg: 78 },
    ]);
    expect(smoothed.map((point) => point.day)).toEqual(['2026-10-01', '2026-10-08', '2026-10-14']);
    expect(smoothed[1]?.smooth).toBe(80);
  });

  it('marks logged days, a water mark, and snack patterns only when both sides exist', () => {
    expect(loggingDots([], '2026-10-14')).toHaveLength(28);
    const dots = loggingDots([log({ eatenOn: '2026-10-14', meal: 'lunch' })], '2026-10-14');
    expect(dots.filter((dot) => dot.logged).map((dot) => dot.day)).toEqual(['2026-10-14']);
    expect(loggingCaption([], '2026-10-14')).toBe('Log a meal and the day gets a dot.');

    expect(waterProgress(0)).toEqual({ ml: 0, mark: 2000, fill: 0, caption: 'No water logged today.' });
    expect(waterProgress(350)).toEqual({
      ml: 350,
      mark: 2000,
      fill: 0.175,
      caption: '350 ml of 2,000 ml logged today.',
    });

    expect(eatingInsights([], [])).toEqual([]);
    const insights = eatingInsights(
      [
        log({ eatenOn: '2026-10-11', meal: 'snack' }),
        log({ eatenOn: '2026-10-12', meal: 'breakfast' }),
      ],
      [
        { createdAt: '2026-10-11T20:00:00.000Z', mood: 3, sleepHours: 5 },
        { createdAt: '2026-10-12T20:00:00.000Z', mood: 8, sleepHours: 7.5 },
      ],
    );
    expect(insights.map((insight) => insight.id)).toEqual(['sleep', 'mood']);
    expect(insights[0]?.caption).toBe('On days you slept under 6 hours, you logged more snacks.');
    expect(insights[1]?.caption).toBe('Lower-mood days had more snacks.');
    expect(insights.map((insight) => insight.caption).join(' ')).not.toMatch(/kcal/i);
  });

  it('draws the charts with the svg already in the app, in white and grey', () => {
    const charts = readFileSync('src/ui/NutritionCharts.tsx', 'utf8');
    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    expect(charts).toContain("from 'react-native-svg'");
    expect(charts).not.toMatch(/victory-native|gifted-charts|expo-linear-gradient/);
    expect(charts).not.toMatch(/danger|#f00|#ff0000|\bred\b/i);
    expect(charts).not.toMatch(/\bfetch\(|\bawait\b/);
    expect(screen).toContain('<NutritionBoard');
    expect(screen).toContain('<WeightTrendChart');
    expect(screen).toContain('<WaterMeter');
    const at = (needle: string) => screen.indexOf(needle);
    const log = at('variant="label">Log a meal');
    const goal = at('variant="label">Goal');
    const logged = at('variant="label">Logged today');
    const summary = at('variant="label">Today');
    const board = at('<NutritionBoard');
    const water = at('variant="label">Water');
    const weight = at('variant="label">Weight');
    const body = at('<BodyCompositionCard');
    const wagon = at('<WagonFlag');
    const sharing = at('<NutritionShareSummary');
    expect(log).toBeGreaterThan(-1);
    expect(log).toBeLessThan(goal);
    expect(goal).toBeLessThan(logged);
    expect(logged).toBeLessThan(summary);
    expect(summary).toBeLessThan(board);
    expect(board).toBeLessThan(water);
    expect(water).toBeLessThan(weight);
    expect(weight).toBeLessThan(body);
    expect(body).toBeLessThan(wagon);
    expect(wagon).toBeLessThan(sharing);
    expect(screen.slice(logged, summary)).toContain("Share today's meals");
    expect(screen.slice(summary, board)).toContain('Share daily calories and macros');
    expect(screen.slice(board, water)).toContain('Share food quality');
    expect(screen.slice(board, water)).toContain('Share progress and streaks');
    expect(screen.slice(goal, logged)).toContain('Share the goal and progress');
    expect(screen.slice(goal, logged)).toContain('Saved ✓');
    expect(screen.slice(goal, logged)).toContain('Last updated');
    expect(screen.slice(goal, logged)).toContain('formatUkCompactWhen');
    expect(screen).toContain("pending={isPending('suggest')}");
  });

  it('keeps every nutrition share on screen when Community is off or the settings row is missing', () => {
    expect(communitySharingOn(null)).toBe(false);
    expect(communitySharingOn({ communityVisible: false, ageConfirmed18: true })).toBe(false);
    expect(communitySharingOn({ communityVisible: true, ageConfirmed18: false })).toBe(false);
    expect(communitySharingOn({ communityVisible: true, ageConfirmed18: true })).toBe(true);
    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const share = readFileSync('src/ui/NutritionShare.tsx', 'utf8');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const card = screen.slice(screen.indexOf('<NutritionShareSummary'), screen.indexOf('{healthNote'));
    expect(card).toContain('<NutritionShareSummary');
    expect(share).toContain('What I share from Nutrition');
    expect(share).toContain('Share today\'s meals');
    expect(share).toContain('Share daily calories and macros');
    expect(share).toContain('Share food quality');
    expect(share).toContain('Share progress and streaks');
    expect(share).toContain('Share the wagon flag');
    expect(share).toContain('Share the goal and progress');
    expect(share).toContain('These stay off until Community is on.');
    expect(share).toContain('Turn on Community');
    expect(share).toContain("router.push('/privacy'");
    expect(share).toContain('disabled={!communityOn}');
    expect(share).not.toContain('consentHealth');
    expect(share).not.toContain('consentAi');
    expect(screen).not.toMatch(/\{[^}\n]*communityVisible[^}\n]*\?[^}\n]*null/);
    expect(repo).toContain('settingsRes.error ? defaultNutritionSettings() : nutritionFromRow');
    expect(repo).toContain('if (!row) return base');
  });
});

describe('body composition', () => {
  const sql = readFileSync('supabase/migrations/20261014170000_body_composition.sql', 'utf8');
  const screen = readFileSync('src/ui/BodyComposition.tsx', 'utf8');
  const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');

  it('stores body fat, lean mass, and waist for the owner only', () => {
    expect(sql).toContain('create table public.body_composition');
    expect(sql).toContain("source in ('healthkit', 'smart_scale', 'gym_scan', 'dexa', 'other')");
    expect(sql).toContain("build in ('muscular', 'average', 'slim')");
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql).toContain('revoke all on table public.body_composition from public, anon, authenticated');
    expect(sql).not.toMatch(/grant select on public\.body_composition to anon/i);
    expect(sql).toContain('unique (user_id, recorded_on, source)');
    expect(sql).toContain("'composition', composition");
    expect(sql).toContain('if share_prog then');
    expect(sql).toContain('Waist is less than half their height.');
    expect(sql).toContain("'body_composition'");
    expect(sql).toContain('add column if not exists updated_at timestamptz not null default now()');
    expect(readFileSync('supabase/migrations/20261013220000_nutrition.sql', 'utf8')).toContain('updated_at timestamptz not null default now()');
    expect(repo).toContain('build, updated_at');
    expect(repo).toContain('updatedAt: new Date().toISOString()');
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/delete from/i);
  });

  it('uses body fat, then waist, then BMI, and keeps the underweight floor', () => {
    expect(parseBodyFatPct(0.15)).toBe(15);
    expect(parseBodyFatPct(15)).toBe(15);
    expect(parseWaistCm(33, 'in')).toBe(83.8);
    expect(waistToHeight(84, 178)).toBe(0.47);
    const fat = assessWeight({ bodyFatPct: 15, waistCm: 84, weightKg: 80, heightCm: 170, build: 'muscular', sex: 'male' });
    expect(fat.basis).toBe('body_fat');
    expect(fat.hideBmiCategory).toBe(true);
    expect(fat.plain).not.toMatch(/overweight|obese/i);
    const waist = assessWeight({ waistCm: 84, weightKg: 80, heightCm: 178, build: 'average', sex: 'male' });
    expect(waist.basis).toBe('waist');
    expect(waist.label).toBe('Within the healthy band');
    expect(waist.plain).toContain('less than half your height');
    const onlyBmi = assessWeight({ weightKg: 80, heightCm: 170, build: 'average', sex: 'male' });
    expect(onlyBmi.basis).toBe('bmi');
    expect(onlyBmi.plain).toContain(BMI_ONLY_NOTE);
    const muscular = assessWeight({ weightKg: 80, heightCm: 170, build: 'muscular', sex: 'male' });
    expect(muscular.label).toBeNull();
    expect(muscular.hideBmiCategory).toBe(true);
    expect(muscular.plain).not.toMatch(/overweight|obese/i);
    expect(muscular.plain).toContain(BMI_ONLY_NOTE);
    const low = assessWeight({ weightKg: 50, heightCm: 175, build: 'muscular', sex: 'male' });
    expect(low.underweight).toBe(true);
    expect(low.label).toBe('Below the healthy range');
    const lean = fatFreeMassKg({ weightKg: 74.2, bodyFatPct: 15, leanMassKg: 63 });
    expect(lean).toBe(63);
    const ffmi = ffmiValue(63, 178);
    expect(ffmi).toBe(19.9);
    expect(ffmiPlain({ ffmi: ffmi ?? 0, sex: 'male' })).toContain('ordinary');
    expect(ffmiPlain({ ffmi: ffmi ?? 0, sex: 'male' })).toContain('not a diagnosis');
    expect(compositionShareLine({ bodyFatPct: 15, leanMassKg: 63, waistCm: 84, heightCm: 178 })).toBe('Body fat 15%.');
    expect(compositionShareLine({ bodyFatPct: null, leanMassKg: null, waistCm: null, heightCm: 178 })).toBeNull();
  });

  it('raises protein for a muscular build without dropping the safety floor', () => {
    expect(proteinGramsFor('lose_weight', 80)).toBe(128);
    expect(proteinGramsFor('lose_weight', 80, 'muscular')).toBe(160);
    expect(proteinGramsFor('lose_fat_build_muscle', 80, 'muscular')).toBe(160);
    const lifted = suggestGoalTargets({
      goal: 'lose_weight',
      weightKg: 80,
      heightCm: 180,
      age: 40,
      sex: 'male',
      activeEnergyKcal: null,
      build: 'muscular',
    });
    expect(lifted.ok && lifted.suggestion.proteinG).toBe(160);
    expect(lifted.ok && lifted.suggestion.kcal).toBe(2282);
    expect(lifted.ok && lifted.suggestion.note).toContain('1.8 to 2.2');
    const blocked = suggestGoalTargets({
      goal: 'lose_weight',
      weightKg: 50,
      heightCm: 175,
      age: 40,
      sex: 'male',
      activeEnergyKcal: null,
      build: 'muscular',
    });
    expect(blocked.ok && blocked.suggestion.blockedLoss).toBe(true);
    expect(blocked.ok && blocked.suggestion.note).toBe(LOW_BMI_NOTE);
    const lines = nutritionContextLines({
      logs: [],
      settings: { ...defaultNutritionSettings(), build: 'muscular', goalSex: 'male' },
      waterMl: 0,
      checkIns: [],
      soberDays: null,
      unitsAvoided: 0,
      today: '2026-10-14',
      body: { weightKg: 80, heightCm: 170, weights: [], bodyFatPct: null, leanMassKg: null, waistCm: null },
    });
    const text = lines.join('\n');
    expect(text).toContain(BUILD_LABEL.muscular);
    expect(text).toContain('Do not call them overweight or obese from BMI.');
    expect(text).not.toMatch(/NHS overweight|calls obese|is overweight/i);
    const shared = presentSharedNutrition(
      { ...defaultNutritionSettings(), shareProgress: true },
      [],
      '2026-10-14',
      { heightCm: 178, weights: [], bodyFatPct: 15, leanMassKg: 63, waistCm: 84 },
    );
    expect(shared.progress).toContain('Body fat 15%.');
    const hidden = presentSharedNutrition(
      { ...defaultNutritionSettings(), shareProgress: false },
      [],
      '2026-10-14',
      { bodyFatPct: 15, leanMassKg: 63, waistCm: 84, heightCm: 178 },
    );
    expect(hidden.progress).toBeNull();
    const parsed = parseSharedNutrition({ progressDays: 1, composition: 'Body fat 15%.' });
    expect(parsed?.progress).toBe(`${progressShareLine(1)} Body fat 15%.`);
    expect(parseSharedNutrition({ composition: 'Body fat 15%.' })?.progress).toBeNull();
  });

  it('keeps the body card free of photo estimation and reloads', () => {
    expect(screen).toContain('BMI_ONLY_NOTE');
    expect(BUILD_LABEL.muscular).toBe('Muscular / I lift weights');
    expect(screen).toContain('BUILD_LABEL');
    expect(screen).toContain("pending={isPending('body')}");
    expect(screen).toContain('setNutritionSettings');
    expect(screen).not.toMatch(/ImagePicker|launchCamera|expo-image-picker|estimateMeal|photoBase64/);
    expect(readFileSync('src/app/(main)/profile.tsx', 'utf8')).toContain('<BuildChoices');
    expect(readFileSync('supabase/functions/_shared/nutrition.ts', 'utf8')).toContain('use body fat before waist-to-height');
    expect(readFileSync('supabase/functions/_shared/thumos.ts', 'utf8')).toContain('slice(0, 16)');
    expect(readFileSync('supabase/functions/_shared/nutritionLoad.ts', 'utf8')).toContain("from('body_composition')");
    const save = repo.slice(repo.indexOf('async saveBodyComposition'), repo.indexOf('async sharedNutrition'));
    expect(save).toContain("from('body_composition').upsert");
    expect(save).not.toContain('this.refresh()');
    expect(repo).toContain('build: settings.build');
  });
});

describe('meal edit', () => {
  it('scales the saved meal so the day, the chart, and the goal ring follow it', () => {
    const porridge = estimateFromText('porridge')[0];
    expect(porridge?.kcal).toBe(180);
    const larger = scaleFoodItems(porridge ? [porridge] : [], 2)[0];
    expect(larger?.kcal).toBe(360);
    expect(larger?.proteinG).toBe(12);
    expect(larger?.fibreG).toBe(6);
    const edited = log({ eatenOn: '2026-10-14', meal: 'breakfast', items: larger ? [larger] : [], portion: 2 });
    expect(sumItems(dayItems([edited], '2026-10-14')).kcal).toBe(360);
    expect(sumItems(dayItems([], '2026-10-14')).kcal).toBe(0);
    const trend = nutritionTrendDays([edited], '2026-10-14', 7).find((day) => day.day === '2026-10-14');
    expect(trend?.kcal).toBe(360);
    expect(trend?.proteinG).toBe(12);
    expect(todayRing({
      hideCalories: false,
      kcal: trend?.kcal ?? 0,
      kcalTarget: 2000,
      proteinG: trend?.proteinG ?? 0,
      proteinTarget: 100,
      logged: true,
    }).caption).toBe('360 of 2,000 kcal logged today.');
    expect(parsePortion('2')).toBe(2);
    expect(parsePortion('0.25')).toBe(0.25);
    expect(parsePortion('0')).toBeNull();
    expect(parsePortion('13')).toBeNull();
    expect(APPLE_HEALTH_MEAL_NOTE).toContain('sample id');
    expect(APPLE_HEALTH_MEAL_NOTE).toContain('cannot update or delete');
  });

  it('keeps update and delete on the owner and edits the diary in place', () => {
    const sql = readFileSync('supabase/migrations/20261013220000_nutrition.sql', 'utf8');
    expect(sql).toContain('create policy food_logs_all on public.food_logs');
    expect(sql).toContain('for all to authenticated');
    expect(sql).toContain('using (user_id = auth.uid())');
    expect(sql).toContain('with check (user_id = auth.uid())');
    expect(sql).toContain('grant select, insert, update, delete on public.food_logs to authenticated');
    const edit = readFileSync('supabase/migrations/20261014210000_food_log_edit.sql', 'utf8');
    expect(edit).toContain('add column if not exists eaten_at');
    expect(edit).toContain('add column if not exists portion');
    expect(edit).toContain('food_logs_all');
    expect(edit).not.toMatch(/create policy/i);
    expect(edit).not.toMatch(/drop table/i);
    expect(edit).not.toMatch(/delete from/i);

    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const editor = readFileSync('src/ui/MealEdit.tsx', 'utf8');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    expect(screen).toContain('label="Edit"');
    expect(screen).toContain('Delete this meal?');
    expect(screen).toContain('label="Keep it"');
    expect(screen).toContain("saving={isPending('meal-save')}");
    expect(screen).toContain("estimating={isPending('meal-estimate')}");
    expect(screen).toContain('updateFoodLog');
    const saveEdited = screen.slice(screen.indexOf('function saveEdited'), screen.indexOf('function estimateEdited'));
    expect(saveEdited).toContain('APPLE_HEALTH_MEAL_NOTE');
    expect(saveEdited).not.toContain('writeDayToAppleHealth');
    expect(editor).toContain('Re-estimate with AI');
    expect(editor).toContain('Saved ✓');
    expect(editor).toContain('label="Description"');
    expect(editor).toContain('label="Portion"');
    expect(editor).toContain('label="Date"');
    expect(editor).toContain('label="Time"');
    expect(editor).toContain('label="Fat (g)"');
    expect(editor).toContain('Fat quality');
    expect(editor).toContain('label="Fibre (g)"');
    expect(editor).toContain('label="Sugar (g)"');
    expect(editor).toContain('Highly processed');
    expect(editor).toContain('MEAL_SLOTS');
    expect(readFileSync('src/domain/statsOverview.ts', 'utf8')).toContain('foodLogs');

    const update = repo.slice(repo.indexOf('async updateFoodLog'), repo.indexOf('async deleteFoodLog'));
    expect(update).toContain(".update(row)");
    expect(update).toContain(".eq('id', id)");
    expect(update).toContain(".eq('user_id', userId)");
    expect(update).toContain('this.emit');
    expect(update).not.toContain('this.refresh()');
    const remove = repo.slice(repo.indexOf('async deleteFoodLog'), repo.indexOf('async setNutritionSettings'));
    expect(remove).toContain('.delete()');
    expect(remove).toContain(".eq('user_id', userId)");
    expect(remove).toContain('this.emit');
    expect(remove).not.toContain('this.refresh()');
    expect(readFileSync('src/data/demo-repository.ts', 'utf8')).toContain('async updateFoodLog');
  });
});
