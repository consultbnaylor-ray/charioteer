/**
 * A short fitness summary from daily readings already stored.
 * Cardio fitness bands are the 25th and 75th percentiles from Kaminsky, Arena,
 * and Myers, Mayo Clinic Proceedings, 2015 (FRIEND treadmill standards, ages 20–79).
 * Below the 25th is Developing, from the 25th up to the 75th is Steady, and the
 * 75th and above is Strong. This is an estimate, not Apple's classification and
 * not a medical assessment.
 */
import { mondayOf, shiftDay } from './healthInsights.ts';
import {
  CARRYING_FITNESS_NOTE,
  GOAL_LABEL,
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

export type FitnessSample = { kind: string; value: number; recordedOn: string };

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
};

export type FitnessRing = {
  centre: string;
  unit: string;
  fill: number;
  status: string;
  tone: FitnessTone;
  words: string;
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
};

export type FitnessWeekMix = {
  label: string;
  strength: number;
  cardio: number;
  conditioning: number;
  other: number;
};

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
  cardio: (FitnessRing & { trend: number[]; compare: FitnessCompare }) | null;
  resting: FitnessTrend | null;
  minutes: FitnessRing | null;
  mix: { weeks: FitnessWeekMix[]; words: string } | null;
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
};

/** One line on the mix card. The split follows the saved workout type. */
export const MIX_HOW = 'Based on the workout type your Watch or app recorded, not heart rate.';

export const CONDITIONING_NOTE =
  'Conditioning is HIIT, mixed cardio, boxing, kickboxing, and martial arts. It is shown on its own, not inside cardio.';

export function workoutTypeLabel(activityType: number): string {
  return WORKOUT_TYPE_LABEL[activityType] ?? `Workout type ${activityType}`;
}

