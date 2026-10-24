import { coachConsentAllows, type CoachConsentInput } from './coachConsent.ts';
import { buildFitnessSnapshot } from './fitnessSnapshot.ts';
import { goalWeightRange } from './goalWeightRange.ts';
import { figuresForLondonWeek, goalProgressLine } from './goalLed.ts';
import { londonDay } from './healthInsights.ts';
import { activityReadingsFromSamples } from './targetActivity.ts';
import {
  compositionForAssessment,
  defaultNutritionSettings,
  foodItemFromUnknown,
  isBodyBuild,
  isBodyCompositionSource,
  isBuilderPhase,
  isMealSlot,
  isNutritionGoal,
  isNutritionSex,
  lossBlocked,
  nutritionContextLines,
  parseBodyFatPct,
  parseLeanMassKg,
  parseWaistCm,
  parseWorkoutBuckets,
  weightPointsFrom,
  type BodyCompositionReading,
  type FoodItem,
  type FoodLog,
  type NutritionSettings,
} from './nutrition.ts';
import { savingsFromTypicalWeek } from './savings.ts';
import { soberElapsed } from './sober.ts';

type NutritionResult = { data: unknown; error: { message?: string } | null };

type NutritionFilter = PromiseLike<NutritionResult> & {
  eq(column: string, value: string): NutritionFilter;
  order(column: string, options: { ascending: boolean }): NutritionFilter;
  limit(count: number): NutritionFilter;
  maybeSingle(): Promise<NutritionResult>;
};

type NutritionClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): NutritionFilter;
    };
  };
};

function logsFromRows(rows: unknown): FoodLog[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    const meal = typeof record.meal === 'string' && isMealSlot(record.meal) ? record.meal : null;
    const eaten = typeof record.eaten_on === 'string' ? record.eaten_on.slice(0, 10) : '';
    if (!meal || !eaten) return [];
    const items = Array.isArray(record.items)
      ? record.items.map(foodItemFromUnknown).filter((item): item is FoodItem => item != null)
      : [];
    const source = record.source === 'photo' || record.source === 'text' || record.source === 'manual' ? record.source : 'manual';
    return [{
      id: typeof record.id === 'string' ? record.id : eaten,
      userId: '',
      eatenOn: eaten,
      meal,
      source,
      note: typeof record.note === 'string' ? record.note : '',
      items,
      estimated: record.estimated === true,
      eatenAt: typeof record.eaten_at === 'string' && record.eaten_at ? record.eaten_at : null,
      portion: typeof record.portion === 'number' && record.portion > 0 ? record.portion : 1,
      createdAt: typeof record.created_at === 'string' ? record.created_at : '',
      previewUrl: null,
    }];
  });
}

function optionalNumber(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : null;
  if (parsed == null || !Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function settingsFromRow(row: unknown): NutritionSettings {
  const base = defaultNutritionSettings();
  if (!row || typeof row !== 'object') return base;
  const record = row as Record<string, unknown>;
  const target = typeof record.kcal_target === 'number' ? record.kcal_target : null;
  const age = optionalNumber(record.goal_age, 18, 100);
  return {
    ...base,
    kcalTarget: target,
    hideCalories: record.hide_calories === true,
    shareFoodDiary: record.share_food_diary === true,
    shareCalories: record.share_calories === true,
    shareQuality: record.share_quality === true,
    shareProgress: record.share_progress === true,
    goal: typeof record.goal === 'string' && isNutritionGoal(record.goal) ? record.goal : null,
    goalAge: age == null ? null : Math.round(age),
    goalSex: typeof record.goal_sex === 'string' && isNutritionSex(record.goal_sex) ? record.goal_sex : null,
    proteinTarget: optionalNumber(record.protein_target_g, 0, 700),
    carbTarget: optionalNumber(record.carb_target_g, 0, 1000),
    fatTarget: optionalNumber(record.fat_target_g, 0, 400),
    goalPhase: typeof record.goal_phase === 'string' && isBuilderPhase(record.goal_phase) ? record.goal_phase : null,
    weightClassKg: optionalNumber(record.weight_class_kg, 40, 200),
    targetWeightKg: optionalNumber(record.target_weight_kg, 30, 300),
    targetOn: typeof record.target_on === 'string' && /^\d{4}-\d{2}-\d{2}/.test(record.target_on) ? record.target_on.slice(0, 10) : null,
    targetStartKg: optionalNumber(record.target_start_kg, 30, 300),
    activityEnergyKcal: optionalNumber(record.activity_energy_kcal, 0, 2500),
    shareGoal: record.share_goal === true,
    wagonOn: record.wagon_on === true,
    wagonNote: typeof record.wagon_note === 'string' ? record.wagon_note : '',
    wagonVisible: record.wagon_visible === true,
    build: typeof record.build === 'string' && isBodyBuild(record.build) ? record.build : null,
    workoutBuckets: parseWorkoutBuckets(record.workout_buckets),
    updatedAt: typeof record.updated_at === 'string' && record.updated_at ? record.updated_at : null,
  };
}

function compositionFromRows(rows: unknown): BodyCompositionReading[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    const source = typeof record.source === 'string' && isBodyCompositionSource(record.source) ? record.source : null;
    const recordedOn = typeof record.recorded_on === 'string' ? record.recorded_on.slice(0, 10) : '';
    if (!source || !recordedOn) return [];
    const bodyFatPct = parseBodyFatPct(optionalNumber(record.body_fat_pct, 0, 100));
    const leanMassKg = parseLeanMassKg(optionalNumber(record.lean_mass_kg, 0, 300));
    const waistCm = parseWaistCm(optionalNumber(record.waist_cm, 0, 300), 'cm');
    if (bodyFatPct == null && leanMassKg == null && waistCm == null) return [];
    return [{
      id: typeof record.id === 'string' ? record.id : recordedOn,
      recordedOn,
      bodyFatPct,
      leanMassKg,
      waistCm,
      source,
      createdAt: typeof record.created_at === 'string' ? record.created_at : '',
    }];
  });
}

