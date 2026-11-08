import { parseWorkoutActivityType, workoutTypeLabel } from './fitnessSnapshot.ts';
import { londonDay, shiftDay } from './healthInsights.ts';
import { missingColumn, missingRelation } from './garmin.ts';
import {
  buildWorkoutReflections,
  WORKOUT_REFLECTION_DAYS,
  type ReflectionFeeling,
  type ReflectionMeal,
  type ReflectionSession,
  type ReflectionSleep,
} from './workoutReflections.ts';

type QueryResult = { data: unknown; error: { message?: string } | null };

type Query = PromiseLike<QueryResult> & {
  eq(column: string, value: string): Query;
  gte(column: string, value: string): Query;
  like(column: string, value: string): Query;
  limit(count: number): Query;
};

export type WorkoutReflectionClient = {
  from(table: string): {
    select(columns: string): Query;
  };
};

const PLAN_LABEL: Record<string, string> = {
  run: 'Run',
  outdoor: 'Run/Walk (outdoor)',
  cardio: 'Cardio',
  strength: 'Strength',
  boxing: 'Boxing',
  hiit: 'HIIT',
  other: 'Other',
};

/**
 * Last 30 days of the workout diary, for Thumos. A missing table is an empty
 * diary, so an older database does not stop the chat. Location, routes, raw
 * activity files, and women's health tables are not read.
 */
export async function loadWorkoutReflections(
  client: WorkoutReflectionClient,
  userId: string,
  today: string,
  allowed: boolean,
): Promise<string[]> {
  if (!allowed) return [];
  const day = today.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const start = shiftDay(day, -(WORKOUT_REFLECTION_DAYS - 1));
  const queryFrom = shiftDay(start, -1);
  const [feelingsRes, plansRes, activitiesRes, sleepRes, appleSleepRes, appleWorkRes, foodRes, settingsRes] = await Promise.all([
    client.from('workout_feelings').select('recorded_on, workout_key, note, effort, mood').eq('user_id', userId).gte('recorded_on', start).limit(80),
    client.from('planned_sessions').select('id, session_type, starts_at, duration_minutes, done_at').eq('user_id', userId).gte('starts_at', queryFrom).limit(120),
    client.from('garmin_activities').select('summary_id, activity_type, activity_name, started_at, duration_seconds').eq('user_id', userId).gte('started_at', queryFrom).limit(120),
    client.from('garmin_sleep').select('calendar_date, duration_seconds').eq('user_id', userId).gte('calendar_date', start).limit(40),
    client.from('health_samples').select('kind, value, recorded_on').eq('user_id', userId).eq('kind', 'sleep_hours').gte('recorded_on', start).limit(40),
    client.from('health_samples').select('kind, value, recorded_on').eq('user_id', userId).like('kind', 'workout_type_%').gte('recorded_on', start).limit(120),
    readFood(client, userId, start),
    client.from('nutrition_settings').select('hide_calories').eq('user_id', userId).limit(1),
  ]);
  const feelings = feelingsOf(rowsOf(feelingsRes));
  const sessions = [
    ...deviceSessions(rowsOf(activitiesRes)),
    ...planSessions(rowsOf(plansRes)),
    ...appleSessions(rowsOf(appleWorkRes)),
  ];
  const sleep = sleepHours(rowsOf(sleepRes), rowsOf(appleSleepRes));
  const meals = mealsOf(foodRes);
  const hideCalories = hidesCalories(settingsRes);
  return buildWorkoutReflections({ today: day, feelings, sessions, sleep, meals, hideCalories });
}

async function readFood(client: WorkoutReflectionClient, userId: string, start: string): Promise<QueryResult> {
  const wide = await client.from('food_logs').select('eaten_on, eaten_at, items, portion').eq('user_id', userId).gte('eaten_on', start).limit(120);
  if (wide.error && missingColumn(wide.error.message ?? '', 'eaten_at')) {
    return client.from('food_logs').select('eaten_on, items, portion').eq('user_id', userId).gte('eaten_on', start).limit(120);
  }
  return wide;
}

function rowsOf(result: QueryResult): unknown[] {
  if (result.error) return [];
  return Array.isArray(result.data) ? result.data : [];
}

function feelingsOf(rows: unknown[]): ReflectionFeeling[] {
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    const recordedOn = text(record.recorded_on).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedOn)) return [];
    return [{
      recordedOn,
      workoutKey: text(record.workout_key).slice(0, 80),
      note: text(record.note),
      effort: score(record.effort),
      mood: score(record.mood),
    }];
  });
}

