import { parseIsoDay } from '@/domain/dates';

/** How Apple Watch estimates VO2 max. Kept as its own sentence so the card can lead with it. */
export const VO2_ESTIMATE_NOTE =
  'Apple Watch estimates VO2 max after an outdoor walk, run or hike recorded as a workout with GPS and steady heart rate, usually every few days. No new reading means no qualifying workout yet.';

/** Apple half of the card. The existing sentence, labelled so it sits beside the Garmin half. */
export const VO2_APPLE_PART = `Apple Watch: ${VO2_ESTIMATE_NOTE.replace(/^Apple Watch /, '')}`;

/**
 * Garmin half of the card. General, and true whether or not a reading has arrived.
 * No watch model, and no claim that Garmin has or has not sent a number.
 */
export const VO2_GARMIN_PART =
  'Garmin: watches estimate VO2 max from heart rate and pace during outdoor walks or runs with GPS (and some other activities), with a minimum effort level. The reading updates after a qualifying activity.';

export type Vo2Source = 'apple' | 'garmin';

/** Both sources, every time. The latest reading's source comes first. With no reading yet, Apple leads. */
export function vo2NoteParts(source: Vo2Source | null): readonly [string, string] {
  if (source === 'garmin') return [VO2_GARMIN_PART, VO2_APPLE_PART];
  return [VO2_APPLE_PART, VO2_GARMIN_PART];
}

export function vo2Note(source: Vo2Source | null): string {
  return vo2NoteParts(source).join('\n\n');
}

export const VO2_STALE_NUDGE = 'The last reading is more than 3 days old.';

export const VO2_PLAN_LABEL = 'Plan a walk or run to update it';

/** One outdoor session. Not a distance programme. */
export const VO2_PLAN_MINUTES = 30;

const STALE_AFTER_DAYS = 3;

/** `Last measured 18 Oct (Apple Health)` or `Last measured 18 Oct (Garmin)`. */
export function vo2MeasuredLine(day: string, source?: Vo2Source | null): string {
  const date = parseIsoDay(day.slice(0, 10));
  const dateDay = date.toLocaleDateString('en-GB', { day: 'numeric' });
  const month = date.toLocaleDateString('en-GB', { month: 'short' });
  const base = `Last measured ${dateDay} ${month}`;
  if (source === 'garmin') return `${base} (Garmin)`;
  if (source === 'apple') return `${base} (Apple Health)`;
  return base;
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
  return latestVo2Reading(samples)?.day ?? null;
}

/** The newest VO2 day. Apple wins when that day has an Apple reading. A merged Garmin row is marked by its id. */
export function latestVo2Reading(
  samples: readonly { id?: string; kind: string; recordedOn: string }[],
): { day: string; source: Vo2Source } | null {
  const rows = samples.filter((sample) => sample.kind === 'vo2_max' && /^\d{4}-\d{2}-\d{2}/.test(sample.recordedOn));
  const day = rows.map((sample) => sample.recordedOn.slice(0, 10)).sort().at(-1);
  if (!day) return null;
  const onDay = rows.filter((sample) => sample.recordedOn.slice(0, 10) === day);
  const apple = onDay.some((sample) => !sample.id?.startsWith('merged:vo2_max:'));
  return { day, source: apple ? 'apple' : 'garmin' };
}
