import { healthSampleChart } from '@/domain/chartSeries';
import { bodyFatRange } from '@/domain/distance';
import { periodActiveMinutes, publishedCardioBand } from '@/domain/fitnessSnapshot';
import { stepResearchBand } from '@/domain/garminCharts';
import { BHF_RESTING_MAX_BPM, BHF_RESTING_MIN_BPM, bmiFrom, CMO_MODERATE_MINUTES_WEEK, NHS_ADULT_SLEEP_MAX_HOURS, NHS_ADULT_SLEEP_MIN_HOURS } from '@/domain/guidance';
import { shiftDay } from '@/domain/healthInsights';
import {
  GOAL_LABEL,
  loggedProteinRing,
  todayMealTotals,
  WAIST_HEIGHT_HEALTHY,
  weightDirection,
  type BodyBuild,
  type FoodLog,
  type NutritionGoal,
  type NutritionSex,
  type WorkoutBucketMap,
} from '@/domain/nutrition';
import { withPlannedMinutes, type PlannedSession } from '@/domain/plannedSession';
import { periodPhrase, rollingWindow, scaledPeriodTarget, type StatPeriod } from '@/domain/statWindow';

/**
 * A short note for the weight section and the health plan.
 * Written on the phone from readings already stored here.
 * It does not call the coach and does not store a new reading.
 * The prompt below is the guardrail text. This build does not send it.
 */

export const THUMOS_READING_LABEL = 'Thumos';

export const THUMOS_OFF_LINE =
  'Thumos is off, so this note stays on this phone. It is not sent to the coach.';

export const THUMOS_HEALTH_OFF_LINE =
  'Health data is off, so this note has no readings to use.';

export const THUMOS_BOTH_OFF_LINE =
  'Thumos is off, and health data is off. This note is not sent to the coach.';

export const THUMOS_EMPTY_LINE =
  'There are no readings here yet for Thumos to comment on.';

export const THUMOS_FAILED_LINE =
  'Thumos could not write a note from these readings.';

export const THUMOS_BMI_LINE = 'BMI cannot tell muscle from fat.';

export const THUMOS_LOCAL_LINE =
  'This note is written on this phone from readings already stored here. It is not sent to the coach. It is not a diagnosis, and it does not set a calorie target or a weight-loss target.';

export const THUMOS_ANALYSE_AGAIN = 'Have Thumos analyse your data again';

export const THUMOS_BODY_FAT_DOWN = 'Body fat is down from the earlier reading.';
export const THUMOS_BODY_FAT_UP = 'Body fat is up from the earlier reading.';
export const THUMOS_BODY_FAT_SAME = 'Body fat is the same as the earlier reading.';
export const THUMOS_LEAN_DOWN = 'Lean mass is down from the earlier reading.';
export const THUMOS_LEAN_UP = 'Lean mass is up from the earlier reading.';
export const THUMOS_LEAN_SAME = 'Lean mass is the same as the earlier reading.';
export const THUMOS_NO_BODY_FAT = 'No body fat reading is stored, so it is not in this note.';
export const THUMOS_NO_LEAN = 'No lean mass reading is stored, so it is not in this note.';
export const THUMOS_NO_WAIST = 'No waist reading is stored, so it is not in this note.';
export const THUMOS_NO_HEIGHT = 'No height is stored, so BMI is not in this note.';
export const THUMOS_NO_WEIGHT_BMI = 'No weight is stored, so BMI is not in this note.';
export const THUMOS_NO_VO2 = 'No VO2 max is stored, so it is not in this note.';
export const THUMOS_NO_RESTING = 'No resting heart rate is stored, so it is not in this note.';
export const THUMOS_NO_SLEEP = 'No sleep is stored, so it is not in this note.';
export const THUMOS_NO_STEPS = 'No steps are stored, so they are not in this note.';
export const THUMOS_NO_PROTEIN = 'No protein is stored for today, so it is not in this note.';
export const THUMOS_CALORIES_LEFT_OUT = 'Calories are stored for today, and this note leaves them out.';
export const THUMOS_CALORIES_ABSENT = 'Calories are not stored for today, so they are not in this note.';
export const THUMOS_NO_TARGET_TIME = 'No target weight is stored, so a time to a target is not in this note.';
export const THUMOS_NO_TIME_ESTIMATE = 'A time to reach the target is not estimated from these readings.';

export const THUMOS_NEEDS_SEVEN_DAYS = 'Thumos needs at least 7 days of data.';

export const THUMOS_LOG_MORE_DAYS =
  'Log weight, sleep, steps, and workouts on more days. A verdict on the target waits until then.';

export const THUMOS_TOWARDS_TARGET = 'Weight is moving towards the target you chose.';

export const THUMOS_AWAY_TARGET = 'Weight is moving away from the target you chose.';

export const THUMOS_UNCLEAR_TARGET = 'Weight is holding, so the move towards the target is not clear yet.';

export const THUMOS_ONE_WEIGHT_TARGET = 'One weight reading is stored, so a move towards the target is not clear yet.';

export const THUMOS_FOCUS_STRENGTH = 'Strength minutes are not in these 7 days. Logging them is the next focus.';

export const THUMOS_FOCUS_SLEEP = 'Sleep is not stored. Logging nights is a focus.';

