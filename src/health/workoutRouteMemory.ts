import type { DeviceWorkout } from '@/domain/workoutRoute';

const memory = new Map<string, DeviceWorkout>();

/** In-memory only. A route coordinate is never written here. */
export function rememberWorkouts(rows: readonly DeviceWorkout[]) {
  for (const row of rows) memory.set(row.id, row);
}

export function rememberedWorkout(id: string): DeviceWorkout | null {
  return memory.get(id) ?? null;
}
