import type { AppSnapshot } from '@/data/types';
import { isoDay } from '@/domain/dates';
import { shiftDay } from '@/domain/healthInsights';
import { dayItems, lossBlocked, sumItems, weightPointsFrom } from '@/domain/nutrition';

export {
  buildGoalLed,
  goalFocusLine,
  goalProgressLine,
  type GoalLed,
  type GoalLedInput,
  type GoalMeasure,
  type GoalTick,
  type GoalTone,
} from '../../supabase/functions/_shared/goalLed.ts';

/** Figures already on the phone. Nothing here is fetched for the goal card. */
export function goalLedFromSnapshot(snap: AppSnapshot, now = new Date()) {
  const profile = snap.profile;
  const settings = snap.nutrition;
  const today = isoDay(now);
  const items = dayItems(snap.foodLogs ?? [], today);
  const totals = sumItems(items);
  const start = shiftDay(today, -6);
  const workouts = (snap.health ?? []).filter((sample) => (
    sample.kind === 'workout_minutes' && sample.recordedOn >= start && sample.recordedOn <= today
  ));
  const weights = weightPointsFrom(snap.health ?? []).filter((point) => point.day <= today);
  const latest = weights.at(-1);
  const previous = weights.length > 1 ? weights[weights.length - 2] : undefined;
  const sleep = [...(snap.checkIns ?? [])]
    .filter((item) => item.createdAt.slice(0, 10) >= start && Number.isFinite(item.sleepHours))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const stage = profile?.stage === 'stopped' || profile?.stage === 'trying_to_stop' || profile?.stage === 'cutting_down' || profile?.stage === 'exploring'
    ? profile.stage
    : null;
  return {
    goal: settings?.goal ?? null,
    stage,
    hideCalories: settings?.hideCalories === true,
    kcalTarget: settings?.kcalTarget ?? null,
    proteinTarget: settings?.proteinTarget ?? null,
    weightClassKg: settings?.weightClassKg ?? null,
    blockedLoss: lossBlocked({
      goal: settings?.goal ?? null,
      weightKg: latest?.kg ?? null,
      heightCm: profile?.heightCm ?? null,
      phase: settings?.goalPhase ?? null,
    }),
    todayLogged: items.length > 0,
    todayKcal: totals.kcal,
    todayProtein: totals.proteinG,
    workoutsKnown: true,
    workoutDays: new Set(workouts.map((sample) => sample.recordedOn)).size,
    workoutMinutes: workouts.reduce((sum, sample) => sum + sample.value, 0),
    scheduledDays: snap.trainingSchedule?.days.length ?? null,
    weightKg: latest?.kg ?? null,
    previousWeightKg: previous?.kg ?? null,
    sleepHours: sleep?.sleepHours ?? null,
  };
}