export const THUMOS_FOCUS_STEPS = 'Steps are not stored. Logging steps is a focus.';

export const THUMOS_FOCUS_PROTEIN = 'Protein is not stored for today. Logging meals is a focus.';

export const THUMOS_FOCUS_KEEP = 'Keep the readings you already store. That is the focus for now.';

export const THUMOS_LOOKING_GOOD_TARGET = 'This is looking good toward the target you chose.';
export const THUMOS_MIXED_TARGET = 'This is mixed toward the target you chose.';
export const THUMOS_NEEDS_WORK_TARGET = 'This needs work toward the target you chose.';
export const THUMOS_LOOKING_GOOD = 'This is looking good from the readings stored here.';
export const THUMOS_MIXED = 'This is mixed from the readings stored here.';
export const THUMOS_NEEDS_WORK = 'This needs work from the readings stored here.';
export const THUMOS_NOTHING_TO_JUDGE = 'Readings are stored. This note skips a verdict where it has no reference.';

export const THUMOS_WEIGHT_AWAY_CHANGE = 'Weight is moving away from the target you chose. Keep logging it on the days you already weigh, so the next reading can show a turn.';
export const THUMOS_WEIGHT_HOLD_CHANGE = 'Weight is holding, so the move toward the target is not clear yet. Another reading on a later day would show the direction.';
export const THUMOS_WEIGHT_ONE_CHANGE = 'One weight reading is stored, so a move toward the target is not clear yet. A second reading on a later day would show the direction.';

export const THUMOS_RESTING_HIGH = 'Resting heart rate needs attention: it is over the usual 60 to 100 bpm range for this period. Another resting reading on a quiet day would show whether it holds.';
export const THUMOS_RESTING_LOW = 'Resting heart rate is worth watching: it is under 60 bpm for this period. One reading is not a pattern.';

export const THUMOS_SLEEP_SHORT = 'Sleep is worth watching: under 7 hours for this period. An earlier night on the days you already log would lift it.';
export const THUMOS_SLEEP_LONG_STORED = 'Sleep is stored and over 9 hours for this period. That is not a warning on its own, so this note skips a verdict.';
export const THUMOS_SLEEP_MISSING = 'Sleep is not stored for this period. Logging a night would put it in the note.';

export const THUMOS_STEPS_LOW = 'Steps are worth watching: under the research range this screen uses. A walk on more of the days in this period would lift the average.';
export const THUMOS_STEPS_MISSING = 'Steps are not stored for this period. A walk you log would put them in the note.';

export const THUMOS_PROTEIN_SHORT = 'Protein is worth watching: short of the target you set. Another protein meal today would close the gap.';
export const THUMOS_PROTEIN_STORED = 'Protein is stored for today. No protein target is set, so this note skips a verdict.';
export const THUMOS_PROTEIN_MISSING = 'Protein is not stored for today. Logging a meal would put it in the note.';

export const THUMOS_MINUTES_SHORT = 'Workout minutes are worth watching: under the minutes Your Fitness uses for this period. Another session in this period would close the gap.';
export const THUMOS_MINUTES_MISSING = 'Workout minutes are not stored for this period. One session you log would start that figure.';

export const THUMOS_STRENGTH_NOT_RECORDED = 'Strength is not recorded for this period, so this note does not judge it.';
export const THUMOS_STRENGTH_FOR_AIM = 'Strength is not in this period beside the other work. A strength session would match the aim you saved.';
export const THUMOS_CARDIO_FOR_AIM = 'Cardio is not in this period beside the strength. A cardio session would match the aim you saved.';

export const THUMOS_VO2_DEVELOPING = 'VO2 max is worth watching: Developing for your age and sex. Keep the sessions you already do. This does not set a higher figure.';
export const THUMOS_VO2_STORED = 'VO2 max is stored. Age and sex are not set, so this note skips a level.';

export const THUMOS_FAT_ABOVE = 'Body fat is worth watching: above the band this screen uses. This is not a diagnosis, and it does not set a weight-loss target.';
export const THUMOS_FAT_BELOW = 'Body fat is worth watching: under the band this screen uses. This is not a diagnosis.';
export const THUMOS_WAIST_ABOVE = 'Waist is worth watching: above the waist-to-height band this screen uses. This is not a diagnosis.';
export const THUMOS_LEAN_STORED = 'Lean mass is stored. This note skips a verdict.';

export const THUMOS_SEVEN_DAYS = 7;

export const THUMOS_READING_PROMPT = [
  'Write a helpful, encouraging note about this reading in two or three sentences.',
  'Use only readings that are present. Leave out any figure that is missing.',
  'Do not diagnose. Do not say Overweight, Obese, or Healthy.',
  'Do not give a calorie target or a weight-loss target.',
  'Do not make a medical claim. Do not shame the person.',
  'When the person trains, include this sentence: BMI cannot tell muscle from fat.',
  'Do not write the safety line. It is already shown beside the note.',
].join(' ');

const ENCOURAGING_LINES = [
  'That is a useful picture to keep beside the scales.',
  'These readings can sit together, and that is worth another look.',
  'There is something here to work with.',
] as const;

