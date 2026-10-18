import {
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
import { dedupeWorkouts, workoutBucket, workoutTypeKind, type WorkoutSourceMinute, type WorkoutSpan } from '@/domain/fitnessSnapshot';
import { saveWorkoutSources } from '@/health/workoutSources';
import type { WorkoutBucket, WorkoutBucketMap } from '@/domain/nutrition';
import { HEALTH_SAMPLE_DAYS } from '@/domain/healthVisibility';
import { sleepHoursByWakeDay } from '@/domain/sleepNights';
import { APPLE_HEALTH_READ_TYPES, type AppleHealthBody, type AppleHealthComposition } from '@/health/connection';

export type AppleHealthBodyRead =
  | { ok: true; body: AppleHealthBody }
  | { ok: false; message: string };

export type HealthSyncResult =
  | { ok: true; samples: NewHealthSample[]; activeEnergyKcal: number | null; composition?: AppleHealthComposition[] }
  | { ok: false; message: string };

function workoutSourceName(source: { name?: string; bundleIdentifier?: string } | null | undefined): string {
  const name = source?.name?.trim();
  if (name) return name.slice(0, 60);
  const id = source?.bundleIdentifier ?? '';
  if (id.startsWith('com.apple.')) return 'Apple Watch';
  const tail = id.split('.').filter(Boolean).pop();
  return tail ? tail.slice(0, 60) : 'Apple Health';
}

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
export async function syncAppleHealth(overrides: WorkoutBucketMap = {}): Promise<HealthSyncResult> {
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
    // The same 8-week window as the other fitness samples. A night is the
    // morning it ended. Watch stages win over a plain "asleep" sample, and a
    // night stored only as time in bed is still kept.
    const sleepDays = sleepHoursByWakeDay(
      sleep.map((sample) => ({
        value: Number(sample.value),
        startMs: sample.startDate.getTime(),
        endMs: sample.endDate.getTime(),
      })),
      (endMs) => isoDay(new Date(endMs)),
    );
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
    const bucketDays: Record<WorkoutBucket, Map<string, number>> = {
      strength: new Map(),
      cardio: new Map(),
      conditioning: new Map(),
      other: new Map(),
    };
    const typeDays = new Map<string, Map<string, number>>();
    const sessionHeart = new Map<string, { total: number; count: number }>();
    const pending: { workout: (typeof workouts)[number]; span: WorkoutSpan; sourceName: string }[] = [];
    for (const workout of workouts) {
      const plain = workout.toJSON();
      const startMs = new Date(plain.startDate).getTime();
      const endMs = new Date(plain.endDate).getTime();
      // totalEnergyBurned is not used. Minutes come from the workout duration.
      const length = minutes(plain.duration.quantity, plain.duration.unit);
      if (length <= 0 || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        workout.dispose();
        continue;
      }
      pending.push({
        workout,
        sourceName: workoutSourceName(plain.sourceRevision?.source),
        span: {
          activityType: Number(plain.workoutActivityType),
          startMs,
          endMs,
          durationMin: length,
          sourceId: plain.sourceRevision?.source?.bundleIdentifier ?? '',
        },
      });
    }
    const kept = new Set(dedupeWorkouts(pending.map((item) => item.span)));
    const sourceMinutes: WorkoutSourceMinute[] = [];
    for (const item of pending) {
      if (!kept.has(item.span)) {
        item.workout.dispose();
        continue;
      }
      const day = isoDay(new Date(item.span.startMs));
      const length = item.span.durationMin;
      add(workoutDays, day, length);
      const activityType = Number.isInteger(item.span.activityType) && item.span.activityType > 0
        ? item.span.activityType
        : 0;
      const bucket = workoutBucket(activityType, overrides);
      add(bucketDays[bucket], day, length);
      if (activityType > 0) {
        sourceMinutes.push({
          day,
          activityType,
          minutes: length,
          sourceName: item.sourceName,
        });
        const typeKind = workoutTypeKind(activityType);
        const typeMap = typeDays.get(typeKind) ?? new Map<string, number>();
        add(typeMap, day, length);
        typeDays.set(typeKind, typeMap);
      }
      try {
        const stat = await item.workout.getStatistic('HKQuantityTypeIdentifierHeartRate', 'count/min');
        const average = stat?.averageQuantity?.quantity;
        if (average != null && average > 30 && average < 230) {
          const current = sessionHeart.get(day) ?? { total: 0, count: 0 };
          current.total += average;
          current.count += 1;
          sessionHeart.set(day, current);
        }
      } catch {
        // Heart rate is stored as its own reading. It does not choose the bucket.
      }
      item.workout.dispose();
    }
    const touchedDays = new Set<string>(workoutDays.keys());
    for (const day of touchedDays) {
      for (const bucket of ['strength', 'cardio', 'conditioning', 'other'] as const) {
        if (!bucketDays[bucket].has(day)) bucketDays[bucket].set(day, 0);
      }
    }
    samples.push(...rows('workout_minutes', 'min', workoutDays, Math.round));
    samples.push(...rows('strength_minutes', 'min', bucketDays.strength, Math.round));
    samples.push(...rows('cardio_minutes', 'min', bucketDays.cardio, Math.round));
    samples.push(...rows('conditioning_minutes', 'min', bucketDays.conditioning, Math.round));
    samples.push(...rows('other_minutes', 'min', bucketDays.other, Math.round));
    for (const [kind, days] of typeDays) {
      samples.push(...rows(kind as NewHealthSample['kind'], 'min', days, Math.round));
    }
    const sessionDays = new Map<string, number>();
    for (const [day, stat] of sessionHeart) {
      if (stat.count > 0) sessionDays.set(day, stat.total / stat.count);
    }
    samples.push(...rows('session_heart_rate', 'bpm', sessionDays, Math.round));
    await saveWorkoutSources(sourceMinutes).catch(() => undefined);

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
