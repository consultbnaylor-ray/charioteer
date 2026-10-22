export {
  GARMIN_PRIVACY,
  emptyGarminReadings,
  garminFigures,
  garminReturnFromUrl,
  type GarminActivity,
  type GarminDaily,
  type GarminFigure,
  type GarminReadings,
  type GarminSleep,
} from '../../supabase/functions/_shared/garmin';

export type GarminAppReturn = 'connected' | 'cancelled';

let notedReturn: GarminAppReturn | null = null;
const returnListeners = new Set<() => void>();

/** Remember a Garmin hand-back in this app session, including while onboarding stays open. */
export function noteGarminAppReturn(value: GarminAppReturn): void {
  notedReturn = value;
  for (const listener of returnListeners) listener();
}

export function peekGarminAppReturn(): GarminAppReturn | null {
  return notedReturn;
}

export function subscribeGarminAppReturn(listener: () => void): () => void {
  returnListeners.add(listener);
  return () => {
    returnListeners.delete(listener);
  };
}

let resumeGarminStep = false;

/** Next onboarding mount opens the Garmin step. A hand-back must not jump to You. */
export function holdOnboardingGarminStep(): void {
  resumeGarminStep = true;
}

export function onboardingResumesOnGarmin(): boolean {
  return resumeGarminStep;
}

export function clearOnboardingGarminStep(): void {
  resumeGarminStep = false;
}