const BANNED = /\b(overweight|obese|obesity|healthy|diagnos\w*|disease|illness|treatment|symptom|prescribe\w*|cure|medication|clinical|shame\w*|lazy|failure|disappointing|hopeless|worthless|pathetic)\b|\byou should\b|\bkcal\b|\bcalories?\b|\bdeficit\b|\blose weight\b|weight-?loss/i;

const ENCOURAGING = /\b(worth|useful|keep|encourag\w*)\b|work with/i;

export type ThumosReadingInput = {
  today: string;
  consentAi: boolean;
  consentHealth: boolean;
  weights: readonly { day: string; kg: number }[];
  bodyFatPct: number | null;
  leanMassKg: number | null;
  /** Null when that kind was not logged in the last 7 days. */
  strengthMinutes7: number | null;
  workoutMinutes7: number | null;
  goal: NutritionGoal | null;
  targetKg: number | null;
  vo2: number | null;
  restingBpm: number | null;
  build: BodyBuild | null;
  /** Earlier stored reading, when a second one exists. Null when there is only one. */
  bodyFatEarlier?: number | null;
  leanEarlier?: number | null;
  waistCm?: number | null;
  heightCm?: number | null;
  cardioMinutes7?: number | null;
  sleepHours?: number | null;
  steps?: number | null;
  proteinG?: number | null;
  /** True when today's meals have a calorie figure. The number is not written into the note. */
  caloriesStored?: boolean;
  /** Distinct days with a stored reading. Omitted means the 7-day gate is not applied. */
  storedDayCount?: number | null;
  /** Sex used for the body-fat band. Same field as the body card. */
  goalSex?: NutritionSex | null;
  /** Shared Day / 7 days / 30 days label, such as "the last 7 days". */
  windowLabel?: string;
  /** Daily step average for the same window as the steps tile. */
  stepsDaily?: number | null;
  /** True when that daily average is under the research band for the saved age. */
  stepsLow?: boolean | null;
  /** False when Your Fitness has workout minutes but no strength split. */
  strengthRecorded?: boolean;
  /** Minutes Your Fitness compares with, for this same window. */
  workoutAim?: number | null;
  /** True when today's protein meets the saved target. Null when there is no target. */
  proteinMet?: boolean | null;
  /** Developing, Steady, or Strong. Null when age or sex is missing. */
  vo2Level?: 'Developing' | 'Steady' | 'Strong' | null;
};

export type ThumosReadingView = {
  sentences: string[];
  more: string[];
};

export type ReadingGuardReason =
  | 'empty'
  | 'length'
  | 'tone'
  | 'banned'
  | 'number'
  | 'missing'
  | 'bmi'
  | 'safety';

function shown(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function minutes(value: number): string {
  return String(Math.round(value));
}

export function trainsForReading(input: Pick<ThumosReadingInput, 'strengthMinutes7' | 'workoutMinutes7' | 'goal' | 'build'>): boolean {
  if ((input.strengthMinutes7 ?? 0) > 0 || (input.workoutMinutes7 ?? 0) > 0) return true;
  if (input.build === 'muscular') return true;
  const goal = input.goal;
  if (goal == null) return false;
  return goal === 'lose_fat_build_muscle' || goal === 'body_builder' || goal === 'elite_runner' || goal.includes('boxer');
}

function weightSentence(weights: readonly { day: string; kg: number }[]): string | null {
  const ordered = [...weights].filter((point) => point.kg > 0).sort((left, right) => left.day.localeCompare(right.day));
  const latest = ordered.at(-1);
  if (!latest) return null;
  const earlier = ordered[0];
  if (!earlier || earlier.day === latest.day) return `Weight is ${shown(latest.kg)} kg.`;
  if (latest.kg < earlier.kg) return `Weight is ${shown(latest.kg)} kg, down from ${shown(earlier.kg)} kg.`;
  if (latest.kg > earlier.kg) return `Weight is ${shown(latest.kg)} kg, up from ${shown(earlier.kg)} kg.`;
  return `Weight is ${shown(latest.kg)} kg, the same as the earlier reading.`;
}

function aimSentence(goal: NutritionGoal): string {
  return `The aim saved here is ${GOAL_LABEL[goal]}.`;
}

function directionLine(latest: number, earlier: number, down: string, up: string, same: string): string {
  if (latest < earlier) return down;
  if (latest > earlier) return up;
  return same;
}

function waistSentence(cm: number): string {
  return `Waist is ${shown(cm)} cm.`;
}

function bmiSentence(bmi: number): string {
  return `BMI is ${shown(bmi)}, from the weight and height stored here.`;
}

function cardioSentence(minutesValue: number): string {
  return `Cardio work in the last 7 days is ${minutes(minutesValue)} min.`;
}

function mixSentence(strength: number, cardio: number): string {
  return `Strength is ${minutes(strength)} min and cardio is ${minutes(cardio)} min in the last 7 days.`;
}

function windowLabel(input: ThumosReadingInput): string {
  return input.windowLabel?.trim() || 'the last 7 days';
}

function sleepSentence(hours: number, label: string): string {
  return `Sleep for ${label} averages ${shown(hours)} hours.`;
}

function stepsSentence(count: number, label: string): string {
  return `Steps for ${label} are ${minutes(count)}.`;
}

function restingSentence(bpm: number, label: string): string {
  return `Resting heart rate for ${label} is ${minutes(bpm)} bpm.`;
}

function proteinSentence(grams: number): string {
  return `Protein logged today is ${shown(grams)} g.`;
}

function factSentences(input: ThumosReadingInput): string[] {
  const lines: string[] = [];
  const weight = weightSentence(input.weights);
  if (weight) lines.push(weight);
  if (input.bodyFatPct != null) lines.push(`Body fat is ${shown(input.bodyFatPct)}%.`);
  if (input.leanMassKg != null) lines.push(`Lean mass is ${shown(input.leanMassKg)} kg.`);
  if ((input.strengthMinutes7 ?? 0) > 0) lines.push(`Strength work in the last 7 days is ${minutes(input.strengthMinutes7 ?? 0)} min.`);
  else if ((input.workoutMinutes7 ?? 0) > 0) lines.push(`Logged workouts in the last 7 days are ${minutes(input.workoutMinutes7 ?? 0)} min.`);
  if (input.goal) lines.push(aimSentence(input.goal));
  if (input.vo2 != null) lines.push(`VO2 max is ${shown(input.vo2)} ml/kg/min.`);
  if (input.restingBpm != null) lines.push(`Resting heart rate is ${shown(input.restingBpm)} bpm.`);
  return lines;
}

/** Splits on sentence marks without breaking a decimal such as 74.2. */
export function readingSentences(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? '';
    current += char;
    if (!/[.!?]/.test(char)) continue;
    const prev = text[i - 1] ?? '';
    const next = text[i + 1] ?? '';
    if (/\d/.test(prev) && /\d/.test(next)) continue;
    const sentence = current.trim();
    if (sentence) parts.push(sentence);
    current = '';
  }
  const tail = current.trim();
  if (tail) parts.push(tail);
  return parts;
}