function deviceSessions(rows: unknown[]): ReflectionSession[] {
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    const id = text(record.summary_id);
    const startedAt = text(record.started_at);
    const seconds = numberOf(record.duration_seconds);
    if (!id || !startedAt || Number.isNaN(Date.parse(startedAt)) || seconds == null || seconds <= 0) return [];
    const activityType = parseWorkoutActivityType(record.activity_type, text(record.activity_name));
    const type = activityType > 0 ? workoutTypeLabel(activityType) : text(record.activity_name).slice(0, 40);
    return [{
      id: `garmin:${id}`,
      day: londonDay(startedAt),
      startedAt,
      type,
      durationMinutes: Math.max(1, Math.round(seconds / 60)),
      source: 'device' as const,
    }];
  });
}

function planSessions(rows: unknown[]): ReflectionSession[] {
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    const id = text(record.id);
    const startedAt = text(record.starts_at);
    const duration = numberOf(record.duration_minutes);
    const type = PLAN_LABEL[text(record.session_type)] ?? '';
    if (!text(record.done_at) || !id || !startedAt || !type || duration == null || duration <= 0 || Number.isNaN(Date.parse(startedAt))) return [];
    return [{
      id,
      day: londonDay(startedAt),
      startedAt,
      type,
      durationMinutes: Math.round(duration),
      source: 'plan' as const,
    }];
  });
}

function appleSessions(rows: unknown[]): ReflectionSession[] {
  const totals = new Map<string, { day: string; kind: string; minutes: number }>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const kind = text(record.kind);
    if (!/^workout_type_[1-9][0-9]{0,3}$/.test(kind)) continue;
    const day = text(record.recorded_on).slice(0, 10);
    const minutes = numberOf(record.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || minutes == null || minutes <= 0) continue;
    const key = `${day}:${kind}`;
    const existing = totals.get(key);
    totals.set(key, { day, kind, minutes: (existing?.minutes ?? 0) + minutes });
  }
  return [...totals.values()].map((row) => {
    const activityType = Number(row.kind.slice('workout_type_'.length));
    return {
      id: `apple:${row.day}:${row.kind}`,
      day: row.day,
      startedAt: null,
      type: workoutTypeLabel(activityType),
      durationMinutes: Math.round(row.minutes),
      source: 'apple' as const,
    };
  });
}

function sleepHours(garmin: unknown[], apple: unknown[]): ReflectionSleep[] {
  const byDay = new Map<string, number>();
  for (const row of garmin) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const day = text(record.calendar_date).slice(0, 10);
    const seconds = numberOf(record.duration_seconds);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || seconds == null || seconds <= 0 || byDay.has(day)) continue;
    byDay.set(day, Math.round((seconds / 3600) * 10) / 10);
  }
  for (const row of apple) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    if (text(record.kind) !== 'sleep_hours') continue;
    const day = text(record.recorded_on).slice(0, 10);
    const hours = numberOf(record.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || hours == null || hours <= 0 || byDay.has(day)) continue;
    byDay.set(day, Math.round(hours * 10) / 10);
  }
  return [...byDay.entries()].map(([day, hours]) => ({ day, hours }));
}

function mealsOf(result: QueryResult): ReflectionMeal[] {
  return rowsOf(result).flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    const eatenOn = text(record.eaten_on).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eatenOn)) return [];
    const portion = numberOf(record.portion);
    const scale = portion != null && portion > 0 ? portion : 1;
    const kcal = Array.isArray(record.items)
      ? record.items.reduce((sum, item) => {
          if (!item || typeof item !== 'object') return sum;
          const value = numberOf((item as { kcal?: unknown }).kcal);
          return value != null && value > 0 ? sum + value * scale : sum;
        }, 0)
      : 0;
    const eatenAt = text(record.eaten_at);
    return [{ eatenOn, eatenAt: eatenAt || null, kcal: Math.round(kcal) }];
  });
}

function hidesCalories(result: QueryResult): boolean {
  if (result.error && missingRelation(result.error.message ?? '')) return false;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || typeof row !== 'object') return false;
  return (row as { hide_calories?: unknown }).hide_calories === true;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberOf(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function score(value: unknown): number | null {
  const number = numberOf(value);
  if (number == null || !Number.isInteger(number) || number < 1 || number > 10) return null;
  return number;
}
