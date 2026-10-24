import type { HealthSample } from '@/data/types';
import type { GarminReadings } from '@/domain/garminConnect';
import { londonDay } from '@/domain/healthInsights';

export type SharedHealthPoint = {
  kind: string;
  value: number;
  recordedOn: string;
};

/**
 * Figures a shared health box may show. Uses readings already stored for this person.
 * A day with any Garmin activity counts only those minutes. Resting heart rate never uses an average.
 */
export function sharedHealthSamples(
  samples: readonly Pick<HealthSample, 'kind' | 'value' | 'recordedOn'>[],
  readings: GarminReadings,
): SharedHealthPoint[] {
  const resting = new Map<string, number>();
  for (const daily of readings.dailies) {
    if (daily.restingHeartRateBpm == null) continue;
    resting.set(daily.calendarDate, Math.round(daily.restingHeartRateBpm));
  }

  const sleep = new Map<string, number>();
  for (const night of readings.sleep) {
    if (!(night.durationSeconds > 0)) continue;
    const hours = Math.round((night.durationSeconds / 3600) * 10) / 10;
    const current = sleep.get(night.calendarDate);
    if (current == null || hours > current) sleep.set(night.calendarDate, hours);
  }

  const workouts = new Map<string, number>();
  for (const activity of readings.activities) {
    if (!(activity.durationSeconds > 0)) continue;
    const day = londonDay(activity.startedAt);
    const minutes = Math.max(1, Math.round(activity.durationSeconds / 60));
    workouts.set(day, (workouts.get(day) ?? 0) + minutes);
  }

  const kept = samples.flatMap((sample) => {
    const day = sample.recordedOn.slice(0, 10);
    if (sample.kind === 'resting_heart_rate' && resting.has(day)) return [];
    if (sample.kind === 'sleep_hours' && sleep.has(day)) return [];
    if (sample.kind === 'workout_minutes' && workouts.has(day)) return [];
    return [{ kind: sample.kind, value: sample.value, recordedOn: day }];
  });

  const added: SharedHealthPoint[] = [
    ...[...resting].map(([recordedOn, value]) => ({ kind: 'resting_heart_rate', value, recordedOn })),
    ...[...sleep].map(([recordedOn, value]) => ({ kind: 'sleep_hours', value, recordedOn })),
    ...[...workouts].map(([recordedOn, value]) => ({ kind: 'workout_minutes', value, recordedOn })),
  ];
  return [...kept, ...added];
}