function fingerprint(input: ThumosReadingInput): number {
  const key = [
    input.today,
    [...input.weights].map((point) => `${point.day}:${shown(point.kg)}`).sort().join(','),
    input.bodyFatPct ?? '',
    input.leanMassKg ?? '',
    input.strengthMinutes7 ?? '',
    input.workoutMinutes7 ?? '',
    input.goal ?? '',
    input.targetKg ?? '',
    input.vo2 ?? '',
    input.restingBpm ?? '',
    input.build ?? '',
  ].join('|');
  let sum = 0;
  for (let i = 0; i < key.length; i += 1) sum += (key.charCodeAt(i) ?? 0) * (i + 1);
  return sum;
}

function allowedNumbers(input: ThumosReadingInput): Set<string> {
  const allowed = new Set<string>(['7']);
  const add = (value: number | null | undefined, rounded = false) => {
    if (value == null || !Number.isFinite(value)) return;
    allowed.add(rounded ? minutes(value) : shown(value));
  };
  for (const point of input.weights) add(point.kg);
  add(input.bodyFatPct);
  add(input.leanMassKg);
  add(input.strengthMinutes7, true);
  add(input.workoutMinutes7, true);
  add(input.targetKg);
  add(input.vo2);
  add(input.restingBpm);
  return allowed;
}

function withoutAim(text: string, input: ThumosReadingInput): string {
  if (!input.goal) return text;
  return text.replace(aimSentence(input.goal), ' ');
}

/**
 * Accepts a 2 or 3 sentence note that stays helpful and uses only the readings passed in.
 * Returns a reason code when the note must not be shown.
 */
export function guardReadingComment(text: string, input: ThumosReadingInput): ReadingGuardReason | null {
  const trimmed = text.trim();
  if (!trimmed) return 'empty';
  const sentences = readingSentences(trimmed);
  if (sentences.length < 2 || sentences.length > 3) return 'length';
  if (!ENCOURAGING.test(trimmed)) return 'tone';
  if (/\b(NHS|GP|999)\b/.test(trimmed) || /not medical advice/i.test(trimmed)) return 'safety';
  if (BANNED.test(withoutAim(trimmed, input))) return 'banned';
  const numbers = trimmed.match(/\d+(?:\.\d+)?/g) ?? [];
  const allowed = allowedNumbers(input);
  if (numbers.some((value) => !allowed.has(value))) return 'number';
  const body = withoutAim(trimmed, input);
  const mentions = (pattern: RegExp) => pattern.test(body);
  if (mentions(/\bbody fat\b/i) && input.bodyFatPct == null) return 'missing';
  if (mentions(/\blean\b/i) && input.leanMassKg == null) return 'missing';
  if (mentions(/\bvo2\b/i) && input.vo2 == null) return 'missing';
  if (mentions(/\bresting\b/i) && input.restingBpm == null) return 'missing';
  if (mentions(/\bbpm\b/i) && input.restingBpm == null) return 'missing';
  if (mentions(/\bstrength\b/i) && !((input.strengthMinutes7 ?? 0) > 0)) return 'missing';
  if (mentions(/\bworkout/i) && !((input.workoutMinutes7 ?? 0) > 0)) return 'missing';
  if (mentions(/\btarget\b/i) && !((input.targetKg ?? 0) > 0)) return 'missing';
  if (mentions(/\baim\b/i) && input.goal == null) return 'missing';
  if (mentions(/\bweight\b/i) && !input.weights.some((point) => point.kg > 0)) return 'missing';
  const trains = trainsForReading(input);
  const hasBmi = trimmed.includes(THUMOS_BMI_LINE);
  if (trains && !hasBmi) return 'bmi';
  if (!trains && /BMI cannot tell muscle from fat/.test(trimmed)) return 'bmi';
  return null;
}

