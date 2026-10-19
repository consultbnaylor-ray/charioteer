import { londonDay, mondayOf, shiftDay } from '@/domain/healthInsights';
import { workoutTypeKind } from '@/domain/fitnessSnapshot';

export const PLANNED_SESSION_TYPES = ['run', 'cardio', 'strength', 'boxing', 'other'] as const;

export type PlannedSessionType = (typeof PLANNED_SESSION_TYPES)[number];

export type PlannedSession = {
  id: string;
  sessionType: PlannedSessionType;
  /** ISO timestamp. */
  startsAt: string;
  durationMinutes: number;
  note: string;
  doneAt: string | null;
};

export type PlannedSessionDraft = {
  sessionType: PlannedSessionType;
  startsAt: string;
  durationMinutes: number;
  note: string;
};

export const SESSION_TYPE_LABEL: Record<PlannedSessionType, string> = {
  run: 'Run',
  cardio: 'Cardio',
  strength: 'Strength',
  boxing: 'Boxing',
  other: 'Other',
};

/** HealthKit activity types already used for the strength, cardio, and conditioning split. */
const SESSION_ACTIVITY: Record<PlannedSessionType, number> = {
  run: 37,
  cardio: 13,
  strength: 50,
  boxing: 8,
  other: 3000,
};

export function isPlannedSessionType(value: string): value is PlannedSessionType {
  return (PLANNED_SESSION_TYPES as readonly string[]).includes(value);
}

export function plannedSessionFromRow(row: unknown): PlannedSession | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  const sessionType = typeof record.session_type === 'string' ? record.session_type : '';
  const startsAt = typeof record.starts_at === 'string' ? record.starts_at : '';
  const duration = typeof record.duration_minutes === 'number' ? record.duration_minutes : Number(record.duration_minutes);
  const note = typeof record.note === 'string' ? record.note : '';
  const doneAt = typeof record.done_at === 'string' ? record.done_at : null;
  if (!id || !isPlannedSessionType(sessionType) || !startsAt || Number.isNaN(Date.parse(startsAt))) return null;
  if (!Number.isFinite(duration) || duration < 10 || duration > 240) return null;
  return {
    id,
    sessionType,
    startsAt: new Date(startsAt).toISOString(),
    durationMinutes: Math.round(duration),
    note: note.slice(0, 280),
    doneAt: doneAt && !Number.isNaN(Date.parse(doneAt)) ? new Date(doneAt).toISOString() : null,
  };
}

export function sessionDay(session: Pick<PlannedSession, 'startsAt'>): string {
  return londonDay(session.startsAt);
}

/** A calendar date and clock, read as Europe/London, stored as an ISO instant. */
export function londonWallTime(day: string, time: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})$/.exec(day);
  const clock = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!match || !clock) return null;
  const [year, month, date] = day.split('-').map(Number);
  const hour = Number(clock[1]);
  const minute = Number(clock[2]);
  if (hour > 23 || minute > 59) return null;
  const utc = new Date(Date.UTC(year, (month ?? 1) - 1, date ?? 1, hour, minute, 0));
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(utc);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const shown = Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute'));
  const instant = new Date(utc.getTime() - (shown - utc.getTime()));
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

export function sessionClock(session: Pick<PlannedSession, 'startsAt'>): string {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(session.startsAt));
  return time.replace(/\s/g, '');
}

/** Words beside the icon. The type is named, so the icon is not the only cue. */
export function sessionWords(session: PlannedSession): string {
  const note = session.note.trim();
  const head = `${SESSION_TYPE_LABEL[session.sessionType]} · ${sessionClock(session)} · about ${session.durationMinutes} min`;
  return note ? `${head}. ${note}` : head;
}

/**
 * Done plans count as workout minutes on that London day.
 * The type minute lets the strength and cardio split see them.
 * A session that is not done adds nothing.
 */
export function plannedDoneSamples(sessions: readonly PlannedSession[]): { kind: string; value: number; recordedOn: string; source: 'manual' }[] {
  return sessions.flatMap((session) => {
    if (!session.doneAt || session.durationMinutes <= 0) return [];
    const recordedOn = sessionDay(session);
    const activity = SESSION_ACTIVITY[session.sessionType];
    return [
      { kind: 'workout_minutes', value: session.durationMinutes, recordedOn, source: 'manual' as const },
      { kind: workoutTypeKind(activity), value: session.durationMinutes, recordedOn, source: 'manual' as const },
    ];
  });
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** The next London date with that weekday name, including today. */
export function nextWeekday(name: string, now = new Date()): string {
  const target = WEEKDAY_NAMES.indexOf(name as (typeof WEEKDAY_NAMES)[number]);
  const today = londonDay(now);
  if (target < 0) return today;
  const candidate = shiftDay(mondayOf(today), target);
  return candidate < today ? shiftDay(candidate, 7) : candidate;
}

export function withPlannedMinutes<T extends { kind: string; value: number; recordedOn: string }>(
  samples: readonly T[],
  sessions: readonly PlannedSession[] | null | undefined,
): T[] {
  const extra = plannedDoneSamples(sessions ?? []);
  if (!extra.length) return [...samples];
  return [...samples, ...(extra as unknown as T[])];
}
