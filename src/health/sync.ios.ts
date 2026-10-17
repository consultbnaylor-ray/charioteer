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
import { parseBodyFatPct, parseLeanMassKg } from '@/domain/nutrition';
import { workoutBucket } from '@/domain/fitnessSnapshot';
import { HEALTH_SAMPLE_DAYS } from '@/domain/healthVisibility';
import { APPLE_HEALTH_READ_TYPES, type AppleHealthBody, type AppleHealthComposition } from '@/health/connection';

export type AppleHealthBodyRead =
  | { ok: true; body: AppleHealthBody }
  | { ok: false; message: string };

export type HealthSyncResult =
  | { ok: true; samples: NewHealthSample[]; activeEnergyKcal: number | null; composition?: AppleHealthComposition[] }
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

function oneDecimal(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 10) / 10;
}

/** Latest weight and height only. A full sync still covers the other readings. */
export async function readAppleHealthBody(): Promise<AppleHealthBodyRead> {
  try {
    if (!isHealthDataAvailable()) {
      return { ok: false, message: 'Apple Health is not available on this device.' };
    }
    const allowed = await requestAuthorization({ toRead: [...APPLE_HEALTH_READ_TYPES] });
    if (!allowed) return { ok: false, message: 'Apple Health access was not granted.' };

    const weight = await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', {
      limit: 1,
      ascending: false,
      unit: 'kg',
    });
    const height = await queryQuantitySamples('HKQuantityTypeIdentifierHeight', {
      limit: 1,
      ascending: false,
      unit: 'cm',
    });
    const fat = await queryQuantitySamples('HKQuantityTypeIdentifierBodyFatPercentage', {
      limit: 1,
      ascending: false,
      unit: '%',
    }).catch(() => []);
    const lean = await queryQuantitySamples('HKQuantityTypeIdentifierLeanBodyMass', {
      limit: 1,
      ascending: false,
      unit: 'kg',
    }).catch(() => []);
    const latestWeight = weight[0];
    const latestHeight = height[0];
    const latestFat = fat[0];
    const latestLean = lean[0];
    const compositionDay = latestFat ? isoDay(latestFat.startDate) : latestLean ? isoDay(latestLean.startDate) : null;
    return {
      ok: true,
      body: {
        weightKg: oneDecimal(latestWeight?.quantity),
        weightDay: latestWeight ? isoDay(latestWeight.startDate) : null,
        heightCm: oneDecimal(latestHeight?.quantity),
        bodyFatPct: latestFat ? parseBodyFatPct(latestFat.quantity) : null,
        leanMassKg: latestLean ? parseLeanMassKg(latestLean.quantity) : null,
        compositionDay,
      },
    };
  } catch (error) {
    return { ok: false, message: shownError(error, 'Apple Health could not be read.') };
  }
}

function minutes(quantity: number, unit: string): number {
  const name = unit.toLowerCase();
  if (name.startsWith('min')) return quantity;
  if (name.startsWith('hr') || name.startsWith('hour')) return quantity * 60;
  return quantity / 60;
}

/**
 * Steps, weight, and active energy use the last 14 days.
 * Heart rate recovery, body fat, and lean mass use the last 8 weeks, so a
 * reading from earlier in that window is kept when today has none.
 * Food and water are written separately when a meal is saved.
 */