function composeReading(input: ThumosReadingInput): string {
  const facts = factSentences(input);
  const trains = trainsForReading(input);
  const fp = fingerprint(input);
  const closer = ENCOURAGING_LINES[fp % ENCOURAGING_LINES.length] ?? ENCOURAGING_LINES[0];
  const picked: string[] = [];
  if (facts.length) {
    const lead = facts[fp % facts.length] ?? facts[0];
    picked.push(lead);
    if (!trains) {
      const rest = facts.filter((line) => line !== lead);
      if (rest.length) picked.push(rest[fp % rest.length] ?? rest[0]);
    }
  }
  if (trains) picked.push(THUMOS_BMI_LINE);
  picked.push(closer);
  return picked.slice(0, 3).join(' ');
}

/** Uses the fixed fallback when a draft fails the guard. */
export function showReadingDraft(draft: string, input: ThumosReadingInput): string[] {
  if (guardReadingComment(draft, input)) return [THUMOS_FAILED_LINE];
  return readingSentences(draft);
}

function fixed(line: string): ThumosReadingView {
  return { sentences: [line], more: [THUMOS_LOCAL_LINE] };
}

function latestWeight(input: ThumosReadingInput): number | null {
  const ordered = [...input.weights].filter((point) => point.kg > 0).sort((left, right) => left.day.localeCompare(right.day));
  return ordered.at(-1)?.kg ?? null;
}

/** Lines for More info. Each one uses only a stored figure, or says that figure is absent. */
export function thumosDetailLines(input: ThumosReadingInput): string[] {
  const lines: string[] = [];
  if (input.bodyFatPct == null) lines.push(THUMOS_NO_BODY_FAT);
  else if (input.bodyFatEarlier != null) {
    lines.push(directionLine(input.bodyFatPct, input.bodyFatEarlier, THUMOS_BODY_FAT_DOWN, THUMOS_BODY_FAT_UP, THUMOS_BODY_FAT_SAME));
  }
  if (input.leanMassKg == null) lines.push(THUMOS_NO_LEAN);
  else if (input.leanEarlier != null) {
    lines.push(directionLine(input.leanMassKg, input.leanEarlier, THUMOS_LEAN_DOWN, THUMOS_LEAN_UP, THUMOS_LEAN_SAME));
  }
  if (input.waistCm != null && input.waistCm > 0) lines.push(waistSentence(input.waistCm));
  else lines.push(THUMOS_NO_WAIST);
  const weight = latestWeight(input);
  const bmi = weight != null && input.heightCm != null ? bmiFrom(weight, input.heightCm) : null;
  if (bmi != null) lines.push(bmiSentence(bmi));
  else if (weight == null) lines.push(THUMOS_NO_WEIGHT_BMI);
  else lines.push(THUMOS_NO_HEIGHT);
  const strength = input.strengthMinutes7 ?? 0;
  const cardio = input.cardioMinutes7 ?? 0;
  if (input.strengthRecorded === false && (input.workoutMinutes7 ?? 0) > 0) lines.push(THUMOS_STRENGTH_NOT_RECORDED);
  else if (strength > 0 && cardio > 0) lines.push(mixSentence(strength, cardio));
  else if (cardio > 0) lines.push(cardioSentence(cardio));
  if (input.vo2 == null) lines.push(THUMOS_NO_VO2);
  if (input.restingBpm == null) lines.push(THUMOS_NO_RESTING);
  const label = windowLabel(input);
  if (input.sleepHours != null && input.sleepHours > 0) {
    lines.push(sleepSentence(input.sleepHours, label));
    if (input.sleepHours > NHS_ADULT_SLEEP_MAX_HOURS) lines.push(THUMOS_SLEEP_LONG_STORED);
  } else lines.push(THUMOS_NO_SLEEP);
  if (input.steps != null && input.steps > 0) lines.push(stepsSentence(input.steps, label));
  else lines.push(THUMOS_NO_STEPS);
  if (input.restingBpm != null) lines.push(restingSentence(input.restingBpm, label));
  if (input.vo2 != null && input.vo2Level == null) lines.push(THUMOS_VO2_STORED);
  if (input.proteinG != null && input.proteinMet == null) lines.push(THUMOS_PROTEIN_STORED);
  if (input.leanMassKg != null) lines.push(THUMOS_LEAN_STORED);
  if (input.targetKg != null && input.targetKg > 0) lines.push(THUMOS_NO_TIME_ESTIMATE);
  else lines.push(THUMOS_NO_TARGET_TIME);
  if (input.proteinG != null) lines.push(proteinSentence(input.proteinG));
  else lines.push(THUMOS_NO_PROTEIN);
  lines.push(input.caloriesStored ? THUMOS_CALORIES_LEFT_OUT : THUMOS_CALORIES_ABSENT);
  return lines;
}

function safeCard(input: ThumosReadingInput): string[] | null {
  const closer = ENCOURAGING_LINES[0];
  const weight = weightSentence(input.weights);
  const trains = trainsForReading(input);
  const candidates = [
    trains && weight ? `${weight} ${THUMOS_BMI_LINE} ${closer}` : null,
    weight ? `${weight} ${closer}` : null,
    trains ? `${THUMOS_BMI_LINE} ${closer}` : null,
  ].filter((line): line is string => Boolean(line));
  for (const draft of candidates) {
    if (!guardReadingComment(draft, input)) return readingSentences(draft);
  }
  return null;
}

