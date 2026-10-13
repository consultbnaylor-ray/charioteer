import { formatUkLongWhen } from '../domain/dates';

/** Types Charioteer asks to read. It does not request write access. */
export const APPLE_HEALTH_READ_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierBodyMass',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKWorkoutTypeIdentifier',
] as const;

export const APPLE_HEALTH_INTRO =
  'Connect Apple Health to see your steps, sleep, resting heart rate, HRV, workouts and weight here, and to save the food and water you log. Charioteer reads steps, sleep, heart rate, HRV, workouts and weight. It writes only the meals and water you save: energy, protein, carbohydrate, sugar, fibre, fat, sodium and water. It does not write steps, sleep, heart rate, or weight. Other people never see these readings. You can disconnect any time in Settings > Health > Data Access & Devices.';

export const APPLE_HEALTH_WEB = 'Apple Health connects in the iPhone app. Here you can log readings yourself.';

export const APPLE_HEALTH_DENIED =
  'Apple Health access is off. Turn it on in Settings > Health > Data Access & Devices > Charioteer.';

export const APPLE_HEALTH_CONSENT =
  'Health data is off. Turn it on in Privacy & consent if you want steps, sleep, and the other readings kept here.';

export const APPLE_HEALTH_UNAVAILABLE = 'Apple Health is not available on this device.';

export type AppleHealthAccess = 'prompt' | 'connected' | 'denied' | 'unavailable' | 'web';

export type HealthCardKind =
  | { kind: 'consent' }
  | { kind: 'web' }
  | { kind: 'checking' }
  | { kind: 'prompt' }
  | { kind: 'connected'; line: string }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

export function connectedAppleHealthLine(syncedAt: Date | string | null): string {
  if (syncedAt == null) return 'Connected to Apple Health';
  const date = syncedAt instanceof Date ? syncedAt : new Date(syncedAt);
  if (Number.isNaN(date.getTime())) return 'Connected to Apple Health';
  return `Connected to Apple Health · last synced ${formatUkLongWhen(date)}`;
}

/** Consent comes first. Apple Health itself is only offered on iOS. */
export function healthCardState(input: {
  consent: boolean;
  ios: boolean;
  access: AppleHealthAccess | null;
  syncedAt: string | null;
}): HealthCardKind {
  if (!input.consent) return { kind: 'consent' };
  if (!input.ios) return { kind: 'web' };
  if (input.access == null || input.access === 'web') return { kind: 'checking' };
  if (input.access === 'unavailable') return { kind: 'unavailable' };
  if (input.access === 'denied') return { kind: 'denied' };
  if (input.access === 'connected') return { kind: 'connected', line: connectedAppleHealthLine(input.syncedAt) };
  return { kind: 'prompt' };
}

/** Apple does not say whether a read was refused. These are the failures we can see. */
export function isHealthAccessDenied(message: string): boolean {
  return /not granted|denied|not authorized/i.test(message);
}
