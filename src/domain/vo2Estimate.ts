import { parseIsoDay } from '@/domain/dates';

/** Shown under the VO2 chart. A missing reading is a missing outdoor workout, not a broken watch. */
export const VO2_ESTIMATE_NOTE =
  'Apple Watch estimates VO2 max after an outdoor walk, run or hike recorded as a workout with GPS and steady heart rate, usually every few days. No new reading means no qualifying workout yet.';

export const VO2_STALE_NUDGE = 'The last reading is more than 3 days old.';

export const VO2_PLAN_LABEL = 'Plan a walk or run to update it';

/** One outdoor session. Not a distance programme. */
export const VO2_PLAN_MINUTES = 30;

const STALE_AFTER_DAYS = 3;

/** `Last measured 18 Oct`. The year is left off so the line matches a calendar day. */
export function vo2MeasuredLine(day: string): string {
  const date = parseIsoDay(day.slice(0, 10));
  const dateDay = date.toLocaleDateString('en-GB', { day: 'numeric' });
  const month = date.toLocaleDateString('en-GB', { month: 'short' });
  return `Last measured ${dateDay} ${month}`;
}

export function daysSince(day: string, today: string): number {
  const start = parseIsoDay(day.slice(0, 10)).getTime();
  const end = parseIsoDay(today.slice(0, 10)).getTime();
  return Math.round((end - start) / 86_400_000);
}

/** More than three calendar days. A reading from three days ago is still current. */
export function vo2ReadingIsStale(day: string, today: string): boolean {
  return daysSince(day, today) > STALE_AFTER_DAYS;
}

export function latestVo2Day(samples: readonly { kind: string; recordedOn: string }[]): string | null {
  const days = samples
    .filter((sample) => sample.kind === 'vo2_max' && /^\d{4}-\d{2}-\d{2}/.test(sample.recordedOn))
    .map((sample) => sample.recordedOn.slice(0, 10))
    .sort();
  return days.at(-1) ?? null;
}
