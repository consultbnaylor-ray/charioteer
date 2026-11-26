/**
 * How estimate-meal classifies a model that did not return a meal.
 * An outage, a missing key, or a dropped call is not an unreadable photo.
 * Unreadable stays for model text that is not a meal estimate.
 */

export type MealProviderFault =
  | { kind: 'missing_key' }
  | { kind: 'timeout' }
  | { kind: 'network' }
  | { kind: 'http'; status: number }
  | { kind: 'unparsed' };

export type MealProviderResult =
  | { outcome: 'unavailable'; status: 503; code: 'provider_unavailable' | 'provider_busy' }
  | { outcome: 'unread'; status: 422; code: 'unread' }
  | { outcome: 'local'; providerUnavailable: boolean };

/** Set on a meal 503 the phone should not retry automatically. */
export const MEAL_NO_RETRY_HEADER = 'X-Charioteer-No-Retry';

/** The provider refused for billing (402). Retrying in a second cannot help. */
export function providerRetryPointless(fault: MealProviderFault): boolean {
  return fault.kind === 'http' && fault.status === 402;
}

/** Provider HTTP statuses that mean the service failed, not the photo. */
export function providerHttpOutage(status: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 429 || status >= 500;
}

/**
 * Photo calls that cannot reach a usable model answer with 503.
 * Text calls keep the on-device estimate and flag a provider failure.
 * Only unparseable model output stays `unread`.
 */
export function mealProviderResult(photo: boolean, fault: MealProviderFault): MealProviderResult {
  if (fault.kind === 'unparsed') {
    return photo
      ? { outcome: 'unread', status: 422, code: 'unread' }
      : { outcome: 'local', providerUnavailable: false };
  }
  if (photo) {
    const busy = fault.kind === 'http' && fault.status === 429;
    return {
      outcome: 'unavailable',
      status: 503,
      code: busy ? 'provider_busy' : 'provider_unavailable',
    };
  }
  return { outcome: 'local', providerUnavailable: true };
}
