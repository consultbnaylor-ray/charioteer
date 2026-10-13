import { londonDay } from './healthInsights.ts';
import {
  defaultNutritionSettings,
  foodItemFromUnknown,
  isMealSlot,
  nutritionContextLines,
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
      createdAt: typeof record.created_at === 'string' ? record.created_at : '',
      previewUrl: null,
    }];
  });
}

function settingsFromRow(row: unknown): NutritionSettings {
  const base = defaultNutritionSettings();
  if (!row || typeof row !== 'object') return base;
  const record = row as Record<string, unknown>;
  const target = typeof record.kcal_target === 'number' ? record.kcal_target : null;
  return {
    kcalTarget: target,
    hideCalories: record.hide_calories === true,
    shareFoodDiary: record.share_food_diary === true,
    wagonOn: record.wagon_on === true,
    wagonNote: typeof record.wagon_note === 'string' ? record.wagon_note : '',
    wagonVisible: record.wagon_visible === true,
  };
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
  },
  checkIns: readonly { createdAt: string; mood: number; sleepHours: number }[],
  now = new Date(),
): Promise<string[]> {
  const today = londonDay(now);
  const [logsRes, settingsRes, waterRes] = await Promise.all([
    userClient.from('food_logs').select('id, eaten_on, meal, source, note, items, estimated, created_at').eq('user_id', profile.id).order('eaten_on', { ascending: false }).limit(80),
    userClient.from('nutrition_settings').select('kcal_target, hide_calories, share_food_diary, wagon_on, wagon_note, wagon_visible').eq('user_id', profile.id).maybeSingle(),
    userClient.from('nutrition_days').select('water_ml').eq('user_id', profile.id).eq('day', today).maybeSingle(),
  ]);
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
  return nutritionContextLines({
    logs: logsRes.error ? [] : logsFromRows(logsRes.data),
    settings: settingsRes.error ? defaultNutritionSettings() : settingsFromRow(settingsRes.data),
    waterMl,
    checkIns,
    soberDays: elapsed ? elapsed.days : null,
    unitsAvoided,
    today,
  });
}
