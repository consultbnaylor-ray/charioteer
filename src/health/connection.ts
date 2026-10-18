import { formatUkLongWhen, formatUkTime } from '../domain/dates';

/**
 * Types Charioteer asks to read. It does not request write access.
 * Blood oxygen is not requested: the fitness snapshot does not use it.
 */
export const APPLE_HEALTH_READ_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierVO2Max',
  'HKQuantityTypeIdentifierWalkingHeartRateAverage',
  'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierHeight',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierLeanBodyMass',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKWorkoutTypeIdentifier',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
] as const;

export const APPLE_HEALTH_SHARE =
  'Charioteer reads steps, sleep, resting heart rate, heart rate variability, cardio fitness, walking heart rate, heart rate recovery, and workouts (type, duration, energy, and average heart rate), plus weight, height, body fat, lean body mass, and active energy. Readings stay on your iPhone. A short summary is sent to write your plan only if you turn the coach on. It is not used for ads. Other people cannot see this.';

export const APPLE_HEALTH_INTRO =
  'Connect Apple Health to see your steps, sleep, heart, cardio fitness, workouts, weight, and body readings here, and to save the food and water you log. Charioteer reads those on your iPhone and keeps a short summary. It writes only the meals and water you save: energy, protein, carbohydrate, sugar, fibre, fat, sodium and water. It does not write steps, sleep, heart rate, or weight. It does not use readings for ads. Other people never see them. You can disconnect any time in Settings > Health > Data Access & Devices.';

export const APPLE_HEALTH_WEB = 'Apple Health connects in the iPhone app. Here you can log readings yourself.';

export const APPLE_HEALTH_DENIED =
  'Apple Health did not finish the permission request. Turn categories on in the Health app: profile picture (top right) > Privacy > Apps > Charioteer. On iOS versions that have it: Settings > Health > Data Access & Devices > Charioteer.';

export const APPLE_HEALTH_CONSENT =
  'Health data is off. Turn it on in Privacy & consent if you want steps, sleep, and the other readings kept here.';

export const APPLE_HEALTH_UNAVAILABLE = 'Apple Health is not available on this device.';

export const APPLE_HEALTH_REFRESH = 'Refresh now';
export const APPLE_HEALTH_UPDATED = 'Updated just now';
export const APPLE_HEALTH_TURN_ON = 'Turn on in Apple Health';
export const APPLE_HEALTH_DETAILS = 'Details';

export type AppleHealthAccess = 'prompt' | 'connected' | 'denied' | 'unavailable' | 'web';

/** What happened when the missing-readings button asked Apple Health. */
export type AppleHealthTurnOn = 'prompted' | 'opened' | 'unavailable' | 'web';

/** The latest body mass and height Apple Health can offer for a nutrition target. */
export type AppleHealthBody = {
  weightKg: number | null;
  weightDay: string | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  leanMassKg: number | null;
  compositionDay: string | null;
};

/** One day's body fat and lean mass from Apple Health. Waist is entered by hand. */
export type AppleHealthComposition = {
  recordedOn: string;
  bodyFatPct: number | null;
  leanMassKg: number | null;
};

export type HealthCardKind =
  | { kind: 'consent' }
  | { kind: 'web' }
  | { kind: 'checking' }
  | { kind: 'prompt' }
  | { kind: 'connected'; line: string }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

/**
 * One line for the top of Health Stats.
 * Connected names the clock. Not connected and Some readings missing are the other two.
 */
export function appleHealthStatusLine(input: {
  consent: boolean;
  ios: boolean;
  access: AppleHealthAccess | null;
  syncedAt: string | null;
  missing: boolean;
}): string {
  if (!input.consent || !input.ios) return 'Apple Health: Not connected';
  if (input.access == null || input.access === 'web') return 'Apple Health: checking';
  if (input.access !== 'connected') return 'Apple Health: Not connected';
  if (input.missing) return 'Apple Health: Some readings missing';
  const when = appleHealthClock(input.syncedAt);
  if (!when) return 'Apple Health: connected';
  return `Apple Health: connected, last updated ${when}`;
}

function appleHealthClock(syncedAt: string | null): string | null {
  if (!syncedAt) return null;
  const date = new Date(syncedAt);
  if (Number.isNaN(date.getTime())) return null;
  return formatUkTime(date);
}

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
