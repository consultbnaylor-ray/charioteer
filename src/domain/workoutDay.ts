import { formatUkCompactDay, londonDay, mondayOf, shiftDay } from '@/domain/healthInsights';
import { plannedEffortLabel, sessionWords, type PlannedSession } from '@/domain/plannedSession';
import { formatDistance, type DeviceWorkout } from '@/domain/workoutRoute';

/** One-line rows before the rest sit behind a closed dropdown. */
export const WORKOUT_LIST_FOLD = 4;

/** Recent workouts shown before the rest of the history. */
export const WORKOUT_HISTORY_FOLD = 5;

export const WORKOUT_HISTORY_EMPTY = "No workouts yet. They'll appear here from Apple Health.";

export const WORKOUT_HISTORY_HINT = "Tap a bar to see that day's workouts.";

export const WORKOUT_HISTORY_SHOW_ALL = 'Show all workouts';

/** Named difficulty readings before the rest sit behind a closed dropdown. */
export const DIFFICULTY_LIST_FOLD = 8;

/** Shown on a row only when that workout can open a route. */
export const ROUTE_MARK = '›';

export const WORKOUT_CHART_SPANS = [7, 30] as const;

export type WorkoutChartSpan = (typeof WORKOUT_CHART_SPANS)[number];

export const EFFORT_NAME = 'Workout effort score';
export const EFFORT_UNIT = 'effort';
export const HEART_DIFFICULTY_NAME = 'Average heart rate';
export const HEART_DIFFICULTY_UNIT = '% of max';

export const DIFFICULTY_NOTE =
  'Workout effort score in effort when Apple Health has one. Otherwise average heart rate as % of max (220 − age).';

/** Shown on the difficulty chart when some bars are effort and some are heart rate. */
export const DIFFICULTY_MIXED_NOTE =
  'A full bar is 10 on the effort score, or 100% of max heart rate (220 − age). Tap a bar to see which.';

/** Opens the workout day already on this screen. */
export const DIFFICULTY_DAY_LINK = 'Show this day';

/** Width reserved for a date such as "15 Oct" under a bar. */
export const CHART_DATE_LABEL_WIDTH = 48;

const EFFORT_FULL = 10;

export function londonClock(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date).replace(/\s/g, '');
}

/** `Walking · 11:16 · 109 min · 6.3 km` — time only, because the day is already selected. */
export function workoutRowLine(workout: DeviceWorkout): string {
  const bits = [workout.label, londonClock(workout.startedAt), `${workout.durationMinutes} min`];
  if (workout.distanceMetres != null && workout.distanceMetres > 0) bits.push(formatDistance(workout.distanceMetres, 'km'));
  return bits.join(' · ');
}

/** Newest first. A day narrows the list. A cleared day is the full list again. */
export function workoutHistory(workouts: readonly DeviceWorkout[], day: string | null): DeviceWorkout[] {
  const rows = day == null ? [...workouts] : workoutsOnDay(workouts, day);
  return rows.sort((left, right) => (left.startedAt < right.startedAt ? 1 : left.startedAt > right.startedAt ? -1 : 0));
}

/** Name or type, UK date, and duration with its name and unit. */
export function workoutHistoryLine(workout: DeviceWorkout): string {
  return `${workout.label} · ${formatUkCompactDay(londonDay(workout.startedAt))} · Duration ${workout.durationMinutes} min`;
}

/** `Showing 21 Oct · Clear` */
export function workoutHistoryChip(day: string): string {
  return `Showing ${chartDayLabel(day)} · Clear`;
}

export function workoutsOnDay(workouts: readonly DeviceWorkout[], day: string): DeviceWorkout[] {
  return workouts
    .filter((workout) => londonDay(workout.startedAt) === day)
    .sort((left, right) => (left.startedAt < right.startedAt ? -1 : left.startedAt > right.startedAt ? 1 : 0));
}