function orderedWeights(input: ThumosReadingInput): { day: string; kg: number }[] {
  return [...input.weights].filter((point) => point.kg > 0).sort((left, right) => left.day.localeCompare(right.day));
}

type WeightMove = 'towards' | 'away' | 'holding' | 'one' | 'none';

/** Same earlier-and-latest pair as the weight chart, with its 0.3 kg dead zone. */
function weightMove(input: ThumosReadingInput): WeightMove {
  if (input.targetKg == null || !(input.targetKg > 0)) return 'none';
  const ordered = orderedWeights(input);
  const latest = ordered.at(-1);
  const earlier = ordered[0];
  if (!latest || !earlier) return 'one';
  if (earlier.day === latest.day) return 'one';
  const direction = weightDirection(ordered);
  if (direction === 'steady' || direction === 'unknown') return 'holding';
  const wantsLower = input.targetKg < earlier.kg;
  const wantsHigher = input.targetKg > earlier.kg;
  if ((wantsLower && direction === 'down') || (wantsHigher && direction === 'up')) return 'towards';
  if ((wantsLower && direction === 'up') || (wantsHigher && direction === 'down')) return 'away';
  return 'holding';
}

type NoteMark = 'good' | 'watch' | 'attention' | 'gap' | 'skip';

function wantsStrength(goal: NutritionGoal | null | undefined): boolean {
  if (goal == null) return false;
  return goal === 'lose_fat_build_muscle' || goal === 'body_builder' || goal.includes('boxer');
}

function commentSlots(input: ThumosReadingInput): { mark: NoteMark; line: string | null }[] {
  const slots: { mark: NoteMark; line: string | null }[] = [];
  const move = weightMove(input);
  if (move === 'away') slots.push({ mark: 'attention', line: THUMOS_WEIGHT_AWAY_CHANGE });
  else if (move === 'holding') slots.push({ mark: 'watch', line: THUMOS_WEIGHT_HOLD_CHANGE });
  else if (move === 'one') slots.push({ mark: 'watch', line: THUMOS_WEIGHT_ONE_CHANGE });
  else if (move === 'towards') slots.push({ mark: 'good', line: null });

  const minutesLogged = input.workoutMinutes7 ?? 0;
  if (minutesLogged > 0 && input.strengthRecorded === false) slots.push({ mark: 'skip', line: THUMOS_STRENGTH_NOT_RECORDED });

  const resting = input.restingBpm;
  if (resting == null) slots.push({ mark: 'gap', line: null });
  else if (resting > BHF_RESTING_MAX_BPM) slots.push({ mark: 'attention', line: THUMOS_RESTING_HIGH });
  else if (resting < BHF_RESTING_MIN_BPM) slots.push({ mark: 'watch', line: THUMOS_RESTING_LOW });
  else slots.push({ mark: 'good', line: null });

  if (input.vo2 == null) slots.push({ mark: 'gap', line: null });
  else if (input.vo2Level === 'Developing') slots.push({ mark: 'watch', line: THUMOS_VO2_DEVELOPING });
  else if (input.vo2Level === 'Steady' || input.vo2Level === 'Strong') slots.push({ mark: 'good', line: null });
  else slots.push({ mark: 'skip', line: null });

  const sleep = input.sleepHours;
  if (sleep == null || !(sleep > 0)) slots.push({ mark: 'gap', line: THUMOS_SLEEP_MISSING });
  else if (sleep < NHS_ADULT_SLEEP_MIN_HOURS) slots.push({ mark: 'watch', line: THUMOS_SLEEP_SHORT });
  else if (sleep > NHS_ADULT_SLEEP_MAX_HOURS) slots.push({ mark: 'skip', line: null });
  else slots.push({ mark: 'good', line: null });

  if (input.proteinG == null) slots.push({ mark: 'gap', line: THUMOS_PROTEIN_MISSING });
  else if (input.proteinMet === true) slots.push({ mark: 'good', line: null });
  else if (input.proteinMet === false) slots.push({ mark: 'watch', line: THUMOS_PROTEIN_SHORT });
  else slots.push({ mark: 'skip', line: null });

  const stepsDaily = input.stepsDaily ?? (input.steps != null && input.steps > 0 ? input.steps : null);
  const stepsUnder = input.stepsLow === true || (input.stepsLow == null && stepsDaily != null && stepsDaily < stepResearchBand(null).low);
  if (stepsDaily == null) slots.push({ mark: 'gap', line: THUMOS_STEPS_MISSING });
  else if (stepsUnder) slots.push({ mark: 'watch', line: THUMOS_STEPS_LOW });
  else slots.push({ mark: 'good', line: null });

  const aim = input.workoutAim;
  if (!(minutesLogged > 0)) slots.push({ mark: 'gap', line: THUMOS_MINUTES_MISSING });
  else if (aim != null && aim > 0 && minutesLogged < aim) slots.push({ mark: 'watch', line: THUMOS_MINUTES_SHORT });
  else slots.push({ mark: 'good', line: null });

  const strengthKnown = input.strengthRecorded !== false && (input.strengthMinutes7 ?? 0) > 0;
  if (input.strengthRecorded !== false && wantsStrength(input.goal) && (input.strengthMinutes7 ?? 0) === 0 && minutesLogged > 0) {
    slots.push({ mark: 'watch', line: THUMOS_STRENGTH_FOR_AIM });
  } else if (input.goal === 'elite_runner' && (input.cardioMinutes7 ?? 0) === 0 && strengthKnown) {
    slots.push({ mark: 'watch', line: THUMOS_CARDIO_FOR_AIM });
  }

  if (input.bodyFatPct != null) {
    const fat = bodyFatRange(input.bodyFatPct, input.goalSex ?? null);
    if (fat.status === 'Above the healthy range') slots.push({ mark: 'watch', line: THUMOS_FAT_ABOVE });
    else if (fat.status === 'Under the healthy range') slots.push({ mark: 'watch', line: THUMOS_FAT_BELOW });
    else slots.push({ mark: 'good', line: null });
  }
  if (input.waistCm != null && input.waistCm > 0 && input.heightCm != null && input.heightCm > 0) {
    if (input.waistCm / input.heightCm >= WAIST_HEIGHT_HEALTHY) slots.push({ mark: 'watch', line: THUMOS_WAIST_ABOVE });
    else slots.push({ mark: 'good', line: null });
  }
  return slots;
}

