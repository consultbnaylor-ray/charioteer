import AsyncStorage from '@react-native-async-storage/async-storage';

import type { WorkoutSourceMinute } from '@/domain/fitnessSnapshot';

const KEY = 'charioteer.health.workoutSources';

/** App names from the last workout sync on this phone. No route and no heart rate. */
export async function loadWorkoutSources(): Promise<WorkoutSourceMinute[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const item = row as Record<string, unknown>;
      const day = typeof item.day === 'string' ? item.day.slice(0, 10) : '';
      const activityType = Number(item.activityType);
      const minutes = Number(item.minutes);
      const sourceName = typeof item.sourceName === 'string' ? item.sourceName.trim().slice(0, 60) : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(activityType) || activityType <= 0) return [];
      if (!Number.isFinite(minutes) || minutes <= 0 || !sourceName) return [];
      return [{ day, activityType, minutes: Math.round(minutes), sourceName }];
    }).slice(0, 400);
  } catch {
    return [];
  }
}

export async function saveWorkoutSources(rows: readonly WorkoutSourceMinute[]): Promise<void> {
  const safe = rows.slice(0, 400).map((row) => ({
    day: row.day.slice(0, 10),
    activityType: row.activityType,
    minutes: Math.round(row.minutes),
    sourceName: row.sourceName.trim().slice(0, 60),
  }));
  await AsyncStorage.setItem(KEY, JSON.stringify(safe));
}