export function workoutActivityDays(workouts: readonly DeviceWorkout[]): Set<string> {
  return new Set(workouts.map((workout) => londonDay(workout.startedAt)));
}

/** Monday through Sunday for the week that contains the selected day. */
export function workoutWeek(selected: string): string[] {
  const start = mondayOf(selected);
  return Array.from({ length: 7 }, (_, index) => shiftDay(start, index));
}

export function previousWorkoutDay(day: string): string {
  return shiftDay(day, -1);
}

/** The next calendar day, stopping on today. */
export function nextWorkoutDay(day: string, today: string): string {
  const next = shiftDay(day, 1);
  return next > today ? today : next;
}

/** Total minutes, distance, and active energy. A missing distance or energy is left out. */
export function workoutDaySummary(workouts: readonly DeviceWorkout[]): string {
  if (workouts.length === 0) return 'No workouts';
  const minutes = workouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const parts = [`Total ${minutes} min`];
  const metres = workouts.reduce((sum, workout) => sum + (workout.distanceMetres != null && workout.distanceMetres > 0 ? workout.distanceMetres : 0), 0);
  if (metres > 0) parts.push(`Distance ${formatDistance(metres, 'km')}`);
  const energyRows = workouts.filter((workout) => workout.energyKcal != null && workout.energyKcal > 0);
  if (energyRows.length > 0) {
    const energy = energyRows.reduce((sum, workout) => sum + (workout.energyKcal ?? 0), 0);
    parts.push(`Active energy ${Math.round(energy)} kcal`);
  }
  return parts.join(' · ');
}

/** Oldest day on the left, ending on `endDay`. */
export function chartDays(endDay: string, span: WorkoutChartSpan): string[] {
  return Array.from({ length: span }, (_, index) => shiftDay(endDay, index - (span - 1)));
}

export type DurationSegment = { label: string; minutes: number };

export type DurationBar = {
  day: string;
  totalMinutes: number;
  segments: DurationSegment[];
  label: string;
};

export function durationTypeOrder(bars: readonly { segments: readonly DurationSegment[] }[]): string[] {
  const totals = new Map<string, number>();
  for (const bar of bars) {
    for (const segment of bar.segments) totals.set(segment.label, (totals.get(segment.label) ?? 0) + segment.minutes);
  }
  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label]) => label);
}

function durationBarLabel(day: string, totalMinutes: number, segments: readonly DurationSegment[]): string {
  const parts = [formatUkCompactDay(day), `Duration ${totalMinutes} min`];
  for (const segment of segments) parts.push(`${segment.label} ${segment.minutes} min`);
  return parts.join(' · ');
}

/** One stacked bar per day. Days with no workout stay in the row so a tap can select them. */
export function durationBars(workouts: readonly DeviceWorkout[], endDay: string, span: WorkoutChartSpan): DurationBar[] {
  const days = chartDays(endDay, span);
  const byDay = new Map<string, Map<string, number>>(days.map((day) => [day, new Map()]));
  for (const workout of workouts) {
    const bucket = byDay.get(londonDay(workout.startedAt));
    if (!bucket) continue;
    bucket.set(workout.label, (bucket.get(workout.label) ?? 0) + workout.durationMinutes);
  }
  const draft = days.map((day) => {
    const segments = [...(byDay.get(day)?.entries() ?? [])].map(([label, minutes]) => ({ label, minutes }));
    const totalMinutes = segments.reduce((sum, segment) => sum + segment.minutes, 0);
    return { day, totalMinutes, segments };
  });
  const order = durationTypeOrder(draft);
  return draft.map((bar) => {
    const segments = [...bar.segments].sort((left, right) => order.indexOf(left.label) - order.indexOf(right.label));
    return { day: bar.day, totalMinutes: bar.totalMinutes, segments, label: durationBarLabel(bar.day, bar.totalMinutes, segments) };
  });
}

