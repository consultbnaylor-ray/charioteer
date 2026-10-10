import { isoDay, startOfLocalDay } from './dates';

/**
 * Corrects the sober start date. The same calendar day keeps the stored instant.
 * This is not a relapse: it does not build a relapse record or reset the clock to now
 * unless the corrected day is today.
 */
export function correctedSoberStart(chosen: Date, previousIso: string | null, now = new Date()): string {
  const day = startOfLocalDay(chosen);
  const today = startOfLocalDay(now);
  if (day.getTime() > today.getTime()) throw new Error('Choose today or an earlier day.');
  if (previousIso && isoDay(new Date(previousIso)) === isoDay(day)) return previousIso;
  if (isoDay(day) === isoDay(now)) return now.toISOString();
  return day.toISOString();
}
