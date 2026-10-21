import type { AppSnapshot } from '@/data/types';
import { lossBlocked } from '@/domain/nutrition';
import type { StatPeriod } from '@/domain/statWindow';

export {
  buildGoalLed,
  figuresForLondonWeek,
  goalFocusLine,
  goalProgressLine,
  latestWeight,
  proteinLoggedDays,
  sleepThisWeek,
  trainingThisWeek,
  weightThisWeek,
  type GoalLed,
  type GoalLedInput,
  type GoalMeasure,
  type GoalTick,
  type GoalTone,
} from '../../supabase/functions/_shared/goalLed.ts';

import { figuresForLondonWeek } from '../../supabase/functions/_shared/goalLed.ts';

/** Figures already on the phone. Nothing here is fetched for the goal card. */
export function goalLedFromSnapshot(snap: AppSnapshot, now = new Date(), period: StatPeriod = '7') {
  const profile = snap.profile;
  const settings = snap.nutrition;
  const week = figuresForLondonWeek({
    now,
    logs: snap.foodLogs ?? [],
    health: snap.health ?? [],
    checkIns: snap.checkIns ?? [],
    period,
  });
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
      weightKg: week.weightKg,
      heightCm: profile?.heightCm ?? null,
      phase: settings?.goalPhase ?? null,
    }),
    todayLogged: week.todayLogged,
    todayKcal: week.todayKcal,
    todayProtein: week.todayProtein,
    weekProtein: week.weekProtein,
    workoutsKnown: true,
    workoutDays: week.workoutDays,
    workoutMinutes: week.workoutMinutes,
    scheduledDays: snap.trainingSchedule?.days.length ?? null,
    weightKg: week.weightKg,
    previousWeightKg: week.previousWeightKg,
    sex: settings?.goalSex ?? null,
    sleepHours: week.sleepHours,
    period,
    now,
  };
}
