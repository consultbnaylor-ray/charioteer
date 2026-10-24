import type { AppSnapshot } from '@/data/types';
import type { TrainingSchedule } from '@/domain/healthPlan';
import { londonDay } from '@/domain/healthInsights';
import { withPlannedMinutes } from '@/domain/plannedSession';
import type { StatPeriod } from '@/domain/statWindow';

export {
  ADDED_NOT_REDUCED,
  buildFitnessSnapshot,
  fitnessFocusLines,
  MINUTES_WHAT,
  RESTING_WHAT,
  VO2_WHAT,
  whyCardioMatters,
  whyMinutesMatter,
  whyRestingMatters,
  CONDITIONING_NOTE,
  MIX_HOW,
  activityTypeFromKind,
  dedupeWorkouts,
  defaultWorkoutBucket,
  rebucketStoredMinutes,
  withWorkoutBucket,
  workoutBucket,
  periodActiveMinutes,
  publishedCardioBand,
  sessionSplitRows,
  sessionTypeCounts,
  workoutMixReport,
  workoutTypeKind,
  workoutTypeLabel,
  workoutTypeMinutes,
  WORKOUT_MIX_TITLE,
  type FitnessBand,
  type FitnessCompare,
  type FitnessLevel,
  type FitnessRecommendation,
  type FitnessRing,
  type FitnessSnapshot,
  type FitnessSnapshotInput,
  type FitnessTone,
  type FitnessTrend,
  type FitnessWeekMix,
  type SessionSplitRow,
  type WorkoutActivitySlice,
  type WorkoutSourceMinute,
  type WorkoutSpan,
  type WorkoutTypeMinute,
} from '../../supabase/functions/_shared/fitnessSnapshot.ts';

import { buildFitnessSnapshot, type FitnessSnapshotInput } from '../../supabase/functions/_shared/fitnessSnapshot.ts';

export function scheduleWeekMinutes(schedule: TrainingSchedule | null | undefined): number | null {
  if (!schedule || schedule.days.length === 0 || schedule.typicalMinutes <= 0) return null;
  return schedule.days.reduce((total, day) => {
    if (schedule.longerDay === day && schedule.longerMinutes && schedule.longerMinutes > 0) return total + schedule.longerMinutes;
    return total + schedule.typicalMinutes;
  }, 0);
}

/** Readings already on the phone. Nothing here is fetched for the card. */
export function fitnessFromSnapshot(
  snap: AppSnapshot,
  permission: FitnessSnapshotInput['permission'] = 'unknown',
  now = new Date(),
): FitnessSnapshotInput {
  const profile = snap.profile;
  const today = londonDay(now);
  const sleep = (snap.checkIns ?? []).flatMap((row) => {
    const day = row.createdAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || row.sleepHours <= 0) return [];
    return [{ day, hours: row.sleepHours }];
  });
  return {
    today,
    goal: snap.nutrition?.goal ?? null,
    goalAge: snap.nutrition?.goalAge ?? null,
    goalSex: snap.nutrition?.goalSex ?? null,
    scheduleWeekMinutes: scheduleWeekMinutes(snap.trainingSchedule),
    health: withPlannedMinutes((snap.health ?? []).map((sample) => ({
      kind: sample.kind,
      value: sample.value,
      recordedOn: sample.recordedOn,
      source: sample.source,
    })), snap.plannedSessions),
    workoutBuckets: snap.nutrition?.workoutBuckets ?? {},
    sleep,
    permission,
    build: snap.nutrition?.build ?? null,
  };
}

export function fitnessView(
  snap: AppSnapshot,
  permission: FitnessSnapshotInput['permission'] = 'unknown',
  now = new Date(),
  sourceApps?: FitnessSnapshotInput['sourceApps'],
  period: StatPeriod = '7',
) {
  if (!profileReady(snap)) return null;
  return buildFitnessSnapshot({ ...fitnessFromSnapshot(snap, permission, now), sourceApps, period, now });
}

function profileReady(snap: AppSnapshot): boolean {
  return Boolean(snap.profile);
}