export function durationScaleLabel(bars: readonly DurationBar[]): string | null {
  const most = bars.reduce((max, bar) => Math.max(max, bar.totalMinutes), 0);
  if (most <= 0) return null;
  return `Most in one day ${most} min`;
}

export function maxHeartRate(age: number | null | undefined): number | null {
  if (age == null || !Number.isFinite(age) || age < 10 || age > 100) return null;
  const max = 220 - Math.round(age);
  return max > 40 ? max : null;
}

export type DifficultyMark = {
  id: string;
  day: string;
  /** Workout type, so the bar can use the same colour as the duration chart. */
  typeLabel: string;
  measureName: string;
  unit: string;
  value: number;
  /** Share of a full 10 effort, or of 100% of max. */
  fill: number;
  caption: string;
};

export function difficultyFor(workout: DeviceWorkout, age: number | null | undefined): DifficultyMark | null {
  const clock = londonClock(workout.startedAt);
  const day = londonDay(workout.startedAt);
  const effort = workout.effortScore;
  if (effort != null && Number.isFinite(effort) && effort > 0 && effort <= EFFORT_FULL) {
    const shown = Number.isInteger(effort) ? String(effort) : effort.toFixed(1);
    return {
      id: workout.id,
      day,
      typeLabel: workout.label,
      measureName: EFFORT_NAME,
      unit: EFFORT_UNIT,
      value: effort,
      fill: effort / EFFORT_FULL,
      caption: `${workout.label} · ${clock} · ${EFFORT_NAME} ${shown} ${EFFORT_UNIT}`,
    };
  }
  const max = maxHeartRate(age);
  const heart = workout.averageHeartRate;
  if (max == null || heart == null || !Number.isFinite(heart) || heart <= 30) return null;
  const percent = Math.round((heart / max) * 100);
  if (percent <= 0) return null;
  return {
    id: workout.id,
    day,
    typeLabel: workout.label,
    measureName: HEART_DIFFICULTY_NAME,
    unit: HEART_DIFFICULTY_UNIT,
    value: percent,
    fill: Math.min(1, percent / 100),
    caption: `${workout.label} · ${clock} · ${HEART_DIFFICULTY_NAME} ${percent}${HEART_DIFFICULTY_UNIT}`,
  };
}

/** One mark per workout, oldest on the left. A workout with neither score is left out. */
export function difficultyMarks(
  workouts: readonly DeviceWorkout[],
  endDay: string,
  span: WorkoutChartSpan,
  age: number | null | undefined,
): DifficultyMark[] {
  const days = new Set(chartDays(endDay, span));
  return [...workouts]
    .filter((workout) => days.has(londonDay(workout.startedAt)))
    .sort((left, right) => (left.startedAt < right.startedAt ? -1 : left.startedAt > right.startedAt ? 1 : 0))
    .flatMap((workout) => {
      const mark = difficultyFor(workout, age);
      return mark ? [mark] : [];
    });
}

export function foldedCount(length: number, fold: number): number {
  return length > fold ? length - fold : 0;
}

/** "15 Oct". The year stays off the axis so neighbouring labels can thin out. */
export function chartDayLabel(iso: string): string {
  return formatUkCompactDay(iso).replace(/ \d{4}$/, '');
}

/** Bars between date labels. A wider chart keeps more of them. */
export function chartLabelStride(barCount: number, chartWidth: number, labelWidth = CHART_DATE_LABEL_WIDTH): number {
  if (barCount <= 1) return 1;
  if (!(chartWidth > 0)) return barCount;
  return Math.max(1, Math.ceil(labelWidth / (chartWidth / barCount)));
}

/**
 * Indexes of bars that get a date. Oldest and newest stay labelled.
 * Middles are dropped until the gap is at least `stride` bars.
 */
