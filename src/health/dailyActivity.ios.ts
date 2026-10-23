import {
  isHealthDataAvailable,
  queryStatisticsCollectionForQuantity,
} from '@kingstinct/react-native-healthkit';

import { emptyAppleDailyActivity, type AppleDailyActivity } from '@/domain/dailyActivity';
import { londonDay } from '@/domain/healthInsights';

/** The longest chart on Workouts. A zero bucket is not a reading. */
const LOOKBACK_DAYS = 30;

type CumulativeType = 'HKQuantityTypeIdentifierAppleExerciseTime' | 'HKQuantityTypeIdentifierActiveEnergyBurned';

async function readCumulative(type: CumulativeType, unit: 'min' | 'kcal'): Promise<{ day: string; value: number }[]> {
  const end = new Date();
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await queryStatisticsCollectionForQuantity(
    type,
    ['cumulativeSum'],
    start,
    { day: 1 },
    { filter: { date: { startDate: start, endDate: end } }, unit },
  );
  const byDay = new Map<string, number>();
  for (const row of rows) {
    if (!row.startDate || row.sumQuantity == null || !(row.sumQuantity.quantity > 0)) continue;
    const day = londonDay(row.startDate);
    byDay.set(day, (byDay.get(day) ?? 0) + row.sumQuantity.quantity);
  }
  return [...byDay.entries()].map(([day, value]) => ({ day, value }));
}

/** Exercise ring minutes and active calories. Nothing here is saved or shared. */
export async function listDailyActivity(): Promise<AppleDailyActivity> {
  if (!isHealthDataAvailable()) return emptyAppleDailyActivity();
  try {
    const [exerciseMinutes, activeKcal] = await Promise.all([
      readCumulative('HKQuantityTypeIdentifierAppleExerciseTime', 'min').catch(() => []),
      readCumulative('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal').catch(() => []),
    ]);
    return { exerciseMinutes, activeKcal };
  } catch {
    return emptyAppleDailyActivity();
  }
}
