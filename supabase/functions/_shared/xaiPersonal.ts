/** Shown when the server will not send personal or health context to xAI. */
export const COACHING_PAUSED = 'Coaching is paused. Your personal details were not sent.';

/**
 * Server kill switch. Unset, empty, or any value other than false leaves coaching on.
 * Ben sets XAI_PERSONAL_DATA_ENABLED=false after checking Zero Data Retention.
 */
export function xaiPersonalDataEnabled(value: string | null | undefined): boolean {
  if (value == null || value.trim() === '') return true;
  return value.trim().toLowerCase() !== 'false';
}
