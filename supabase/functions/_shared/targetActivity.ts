/**
 * Small next steps toward a target weight.
 * Volume rises by about 10% at most. Weekly minutes stay inside 150 to 300.
 * Nothing here is a training plan, and nothing asks anyone to earn food.
 */

export const TOWARD_TARGET_TITLE = 'Towards your target weight';

export const ACTIVITY_NOT_ENOUGH = "There isn't enough activity data yet to suggest a next step.";

export const ACTIVITY_NOT_A_PROMISE = 'This is a suggestion, not a promise that your weight will change.';

export const ACTIVITY_REST = 'A rest day is part of the week.';

export const ACTIVITY_GP = 'Check with a GP before a big increase if you have a health condition.';

export const ACTIVITY_KCAL_ROUGH = 'Active energy is a rough figure from the watch, not calories burned to the gram.';

export const STEP_UP_FRACTION = 0.1;

export const WEEKLY_MINUTES_LOW = 150;

export const WEEKLY_MINUTES_HIGH = 300;

export const STEPS_BAND_HIGH = 10000;

export const STRENGTH_A_WEEK = 2;

export const ACTIVITY_DAY_MIN = 3;

export const MIXED_ACTIVITY_WEEK =
  'Apple days are exercise minutes, not doubled. Garmin days count each vigorous minute twice.';

export type ActivityReading = {
  day: string;
  steps?: number | null;
  stepsSource?: string | null;
  exerciseMinutes?: number | null;
  vigorousMinutes?: number | null;
  minutesSource?: string | null;
  activeKcal?: number | null;
  kcalSource?: string | null;
  strengthSessions?: number | null;
};

export type TargetActivitySuggestion = {
  id: 'steps' | 'minutes' | 'brisk' | 'strength' | 'hold';
  text: string;
  added: number;
  unit: string;
  period: string;
};

export type TargetActivityPlan = {
  enough: boolean;
  title: string;
  suggestions: TargetActivitySuggestion[];
  notes: string[];
};

type Direction = 'lose' | 'hold' | 'gain';

function sourceName(values: readonly (string | null | undefined)[]): string {
  const names = [...new Set(values.filter((value): value is string => Boolean(value)))];
  if (names.length === 0) return 'your readings';
  if (names.length === 1) return names[0] ?? 'your readings';
  return names.join(' and ');
}

function recent(readings: readonly ActivityReading[], today: string): ActivityReading[] {
  const start = shift(today, -6);
  return readings.filter((row) => row.day >= start && row.day <= today);
}

function shift(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function stepUp(current: number): number {
  if (!(current > 0)) return 0;
  return Math.floor(current * STEP_UP_FRACTION);
}

export function activityReadingsFromSamples(
  samples: readonly { kind: string; value: number; recordedOn: string; source?: string | null }[],
): ActivityReading[] {
  const byDay = new Map<string, ActivityReading>();
  const rowFor = (day: string) => {
    const current = byDay.get(day) ?? { day };
    byDay.set(day, current);
    return current;
  };
  for (const sample of samples) {
    const day = sample.recordedOn.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(sample.value > 0)) continue;
    const source = sample.source === 'garmin' ? 'Garmin' : 'Apple Health';
    const row = rowFor(day);
    if (sample.kind === 'steps') {
      if (row.stepsSource !== 'Apple Health') {
        row.steps = Math.round(sample.value);
        row.stepsSource = source;
      }
    }
    if (sample.kind === 'workout_minutes' && row.minutesSource == null) {
      row.exerciseMinutes = Math.round((row.exerciseMinutes ?? 0) + sample.value);
      row.minutesSource = source;
    }
    if (sample.kind === 'strength_minutes') row.strengthSessions = 1;
  }
  return [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day));
}

