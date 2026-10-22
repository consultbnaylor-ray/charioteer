/**
 * A short fitness summary from daily readings already stored.
 * Cardio fitness bands are the 25th and 75th percentiles from Kaminsky, Arena,
 * and Myers, Mayo Clinic Proceedings, 2015 (FRIEND treadmill standards, ages 20–79).
 * Below the 25th is Developing, from the 25th up to the 75th is Steady, and the
 * 75th and above is Strong. This is an estimate, not Apple's classification and
 * not a medical assessment.
 */
import { REFERENCE_NOT_A_TARGET } from './healthBands.ts';
import { mondayOf, shiftDay } from './healthInsights.ts';
import { minuteUnit, paceJudgement, parseStatPeriod, periodPhrase, rollingWindow, scaledPeriodTarget, type StatPeriod } from './statWindow.ts';
import {
  CARRYING_FITNESS_NOTE,
  GOAL_LABEL,
  PRO_BOXING_CLASSES,
  WORKOUT_BUCKETS,
  isAnyBoxer,
  isClassBoxer,
  type BodyBuild,
  type NutritionGoal,
  type NutritionSex,
  type WorkoutBucket,
  type WorkoutBucketMap,
} from './nutrition.ts';

export type FitnessLevel = 'Developing' | 'Steady' | 'Strong';

export type FitnessTone = 'good' | 'watch' | 'info';

export type FitnessSample = {
  kind: string;
  value: number;
  recordedOn: string;
  /** healthkit wins over a same-day manual copy. Absent when the row did not say. */
  source?: string;
};

/** Minutes one app wrote for one workout type on one day. No route and no heart rate. */
export type WorkoutSourceMinute = {
  day: string;
  activityType: number;
  minutes: number;
  sourceName: string;
};

export type FitnessSnapshotInput = {
  today: string;
  goal: NutritionGoal | null;
  goalAge: number | null;
  goalSex: NutritionSex | null;
  /** Minutes in the week they stated on You. Null when they have not set one. */
  scheduleWeekMinutes: number | null;
  health: readonly FitnessSample[];
  /** Check-in sleep, used only when sleep is not already in health. */
  sleep?: readonly { day: string; hours: number }[];
  permission: 'denied' | 'unknown';
  /** Carrying extra weight keeps the comparison on their own readings. */
  build?: BodyBuild | null;
  /** Saved recategorisation. The default type is used when a type is absent. */
  workoutBuckets?: WorkoutBucketMap | null;
  /** App names from the last iPhone sync. The chart still counts stored minutes without them. */
  sourceApps?: readonly WorkoutSourceMinute[];
  /** Rolling window. Omitted means the last 7 days, ending on `today`. */
  period?: StatPeriod;
  /** Used to tell whether a Day view is still early. */
  now?: Date | string | null;
};

export type FitnessRing = {
  centre: string;
  unit: string;
  fill: number;
  status: string;
  tone: FitnessTone;
  words: string;
  signal?: string;
  neutral?: boolean;
  /** Dated totals in the selected period. Days with no workout are omitted. */
  series?: { day: string; value: number }[];
};

export type FitnessBand = {
  low: number;
  high: number;
  /** Short name on the bar, beside the colour. */
  label: string;
};

export type FitnessCompare = {
  value: number;
  age: FitnessBand | null;
  goal: FitnessBand | null;
  /** Why a goal range is absent. */
  goalNote: string | null;
  words: string;
  sources: string[];
};

export type FitnessTrend = {
  label: string;
  /** Latest reading with its unit, such as "62 bpm". */
  reading: string | null;
  words: string;
  tone: FitnessTone;
  points: number[];
  /** Dated readings in the selected period. Empty days are omitted. */
  series?: { day: string; value: number }[];
  /** Window the reading was averaged over, or a latest-reading note. */
  period?: string;
  signal?: string;
  neutral?: boolean;
};

export type FitnessWeekMix = {
  label: string;
  strength: number;
  cardio: number;
  conditioning: number;
  other: number;
};

export type WorkoutTypeMinute = {
  activityType: number;
  label: string;
  minutes: number;
  bucket: WorkoutBucket;
  sources: string[];
};

/** Dropdown on the sessions chart. */
export const WORKOUT_MIX_TITLE = 'How this is worked out';

export type FitnessRecommendation = {
  id: string;
  text: string;
  /** Worth copying into this week's focus. A plain "hold" line stays on the card. */
  forFocus: boolean;
};

export type FitnessSnapshot = {
  level: FitnessLevel | null;
  levelWords: string;
  estimate: string;
  missing: string | null;
  cardio: (FitnessRing & { trend: number[]; series: { day: string; value: number }[]; compare: FitnessCompare }) | null;
  resting: FitnessTrend | null;
  minutes: FitnessRing | null;
  mix: {
    weeks: FitnessWeekMix[];
    strength: number;
    cardio: number;
    conditioning: number;
    other: number;
    words: string;
    /** One line per recorded workout type, then how the minutes were chosen. */
    lines: string[];
    types: WorkoutTypeMinute[];
  } | null;
  recovery: { words: string; tone: FitnessTone; status: string } | null;
  recommendations: FitnessRecommendation[];
  /** One line for Thumos and the plan. Null when there is nothing to say. */
  contextLine: string | null;
};

const ESTIMATE = 'An estimate, not a medical assessment. Check with a doctor before big changes.';

/** Shown when "What is this?" is opened. The ring stays compact until then. */
export const VO2_WHAT =
  'VO2 max: how much oxygen your body can use at full effort, per kg of body weight per minute. Apple Watch estimates it.';

export const MINUTES_WHAT =
  'Active minutes: time in workouts this week. The unit is minutes. The ring fills toward 150 minutes a week, or toward the week you set when that is the mark.';

export const RESTING_WHAT =
  'Resting heart rate: how many times your heart beats in a minute while you are at rest. The unit is bpm.';

/** Routine lines add sessions. They never shorten the week. */
export const ADDED_NOT_REDUCED =
  'These add to the sessions you already do. They do not replace them or make the week shorter.';

/** Plain reason the cardio number matters for the goal. No invented sport ranges. */
export function whyCardioMatters(goal: NutritionGoal | null): string {
  const title = goal ? GOAL_LABEL[goal] : null;
  if (isAnyBoxer(goal)) {
    return `For boxing, this is how much oxygen you can use when the work stays hard, and how you recover between efforts. The ${title} range, when it is shown, is an approximate estimate from a published study.`;
  }
  if (goal === 'elite_runner') {
    return `For running, this is how much oxygen you can use when the work is hard. ${title} has no separate published range here, so the comparison is the age and sex band.`;
  }
  if (goal === 'body_builder' || goal === 'increase') {
    return `This sits beside the strength work. It is how much oxygen you can use at full effort. ${title} has no separate published cardio range here.`;
  }
  if (goal === 'lose_fat_build_muscle' || goal === 'lose_weight') {
    return 'This is one mark of how your heart and lungs keep up with the work. The sessions you already do stay in place.';
  }
  return 'This is one mark of how much oxygen you can use at full effort. When a band is shown, it is typical for your age and sex, and it is an estimate.';
}

export function whyMinutesMatter(): string {
  return 'The minutes show the week you are already doing. A suggestion adds a session beside that week. It does not cut the week down.';
}

export function whyRestingMatters(): string {
  return 'Your own earlier readings are the comparison. A rise can mean the week is heavier than usual. One number on its own is not a diagnosis.';
}

