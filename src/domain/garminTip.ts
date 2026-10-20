/** Shown near Apple Health and the fitness card until the person dismisses it. */
export const GARMIN_TIP_TITLE = 'Using a Garmin?';

export const GARMIN_TIP_BODY =
  "Charioteer reads from Apple Health. In the Garmin Connect app, go to the Apple Health connection setting and switch on sharing, so workouts, heart rate, steps and sleep flow in. Garmin doesn't send VO2 max or GPS routes to Apple Health, so the VO2 card and route maps need an Apple Watch or iPhone-recorded workout.";

/** Stored when the signed-in profile has no id yet, so a dismiss still sticks on this phone. */
export const GARMIN_TIP_DEVICE = 'device';

export function garminTipProfileKey(profileId: string | null | undefined): string {
  const id = profileId?.trim();
  return id ? id : GARMIN_TIP_DEVICE;
}

export function garminTipDismissedIn(raw: string | null, profileId: string): boolean {
  if (!raw || !profileId) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed?.[profileId] === true;
  } catch {
    return false;
  }
}

export function withGarminTipDismissed(raw: string | null, profileId: string): string {
  let parsed: Record<string, boolean> = {};
  if (raw) {
    try {
      const value = JSON.parse(raw) as Record<string, boolean>;
      if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value;
    } catch {
      parsed = {};
    }
  }
  if (profileId) parsed[profileId] = true;
  return JSON.stringify(parsed);
}
