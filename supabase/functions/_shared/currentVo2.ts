/**
 * The one current VO2 max.
 * A Garmin running reading from the last 60 days wins.
 * Otherwise the latest Apple Health reading is used.
 * Cycling VO2 max is not used. An average is not a current reading.
 */

export const VO2_CURRENT_WINDOW_DAYS = 60;

const MERGED_VO2 = 'merged:vo2_max:';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type CurrentVo2Source = 'garmin' | 'apple';

export type CurrentVo2 = {
  value: number;
  day: string;
  source: CurrentVo2Source;
};

export type CurrentVo2Input = {
  today: string;
  /** Garmin running VO2 max. Cycling values are not passed here. */
  garmin?: readonly { day: string; value: number | null | undefined }[];
  /** Apple Health rows, plus merged Garmin rows marked with a merged:vo2_max: id. */
  samples?: readonly { id?: string | null; kind?: string; recordedOn: string; value: number }[];
};

function roundVo2(value: number): number {
  return Math.round(value * 10) / 10;
}

function dayOf(stamp: string): string | null {
  const day = stamp.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 9999;
  return Math.round((end - start) / 86_400_000);
}

function latestDay(days: Iterable<string>): string | null {
  let latest: string | null = null;
  for (const day of days) {
    if (latest == null || day > latest) latest = day;
  }
  return latest;
}

/** Latest Garmin running VO2 max inside 60 days, otherwise the latest Apple Health reading. */
export function currentVo2Max(input: CurrentVo2Input): CurrentVo2 | null {
  const garmin = new Map<string, number>();
  const apple = new Map<string, { at: string; value: number }>();
  for (const row of input.garmin ?? []) {
    const day = dayOf(row.day);
    if (!day || day > input.today || row.value == null || !(row.value > 0)) continue;
    garmin.set(day, roundVo2(row.value));
  }
  for (const row of input.samples ?? []) {
    if (row.kind != null && row.kind !== 'vo2_max') continue;
    if (!(row.value > 0)) continue;
    const day = dayOf(row.recordedOn);
    if (!day || day > input.today) continue;
    const value = roundVo2(row.value);
    if (row.id?.startsWith(MERGED_VO2)) {
      if (!garmin.has(day)) garmin.set(day, value);
      continue;
    }
    const previous = apple.get(day);
    if (!previous || row.recordedOn >= previous.at) apple.set(day, { at: row.recordedOn, value });
  }
  const fresh = [...garmin.keys()].filter((day) => daysBetween(day, input.today) <= VO2_CURRENT_WINDOW_DAYS);
  const garminDay = latestDay(fresh);
  if (garminDay) {
    const value = garmin.get(garminDay);
    if (value != null) return { value, day: garminDay, source: 'garmin' };
  }
  const appleDay = latestDay(apple.keys());
  if (!appleDay) return null;
  const chosen = apple.get(appleDay);
  if (!chosen) return null;
  return { value: chosen.value, day: appleDay, source: 'apple' };
}

/** `latest VO2 max 44.0 (Garmin, 29 Oct)`. */
export function currentVo2Line(reading: CurrentVo2): string {
  const [, month, date] = reading.day.split('-').map(Number);
  const label = `${date ?? 1} ${MONTHS[(month ?? 1) - 1] ?? ''}`.trim();
  const source = reading.source === 'garmin' ? 'Garmin' : 'Apple Health';
  return `latest VO2 max ${reading.value.toFixed(1)} (${source}, ${label})`;
}
