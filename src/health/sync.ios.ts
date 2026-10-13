import {
  CategoryValueSleepAnalysis,
  isHealthDataAvailable,
  queryCategorySamples,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

import type { HealthKind, NewHealthSample } from '@/data/types';
import { isoDay } from '@/domain/dates';
import { shownError } from '@/domain/errors';
import { APPLE_HEALTH_READ_TYPES } from '@/health/connection';

export type HealthSyncResult =
  | { ok: true; samples: NewHealthSample[] }
  | { ok: false; message: string };

const ASLEEP = new Set<number>([
  CategoryValueSleepAnalysis.asleepUnspecified,
  CategoryValueSleepAnalysis.asleepCore,
  CategoryValueSleepAnalysis.asleepDeep,
  CategoryValueSleepAnalysis.asleepREM,
]);

function add(map: Map<string, number>, day: string, amount: number) {
  map.set(day, (map.get(day) ?? 0) + amount);
}

function rows(kind: HealthKind, unit: string, values: Map<string, number>, round: (value: number) => number): NewHealthSample[] {
  return [...values.entries()].map(([recordedOn, value]) => ({
    kind,
    unit,
    recordedOn,
    value: round(value),
    source: 'healthkit' as const,
  }));
}

function minutes(quantity: number, unit: string): number {
  const name = unit.toLowerCase();
  if (name.startsWith('min')) return quantity;
  if (name.startsWith('hr') || name.startsWith('hour')) return quantity * 60;
  return quantity / 60;
}

/** Reads the last 14 days. Food and water are written separately when a meal is saved. */
export async function syncAppleHealth(): Promise<HealthSyncResult> {
  try {
    if (!isHealthDataAvailable()) {
      return { ok: false, message: 'Apple Health is not available on this device.' };
    }
    const allowed = await requestAuthorization({ toRead: [...APPLE_HEALTH_READ_TYPES] });
    if (!allowed) return { ok: false, message: 'Apple Health access was not granted.' };

    const end = new Date();
    const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
    const filter = { date: { startDate: start, endDate: end } };
    const samples: NewHealthSample[] = [];

    const steps = await queryStatisticsCollectionForQuantity(
      'HKQuantityTypeIdentifierStepCount',
      ['cumulativeSum'],
      start,
      { day: 1 },
      { filter, unit: 'count' },
    );
    const stepDays = new Map<string, number>();
    for (const row of steps) {
      if (!row.startDate || row.sumQuantity == null) continue;
      add(stepDays, isoDay(row.startDate), row.sumQuantity.quantity);
    }
    samples.push(...rows('steps', 'steps', stepDays, Math.round));

    const sleep = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: 0, filter });
    const sleepDays = new Map<string, number>();
    for (const sample of sleep) {
      if (!ASLEEP.has(Number(sample.value))) continue;
      const hours = (sample.endDate.getTime() - sample.startDate.getTime()) / 3_600_000;
      add(sleepDays, isoDay(sample.endDate), hours);
    }
    samples.push(...rows('sleep_hours', 'h', sleepDays, (value) => Math.round(value * 10) / 10));

    const heart = await queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', {
      limit: 0,
      unit: 'count/min',
      filter,
    });
    const heartDays = new Map<string, number>();
    for (const sample of heart) heartDays.set(isoDay(sample.startDate), sample.quantity);
    samples.push(...rows('resting_heart_rate', 'bpm', heartDays, Math.round));

    const hrv = await queryQuantitySamples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', {
      limit: 0,
      unit: 'ms',
      filter,
    });
    const hrvDays = new Map<string, number>();
    for (const sample of hrv) hrvDays.set(isoDay(sample.startDate), sample.quantity);
    samples.push(...rows('hrv_sdnn', 'ms', hrvDays, (value) => Math.round(value * 10) / 10));

    const weight = await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', {
      limit: 0,
      unit: 'kg',
      filter,
    });
    const weightDays = new Map<string, number>();
    for (const sample of weight) weightDays.set(isoDay(sample.startDate), sample.quantity);
    samples.push(...rows('weight_kg', 'kg', weightDays, (value) => Math.round(value * 10) / 10));

    const workouts = await queryWorkoutSamples({ limit: 40, filter });
    const workoutDays = new Map<string, number>();
    for (const workout of workouts) {
      const plain = workout.toJSON();
      add(workoutDays, isoDay(new Date(plain.startDate)), minutes(plain.duration.quantity, plain.duration.unit));
      workout.dispose();
    }
    samples.push(...rows('workout_minutes', 'min', workoutDays, Math.round));

    return { ok: true, samples };
  } catch (error) {
    const message = shownError(error, 'Apple Health could not be read.');
    return { ok: false, message };
  }
}
