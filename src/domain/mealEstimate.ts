import { UserFacingError } from '@/domain/errors';
import { CHECK_CONNECTION, SIGN_IN_AGAIN } from '@/domain/edgeRetry';
import { PHOTO_READ_FAIL } from '@/domain/nutrition';

/** Why a meal photo or description did not become an estimate. */
export type MealEstimateCategory =
  | 'preparation'
  | 'auth'
  | 'network'
  | 'timeout'
  | 'provider'
  | 'unavailable'
  | 'credits'
  | 'billing'
  | 'unreadable'
  | 'consent';

/**
 * Shown when our AI provider cannot answer: out of credit, busy, down, or too slow.
 * It does not blame the photo, says logging by hand still works, and no credit is used.
 * Matches AI_UNAVAILABLE_MESSAGES.meal on the server.
 */
export const PHOTO_PROVIDER_UNAVAILABLE =
  'Meal reading is resting right now. Logging by hand still works. Try again a bit later.';

/** The same line when the cause was our provider's balance. The person is not told why. */
export const MEAL_BILLING_UNAVAILABLE = PHOTO_PROVIDER_UNAVAILABLE;

/** Shown beside a text estimate worked out on the phone because the model could not answer. */
export const ROUGH_ESTIMATE_NOTE = 'Rough estimate. Meal reading is resting right now.';

/** Kept for the billing case. It reads the same as any other time the model cannot answer. */
export const ROUGH_ESTIMATE_BILLING_NOTE = ROUGH_ESTIMATE_NOTE;

const MESSAGES: Record<MealEstimateCategory, string> = {
  preparation: 'Could not prepare that photo. Try again, or type the meal.',
  auth: SIGN_IN_AGAIN,
  network: 'The meal estimate lost the connection. Tap to retry.',
  timeout: 'The meal estimate took too long. Tap to retry.',
  provider: 'The meal estimate did not answer. Tap to retry.',
  unavailable: PHOTO_PROVIDER_UNAVAILABLE,
  credits: 'No meal-reading credits left. You can still type the meal in yourself.',
  billing: MEAL_BILLING_UNAVAILABLE,
  unreadable: PHOTO_READ_FAIL,
  consent: 'Reading a meal needs the coach consent. You can still type the meal in yourself.',
};

export function mealEstimateMessage(category: MealEstimateCategory): string {
  return MESSAGES[category];
}

/** A classified meal failure. The message is safe to show. It never includes the photo or the meal. */
export class MealEstimateError extends UserFacingError {
  readonly category: MealEstimateCategory;

  constructor(category: MealEstimateCategory, message?: string) {
    super(message && message.trim() ? message.trim() : mealEstimateMessage(category), 'generic');
    this.name = 'MealEstimateError';
    this.category = category;
  }
}

/** Map an edge status onto a category. Null means the body can still be a normal estimate. */
export function mealEstimateCategoryFromStatus(status: number, code?: string | null): MealEstimateCategory | null {
  if (code === 'unread') return 'unreadable';
  if (code === 'consent') return 'consent';
  if (code === 'ai_unavailable' || code === 'provider_unavailable' || code === 'provider_busy') return 'unavailable';
  if (code === 'limit_reached' || code === 'subscription_required' || status === 402 || status === 429) return 'credits';
  if (status === 401) return 'auth';
  if (status === 408 || status === 504) return 'timeout';
  if (status >= 500) return 'provider';
  if (status === 400 && code === 'content') return 'unreadable';
  if (status === 422 || status === 400) return 'provider';
  return null;
}

/** What the nutrition screen should say. An unknown error is preparation, not a failed reading. */
export function mealPhotoFailure(error: unknown): MealEstimateError {
  if (error instanceof MealEstimateError) return error;
  if (error instanceof UserFacingError) {
    if (error.message === SIGN_IN_AGAIN) return new MealEstimateError('auth');
    if (error.message === CHECK_CONNECTION || error.message.includes('lost the connection')) return new MealEstimateError('network');
    if (error.message.includes('took too long')) return new MealEstimateError('timeout');
    if (error.message.includes('did not answer')) return new MealEstimateError('provider');
    return new MealEstimateError('preparation', error.message);
  }
  return new MealEstimateError('preparation');
}

/** The image picker was dismissed or nothing was chosen. That is not an estimate. */
export function isMealPickerCancel(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown; name?: unknown };
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message : '';
  const name = typeof record.name === 'string' ? record.name : '';
  return /cancel/i.test(`${code} ${name} ${message}`);
}

/** client_errors line. A category only, so a photo, a meal, and a token cannot be stored. */
export function mealEstimateLog(category: MealEstimateCategory): string {
  return `meal: ${category}`;
}