/** Apple Health wins a day. Garmin fills a day Apple Health did not send. */
export function mergeActivityReadings(input: {
  samples: readonly { kind: string; value: number; recordedOn: string; source?: string | null }[];
  appleExercise?: readonly { day: string; minutes: number }[];
  appleKcal?: readonly { day: string; kcal: number }[];
  garmin?: readonly {
    day: string;
    steps?: number | null;
    moderateMinutes?: number | null;
    vigorousMinutes?: number | null;
    activeKcal?: number | null;
  }[];
}): ActivityReading[] {
  const rows = new Map<string, ActivityReading>();
  for (const row of activityReadingsFromSamples(input.samples)) rows.set(row.day, { ...row });
  const ensure = (day: string) => {
    const current = rows.get(day) ?? { day };
    rows.set(day, current);
    return current;
  };
  for (const day of input.appleExercise ?? []) {
    if (!(day.minutes > 0)) continue;
    const row = ensure(day.day);
    row.exerciseMinutes = Math.round(day.minutes);
    row.minutesSource = 'Apple Health';
    row.vigorousMinutes = 0;
  }
  for (const day of input.appleKcal ?? []) {
    if (!(day.kcal > 0)) continue;
    const row = ensure(day.day);
    row.activeKcal = Math.round(day.kcal);
    row.kcalSource = 'Apple Health';
  }
  for (const day of input.garmin ?? []) {
    const row = ensure(day.day);
    if ((day.steps ?? 0) > 0 && row.stepsSource !== 'Apple Health') {
      row.steps = Math.round(day.steps ?? 0);
      row.stepsSource = 'Garmin';
    }
    const moderate = day.moderateMinutes ?? 0;
    const vigorous = day.vigorousMinutes ?? 0;
    if ((moderate > 0 || vigorous > 0) && row.minutesSource !== 'Apple Health') {
      row.exerciseMinutes = Math.round(moderate);
      row.vigorousMinutes = Math.round(vigorous);
      row.minutesSource = 'Garmin';
    }
    if ((day.activeKcal ?? 0) > 0 && row.kcalSource !== 'Apple Health') {
      row.activeKcal = Math.round(day.activeKcal ?? 0);
      row.kcalSource = 'Garmin';
    }
  }
  return [...rows.values()].sort((left, right) => left.day.localeCompare(right.day));
}

function counted<T>(rows: readonly T[], read: (row: T) => number | null | undefined): { days: number; total: number; sources: string[] } {
  let days = 0;
  let total = 0;
  const sources: string[] = [];
  for (const row of rows) {
    const value = read(row);
    if (value == null || !(value > 0)) continue;
    days += 1;
    total += value;
  }
  return { days, total, sources };
}

