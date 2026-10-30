import { healthSampleChart } from '@/domain/chartSeries';
import { buildFitnessSnapshot, periodActiveMinutes, publishedCardioBand, vo2AthleticShortfall, vo2JudgementLine } from '@/domain/fitnessSnapshot';
import { stepResearchBand } from '@/domain/garminCharts';
import { bmiFrom, BHF_RESTING_MAX_BPM, BHF_RESTING_MIN_BPM, CMO_MODERATE_MINUTES_WEEK, NHS_ADULT_SLEEP_MAX_HOURS, NHS_ADULT_SLEEP_MIN_HOURS, NICE_BMI_HEALTHY_MAX } from '@/domain/guidance';
import { shiftDay } from '@/domain/healthInsights';
import {
  BODY_FAT_HIGH,
  GOAL_LABEL,
  loggedProteinRing,
  todayMealTotals,
  weightDirection,
  type BodyBuild,
  type FoodLog,
  type NutritionGoal,
  type NutritionSex,
  type WorkoutBucketMap,
} from '@/domain/nutrition';
import { withPlannedMinutes, type PlannedSession } from '@/domain/plannedSession';
import { SCALE_BIA_LINE } from '@/domain/scaleReading';
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

export const THUMOS_BMI_MUSCLE =
  'On paper your BMI is high, but looking at your stats your weight is likely largely due to muscle, and BMI cannot tell muscle from fat.';

export const THUMOS_BMI_AND_FAT =
  'On paper your BMI is high, and body fat is also above the band this app uses, so the extra weight is not only muscle. BMI cannot tell muscle from fat. This is not a diagnosis.';

export const THUMOS_BODY_FAT_HIGH =
  'Body fat is above the band this app uses. Lifting does not cancel that. This is not a diagnosis.';

export const THUMOS_BIA_PROTEIN_SHORT =
  'Protein logged today is short of the target you set. Add a protein food to a meal you already eat. Do not skip drinks to chase a lower body-fat reading.';

export const THUMOS_BIA_PROTEIN_MET =
  'Protein logged today meets the target you set. Keep that habit, and judge body fat from the trend rather than one reading.';

export const THUMOS_BIA_LOG_MEALS =
  'No protein is stored for today. Logging a meal sets food beside this body-fat trend. Do not skip drinks to chase a lower reading.';

export const THUMOS_BIA_KEEP_MEALS =
  'Keep the meals you already log, and judge body fat from the trend. Do not skip drinks to chase a lower reading.';

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

export const THUMOS_HEADING_TARGET = 'Looking at the readings stored here, you seem to be heading in the right direction for your chosen target.';
export const THUMOS_HEADING_AIM = 'Looking at the readings stored here, you seem to be heading in the right direction for the aim you saved.';
export const THUMOS_MIXED_VERDICT = 'Looking at the readings stored here, the picture is mixed.';
export const THUMOS_NOT_YET = 'Looking at the readings stored here, it is not yet clear that you are heading in the right direction.';
export const THUMOS_CARDIO_FOR_VO2 = 'You could introduce another cardio session in the week to improve your VO2 max.';
export const THUMOS_STRENGTH_NOT_RECORDED = 'Strength is not recorded for this period, so this note does not judge it.';
export const THUMOS_STRENGTH_SESSION = 'A strength session would match the aim you saved.';
export const THUMOS_MORE_SLEEP = 'Aim for more sleep. The nights stored here are under the 7 to 9 hour range this app already uses.';
export const THUMOS_MORE_STEPS = 'More steps on the days you already log would lift the average toward the research range this screen uses.';
export const THUMOS_PROTEIN_SHORT = 'Protein logged today is short of the target you set. Another protein meal would close the gap.';
export const THUMOS_ANOTHER_SESSION = 'Another session in this period would bring the recorded workout minutes up toward what Your Fitness uses.';
export const THUMOS_RESTING_HIGH = 'Resting heart rate is over the usual 60 to 100 bpm range for this period. Another reading on a quiet day would show whether it holds.';
export const THUMOS_RESTING_LOW = 'Resting heart rate is under 60 bpm for this period. One reading is not a pattern.';
export const THUMOS_FAT_HIGHER = 'Body fat is higher than the earlier reading. No standard range is used.';
export const THUMOS_FAT_LOWER = 'Body fat is lower than the earlier reading. No standard range is used.';
export const THUMOS_GOOD_LINE = 'What looks good: the readings that sit inside the ranges this app already uses.';

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
  goalAge?: number | null;
  goalSex?: NutritionSex | null;
  stepsDaily?: number | null;
  stepsLow?: boolean | null;
  strengthRecorded?: boolean;
  workoutAim?: number | null;
  proteinMet?: boolean | null;
  vo2Level?: 'Developing' | 'Steady' | 'Strong' | null;
  windowLabel?: string;
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
  const direction = weightDirection([earlier, latest]);
  if (direction === 'down') return `Weight is ${shown(latest.kg)} kg, down from ${shown(earlier.kg)} kg.`;
  if (direction === 'up') return `Weight is ${shown(latest.kg)} kg, up from ${shown(earlier.kg)} kg.`;
  return `Weight is ${shown(latest.kg)} kg, near the earlier reading.`;
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