/**
 * The person's own food log, for Thumos. A missing table is an empty log,
 * so an older database does not stop the chat.
 */
export async function loadNutritionLines(
  userClient: NutritionClient,
  profile: {
    id: string;
    stage?: string | null;
    sobriety_started_at?: string | null;
    weekly_spend_gbp?: number | string | null;
    weekly_units?: number | string | null;
    height_cm?: number | string | null;
    consent_health?: boolean | null;
  },
  checkIns: readonly { createdAt: string; mood: number; sleepHours: number }[],
  now = new Date(),
  consent?: CoachConsentInput | null,
): Promise<string[]> {
  const coach = coachConsentAllows(consent);
  const today = londonDay(now);
  const athlete = 'kcal_target, hide_calories, share_food_diary, share_calories, share_quality, share_progress, goal, goal_age, goal_sex, protein_target_g, carb_target_g, fat_target_g, goal_phase, weight_class_kg, activity_energy_kcal, share_goal, wagon_on, wagon_note, wagon_visible, build, workout_buckets, updated_at';
  const withTarget = `target_weight_kg, target_on, target_start_kg, ${athlete}`;
  const wide = 'kcal_target, hide_calories, share_food_diary, share_calories, share_quality, share_progress, goal, goal_age, goal_sex, protein_target_g, activity_energy_kcal, share_goal, wagon_on, wagon_note, wagon_visible, build, updated_at';
  const goals = 'kcal_target, hide_calories, share_food_diary, share_calories, share_quality, share_progress, goal, goal_age, goal_sex, protein_target_g, activity_energy_kcal, share_goal, wagon_on, wagon_note, wagon_visible, updated_at';
  const narrow = 'kcal_target, hide_calories, share_food_diary, wagon_on, wagon_note, wagon_visible, updated_at';
  const [logsRes, waterRes, healthRes, bodyRes, scheduleRes] = await Promise.all([
    userClient.from('food_logs').select('id, eaten_on, meal, source, note, items, estimated, created_at').eq('user_id', profile.id).order('eaten_on', { ascending: false }).limit(80),
    userClient.from('nutrition_days').select('water_ml').eq('user_id', profile.id).eq('day', today).maybeSingle(),
    userClient.from('health_samples').select('kind, value, recorded_on, source').eq('user_id', profile.id).order('recorded_on', { ascending: false }).limit(800),
    userClient.from('body_composition').select('id, recorded_on, body_fat_pct, lean_mass_kg, waist_cm, source, created_at').eq('user_id', profile.id).order('recorded_on', { ascending: false }).limit(40),
    userClient.from('training_schedules').select('monday, tuesday, wednesday, thursday, friday, saturday, sunday').eq('user_id', profile.id).maybeSingle(),
  ]);
  let settingsRes = await userClient.from('nutrition_settings').select(withTarget).eq('user_id', profile.id).maybeSingle();
  if (settingsRes.error) {
    settingsRes = await userClient.from('nutrition_settings').select(athlete).eq('user_id', profile.id).maybeSingle();
  }
  if (settingsRes.error) {
    settingsRes = await userClient.from('nutrition_settings').select(wide).eq('user_id', profile.id).maybeSingle();
  }
  if (settingsRes.error) {
    settingsRes = await userClient.from('nutrition_settings').select(goals).eq('user_id', profile.id).maybeSingle();
  }
  if (settingsRes.error) {
    settingsRes = await userClient.from('nutrition_settings').select(narrow).eq('user_id', profile.id).maybeSingle();
  }
  if (logsRes.error && settingsRes.error) return [];
  const started = profile.stage === 'stopped' && profile.sobriety_started_at ? new Date(profile.sobriety_started_at) : null;
  const elapsed = started && !Number.isNaN(started.getTime()) ? soberElapsed(started, now) : null;
  const weeklyUnits = profile.weekly_units == null ? null : Number(profile.weekly_units);
  const weeklySpend = profile.weekly_spend_gbp == null ? 0 : Number(profile.weekly_spend_gbp);
  const unitsAvoided = elapsed && weeklyUnits != null && Number.isFinite(weeklyUnits)
    ? savingsFromTypicalWeek(Number.isFinite(weeklySpend) ? weeklySpend : 0, weeklyUnits, elapsed.totalMs).units
    : 0;
  const waterRow = waterRes.error || !waterRes.data || typeof waterRes.data !== 'object' ? null : waterRes.data as { water_ml?: unknown };
  const waterMl = typeof waterRow?.water_ml === 'number' ? waterRow.water_ml : 0;
  const samples = healthRes.error || !Array.isArray(healthRes.data) ? [] : healthRes.data.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    const value = typeof record.value === 'number' ? record.value : Number(record.value);
    const recordedOn = typeof record.recorded_on === 'string' ? record.recorded_on : '';
    if (!recordedOn || !Number.isFinite(value)) return [];
    const source = record.source === 'healthkit' || record.source === 'manual' ? record.source : undefined;
    return [{ kind: typeof record.kind === 'string' ? record.kind : '', value, recordedOn, source }];
  });
  const weights = weightPointsFrom(samples);
  const latest = weights.length ? weights[weights.length - 1] : undefined;
  const height = profile.height_cm == null ? null : Number(profile.height_cm);
  const figures = compositionForAssessment(bodyRes.error ? [] : compositionFromRows(bodyRes.data));
  const logs = logsRes.error ? [] : logsFromRows(logsRes.data);
  const settings = settingsRes.error ? defaultNutritionSettings() : settingsFromRow(settingsRes.data);
  const week = figuresForLondonWeek({ now, logs, health: samples, checkIns });
  const scheduleRow = scheduleRes.error || !scheduleRes.data || typeof scheduleRes.data !== 'object'
    ? null
    : scheduleRes.data as Record<string, unknown>;
  const scheduledDays = scheduleRow
    ? ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].filter((day) => scheduleRow[day] === true).length
    : null;
  const sleep = week.sleepHours;
  const lines = nutritionContextLines({
    logs,
    settings,
    waterMl,
    checkIns,
    soberDays: elapsed ? elapsed.days : null,
    unitsAvoided,
    today,
    body: {
      weightKg: latest?.kg ?? null,
      heightCm: height != null && Number.isFinite(height) ? height : null,
      weights,
      bodyFatPct: figures.bodyFatPct,
      leanMassKg: figures.leanMassKg,
      waistCm: figures.waistCm,
    },
    activity: coach.health ? activityReadingsFromSamples(samples) : [],
    coach,
  });
  const stage = profile.stage === 'stopped' || profile.stage === 'trying_to_stop' || profile.stage === 'cutting_down' || profile.stage === 'exploring'
    ? profile.stage
    : null;
  const fitness = coach.health
    ? buildFitnessSnapshot({
      today,
      goal: settings.goal,
      goalAge: settings.goalAge,
      goalSex: settings.goalSex,
      scheduleWeekMinutes: null,
      health: samples,
      sleep: checkIns.flatMap((item) => {
        const day = item.createdAt.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(item.sleepHours) || item.sleepHours <= 0) return [];
        return [{ day, hours: item.sleepHours }];
      }),
      permission: 'unknown',
      build: settings.build,
      workoutBuckets: settings.workoutBuckets,
    }).contextLine
    : null;
  const progress = goalProgressLine({
    goal: settings.goal,
    stage,
    hideCalories: settings.hideCalories,
    kcalTarget: settings.kcalTarget,
    proteinTarget: settings.proteinTarget,
    weightClassKg: settings.weightClassKg,
    blockedLoss: lossBlocked({
      goal: settings.goal,
      weightKg: week.weightKg,
      heightCm: height != null && Number.isFinite(height) ? height : null,
      phase: settings.goalPhase,
    }),
    todayLogged: week.todayLogged,
    todayKcal: week.todayKcal,
    todayProtein: week.todayProtein,
    weekProtein: week.weekProtein,
    workoutsKnown: !healthRes.error,
    workoutDays: week.workoutDays,
    workoutMinutes: week.workoutMinutes,
    scheduledDays: scheduledDays && scheduledDays > 0 ? scheduledDays : null,
    weightKg: week.weightKg,
    previousWeightKg: week.previousWeightKg,
    sex: settings.goalSex,
    sleepHours: sleep ?? null,
  });
  const weightRange = goalWeightRange({
    goal: settings.goal,
    phase: settings.goalPhase,
    weightClassKg: settings.weightClassKg,
    weightKg: latest?.kg ?? null,
    heightCm: height != null && Number.isFinite(height) ? height : null,
    age: settings.goalAge,
    sex: settings.goalSex,
    build: settings.build,
    bodyFatPct: figures.bodyFatPct,
    waistCm: figures.waistCm,
  }).contextLine;
  return [progress, fitness, weightRange, ...lines].filter((line): line is string => Boolean(line));
}
