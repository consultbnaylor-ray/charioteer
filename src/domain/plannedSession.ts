import { londonDay, mondayOf, shiftDay } from '@/domain/healthInsights';
import { workoutTypeKind } from '@/domain/fitnessSnapshot';
import { isTransientNetworkError } from '@/domain/errors';
import type { DeviceWorkout } from '@/domain/workoutRoute';

export const PLANNED_SESSION_TYPES = ['run', 'outdoor', 'cardio', 'strength', 'boxing', 'other'] as const;

export type PlannedSessionType = (typeof PLANNED_SESSION_TYPES)[number];

export type PlannedSession = {
  id: string;
  sessionType: PlannedSessionType;
  /** ISO timestamp. */
  startsAt: string;
  durationMinutes: number;
  note: string;
  /** Easy, Moderate, Hard, or a number from 1 to 10. Null when they left it blank. */
  plannedEffort: PlannedEffort | null;
  doneAt: string | null;
};

export type PlannedSessionDraft = {
  /** Set on the phone so a retry keeps the same row. */
  id?: string;
  sessionType: PlannedSessionType;
  startsAt: string;
  durationMinutes: number;
  note: string;
  plannedEffort: PlannedEffort | null;
};

/** One pause before the second send. Short enough to stay on a weak signal. */
export const PLANNED_SESSION_RETRY_MS = 400;

export type PlannedWrite<T> = { ok: true; row: T | null } | { ok: false; error: unknown };

/** The same client id, sent again once, only when the first send never got a response. */
export async function plannedSessionWrite<T>(
  attempt: () => Promise<PlannedWrite<T>>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<PlannedWrite<T>> {
  const first = await runPlannedAttempt(attempt);
  if (first.ok || !isTransientNetworkError(first.error)) return first;
  await wait(PLANNED_SESSION_RETRY_MS);
  return runPlannedAttempt(attempt);
}

async function runPlannedAttempt<T>(attempt: () => Promise<PlannedWrite<T>>): Promise<PlannedWrite<T>> {
  try {
    return await attempt();
  } catch (error) {
    return { ok: false, error };
  }
}

/** A row the phone already knows, used when the server ignored a duplicate id. */
export function plannedSessionFromDraft(id: string, input: PlannedSessionDraft): PlannedSession | null {
  return plannedSessionFromRow({
    id,
    session_type: input.sessionType,
    starts_at: input.startsAt,
    duration_minutes: input.durationMinutes,
    note: input.note,
    planned_effort: plannedEffortToDb(input.plannedEffort),
    done_at: null,
  });
}

/** Easy, Moderate, Hard, or a score from 1 to 10. One choice, and it can be left blank. */
export const PLANNED_EFFORT_WORDS = ['easy', 'moderate', 'hard'] as const;

export type PlannedEffortWord = (typeof PLANNED_EFFORT_WORDS)[number];

export type PlannedEffort = PlannedEffortWord | number;

export const PLANNED_EFFORT_WORD_LABEL: Record<PlannedEffortWord, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  hard: 'Hard',
};

export const PLANNED_EFFORT_SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** HealthKit activity types that can supply the actual effort for a plan of this type. */
const SESSION_MATCH_TYPES: Record<PlannedSessionType, readonly number[]> = {
  run: [37],
  outdoor: [37, 52, 24],
  cardio: [13, 16, 35, 44, 46],
  strength: [11, 20, 50, 59],
  boxing: [8],
  other: [3000],
};

export const SESSION_TYPE_LABEL: Record<PlannedSessionType, string> = {
  run: 'Run',
  outdoor: 'Run/Walk (outdoor)',
  cardio: 'Cardio',
  strength: 'Strength',
  boxing: 'Boxing',
  other: 'Other',
};

/** HealthKit activity types already used for the strength, cardio, and conditioning split. */
const SESSION_ACTIVITY: Record<PlannedSessionType, number> = {
  run: 37,
  outdoor: 52,
  cardio: 13,
  strength: 50,
  boxing: 8,
  other: 3000,
};