const FRIEND_SOURCE =
  'Age and sex: Kaminsky, Arena, and Myers, Mayo Clinic Proceedings, 2015. The shaded band is the 25th to the 75th percentile for treadmill cardio fitness.';

/**
 * Kim, Song, and Min, Exercise Science, 2016. Korean national amateur men.
 * Heavyweight (light-heavyweight through super-heavyweight) mean 59.24 ± 2.75.
 * Middleweight group (lightweight through middleweight) mean 62.04 ± 2.89.
 * The heavyweight group was lower. Ranges are that mean, plus or minus about one
 * standard deviation, rounded. Classes lighter than lightweight use that nearer
 * published group. Approximate, and for men on a national team.
 */
const BOXER_SOURCE =
  'Boxers: Kim, Song, and Min, Exercise Science, 2016. Korean national amateur men. Heavyweight cardio fitness averaged about 59 ml/kg/min and the middleweight group about 62, and the heavyweight group was lower. The ranges here are about one standard deviation either side, rounded. Classes lighter than lightweight use that nearer published group. They are approximate.';

const HEAVY_BOXER = { low: 56, high: 62 };
const MIDDLE_BOXER = { low: 59, high: 65 };

const MEN = [
  { maxAge: 29, p25: 40.1, p75: 55.2 },
  { maxAge: 39, p25: 35.9, p75: 49.2 },
  { maxAge: 49, p25: 31.9, p75: 45.0 },
  { maxAge: 59, p25: 27.1, p75: 39.7 },
  { maxAge: 69, p25: 23.7, p75: 34.5 },
  { maxAge: 79, p25: 20.4, p75: 30.4 },
] as const;

const WOMEN = [
  { maxAge: 29, p25: 30.5, p75: 44.7 },
  { maxAge: 39, p25: 25.3, p75: 36.1 },
  { maxAge: 49, p25: 22.1, p75: 32.4 },
  { maxAge: 59, p25: 19.9, p75: 27.6 },
  { maxAge: 69, p25: 17.2, p75: 23.8 },
  { maxAge: 79, p25: 15.6, p75: 20.8 },
] as const;

/**
 * HealthKit workout activity types.
 * Strength: traditional strength, functional strength, core training, cross training.
 * Conditioning: HIIT, mixed cardio, boxing, kickboxing, martial arts. Shown on their own.
 * Cardio: steady aerobic work such as running, walking, cycling, rowing, and machines.
 * Heart rate and VO2 max are not used.
 */
const STRENGTH_TYPES = new Set([11, 20, 50, 59]);
const CONDITIONING_TYPES = new Set([8, 28, 30, 63, 65, 73]);
const CARDIO_TYPES = new Set([13, 16, 24, 35, 37, 44, 46, 52, 53, 60, 64, 68, 69, 70, 71, 74, 77, 82]);
/** Flexibility, cooldown, and Health's Other. Never cardio. */
const OTHER_TYPES = new Set([62, 80, 3000]);

export const WORKOUT_TYPE_LABEL: Record<number, string> = {
  1: 'American football',
  2: 'Archery',
  3: 'Australian football',
  4: 'Badminton',
  5: 'Baseball',
  6: 'Basketball',
  7: 'Bowling',
  8: 'Boxing',
  9: 'Climbing',
  10: 'Cricket',
  11: 'Cross training',
  12: 'Curling',
  13: 'Cycling',
  14: 'Dance',
  16: 'Elliptical',
  20: 'Functional strength',
  21: 'Golf',
  24: 'Hiking',
  28: 'Martial arts',
  29: 'Mind and body',
  30: 'Mixed cardio',
  35: 'Rowing',
  37: 'Running',
  44: 'Stair climber',
  46: 'Swimming',
  50: 'Traditional strength',
  52: 'Walking',
  57: 'Yoga',
  58: 'Barre',
  59: 'Core training',
  62: 'Flexibility',
  63: 'HIIT',
  64: 'Jump rope',
  65: 'Kickboxing',
  66: 'Pilates',
  68: 'Stairs',
  69: 'Step training',
  72: 'Tai chi',
  73: 'Mixed cardio',
  74: 'Hand cycling',
  77: 'Cardio dance',
  80: 'Cooldown',
  82: 'Swim, bike, run',
  3000: 'Other',
};

/** One line on the mix card. The split follows the saved workout type. */
export const MIX_HOW = 'Based on the workout type your Watch or app recorded, not heart rate.';

export const CONDITIONING_NOTE =
  'Conditioning is HIIT, mixed cardio, boxing, kickboxing, and martial arts. It is shown on its own, not inside cardio.';

export function workoutTypeLabel(activityType: number): string {
  return WORKOUT_TYPE_LABEL[activityType] ?? `Workout type ${activityType}`;
}

export function defaultWorkoutBucket(activityType: number): WorkoutBucket {
  if (!Number.isInteger(activityType) || activityType <= 0) return 'other';
  if (STRENGTH_TYPES.has(activityType)) return 'strength';
  if (CONDITIONING_TYPES.has(activityType)) return 'conditioning';
  if (CARDIO_TYPES.has(activityType)) return 'cardio';
  if (OTHER_TYPES.has(activityType)) return 'other';
  return 'other';
}

/** The person's saved choice wins. Anything else uses the default type. */
export function workoutBucket(activityType: number, overrides?: WorkoutBucketMap | null): WorkoutBucket {
  const chosen = overrides?.[String(activityType)];
  if (chosen === 'strength' || chosen === 'cardio' || chosen === 'conditioning' || chosen === 'other') return chosen;
  return defaultWorkoutBucket(activityType);
}

/** Store a choice only when it differs from the default type. */
export function withWorkoutBucket(current: WorkoutBucketMap | null | undefined, activityType: number, bucket: WorkoutBucket): WorkoutBucketMap {
  const next: WorkoutBucketMap = { ...(current ?? {}) };
  const key = String(activityType);
  if (!/^[1-9][0-9]{0,3}$/.test(key)) return next;
  if (defaultWorkoutBucket(activityType) === bucket) delete next[key];
  else next[key] = bucket;
  return next;
}

export function workoutTypeKind(activityType: number): `workout_type_${number}` {
  return `workout_type_${activityType}`;
}

export type WorkoutActivitySlice = { activityType: number; duration: number };

/**
 * Minutes for one workout, split by HealthKit activity.
 * Traditional strength (50), functional strength (20), and core training (59) stay strength.
 * When a parent workout is Other but a segment names a real type, the duration follows the segments.
 * The parts add up to the workout duration, the same minutes as the active-minute total.
 */
export function workoutTypeMinutes(input: {
  activityType: number;
  durationMin: number;
  activities?: readonly WorkoutActivitySlice[];
}): { activityType: number; minutes: number }[] {
  const total = input.durationMin;
  if (!(total > 0) || !Number.isFinite(total)) return [];
  const parent = Number.isInteger(input.activityType) && input.activityType > 0 ? input.activityType : 3000;
  const named = new Map<number, number>();
  for (const activity of input.activities ?? []) {
    const activityType = Number(activity.activityType);
    const duration = Number(activity.duration);
    if (!Number.isInteger(activityType) || activityType <= 0 || activityType === 3000) continue;
    if (!(duration > 0) || !Number.isFinite(duration)) continue;
    named.set(activityType, (named.get(activityType) ?? 0) + duration);
  }
  if (named.size === 0) return [{ activityType: parent, minutes: total }];
  const weight = [...named.values()].reduce((sum, value) => sum + value, 0);
  const parts: { activityType: number; minutes: number }[] = [];
  for (const [activityType, duration] of named) {
    parts.push({ activityType, minutes: total * (duration / weight) });
  }
  return parts;
}

