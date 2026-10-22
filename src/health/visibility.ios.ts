import {
  AuthorizationRequestStatus,
  getRequestStatusForAuthorization,
  isHealthDataAvailable,
  queryCategorySamples,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
} from '@kingstinct/react-native-healthkit';

import { isoDay } from '@/domain/dates';
import {
  daysInLookback,
  HEALTH_SAMPLE_DAYS,
  healthReadTitle,
  type HealthAsk,
  type HealthVisibilityReport,
  type HealthVisibilityRow,
} from '@/domain/healthVisibility';
import { APPLE_HEALTH_READ_TYPES } from '@/health/connection';

const QUANTITY_UNITS: Partial<Record<(typeof APPLE_HEALTH_READ_TYPES)[number], string>> = {
  HKQuantityTypeIdentifierRestingHeartRate: 'count/min',
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'ms',
  HKQuantityTypeIdentifierVO2Max: 'ml/(kg*min)',
  HKQuantityTypeIdentifierWalkingHeartRateAverage: 'count/min',
  HKQuantityTypeIdentifierHeartRateRecoveryOneMinute: 'count/min',
  HKQuantityTypeIdentifierBodyMass: 'kg',
  HKQuantityTypeIdentifierHeight: 'cm',
  HKQuantityTypeIdentifierBodyFatPercentage: '%',
  HKQuantityTypeIdentifierLeanBodyMass: 'kg',
};

async function askedFor(type: (typeof APPLE_HEALTH_READ_TYPES)[number]): Promise<HealthAsk> {
  try {
    const status = await getRequestStatusForAuthorization({ toRead: [type] });
    return status === AuthorizationRequestStatus.unnecessary ? 'yes' : 'no';
  } catch {
    return 'no';
  }
}

async function sampleDays(
  type: (typeof APPLE_HEALTH_READ_TYPES)[number],
  now: Date,
): Promise<number> {
  if (type === 'HKWorkoutRouteTypeIdentifier') return 0;
  const start = new Date(now.getTime() - HEALTH_SAMPLE_DAYS * 24 * 60 * 60 * 1000);
  const filter = { date: { startDate: start, endDate: now } };
  try {
    if (type === 'HKWorkoutTypeIdentifier') {
      const workouts = await queryWorkoutSamples({ limit: 0, filter });
      const days = workouts.map((workout) => {
        const day = isoDay(new Date(workout.toJSON().startDate));
        workout.dispose();
        return day;
      });
      return daysInLookback(days, now);
    }
    if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      const sleep = await queryCategorySamples(type, { limit: 0, filter });
      return daysInLookback(sleep.map((sample) => isoDay(sample.endDate)), now);
    }
    if (type === 'HKQuantityTypeIdentifierStepCount' || type === 'HKQuantityTypeIdentifierActiveEnergyBurned') {
      const unit = type === 'HKQuantityTypeIdentifierStepCount' ? 'count' : 'kcal';
      const rows = await queryStatisticsCollectionForQuantity(
        type,
        ['cumulativeSum'],
        start,
        { day: 1 },
        { filter, unit },
      );
      const days = rows
        .filter((row) => row.startDate && (row.sumQuantity?.quantity ?? 0) > 0)
        .map((row) => isoDay(row.startDate!));
      return daysInLookback(days, now);
    }
    const unit = QUANTITY_UNITS[type];
    if (!unit) return 0;
    const samples = await queryQuantitySamples(type, { limit: 0, unit, filter });
    return daysInLookback(samples.map((sample) => isoDay(sample.startDate)), now);
  } catch {
    return 0;
  }
}

/** Asked is the sheet status. Days are samples in the last 12 months. Read permission stays hidden. */
export async function readHealthVisibility(now = new Date()): Promise<HealthVisibilityReport> {
  if (!isHealthDataAvailable()) return { kind: 'unavailable' };
  const counted = APPLE_HEALTH_READ_TYPES.filter((type) => !type.endsWith('RouteTypeIdentifier'));
  const rows: HealthVisibilityRow[] = await Promise.all(counted.map(async (type) => ({
    type,
    title: healthReadTitle(type),
    asked: await askedFor(type),
    days: await sampleDays(type, now),
  })));
  return { kind: 'ready', rows };
}
