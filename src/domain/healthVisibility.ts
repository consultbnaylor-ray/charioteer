/**
 * What the app can honestly say about Apple Health.
 * iOS does not tell an app whether a read was allowed. The sheet status
 * only says whether the type has been asked, and a query only says whether
 * a sample was found.
 */

import { APPLE_HEALTH_READ_TYPES } from '@/health/connection';
import { isoDay } from '@/domain/dates';

/** Eight weeks. Heart rate recovery, body fat, and lean mass use this window. */
export const HEALTH_SAMPLE_DAYS = 56;

export const HEALTH_VISIBILITY_TITLE = 'What Charioteer can see';

export const HEALTH_VISIBILITY_NOTE =
  'iOS does not tell an app whether a read was allowed. Each line says whether Charioteer has asked, and whether a sample was found in the last 8 weeks. No data found means no sample came back.';

export const HEALTH_ASK_AGAIN = 'Ask Health again';
export const HEALTH_CHECK_AGAIN = 'Check again';

const TITLES: Record<(typeof APPLE_HEALTH_READ_TYPES)[number], string> = {
  HKQuantityTypeIdentifierStepCount: 'Steps',
  HKQuantityTypeIdentifierRestingHeartRate: 'Resting heart rate',
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'Heart rate variability',
  HKQuantityTypeIdentifierVO2Max: 'Cardio fitness',
  HKQuantityTypeIdentifierWalkingHeartRateAverage: 'Walking heart rate',
  HKQuantityTypeIdentifierHeartRateRecoveryOneMinute: 'Heart rate recovery',
  HKQuantityTypeIdentifierBodyMass: 'Weight',
  HKQuantityTypeIdentifierHeight: 'Height',
  HKQuantityTypeIdentifierBodyFatPercentage: 'Body fat',
  HKQuantityTypeIdentifierLeanBodyMass: 'Lean mass',
  HKCategoryTypeIdentifierSleepAnalysis: 'Sleep',
  HKWorkoutTypeIdentifier: 'Workouts',
  HKQuantityTypeIdentifierActiveEnergyBurned: 'Active energy',
};

export type HealthAsk = 'yes' | 'no';

export type HealthVisibilityRow = {
  type: string;
  title: string;
  asked: HealthAsk;
  days: number;
};

export type HealthVisibilityReport =
  | { kind: 'web' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; rows: HealthVisibilityRow[] };

/** Stable fingerprint of the read types passed to HealthKit. Order does not matter. */
export function healthReadSetKey(types: readonly string[]): string {
  return [...types].sort().join('\n');
}

/**
 * An update that adds a type does not show the Health sheet until
 * requestAuthorization is called again with that type.
 */
export function healthReadSetChanged(stored: string | null, types: readonly string[]): boolean {
  if (!stored) return true;
  return stored !== healthReadSetKey(types);
}

export function healthReadTitle(type: string): string {
  return TITLES[type as (typeof APPLE_HEALTH_READ_TYPES)[number]] ?? type;
}

export function healthVisibilityLine(row: Pick<HealthVisibilityRow, 'title' | 'asked' | 'days'>): string {
  const asked = `asked: ${row.asked}`;
  if (row.days <= 0) return `${row.title}: ${asked}; no data found in the last 8 weeks`;
  const days = row.days === 1 ? '1 day' : `${row.days} days`;
  return `${row.title}: ${asked}; data found in the last 8 weeks: ${days}`;
}

export function unaskedHealthTypes(rows: readonly Pick<HealthVisibilityRow, 'type' | 'asked'>[]): string[] {
  return rows.filter((row) => row.asked === 'no').map((row) => row.type);
}

/** Distinct calendar days that fall inside the rolling window ending at `now`. */
export function daysInLookback(isoDays: readonly string[], now: Date, windowDays = HEALTH_SAMPLE_DAYS): number {
  const start = isoDay(new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000));
  const today = isoDay(now);
  const seen = new Set<string>();
  for (const day of isoDays) {
    const iso = day.slice(0, 10);
    if (iso >= start && iso <= today) seen.add(iso);
  }
  return seen.size;
}