function overallLine(input: ThumosReadingInput, slots: { mark: NoteMark }[]): string {
  const move = weightMove(input);
  const hasTarget = move !== 'none';
  const attention = slots.some((slot) => slot.mark === 'attention') || move === 'away';
  const watch = slots.some((slot) => slot.mark === 'watch') || move === 'holding' || move === 'one';
  const good = slots.some((slot) => slot.mark === 'good') || move === 'towards';
  if (attention) return hasTarget ? THUMOS_NEEDS_WORK_TARGET : THUMOS_NEEDS_WORK;
  if (watch) return hasTarget ? THUMOS_MIXED_TARGET : THUMOS_MIXED;
  if (good) return hasTarget ? THUMOS_LOOKING_GOOD_TARGET : THUMOS_LOOKING_GOOD;
  return THUMOS_NOTHING_TO_JUDGE;
}

/** Visible lines. Fewer than 7 stored days skips any verdict on the target. */
export function thumosAssessmentLines(input: ThumosReadingInput): string[] {
  if (input.storedDayCount != null && input.storedDayCount < THUMOS_SEVEN_DAYS) {
    return [THUMOS_NEEDS_SEVEN_DAYS, THUMOS_LOG_MORE_DAYS];
  }
  const slots = commentSlots(input);
  const changes = slots.flatMap((slot) => (slot.line ? [slot.line] : [])).slice(0, 3);
  const lines = [overallLine(input, slots), ...changes];
  if (trainsForReading(input)) lines.push(THUMOS_BMI_LINE);
  return lines;
}

const READING_KINDS = new Set([
  'weight_kg',
  'sleep_hours',
  'steps',
  'workout_minutes',
  'strength_minutes',
  'cardio_minutes',
  'resting_heart_rate',
  'vo2_max',
]);

export function countReadingDays(
  samples: readonly { kind: string; value: number; recordedOn: string }[],
  bodyDays: readonly string[] = [],
): number {
  const days = new Set<string>();
  for (const sample of samples) {
    if (!READING_KINDS.has(sample.kind) || !(sample.value > 0)) continue;
    const day = sample.recordedOn.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) days.add(day);
  }
  for (const day of bodyDays) {
    const clean = day.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) days.add(clean);
  }
  return days.size;
}

/** A short assessment from stored readings. A new reading can change the note the same day. */
export function thumosReadingComment(input: ThumosReadingInput): ThumosReadingView {
  if (!input.consentAi && !input.consentHealth) return fixed(THUMOS_BOTH_OFF_LINE);
  if (!input.consentAi) return fixed(THUMOS_OFF_LINE);
  if (!input.consentHealth) return fixed(THUMOS_HEALTH_OFF_LINE);

  const facts = factSentences(input);
  const trains = trainsForReading(input);
  const detail = thumosDetailLines(input);
  const early = input.storedDayCount != null && input.storedDayCount < THUMOS_SEVEN_DAYS;
  if (!early && facts.length === 0 && !trains) {
    return { sentences: [THUMOS_EMPTY_LINE], more: [...detail, THUMOS_LOCAL_LINE] };
  }
  const sentences = early
    ? [THUMOS_NEEDS_SEVEN_DAYS, THUMOS_LOG_MORE_DAYS]
    : thumosAssessmentLines(input);
  const used = new Set(sentences);
  const more = [
    ...facts.filter((line) => !used.has(line)),
    ...detail.filter((line) => !used.has(line) && (early ? line !== THUMOS_TOWARDS_TARGET && line !== THUMOS_AWAY_TARGET && line !== THUMOS_UNCLEAR_TARGET && line !== THUMOS_ONE_WEIGHT_TARGET : true)),
    THUMOS_LOCAL_LINE,
  ];
  return { sentences, more };
}

