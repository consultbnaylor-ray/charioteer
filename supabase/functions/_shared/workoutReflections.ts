import { formatUkCompactDay, shiftDay } from './healthInsights.ts';

/** Inclusive window. A session on the 30th day back still counts. */
export const WORKOUT_REFLECTION_DAYS = 30;

/** Free-text "how it felt" notes. The stored note can be longer. */
export const WORKOUT_NOTE_CHARS = 200;

/** Session lines sent to the coach. The trend uses the whole window. */
export const WORKOUT_REFLECTION_LIMIT = 10;

/**
 * Mention the diary only when the person is talking about training.
 * The figures are already computed. The model must not invent more.
 */
export const WORKOUT_REFLECTION_PROMPT =
  'If CONTEXT includes a workout diary, mention it only when they are talking about training, effort, mood, sleep, or how a session felt. Write that part in short paragraphs, with a blank line between topics. It is not medical advice and not a diagnosis. Take the date, type, duration, effort, mood, sleep, meals, and note from CONTEXT. Do not invent a session or a figure. Do not mention location, a route, or a raw activity file.';

export type ReflectionFeeling = {
  recordedOn: string;
  workoutKey: string;
  note: string;
  effort: number | null;
  mood: number | null;
};

export type ReflectionSession = {
  id: string;
  day: string;
  /** Used to place meals. Never printed. */
  startedAt: string | null;
  type: string;
  durationMinutes: number | null;
  source: 'device' | 'plan' | 'apple';
};

export type ReflectionSleep = { day: string; hours: number };

export type ReflectionMeal = {
  eatenOn: string;
  eatenAt: string | null;
  kcal: number;
};

const OVERLAP_MS = 45 * 60 * 1000;

type Draft = {
  day: string;
  startedAt: string | null;
  type: string;
  durationMinutes: number | null;
  effort: number | null;
  mood: number | null;
  note: string;
};

/**
 * Compact lines for Thumos. Dates are UK calendar days. The trend is computed
 * here, from the whole window, before the ten-line cap.
 */
export function buildWorkoutReflections(input: {
  today: string;
  feelings: readonly ReflectionFeeling[];
  sessions: readonly ReflectionSession[];
  sleep: readonly ReflectionSleep[];
  meals: readonly ReflectionMeal[];
  hideCalories?: boolean;
}): string[] {
  const today = input.today.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
  const start = shiftDay(today, -(WORKOUT_REFLECTION_DAYS - 1));
  const open = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= start && day <= today;
  const sleepByDay = new Map<string, number>();
  for (const row of input.sleep) {
    const day = row.day.slice(0, 10);
    if (!open(day) || !(row.hours > 0) || sleepByDay.has(day)) continue;
    sleepByDay.set(day, Math.round(row.hours * 10) / 10);
  }
  const feelings = input.feelings.filter((row) => open(row.recordedOn.slice(0, 10)));
  const kept = keepSessions(input.sessions.filter((row) => open(row.day.slice(0, 10))));
  const used = new Set<ReflectionFeeling>();
  const drafts: Draft[] = kept.sessions.map((session) => ({
    day: session.day.slice(0, 10),
    startedAt: session.startedAt,
    type: cleanType(session.type),
    durationMinutes: minutesOf(session.durationMinutes),
    ...feelingOn(session, feelings, kept.replacedBy, used),
  }));
  for (const feeling of feelings) {
    if (used.has(feeling)) continue;
    const effort = score(feeling.effort);
    const mood = score(feeling.mood);
    const note = clipNote(feeling.note);
    if (effort == null && mood == null && !note) continue;
    drafts.push({
      day: feeling.recordedOn.slice(0, 10),
      startedAt: null,
      type: '',
      durationMinutes: null,
      effort,
      mood,
      note,
    });
    used.add(feeling);
  }
  const trend = effortTrend(drafts, sleepByDay);
  const lines = drafts
    .slice()
    .sort((left, right) => rank(right).localeCompare(rank(left)))
    .slice(0, WORKOUT_REFLECTION_LIMIT)
    .map((row) => sessionLine(row, sleepByDay.get(row.day) ?? null, mealsBefore(input.meals, row), input.hideCalories === true));
  return trend ? [trend, ...lines] : lines;
}

function keepSessions(sessions: readonly ReflectionSession[]): {
  sessions: ReflectionSession[];
  replacedBy: Map<string, string>;
} {
  const devices = sessions.filter((row) => row.source === 'device');
  const replacedBy = new Map<string, string>();
  const plans = sessions.filter((row) => row.source === 'plan').filter((plan) => {
    const same = devices.find((device) => device.day === plan.day && closeInTime(device.startedAt, plan.startedAt));
    if (!same) return true;
    replacedBy.set(plan.id, same.id);
    return false;
  });
  const timedDays = new Set([...devices, ...plans].map((row) => row.day));
  const apple = sessions.filter((row) => row.source === 'apple' && !timedDays.has(row.day));
  return { sessions: [...devices, ...plans, ...apple], replacedBy };
}

