/**
 * The one current resting heart rate.
 * A Garmin resting reading from the last 60 days wins.
 * Otherwise the latest Apple Health reading is used.
 * Average heart rate is not resting heart rate. An average of days is not a current reading.
 * The two sources are never mixed into one number.
 */

export const RESTING_CURRENT_WINDOW_DAYS = 60;

const MERGED_RESTING = 'merged:resting_heart_rate:';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type CurrentRestingSource = 'garmin' | 'apple';

export type CurrentResting = {
  value: number;
  day: string;
  source: CurrentRestingSource;
};

export type CurrentRestingInput = {
  today: string;
  /** Garmin resting heart rate only. Do not pass average heart rate. */
  garmin?: readonly { day: string; value: number | null | undefined }[];
  /** Apple Health rows, plus merged Garmin rows marked with a merged:resting_heart_rate: id. */
  samples?: readonly { id?: string | null; kind?: string; recordedOn: string; value: number }[];
};

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

function shortDay(iso: string): string {
  const [, month, date] = iso.split('-').map(Number);
  return `${date ?? 1} ${MONTHS[(month ?? 1) - 1] ?? ''}`.trim();
}

/** Latest Garmin resting heart rate inside 60 days, otherwise the latest Apple Health reading. */
export function currentRestingHeartRate(input: CurrentRestingInput): CurrentResting | null {
  const garmin = new Map<string, number>();
  const apple = new Map<string, { at: string; value: number }>();
  for (const row of input.garmin ?? []) {
    const day = dayOf(row.day);
    if (!day || day > input.today || row.value == null || !(row.value > 0)) continue;
    garmin.set(day, Math.round(row.value));
  }
  for (const row of input.samples ?? []) {
    if (row.kind != null && row.kind !== 'resting_heart_rate') continue;
    if (!(row.value > 0)) continue;
    const day = dayOf(row.recordedOn);
    if (!day || day > input.today) continue;
    const value = Math.round(row.value);
    if (row.id?.startsWith(MERGED_RESTING)) {
      if (!garmin.has(day)) garmin.set(day, value);
      continue;
    }
    const previous = apple.get(day);
    if (!previous || row.recordedOn >= previous.at) apple.set(day, { at: row.recordedOn, value });
  }
  const fresh = [...garmin.keys()].filter((day) => daysBetween(day, input.today) <= RESTING_CURRENT_WINDOW_DAYS);
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

/** `latest resting heart rate 52 bpm (Garmin, 20 Nov)`. */
export function currentRestingLine(reading: CurrentResting): string {
  const source = reading.source === 'garmin' ? 'Garmin' : 'Apple Health';
  return `latest resting heart rate ${reading.value} bpm (${source}, ${shortDay(reading.day)})`;
}

export function coachRestingNote(input: CurrentRestingInput): string | null {
  const reading = currentRestingHeartRate(input);
  return reading ? currentRestingLine(reading) : null;
}

/** Calendar days from stored Garmin daily rows. Average heart rate is ignored. */
export function garminRestingDays(rows: unknown): { day: string; value: number | null }[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as { calendar_date?: unknown; resting_heart_rate_bpm?: unknown };
    const day = typeof record.calendar_date === 'string' ? record.calendar_date.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
    const value = typeof record.resting_heart_rate_bpm === 'number' ? record.resting_heart_rate_bpm : null;
    return [{ day, value }];
  });
}

export function healthWithRestingNote<T extends { kind: string; latest: number | null; previous: number | null; unit: string; note?: string | null }>(
  health: T[],
  note: string | null,
): T[] {
  if (!note) return health;
  const written = { kind: 'resting_heart_rate', latest: null, previous: null, unit: 'bpm', note } as T;
  if (!health.some((item) => item.kind === 'resting_heart_rate')) return [...health, written];
  return health.map((item) => (item.kind === 'resting_heart_rate' ? { ...item, latest: null, previous: null, note } : item));
}
