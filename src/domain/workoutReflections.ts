import { londonDay } from '@/domain/healthInsights';
import type { FoodLog } from '@/domain/nutrition';
import { SESSION_TYPE_LABEL, type PlannedSession } from '@/domain/plannedSession';
import type { WorkoutFeeling } from '@/domain/workoutFeel';
import { activityTypeFromKind, workoutTypeLabel } from '@/domain/fitnessSnapshot';

export {
  buildWorkoutReflections,
  WORKOUT_NOTE_CHARS,
  WORKOUT_REFLECTION_DAYS,
  WORKOUT_REFLECTION_LIMIT,
  WORKOUT_REFLECTION_PROMPT,
} from '../../supabase/functions/_shared/workoutReflections';

import { buildWorkoutReflections, type ReflectionMeal, type ReflectionSession } from '../../supabase/functions/_shared/workoutReflections';

/** Phone-side copy of the diary summary, used when the voice token function is an older deploy. */
export function workoutReflectionsFromDiary(input: {
  today: string;
  feelings: readonly WorkoutFeeling[];
  planned: readonly PlannedSession[];
  sleepSamples: readonly { day: string; value: number }[];
  workoutSamples: readonly { kind: string; value: number; recordedOn: string }[];
  logs: readonly FoodLog[];
  hideCalories: boolean;
}): string[] {
  const sessions: ReflectionSession[] = input.planned.filter((session) => session.doneAt).map((session) => ({
    id: session.id,
    day: londonDay(session.startsAt),
    startedAt: session.startsAt,
    type: SESSION_TYPE_LABEL[session.sessionType],
    durationMinutes: session.durationMinutes,
    source: 'plan',
  }));
  const covered = new Set(sessions.map((row) => row.day));
  for (const sample of input.workoutSamples) {
    const activityType = activityTypeFromKind(sample.kind);
    const day = sample.recordedOn.slice(0, 10);
    if (activityType == null || !(sample.value > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || covered.has(day)) continue;
    sessions.push({
      id: `apple:${day}:${sample.kind}`,
      day,
      startedAt: null,
      type: workoutTypeLabel(activityType),
      durationMinutes: Math.round(sample.value),
      source: 'apple',
    });
    covered.add(day);
  }
  const meals: ReflectionMeal[] = input.logs.map((log) => {
    const portion = log.portion > 0 ? log.portion : 1;
    const kcal = log.items.reduce((sum, item) => sum + item.kcal * portion, 0);
    return { eatenOn: log.eatenOn, eatenAt: log.eatenAt, kcal: Math.round(kcal) };
  });
  return buildWorkoutReflections({
    today: input.today,
    feelings: input.feelings.map((row) => ({
      recordedOn: row.recordedOn,
      workoutKey: row.workoutKey,
      note: row.note,
      effort: row.effort,
      mood: row.mood,
    })),
    sessions,
    sleep: input.sleepSamples
      .filter((row) => row.value > 0)
      .map((row) => ({ day: row.day.slice(0, 10), hours: Math.round(row.value * 10) / 10 })),
    meals,
    hideCalories: input.hideCalories,
  });
}