export function isPlannedSessionType(value: string): value is PlannedSessionType {
  return (PLANNED_SESSION_TYPES as readonly string[]).includes(value);
}

/** Blank, Easy, Moderate, Hard, or 1 to 10. Anything else is left blank. */
export function plannedEffortFrom(value: unknown): PlannedEffort | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10) return value;
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (text === 'easy' || text === 'moderate' || text === 'hard') return text;
  if (/^(10|[1-9])$/.test(text)) return Number(text);
  return null;
}

/** Stored as text. A number is '7', a word is 'easy'. Null stays null. */
export function plannedEffortToDb(effort: PlannedEffort | null): string | null {
  if (effort == null) return null;
  return String(effort);
}

/** 'Planned Easy' or 'Planned 7/10'. Null when they set none. */
export function plannedEffortLabel(effort: PlannedEffort | null): string | null {
  if (effort == null) return null;
  if (typeof effort === 'number') return `Planned ${effort}/10`;
  return `Planned ${PLANNED_EFFORT_WORD_LABEL[effort]}`;
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
    plannedEffort: plannedEffortFrom(record.planned_effort),
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

/**
 * Clock for a new session.
 * Another day starts at 18:00. Today uses the next quarter hour in London, and a slot after midnight stays at 18:00.
 */
export function nextSessionClock(now = new Date(), day?: string): string {
  const today = londonDay(now);
  if (day && day !== today) return '18:00';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '18:00';
  const remainder = minute % 15;
  let nextMinute = remainder === 0 ? minute : minute + (15 - remainder);
  let nextHour = hour;
  if (nextMinute >= 60) {
    nextMinute = 0;
    nextHour += 1;
  }
  if (nextHour >= 24) return '18:00';
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
}

/** The iOS wheel moves in 5-minute steps, so a saved clock lands on one of those steps. */
export function snapSessionClock(time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!match) return '18:00';
  let hours = Number(match[1]);
  let minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return '18:00';
  const snapped = Math.round(minutes / 5) * 5;
  if (snapped === 60) {
    minutes = 0;
    hours = (hours + 1) % 24;
  } else {
    minutes = snapped;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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

/**
 * One Health workout for each past or done plan. The closest start of the same kind wins.
 * A workout is used once, so two plans on one day do not share a reading.
 */
export function matchedSessionWorkouts(
  sessions: readonly PlannedSession[],
  workouts: readonly DeviceWorkout[],
): Map<string, DeviceWorkout> {
  const pairs = sessions.flatMap((session) => {
    const day = sessionDay(session);
    const types = SESSION_MATCH_TYPES[session.sessionType];
    const start = Date.parse(session.startsAt);
    return workouts.flatMap((workout) => {
      if (londonDay(workout.startedAt) !== day || !types.includes(workout.activityType)) return [];
      return [{ sessionId: session.id, workout, gap: Math.abs(Date.parse(workout.startedAt) - start) }];
    });
  });
  pairs.sort((left, right) => left.gap - right.gap || left.sessionId.localeCompare(right.sessionId));
  const used = new Set<string>();
  const chosen = new Map<string, DeviceWorkout>();
  for (const pair of pairs) {
    if (chosen.has(pair.sessionId) || used.has(pair.workout.id)) continue;
    chosen.set(pair.sessionId, pair.workout);
    used.add(pair.workout.id);
  }
  return chosen;
}

/** Words beside the swatch. The type is named, so the colour is not the only cue. */
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

/** The weekday named at the start of a plan line, as a London date. */
export function planDayFromSessionText(text: string, now = new Date()): string | null {
  const match = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/.exec(text);
  if (!match?.[1]) return null;
  return nextWeekday(match[1], now);
}

export function withPlannedMinutes<T extends { kind: string; value: number; recordedOn: string }>(
  samples: readonly T[],
  sessions: readonly PlannedSession[] | null | undefined,
): T[] {
  const extra = plannedDoneSamples(sessions ?? []);
  if (!extra.length) return [...samples];
  return [...samples, ...(extra as unknown as T[])];
}