export async function syncAppleHealth(): Promise<HealthSyncResult> {
  try {
    if (!isHealthDataAvailable()) {
      return { ok: false, message: 'Apple Health is not available on this device.' };
    }
    const allowed = await requestAuthorization({ toRead: [...APPLE_HEALTH_READ_TYPES] });
    if (!allowed) return { ok: false, message: 'Apple Health access was not granted.' };

    const end = new Date();
    const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
    const fitnessStart = new Date(end.getTime() - HEALTH_SAMPLE_DAYS * 24 * 60 * 60 * 1000);
    const filter = { date: { startDate: start, endDate: end } };
    const fitnessFilter = { date: { startDate: fitnessStart, endDate: end } };
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

    const sleep = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: 0, filter: fitnessFilter });
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
      filter: fitnessFilter,
    });
    const heartDays = new Map<string, number>();
    for (const sample of heart) heartDays.set(isoDay(sample.startDate), sample.quantity);
    samples.push(...rows('resting_heart_rate', 'bpm', heartDays, Math.round));

    const hrv = await queryQuantitySamples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', {
      limit: 0,
      unit: 'ms',
      filter: fitnessFilter,
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

    const byDay = new Map<string, { bodyFatPct: number | null; leanMassKg: number | null }>();
    try {
      const fat = await queryQuantitySamples('HKQuantityTypeIdentifierBodyFatPercentage', {
        limit: 0,
        unit: '%',
        filter: fitnessFilter,
      });
      for (const sample of fat) {
        const day = isoDay(sample.startDate);
        const current = byDay.get(day) ?? { bodyFatPct: null, leanMassKg: null };
        current.bodyFatPct = parseBodyFatPct(sample.quantity);
        byDay.set(day, current);
      }
    } catch {
      // Body fat stays empty until Health has a sample this app can read.
    }
    try {
      const lean = await queryQuantitySamples('HKQuantityTypeIdentifierLeanBodyMass', {
        limit: 0,
        unit: 'kg',
        filter: fitnessFilter,
      });
      for (const sample of lean) {
        const day = isoDay(sample.startDate);
        const current = byDay.get(day) ?? { bodyFatPct: null, leanMassKg: null };
        current.leanMassKg = parseLeanMassKg(sample.quantity);
        byDay.set(day, current);
      }
    } catch {
      // Lean mass stays empty until Health has a sample this app can read.
    }
    const composition: AppleHealthComposition[] = [...byDay.entries()]
      .map(([recordedOn, value]) => ({ recordedOn, bodyFatPct: value.bodyFatPct, leanMassKg: value.leanMassKg }))
      .filter((row) => row.bodyFatPct != null || row.leanMassKg != null);

    const workouts = await queryWorkoutSamples({ limit: 0, filter: fitnessFilter });
    const workoutDays = new Map<string, number>();
    const strengthDays = new Map<string, number>();
    const cardioDays = new Map<string, number>();
    const otherDays = new Map<string, number>();
    const sessionHeart = new Map<string, { total: number; count: number }>();
    for (const workout of workouts) {
      const plain = workout.toJSON();
      const day = isoDay(new Date(plain.startDate));
      const length = minutes(plain.duration.quantity, plain.duration.unit);
      const burned = plain.totalEnergyBurned?.quantity ?? 0;
      if (length <= 0 && burned <= 0) {
        workout.dispose();
        continue;
      }
      add(workoutDays, day, length);
      const bucket = workoutBucket(Number(plain.workoutActivityType));
      if (bucket === 'strength') add(strengthDays, day, length);
      else if (bucket === 'cardio') add(cardioDays, day, length);
      else add(otherDays, day, length);
      try {
        const stat = await workout.getStatistic('HKQuantityTypeIdentifierHeartRate', 'count/min');
        const average = stat?.averageQuantity?.quantity;
        if (average != null && average > 30 && average < 230) {
          const current = sessionHeart.get(day) ?? { total: 0, count: 0 };
          current.total += average;
          current.count += 1;
          sessionHeart.set(day, current);
        }
      } catch {
        // A workout without a heart-rate statistic still counts for minutes.
      }
      workout.dispose();
    }
    samples.push(...rows('workout_minutes', 'min', workoutDays, Math.round));
    samples.push(...rows('strength_minutes', 'min', strengthDays, Math.round));
    samples.push(...rows('cardio_minutes', 'min', cardioDays, Math.round));
    samples.push(...rows('other_minutes', 'min', otherDays, Math.round));
    const sessionDays = new Map<string, number>();
    for (const [day, stat] of sessionHeart) {
      if (stat.count > 0) sessionDays.set(day, stat.total / stat.count);
    }
    samples.push(...rows('session_heart_rate', 'bpm', sessionDays, Math.round));

    try {
      const vo2 = await queryQuantitySamples('HKQuantityTypeIdentifierVO2Max', {
        limit: 0,
        unit: 'ml/(kg*min)',
        filter: fitnessFilter,
      });
      const vo2Days = new Map<string, number>();
      for (const sample of vo2) vo2Days.set(isoDay(sample.startDate), sample.quantity);
      samples.push(...rows('vo2_max', 'ml/kg/min', vo2Days, (value) => Math.round(value * 10) / 10));
    } catch {
      // Cardio fitness is absent until the watch has a reading.
    }
    try {
      const walking = await queryQuantitySamples('HKQuantityTypeIdentifierWalkingHeartRateAverage', {
        limit: 0,
        unit: 'count/min',
        filter: fitnessFilter,
      });
      const walkingDays = new Map<string, number>();
      for (const sample of walking) walkingDays.set(isoDay(sample.startDate), sample.quantity);
      samples.push(...rows('walking_heart_rate', 'bpm', walkingDays, Math.round));
    } catch {
      // Walking heart rate is optional.
    }
    try {
      const recovery = await queryQuantitySamples('HKQuantityTypeIdentifierHeartRateRecoveryOneMinute', {
        limit: 0,
        unit: 'count/min',
        filter: fitnessFilter,
      });
      const recoveryDays = new Map<string, number>();
      for (const sample of recovery) recoveryDays.set(isoDay(sample.startDate), sample.quantity);
      samples.push(...rows('heart_rate_recovery', 'bpm', recoveryDays, Math.round));
    } catch {
      // Heart rate recovery is absent on some watches.
    }

    let activeEnergyKcal: number | null = null;
    try {
      const energy = await queryStatisticsCollectionForQuantity(
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        ['cumulativeSum'],
        start,
        { day: 1 },
        { filter, unit: 'kcal' },
      );
      const days: number[] = [];
      for (const row of energy) {
        if (row.sumQuantity == null) continue;
        days.push(row.sumQuantity.quantity);
      }
      if (days.length) {
        const average = Math.round(days.reduce((sum, value) => sum + value, 0) / days.length);
        activeEnergyKcal = average >= 0 && average <= 2500 ? average : null;
      }
    } catch {
      activeEnergyKcal = null;
    }

    return { ok: true, samples, activeEnergyKcal, composition };
  } catch (error) {
    const message = shownError(error, 'Apple Health could not be read.');
    return { ok: false, message };
  }
}
