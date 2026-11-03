import type { FoodLog } from '@/domain/nutrition';

export type WorkoutFeeling = {
  id: string;
  recordedOn: string;
  /** Empty string is the note for the day. A workout id is that session. */
  workoutKey: string;
  note: string;
  effort: number | null;
  mood: number | null;
};

export type SessionContext = {
  sleepHours: number | null;
  mealCount: number;
  kcal: number;
};

/** Last night is the sleep stored on the morning of the chosen day. */
export function sleepHoursOnDay(
  day: string,
  garmin: readonly { calendarDate: string; durationSeconds: number }[],
  apple: readonly { day: string; value: number }[],
): number | null {
  const night = garmin.find((row) => row.calendarDate === day && row.durationSeconds > 0);
  if (night) return Math.round((night.durationSeconds / 3600) * 10) / 10;
  const sample = apple.find((row) => row.day === day && row.value > 0);
  return sample ? Math.round(sample.value * 10) / 10 : null;
}

/** Meals on the day. When the session has a start, only those eaten before it. */
export function mealsBeforeSession(
  logs: readonly FoodLog[],
  day: string,
  startedAt: string | null,
): { count: number; kcal: number } {
  const start = startedAt ? Date.parse(startedAt) : Number.NaN;
  const rows = logs.filter((log) => {
    if (log.eatenOn !== day) return false;
    if (!Number.isFinite(start) || !log.eatenAt) return !Number.isFinite(start);
    const at = Date.parse(log.eatenAt);
    return Number.isFinite(at) && at <= start;
  });
  const kcal = rows.reduce((sum, log) => {
    const portion = log.portion > 0 ? log.portion : 1;
    return sum + log.items.reduce((meal, item) => meal + item.kcal * portion, 0);
  }, 0);
  return { count: rows.length, kcal: Math.round(kcal) };
}

/** Local only. Needs two shorter nights and two nights of 7h or more. */
export function feelPatternLine(rows: readonly { effort: number | null; sleepHours: number | null }[]): string | null {
  const rested = rows.filter((row) => row.effort != null && row.sleepHours != null && row.sleepHours >= 7);
  const short = rows.filter((row) => row.effort != null && row.sleepHours != null && row.sleepHours < 7);
  if (rested.length < 2 || short.length < 2) return null;
  const mean = (list: readonly { effort: number | null }[]) => list.reduce((sum, row) => sum + (row.effort ?? 0), 0) / list.length;
  if (mean(rested) < mean(short) + 1) return null;
  return 'You rated sessions higher after 7h+ sleep';
}

export function workoutFeelingsFromRows(rows: unknown): WorkoutFeeling[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const recordedOn = typeof record.recorded_on === 'string' ? record.recorded_on.slice(0, 10) : '';
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(recordedOn)) return [];
    const effort = score(record.effort);
    const mood = score(record.mood);
    return [{
      id,
      recordedOn,
      workoutKey: typeof record.workout_key === 'string' ? record.workout_key : '',
      note: typeof record.note === 'string' ? record.note : '',
      effort,
      mood,
    }];
  });
}

function score(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isInteger(number) || number < 1 || number > 10) return null;
  return number;
}