function sleepSentence(hours: number, label = 'the last 7 days'): string {
  return `Sleep for ${label} averages ${shown(hours)} hours.`;
}

function stepsSentence(count: number, label = 'the last 7 days'): string {
  return `Steps for ${label} are ${minutes(count)}.`;
}

function proteinSentence(grams: number): string {
  return `Protein logged today is ${minutes(grams)} g.`;
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
  if (input.targetKg != null && input.targetKg > 0) lines.push(`The target chosen is ${shown(input.targetKg)} kg.`);
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
  else {
    if (input.bodyFatEarlier != null) {
      lines.push(directionLine(input.bodyFatPct, input.bodyFatEarlier, THUMOS_BODY_FAT_DOWN, THUMOS_BODY_FAT_UP, THUMOS_BODY_FAT_SAME));
    }
    lines.push(SCALE_BIA_LINE);
    if (bodyFatIsHigh(input)) lines.push(THUMOS_BODY_FAT_HIGH);
    const food = bodyFatFoodLine(input);
    if (food) lines.push(food);
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
  if (strength > 0 && cardio > 0) lines.push(mixSentence(strength, cardio));
  else if (cardio > 0) lines.push(cardioSentence(cardio));
  if (input.vo2 == null) lines.push(THUMOS_NO_VO2);
  if (input.restingBpm == null) lines.push(THUMOS_NO_RESTING);
  const label = input.windowLabel?.trim() || 'the last 7 days';
  if (input.sleepHours != null && input.sleepHours > 0) lines.push(sleepSentence(input.sleepHours, label));
  else lines.push(THUMOS_NO_SLEEP);
  if (input.steps != null && input.steps > 0) lines.push(stepsSentence(input.steps, label));
  else lines.push(THUMOS_NO_STEPS);
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

function towardsTarget(input: ThumosReadingInput): string | null {
  if (input.targetKg == null || !(input.targetKg > 0)) return null;
  const ordered = orderedWeights(input);
  const latest = ordered.at(-1);
  const earlier = ordered[0];
  if (!latest || !earlier) return THUMOS_ONE_WEIGHT_TARGET;
  if (earlier.day === latest.day) return THUMOS_ONE_WEIGHT_TARGET;
  const movingDown = latest.kg < earlier.kg;
  const movingUp = latest.kg > earlier.kg;
  if (!movingDown && !movingUp) return THUMOS_UNCLEAR_TARGET;
  const wantsLower = input.targetKg < earlier.kg;
  const wantsHigher = input.targetKg > earlier.kg;
  if ((wantsLower && movingDown) || (wantsHigher && movingUp)) return THUMOS_TOWARDS_TARGET;
  if ((wantsLower && movingUp) || (wantsHigher && movingDown)) return THUMOS_AWAY_TARGET;
  return THUMOS_UNCLEAR_TARGET;
}

type WeightMove = 'towards' | 'away' | 'holding' | 'one' | 'none';

function weightMove(input: ThumosReadingInput): WeightMove {
  if (input.targetKg == null || !(input.targetKg > 0)) return 'none';
  const ordered = orderedWeights(input);
  const latest = ordered.at(-1);
  const earlier = ordered[0];
  if (!latest || !earlier || earlier.day === latest.day) return ordered.length ? 'one' : 'none';
  const direction = weightDirection(ordered);
  if (direction === 'steady' || direction === 'unknown') return 'holding';
  const wantsLower = input.targetKg < earlier.kg;
  const wantsHigher = input.targetKg > earlier.kg;
  if ((wantsLower && direction === 'down') || (wantsHigher && direction === 'up')) return 'towards';
  if ((wantsLower && direction === 'up') || (wantsHigher && direction === 'down')) return 'away';
  return 'holding';
}

function strengthLed(goal: NutritionGoal | null | undefined): boolean {
  if (goal == null) return false;
  return goal === 'lose_fat_build_muscle' || goal === 'body_builder' || goal.includes('boxer');
}

function fatCut(sex: NutritionSex | null | undefined): number {
  if (sex === 'female') return BODY_FAT_HIGH.female;
  if (sex === 'male') return BODY_FAT_HIGH.male;
  return BODY_FAT_HIGH.unset;
}

function bodyFatIsHigh(input: ThumosReadingInput): boolean {
  return input.bodyFatPct != null && input.bodyFatPct >= fatCut(input.goalSex);
}

function strengthVerified(input: ThumosReadingInput): boolean {
  return input.strengthRecorded === true || (input.strengthMinutes7 ?? 0) > 0;
}

function bmiEvidenceLine(input: ThumosReadingInput): string | null {
  const weight = latestWeight(input);
  const bmi = weight != null && input.heightCm != null ? bmiFrom(weight, input.heightCm) : null;
  const high = bmi != null && bmi > NICE_BMI_HEALTHY_MAX;
  const muscleEvidence = input.build === 'muscular' && strengthVerified(input) && input.bodyFatPct != null;
  if (high && muscleEvidence && bodyFatIsHigh(input)) return THUMOS_BMI_AND_FAT;
  if (high && muscleEvidence) return THUMOS_BMI_MUSCLE;
  if (trainsForReading(input)) return THUMOS_BMI_LINE;
  return null;
}

function bodyFatFoodLine(input: ThumosReadingInput): string | null {
  if (input.bodyFatPct == null) return null;
  if (input.proteinMet === false) return THUMOS_BIA_PROTEIN_SHORT;
  if (input.proteinMet === true) return THUMOS_BIA_PROTEIN_MET;
  if (input.proteinG != null && input.proteinG > 0) return THUMOS_BIA_KEEP_MEALS;
  return THUMOS_BIA_LOG_MEALS;
}

function suggestions(input: ThumosReadingInput): string[] {
  const lines: string[] = [];
  const move = weightMove(input);
  if (move === 'away') lines.push('Weight has moved away from the target you chose. Keep logging it on the days you already weigh.');
  const vo2Line = vo2JudgementLine({
    vo2: input.vo2 ?? null,
    age: input.goalAge ?? null,
    sex: input.goalSex ?? null,
    goal: input.goal ?? null,
  });
  if (vo2Line) lines.push(vo2Line);
  else if (input.vo2Level === 'Developing') lines.push(THUMOS_CARDIO_FOR_VO2);
  const minutesLogged = input.workoutMinutes7 ?? 0;
  if (input.strengthRecorded === false && (minutesLogged > 0 || strengthLed(input.goal))) {
    lines.push(strengthLed(input.goal) ? `${THUMOS_STRENGTH_NOT_RECORDED} ${THUMOS_STRENGTH_SESSION}` : THUMOS_STRENGTH_NOT_RECORDED);
  }
  if (input.sleepHours != null && input.sleepHours > 0 && input.sleepHours < NHS_ADULT_SLEEP_MIN_HOURS) lines.push(THUMOS_MORE_SLEEP);
  const daily = input.stepsDaily ?? (input.steps != null && input.steps > 0 ? input.steps : null);
  const stepsUnder = input.stepsLow === true || (input.stepsLow == null && daily != null && daily < stepResearchBand(null).low);
  if (stepsUnder) lines.push(THUMOS_MORE_STEPS);
  if (input.proteinMet === false) lines.push(THUMOS_PROTEIN_SHORT);
  const aim = input.workoutAim;
  if (aim != null && aim > 0 && minutesLogged > 0 && minutesLogged < aim && !lines.includes(THUMOS_CARDIO_FOR_VO2)) lines.push(THUMOS_ANOTHER_SESSION);
  if (input.bodyFatEarlier != null && input.bodyFatPct != null && input.bodyFatPct - input.bodyFatEarlier >= 0.3) lines.push(THUMOS_FAT_HIGHER);
  if (input.restingBpm != null && input.restingBpm > BHF_RESTING_MAX_BPM) lines.push(THUMOS_RESTING_HIGH);
  if (input.restingBpm != null && input.restingBpm < BHF_RESTING_MIN_BPM) lines.push(THUMOS_RESTING_LOW);
  if (lines.length < 2) lines.push(THUMOS_FOCUS_KEEP);
  return lines.slice(0, 4);
}

function goodLine(input: ThumosReadingInput): string {
  const bits: string[] = [];
  if (input.restingBpm != null && input.restingBpm >= BHF_RESTING_MIN_BPM && input.restingBpm <= BHF_RESTING_MAX_BPM) {
    bits.push('resting heart rate is inside 60 to 100 bpm');
  }
  if (input.sleepHours != null && input.sleepHours >= NHS_ADULT_SLEEP_MIN_HOURS && input.sleepHours <= NHS_ADULT_SLEEP_MAX_HOURS) {
    bits.push('sleep is inside 7 to 9 hours');
  }
  const belowSport = vo2AthleticShortfall({
    vo2: input.vo2 ?? null,
    sex: input.goalSex ?? null,
    goal: input.goal ?? null,
  });
  if ((input.vo2Level === 'Steady' || input.vo2Level === 'Strong') && !belowSport) bits.push(`VO2 max is ${input.vo2Level}`);
  if (input.proteinMet === true) bits.push('protein today meets the target you set');
  if (weightMove(input) === 'towards') bits.push('weight is moving toward the target you chose');
  if (!bits.length) return THUMOS_GOOD_LINE;
  const sentence = bits[0] ? bits[0].charAt(0).toUpperCase() + bits[0].slice(1) : '';
  return `What looks good: ${sentence}${bits.length > 1 ? `, and ${bits.slice(1).join(', ')}` : ''}.`;
}

function verdictLine(input: ThumosReadingInput): string {
  const move = weightMove(input);
  const hasTarget = move !== 'none';
  const watch = suggestions(input).some((line) => line !== THUMOS_FOCUS_KEEP && line !== THUMOS_STRENGTH_NOT_RECORDED);
  if (move === 'away' || (input.restingBpm != null && input.restingBpm > BHF_RESTING_MAX_BPM)) return THUMOS_NOT_YET;
  if (move === 'towards' && !watch) return hasTarget ? THUMOS_HEADING_TARGET : THUMOS_HEADING_AIM;
  if (move === 'towards' || (input.goal && !watch)) return hasTarget ? THUMOS_HEADING_TARGET : input.goal ? THUMOS_HEADING_AIM : THUMOS_MIXED_VERDICT;
  if (watch) return THUMOS_MIXED_VERDICT;
  return input.goal ? THUMOS_HEADING_AIM : THUMOS_NOT_YET;
}

/** Visible lines. Fewer than 7 stored days skips any verdict on the target. */
export function thumosAssessmentLines(input: ThumosReadingInput): string[] {
  if (input.storedDayCount != null && input.storedDayCount < THUMOS_SEVEN_DAYS) {
    return [THUMOS_NEEDS_SEVEN_DAYS, THUMOS_LOG_MORE_DAYS];
  }
  const lines = [verdictLine(input), ...suggestions(input), goodLine(input)];
  const bmiLine = bmiEvidenceLine(input);
  if (bmiLine) lines.push(bmiLine);
  if (input.bodyFatPct != null) {
    lines.push(SCALE_BIA_LINE);
    if (bodyFatIsHigh(input) && bmiLine !== THUMOS_BMI_AND_FAT) lines.push(THUMOS_BODY_FAT_HIGH);
    const food = bodyFatFoodLine(input);
    if (food) lines.push(food);
  }
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

function windowMean(samples: readonly { kind: string; value: number; recordedOn: string }[], kind: string, today: string, period: StatPeriod) {
  const window = rollingWindow(today, period);
  const points = healthSampleChart(samples, kind, today).filter((point) => point.day >= window.start && point.day <= window.end && point.value > 0);
  const total = points.reduce((sum, point) => sum + point.value, 0);
  return { days: points.length, total, mean: points.length ? total / points.length : null };
}

function latestChartVo2(metrics: readonly { calendarDate: string; vo2Max: number | null }[]): { day: string; value: number } | null {
  let day = '';
  let value: number | null = null;
  for (const row of metrics) {
    if (row.vo2Max == null || !(row.vo2Max > 0)) continue;
    if (row.calendarDate >= day) {
      day = row.calendarDate;
      value = Math.round(row.vo2Max * 10) / 10;
    }
  }
  return value == null || !/^\d{4}-\d{2}-\d{2}$/.test(day) ? null : { day, value };
}

function latestMergedVo2(samples: readonly { kind: string; value: number; recordedOn: string }[]): { day: string; value: number } | null {
  const byDay = new Map<string, number>();
  for (const sample of samples) {
    if (sample.kind !== 'vo2_max' || !(sample.value > 0)) continue;
    const day = sample.recordedOn.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    byDay.set(day, Math.round(sample.value * 10) / 10);
  }
  const last = [...byDay.entries()].sort((left, right) => left[0].localeCompare(right[0])).at(-1);
  return last ? { day: last[0], value: last[1] } : null;
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

/** Same window as Your Fitness, Heart, Sleep, and the steps tile. Cardio mix minutes are not used. */
export function figuresForNote(input: {
  samples: readonly { kind: string; value: number; recordedOn: string; source?: string }[];
  today: string;
  period?: StatPeriod;
  goalAge?: number | null;
  goalSex?: NutritionSex | null;
  goal?: NutritionGoal | null;
  build?: BodyBuild | null;
  scheduleWeekMinutes?: number | null;
  workoutBuckets?: WorkoutBucketMap | null;
  plannedSessions?: readonly PlannedSession[] | null;
  logs?: readonly FoodLog[];
  ownerId?: string;
  proteinTarget?: number | null;
  userMetrics?: readonly { calendarDate: string; vo2Max: number | null }[];
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
  const fitness = buildFitnessSnapshot({
    today: input.today,
    goal: input.goal ?? null,
    goalAge: input.goalAge ?? null,
    goalSex: input.goalSex ?? null,
    scheduleWeekMinutes: input.scheduleWeekMinutes ?? null,
    health: prepared,
    permission: 'unknown',
    build: input.build ?? null,
    workoutBuckets: input.workoutBuckets ?? null,
    period,
  });
  const restingMatch = fitness.resting?.reading?.match(/[\d.]+/);
  const sleep = windowMean(input.samples, 'sleep_hours', input.today, period);
  const steps = windowMean(input.samples, 'steps', input.today, period);
  const stepsDaily = steps.days ? Math.round(steps.total / steps.days) : null;
  const chart = latestChartVo2(input.userMetrics ?? []);
  const merged = latestMergedVo2(prepared);
  const vo2 = chart && (!merged || chart.day >= merged.day) ? chart.value : merged?.value ?? null;
  const band = vo2 != null ? publishedCardioBand(input.goalAge ?? null, input.goalSex ?? null) : null;
  const meals = todayMealTotals(input.logs ?? [], input.today, input.ownerId ?? '');
  const logged = (input.logs ?? []).some((log) => log.eatenOn.slice(0, 10) === input.today && log.userId === (input.ownerId ?? ''));
  const ring = logged ? loggedProteinRing({ proteinG: meals.proteinG, proteinTarget: input.proteinTarget ?? null }) : null;
  const weekly = input.scheduleWeekMinutes != null && input.scheduleWeekMinutes > 0 ? input.scheduleWeekMinutes : CMO_MODERATE_MINUTES_WEEK;
  const minutes = fitness.minutes?.centre != null ? Number(fitness.minutes.centre) : active.minutes;
  return {
    restingBpm: restingMatch ? Math.round(Number(restingMatch[0])) : null,
    sleepHours: sleep.mean == null ? null : Math.round(sleep.mean * 10) / 10,
    steps: steps.days ? Math.round(steps.total) : null,
    stepsDaily,
    stepsLow: stepsDaily != null && stepsDaily < stepResearchBand(input.goalAge).low,
    strengthMinutes7: active.report.strength > 0 ? active.report.strength : null,
    strengthRecorded: active.report.strength > 0,
    cardioMinutes7: null,
    workoutMinutes7: minutes > 0 ? minutes : null,
    workoutAim: scaledPeriodTarget(weekly, period),
    proteinG: logged ? meals.proteinG : null,
    proteinMet: ring == null ? null : ring.met,
    caloriesStored: logged && meals.kcal > 0,
    vo2,
    vo2Level: vo2 == null || band == null ? null : vo2 < band.low ? 'Developing' : vo2 < band.high ? 'Steady' : 'Strong',
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
