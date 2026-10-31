import { londonDay } from './healthInsights.ts';

export type ExerciseSession = {
  name: string;
  startedAt: string;
  durationMinutes: number;
  averageHeartRate: number | null;
  trainingEffect: number | null;
  origin: 'apple' | 'garmin' | null;
};

const NOT_MEDICAL = 'This is not medical advice. A heart-rate band from age is an estimate, not a test.';

/** NHS physical activity: 150 minutes moderate or 75 minutes vigorous a week, plus strength on two days. */
const MODERATE_WEEK = 150;
const VIGOROUS_WEEK = 75;
const STRENGTH_DAYS = 2;

function strengthName(name: string): boolean {
  return /strength|weights|weight training|traditional strength|functional strength/i.test(name);
}

function band(bpm: number, age: number | null): string | null {
  if (age == null || age < 18 || age > 90 || !(bpm > 0)) return null;
  const max = 220 - age;
  if (max <= 0) return null;
  const pct = Math.round((bpm / max) * 100);
  const effort = pct >= 77 ? 'hard' : pct >= 64 ? 'moderate' : 'easy';
  return `${bpm} bpm, about ${pct}% of an age estimate of maximum, which sits in the ${effort} band`;
}

/**
 * Plain account of the sessions in the window. Apple and Garmin stay labelled.
 * Heart-rate time in zones is not invented when the watch did not send it.
 */
export function exerciseReadingLines(input: {
  sessions: readonly ExerciseSession[];
  today?: string;
  age?: number | null;
  days?: number;
}): string[] {
  const today = input.today ?? londonDay(new Date());
  const span = input.days ?? 7;
  const start = shiftDay(today, span - 1);
  const sessions = input.sessions.filter((session) => {
    if (!(session.durationMinutes > 0)) return false;
    const day = londonDay(session.startedAt);
    return day >= start && day <= today;
  });
  if (!sessions.length) {
    return [`No workouts are stored for the last ${span} days, so this note does not judge the training. ${NOT_MEDICAL}`];
  }
  const byName = new Map<string, { minutes: number; count: number; source: string }>();
  const strengthDays = new Set<string>();
  let vigorous = 0;
  let moderate = 0;
  let easy = 0;
  let unrated = 0;
  const effects: number[] = [];
  const hearts: string[] = [];
  for (const session of sessions) {
    const name = session.name.trim() || 'Workout';
    const source = session.origin === 'garmin' ? 'Garmin' : session.origin === 'apple' ? 'Apple Health' : 'watch';
    const row = byName.get(name) ?? { minutes: 0, count: 0, source };
    row.minutes += session.durationMinutes;
    row.count += 1;
    byName.set(name, row);
    const day = londonDay(session.startedAt);
    if (strengthName(name)) strengthDays.add(day);
    const described = band(session.averageHeartRate ?? 0, input.age ?? null);
    if (described) {
      hearts.push(`${name} (${source}): ${described}`);
      const pct = percentOfMax(session.averageHeartRate ?? 0, input.age ?? null);
      if (pct != null && pct >= 77) vigorous += session.durationMinutes;
      else if (pct != null && pct >= 64) moderate += session.durationMinutes;
      else easy += session.durationMinutes;
    } else if (session.trainingEffect != null && session.trainingEffect >= 3) {
      vigorous += session.durationMinutes;
    } else if (session.trainingEffect != null && session.trainingEffect > 0) {
      moderate += session.durationMinutes;
    } else {
      unrated += session.durationMinutes;
    }
    if (session.trainingEffect != null && session.trainingEffect > 0) effects.push(session.trainingEffect);
  }
  const total = sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const kinds = [...byName.entries()]
    .sort((left, right) => right[1].minutes - left[1].minutes)
    .slice(0, 4)
    .map(([name, row]) => `${name} ${row.minutes} min across ${row.count} ${row.count === 1 ? 'session' : 'sessions'} (${row.source})`);
  const lines = [
    `The last ${span} days have ${total} minutes of exercise in ${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}: ${kinds.join('; ')}.`,
  ];
  if (hearts.length) lines.push(`Heart rate on those sessions: ${hearts.slice(0, 3).join('; ')}.`);
  if (effects.length) {
    const mean = Math.round((effects.reduce((sum, value) => sum + value, 0) / effects.length) * 10) / 10;
    lines.push(`Garmin training effect on the sessions that recorded it averages ${mean} out of 5. That score is Garmin's, not an Apple Health zone.`);
  }
  const moderateEquivalent = moderate + vigorous * 2;
  const guidance = moderateEquivalent >= MODERATE_WEEK || vigorous >= VIGOROUS_WEEK
    ? `The rated minutes meet the usual week of ${MODERATE_WEEK} moderate minutes or ${VIGOROUS_WEEK} vigorous minutes.`
    : `Rated minutes are ${moderate} moderate and ${vigorous} vigorous. The usual week is ${MODERATE_WEEK} moderate minutes or ${VIGOROUS_WEEK} vigorous minutes.`;
  lines.push(guidance);
  if (unrated > 0) lines.push(`${unrated} minutes have no heart rate or training effect, so they are not placed in a band.`);
  if (easy > 0 && vigorous > easy) {
    lines.push('The harder sessions outweigh the easy ones. A slower zone 2 session, where you can still talk, would sit beside them.');
  } else if (easy === 0 && vigorous + moderate > 0) {
    lines.push('There is no easy session in this window. A zone 2 session, where you can still talk, is one thing to add.');
  }
  if (strengthDays.size >= STRENGTH_DAYS) {
    lines.push(`Strength work is on ${strengthDays.size} days. Two days is the usual guidance.`);
  } else if (strengthDays.size === 1) {
    lines.push('Strength work shows on one day. A second strength day is the usual guidance.');
  } else {
    lines.push('No strength session is stored in this window. Two strength days a week is the usual guidance.');
  }
  lines.push(NOT_MEDICAL);
  return lines;
}

export function hrvContextLines(input: {
  appleSdnn: { day: string; ms: number } | null;
  garminRmssd: { day: string; ms: number } | null;
}): string[] {
  const lines: string[] = [];
  if (input.appleSdnn) {
    lines.push(`Apple Health HRV (SDNN) latest ${Math.round(input.appleSdnn.ms)} ms on ${input.appleSdnn.day}.`);
  }
  if (input.garminRmssd) {
    lines.push(`Garmin overnight HRV (RMSSD) latest ${Math.round(input.garminRmssd.ms)} ms on ${input.garminRmssd.day}. This is not the Apple SDNN figure.`);
  }
  return lines;
}

function percentOfMax(bpm: number, age: number | null): number | null {
  if (age == null || age < 18 || age > 90 || !(bpm > 0)) return null;
  const max = 220 - age;
  if (max <= 0) return null;
  return Math.round((bpm / max) * 100);
}

function shiftDay(day: string, back: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(Date.UTC(year, (month ?? 1) - 1, date ?? 1));
  value.setUTCDate(value.getUTCDate() - back);
  return value.toISOString().slice(0, 10);
}