export function defaultWorkoutBucket(activityType: number): WorkoutBucket {
  if (STRENGTH_TYPES.has(activityType)) return 'strength';
  if (CONDITIONING_TYPES.has(activityType)) return 'conditioning';
  if (CARDIO_TYPES.has(activityType)) return 'cardio';
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
    return 'The boxing ranges found are for men on a national team, so they are not shown.';
  }
  if (!hasAgeBand) return null;
  const title = goal ? GOAL_LABEL[goal] : null;
  if (goal === 'elite_runner' || goal === 'body_builder') {
    return `${title} has no separate published range here. The band is typical for your age and sex.`;
  }
  if (!title) return 'There is no separate published cardio range. The band is typical for your age and sex.';
  return `${title} has no separate published cardio range. The band is typical for your age and sex.`;
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
    ? ` Typical for ${GOAL_LABEL[input.goal]}, approximate, is about ${goalBand.low} to ${goalBand.high}.`
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
  const vo2 = dayValue(input.health, 'vo2_max', today, 56);
  const resting = dayValue(input.health, 'resting_heart_rate', today, 56);
  const hrv = dayValue(input.health, 'hrv_sdnn', today, 56);
  const healthSleep = dayValue(input.health, 'sleep_hours', today, 56);
  const sleep = healthSleep.length
    ? healthSleep
    : (input.sleep ?? [])
      .filter((row) => row.day <= today && row.day >= shiftDay(today, -55) && row.hours > 0)
      .map((row) => ({ day: row.day, value: row.hours }));
  const walking = dayValue(input.health, 'walking_heart_rate', today, 56);
  const recoveryDrop = dayValue(input.health, 'heart_rate_recovery', today, 56);
  const weekStart = mondayOf(today);
  const workoutMinutes = sumKind(input.health, 'workout_minutes', weekStart, today);
  const mixWeek = sumKind(input.health, 'strength_minutes', weekStart, today)
    + sumKind(input.health, 'cardio_minutes', weekStart, today)
    + sumKind(input.health, 'conditioning_minutes', weekStart, today)
    + sumKind(input.health, 'other_minutes', weekStart, today);
  const minutes = workoutMinutes > 0 ? workoutMinutes : mixWeek;
  const monthStart = shiftDay(today, -27);
  const strength = sumKind(input.health, 'strength_minutes', monthStart, today);
  const cardioMin = sumKind(input.health, 'cardio_minutes', monthStart, today);
  const conditioning = sumKind(input.health, 'conditioning_minutes', monthStart, today);
  const other = sumKind(input.health, 'other_minutes', monthStart, today);
  const mixTotal = strength + cardioMin + conditioning + other;
  const restingSplit = halves(resting);
  const sleepSplit = halves(sleep);
  const hrvSplit = halves(hrv);
  const rhrUp = restingSplit.earlier != null && restingSplit.recent != null && restingSplit.recent - restingSplit.earlier >= 5;
  const sleepDown = sleepSplit.earlier != null && sleepSplit.recent != null && sleepSplit.earlier - sleepSplit.recent >= 0.5;
  const easier = rhrUp && sleepDown;

  const latestVo2 = vo2.length ? vo2[vo2.length - 1]?.value ?? null : null;
  const band = latestVo2 != null ? bandFor(input.goalAge, input.goalSex) : null;
  const vo2Level = latestVo2 != null && band ? rateVo2(latestVo2, band) : null;
  const fallback = vo2Level ? null : fallbackLevel(minutes, input.scheduleWeekMinutes, restingSplit);
  const level = vo2Level ?? fallback;

  const levelWordsBase = levelWordsFor({
    level,
    vo2: latestVo2,
    band: Boolean(band),
    age: input.goalAge,
    sex: input.goalSex,
    minutes,
    schedule: input.scheduleWeekMinutes,
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
    compare,
  };

  const restingTrend = resting.length >= 2 ? {
    label: 'Resting heart rate',
    reading: `${Math.round(resting[resting.length - 1]?.value ?? 0)} bpm`,
    words: restingWords(restingSplit),
    tone: rhrUp ? 'watch' as const : 'good' as const,
    points: resting.slice(-8).map((point) => Math.round(point.value)),
  } : null;

  const aim = input.scheduleWeekMinutes && input.scheduleWeekMinutes > 0 ? input.scheduleWeekMinutes : 150;
  const minutesRing = minutes > 0 || input.scheduleWeekMinutes ? {
    centre: String(Math.round(minutes)),
    unit: 'min this week',
    fill: Math.max(0, Math.min(1, minutes / aim)),
    status: minutes >= aim * 0.9 ? 'On track' : 'Short',
    tone: minutes >= aim * 0.9 ? 'good' as const : 'watch' as const,
    words: minutesWords(minutes, input.scheduleWeekMinutes),
  } : null;

  const weeks = mixWeeks(input.health, today);
  const mix = weeks.some((week) => week.strength + week.cardio + week.conditioning + week.other > 0)
    ? { weeks, words: mixWords(strength, cardioMin, conditioning, other) }
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

  const recommendations = recommend({
    goal: input.goal,
    easier,
    strength,
    cardio: cardioMin,
    conditioning,
    total: mixTotal,
    minutes,
    schedule: input.scheduleWeekMinutes,
    hasWork: minutes > 0 || mixTotal > 0,
    belowGoal: Boolean(compare?.goal && latestVo2 != null && latestVo2 < compare.goal.low),
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
): FitnessLevel | null {
  const delta = resting.earlier != null && resting.recent != null ? resting.recent - resting.earlier : null;
  if (minutes <= 0 && delta == null) return null;
  const rhrUp = delta != null && delta >= 5;
  const rhrOk = delta == null || delta < 3;
  const underGuideline = minutes < 75;
  const underSchedule = schedule != null && minutes < schedule * 0.6;
  const meeting = minutes >= 150 && (schedule == null || minutes >= schedule * 0.9);
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
  const minutesBit = input.minutes > 0 ? `${Math.round(input.minutes)} active minutes this week` : 'no active minutes logged this week';
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

function minutesWords(minutes: number, schedule: number | null): string {
  const guideline = 'The activity guideline is 150 min a week.';
  if (schedule && schedule > 0) {
    return `${Math.round(minutes)} min this week. Your schedule is about ${Math.round(schedule)} min. ${guideline}`;
  }
  return `${Math.round(minutes)} min this week. ${guideline}`;
}

function mixWeeks(samples: readonly FitnessSample[], today: string): FitnessWeekMix[] {
  const thisMonday = mondayOf(today);
  const weeks: FitnessWeekMix[] = [];
  for (let index = 7; index >= 0; index -= 1) {
    const start = shiftDay(thisMonday, -index * 7);
    const end = index === 0 ? today : shiftDay(start, 6);
    weeks.push({
      label: index === 0 ? 'Now' : `${index}w`,
      strength: Math.round(sumKind(samples, 'strength_minutes', start, end)),
      cardio: Math.round(sumKind(samples, 'cardio_minutes', start, end)),
      conditioning: Math.round(sumKind(samples, 'conditioning_minutes', start, end)),
      other: Math.round(sumKind(samples, 'other_minutes', start, end)),
    });
  }
  const first = weeks.findIndex((week) => week.strength + week.cardio + week.conditioning + week.other > 0);
  return first <= 0 ? weeks : weeks.slice(first);
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
  return `Recent weeks are mostly ${leader}. Strength ${share(strength)}%, cardio ${share(cardio)}%, conditioning ${share(conditioning)}%, other ${share(other)}%. ${CONDITIONING_NOTE}`;
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
  } else if (goal === 'lose_weight' && input.minutes > 0 && input.minutes < 150 && (input.schedule == null || input.minutes < input.schedule)) {
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

function contextFrom(input: {
  level: FitnessLevel | null;
  vo2: number | null;
  compare: string | null;
  minutes: number;
  recovery: string | null;
  recommendation: string | null;
  build: BodyBuild | null;
}): string | null {
  if (!input.level && input.minutes <= 0 && !input.recovery && !input.compare && input.build !== 'carrying_extra') return null;
  const bits = ['Fitness snapshot, an estimate, not a medical assessment.'];
  if (input.build === 'carrying_extra') {
    bits.push('They are carrying extra weight. Comparisons use their own readings. Do not add a mileage plan or a bigger deficit.');
  }
  if (input.compare) bits.push(input.compare);
  else if (input.level) bits.push(`Level ${input.level}${input.vo2 != null ? `, cardio fitness about ${round1(input.vo2)} ml/kg/min` : ''}.`);
  if (input.minutes > 0) bits.push(`${Math.round(input.minutes)} active minutes this week.`);
  if (input.recommendation) bits.push(input.recommendation);
  bits.push('Check with a doctor before big changes.');
  let line = bits.join(' ').replace(/\s+/g, ' ').trim();
  if (input.recovery) {
    const extra = ` ${input.recovery.replace(/\s+/g, ' ').trim()}`;
    if (line.length + extra.length <= 500) line += extra;
  }
  return line.slice(0, 500);
}