export function chartLabelIndexes(count: number, stride: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const step = Math.max(1, Math.floor(stride));
  const last = count - 1;
  if (last < step) return [0, last];
  const indexes = [0];
  for (let index = step; index <= last - step; index += step) indexes.push(index);
  indexes.push(last);
  return indexes;
}

export type DifficultyAxis = {
  heading: string;
  /** Top, middle, and bottom of the bar. */
  ticks: readonly [string, string, string];
  mixedNote: string | null;
};

/** The y-axis unit. A mixed series names both scales. */
export function difficultyAxis(marks: readonly { measureName: string }[]): DifficultyAxis {
  const effort = marks.some((mark) => mark.measureName === EFFORT_NAME);
  const heart = marks.some((mark) => mark.measureName === HEART_DIFFICULTY_NAME);
  if (effort && heart) {
    return {
      heading: 'Effort or % of max',
      ticks: ['10 or 100%', '5 or 50%', '0'],
      mixedNote: DIFFICULTY_MIXED_NOTE,
    };
  }
  if (heart && !effort) {
    return { heading: '% of max', ticks: ['100', '50', '0'], mixedNote: null };
  }
  return { heading: 'Effort', ticks: ['10', '5', '0'], mixedNote: null };
}

/**
 * The same reading as the difficulty chart, in the short form used on a calendar entry.
 * Apple's effort score wins. Otherwise average heart rate as % of max (220 − age).
 */
export function actualEffortWords(workout: DeviceWorkout, age: number | null | undefined): string | null {
  const mark = difficultyFor(workout, age);
  if (!mark) return null;
  if (mark.measureName === EFFORT_NAME) {
    const shown = Number.isInteger(mark.value) ? String(mark.value) : mark.value.toFixed(1);
    return `Effort ${shown}/10`;
  }
  return `Avg HR ${Math.round(mark.value)}% of max`;
}

/**
 * The entry line. A future plan shows the planned effort only.
 * A past or done plan shows the actual reading, and planned versus actual when both exist.
 */
export function sessionEntryWords(
  session: PlannedSession,
  workout: DeviceWorkout | null,
  age: number | null | undefined,
  now = new Date(),
): string {
  const head = session.doneAt ? `${sessionWords(session)} · Done` : sessionWords(session);
  const planned = plannedEffortLabel(session.plannedEffort);
  const happened = Boolean(session.doneAt) || Date.parse(session.startsAt) <= now.getTime();
  const actual = happened && workout ? actualEffortWords(workout, age) : null;
  if (planned && actual) return `${head} · ${planned} · ${actual}`;
  if (actual) return `${head} · ${actual}`;
  if (planned) return `${head} · ${planned}`;
  return head;
}

/** Type, when it started, how long, distance, and the score with its basis. */
export function difficultyDetailLines(workout: DeviceWorkout, age: number | null | undefined): string[] {
  const lines = [
    workout.label,
    `${formatUkCompactDay(londonDay(workout.startedAt))}, ${londonClock(workout.startedAt)}`,
    `Duration ${workout.durationMinutes} min`,
  ];
  if (workout.distanceMetres != null && workout.distanceMetres > 0) {
    lines.push(`Distance ${formatDistance(workout.distanceMetres, 'km')}`);
  }
  const effort = workout.effortScore;
  if (effort != null && Number.isFinite(effort) && effort > 0 && effort <= EFFORT_FULL) {
    const shown = Number.isInteger(effort) ? String(effort) : effort.toFixed(1);
    lines.push(`${EFFORT_NAME} ${shown} out of 10`);
    return lines;
  }
  const max = maxHeartRate(age);
  const heart = workout.averageHeartRate;
  if (max != null && heart != null && Number.isFinite(heart) && heart > 30) {
    const percent = Math.round((heart / max) * 100);
    lines.push(`${HEART_DIFFICULTY_NAME} ${Math.round(heart)} bpm, ${percent}% of max (220 − age, ${max} bpm)`);
  }
  return lines;
}
