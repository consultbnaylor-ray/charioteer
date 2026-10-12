import { moodOnTen } from '../../supabase/functions/_shared/mood';
import { isoDay } from './dates';
import { londonDay } from './healthInsights';

export { moodOnTen };

export const MOOD_SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type CheckInPoint = {
  mood: number;
  craving: number;
  createdAt: string;
};

export type CheckInDay = {
  day: string;
  label: string;
  mood: number | null;
  craving: number | null;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Seven local days ending today. The newest check-in on a day replaces an earlier one. */
export function recentCheckInDays(checkIns: CheckInPoint[], today: Date): CheckInDay[] {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days: CheckInDay[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - offset);
    days.push({
      day: isoDay(date),
      label: WEEKDAYS[date.getDay()],
      mood: null,
      craving: null,
    });
  }
  const indexByDay = new Map(days.map((day, index) => [day.day, index]));
  const latestAt = new Map<string, string>();
  for (const item of checkIns) {
    const key = isoDay(new Date(item.createdAt));
    const index = indexByDay.get(key);
    if (index == null) continue;
    const previous = latestAt.get(key);
    if (previous != null && previous >= item.createdAt) continue;
    latestAt.set(key, item.createdAt);
    days[index] = { ...days[index], mood: item.mood, craving: item.craving };
  }
  return days;
}

/** Mean of the days that have a mood. A blank day is not treated as zero. */
export function weeklyMoodAverage(days: { mood: number | null }[]): number | null {
  const values = days.map((day) => day.mood).filter((value): value is number => value != null && Number.isFinite(value));
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function formatMoodAverage(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `Average ${text}/10`;
}

/**
 * One-time conversion for a saved sample account. Scores already on 1-10
 * (moodScale 10) are left alone, including a real 4, which must not become 8.
 */
export function convertStoredMoods<T extends { mood: number }>(
  checkIns: T[],
  moodScale: number | undefined,
): { checkIns: T[]; moodScale: 10; converted: boolean } {
  if (moodScale === 10) return { checkIns, moodScale: 10, converted: false };
  return {
    checkIns: checkIns.map((item) => {
      const mood = moodOnTen(item.mood, null);
      return mood === item.mood ? item : { ...item, mood };
    }),
    moodScale: 10,
    converted: true,
  };
}

const GRATEFUL_LINE_LIMIT = 200;
const GRATEFUL_LINE_COUNT = 3;

/** Up to three short lines. An empty field is a deliberate blank, not an error. */
export function planCheckInGratitude(raw: string): { ok: true; body: string } | { ok: false; message: string } {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > GRATEFUL_LINE_COUNT) return { ok: false, message: 'Keep it to three short lines.' };
  if (lines.some((line) => line.length > GRATEFUL_LINE_LIMIT)) return { ok: false, message: 'Keep each line to 200 characters.' };
  return { ok: true, body: lines.join('\n') };
}

/** One quiet line for a recent check-in. The words are whatever the diary holds now. */
export function gratefulForLine(body: string): string | null {
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  return `Grateful for... ${lines.join(' · ')}`;
}

export type CheckInGratitudeSync =
  | { kind: 'skip' }
  | { kind: 'remove' }
  | { kind: 'write'; id: string; body: string; entryDate: string; createdAt: string; updatedAt: string; fresh: boolean };

/**
 * One diary row per check-in. A second save updates that row, a blank field
 * removes it, and the row keeps the check-in's time.
 */
export function planCheckInGratitudeSync(
  existing: { id: string; createdAt: string } | null,
  checkIn: { id: string; createdAt: string },
  raw: string,
  now: Date,
  makeId: () => string,
): { ok: true; sync: CheckInGratitudeSync } | { ok: false; message: string } {
  const planned = planCheckInGratitude(raw);
  if (!planned.ok) return planned;
  if (!planned.body) return { ok: true, sync: existing ? { kind: 'remove' } : { kind: 'skip' } };
  const entryDate = londonDay(checkIn.createdAt);
  if (existing) {
    return {
      ok: true,
      sync: {
        kind: 'write',
        id: existing.id,
        body: planned.body,
        entryDate,
        createdAt: existing.createdAt,
        updatedAt: now.toISOString(),
        fresh: false,
      },
    };
  }
  return {
    ok: true,
    sync: {
      kind: 'write',
      id: makeId(),
      body: planned.body,
      entryDate,
      createdAt: checkIn.createdAt,
      updatedAt: now.toISOString(),
      fresh: true,
    },
  };
}
