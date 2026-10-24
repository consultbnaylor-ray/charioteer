import { quoteForUkDay, STOIC_QUOTES, type StoicQuote } from '@/domain/stoicQuotes';
import { londonDay } from '@/domain/healthInsights';
import type { PlannedSession } from '@/domain/plannedSession';

export const REMINDER_OFFSETS = ['1d', '1h', '30m'] as const;

export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

export type WorkoutReminderSetting = {
  on: boolean;
  offsets: ReminderOffset[];
};

export const WORKOUT_REMINDERS_KEY = 'charioteer.workoutReminders.v1';

export const DEFAULT_WORKOUT_REMINDERS: WorkoutReminderSetting = { on: false, offsets: [] };

const OFFSET_MS: Record<ReminderOffset, number> = {
  '1d': 24 * 60 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '30m': 30 * 60 * 1000,
};

const OFFSET_WORDS: Record<ReminderOffset, string> = {
  '1d': '1 day',
  '1h': '1 hour',
  '30m': '30 min',
};

/** Short lines written for the lock screen. No health figures. */
const FUTURE_SELF = [
  'To your future self: show up for the session you already chose.',
  'To your future self: begin the hour you set aside.',
  'To your future self: the session is still yours to start.',
  'To your future self: one honest start is enough.',
  'To your future self: you already decided. Go and do it.',
] as const;

const PRIVATE = /mood|weight|vo2|calorie|sober|craving|body fat|heart rate/i;

export function isReminderOffset(value: string): value is ReminderOffset {
  return (REMINDER_OFFSETS as readonly string[]).includes(value);
}

export function parseWorkoutReminders(raw: string | null | undefined): WorkoutReminderSetting {
  if (!raw) return { ...DEFAULT_WORKOUT_REMINDERS, offsets: [] };
  try {
    const parsed = JSON.parse(raw) as { on?: unknown; offsets?: unknown };
    const rawOffsets = Array.isArray(parsed.offsets) ? parsed.offsets : [];
    const offsets = REMINDER_OFFSETS.filter((offset) => rawOffsets.includes(offset));
    return { on: parsed.on === true, offsets: [...offsets] };
  } catch {
    return { ...DEFAULT_WORKOUT_REMINDERS, offsets: [] };
  }
}

/** The sentence under the bell. Off, on, or the chosen times. */
export function reminderSettingWords(setting: WorkoutReminderSetting): string {
  if (!setting.on) return 'Reminders off';
  const chosen = REMINDER_OFFSETS.filter((offset) => setting.offsets.includes(offset)).map((offset) => OFFSET_WORDS[offset]);
  if (!chosen.length) return 'Reminders on';
  return `Reminders on: ${chosen.join(', ')} before`;
}

export function offsetLeadMs(offset: ReminderOffset): number {
  return OFFSET_MS[offset];
}

export function reminderIdentifier(sessionId: string, offset: ReminderOffset): string {
  return `session_${sessionId}_${offset}`;
}

export type ReminderFire = {
  identifier: string;
  sessionId: string;
  offset: ReminderOffset;
  at: Date;
  title: string;
  body: string;
};

function usableQuote(quote: StoicQuote | undefined): string | null {
  const plain = quote?.plain?.replace(/\s+/g, ' ').trim() ?? '';
  if (!plain || PRIVATE.test(plain)) return null;
  return plain.length > 140 ? `${plain.slice(0, 139).trim()}…` : plain;
}

/** One line per offset. A paraphrase, or a line to your future self. No health details. */
export function reminderBody(sessionId: string, offset: ReminderOffset, at: Date): string {
  const day = londonDay(at);
  const quote = usableQuote(quoteForUkDay(day));
  const index = REMINDER_OFFSETS.indexOf(offset);
  const hash = [...`${sessionId}:${offset}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const future = FUTURE_SELF[(hash + index) % FUTURE_SELF.length] ?? FUTURE_SELF[0];
  if (hash % 2 === 0 || !quote) return future;
  const rotated = usableQuote(STOIC_QUOTES[(STOIC_QUOTES.indexOf(quoteForUkDay(day)) + index + 1) % Math.max(STOIC_QUOTES.length, 1)]);
  return rotated ?? quote;
}

/**
 * One local notification per selected offset, for future sessions that are not done.
 * A trigger that is already past is left out. Turning the setting off returns nothing.
 */
export function reminderFires(
  sessions: readonly PlannedSession[],
  setting: WorkoutReminderSetting,
  now: Date,
): ReminderFire[] {
  if (!setting.on || setting.offsets.length === 0) return [];
  const offsets = REMINDER_OFFSETS.filter((offset) => setting.offsets.includes(offset));
  const fires: ReminderFire[] = [];
  for (const session of sessions) {
    if (session.doneAt) continue;
    const start = Date.parse(session.startsAt);
    if (!Number.isFinite(start) || start <= now.getTime()) continue;
    for (const offset of offsets) {
      const atMs = start - OFFSET_MS[offset];
      if (atMs <= now.getTime()) continue;
      const at = new Date(atMs);
      fires.push({
        identifier: reminderIdentifier(session.id, offset),
        sessionId: session.id,
        offset,
        at,
        title: 'Planned session',
        body: reminderBody(session.id, offset, at),
      });
    }
  }
  return fires;
}

export function sessionHasReminder(session: PlannedSession, setting: WorkoutReminderSetting, now: Date): boolean {
  return reminderFires([session], setting, now).length > 0;
}