export type NoteFigures = {
  restingBpm: number | null;
  sleepHours: number | null;
  steps: number | null;
  stepsDaily: number | null;
  stepsLow: boolean;
  strengthMinutes7: number | null;
  strengthRecorded: boolean;
  cardioMinutes7: number | null;
  workoutMinutes7: number | null;
  workoutAim: number;
  proteinG: number | null;
  proteinMet: boolean | null;
  caloriesStored: boolean;
  vo2: number | null;
  vo2Level: 'Developing' | 'Steady' | 'Strong' | null;
  windowLabel: string;
};

function windowMean(samples: readonly { kind: string; value: number; recordedOn: string }[], kind: string, today: string, period: StatPeriod) {
  const window = rollingWindow(today, period);
  const points = healthSampleChart(samples, kind, today).filter((point) => point.day >= window.start && point.day <= window.end && point.value > 0);
  const total = points.reduce((sum, point) => sum + point.value, 0);
  return { days: points.length, total, mean: points.length ? total / points.length : null };
}

/**
 * The same window and the same selectors as Heart, Sleep, Steps, Your Fitness, and today's protein ring.
 * Weight itself stays on weightPointsFrom, which is the weight chart.
 */
export function figuresForNote(input: {
  samples: readonly { kind: string; value: number; recordedOn: string; source?: string }[];
  today: string;
  period?: StatPeriod;
  goalAge?: number | null;
  goalSex?: NutritionSex | null;
  scheduleWeekMinutes?: number | null;
  workoutBuckets?: WorkoutBucketMap | null;
  plannedSessions?: readonly PlannedSession[] | null;
  logs?: readonly FoodLog[];
  ownerId?: string;
  proteinTarget?: number | null;
}): NoteFigures {
  const period = input.period ?? '7';
  const window = rollingWindow(input.today, period);
  const prepared = withPlannedMinutes(input.samples, input.plannedSessions);
  const active = periodActiveMinutes({
    samples: prepared,
    today: input.today,
    start: window.start,
    end: window.end,
    overrides: input.workoutBuckets,
  });
  const resting = windowMean(input.samples, 'resting_heart_rate', input.today, period);
  const sleep = windowMean(input.samples, 'sleep_hours', input.today, period);
  const steps = windowMean(input.samples, 'steps', input.today, period);
  const stepsDaily = steps.days ? Math.round(steps.total / steps.days) : null;
  const stepsLow = stepsDaily != null && stepsDaily < stepResearchBand(input.goalAge).low;
  const vo2Points = healthSampleChart(input.samples, 'vo2_max', input.today).filter((point) => point.value > 0);
  const vo2 = vo2Points.at(-1)?.value ?? null;
  const band = vo2 != null ? publishedCardioBand(input.goalAge ?? null, input.goalSex ?? null) : null;
  const vo2Level = vo2 == null || band == null ? null : vo2 < band.low ? 'Developing' : vo2 < band.high ? 'Steady' : 'Strong';
  const meals = todayMealTotals(input.logs ?? [], input.today, input.ownerId ?? '');
  const loggedMeals = (input.logs ?? []).some((log) => log.eatenOn.slice(0, 10) === input.today && log.userId === (input.ownerId ?? ''));
  const ring = loggedMeals ? loggedProteinRing({ proteinG: meals.proteinG, proteinTarget: input.proteinTarget ?? null }) : null;
  const weekly = input.scheduleWeekMinutes != null && input.scheduleWeekMinutes > 0 ? input.scheduleWeekMinutes : CMO_MODERATE_MINUTES_WEEK;
  const mix = active.report;
  const strengthRecorded = !(active.minutes > 0 && mix.strength === 0 && mix.total === 0);
  return {
    restingBpm: resting.mean == null ? null : Math.round(resting.mean),
    sleepHours: sleep.mean == null ? null : Math.round(sleep.mean * 10) / 10,
    steps: steps.days ? Math.round(steps.total) : null,
    stepsDaily,
    stepsLow,
    strengthMinutes7: strengthRecorded ? mix.strength : null,
    strengthRecorded,
    cardioMinutes7: mix.cardio > 0 ? mix.cardio : null,
    workoutMinutes7: active.minutes > 0 ? active.minutes : null,
    workoutAim: scaledPeriodTarget(weekly, period),
    proteinG: loggedMeals ? meals.proteinG : null,
    proteinMet: ring == null ? null : ring.met,
    caloriesStored: loggedMeals && meals.kcal > 0,
    vo2,
    vo2Level,
    windowLabel: periodPhrase(period),
  };
}

export function sumKindSince(samples: readonly { kind: string; value: number; recordedOn: string }[], kind: string, today: string): number | null {
  const start = shiftDay(today, -6);
  const rows = samples.filter((row) => row.kind === kind && row.recordedOn.slice(0, 10) >= start && row.recordedOn.slice(0, 10) <= today);
  if (!rows.length) return null;
  return rows.reduce((total, row) => total + (row.value > 0 ? row.value : 0), 0);
}

export function latestKind(samples: readonly { kind: string; value: number; recordedOn: string }[], kind: string, today: string): number | null {
  const rows = samples
    .filter((row) => row.kind === kind && row.value > 0 && row.recordedOn.slice(0, 10) <= today)
    .sort((left, right) => left.recordedOn.localeCompare(right.recordedOn));
  return rows.at(-1)?.value ?? null;
}