export function activityTypeFromKind(kind: string): number | null {
  const match = /^workout_type_([1-9][0-9]{0,3})$/.exec(kind);
  if (!match) return null;
  const activityType = Number(match[1]);
  return activityType >= 1 && activityType <= 3000 ? activityType : null;
}

export type WorkoutSpan = {
  activityType: number;
  startMs: number;
  endMs: number;
  /** HealthKit workout duration, in minutes. Paused time is not added on top. */
  durationMin: number;
  /** App that wrote the workout. Empty when Health did not say. */
  sourceId: string;
};

const MIN_OVERLAP_MS = 2 * 60 * 1000;

function overlapsHeavily(left: WorkoutSpan, right: WorkoutSpan): boolean {
  const overlap = Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs);
  if (overlap < MIN_OVERLAP_MS) return false;
  const shorter = Math.min(Math.max(left.endMs - left.startMs, 1), Math.max(right.endMs - right.startMs, 1));
  return overlap >= shorter * 0.5;
}

function appleSource(sourceId: string): boolean {
  return sourceId.toLowerCase().startsWith('com.apple.');
}

function preferWorkout<T extends WorkoutSpan>(left: T, right: T): T {
  const leftApple = appleSource(left.sourceId);
  const rightApple = appleSource(right.sourceId);
  if (leftApple !== rightApple) {
    const apple = leftApple ? left : right;
    const other = leftApple ? right : left;
    if (apple.durationMin >= other.durationMin * 0.5) return apple;
    return other;
  }
  if (right.durationMin > left.durationMin) return right;
  return left;
}

/**
 * One session written by the Watch and again by another app counts once.
 * A brief overlap, such as finishing one session and starting the next, stays as two.
 */
export function dedupeWorkouts<T extends WorkoutSpan>(sessions: readonly T[]): T[] {
  const ordered = [...sessions].sort((left, right) => left.startMs - right.startMs || right.durationMin - left.durationMin);
  const kept: T[] = [];
  for (const session of ordered) {
    if (session.durationMin <= 0 || session.endMs <= session.startMs) continue;
    const index = kept.findIndex((other) => overlapsHeavily(session, other));
    if (index < 0) kept.push(session);
    else kept[index] = preferWorkout(kept[index], session);
  }
  return kept;
}

const BUCKET_KIND = {
  strength: 'strength_minutes',
  cardio: 'cardio_minutes',
  conditioning: 'conditioning_minutes',
  other: 'other_minutes',
} as const;

/** Rebuild the daily bucket totals from stored per-type minutes. Days with no type stay as they were. */
export function rebucketStoredMinutes(
  samples: readonly { kind: string; value: number; recordedOn: string }[],
  overrides?: WorkoutBucketMap | null,
): { kind: (typeof BUCKET_KIND)[WorkoutBucket]; value: number; recordedOn: string; unit: 'min'; source: 'healthkit' }[] {
  const days = new Map<string, Record<WorkoutBucket, number>>();
  for (const sample of samples) {
    const activityType = activityTypeFromKind(sample.kind);
    if (activityType == null || !Number.isFinite(sample.value) || sample.value <= 0) continue;
    const bucket = workoutBucket(activityType, overrides);
    const row = days.get(sample.recordedOn) ?? { strength: 0, cardio: 0, conditioning: 0, other: 0 };
    row[bucket] += sample.value;
    days.set(sample.recordedOn, row);
  }
  const written: { kind: (typeof BUCKET_KIND)[WorkoutBucket]; value: number; recordedOn: string; unit: 'min'; source: 'healthkit' }[] = [];
  for (const [recordedOn, row] of days) {
    for (const bucket of WORKOUT_BUCKETS) {
      written.push({
        kind: BUCKET_KIND[bucket],
        value: Math.round(row[bucket]),
        recordedOn,
        unit: 'min',
        source: 'healthkit',
      });
    }
  }
  return written;
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dayValue(samples: readonly FitnessSample[], kind: string, today: string, days: number): { day: string; value: number }[] {
  const start = shiftDay(today, -(days - 1));
  const map = new Map<string, number>();
  for (const sample of samples) {
    if (sample.kind !== kind) continue;
    if (sample.recordedOn < start || sample.recordedOn > today) continue;
    if (!Number.isFinite(sample.value) || sample.value <= 0) continue;
    map.set(sample.recordedOn, sample.value);
  }
  return [...map.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : 1))
    .map(([day, value]) => ({ day, value }));
}

function sumKind(samples: readonly FitnessSample[], kind: string, start: string, today: string): number {
  let total = 0;
  for (const sample of samples) {
    if (sample.kind !== kind || sample.recordedOn < start || sample.recordedOn > today) continue;
    if (!Number.isFinite(sample.value) || sample.value <= 0) continue;
    total += sample.value;
  }
  return total;
}

function halves(points: { value: number }[]): { earlier: number | null; recent: number | null } {
  if (points.length < 2) return { earlier: null, recent: points[0]?.value ?? null };
  const mid = Math.max(1, Math.floor(points.length / 2));
  return { earlier: avg(points.slice(0, mid).map((point) => point.value)), recent: avg(points.slice(mid).map((point) => point.value)) };
}

function bandFor(age: number | null, sex: NutritionSex | null): { p25: number; p75: number } | null {
  if (age == null || sex == null || age < 20 || age > 79) return null;
  const rows = sex === 'female' ? WOMEN : MEN;
  return rows.find((row) => age <= row.maxAge) ?? null;
}

function rateVo2(value: number, band: { p25: number; p75: number }): FitnessLevel {
  if (value < band.p25) return 'Developing';
  if (value < band.p75) return 'Steady';
  return 'Strong';
}

function decade(age: number): string {
  return `${Math.floor(age / 10) * 10}s`;
}

function sexWord(sex: NutritionSex): string {
  return sex === 'female' ? 'women' : 'men';
}

function levelTone(level: FitnessLevel): FitnessTone {
  return level === 'Developing' ? 'watch' : 'good';
}

function boxerBand(goal: NutritionGoal | null, sex: NutritionSex | null): FitnessBand | null {
  if (sex !== 'male' || !goal) return null;
  const label = `Typical for ${GOAL_LABEL[goal]}`;
  if (goal === 'elite_heavy_boxer' || goal === 'elite_light_heavy_boxer' || goal === 'elite_cruiser_boxer') {
    return { ...HEAVY_BOXER, label };
  }
  if (goal === 'elite_middle_boxer' || isClassBoxer(goal)) return { ...MIDDLE_BOXER, label };
  return null;
}

function goalNoteFor(
  goal: NutritionGoal | null,
  sex: NutritionSex | null,
  hasGoalBand: boolean,
  hasAgeBand: boolean,
): string | null {
  if (hasGoalBand) return null;
  if (isAnyBoxer(goal)) {
    return `The boxing ranges found are for men on a national team, so they are not shown. ${REFERENCE_NOT_A_TARGET}`;
  }
  if (!hasAgeBand) return null;
  const title = goal ? GOAL_LABEL[goal] : null;
  if (goal === 'elite_runner' || goal === 'body_builder') {
    return `${title} has no separate published range here. The band is typical for your age and sex. ${REFERENCE_NOT_A_TARGET}`;
  }
  if (!title) return `There is no separate published cardio range. The band is typical for your age and sex. ${REFERENCE_NOT_A_TARGET}`;
  return `${title} has no separate published cardio range. The band is typical for your age and sex. ${REFERENCE_NOT_A_TARGET}`;
}