function closeInTime(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  const a = Date.parse(left);
  const b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= OVERLAP_MS;
}

function feelingOn(
  session: ReflectionSession,
  feelings: readonly ReflectionFeeling[],
  replacedBy: ReadonlyMap<string, string>,
  used: Set<ReflectionFeeling>,
): { effort: number | null; mood: number | null; note: string } {
  const exact = feelings.find((row) => !used.has(row) && matches(row, session, replacedBy));
  const sameDay = feelings.filter((row) => !used.has(row) && row.recordedOn.slice(0, 10) === session.day);
  const only = sameDay.length === 1 ? sameDay[0] : undefined;
  const chosen = exact ?? (only && !sameDayKeyTaken(only, replacedBy) ? only : undefined);
  if (!chosen) return { effort: null, mood: null, note: '' };
  used.add(chosen);
  return { effort: score(chosen.effort), mood: score(chosen.mood), note: clipNote(chosen.note) };
}

function matches(feeling: ReflectionFeeling, session: ReflectionSession, replacedBy: ReadonlyMap<string, string>): boolean {
  if (!feeling.workoutKey) return false;
  if (feeling.workoutKey === session.id) return true;
  return replacedBy.get(feeling.workoutKey) === session.id;
}

/** A key that names some other session should not stick to the only row that day. */
function sameDayKeyTaken(feeling: ReflectionFeeling, replacedBy: ReadonlyMap<string, string>): boolean {
  if (!feeling.workoutKey) return false;
  return replacedBy.has(feeling.workoutKey);
}

function effortTrend(rows: readonly Draft[], sleepByDay: ReadonlyMap<string, number>): string | null {
  const rested: number[] = [];
  const short: number[] = [];
  for (const row of rows) {
    if (row.effort == null) continue;
    const hours = sleepByDay.get(row.day);
    if (hours == null) continue;
    (hours >= 7 ? rested : short).push(row.effort);
  }
  if (rested.length < 2 || short.length < 2) return null;
  return `Average effort ${mean(rested)} after 7h or more of sleep (${rested.length} sessions), and ${mean(short)} after less (${short.length}).`;
}

function sessionLine(row: Draft, sleepHours: number | null, meals: { count: number; kcal: number }, hideCalories: boolean): string {
  const head = [formatUkCompactDay(row.day)];
  const detail = [row.type, row.durationMinutes != null ? `${row.durationMinutes} min` : ''].filter(Boolean);
  if (detail.length) head.push(detail.join(', '));
  const bits = [head.join(', ')];
  if (row.effort != null) bits.push(`Effort ${row.effort}/10`);
  if (row.mood != null) bits.push(`Mood ${row.mood}/10`);
  if (sleepHours != null) bits.push(`Sleep the night before ${formatHours(sleepHours)} h`);
  if (meals.count > 0) {
    const noun = meals.count === 1 ? '1 meal' : `${meals.count} meals`;
    bits.push(hideCalories ? `Before the session: ${noun}` : `Before the session: ${noun}, ${meals.kcal} kcal`);
  }
  if (row.note) bits.push(`Note: ${row.note}`);
  return bits.join('. ');
}

function mealsBefore(meals: readonly ReflectionMeal[], row: Draft): { count: number; kcal: number } {
  if (!row.startedAt) return { count: 0, kcal: 0 };
  const start = Date.parse(row.startedAt);
  if (!Number.isFinite(start)) return { count: 0, kcal: 0 };
  const rows = meals.filter((meal) => {
    if (meal.eatenOn.slice(0, 10) !== row.day || !meal.eatenAt) return false;
    const at = Date.parse(meal.eatenAt);
    return Number.isFinite(at) && at <= start;
  });
  const kcal = rows.reduce((sum, meal) => sum + (meal.kcal > 0 ? meal.kcal : 0), 0);
  return { count: rows.length, kcal: Math.round(kcal) };
}

function rank(row: Draft): string {
  return `${row.day}T${row.startedAt ?? ''}`;
}

function score(value: number | null): number | null {
  if (value == null || !Number.isInteger(value) || value < 1 || value > 10) return null;
  return value;
}

function minutesOf(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(1440, Math.max(1, Math.round(value)));
}

function cleanType(value: string): string {
  const text = value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
  if (!text || /\broute\b|\bgps\b/i.test(text)) return '';
  return text;
}

function clipNote(note: string): string {
  const clean = note.replace(/\s+/g, ' ').trim();
  if (clean.length <= WORKOUT_NOTE_CHARS) return clean;
  return `${clean.slice(0, WORKOUT_NOTE_CHARS - 1).trimEnd()}…`;
}

function mean(values: readonly number[]): string {
  const rounded = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