export function targetActivityPlan(input: {
  direction: Direction;
  readings: readonly ActivityReading[];
  today: string;
}): TargetActivityPlan {
  const window = recent(input.readings, input.today);
  const period = 'the last 7 days';
  const activeDays = window.filter((row) => (row.steps ?? 0) > 0 || (row.exerciseMinutes ?? 0) > 0 || (row.vigorousMinutes ?? 0) > 0 || (row.activeKcal ?? 0) > 0);
  if (activeDays.length < ACTIVITY_DAY_MIN) {
    return { enough: false, title: TOWARD_TARGET_TITLE, suggestions: [], notes: [ACTIVITY_NOT_ENOUGH] };
  }

  const suggestions: TargetActivitySuggestion[] = [];
  const steps = counted(window, (row) => row.steps);
  const stepSources = window.flatMap((row) => (row.steps ?? 0) > 0 ? [row.stepsSource] : []);
  if (steps.days >= ACTIVITY_DAY_MIN && input.direction !== 'gain') {
    const average = Math.round(steps.total / steps.days);
    const room = Math.max(0, STEPS_BAND_HIGH - average);
    const added = Math.min(stepUp(average), room);
    const source = sourceName(stepSources);
    if (added >= 1) {
      suggestions.push({
        id: 'steps',
        added,
        unit: 'steps a day',
        period,
        text: `Steps, about ${average.toLocaleString('en-GB')} a day over ${steps.days} days in ${period} (${source}). A suggestion is about ${added.toLocaleString('en-GB')} more steps a day, around 10% more, and not above ${STEPS_BAND_HIGH.toLocaleString('en-GB')} steps a day.`,
      });
    } else {
      suggestions.push({
        id: 'hold',
        added: 0,
        unit: 'steps a day',
        period,
        text: `Steps, about ${average.toLocaleString('en-GB')} a day over ${steps.days} days in ${period} (${source}). That is already at the top of the usual range. Hold there rather than adding more.`,
      });
    }
  }

  const minuteRows = window.filter((row) => (row.exerciseMinutes ?? 0) > 0 || (row.vigorousMinutes ?? 0) > 0);
  const minuteTotal = minuteRows.reduce((sum, row) => sum + (row.exerciseMinutes ?? 0) + 2 * (row.vigorousMinutes ?? 0), 0);
  const minuteSource = sourceName(minuteRows.map((row) => row.minutesSource));
  const minuteSources = new Set(minuteRows.map((row) => row.minutesSource).filter((value): value is string => Boolean(value)));
  const mixedWeek = minuteSources.has('Apple Health') && minuteSources.has('Garmin') ? ` ${MIXED_ACTIVITY_WEEK}` : '';
  if (minuteRows.length >= ACTIVITY_DAY_MIN) {
    const addedCap = Math.min(stepUp(minuteTotal), Math.max(0, WEEKLY_MINUTES_HIGH - minuteTotal));
    if (input.direction === 'gain') {
      suggestions.push({
        id: 'hold',
        added: 0,
        unit: 'min',
        period,
        text: `Active minutes, ${Math.round(minuteTotal)} min over ${minuteRows.length} days in ${period} (${minuteSource}). For a gain, leave the minutes here and use the time for strength and recovery.${mixedWeek}`,
      });
    } else if (addedCap >= 1) {
      const guidance = minuteRows.length >= 5
        ? ` The usual adult guidance is ${WEEKLY_MINUTES_LOW} to ${WEEKLY_MINUTES_HIGH} minutes of moderate activity a week.`
        : '';
      suggestions.push({
        id: 'minutes',
        added: addedCap,
        unit: 'min',
        period,
        text: `Active minutes, ${Math.round(minuteTotal)} min over ${minuteRows.length} days in ${period} (${minuteSource}). A suggestion is about ${addedCap} more minutes across the week, around 10% more, and still at or under ${WEEKLY_MINUTES_HIGH} minutes.${guidance}${mixedWeek}`,
      });
    } else {
      suggestions.push({
        id: 'hold',
        added: 0,
        unit: 'min',
        period,
        text: `Active minutes, ${Math.round(minuteTotal)} min over ${minuteRows.length} days in ${period} (${minuteSource}). That is already at ${WEEKLY_MINUTES_HIGH} minutes, the top of the usual weekly range. Hold there.${mixedWeek}`,
      });
    }
    const vigorous = minuteRows.reduce((sum, row) => sum + (row.vigorousMinutes ?? 0), 0);
    const easyOnly = vigorous <= 0 && minuteRows.every((row) => row.vigorousMinutes == null || row.vigorousMinutes <= 0);
    if (easyOnly && input.direction !== 'gain') {
      suggestions.push({
        id: 'brisk',
        added: 0,
        unit: 'session',
        period,
        text: `One easy session in ${period} could be a little brisker, at about the same length. That is one session, not a longer week.`,
      });
    }
  }

  const strength = window.reduce((sum, row) => sum + (row.strengthSessions ?? 0), 0);
  if (input.direction === 'gain' || strength < STRENGTH_A_WEEK) {
    const added = Math.max(0, Math.min(1, STRENGTH_A_WEEK - strength));
    if (input.direction === 'gain' || added > 0) {
      suggestions.push({
        id: 'strength',
        added: input.direction === 'gain' ? added : (minuteRows.length >= ACTIVITY_DAY_MIN ? 0 : added),
        unit: 'sessions',
        period,
        text: input.direction === 'gain'
          ? `Strength, ${strength} session${strength === 1 ? '' : 's'} in ${period}. A suggestion is to work toward ${STRENGTH_A_WEEK} short strength sessions this week, with a rest day.`
          : `Strength, ${strength} session${strength === 1 ? '' : 's'} in ${period}. Twice a week is the usual suggestion, with a rest day. Add it only if the week still feels easy.`,
      });
    }
  }

  const kcalDays = window.filter((row) => (row.activeKcal ?? 0) > 0);
  const notes = [ACTIVITY_NOT_A_PROMISE, ACTIVITY_REST, ACTIVITY_GP];
  if (kcalDays.length > 0) notes.push(ACTIVITY_KCAL_ROUGH);
  return { enough: true, title: TOWARD_TARGET_TITLE, suggestions, notes };
}

export function targetCoachActivityLines(plan: TargetActivityPlan): string[] {
  if (!plan.enough) return [plan.notes[0] ?? ACTIVITY_NOT_ENOUGH];
  return [
    plan.title,
    ...plan.suggestions.map((item) => item.text),
    ...plan.notes,
    'Do not turn these into a training programme. Do not suggest other tracking apps.',
  ];
}
