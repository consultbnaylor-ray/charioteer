import { startOfLocalDay } from '@/domain/dates';

/**
 * Local midnight. HealthKit repeats the anchor's clock time for every one-day
 * bucket. Anchoring at the query clock makes the bucket labeled today start at
 * that clock, so it holds none of the steps taken earlier today.
 */
export function dailyStatisticsAnchor(now: Date): Date {
  return startOfLocalDay(now);
}

/** The next local midnight, so the day still in progress is inside the query. */
export function dailyStatisticsEnd(now: Date): Date {
  const end = startOfLocalDay(now);
  end.setDate(end.getDate() + 1);
  return end;
}
