import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { londonDay } from './healthInsights';
import { figuresForLondonWeek } from './goalLed';
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
  foodItemFromUnknown,
  formatGrams,
  MEAL_ESTIMATE_PROMPT,
  NUTRITION_BREAKDOWN_LABEL,
  mealChartStartsOpen,
  MEAL_SHOW_MORE,
  MEAL_WEEK_DAYS,
  mealAddedLabel,
  mealDayChangeAllowed,
  mealDayGroups,
  mealDayTitle,
  mealEatenStamp,
  mealLogDayAllowed,
  mealLoggingLabel,
  mealLogWindow,
  MEAL_LOG_LOOKBACK_DAYS,
  londonClock,
  storedMealInstant,
  mealWeekCutoff,
  mealWeeksAfterShowMore,
  mealWeeksForDay,
  visibleMealDays,
  mealNutrientBars,
  parseMealEstimate,
  processedFoodLevel,
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
  healthyTopKg,
  isBodyBuild,
  proteinBasisKg,
  proteinGramsFor,
  samplePhotoMeal,
  sugarCravingNote,
  suggestedTargetsLine,
  suggestGoalTargets,
  targetLine,
  weightTrendLine,
  defaultNutritionSettings,
  GOAL_LABEL,
  NUTRITION_GOALS,
  goalCoachLines,
  sheetClassKg,
  BMI_ONLY_NOTE,
  BUILD_LABEL,
  BUILD_WHY,
  CARRYING_COACH_LINE,
  CARRYING_PROTEIN_NOTE,
  HEALTHY_BMI_TOP,
  LOW_BMI_NOTE,
  WEEK_CHART_EMPTY,
  assessWeight,
  compositionShareLine,
  compositionTrendLine,
  COMPETITION_NOTE,
  GOAL_PLAIN,
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
  DUPLICATE_MEAL_PROMPT,
  RECENT_MEAL_WINDOW_MS,
  TODAY_MEALS_EMPTY,
  recentDuplicateMeal,
  loggedProteinRing,
  PROTEIN_TARGET_MET,
  todayMealRows,
  todayMealTotalLine,
  todayMealTotals,
  todayMealsNeedCollapse,
  todayRing,
  trendCaption,
  waterProgress,
  type FoodItem,
  type FoodLog,
  type MealSlot,
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
    expect(off.mealPhotos).toBeNull();
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
    expect(diary.mealPhotos).toEqual([]);
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
    expect(readFileSync('src/ui/GoalChoices.tsx', 'utf8')).toContain('option.label');
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
    const goalCard = screen.slice(screen.indexOf('<GoalChoices'), screen.indexOf('variant="label">Today'));
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
    expect(shown.status).toBe('900 kcal left');
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
    expect(hidden.status).toBe('60 g left');
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
    expect(over.status).toBe('400 kcal over');

    const open = todayRing({
      hideCalories: false,
      kcal: 900,
      kcalTarget: null,
      proteinG: 40,
      proteinTarget: null,
      logged: true,
    });
    expect(open.caption).toBe('900 kcal logged. No target yet.');
    expect(open.status).toBe('No target yet');
    const quiet = todayRing({
      hideCalories: false,
      kcal: 0,
      kcalTarget: 1800,
      proteinG: 0,
      proteinTarget: 100,
      logged: false,
    });
    expect(quiet.caption).toBe('Nothing logged today.');
    expect(quiet.status).toBe('Nothing logged today');
    expect(todayRing({
      hideCalories: true,
      kcal: 900,
      kcalTarget: 1800,
      proteinG: 120,
      proteinTarget: 100,
      logged: true,
    }).status).toBe('At your target');
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

    expect(waterProgress(0)).toEqual({ ml: 0, mark: 2000, fill: 0, caption: 'No water logged today.', status: 'None logged today' });
    expect(waterProgress(350)).toEqual({
      ml: 350,
      mark: 2000,
      fill: 0.175,
      caption: '350 ml of 2,000 ml logged today.',
      status: '1,650 ml left',
    });
    expect(waterProgress(2000).status).toBe("At the day's mark");
    expect(waterProgress(2500).status).toBe('500 ml over');

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

  it('draws the charts with the svg already in the app, using the stats palette', () => {
    const charts = readFileSync('src/ui/NutritionCharts.tsx', 'utf8');
    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    expect(charts).toContain('<ReadingChart');
    expect(readFileSync('src/ui/ReadingChart.tsx', 'utf8')).toContain("from 'react-native-svg'");
    expect(charts).toContain('statsToneColors');
    expect(charts).toContain('<ProgressRing');
    expect(charts).toContain('<CompareBars');
    expect(charts).not.toContain('MacroDonut');
    expect(charts).not.toMatch(/victory-native|gifted-charts|expo-linear-gradient/);
    expect(charts).not.toMatch(/danger|#f00|#ff0000|\bred\b/i);
    expect(charts).not.toMatch(/\bfetch\(|\bawait\b/);
    expect(readFileSync('src/ui/BodyComposition.tsx', 'utf8')).toContain('<RangeTrack');
    expect(readFileSync('src/ui/StatTile.tsx', 'utf8')).toContain('router.push(tile.href');
    expect(screen).toContain('<NutritionBoard');
    expect(screen).toContain('<WeightTrendChart');
    expect(screen).toContain('<WaterMeter');
    const at = (needle: string) => screen.indexOf(needle);
    const log = at('variant="label">Log a meal');
    const body = at('<BodyCompositionCard');
    const goal = at('<GoalChoices');
    const logged = at('variant="label">Logged today');
    const summary = at('variant="label">Today');
    const board = at('<NutritionBoard');
    const water = at('variant="label">Water');
    const weight = at('variant="label">Weight');
    const wagon = at('<WagonFlag');
    const sharing = at('<NutritionShareSummary');
    expect(log).toBeGreaterThan(-1);
    expect(log).toBeLessThan(logged);
    expect(logged).toBeLessThan(body);
    expect(body).toBeLessThan(goal);
    expect(goal).toBeLessThan(summary);
    expect(summary).toBeLessThan(board);
    expect(board).toBeLessThan(water);
    expect(water).toBeLessThan(weight);
    expect(weight).toBeLessThan(wagon);
    expect(wagon).toBeLessThan(sharing);
    expect(screen.slice(body - 80, body)).toContain('id="body"');
    expect(readFileSync('src/domain/statsOverview.ts', 'utf8')).toContain("href: '/nutrition?section=body'");
    const scroller = readFileSync('src/ui/ScrollTarget.tsx', 'utf8');
    expect(scroller).toContain('querySelectorAll(`[id="section-${id}"]`)');
    expect(scroller).toContain('scrollIntoView');
    expect(screen.slice(logged, body)).toContain("Share today's meals");
    expect(screen.slice(summary, board)).toContain('Share daily calories and macros');
    expect(screen.slice(board, water)).toContain('Share food quality');
    expect(screen.slice(board, water)).toContain('Share progress and streaks');
    expect(screen.slice(goal, summary)).toContain('Share the goal and progress');
    expect(screen.slice(goal, summary)).toContain('Saved ✓');
    expect(screen.slice(goal, summary)).toContain('Last updated');
    expect(screen.slice(goal, summary)).toContain('formatUkCompactWhen');
    expect(screen).toContain("pending={isPending('suggest')}");
  });

  it('shows a ready tick in the log box and a retry when the estimate fails', () => {
    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const status = readFileSync('src/ui/MealEstimateStatus.tsx', 'utf8');
    const log = screen.slice(screen.indexOf('variant="label">Log a meal'), screen.indexOf('variant="label">Logged today'));
    expect(status).toContain('Estimate ready - see below');
    expect(status).toContain('Estimating...');
    expect(status).toContain('statsToneColors');
    expect(status).toContain('color: green');
    expect(status).toContain('<PlanTick done');
    expect(status).toContain('<ErrorNote');
    expect(status).toContain('label="Try again"');
    expect(status).not.toContain('saveFoodLog');
    expect(log).toContain('<MealEstimateStatus');
    const estimateButton = log.indexOf('label="Estimate from text"');
    const statusAt = log.indexOf('<MealEstimateStatus');
    const photoAt = log.indexOf('label="Take a photo"');
    expect(estimateButton).toBeGreaterThan(-1);
    expect(statusAt).toBeGreaterThan(estimateButton);
    expect(photoAt).toBeGreaterThan(statusAt);
    expect(log).toContain('ready={estimateReady && draft?.estimated === true}');
    expect(log).toContain('error={estimateError}');
    expect(log).toContain('pendingLabel="Estimating..."');
    expect(log).toContain('nativeID="meal-estimate-confirm"');
    expect(log).toContain('{ESTIMATE_LABEL}');
    expect(log).toContain('label="Save meal"');
    expect(log).toContain('setEstimateReady(false)');
    expect(log).not.toContain('saveFoodLog');
    const showEstimate = screen.slice(screen.indexOf('function scrollToEstimate'), screen.indexOf('function scrollToSavedDay'));
    expect(showEstimate).toContain("getElementById('meal-estimate-confirm')?.scrollIntoView");
    expect(status).toContain('label="Show estimate"');
    expect(status).toContain('onPress={onShow}');
    expect(screen).toContain('onShow={estimateReady && draft?.estimated === true ? scrollToEstimate : undefined}');
    expect(screen).not.toContain('setPinEstimate');
    expect(screen).not.toContain('pinEstimate');
    expect(screen).toContain('failEstimate(');
    const textRead = screen.slice(screen.indexOf('function readText'), screen.indexOf('function readPhoto'));
    const photoRead = screen.slice(screen.indexOf('function readPhoto'), screen.indexOf('function samplePhoto'));
    const sampleRead = screen.slice(screen.indexOf('function samplePhoto'), screen.indexOf('function saveMeal'));
    expect(textRead).toContain('Keyboard.dismiss()');
    expect(textRead).toContain('text.trim().length < 2');
    expect(textRead.indexOf('failEstimate(')).toBeLessThan(textRead.indexOf('estimateMeal'));
    expect(textRead).toContain('failEstimate(');
    expect(photoRead).toContain('failEstimate(');
    expect(sampleRead).toContain('failEstimate(');
    expect(textRead).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
    expect(photoRead).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
    expect(sampleRead).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
    const saved = screen.slice(screen.indexOf('await repo.saveFoodLog'), screen.indexOf('setText('));
    expect(saved).toContain('setEstimateReady(false)');
    expect(screen).toContain('nothing is saved until you confirm it');
    expect(status).toContain('ESTIMATE_WAIT_NOTE');
    expect(status).toContain('{ESTIMATE_WAIT_NOTE}');
  });

  it('times out a slow meal estimate and does not log the meal', () => {
    const estimate = readFileSync('supabase/functions/estimate-meal/index.ts', 'utf8');
    const status = readFileSync('src/ui/MealEstimateStatus.tsx', 'utf8');
    const retry = readFileSync('src/domain/edgeRetry.ts', 'utf8');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const method = repo.slice(repo.indexOf('async estimateMeal'), repo.indexOf('async saveFoodLog'));
    const caller = repo.slice(repo.indexOf('private async callEdge'), repo.indexOf('async mintVoiceToken'));
    const send = repo.slice(repo.indexOf('async sendThumos'), repo.indexOf('private async accessToken'));
    const plan = repo.slice(repo.indexOf('async refreshHealthPlan'), repo.indexOf('async sharedNutrition'));
    const voice = repo.slice(repo.indexOf('async mintVoiceToken'), repo.indexOf('async reflectOnGratitude'));
    const logged = repo.slice(repo.indexOf('private rememberEdgeFailure'), repo.indexOf('private aiFailure'));
    expect(estimate).toContain('const ESTIMATE_PROVIDER_TIMEOUT_MS = 28_000');
    expect(estimate).toContain('signal: AbortSignal.timeout(ESTIMATE_PROVIDER_TIMEOUT_MS)');
    expect(estimate).toContain("source: 'local'");
    expect(retry).toContain("ESTIMATE_WAIT_NOTE = 'This can take up to 20 seconds.'");
    expect(status).toContain('{ESTIMATE_WAIT_NOTE}');
    expect(method).toContain('ai: true');
    expect(method).toContain('timeoutMs: ESTIMATE_CLIENT_TIMEOUT_MS');
    expect(caller).toContain('options?.ai ? await this.sessionForAiCall()');
    expect(method).not.toContain('logClientError');
    expect(method).not.toContain('rememberEdgeFailure');
    expect(send).toContain('sessionForAiCall');
    expect(send).not.toContain('accessToken()');
    expect(plan).toContain("callEdge('health-plan'");
    expect(plan).toContain('{ ai: true }');
    expect(voice).toContain("callEdge('thumos-voice-token', { mode })");
    expect(voice).not.toContain('ai: true');
    expect(logged).toContain('edgeFailureLog');
    expect(logged).not.toContain('imageBase64');
    expect(logged).not.toContain('text');
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
    expect(compositionShareLine({
      bodyFatPct: undefined as unknown as null,
      leanMassKg: undefined as unknown as null,
      waistCm: undefined as unknown as null,
      heightCm: undefined as unknown as null,
    })).toBeNull();
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
    expect(parseSharedNutrition({ composition: 'Body fat 15%.' })?.bodyFigures).toBe('Body fat 15%.');
    const figuresOnly = presentSharedNutrition(
      defaultNutritionSettings(),
      [],
      '2026-10-14',
      { bodyFatPct: 15, leanMassKg: 63, waistCm: 84, heightCm: 178, shareFigures: true },
    );
    expect(figuresOnly.progress).toBeNull();
    expect(figuresOnly.bodyFigures).toBe('Body fat 15%.');
    expect(presentSharedNutrition(
      defaultNutritionSettings(),
      [],
      '2026-10-14',
      { bodyFatPct: 15, heightCm: 178, shareFigures: false },
    ).bodyFigures).toBeNull();
  });

  it('keeps the body card free of photo estimation and reloads', () => {
    expect(screen).toContain('BMI_ONLY_NOTE');
    expect(BUILD_LABEL.muscular).toBe('Muscular / I lift weights');
    expect(BUILD_LABEL.carrying_extra).toBe('Carrying extra weight');
    expect(screen).toContain('BUILD_WHY');
    expect(screen).toContain('BUILD_LABEL');
    expect(BUILD_WHY).toContain('BMI category labels');
    expect(BUILD_WHY).toContain('protein suggestion');
    expect(BUILD_WHY).toContain('weight range and fitness comparisons');
    expect(BUILD_WHY).toContain('change it any time');
    expect(BUILD_WHY).toContain('do not see this choice');
    expect(screen).toContain("pending={isPending('body')}");
    expect(screen).toContain('setNutritionSettings');
    expect(screen).not.toMatch(/ImagePicker|launchCamera|expo-image-picker|estimateMeal|photoBase64/);
    expect(readFileSync('src/app/(main)/profile.tsx', 'utf8')).toContain('<BuildChoices');
    expect(readFileSync('supabase/functions/_shared/nutrition.ts', 'utf8')).toContain('use body fat before waist-to-height');
    expect(readFileSync('supabase/functions/_shared/thumos.ts', 'utf8')).toContain('nutritionLineCap');
    expect(readFileSync('supabase/functions/_shared/nutritionLoad.ts', 'utf8')).toContain("from('body_composition')");
    const save = repo.slice(repo.indexOf('async saveBodyComposition'), repo.indexOf('async sharedNutrition'));
    expect(save).toContain("from('body_composition').upsert");
    expect(save).not.toContain('this.refresh()');
    expect(repo).toContain('build: settings.build');
  });

  it('keeps BMI labels on for carrying extra weight and bases protein on a healthy weight', () => {
    const migration = readFileSync('supabase/migrations/20261017130000_build_carrying_extra.sql', 'utf8');
    expect(migration).toContain("build in ('muscular', 'average', 'slim', 'carrying_extra')");
    expect(migration).toContain('nutrition_settings_build_check');
    expect(migration).not.toMatch(/delete from/i);
    expect(migration).not.toMatch(/drop table/i);
    expect(isBodyBuild('carrying_extra')).toBe(true);
    expect(healthyTopKg(170)).toBe(72);
    expect(HEALTHY_BMI_TOP).toBe(24.9);

    const carrying = assessWeight({ weightKg: 110, heightCm: 170, build: 'carrying_extra', sex: 'male' });
    expect(carrying.hideBmiCategory).toBe(false);
    expect(carrying.underweight).toBe(false);
    expect(carrying.plain).toContain('Category labels stay on');
    const low = assessWeight({ weightKg: 50, heightCm: 175, build: 'carrying_extra', sex: 'male' });
    expect(low.underweight).toBe(true);
    expect(low.label).toBe('Below the healthy range');

    const above = proteinBasisKg({ weightKg: 110, heightCm: 170, build: 'carrying_extra' });
    expect(above).toEqual({ kg: 72, usedHealthyWeight: true });
    const inside = proteinBasisKg({ weightKg: 70, heightCm: 170, build: 'carrying_extra' });
    expect(inside).toEqual({ kg: 70, usedHealthyWeight: false });
    expect(proteinGramsFor('lose_weight', above.kg, 'carrying_extra')).toBe(115);
    expect(proteinGramsFor('lose_weight', 110, 'carrying_extra')).toBe(176);

    const shared = {
      goal: 'lose_weight' as const,
      weightKg: 110,
      heightCm: 170,
      age: 40,
      sex: 'male' as const,
      activeEnergyKcal: null,
    };
    const suggested = suggestGoalTargets({ ...shared, build: 'carrying_extra' });
    const ordinary = suggestGoalTargets({ ...shared, build: 'average' });
    expect(suggested.ok && suggested.suggestion.proteinG).toBe(115);
    expect(ordinary.ok && ordinary.suggestion.proteinG).toBe(176);
    if (!suggested.ok || !ordinary.ok) throw new Error('expected a suggestion');
    expect(suggested.suggestion.kcal).toBe(ordinary.suggestion.kcal);
    expect(suggested.suggestion.kcal).toBeGreaterThanOrEqual(suggested.suggestion.floor);
    expect(suggested.ok && suggested.suggestion.note).toContain(CARRYING_PROTEIN_NOTE);
    expect(suggested.ok && suggested.suggestion.note).toContain('not a crash diet');
    expect(suggested.ok && suggested.suggestion.note).toContain('Check with a doctor');
    const held = suggestGoalTargets({ ...shared, weightKg: 70, build: 'carrying_extra' });
    expect(held.ok && held.suggestion.proteinG).toBe(112);
    expect(held.ok && held.suggestion.note).not.toContain('rather than your full weight');

    const heavy = suggestGoalTargets({ ...shared, goal: 'elite_heavy_boxer', build: 'carrying_extra' });
    const heavyAverage = suggestGoalTargets({ ...shared, goal: 'elite_heavy_boxer', build: 'average' });
    expect(heavy.ok && heavy.suggestion.proteinG).toBe(158);
    if (!heavy.ok || !heavyAverage.ok) throw new Error('expected a suggestion');
    expect(heavy.suggestion.kcal).toBe(heavyAverage.suggestion.kcal);
    expect(heavy.suggestion.kcal).toBeGreaterThan(heavy.suggestion.bmr);

    const lines = nutritionContextLines({
      logs: [],
      settings: { ...defaultNutritionSettings(), build: 'carrying_extra', goalSex: 'male' },
      waterMl: 0,
      checkIns: [],
      soberDays: null,
      unitsAvoided: 0,
      today: '2026-10-17',
      body: { weightKg: 110, heightCm: 170, weights: [], bodyFatPct: null, leanMassKg: null, waistCm: null },
    });
    const text = lines.join('\n');
    expect(text).toContain(BUILD_LABEL.carrying_extra);
    expect(text).toContain(CARRYING_COACH_LINE);
    expect(text).toContain('BMI category labels stay on');
    expect(text).not.toContain('Do not call them overweight or obese from BMI.');
    expect(readFileSync('supabase/functions/_shared/nutrition.ts', 'utf8')).toContain('carrying extra weight');
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

describe('training nutrition goals', () => {
  const body = { weightKg: 80, heightCm: 180, age: 40, sex: 'male' as const, activeEnergyKcal: null };

  it('names the training goals in plain words and keeps the chips scrollable', () => {
    expect(GOAL_LABEL.elite_runner).toBe('Elite Athlete (Lean Runner etc.)');
    expect(GOAL_LABEL.body_builder).toBe('Body Builder');
    expect(GOAL_LABEL.elite_heavy_boxer).toBe('Elite Athlete (Heavy Weight Boxer)');
    expect(GOAL_LABEL.elite_middle_boxer).toBe('Elite Athlete (Middle Weight Boxer)');
    expect(GOAL_PLAIN.elite_runner).toMatch(/carbohydrate/i);
    expect(GOAL_PLAIN.body_builder).toMatch(/lean mass/i);
    expect(GOAL_PLAIN.elite_heavy_boxer).toMatch(/size and power/i);
    expect(GOAL_PLAIN.elite_middle_boxer).toMatch(/middleweight limit/i);
    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const goals = readFileSync('src/ui/GoalChoices.tsx', 'utf8');
    expect(screen).toContain('horizontal');
    expect(goals).toContain('GOAL_PLAIN[settings.goal]');
    expect(goals).toContain("flexWrap: 'wrap'");
    expect(screen).toContain('label="Daily carbohydrate (g)"');
    expect(screen).toContain('label="Daily fat (g)"');
    expect(screen).toContain('label="Middleweight limit (kg)"');
    expect(screen).toContain('COMPETITION_NOTE');
    expect(screen).toContain('PHASE_LABEL');
    expect(screen).toContain('compositionTrendLine');
    const columns = readFileSync('supabase/migrations/20261015170000_training_goals.sql', 'utf8');
    expect(columns).toContain('carb_target_g');
    expect(columns).toContain('fat_target_g');
    expect(columns).toContain('goal_phase');
    expect(columns).toContain('weight_class_kg');
    const sql = readFileSync('supabase/migrations/20261015180000_boxer_goals.sql', 'utf8');
    expect(sql).toContain('elite_heavy_boxer');
    expect(sql).toContain('elite_middle_boxer');
    expect(sql).toContain('Elite Athlete (Heavy Weight Boxer)');
    expect(sql).toContain('Elite Athlete (Middle Weight Boxer)');
    expect(sql).toContain('nutrition_goal_label');
    expect(sql).toContain("'elite_middle_boxer'");
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/delete from/i);
  });

  it('fuels a runner, and only eases intake when body fat or waist says there is room', () => {
    const steady = suggestGoalTargets({ ...body, goal: 'elite_runner' });
    expect(steady.ok).toBe(true);
    if (!steady.ok) return;
    expect(steady.suggestion.kcal).toBe(2682);
    expect(steady.suggestion.proteinG).toBe(136);
    expect(steady.suggestion.carbG).toBe(374);
    expect(steady.suggestion.fatG).toBe(71);
    expect(steady.suggestion.basis).toBe('bmi');
    expect(steady.suggestion.note).toContain('1.6 to 1.8');
    expect(steady.suggestion.note).toContain('Only BMI is available');
    expect(steady.suggestion.blockedLoss).toBe(false);

    const lean = suggestGoalTargets({ ...body, goal: 'elite_runner', bodyFatPct: 15, waistCm: 100 });
    expect(lean.ok && lean.suggestion.kcal).toBe(2682);
    expect(lean.ok && lean.suggestion.basis).toBe('body_fat');
    expect(lean.ok && lean.suggestion.note).toContain('Body fat is used before waist');

    const higher = suggestGoalTargets({ ...body, goal: 'elite_runner', bodyFatPct: 30 });
    expect(higher.ok && higher.suggestion.kcal).toBe(2482);
    expect(higher.ok && higher.suggestion.carbG).toBe(339);
    expect(higher.ok && higher.suggestion.note).not.toMatch(/dehydrat|sauna|skip meals/i);

    const waist = suggestGoalTargets({ ...body, goal: 'elite_runner', waistCm: 95 });
    expect(waist.ok && waist.suggestion.basis).toBe('waist');
    expect(waist.ok && waist.suggestion.kcal).toBe(2482);

    const lowFat = suggestGoalTargets({ ...body, goal: 'elite_runner', bodyFatPct: 5 });
    expect(lowFat.ok && lowFat.suggestion.kcal).toBe(2682);
    expect(lowFat.ok && lowFat.suggestion.note).toContain('already low');
    expect(proteinGramsFor('elite_runner', 80, 'muscular')).toBe(144);
  });

  it('offers a lean bulk or a modest cut, and keeps the underweight floor', () => {
    const bulk = suggestGoalTargets({ ...body, goal: 'body_builder', phase: 'surplus' });
    expect(bulk.ok && bulk.suggestion.kcal).toBe(2982);
    expect(bulk.ok && bulk.suggestion.proteinG).toBe(176);
    expect(bulk.ok && bulk.suggestion.carbG).toBe(285);
    expect(bulk.ok && bulk.suggestion.fatG).toBe(127);
    expect(bulk.ok && bulk.suggestion.note).toContain('2.0 to 2.4');
    const implied = suggestGoalTargets({ ...body, goal: 'body_builder' });
    expect(implied.ok && implied.suggestion.kcal).toBe(2982);
    expect(implied.ok && implied.suggestion.note).toContain('until you choose a cut');
    const cut = suggestGoalTargets({ ...body, goal: 'body_builder', phase: 'cut', bodyFatPct: 18 });
    expect(cut.ok && cut.suggestion.kcal).toBe(2382);
    expect(cut.ok && cut.suggestion.proteinG).toBe(192);
    expect(cut.ok && cut.suggestion.note).toContain('300 kcal');
    expect(proteinGramsFor('body_builder', 400, null, 'cut')).toBe(700);
    const blocked = suggestGoalTargets({
      goal: 'body_builder',
      weightKg: 50,
      heightCm: 175,
      age: 40,
      sex: 'male',
      activeEnergyKcal: null,
      phase: 'cut',
    });
    expect(blocked.ok && blocked.suggestion.blockedLoss).toBe(true);
    expect(blocked.ok && blocked.suggestion.note).toBe(LOW_BMI_NOTE);
    expect(blocked.ok && blocked.suggestion.kcal).toBeGreaterThan(2000);
    const trend = compositionTrendLine([
      { id: 'a', recordedOn: '2026-09-01', bodyFatPct: 18, leanMassKg: 62, waistCm: null, source: 'dexa', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'b', recordedOn: '2026-10-01', bodyFatPct: 16, leanMassKg: 63, waistCm: null, source: 'dexa', createdAt: '2026-10-01T00:00:00.000Z' },
    ], 'body_builder');
    expect(trend).toContain('Body fat is lower');
    expect(trend).toContain('Lean mass is higher');
  });

  it('builds a heavyweight and keeps a middleweight change small', () => {
    const heavy = suggestGoalTargets({ ...body, goal: 'elite_heavy_boxer' });
    expect(heavy.ok && heavy.suggestion.kcal).toBe(2882);
    expect(heavy.ok && heavy.suggestion.proteinG).toBe(176);
    expect(heavy.ok && heavy.suggestion.carbG).toBe(338);
    expect(heavy.ok && heavy.suggestion.fatG).toBe(92);
    expect(heavy.ok && heavy.suggestion.note).toContain('size and power');
    expect(heavy.ok && heavy.suggestion.note).toContain(COMPETITION_NOTE);
    expect(heavy.ok && heavy.suggestion.blockedLoss).toBe(false);
    const heavyBelow = suggestGoalTargets({ ...body, goal: 'elite_heavy_boxer', weightClassKg: 70, bodyFatPct: 14 });
    expect(heavyBelow.ok && heavyBelow.suggestion.kcal).toBe(2882);

    const middle = suggestGoalTargets({ ...body, goal: 'elite_middle_boxer' });
    expect(middle.ok && middle.suggestion.kcal).toBe(2482);
    expect(middle.ok && middle.suggestion.proteinG).toBe(160);
    expect(middle.ok && middle.suggestion.carbG).toBe(253);
    expect(middle.ok && middle.suggestion.fatG).toBe(92);
    expect(middle.ok && middle.suggestion.note).toContain('72.6 kg until you type your own');
    const under = suggestGoalTargets({ ...body, goal: 'elite_middle_boxer', weightClassKg: 82 });
    expect(under.ok && under.suggestion.kcal).toBe(2682);
    expect(under.ok && under.suggestion.carbG).toBe(281);
    expect(under.ok && under.suggestion.fatG).toBe(102);
    const near = suggestGoalTargets({ ...body, goal: 'elite_middle_boxer', weightClassKg: 79, bodyFatPct: 14 });
    expect(near.ok && near.suggestion.kcal).toBe(2482);
    expect(near.ok && near.suggestion.basis).toBe('body_fat');
    const far = suggestGoalTargets({ ...body, goal: 'elite_middle_boxer', weightClassKg: 70, bodyFatPct: 14 });
    expect(far.ok && far.suggestion.kcal).toBe(2482);
    expect(far.ok && far.suggestion.note).not.toMatch(/sauna|skip water|sweat/i);
    const lowFat = suggestGoalTargets({ ...body, goal: 'elite_middle_boxer', bodyFatPct: 5 });
    expect(lowFat.ok && lowFat.suggestion.kcal).toBe(2682);
    expect(lowFat.ok && lowFat.suggestion.note).toContain('already low');
    const low = suggestGoalTargets({
      goal: 'elite_middle_boxer',
      weightKg: 50,
      heightCm: 175,
      age: 40,
      sex: 'male',
      activeEnergyKcal: null,
      weightClassKg: 48,
    });
    expect(low.ok && low.suggestion.blockedLoss).toBe(true);
    expect(low.ok && low.suggestion.note).toBe(LOW_BMI_NOTE);
    expect(low.ok && low.suggestion.kcal).toBeGreaterThan(2000);
    const coach = nutritionContextLines({
      logs: [],
      settings: { ...defaultNutritionSettings(), goal: 'elite_middle_boxer', weightClassKg: 75 },
      waterMl: 0,
      checkIns: [],
      soberDays: 40,
      unitsAvoided: 0,
      today: '2026-10-14',
      body: { weightKg: 80, heightCm: 180, weights: [] },
    });
    const text = coach.join('\n');
    expect(text).toContain('alcohol-free');
    expect(text).toContain('coach');
    expect(text).not.toMatch(/have the first drink/i);
    expect(weightTrendLine([{ day: '2026-09-01', kg: 80 }, { day: '2026-10-01', kg: 79 }], 'elite_middle_boxer')).toContain('not a race');
    expect(weightTrendLine([{ day: '2026-09-01', kg: 80 }, { day: '2026-10-01', kg: 81 }], 'elite_heavy_boxer')).toContain('size and power');
    expect(proteinGramsFor('elite_heavy_boxer', 80, 'muscular')).toBe(176);
    expect(proteinGramsFor('elite_middle_boxer', 80, 'muscular')).toBe(176);
  });

  it('places the newer boxing classes between middleweight and heavyweight', () => {
    const order = NUTRITION_GOALS.filter((id) => id.includes('boxer'));
    expect(order).toEqual([
      'elite_feather_boxer',
      'elite_super_feather_boxer',
      'elite_light_boxer',
      'elite_super_light_boxer',
      'elite_welter_boxer',
      'elite_super_welter_boxer',
      'elite_middle_boxer',
      'elite_super_middle_boxer',
      'elite_light_heavy_boxer',
      'elite_cruiser_boxer',
      'elite_heavy_boxer',
    ]);
    expect(GOAL_LABEL.elite_feather_boxer).toBe('Elite Athlete (Featherweight Boxer)');
    expect(GOAL_LABEL.elite_super_light_boxer).toBe('Elite Athlete (Super Lightweight Boxer)');
    expect(GOAL_LABEL.elite_super_welter_boxer).toBe('Elite Athlete (Super Welterweight Boxer)');
    expect(GOAL_PLAIN.elite_feather_boxer).toContain('57.2 kg');
    expect(GOAL_PLAIN.elite_super_light_boxer).toContain('light welterweight');
    expect(GOAL_PLAIN.elite_super_welter_boxer).toContain('light middleweight');
    expect(GOAL_PLAIN.elite_welter_boxer).toContain('66.7 kg');
    expect(GOAL_LABEL.elite_super_middle_boxer).toBe('Elite Athlete (Super Middleweight Boxer)');
    expect(GOAL_LABEL.elite_light_heavy_boxer).toBe('Elite Athlete (Light Heavyweight Boxer)');
    expect(GOAL_LABEL.elite_cruiser_boxer).toBe('Elite Athlete (Cruiserweight Boxer)');
    expect(GOAL_LABEL.elite_heavy_boxer).toBe('Elite Athlete (Heavy Weight Boxer)');
    expect(GOAL_PLAIN.elite_super_middle_boxer).toContain('76.2 kg');
    expect(GOAL_PLAIN.elite_light_heavy_boxer).toContain('79.4 kg');
    expect(GOAL_PLAIN.elite_cruiser_boxer).toContain('90.7 kg');
    expect(`${GOAL_PLAIN.elite_super_middle_boxer} ${GOAL_PLAIN.elite_light_heavy_boxer} ${GOAL_PLAIN.elite_cruiser_boxer}`).toMatch(/BMI band/);
    expect(sheetClassKg('elite_super_middle_boxer', 70)).toBe(76.2);
    expect(sheetClassKg('elite_light_heavy_boxer', null)).toBe(79.4);
    expect(sheetClassKg('elite_cruiser_boxer', null)).toBe(90.7);
    expect(sheetClassKg('elite_heavy_boxer', 70)).toBeNull();
    expect(sheetClassKg('elite_middle_boxer', 75)).toBe(75);

    const above = suggestGoalTargets({ ...body, goal: 'elite_super_middle_boxer' });
    expect(above.ok && above.suggestion.kcal).toBe(2482);
    expect(above.ok && above.suggestion.proteinG).toBe(160);
    expect(above.ok && above.suggestion.note).toContain('76.2 kg (168 lb)');
    expect(above.ok && above.suggestion.note).toContain('200 kcal under maintenance');
    expect(above.ok && above.suggestion.note).toContain('Check with a doctor before big changes.');
    expect(above.ok && above.suggestion.note).toContain('will not plan a rapid cut, skipped meals, or dehydration');
    expect(above.ok && above.suggestion.note).not.toMatch(/spend .*sauna|skip water|sweat out/i);
    const light = suggestGoalTargets({ ...body, goal: 'elite_light_heavy_boxer', build: 'muscular' });
    expect(light.ok && light.suggestion.kcal).toBe(2482);
    expect(light.ok && light.suggestion.proteinG).toBe(176);
    expect(light.ok && light.suggestion.note).toContain('79.4 kg (175 lb)');
    expect(light.ok && light.suggestion.note).toContain('BMI band');
    const cruiser = suggestGoalTargets({ ...body, goal: 'elite_cruiser_boxer' });
    expect(cruiser.ok && cruiser.suggestion.kcal).toBe(2682);
    expect(cruiser.ok && cruiser.suggestion.note).toContain('90.7 kg (200 lb)');
    expect(cruiser.ok && cruiser.suggestion.note).toContain('stays at maintenance');
    const feather = suggestGoalTargets({ ...body, goal: 'elite_feather_boxer' });
    expect(feather.ok && feather.suggestion.kcal).toBe(2482);
    expect(feather.ok && feather.suggestion.note).toContain('57.2 kg (126 lb)');
    expect(feather.ok && feather.suggestion.note).toContain('200 kcal under maintenance');
    expect(feather.ok && feather.suggestion.note).not.toMatch(/spend .*sauna|skip water|sweat out/i);
    expect(sheetClassKg('elite_feather_boxer', 70)).toBe(57.2);
    expect(sheetClassKg('elite_welter_boxer', null)).toBe(66.7);
    const heavy = suggestGoalTargets({ ...body, goal: 'elite_heavy_boxer' });
    expect(heavy.ok && heavy.suggestion.kcal).toBe(2882);
    expect(heavy.ok && heavy.suggestion.note).toContain('size and power');
    expect(heavy.ok && heavy.suggestion.note).not.toContain('76.2 kg');

    const coach = goalCoachLines({ goal: 'elite_cruiser_boxer', goalPhase: null, weightClassKg: null }, false).join(' ');
    expect(coach).toContain('Elite Athlete (Cruiserweight Boxer)');
    expect(coach).toContain('reference only');
    expect(coach).toContain('doctor');
    expect(weightTrendLine([{ day: '2026-09-01', kg: 82 }, { day: '2026-10-01', kg: 81 }], 'elite_light_heavy_boxer')).toContain('79.4 kg');
    expect(weightTrendLine([{ day: '2026-09-01', kg: 82 }, { day: '2026-10-01', kg: 81 }], 'elite_light_heavy_boxer')).not.toMatch(/to lose|weight cut/i);

    const lower = readFileSync('supabase/migrations/20261017240000_lower_boxing_class_goals.sql', 'utf8');
    expect(lower).toContain("'elite_feather_boxer'");
    expect(lower).toContain("'elite_super_feather_boxer'");
    expect(lower).toContain("'elite_light_boxer'");
    expect(lower).toContain("'elite_super_light_boxer'");
    expect(lower).toContain("'elite_welter_boxer'");
    expect(lower).toContain("'elite_super_welter_boxer'");
    expect(lower).toContain("'elite_middle_boxer'");
    expect(lower).toContain("'elite_heavy_boxer'");
    expect(lower).toContain('Elite Athlete (Featherweight Boxer)');
    expect(lower).toContain('Not applied');
    expect(lower).not.toMatch(/drop table/i);
    expect(lower).not.toMatch(/delete from/i);
    const chips = readFileSync('src/ui/GoalChoices.tsx', 'utf8');
    expect(chips).toContain('Boxing weight classes');
    expect(chips).toContain('accessibilityState={{ expanded: boxingOpen }}');
    expect(chips).toContain('boxingChipLabel(option.id)');
    expect(chips).toContain('nestedScrollEnabled');
    const sql = readFileSync('supabase/migrations/20261017230000_boxing_class_goals.sql', 'utf8');
    expect(sql).toContain('nutrition_settings_goal_check');
    expect(sql).toContain("'elite_super_middle_boxer'");
    expect(sql).toContain("'elite_light_heavy_boxer'");
    expect(sql).toContain("'elite_cruiser_boxer'");
    expect(sql).toContain("'elite_heavy_boxer'");
    expect(sql).toContain('Elite Athlete (Super Middleweight Boxer)');
    expect(sql).toContain('Not applied');
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/delete from/i);
    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    expect(screen).toContain('isClassBoxer(settings.goal)');
    expect(screen).toContain('boxingClassWindow(settings.goal, settings.goalSex)');
  });
});

describe("today's meals on the log card", () => {
  function item(partial: Partial<FoodItem> & Pick<FoodItem, 'name' | 'kcal'>): FoodItem {
    return {
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

  it('lists only this person’s meals for the day, earliest first, with a running total', () => {
    const day = '2026-10-15';
    const logs = [
      log({
        id: 'dinner',
        eatenOn: day,
        meal: 'dinner',
        eatenAt: '2026-10-15T19:00:00.000Z',
        createdAt: '2026-10-15T19:01:00.000Z',
        items: [item({ name: 'Salmon', kcal: 400, proteinG: 30, saturatedG: 20 })],
      }),
      log({
        id: 'breakfast',
        eatenOn: day,
        meal: 'breakfast',
        eatenAt: '2026-10-15T08:00:00.000Z',
        createdAt: '2026-10-15T08:05:00.000Z',
        items: [item({ name: 'Porridge', kcal: 300, proteinG: 10, carbsG: 50, saturatedG: 5 })],
      }),
      log({
        id: 'snack',
        eatenOn: day,
        meal: 'snack',
        eatenAt: null,
        createdAt: '2026-10-15T15:00:00.000Z',
        note: 'Apple',
        items: [],
      }),
      log({
        id: 'other',
        userId: 'someone-else',
        eatenOn: day,
        meal: 'lunch',
        eatenAt: '2026-10-15T12:00:00.000Z',
        items: [item({ name: 'Secret lunch', kcal: 900, proteinG: 1 })],
      }),
      log({
        id: 'yesterday',
        eatenOn: '2026-10-14',
        meal: 'lunch',
        items: [item({ name: 'Yesterday', kcal: 100, proteinG: 1 })],
      }),
    ];
    const rows = todayMealRows(logs, day, 'user');
    expect(rows.map((row) => row.typeLabel)).toEqual(['Breakfast', 'Snack', 'Dinner']);
    expect(rows[0]).toMatchObject({ name: 'Porridge', kcal: 300 });
    expect(rows[1]?.name).toBe('Apple');
    expect(rows.map((row) => row.name).join(' ')).not.toContain('Secret');
    expect(rows.map((row) => row.name).join(' ')).not.toContain('Yesterday');
    const totals = todayMealTotals(logs, day, 'user');
    expect(totals).toEqual({ kcal: 700, proteinG: 40, carbsG: 50, fatG: 25 });
    expect(todayMealTotalLine(totals, false)).toBe('700 kcal · Protein 40 g · carbohydrate 50 g · fat 25 g');
    expect(todayMealTotalLine(totals, true)).not.toContain('kcal');
    expect(todayMealsNeedCollapse(5)).toBe(false);
    expect(todayMealsNeedCollapse(6)).toBe(true);
    expect(TODAY_MEALS_EMPTY).toBe('No meals logged yet today');
    expect(todayRing({
      hideCalories: false,
      kcal: 1680,
      kcalTarget: 2000,
      proteinG: 40,
      proteinTarget: null,
      logged: true,
    }).status).toBe('320 kcal left');
    expect(todayMealRows([], day, 'user')).toEqual([]);
    expect(rows.every((row) => row.previewUrl == null)).toBe(true);
  });

  it('shrinks logged meals to one row per day', () => {
    const today = '2026-10-17';
    const groups = mealDayGroups([
      log({ id: 'breakfast', eatenOn: '2026-10-16', meal: 'breakfast', items: [item({ name: 'Porridge', kcal: 400, proteinG: 12 })] }),
      log({ id: 'lunch', eatenOn: '2026-10-16', meal: 'lunch', items: [item({ name: 'Soup', kcal: 500, proteinG: 20 })] }),
      log({ id: 'dinner', eatenOn: '2026-10-16', meal: 'dinner', items: [item({ name: 'Fish', kcal: 920, proteinG: 40 })] }),
      log({ id: 'today', eatenOn: today, meal: 'breakfast', items: [item({ name: 'Eggs', kcal: 300, proteinG: 24 })] }),
      log({ id: 'other', userId: 'someone-else', eatenOn: '2026-10-16', meal: 'snack', items: [item({ name: 'Secret', kcal: 50, proteinG: 1 })] }),
      log({ id: 'last-year', eatenOn: '2025-10-16', meal: 'snack', items: [item({ name: 'Apple', kcal: 80, proteinG: 0 })] }),
    ], today, 'user', { kcalTarget: 2000, proteinTarget: 140 });
    expect(groups.map((group) => group.day)).toEqual([today, '2026-10-16', '2025-10-16']);
    expect(groups[0]?.isToday).toBe(true);
    expect(groups[1]?.isToday).toBe(false);
    expect(mealDayTitle('2026-10-16', today)).toBe('Fri 16 Oct');
    expect(groups[0]?.heading).toBe('Sat 17 Oct - 1 meal - 300 kcal');
    expect(groups[1]?.heading).toBe('Fri 16 Oct - 3 meals - 1,820 kcal');
    expect(groups[2]?.heading).toBe('Thu 16 Oct 2025 - 1 meal - 80 kcal');
    expect(groups.map((group) => group.heading).join(' ')).not.toContain('Secret');
    const friday = groups[1];
    expect(friday?.bars.map((bar) => bar.label)).toEqual([
      '1,820 of 2,000 kcal',
      'Protein 72 of 140 g',
    ]);
    expect(friday?.bars[0]?.zone).toBeCloseTo(2000 / 2000, 5);
    expect(friday?.bars[0]?.fill).toBeCloseTo(1820 / 2000, 5);
    const hidden = mealDayGroups([
      log({ eatenOn: '2026-10-16', meal: 'lunch', items: [item({ name: 'Soup', kcal: 500, proteinG: 20 })] }),
    ], today, 'user', { hideCalories: true });
    expect(hidden[0]?.heading).toBe('Fri 16 Oct - 1 meal');
    expect(hidden[0]?.bars.map((bar) => bar.key)).toEqual(['protein']);
    const plain = mealDayGroups([
      log({ eatenOn: '2026-10-16', meal: 'lunch', items: [item({ name: 'Soup', kcal: 500, proteinG: 20 })] }),
    ], today, 'user');
    expect(plain[0]?.bars.every((bar) => bar.zone == null)).toBe(true);
    expect(plain[0]?.bars[0]?.label).toBe('500 kcal');
    expect(mealDayGroups([], today, 'user')).toEqual([]);
    expect(mealDayGroups([
      log({ eatenOn: today, meal: 'snack', items: [item({ name: 'Apple', kcal: 80 })] }),
    ], today, '')).toEqual([]);
  });

  it('puts protein left beside the calorie ring, and a tick once the target is met', () => {
    const short = loggedProteinRing({ proteinG: 84.3, proteinTarget: 140 });
    expect(short).toEqual({ fill: 84.3 / 140, status: '55.7 g protein left', met: false });
    expect(loggedProteinRing({ proteinG: 0, proteinTarget: 140 })).toEqual({
      fill: 0,
      status: '140 g protein left',
      met: false,
    });
    expect(loggedProteinRing({ proteinG: 140, proteinTarget: 140 })).toEqual({
      fill: 1,
      status: PROTEIN_TARGET_MET,
      met: true,
    });
    const over = loggedProteinRing({ proteinG: 160.4, proteinTarget: 140 });
    expect(over).toEqual({ fill: 1, status: PROTEIN_TARGET_MET, met: true });
    expect(over?.status).not.toMatch(/-/);
    expect(loggedProteinRing({ proteinG: 40, proteinTarget: null })).toBeNull();
    expect(loggedProteinRing({ proteinG: 40, proteinTarget: 0 })).toBeNull();

    const today = '2026-10-17';
    const groups = mealDayGroups([
      log({ eatenOn: today, meal: 'breakfast', items: [item({ name: 'Eggs', kcal: 1250, proteinG: 84.3 })] }),
    ], today, 'user', { kcalTarget: 2000, proteinTarget: 140 });
    expect(groups[0]?.bars.find((bar) => bar.key === 'protein')?.label).toBe('Protein 84.3 of 140 g');
    expect(loggedProteinRing({
      proteinG: groups[0]?.proteinG ?? 0,
      proteinTarget: 140,
    })?.status).toBe('55.7 g protein left');

    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const meals = readFileSync('src/ui/TodayMeals.tsx', 'utf8');
    expect(screen).toContain('loggedProteinRing({ proteinG: mealTotals.proteinG, proteinTarget: settings.proteinTarget })');
    expect(screen).toContain('protein={proteinRing}');
    expect(meals).toContain("flexWrap: 'wrap'");
    expect(meals).toContain('minWidth: 200');
    expect(meals).toContain('tick={protein.met}');
    expect(meals).toContain('theme.colors.ink');
    expect(meals).not.toContain('statsTone');
    expect(meals).not.toContain('statsPalette');
    expect(PROTEIN_TARGET_MET).toBe('Protein target met');
  });

  it('shows the last seven days, then another week on Show more', () => {
    const today = '2026-10-17';
    expect(MEAL_WEEK_DAYS).toBe(7);
    expect(MEAL_SHOW_MORE).toBe('Show more');
    expect(mealWeekCutoff(today, 1)).toBe('2026-10-11');
    expect(mealWeekCutoff(today, 2)).toBe('2026-10-04');
    expect(mealWeeksForDay(today, '2026-10-11')).toBe(1);
    expect(mealWeeksForDay(today, '2026-10-10')).toBe(2);
    expect(mealWeeksForDay(today, '2025-10-16')).toBeGreaterThan(2);
    const groups = mealDayGroups([
      log({ id: 'today', eatenOn: today, meal: 'breakfast', items: [item({ name: 'Eggs', kcal: 300, proteinG: 24 })] }),
      log({ id: 'in-week', eatenOn: '2026-10-14', meal: 'snack', items: [item({ name: 'Crisps', kcal: 180, proteinG: 2 })] }),
      log({ id: 'edge', eatenOn: '2026-10-11', meal: 'lunch', items: [item({ name: 'Soup', kcal: 400, proteinG: 15 })] }),
      log({ id: 'next', eatenOn: '2026-10-10', meal: 'lunch', items: [item({ name: 'Chicken', kcal: 165, proteinG: 31 })] }),
      log({ id: 'older', eatenOn: '2026-10-03', meal: 'dinner', items: [item({ name: 'Fish', kcal: 200, proteinG: 20 })] }),
      log({ id: 'secret', userId: 'someone-else', eatenOn: '2026-09-01', meal: 'snack', items: [item({ name: 'Secret', kcal: 50 })] }),
    ], today, 'user');
    const first = visibleMealDays(groups, today, 1);
    expect(first.visible.map((group) => group.day)).toEqual([today, '2026-10-14', '2026-10-11']);
    expect(first.visible[0]?.isToday).toBe(true);
    expect(first.hasMore).toBe(true);
    const afterOne = mealWeeksAfterShowMore(groups, today, 1);
    expect(afterOne).toBe(2);
    const second = visibleMealDays(groups, today, afterOne);
    expect(second.visible.map((group) => group.day)).toEqual([today, '2026-10-14', '2026-10-11', '2026-10-10']);
    expect(second.hasMore).toBe(true);
    const afterTwo = mealWeeksAfterShowMore(groups, today, afterOne);
    const third = visibleMealDays(groups, today, afterTwo);
    expect(third.visible.map((group) => group.day)).toContain('2026-10-03');
    expect(third.visible.map((group) => group.heading).join(' ')).not.toContain('Secret');
    expect(third.hasMore).toBe(false);
    expect(mealWeeksAfterShowMore(groups, today, afterTwo)).toBe(afterTwo);
    expect(visibleMealDays([], today, 1)).toEqual({ visible: [], hasMore: false });
  });

  it('passes the saved photo through and shows it on today’s row', () => {
    const day = '2026-10-15';
    const rows = todayMealRows([
      log({
        id: 'photo',
        eatenOn: day,
        meal: 'breakfast',
        previewUrl: 'https://signed.example/eggs.jpg',
        items: [item({ name: 'Eggs', kcal: 300 })],
      }),
      log({
        id: 'plain',
        eatenOn: day,
        meal: 'lunch',
        items: [item({ name: 'Soup', kcal: 200 })],
      }),
    ], day, 'user');
    expect(rows[0]?.previewUrl).toBe('https://signed.example/eggs.jpg');
    expect(rows[1]?.previewUrl).toBeNull();
    const meals = readFileSync('src/ui/TodayMeals.tsx', 'utf8');
    expect(meals).toContain('<OwnerPhoto');
    expect(meals).toContain('row.previewUrl');
    expect(meals).toContain('accessibilityLabel="Saved meal photo"');
    expect(meals).toContain('contentFit="cover"');
    expect(meals).toContain('width: 96');
    expect(meals).toContain('height: 96');
    expect(meals).toContain('borderRadius: 10');
    expect(meals).toContain('onOpen(row.id)');
  });

  it('sits under Log a meal and the confirm card, above Body, and stays monochrome', () => {
    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const meals = readFileSync('src/ui/TodayMeals.tsx', 'utf8');
    const log = screen.indexOf('variant="label">Log a meal');
    const confirm = screen.indexOf('Confirm this meal');
    const logged = screen.indexOf('variant="label">Logged today');
    const body = screen.indexOf('<BodyCompositionCard');
    expect(log).toBeGreaterThan(-1);
    expect(log).toBeLessThan(confirm);
    expect(confirm).toBeLessThan(logged);
    expect(logged).toBeLessThan(body);
    expect(screen.slice(log, confirm)).not.toContain('<TodayMeals');
    expect(screen.slice(logged, body)).toContain('<TodayMeals');
    const renderLog = screen.slice(screen.indexOf('function renderLog'), screen.indexOf('function kcalFromField'));
    expect(renderLog).toContain('<MealBreakdown');
    expect(renderLog).toContain('mealNutrientBars(log.items)');
    expect(renderLog).toContain('startOpen={false}');
    expect(screen.slice(log, logged)).toContain('<PlanTick done />');
    expect(screen.slice(log, logged)).toContain('{savedDayNote}');
    expect(screen.slice(log, logged)).toContain('label="View in list"');
    expect(screen.slice(logged, body)).not.toContain('scrollIntoView');
    expect(screen.slice(logged, body)).toContain('>Earlier<');
    expect(screen.slice(logged, body)).toContain("Share today's meals");
    const save = screen.slice(screen.indexOf('function saveMeal'), screen.indexOf('function saveEdited'));
    expect(save).toContain('setMealSavedAt(Date.now())');
    expect(save).toContain('setRevealId(id)');
    expect(save).toContain('recentDuplicateMeal');
    expect(screen).toContain('DUPLICATE_MEAL_PROMPT');
    expect(screen).toContain("label=\"Add anyway\"");
    const viewInList = screen.slice(screen.indexOf('function scrollToSavedDay'), screen.indexOf('function floorFor'));
    expect(viewInList).toContain("getElementById('saved-meal-row')");
    expect(viewInList).toContain('scrollIntoView');
    expect(viewInList).toContain('getElementById(`meal-day-${revealDay}`)');
    expect(screen).toContain('onPress={scrollToSavedDay}');
    expect(screen).not.toContain('}, [revealId, revealDay, scroller]');
    expect(screen).toContain('todayMealRows(snap.foodLogs');
    expect(screen).toContain("setEditAnchor('summary')");
    expect(screen).toContain('<MealEdit');
    expect(meals).toContain('TODAY_MEALS_EMPTY');
    expect(meals).toContain("Hide today's meals");
    expect(meals).toContain('bare');
    expect(meals).toContain('saved-meal-row');
    const days = readFileSync('src/ui/MealDayList.tsx', 'utf8');
    expect(screen).toContain('mealDayGroups(');
    expect(screen).toContain('visibleMealDays(');
    expect(screen).toContain('mealWeeksAfterShowMore(');
    expect(screen).toContain('useState(1)');
    expect(screen).toContain('label={MEAL_SHOW_MORE}');
    expect(screen).toContain('<MealDayList');
    expect(screen).toContain('bare');
    expect(screen).toContain('TODAY_MEALS_EMPTY');
    expect(screen.slice(logged, body)).toContain('renderLog(log, false)');
    expect(days).toContain('useState(group.isToday || pinned)');
    expect(days).toContain('accessibilityState={{ expanded: open }}');
    expect(days).toContain("open ? 'Hide' : 'Show'");
    expect(days).toContain('group.heading');
    expect(days).toContain('<MealNutrientBars');
    expect(days).not.toContain('statsTone');
    expect(days).not.toContain('ShareOnProfile');
    expect(readFileSync('src/ui/NutritionShare.tsx', 'utf8')).not.toContain('MealDayList');
    expect(meals).not.toContain('statsTone');
    expect(meals).not.toContain('statsPalette');
    expect(NUTRITION_BREAKDOWN_LABEL).toBe('Nutrition breakdown');
    expect(meals).toContain('MealBreakdown');
    expect(meals).toContain('mealChartStartsOpen');
    const bars = readFileSync('src/ui/MealNutrientBars.tsx', 'utf8');
    expect(bars).toContain('NUTRITION_BREAKDOWN_LABEL');
    expect(bars).toContain('Hide nutrition breakdown');
    expect(bars).not.toContain('statsTone');
    expect(bars).not.toContain('statsPalette');
    expect(bars).toContain('theme.colors.ink');
    expect(bars).toContain('bar.label');
    expect(readFileSync('src/app/(main)/home.tsx', 'utf8')).not.toContain('NutritionToday');
  });

  it('asks before saving the same meal again within a couple of minutes', () => {
    const now = Date.parse('2026-10-15T12:02:00.000Z');
    const eggs = item({ name: '4 eggs', kcal: 312 });
    const logged = log({
      eatenOn: '2026-10-15',
      meal: 'breakfast',
      createdAt: '2026-10-15T12:00:30.000Z',
      items: [eggs],
    });
    const again = { meal: 'breakfast' as const, note: '', items: [eggs] };
    expect(DUPLICATE_MEAL_PROMPT).toBe('Looks like you just logged this — add anyway?');
    expect(RECENT_MEAL_WINDOW_MS).toBe(2 * 60 * 1000);
    expect(recentDuplicateMeal([logged], 'user', again, now)).toBe(true);
    expect(recentDuplicateMeal([logged], 'user', { ...again, meal: 'lunch' }, now)).toBe(false);
    expect(recentDuplicateMeal([logged], 'user', { ...again, items: [item({ name: '4 eggs', kcal: 280 })] }, now)).toBe(false);
    expect(recentDuplicateMeal([logged], 'user', { ...again, items: [item({ name: '3 eggs', kcal: 312 })] }, now)).toBe(false);
    expect(recentDuplicateMeal([logged], 'user', { ...again, items: [item({ name: '4 Eggs', kcal: 312 })] }, now)).toBe(true);
    expect(recentDuplicateMeal([logged], 'someone-else', again, now)).toBe(false);
    expect(recentDuplicateMeal([logged], 'user', again, now + RECENT_MEAL_WINDOW_MS + 1)).toBe(false);
    const noted = log({
      eatenOn: '2026-10-15',
      meal: 'breakfast',
      createdAt: '2026-10-15T12:00:00.000Z',
      note: '4 eggs',
      items: [],
    });
    expect(recentDuplicateMeal([noted], 'user', { meal: 'breakfast', note: '4 eggs', items: [] }, now)).toBe(true);
  });

  it('draws a compact bar for each stored nutrient and leaves out anything missing', () => {
    const porridge = estimateFromText('porridge and a banana');
    const labels = mealNutrientBars(porridge).map((bar) => bar.label);
    expect(labels).toContain('Protein 7.2 g');
    expect(labels).toContain('Carbs 51 g');
    expect(labels).toContain('Sugars 13 g · Within 27 g');
    expect(labels).toContain('Total fat 2.8 g · Within 21 g');
    expect(labels).toContain('Saturated fat 0.7 g · Within 6 g');
    expect(labels).toContain('Fibre 5.6 g');
    expect(labels).toContain('Salt 0.1 g · Within 1.8 g');
    expect(labels).toContain('Processed food level Low');
    expect(labels.join(' ')).not.toMatch(/\b0 g\b/);
    const crisps = mealNutrientBars(estimateFromText('crisps'));
    expect(crisps.map((bar) => bar.label)).toContain('Processed food level High');
    expect(crisps.find((bar) => bar.key === 'saturated')?.zone).toBeGreaterThan(0);
    const mixed = mealNutrientBars([
      ...estimateFromText('chicken'),
      ...estimateFromText('crisps'),
    ]);
    expect(processedFoodLevel(estimateFromText('chicken'))).toBe('Low');
    expect(mixed.map((bar) => bar.label)).toContain('Processed food level Medium');
    const chocolate = mealNutrientBars(estimateFromText('chocolate'));
    expect(chocolate.map((bar) => bar.label)).toContain('Saturated fat 7 g · Above 6 g');
    const partial = foodItemFromUnknown({ name: 'Soup', kcal: 200, proteinG: 8 });
    expect(partial).not.toBeNull();
    const partialBars = mealNutrientBars(partial ? [partial] : []);
    expect(partialBars.map((bar) => bar.label)).toEqual(['Protein 8 g']);
    const empty = foodItemFromUnknown({ name: 'Soup', kcal: 200 });
    expect(mealNutrientBars(empty ? [empty] : [])).toEqual([]);
    const unknown = estimateFromText('mystery stew');
    expect(unknown[0]?.known).toEqual([]);
    expect(mealNutrientBars(unknown)).toEqual([]);
    expect(mealChartStartsOpen(0, 2)).toBe(true);
    expect(mealChartStartsOpen(0, 3)).toBe(false);
    expect(mealChartStartsOpen(1, 3)).toBe(true);
    expect(mealChartStartsOpen(2, 3)).toBe(true);
    expect(formatGrams(1.8)).toBe('1.8');
  });

  it('fills nutrients the model left off a known food, and keeps figures it did send', () => {
    expect(MEAL_ESTIMATE_PROMPT).toContain('Leave a key out only when it cannot be estimated');
    expect(MEAL_ESTIMATE_PROMPT).toContain('sodiumMg');
    const egg = parseMealEstimate({ items: [{ name: 'Egg', kcal: 78, proteinG: 6.4 }] });
    expect(egg?.[0]?.proteinG).toBe(6.4);
    expect(egg?.[0]?.saturatedG).toBe(1.6);
    expect(egg?.[0]?.sodiumMg).toBe(70);
    expect(egg?.[0]?.processedKnown).toBe(true);
    expect(mealNutrientBars(egg ?? []).map((bar) => bar.label)).toContain('Saturated fat 1.6 g · Within 6 g');
    expect(mealNutrientBars(egg ?? []).map((bar) => bar.label).join(' ')).not.toContain('Sugars');
    const kept = parseMealEstimate({ items: [{ name: 'Egg', kcal: 78, proteinG: 6.4, sugarG: 2 }] });
    expect(kept?.[0]?.sugarG).toBe(2);
    const dish = parseMealEstimate({ items: [{ name: 'Egg fried rice', kcal: 400, proteinG: 12 }] });
    expect(dish?.[0]?.saturatedG).toBe(0);
    expect(dish?.[0]?.known).toEqual(['proteinG']);
    expect(mealNutrientBars(dish ?? []).map((bar) => bar.label)).toEqual(['Protein 12 g']);
  });
});

describe('shared meal photos', () => {
  const breakfast = '11111111-1111-4111-8111-111111111111';
  const lunch = '22222222-2222-4222-8222-222222222222';

  it('keeps today photos behind Share today meals and drops everything else', () => {
    const today = '2026-10-16';
    const logs = [
      log({ id: breakfast, eatenOn: today, meal: 'breakfast', previewUrl: 'https://photos.example/breakfast.jpg' }),
      log({ id: lunch, eatenOn: today, meal: 'lunch', previewUrl: null }),
      log({ id: '33333333-3333-4333-8333-333333333333', eatenOn: '2026-10-15', meal: 'dinner', previewUrl: 'https://photos.example/yesterday.jpg' }),
      log({ id: 'not-a-photo', eatenOn: today, meal: 'snack', previewUrl: 'user/secret.jpg' }),
    ];
    const hidden = presentSharedNutrition(defaultNutritionSettings(), logs, today);
    expect(hidden.mealPhotos).toBeNull();
    expect(JSON.stringify(hidden)).not.toContain('photos.example');
    expect(JSON.stringify(hidden)).not.toContain('secret');

    const shared = presentSharedNutrition({ ...defaultNutritionSettings(), shareFoodDiary: true }, logs, today);
    expect(shared.mealPhotos).toEqual([
      { id: breakfast, meal: 'Breakfast', url: 'https://photos.example/breakfast.jpg' },
    ]);
    expect(shared.meals?.map((meal) => meal.meal)).toEqual(['Breakfast', 'Lunch', 'Snack']);
    expect(JSON.stringify(shared)).not.toContain('yesterday');
    expect(JSON.stringify(shared)).not.toContain('secret');
  });

  it('reads photo ids from shared nutrition and ignores a link in the payload', () => {
    const blocked = parseSharedNutrition({
      mealsShared: false,
      meals: [],
      mealPhotos: [{ id: breakfast, meal: 'breakfast', url: 'https://photos.example/secret.jpg', photo_path: 'owner/secret.jpg' }],
    });
    expect(blocked?.mealPhotos).toBeNull();
    expect(JSON.stringify(blocked)).not.toContain('secret');

    const parsed = parseSharedNutrition({
      mealsShared: true,
      meals: [],
      mealPhotos: [
        { id: breakfast, meal: 'breakfast', url: 'https://photos.example/secret.jpg', photo_path: 'owner/secret.jpg' },
        { id: 'not-an-id', meal: 'lunch' },
        { id: lunch, meal: 'side' },
      ],
    });
    expect(parsed?.mealPhotos).toEqual([{ id: breakfast, meal: 'Breakfast', url: '' }]);
    expect(JSON.stringify(parsed)).not.toContain('secret');
    expect(JSON.stringify(parsed)).not.toContain('photo_path');
  });

  it('limits other members to photos of meals shared today', () => {
    const sql = readFileSync('supabase/migrations/20261016140000_shared_meal_photos.sql', 'utf8');
    const photos = sql.slice(sql.indexOf("'id', f.id"), sql.indexOf('order by f.created_at'));
    const gate = sql.slice(sql.indexOf('function public.food_photo_shared'));
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const signer = repo.slice(repo.indexOf('async sharedNutrition'), repo.indexOf('async sharedHealthPlan'));
    const board = readFileSync('src/ui/ProfileStatTiles.tsx', 'utf8');
    const card = readFileSync('src/ui/PublicProfileCard.tsx', 'utf8');
    const people = readFileSync('src/ui/CommunityProfile.tsx', 'utf8');

    expect(sql).toContain("'mealPhotos'");
    expect(sql).toContain('case when share_meals then photos else null end');
    expect(photos).not.toContain('photo_path');
    expect(sql).toContain("f.photo_path = f.user_id::text || '/' || f.id::text || '.jpg'");
    expect(sql).toContain('f.eaten_on = london');
    expect(gate).toContain('share_food_diary is true');
    expect(gate).toContain('viewer_in_community()');
    expect(gate).toContain('community_visible is true');
    expect(gate).toContain('age_confirmed_18 is true');
    expect(gate).toContain('public.blocks');
    expect(gate).toContain("eaten_on = (timezone('Europe/London', now()))::date");
    expect(gate).toContain('food_photos_storage_shared_read');
    expect(gate).not.toMatch(/grant select on public\.food_logs/i);
    expect(gate).not.toMatch(/grant select on storage\.objects/i);
    expect(signer.indexOf("rpc('shared_nutrition'")).toBeLessThan(signer.indexOf('createSignedUrls'));
    expect(signer).toContain('mealPhotos: []');
    expect(signer).not.toContain('console.');
    expect(board).toContain('mealPhotos');
    expect(board).toContain('accessibilityLabel={`${photo.meal} photo`}');
    expect(board).toContain('borderRadius: 12');
    expect(board).toContain('contentFit="contain"');
    expect(board).toContain('accessibilityLabel="Close"');
    expect(board).not.toContain('photo_path');
    expect(card).toContain('mealPhotos={preview.mealPhotos}');
    expect(people).toContain('mealPhotos: nutrition.mealPhotos');
    expect(people).toContain('mealPhotos={shown.mealPhotos}');
  });
});

function eatenAtOf(day: string, slot: MealSlot, now: Date): string {
  const stamp = mealEatenStamp(day, slot, now);
  if ('error' in stamp) throw new Error(stamp.error);
  return stamp.eatenAt;
}

describe('logging a meal on another day', () => {
  const midnight = new Date('2026-10-17T23:30:00.000Z');

  it('keeps today on the London date across midnight, BST, and GMT', () => {
    expect(MEAL_LOG_LOOKBACK_DAYS).toBe(30);
    expect(mealLogWindow(midnight)).toEqual({
      today: '2026-10-18',
      yesterday: '2026-10-17',
      earliest: '2026-09-18',
    });
    expect(londonDay(midnight)).toBe('2026-10-18');
    expect(mealLogWindow(new Date('2026-10-25T00:30:00.000Z')).today).toBe('2026-10-25');
    expect(mealLogWindow(new Date('2026-10-24T23:30:00.000Z')).today).toBe('2026-10-25');
    expect(mealLogWindow(new Date('2026-03-29T00:30:00.000Z')).today).toBe('2026-03-29');
    expect(mealLogWindow(new Date('2026-01-15T00:30:00.000Z')).today).toBe('2026-01-15');
  });

  it('stores the London meal time on the chosen day, not the moment of the tap', () => {
    const breakfast = mealEatenStamp('2026-10-17', 'breakfast', midnight);
    expect(breakfast).toEqual({ eatenOn: '2026-10-17', eatenAt: '2026-10-17T07:00:00.000Z' });
    if (!('error' in breakfast)) {
      expect(londonDay(breakfast.eatenAt)).toBe('2026-10-17');
      expect(londonClock(breakfast.eatenAt)).toBe('08:00');
    }
    expect(eatenAtOf('2026-10-17', 'lunch', midnight)).toBe('2026-10-17T11:30:00.000Z');
    expect(eatenAtOf('2026-10-17', 'snack', midnight)).toBe('2026-10-17T14:30:00.000Z');
    expect(mealEatenStamp('2026-10-17', 'dinner', midnight)).toEqual({
      eatenOn: '2026-10-17',
      eatenAt: '2026-10-17T17:30:00.000Z',
    });
    expect(mealEatenStamp('2026-11-17', 'breakfast', new Date('2026-11-17T12:00:00.000Z'))).toEqual({
      eatenOn: '2026-11-17',
      eatenAt: '2026-11-17T08:00:00.000Z',
    });
    expect(eatenAtOf('2026-10-24', 'dinner', new Date('2026-10-24T12:00:00.000Z'))).toBe('2026-10-24T17:30:00.000Z');
    expect(eatenAtOf('2026-10-25', 'breakfast', new Date('2026-10-25T12:00:00.000Z'))).toBe('2026-10-25T08:00:00.000Z');
    expect(eatenAtOf('2026-03-28', 'dinner', new Date('2026-03-28T12:00:00.000Z'))).toBe('2026-03-28T18:30:00.000Z');
    expect(eatenAtOf('2026-03-29', 'breakfast', new Date('2026-03-29T12:00:00.000Z'))).toBe('2026-03-29T07:00:00.000Z');
    expect(storedMealInstant({ eatenOn: '2026-10-17', meal: 'breakfast' })).toBe('2026-10-17T07:00:00.000Z');
    expect(mealEatenStamp('2026-10-19', 'lunch', midnight)).toEqual({ error: 'Choose today or a day in the last 30 days.' });
    expect(mealLogDayAllowed('2026-09-18', midnight)).toBe(true);
    expect(mealLogDayAllowed('2026-09-17', midnight)).toBe(false);
    expect(mealDayChangeAllowed('2026-08-01', '2026-08-01', midnight)).toBe(true);
    expect(mealLoggingLabel('2026-10-16', midnight)).toBe('Logging for Fri 16 Oct');
    expect(mealAddedLabel('2026-10-16', midnight)).toBe('Added to Fri 16 Oct, see below');
  });

  it('counts the meal on that day for the list, the week, and leaves it off the public profile', () => {
    const friday = log({
      id: '11111111-1111-4111-8111-111111111116',
      eatenOn: '2026-10-16',
      meal: 'dinner',
      items: [{
        name: 'Fish',
        kcal: 500,
        proteinG: 40,
        carbsG: 0,
        sugarG: 0,
        fibreG: 0,
        unsaturatedG: 0,
        saturatedG: 0,
        transG: 0,
        sodiumMg: 0,
        processed: false,
      }],
      createdAt: '2026-10-17T23:30:00.000Z',
    });
    const groups = mealDayGroups([friday], '2026-10-18', 'user');
    expect(groups.map((group) => group.day)).toEqual(['2026-10-16']);
    expect(groups[0]?.proteinG).toBe(40);
    expect(groups[0]?.isToday).toBe(false);
    const week = figuresForLondonWeek({ now: midnight, logs: [friday], health: [], checkIns: [] });
    expect(week.week.days).toContain('2026-10-16');
    expect(week.weekProtein).toEqual([40]);
    expect(week.todayProtein).toBe(0);
    expect(dayItems([friday], '2026-10-16')).toHaveLength(1);
    expect(dayItems([friday], '2026-10-18')).toHaveLength(0);
    const shared = presentSharedNutrition({ ...defaultNutritionSettings(), shareFoodDiary: true }, [friday], '2026-10-18');
    expect(shared.meals).toEqual([]);
    expect(shared.mealPhotos).toEqual([]);
  });

  it('offers the day on every log route and does not need a new column or a function change', () => {
    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const log = screen.slice(screen.indexOf('variant="label">Log a meal'), screen.indexOf('variant="label">Logged today'));
    expect(log).toContain('variant="label">Day');
    expect(log).toContain('label="Today"');
    expect(log).toContain('label="Yesterday"');
    expect(log).toContain('label="Earlier day"');
    expect(log).toContain('mealLoggingLabel(logDay, new Date())');
    expect(log).toContain('<PlanTick done />');
    expect(log).toContain('{savedDayNote}');
    expect(log).toContain('label="View in list"');
    expect(screen).toContain('mealAddedLabel(stamp.eatenOn, new Date())');
    expect(screen).toContain('mealEatenStamp(logDay, draft.meal, new Date())');
    expect(screen).toContain('eatenAt: stamp.eatenAt');
    expect(screen).toContain('londonDay(new Date())');
    expect(screen).toContain('holdPlace');
    expect(readFileSync('src/ui/ui.tsx', 'utf8')).toContain('maintainVisibleContentPosition={holdPlace ? { minIndexForVisible: 0 } : undefined}');
    expect(readFileSync('src/ui/MealDayList.tsx', 'utf8')).toContain('nativeID={`meal-day-${group.day}`}');
    expect(screen).toContain('dayAnchorRef');
    const edit = readFileSync('src/ui/MealEdit.tsx', 'utf8');
    expect(edit).toContain('mealDayChangeAllowed');
    expect(edit).toContain('londonWallInstant');
    expect(edit).toContain('earliestDate={parseIsoDay(mealLogWindow(new Date()).earliest)}');
    const live = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const demo = readFileSync('src/data/demo-repository.ts', 'utf8');
    expect(live).toContain('eaten_at: storedMealInstant(input)');
    expect(demo).toContain('eatenAt: storedMealInstant(input)');
    expect(live).not.toContain('eaten_at: new Date().toISOString()');
    expect(demo).not.toContain('eatenAt: new Date().toISOString()');
    const estimate = readFileSync('supabase/functions/estimate-meal/index.ts', 'utf8');
    expect(estimate).not.toContain('food_logs');
    expect(estimate).not.toContain('eaten_on');
    expect(readFileSync('supabase/functions/_shared/nutritionLoad.ts', 'utf8')).toContain('eaten_on');
  });
});