function compareFor(input: {
  value: number;
  age: number | null;
  sex: NutritionSex | null;
  goal: NutritionGoal | null;
  band: { p25: number; p75: number } | null;
}): FitnessCompare {
  const ageBand = input.band && input.age != null && input.sex
    ? { low: round1(input.band.p25), high: round1(input.band.p75), label: 'Typical for your age and sex' }
    : null;
  const goalBand = boxerBand(input.goal, input.sex);
  const goalNote = goalNoteFor(input.goal, input.sex, Boolean(goalBand), Boolean(ageBand));
  const you = `You are at about ${round1(input.value)} ml/kg/min.`;
  const ageWords = ageBand && input.sex && input.age != null
    ? ` Typical for ${sexWord(input.sex)} in their ${decade(input.age)} is about ${ageBand.low} to ${ageBand.high}.`
    : '';
  const goalWords = goalBand && input.goal
    ? ` Typical for ${GOAL_LABEL[input.goal]}, approximate, is about ${goalBand.low} to ${goalBand.high}. This is a reference, not a target.`
    : '';
  const place = goalBand
    ? input.value < goalBand.low
      ? ' You are below that approximate range.'
      : input.value > goalBand.high
        ? ' You are above that approximate range.'
        : ' You are inside that approximate range.'
    : '';
  const note = goalNote ? ` ${goalNote}` : '';
  const sources = [
    ...(ageBand ? [FRIEND_SOURCE] : []),
    ...((goalBand || isAnyBoxer(input.goal)) ? [BOXER_SOURCE] : []),
  ];
  return {
    value: round1(input.value),
    age: ageBand,
    goal: goalBand,
    goalNote,
    words: `${you}${ageWords}${goalWords}${place}${note}`.replace(/\s+/g, ' ').trim(),
    sources,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildFitnessSnapshot(input: FitnessSnapshotInput): FitnessSnapshot {
  const today = input.today;
  const period = parseStatPeriod(input.period);
  const vo2 = dayValue(input.health, 'vo2_max', today, 365);
  const resting = dayValue(input.health, 'resting_heart_rate', today, 365);
  const hrv = dayValue(input.health, 'hrv_sdnn', today, 365);
  const healthSleep = dayValue(input.health, 'sleep_hours', today, 365);
  const sleep = healthSleep.length
    ? healthSleep
    : (input.sleep ?? [])
      .filter((row) => row.day <= today && row.day >= shiftDay(today, -364) && row.hours > 0)
      .map((row) => ({ day: row.day, value: row.hours }));
  const walking = dayValue(input.health, 'walking_heart_rate', today, 365);
  const recoveryDrop = dayValue(input.health, 'heart_rate_recovery', today, 365);
  const window = rollingWindow(today, period);
  const active = periodActiveMinutes({
    samples: input.health,
    today,
    start: window.start,
    end: window.end,
    overrides: input.workoutBuckets,
    sourceApps: input.sourceApps,
  });
  const minutes = active.minutes;
  const mixReport = active.report;
  const strength = mixReport.strength;
  const cardioMin = mixReport.cardio;
  const conditioning = mixReport.conditioning;
  const other = mixReport.other;
  const mixTotal = mixReport.total;
  const recentEnough = shiftDay(today, -55);
  const restingSplit = halves(resting.filter((point) => point.day >= recentEnough));
  const sleepSplit = halves(sleep.filter((point) => point.day >= recentEnough));
  const hrvSplit = halves(hrv.filter((point) => point.day >= recentEnough));
  const rhrUp = restingSplit.earlier != null && restingSplit.recent != null && restingSplit.recent - restingSplit.earlier >= 5;
  const sleepDown = sleepSplit.earlier != null && sleepSplit.recent != null && sleepSplit.earlier - sleepSplit.recent >= 0.5;
  const easier = rhrUp && sleepDown;

  const latestVo2 = vo2.length ? vo2[vo2.length - 1]?.value ?? null : null;
  const band = latestVo2 != null ? bandFor(input.goalAge, input.goalSex) : null;
  const vo2Level = latestVo2 != null && band ? rateVo2(latestVo2, band) : null;
  const weeklySchedule = input.scheduleWeekMinutes && input.scheduleWeekMinutes > 0 ? input.scheduleWeekMinutes : null;
  const scaledSchedule = weeklySchedule == null ? null : scaledPeriodTarget(weeklySchedule, period);
  const guideline = scaledPeriodTarget(150, period);
  const vigorous = scaledPeriodTarget(75, period);
  const fallback = vo2Level ? null : fallbackLevel(minutes, scaledSchedule, restingSplit, guideline, vigorous);
  const level = vo2Level ?? fallback;

  const levelWordsBase = levelWordsFor({
    level,
    vo2: latestVo2,
    band: Boolean(band),
    age: input.goalAge,
    sex: input.goalSex,
    minutes,
    schedule: scaledSchedule,
    phrase: periodPhrase(period),
    rhrUp,
    walking: walking.length ? walking[walking.length - 1]?.value ?? null : null,
  });

  const compare = latestVo2 == null ? null : compareFor({
    value: latestVo2,
    age: input.goalAge,
    sex: input.goalSex,
    goal: input.goal,
    band,
  });
  if (input.build === 'carrying_extra' && compare) {
    compare.words = `${compare.words} ${CARRYING_FITNESS_NOTE}`.replace(/\s+/g, ' ').trim();
  }
  const levelWords = input.build === 'carrying_extra' && compare == null
    ? `${levelWordsBase} ${CARRYING_FITNESS_NOTE}`
    : levelWordsBase;
  const cardio = latestVo2 == null || compare == null ? null : {
    centre: String(round1(latestVo2)),
    unit: 'ml/kg/min',
    fill: band ? Math.max(0.08, Math.min(1, (latestVo2 - band.p25) / (band.p75 - band.p25))) : 0.5,
    status: vo2Level ?? 'No age or sex',
    tone: vo2Level ? levelTone(vo2Level) : 'info' as const,
    words: levelWords,
    trend: vo2.slice(-8).map((point) => round1(point.value)),
    series: vo2.filter((point) => point.day >= window.start && point.day <= today).map((point) => ({ day: point.day, value: round1(point.value) })),
    compare,
  };

  const inPeriodResting = resting.filter((point) => point.day >= window.start && point.day <= today);
  const restingShown = inPeriodResting.length
    ? Math.round(inPeriodResting.reduce((sum, point) => sum + point.value, 0) / inPeriodResting.length)
    : resting.length
      ? Math.round(resting[resting.length - 1]?.value ?? 0)
      : null;
  const restingPace = paceJudgement({
    period,
    loggedDays: inPeriodResting.length,
    now: input.now,
    met: !rhrUp,
    behind: 'Watch',
  });
  const restingTrend = restingShown != null && resting.length >= 1 ? {
    label: 'Resting heart rate',
    reading: `${restingShown} bpm`,
    words: restingWords(restingSplit),
    tone: restingPace.neutral ? 'info' as const : rhrUp ? 'watch' as const : 'good' as const,
    points: (inPeriodResting.length ? inPeriodResting : resting).slice(-8).map((point) => Math.round(point.value)),
    series: (inPeriodResting.length ? inPeriodResting : resting).map((point) => ({ day: point.day, value: Math.round(point.value) })),
    period: inPeriodResting.length ? periodPhrase(period) : 'latest reading',
    signal: restingPace.neutral ? restingPace.word : rhrUp ? 'Watch' : 'On track',
    neutral: restingPace.neutral,
  } : null;

  const aim = scaledSchedule ?? guideline;
  const minutesMet = minutes >= aim * 0.9;
  const minutesPace = paceJudgement({
    period,
    loggedDays: active.days,
    now: input.now,
    met: minutesMet,
    behind: 'Short',
  });
  const minutesRing = minutes > 0 || input.scheduleWeekMinutes ? {
    centre: String(Math.round(minutes)),
    unit: minuteUnit(period),
    fill: aim > 0 ? Math.max(0, Math.min(1, minutes / aim)) : 0,
    status: minutesPace.neutral ? minutesPace.word : minutesMet ? 'On track' : 'Short',
    tone: minutesPace.neutral ? 'info' as const : minutesMet ? 'good' as const : 'watch' as const,
    signal: minutesPace.neutral ? minutesPace.word : undefined,
    neutral: minutesPace.neutral,
    words: minutesWords(minutes, weeklySchedule, period, aim),
    series: active.daily,
  } : null;

  const mix = mixReport.total > 0
    ? {
      weeks: mixReport.weeks,
      strength: mixReport.strength,
      cardio: mixReport.cardio,
      conditioning: mixReport.conditioning,
      other: mixReport.other,
      words: mixReport.words,
      lines: mixReport.lines,
      types: mixReport.types,
    }
    : null;

  const recovery = recoveryView({
    restingSplit,
    sleepSplit,
    hrvSplit,
    rhrUp,
    sleepDown,
    drop: recoveryDrop.length ? recoveryDrop[recoveryDrop.length - 1]?.value ?? null : null,
    hasResting: resting.length >= 2,
    hasSleep: sleep.length >= 2,
    hasHrv: hrv.length >= 2,
  });

  const gap = assessCardioGap(input);
  const recommendations = recommend({
    goal: input.goal,
    easier,
    strength,
    cardio: cardioMin,
    conditioning,
    total: mixTotal,
    minutes,
    schedule: scaledSchedule,
    guideline,
    hasWork: minutes > 0 || mixTotal > 0,
    belowGoal: gap.belowGoal,
  });

  const missing = missingLine({
    permission: input.permission,
    hasVo2: latestVo2 != null,
    hasAgeSex: input.goalAge != null && input.goalSex != null,
    hasMix: mix != null,
    hasWork: minutes > 0 || mixTotal > 0,
    hasLevel: level != null,
  });

  const contextLine = contextFrom({
    level,
    vo2: latestVo2,
    compare: compare?.words ?? null,
    minutes,
    recovery: recovery?.words ?? null,
    recommendation: recommendations.find((item) => item.forFocus)?.text ?? recommendations[0]?.text ?? null,
    build: input.build ?? null,
    trendingDown: gap.trendingDown,
    cardioBehind: gap.behind,
  });

  return {
    level,
    levelWords,
    estimate: ESTIMATE,
    missing,
    cardio,
    resting: restingTrend,
    minutes: minutesRing,
    mix,
    recovery,
    recommendations,
    contextLine,
  };
}

/** Lines the Health Plan may copy into this week's focus. Never a shorter week. */
export function fitnessFocusLines(input: FitnessSnapshotInput): string[] {
  return buildFitnessSnapshot(input).recommendations.filter((item) => item.forFocus).map((item) => item.text).slice(0, 2);
}

function fallbackLevel(
  minutes: number,
  schedule: number | null,
  resting: { earlier: number | null; recent: number | null },
  guideline = 150,
  vigorous = 75,
): FitnessLevel | null {
  const delta = resting.earlier != null && resting.recent != null ? resting.recent - resting.earlier : null;
  if (minutes <= 0 && delta == null) return null;
  const rhrUp = delta != null && delta >= 5;
  const rhrOk = delta == null || delta < 3;
  const underGuideline = minutes < vigorous;
  const underSchedule = schedule != null && minutes < schedule * 0.6;
  const meeting = minutes >= guideline && (schedule == null || minutes >= schedule * 0.9);
  if (meeting && rhrOk && delta != null) return 'Strong';
  if (rhrUp || (underGuideline && (schedule == null || underSchedule))) return 'Developing';
  return 'Steady';
}

function levelWordsFor(input: {
  level: FitnessLevel | null;
  vo2: number | null;
  band: boolean;
  age: number | null;
  sex: NutritionSex | null;
  minutes: number;
  schedule: number | null;
  phrase?: string;
  rhrUp: boolean;
  walking: number | null;
}): string {
  if (input.vo2 != null && input.band && input.level && input.age != null && input.sex) {
    const place = input.level === 'Developing'
      ? 'below the middle of a published range'
      : input.level === 'Strong'
        ? 'above the middle of a published range'
        : 'in the middle of a published range';
    return `Cardio fitness is about ${round1(input.vo2)} ml/kg/min. For ${sexWord(input.sex)} in their ${decade(input.age)}, that sits ${place}.`;
  }
  if (input.vo2 != null && !input.band) {
    return `Cardio fitness is about ${round1(input.vo2)} ml/kg/min. Add age and sex on Nutrition for a level.`;
  }
  if (!input.level) return 'Not enough readings yet for a level.';
  const phrase = input.phrase ?? 'this week';
  const minutesBit = input.minutes > 0 ? `${Math.round(input.minutes)} active minutes ${phrase}` : `no active minutes logged ${phrase}`;
  const heartBit = input.rhrUp ? 'Resting heart rate is up on your earlier readings.' : 'Resting heart rate is not up on your earlier readings.';
  const scheduleBit = input.schedule ? ` Your schedule is about ${Math.round(input.schedule)} min.` : '';
  const walkingBit = input.walking != null ? ` Walking heart rate lately is about ${Math.round(input.walking)} bpm.` : '';
  return `${input.level}. This uses resting heart rate and ${minutesBit}.${scheduleBit} ${heartBit}${walkingBit}`.replace(/\s+/g, ' ').trim();
}

function restingWords(split: { earlier: number | null; recent: number | null }): string {
  if (split.earlier == null || split.recent == null) return 'Resting heart rate is logged.';
  const delta = split.recent - split.earlier;
  if (delta >= 5) return 'Resting heart rate is above your earlier readings.';
  if (delta <= -3) return 'Resting heart rate is lower than your earlier readings.';
  return 'Resting heart rate is close to your earlier readings.';
}

function minutesWords(minutes: number, schedule: number | null, period: StatPeriod, aim: number): string {
  const guideline = 'The activity guideline is 150 min a week.';
  const phrase = periodPhrase(period);
  if (schedule && schedule > 0) {
    return `${Math.round(minutes)} min ${phrase}. Your schedule is about ${Math.round(aim)} min ${phrase}. ${guideline}`;
  }
  return `${Math.round(minutes)} min ${phrase}. ${guideline}`;
}

const BUCKET_KIND_NAME = {
  strength_minutes: 'strength',
  cardio_minutes: 'cardio',
  conditioning_minutes: 'conditioning',
  other_minutes: 'other',
} as const;

type MixBuckets = Record<WorkoutBucket, number>;

function blankBuckets(): MixBuckets {
  return { strength: 0, cardio: 0, conditioning: 0, other: 0 };
}

function sampleDay(recordedOn: string): string {
  return recordedOn.slice(0, 10);
}

/**
 * One number per kind per day.
 * A Health row replaces a manual row for that day, so a workout saved by the Watch and typed again is not added twice.
 */
function collapseMixSamples(samples: readonly FitnessSample[]): FitnessSample[] {
  const groups = new Map<string, FitnessSample[]>();
  for (const sample of samples) {
    const day = sampleDay(sample.recordedOn);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(sample.value) || sample.value <= 0) continue;
    const key = `${sample.kind}|${day}`;
    const list = groups.get(key) ?? [];
    list.push({ ...sample, recordedOn: day });
    groups.set(key, list);
  }
  const collapsed: FitnessSample[] = [];
  for (const list of groups.values()) {
    const fromHealth = list.filter((row) => row.source === 'healthkit');
    const chosen = fromHealth.length ? fromHealth : list;
    collapsed.push({
      kind: chosen[0]?.kind ?? '',
      recordedOn: chosen[0]?.recordedOn ?? '',
      value: chosen.reduce((sum, row) => sum + row.value, 0),
      source: fromHealth.length ? 'healthkit' : chosen.find((row) => row.source)?.source,
    });
  }
  return collapsed;
}

function sourceLabel(source: string | undefined): string {
  if (source === 'manual') return 'Logged here';
  if (source === 'healthkit') return 'Apple Health';
  return 'Source not stored';
}

export type WorkoutMixReport = {
  weeks: FitnessWeekMix[];
  strength: number;
  cardio: number;
  conditioning: number;
  other: number;
  total: number;
  words: string;
  lines: string[];
  types: WorkoutTypeMinute[];
  typeDays: number;
  bucketDays: number;
};

/**
 * Active minutes for one rolling window.
 * Workout minutes win when they are stored. Otherwise the mix report total is used, so every page shows the same number.
 */
export function periodActiveMinutes(input: {
  samples: readonly FitnessSample[];
  today: string;
  start: string;
  end?: string;
  overrides?: WorkoutBucketMap | null;
  sourceApps?: readonly WorkoutSourceMinute[];
}): { minutes: number; days: number; report: WorkoutMixReport; daily: { day: string; value: number }[] } {
  const end = input.end ?? input.today;
  const report = workoutMixReport({
    samples: input.samples,
    today: input.today,
    start: input.start,
    end,
    overrides: input.overrides,
    sourceApps: input.sourceApps,
  });
  const days = new Map<string, number>();
  for (const sample of input.samples) {
    if (sample.kind !== 'workout_minutes' || !(sample.value > 0)) continue;
    const day = sample.recordedOn.slice(0, 10);
    if (day < input.start || day > end) continue;
    days.set(day, (days.get(day) ?? 0) + sample.value);
  }
  if (days.size > 0) {
    let minutes = 0;
    for (const value of days.values()) minutes += value;
    const daily = [...days.entries()]
      .sort((left, right) => (left[0] < right[0] ? -1 : 1))
      .map(([day, value]) => ({ day, value: Math.round(value) }));
    return { minutes: Math.round(minutes), days: days.size, report, daily };
  }
  return { minutes: report.total, days: report.typeDays + report.bucketDays, report, daily: [] };
}

/**
 * The one split for the sessions chart, the Health Stats mix tile, and the plan.
 * A day with workout-type minutes uses those minutes. Saved bucket totals are used only on days with no type.
 * Unknown types, including Health's Other, count as other.
 */
export function workoutMixReport(input: {
  samples: readonly FitnessSample[];
  today: string;
  start?: string;
  end?: string;
  overrides?: WorkoutBucketMap | null;
  sourceApps?: readonly WorkoutSourceMinute[];
}): WorkoutMixReport {
  const end = input.end ?? input.today;
  const chart = input.start == null;
  const thisMonday = mondayOf(input.today);
  const rangeStart = input.start ?? shiftDay(thisMonday, -7 * 7);
  const collapsed = collapseMixSamples(input.samples).filter((sample) => sample.recordedOn >= rangeStart && sample.recordedOn <= end);
  const byDay = new Map<string, FitnessSample[]>();
  for (const sample of collapsed) {
    const list = byDay.get(sample.recordedOn) ?? [];
    list.push(sample);
    byDay.set(sample.recordedOn, list);
  }
  const typeHits: { day: string; activityType: number; minutes: number; source?: string }[] = [];
  const dayBuckets = new Map<string, MixBuckets>();
  const dayKind = new Map<string, 'type' | 'bucket'>();
  for (const [day, rows] of byDay) {
    const typed = rows.filter((row) => activityTypeFromKind(row.kind) != null);
    const buckets = blankBuckets();
    if (typed.length) {
      dayKind.set(day, 'type');
      for (const row of typed) {
        const activityType = activityTypeFromKind(row.kind);
        if (activityType == null) continue;
        const bucket = workoutBucket(activityType, input.overrides);
        buckets[bucket] += row.value;
        typeHits.push({ day, activityType, minutes: row.value, source: row.source });
      }
    } else {
      let used = false;
      for (const row of rows) {
        const bucket = BUCKET_KIND_NAME[row.kind as keyof typeof BUCKET_KIND_NAME];
        if (!bucket) continue;
        buckets[bucket] += row.value;
        used = true;
      }
      if (used) dayKind.set(day, 'bucket');
    }
    if (buckets.strength + buckets.cardio + buckets.conditioning + buckets.other > 0) dayBuckets.set(day, buckets);
  }
  const weekStarts: { label: string; start: string; end: string }[] = chart
    ? Array.from({ length: 8 }, (_, index) => {
      const ago = 7 - index;
      const start = shiftDay(thisMonday, -ago * 7);
      return { label: ago === 0 ? 'Now' : `${ago}w`, start, end: ago === 0 ? end : shiftDay(start, 6) };
    })
    : [{ label: 'Period', start: rangeStart, end }];
  let weeks: FitnessWeekMix[] = weekStarts.map((week) => {
    const totals = blankBuckets();
    for (const [day, buckets] of dayBuckets) {
      if (day < week.start || day > week.end) continue;
      totals.strength += buckets.strength;
      totals.cardio += buckets.cardio;
      totals.conditioning += buckets.conditioning;
      totals.other += buckets.other;
    }
    return {
      label: week.label,
      strength: Math.round(totals.strength),
      cardio: Math.round(totals.cardio),
      conditioning: Math.round(totals.conditioning),
      other: Math.round(totals.other),
    };
  });
  if (chart) {
    const first = weeks.findIndex((week) => week.strength + week.cardio + week.conditioning + week.other > 0);
    if (first > 0) weeks = weeks.slice(first);
  }
  const shownStart = chart ? (weekStarts.find((week) => week.label === weeks[0]?.label)?.start ?? rangeStart) : rangeStart;
  let typeDays = 0;
  let bucketDays = 0;
  for (const [day, kind] of dayKind) {
    if (day < shownStart || day > end) continue;
    if (kind === 'type') typeDays += 1;
    else bucketDays += 1;
  }
  const typeTotals = new Map<number, { minutes: number; sources: Set<string> }>();
  for (const hit of typeHits) {
    if (hit.day < shownStart || hit.day > end) continue;
    const current = typeTotals.get(hit.activityType) ?? { minutes: 0, sources: new Set<string>() };
    current.minutes += hit.minutes;
    current.sources.add(sourceLabel(hit.source));
    typeTotals.set(hit.activityType, current);
  }
  const strength = weeks.reduce((sum, week) => sum + week.strength, 0);
  const cardio = weeks.reduce((sum, week) => sum + week.cardio, 0);
  const conditioning = weeks.reduce((sum, week) => sum + week.conditioning, 0);
  const other = weeks.reduce((sum, week) => sum + week.other, 0);
  const apps = new Map<number, Map<string, number>>();
  for (const row of input.sourceApps ?? []) {
    const day = row.day.slice(0, 10);
    if (day < shownStart || day > end || !Number.isFinite(row.minutes) || row.minutes <= 0) continue;
    const name = row.sourceName.trim().slice(0, 60);
    if (!name) continue;
    const perType = apps.get(row.activityType) ?? new Map<string, number>();
    perType.set(name, (perType.get(name) ?? 0) + row.minutes);
    apps.set(row.activityType, perType);
  }
  const types = [...typeTotals.entries()]
    .map(([activityType, row]) => {
      const named = apps.get(activityType);
      const sources = named && named.size
        ? [...named.entries()].sort((left, right) => right[1] - left[1]).map(([name, minutes]) => `${name} ${Math.round(minutes)} min`)
        : [...row.sources];
      return {
        activityType,
        label: workoutTypeLabel(activityType),
        minutes: Math.round(row.minutes),
        bucket: workoutBucket(activityType, input.overrides),
        sources,
      };
    })
    .filter((row) => row.minutes > 0)
    .sort((left, right) => right.minutes - left.minutes || left.label.localeCompare(right.label));
  const lines = types.map((row) => `${row.label}: ${row.minutes} min, ${row.bucket}. ${row.sources.join(', ')}.`);
  if (typeDays === 0 && bucketDays > 0) {
    lines.push('Workout types were not stored for this period, so these minutes are the saved strength, cardio, conditioning, and other totals.');
  } else if (bucketDays > 0) {
    lines.push(`${bucketDays === 1 ? '1 day has' : `${bucketDays} days have`} no workout type stored, so those minutes use the saved totals.`);
  }
  lines.push('Minutes are the workout duration, not a session count and not time in a heart-rate zone. Overlapping workouts from more than one app are counted once. A type Health did not name counts as other, not cardio.');
  lines.push(CONDITIONING_NOTE);
  return {
    weeks,
    strength,
    cardio,
    conditioning,
    other,
    total: strength + cardio + conditioning + other,
    words: mixWords(strength, cardio, conditioning, other),
    lines,
    types,
    typeDays,
    bucketDays,
  };
}

function mixWords(strength: number, cardio: number, conditioning: number, other: number): string {
  const total = strength + cardio + conditioning + other;
  if (total <= 0) return 'No split of strength and cardio yet.';
  const share = (part: number) => Math.round((part / total) * 100);
  const parts = [
    ['strength', strength],
    ['cardio', cardio],
    ['conditioning', conditioning],
    ['other', other],
  ] as const;
  const leader = [...parts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'strength';
  return `mostly ${leader}. Strength ${share(strength)}%, cardio ${share(cardio)}%, conditioning ${share(conditioning)}%, other ${share(other)}%.`;
}

export type SessionSplitRow = {
  key: WorkoutBucket;
  label: string;
  minutes: number;
  share: number;
};

/** Strength, cardio, conditioning, and other, largest share first. */
export function sessionSplitRows(mix: {
  strength: number;
  cardio: number;
  conditioning: number;
  other: number;
}): SessionSplitRow[] {
  const total = mix.strength + mix.cardio + mix.conditioning + mix.other;
  const rows: SessionSplitRow[] = [
    { key: 'strength', label: 'Strength', minutes: Math.round(mix.strength), share: 0 },
    { key: 'cardio', label: 'Cardio', minutes: Math.round(mix.cardio), share: 0 },
    { key: 'conditioning', label: 'Conditioning', minutes: Math.round(mix.conditioning), share: 0 },
    { key: 'other', label: 'Other', minutes: Math.round(mix.other), share: 0 },
  ];
  for (const row of rows) {
    row.share = total > 0 ? Math.round((row.minutes / total) * 100) : 0;
    if (row.minutes > 0 && row.share === 0) row.share = 1;
  }
  return rows.sort((left, right) => right.minutes - left.minutes || left.label.localeCompare(right.label));
}

/** Per-type minute totals. Counts only: the type name and the minutes. */
export function sessionTypeCounts(types: readonly { label: string; minutes: number }[]): { label: string; minutes: number }[] {
  return types
    .filter((row) => row.minutes > 0 && row.label.trim())
    .map((row) => ({ label: row.label.trim(), minutes: Math.round(row.minutes) }))
    .sort((left, right) => right.minutes - left.minutes || left.label.localeCompare(right.label));
}

function recoveryView(input: {
  restingSplit: { earlier: number | null; recent: number | null };
  sleepSplit: { earlier: number | null; recent: number | null };
  hrvSplit: { earlier: number | null; recent: number | null };
  rhrUp: boolean;
  sleepDown: boolean;
  drop: number | null;
  hasResting: boolean;
  hasSleep: boolean;
  hasHrv: boolean;
}): FitnessSnapshot['recovery'] {
  if (!input.hasResting && !input.hasSleep && !input.hasHrv && input.drop == null) return null;
  const hrvDown = input.hrvSplit.earlier != null && input.hrvSplit.recent != null && input.hrvSplit.earlier - input.hrvSplit.recent >= 5;
  const dropBit = input.drop != null ? ` After a session, heart rate fell about ${Math.round(input.drop)} bpm in a minute.` : '';
  if (input.rhrUp && input.sleepDown) {
    return {
      status: 'Watch',
      tone: 'watch',
      words: `Recovery looks lighter than your usual. Resting heart rate is up and sleep is down.${dropBit}`,
    };
  }
  if (input.rhrUp) {
    return { status: 'Watch', tone: 'watch', words: `Resting heart rate is above your usual.${dropBit}` };
  }
  if (hrvDown && input.hasHrv) {
    return { status: 'Watch', tone: 'watch', words: `Heart rate variability is below your usual.${dropBit}` };
  }
  if (input.sleepDown) {
    return { status: 'Watch', tone: 'watch', words: `Sleep is below your earlier readings.${dropBit}` };
  }
  if (input.hasResting || input.hasSleep || input.hasHrv) {
    return { status: 'On track', tone: 'good', words: `Recovery looks usual for you.${dropBit}` };
  }
  return { status: 'Note', tone: 'info', words: `Heart rate recovery is about ${Math.round(input.drop ?? 0)} bpm.${dropBit}`.replace(/\s+/g, ' ') };
}

const EASY_AEROBIC = 'Add one easy aerobic session of 30 to 45 minutes at a conversational pace, beside the work you already do.';
const EASY_BESIDE_STRENGTH = 'Add one easy aerobic session of 30 to 45 minutes at a conversational pace, beside the strength work you already do.';
const EASY_BESIDE_BOXING = 'Add one easy aerobic session of 30 to 45 minutes at a conversational pace, beside the boxing you already do.';
const SHORT_INTERVAL = 'Add one short interval session a week, and build it up gradually, beside the sessions you already do.';
const SLEEP_PROTEIN = 'Keep sleep and protein with the sessions you already do.';

function recommend(input: {
  goal: NutritionGoal | null;
  easier: boolean;
  strength: number;
  cardio: number;
  conditioning: number;
  total: number;
  minutes: number;
  schedule: number | null;
  guideline?: number;
  hasWork: boolean;
  belowGoal: boolean;
}): FitnessRecommendation[] {
  const lines: FitnessRecommendation[] = [];
  const add = (text: string, forFocus: boolean) => {
    if (lines.length >= 3) return;
    if (/runna|mileage|\b5k\b|\b10k\b|progressive distance|fewer session|drop a session|crash/i.test(text)) return;
    if (lines.some((item) => item.text === text)) return;
    lines.push({ id: `fit-${lines.length + 1}`, text, forFocus });
  };
  if (input.easier && input.hasWork) {
    add('Keep the sessions you already do, and make this an easier week.', true);
    return lines;
  }
  const aerobic = input.cardio + input.conditioning;
  const cardioShare = input.total > 0 ? aerobic / input.total : null;
  const strengthShare = input.total > 0 ? input.strength / input.total : null;
  const lowCardio = cardioShare != null && cardioShare < 0.2 && input.strength > aerobic && input.total >= 30;
  const goal = input.goal;
  const boxer = isAnyBoxer(goal);
  if (boxer && (lowCardio || input.belowGoal)) {
    add(EASY_BESIDE_BOXING, true);
    if (lowCardio) add(SHORT_INTERVAL, true);
    add(SLEEP_PROTEIN, true);
  } else if (goal === 'lose_fat_build_muscle' && lowCardio) {
    add(EASY_BESIDE_STRENGTH, true);
    add(SLEEP_PROTEIN, true);
  } else if (goal === 'lose_fat_build_muscle' && strengthShare != null && strengthShare < 0.2 && aerobic > input.strength && input.total >= 30) {
    add('Add one strength session beside the work you already do.', true);
  } else if ((goal === 'increase' || goal === 'body_builder') && strengthShare != null && strengthShare < 0.25 && input.total >= 30) {
    add('Add one strength session beside the work you already do.', true);
  } else if (goal === 'lose_weight' && input.minutes > 0 && input.minutes < (input.guideline ?? 150) && (input.schedule == null || input.minutes < input.schedule)) {
    add(EASY_AEROBIC, true);
  } else if (goal === 'elite_runner' && input.hasWork) {
    add('Hold the sessions you already do, and keep one of them easy.', true);
  }
  if (!lines.length && input.hasWork) add('Hold the sessions you already do.', false);
  return lines;
}

function missingLine(input: {
  permission: 'denied' | 'unknown';
  hasVo2: boolean;
  hasAgeSex: boolean;
  hasMix: boolean;
  hasWork: boolean;
  hasLevel: boolean;
}): string | null {
  if (input.permission === 'denied' && !input.hasLevel && !input.hasWork) {
    return 'No data found from Apple Health. Turn on Workouts, Heart, and Cardio Fitness in the Health app: profile picture (top right) > Privacy > Apps > Charioteer. On iOS versions that have it: Settings > Health > Data Access & Devices > Charioteer.';
  }
  const parts: string[] = [];
  if (input.permission === 'denied') {
    parts.push('No data found from Apple Health, so new readings will not arrive.');
  }
  if (!input.hasVo2) parts.push('Cardio fitness appears when the watch has a VO2 max reading.');
  if (input.hasVo2 && !input.hasAgeSex) parts.push('Age and sex on Nutrition turn that reading into a level.');
  if (!input.hasMix && input.hasWork) parts.push('A sync on iPhone keeps strength and cardio apart.');
  if (!input.hasWork && !input.hasLevel && input.permission !== 'denied') {
    parts.push('Connect Apple Health on iPhone, or log resting heart rate and workouts.');
  }
  if (!parts.length) return null;
  return parts.slice(0, 2).join(' ');
}

/** Short class name when a boxing goal has one. Used in a day-line reason. */
export function goalReferenceName(goal: NutritionGoal | null): string | null {
  if (goal && isClassBoxer(goal)) return PRO_BOXING_CLASSES[goal].short;
  if (goal === 'elite_heavy_boxer') return 'heavyweight';
  if (goal === 'elite_middle_boxer') return 'middleweight';
  return null;
}

export type CardioGap = {
  /** VO2 is under the goal or age band, or cardio is a small share of the minutes. */
  behind: boolean;
  belowGoal: boolean;
  belowAge: boolean;
  lowCardio: boolean;
  trendingDown: boolean;
  /** Cruiserweight, heavyweight, and the other class names. Null when the goal has none. */
  reference: string | null;
};

/**
 * Whether cardio is behind the goal, the age and sex band, or the recent strength minutes.
 * The mix looks at the last 56 days, the same window as the recovery halves.
 */
export function assessCardioGap(input: FitnessSnapshotInput): CardioGap {
  const today = input.today;
  const vo2 = dayValue(input.health, 'vo2_max', today, 365);
  const latest = vo2.length ? vo2[vo2.length - 1]?.value ?? null : null;
  const band = latest != null ? bandFor(input.goalAge, input.goalSex) : null;
  const compare = latest == null ? null : compareFor({
    value: latest,
    age: input.goalAge,
    sex: input.goalSex,
    goal: input.goal,
    band,
  });
  const belowGoal = Boolean(compare?.goal && latest != null && latest < compare.goal.low);
  const belowAge = Boolean(compare?.age && latest != null && latest < compare.age.low);
  const active = periodActiveMinutes({
    samples: input.health,
    today,
    start: shiftDay(today, -55),
    end: today,
    overrides: input.workoutBuckets,
    sourceApps: input.sourceApps,
  });
  const aerobic = active.report.cardio + active.report.conditioning;
  const lowCardio = active.report.total >= 30 && aerobic / active.report.total < 0.2 && active.report.strength > aerobic;
  const earlier = vo2[0]?.value ?? null;
  const recent = vo2[vo2.length - 1]?.value ?? null;
  const trendingDown = earlier != null && recent != null && vo2.length >= 2 && recent + 0.4 < earlier;
  return {
    behind: belowGoal || belowAge || lowCardio,
    belowGoal,
    belowAge,
    lowCardio,
    trendingDown,
    reference: goalReferenceName(input.goal),
  };
}

function contextFrom(input: {
  level: FitnessLevel | null;
  vo2: number | null;
  compare: string | null;
  minutes: number;
  recovery: string | null;
  recommendation: string | null;
  build: BodyBuild | null;
  trendingDown?: boolean;
  cardioBehind?: boolean;
}): string | null {
  if (!input.level && input.minutes <= 0 && !input.recovery && !input.compare && input.build !== 'carrying_extra' && !input.cardioBehind) return null;
  const bits = ['Fitness snapshot, an estimate, not a medical assessment.'];
  if (input.build === 'carrying_extra') {
    bits.push('They are carrying extra weight. Comparisons use their own readings. Do not add a mileage plan or a bigger deficit.');
  }
  if (input.compare) bits.push(input.compare);
  else if (input.level) bits.push(`Level ${input.level}${input.vo2 != null ? `, cardio fitness about ${round1(input.vo2)} ml/kg/min` : ''}.`);
  if (input.minutes > 0) bits.push(`${Math.round(input.minutes)} active minutes this week.`);
  bits.push('Check with a doctor before big changes.');
  let line = bits.join(' ').replace(/\s+/g, ' ').trim();
  const extras = [
    input.trendingDown ? 'Cardio fitness is trending down.' : null,
    input.cardioBehind
      ? 'Add easy Zone 2 (bike, rower, brisk walk, or easy jog) and one short interval once a base is in place. Not a running plan.'
      : null,
    input.recommendation,
    input.recovery ? input.recovery.replace(/\s+/g, ' ').trim() : null,
  ].filter((item): item is string => Boolean(item));
  for (const extra of extras) {
    if (line.length + 1 + extra.length <= 560) line = `${line} ${extra}`;
  }
  return line;
}
