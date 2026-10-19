/**
 * What the app can honestly say about Apple Health.
 * iOS does not tell an app whether a read was allowed. The sheet status
 * only says whether the type has been asked, and a query only says whether
 * a sample was found.
 */

import { APPLE_HEALTH_READ_TYPES } from '@/health/connection';
import { isoDay } from '@/domain/dates';

/** A rolling year, so a 12-month chart can be filled from one HealthKit read. */
export const HEALTH_SAMPLE_DAYS = 365;

export const HEALTH_VISIBILITY_TITLE = 'What Charioteer can see';

export const HEALTH_VISIBILITY_NOTE =
  'iOS does not tell an app whether a read was allowed. Each line says whether Charioteer has asked, and whether a sample was found in the last 12 months. No data found means no sample came back.';

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
  /**
   * Set only when a caller truly knows the read was refused.
   * HealthKit hides read permission, so this stays unset and the line says no data found.
   */
  access?: 'denied';
};

/** Collapsed label under the named missing line. */
export const HEALTH_MISSING_DETAIL = 'Why these are missing';

/**
 * One action for a reading with no sample.
 * HealthKit does not say the read was refused, so these assume no data was found.
 */
const MISSING_ACTION: Record<(typeof APPLE_HEALTH_READ_TYPES)[number], string> = {
  HKQuantityTypeIdentifierStepCount: 'Carry your iPhone or wear Apple Watch.',
  HKQuantityTypeIdentifierRestingHeartRate: 'Wear Apple Watch while you are still.',
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'Wear Apple Watch overnight.',
  HKQuantityTypeIdentifierVO2Max: 'Record an outdoor walk or run on Apple Watch.',
  HKQuantityTypeIdentifierWalkingHeartRateAverage: 'Take a walk with Apple Watch.',
  HKQuantityTypeIdentifierHeartRateRecoveryOneMinute: 'Needs a recent Apple Watch workout.',
  HKQuantityTypeIdentifierBodyMass: 'Use a scale in Health, or log weight on this page.',
  HKQuantityTypeIdentifierHeight: 'Enter height in the Health app.',
  HKQuantityTypeIdentifierBodyFatPercentage: 'Needs a smart scale or manual entry in Health.',
  HKQuantityTypeIdentifierLeanBodyMass: 'Needs a smart scale or manual entry in Health.',
  HKCategoryTypeIdentifierSleepAnalysis: 'No recent night recorded.',
  HKWorkoutTypeIdentifier: 'Record a workout on Apple Watch or in a workout app.',
  HKQuantityTypeIdentifierActiveEnergyBurned: 'Wear Apple Watch so movement is recorded.',
};

export type HealthReadFinding = 'no_data' | 'not_permitted';

export type HealthMissingReading = {
  type: string;
  title: string;
  finding: HealthReadFinding;
  line: string;
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
  if (row.days <= 0) return `${row.title}: ${asked}; no data found in the last 12 months`;
  const days = row.days === 1 ? '1 day' : `${row.days} days`;
  return `${row.title}: ${asked}; data found in the last 12 months: ${days}`;
}

export function unaskedHealthTypes(rows: readonly Pick<HealthVisibilityRow, 'type' | 'asked'>[]): string[] {
  return rows.filter((row) => row.asked === 'no').map((row) => row.type);
}

/** A type not yet asked, or asked with nothing in the last 12 months. */
export function healthVisibilityHasGaps(report: HealthVisibilityReport | null): boolean {
  return healthMissingReadings(report).length > 0;
}

/** Names for the refresher line: "Missing: Heart rate recovery, Body fat, Lean mass". */
export function healthMissingSummary(titles: readonly string[]): string {
  return `Missing: ${titles.join(', ')}`;
}

/**
 * One line: the reading, whether anything was found, and what to do.
 * "Not permitted" is used only when `access` is denied. HealthKit usually cannot say that.
 */
export function healthMissingDetail(row: Pick<HealthVisibilityRow, 'type' | 'title' | 'asked' | 'days' | 'access'>): string {
  const action = MISSING_ACTION[row.type as (typeof APPLE_HEALTH_READ_TYPES)[number]]
    ?? 'Check Apple Health for a recent sample.';
  if (row.access === 'denied') {
    return `${row.title}: Not permitted. Turn it on in Apple Health.`;
  }
  if (row.asked === 'no' && row.days > 0) {
    return `${row.title}: Not asked yet. Ask Apple Health. ${action}`;
  }
  const ask = row.asked === 'no' ? ' Ask Apple Health.' : '';
  return `${row.title}: No data found. ${action}${ask}`;
}

/** Readings the refresher should name. Order follows the report. */
export function healthMissingReadings(report: HealthVisibilityReport | null): HealthMissingReading[] {
  if (report?.kind !== 'ready') return [];
  return report.rows
    .filter((row) => row.asked === 'no' || row.days <= 0)
    .map((row) => ({
      type: row.type,
      title: row.title,
      finding: row.access === 'denied' ? 'not_permitted' : 'no_data',
      line: healthMissingDetail(row),
    }));
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
