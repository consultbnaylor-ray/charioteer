import {
  COMPETITION_NOTE,
  GOAL_LABEL,
  LOW_BMI_NOTE,
  MIDDLEWEIGHT_LIMIT_KG,
  isTrainingGoal,
  assessWeight,
  bmiValue,
  compositionForAssessment,
  dayItems,
  kcalFloor,
  lossBlocked,
  mifflinBmr,
  sumItems,
  weightPointsFrom,
  type BodyBuild,
  type BuilderPhase,
  type FoodLog,
  type NutritionGoal,
  type NutritionSex,
} from './nutrition.ts';
import { buildFitnessSnapshot, fitnessFocusLines, type FitnessSnapshotInput } from './fitnessSnapshot.ts';
import { goalFocusLine } from './goalLed.ts';
import { firstSafetyHit, SELF_HARM_NOTICE, WITHDRAWAL_NOTICE, type SafetyHit } from './safety.ts';
import { soberElapsed } from './sober.ts';

export const PLAN_DOCTOR = 'Check with your doctor before big changes.';

export const PLAN_DISCLAIMER =
  'This plan uses your own figures. It is not a diagnosis and it is not medical advice. Check with your doctor before big changes.';

export type PlanAction = { id: string; text: string; done: boolean };

export type HealthPlan = {
  focus: PlanAction[];
  nutrition: { targets: string; habits: PlanAction[]; swaps: PlanAction[] };
  fitness: { intro: string; sessions: PlanAction[] };
  wellbeing: { habits: PlanAction[] };
  limits: string;
  disclaimer: string;
  updatedAt: string;
};

export type PlanInput = {
  now: Date;
  salt: string;
  displayName: string;
  stage: string;
  sobrietyStartedAt: string | null;
  heightCm: number | null;
  visionStatement: string;
  visionCaptions: string[];
  interestLabels: string[];
  reasons: string[];
  limits: string;
  /** Usual weekly units. For someone who has stopped, this is what they used to drink, not a current habit. */
  weeklyUnits?: number | null;
  goal: NutritionGoal | null;
  goalSex: NutritionSex | null;
  goalAge: number | null;
  build: BodyBuild | null;
  kcalTarget: number | null;
  proteinTarget: number | null;
  carbTarget?: number | null;
  fatTarget?: number | null;
  goalPhase?: BuilderPhase | null;
  weightClassKg?: number | null;
  hideCalories: boolean;
  foodLogs: readonly FoodLog[];
  checkIns: readonly { mood: number; craving: number; sleepHours: number; note: string; createdAt: string }[];
  health: readonly { kind: string; value: number; recordedOn: string }[];
  bodyFatPct: number | null;
  leanMassKg: number | null;
  waistCm: number | null;
  doneTexts: string[];
  /** Usual gym week from You. Absent or null when they have not set one. */
  schedule?: TrainingSchedule | null;
  /**
   * Short fitness sentence for the model.
   * Undefined computes it from health. Null withholds it, for example when health consent is off.
   */
  fitnessSnapshot?: string | null;
};

type Level = 'starting' | 'some' | 'active';

const WEEK_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Logged workouts over the last four weeks, or the week the person stated on You. The plan maintains this, or eases off only for pain, illness, injury, or poor recovery. */
export type TrainingBaseline = {
  sessionsPerWeek: number;
  typicalMinutes: number;
  trainDays: string[];
  restDays: string[];
  summary: string;
  dayCount: number;
  /** Days for an easy walk, not a gym session and not a missed one. */
  walkDays?: string[];
  /** Minutes for each training day. A longer day can sit above typicalMinutes. */
  dayMinutes?: Record<string, number>;
  source?: 'logged' | 'stated';
  /** The person's own note, when they wrote one on You. */
  note?: string;
};

/** Usual gym week saved from You. Days are weekday names, Monday first. */
export type TrainingSchedule = {
  days: string[];
  typicalMinutes: number;
  longerDay: string | null;
  longerMinutes: number | null;
  walkDay: string | null;
  note: string;
};

type Derived = {
  input: PlanInput;
  firstName: string;
  soberDays: number | null;
  soberPath: boolean;
  cutting: boolean;
  level: Level;
  steps: number | null;
  workoutMinutes: number | null;
  sleepHours: number | null;
  moodTrend: 'lower' | 'steady' | 'higher' | 'none';
  cravingTrend: 'higher' | 'steady' | 'lower' | 'none';
  weightTrend: 'down' | 'up' | 'steady' | 'none';
  recentKcal: number | null;
  recentProtein: number | null;
  assessment: string;
  underweight: boolean;
  blockedLoss: boolean;
  floorKcal: number | null;
  belowFloor: boolean;
  hiking: boolean;
  gym: boolean;
  reason: string | null;
  vision: string | null;
  injury: boolean;
  /** Pain, illness, injury, or poor recovery. The week may ease off only then. */
  easeOff: boolean;
  baseline: TrainingBaseline | null;
  safety: SafetyHit;
  done: string[];
};

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function hash(salt: string, key: string): number {
  let h = 2166136261;
  const s = `${salt}:${key}`;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function pick<T>(salt: string, key: string, items: readonly T[]): T {
  return items[hash(salt, key) % items.length] as T;
}

function unused(items: string[], done: string[]): string[] {
  const finished = new Set(done.map((item) => item.toLowerCase()));
  const left = items.filter((item) => !finished.has(item.toLowerCase()));
  return left.length ? left : items;
}

function take(salt: string, key: string, items: string[], count: number, done: string[]): string[] {
  const pool = unused(items, done);
  const start = hash(salt, key) % pool.length;
  const chosen: string[] = [];
  for (let i = 0; i < pool.length && chosen.length < count; i += 1) {
    const text = pool[(start + i) % pool.length] as string;
    if (!chosen.includes(text)) chosen.push(text);
  }
  return chosen;
}

function actions(prefix: string, texts: string[]): PlanAction[] {
  return texts.map((text, index) => ({ id: `${prefix}-${index + 1}`, text: clip(text, 160), done: false }));
}

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function shift(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(year ?? 2026, (month ?? 1) - 1, date ?? 1);
  next.setDate(next.getDate() + delta);
  return isoDay(next);
}

function average(values: number[]): number | null {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return null;
  return Math.round((clean.reduce((sum, value) => sum + value, 0) / clean.length) * 10) / 10;
}

function trend(recent: number | null, earlier: number | null, margin: number): 'lower' | 'steady' | 'higher' | 'none' {
  if (recent == null || earlier == null) return 'none';
  if (recent <= earlier - margin) return 'lower';
  if (recent >= earlier + margin) return 'higher';
  return 'steady';
}

function derive(input: PlanInput): Derived {
  const today = isoDay(input.now);
  const days = Array.from({ length: 7 }, (_, index) => shift(today, -index));
  const logged = days.flatMap((day) => {
    const totals = sumItems(dayItems(input.foodLogs, day));
    return totals.count ? [totals] : [];
  });
  const weights = weightPointsFrom(input.health);
  const latestWeight = weights.at(-1)?.kg ?? null;
  const earlierWeight = weights.length > 1 ? weights[weights.length - 2]?.kg ?? null : null;
  const composition = compositionForAssessment([{
    id: 'latest',
    recordedOn: today,
    bodyFatPct: input.bodyFatPct,
    leanMassKg: input.leanMassKg,
    waistCm: input.waistCm,
    source: 'other',
    createdAt: input.now.toISOString(),
  }]);
  const assessment = assessWeight({
    bodyFatPct: composition.bodyFatPct,
    waistCm: composition.waistCm,
    weightKg: latestWeight,
    heightCm: input.heightCm,
    build: input.build,
    sex: input.goalSex,
  });
  const bmr = latestWeight != null && input.heightCm != null && input.goalAge != null
    ? mifflinBmr({ weightKg: latestWeight, heightCm: input.heightCm, age: input.goalAge, sex: input.goalSex })
    : null;
  const floorKcal = bmr != null ? kcalFloor(bmr, input.goalSex) : (input.goalSex === 'female' ? 1200 : 1500);
  const bmi = latestWeight != null && input.heightCm != null ? bmiValue(latestWeight, input.heightCm) : null;
  const underweight = assessment.underweight || (bmi != null && bmi < 18.5 && assessment.basis !== 'body_fat' && assessment.basis !== 'waist');
  const steps = average(input.health.filter((row) => row.kind === 'steps' && days.includes(row.recordedOn)).map((row) => row.value));
  const workoutMinutes = input.health
    .filter((row) => row.kind === 'workout_minutes' && days.includes(row.recordedOn))
    .reduce((sum, row) => sum + row.value, 0);
  const sleepFromHealth = average(input.health.filter((row) => row.kind === 'sleep_hours' && days.includes(row.recordedOn)).map((row) => row.value));
  const recentIns = input.checkIns.slice(0, 3);
  const olderIns = input.checkIns.slice(3, 6);
  const interests = input.interestLabels.join(' ').toLowerCase();
  const notes = input.checkIns.slice(0, 8).map((row) => row.note);
  const safety = firstSafetyHit([input.limits, ...input.reasons, ...notes, input.visionStatement]);
  const soberDays = input.sobrietyStartedAt ? soberElapsed(new Date(input.sobrietyStartedAt), input.now).days : null;
  const reason = input.reasons.map((item) => clip(item, 80)).find((item) => item && !firstSafetyHit([item]).selfHarm && !firstSafetyHit([item]).withdrawal) ?? null;
  const vision = clip(input.visionStatement || input.visionCaptions[0] || '', 80);
  return {
    input,
    firstName: input.displayName.split(' ')[0]?.replace(/[^\p{L}’-]/gu, '') || '',
    soberDays,
    soberPath: input.stage === 'stopped' || input.stage === 'trying_to_stop' || (soberDays != null && soberDays > 0),
    cutting: input.stage === 'cutting_down',
    level: workoutMinutes >= 150 || (steps != null && steps >= 8000) ? 'active' : workoutMinutes >= 40 || (steps != null && steps >= 4000) ? 'some' : 'starting',
    steps,
    workoutMinutes: workoutMinutes > 0 ? Math.round(workoutMinutes) : null,
    sleepHours: sleepFromHealth ?? average(recentIns.map((row) => row.sleepHours).filter((value) => value > 0)),
    moodTrend: trend(average(recentIns.map((row) => row.mood)), average(olderIns.map((row) => row.mood)), 0.6) === 'higher'
      ? 'higher'
      : trend(average(recentIns.map((row) => row.mood)), average(olderIns.map((row) => row.mood)), 0.6),
    cravingTrend: trend(average(recentIns.map((row) => row.craving)), average(olderIns.map((row) => row.craving)), 0.6) === 'lower'
      ? 'lower'
      : trend(average(recentIns.map((row) => row.craving)), average(olderIns.map((row) => row.craving)), 0.6) === 'higher'
        ? 'higher'
        : recentIns.length ? 'steady' : 'none',
    weightTrend: latestWeight != null && earlierWeight != null
      ? latestWeight < earlierWeight - 0.2 ? 'down' : latestWeight > earlierWeight + 0.2 ? 'up' : 'steady'
      : 'none',
    recentKcal: average(logged.map((row) => row.kcal)),
    recentProtein: average(logged.map((row) => row.proteinG)),
    assessment: assessment.plain,
    underweight,
    blockedLoss: lossBlocked({
      goal: input.goal,
      weightKg: latestWeight,
      heightCm: input.heightCm,
      phase: input.goalPhase ?? null,
    }) || underweight,
    floorKcal,
    belowFloor: input.kcalTarget != null && input.kcalTarget < floorKcal,
    hiking: /hik|walk|outdoor/.test(interests),
    gym: /gym|weight|lift|strength/.test(interests),
    reason,
    vision: vision || null,
    injury: /injur|pain|surgery|pregnant|condition|asthma|heart|doctor|gp\b/i.test(input.limits),
    easeOff: easesOff(input),
    baseline: planBaseline(input),
    safety,
    done: input.doneTexts.map((item) => item.trim()).filter(Boolean).slice(0, 12),
  };
}

function targetLine(facts: Derived): string {
  const goal = facts.input.goal ? GOAL_LABEL[facts.input.goal] : null;
  if (facts.blockedLoss || facts.underweight) {
    return `The aim is enough food, not a smaller intake. ${LOW_BMI_NOTE}`;
  }
  if (facts.belowFloor && facts.floorKcal != null) {
    return `The saved calorie target sits under the safety floor of ${facts.floorKcal.toLocaleString('en-GB')} kcal. This plan uses that floor. ${PLAN_DOCTOR}`;
  }
  const parts: string[] = [];
  if (goal) parts.push(goal);
  if (!facts.input.hideCalories && facts.input.kcalTarget != null) {
    parts.push(`${facts.input.kcalTarget.toLocaleString('en-GB')} kcal`);
  }
  if (facts.input.proteinTarget != null) parts.push(`${facts.input.proteinTarget} g protein`);
  if (facts.input.carbTarget != null) parts.push(`${facts.input.carbTarget} g carbohydrate`);
  if (facts.input.fatTarget != null) parts.push(`${facts.input.fatTarget} g fat`);
  if (facts.input.goal === 'body_builder') {
    parts.push(facts.input.goalPhase === 'cut' ? 'Cut phase, kept modest' : 'Surplus / lean bulk');
  }
  if (facts.input.goal === 'elite_heavy_boxer') {
    parts.push('Size and power, with food around training');
  }
  if (facts.input.goal === 'elite_middle_boxer') {
    const limit = facts.input.weightClassKg ?? MIDDLEWEIGHT_LIMIT_KG;
    const typed = facts.input.weightClassKg != null ? '' : ' until you type your own';
    parts.push(`Middleweight limit ${limit} kg${typed} is a note for a coach and a doctor`);
  }
  if (facts.recentKcal != null && !facts.input.hideCalories) {
    parts.push(`recent days averaged ${Math.round(facts.recentKcal).toLocaleString('en-GB')} kcal`);
  }
  if (facts.recentProtein != null) parts.push(`about ${Math.round(facts.recentProtein)} g protein`);
  if (!parts.length) return 'No calorie or protein target is saved yet. Pick one on Nutrition, and keep meals regular until then.';
  return clip(parts.join(' · '), 220);
}

function nutritionHabits(facts: Derived): string[] {
  const goal = facts.input.goal;
  const banks: Record<string, string[]> = {
    lose_weight: [
      'Put protein on the plate before anything else at the meal you rush.',
      'Fill half the dinner plate with vegetables you already buy.',
      'Decide the evening snack in the afternoon, so the cupboard is not the plan.',
      'Eat the meal sitting down, and leave the second helping until you are still hungry.',
    ],
    lose_fat_build_muscle: [
      'Include a protein food at breakfast, lunch, and dinner.',
      'Eat a proper meal after the session, not a bar in the car.',
      'Keep yoghurt or eggs in the house for the meal you usually skip.',
      'Add vegetables to the meal you already cook, rather than a new recipe.',
    ],
    maintain: [
      'Keep three meals at roughly the same times as this week.',
      'Put protein on the lunch you already eat.',
      'Swap the second biscuit for fruit you like.',
      'Drink water with the meal, then decide if you want more food.',
    ],
    increase: [
      'Add one snack you already like, beside a meal, not instead of it.',
      'Make that snack include protein, such as yoghurt, cheese, or nuts.',
      'Do not skip breakfast on the busy morning.',
      'Serve a slightly larger portion of the meal you already cook.',
    ],
    elite_runner: [
      'Eat a carbohydrate food you already like in the hour before the longer session.',
      'Eat a meal with protein and carbohydrate in the hour after training.',
      'Keep the easy day easy, and do not add a second hard session.',
      'Drink water with the meal. Sparkling water counts.',
    ],
    body_builder: facts.input.goalPhase === 'cut'
      ? [
        'Keep three meals. A cut on this screen is a slightly smaller portion, not a skipped meal.',
        'Put protein on each of those meals.',
        'Eat after the lifting session.',
        'Log body fat and lean mass on Nutrition when you have a reading. The scales can stay still.',
      ]
      : [
        'Add a little to the meal you already cook, on top of the meals you already eat.',
        'Put protein on breakfast, lunch, and dinner.',
        'Eat a proper meal after the lifting session.',
        'Log body fat and lean mass on Nutrition when you have a reading.',
      ],
    elite_heavy_boxer: [
      'Eat a proper meal before the session and another after it.',
      'Add a little to the meal you already cook, so the week can hold size and power.',
      'Put protein on breakfast, lunch, and dinner.',
      'Keep water with the meal. Sparkling water counts.',
    ],
    elite_middle_boxer: [
      'Eat before the session and a proper meal after it.',
      'Keep every meal. A middleweight limit on this screen is a small change, not a skipped meal.',
      'Keep water with the meal. Do not skip drinks to change the scales.',
      'A middleweight limit is a note for a coach and a doctor.',
    ],
    none: [
      'Keep three meals, even on a day that runs late.',
      'Add a protein food to the meal that is usually just toast or a sandwich.',
      'Keep a piece of fruit where you will see it.',
      'Drink a glass of water before the evening meal.',
    ],
  };
  const chosen = take(facts.input.salt, 'habits', banks[goal ?? 'none'] ?? banks.none, 3, facts.done);
  if (facts.done.some((item) => item.toLowerCase() === LOG_IN_CHARIOTEER.toLowerCase())) return chosen;
  return [...chosen, LOG_IN_CHARIOTEER];
}

export const SWAP_LOG_MORE = 'Log a few more meals and Thumos will suggest swaps based on what you actually eat.';

/** One sober line. It does not ask anyone to replace a drink. */
export const SOBER_SWAP = 'Keep the evenings you already like. The sober days stay on Check-in.';

const DOES_NOT_DRINK = /\b(don'?t drink|do not drink|not drinking|stopped drinking|never drink|teetotal|no alcohol|alcohol[ -]free|i am sober|i'm sober)\b/i;

const ALCOHOL_WORD = /\b(alcohol|alcoholic|beers?|wines?|lagers?|ciders?|pints?|pubs?|spirits|bitters|booze|gin|vodka|whisk(?:y|ey)|rum|prosecco|champagne|alcopops?|cocktails?)\b/i;

/** A line that treats a drink as something they still take and should replace. */
const REPLACING_A_DRINK = /\b(replace\b[^.]{0,60}\bdrinks?|evening drinks?|drinking nights?|used to pour|used to be a drinking|dash of bitters|old pub|at the bar|first drink|alternate a drink|instead of (?:a |the |your |an )?drinks?)\b/i;

/**
 * The food being given up has to appear in logged meals or in something they wrote.
 * Almonds and berries are the suggestion, so they are not in this list.
 */
const SWAP_FOODS: { mentioned: RegExp; evidence: RegExp }[] = [
  { mentioned: /\bcrisps?\b/i, evidence: /\bcrisps?\b|\bsnacks?\b/i },
  { mentioned: /\bchips\b/i, evidence: /\bchips\b|\bcrisps?\b|\bsnacks?\b/i },
  { mentioned: /\bsnacks?\b/i, evidence: /\bsnacks?\b|\bcrisps?\b/i },
  { mentioned: /\bchocolates?\b/i, evidence: /\bchocolates?\b/i },
  { mentioned: /\bpastr(?:y|ies)\b/i, evidence: /\bpastr(?:y|ies)\b/i },
  { mentioned: /\bbiscuits?\b/i, evidence: /\bbiscuits?\b/i },
  { mentioned: /\bcookies?\b/i, evidence: /\bcookies?\b|\bbiscuits?\b/i },
  { mentioned: /\b(?:pizza|burgers?|fries|takeaway|take-away)\b/i, evidence: /\b(?:pizza|burgers?|fries|takeaway|take-away)\b/i },
  { mentioned: /\b(?:fizzy|soda|cola|coke)\b/i, evidence: /\b(?:fizzy|soda|cola|coke)\b/i },
  { mentioned: /\b(?:sweets?|candy|cakes?|ice cream)\b/i, evidence: /\b(?:sweets?|candy|cakes?|ice cream)\b/i },
];

const FOOD_SUGGESTIONS: { evidence: RegExp; line: string }[] = [
  { evidence: /\bcrisps?\b|\bsnacks?\b/i, line: 'Swap the crisps or snacks you logged for a small handful of almonds and berries.' },
  { evidence: /\bchocolates?\b/i, line: 'Swap the chocolate you logged for fruit you already like.' },
  { evidence: /\bpastr(?:y|ies)\b/i, line: 'Swap the pastry you logged for eggs or yoghurt.' },
  { evidence: /\bbiscuits?\b|\bcookies?\b/i, line: 'Swap the biscuits you logged for fruit.' },
  { evidence: /\b(?:pizza|burgers?|fries|takeaway|take-away)\b/i, line: 'Swap one logged takeaway for a meal you cook at home.' },
  { evidence: /\b(?:fizzy|soda|cola|coke)\b/i, line: 'Swap the fizzy drink you logged for water.' },
  { evidence: /\b(?:sweets?|candy|cakes?|ice cream)\b/i, line: 'Swap the sweet you logged for fruit.' },
];

/** Logged meals, check-in notes, limits, and reasons. Interests are not a food habit. */
export function swapEvidenceText(input: PlanInput): string {
  const logged = input.foodLogs.flatMap((log) => [log.note, ...log.items.map((item) => item.name)]);
  const notes = input.checkIns.map((row) => row.note);
  return [input.limits, ...input.reasons, ...notes, ...logged].join('\n');
}

/** Stopped, a sober date, or their own words that they do not drink. */
export function abstainsFromDrink(input: PlanInput): boolean {
  if (input.stage === 'stopped') return true;
  if (input.sobrietyStartedAt) return true;
  const stated = [input.limits, input.visionStatement, ...input.reasons, ...input.checkIns.map((row) => row.note)].join('\n');
  return DOES_NOT_DRINK.test(stated);
}

function stillDrinks(input: PlanInput): boolean {
  if (abstainsFromDrink(input)) return false;
  // Exploring is the default for a new account. It is not evidence that they drink.
  if (input.stage === 'cutting_down' || input.stage === 'trying_to_stop') return true;
  if ((input.weeklyUnits ?? 0) > 0) return true;
  return ALCOHOL_WORD.test(swapEvidenceText(input));
}

function sameLine(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * True when a swap invents a drink to replace, or a food they have not logged or mentioned.
 * The sober line and the log-more line stay.
 */
const INVENTED_DRINK = /\b(evening drinks?|drinking nights?|used to pour|used to be a drinking|dash of bitters|old pub|at the bar)\b/i;

const SPECIFIC_ALCOHOL: { mentioned: RegExp; evidence: RegExp }[] = [
  { mentioned: /\bbeers?\b/i, evidence: /\bbeers?\b|\blagers?\b|\bpints?\b/i },
  { mentioned: /\bwines?\b/i, evidence: /\bwines?\b/i },
  { mentioned: /\blagers?\b/i, evidence: /\blagers?\b|\bbeers?\b|\bpints?\b/i },
  { mentioned: /\bciders?\b/i, evidence: /\bciders?\b/i },
  { mentioned: /\bpints?\b/i, evidence: /\bpints?\b|\bbeers?\b|\blagers?\b/i },
  { mentioned: /\b(?:gin|vodka|whisk(?:y|ey)|rum|prosecco|champagne|alcopops?|cocktails?|spirits|bitters)\b/i, evidence: /\b(?:gin|vodka|whisk(?:y|ey)|rum|prosecco|champagne|alcopops?|cocktails?|spirits|bitters)\b/i },
];

export function mentionsUnsupportedSwap(text: string, input: PlanInput): boolean {
  const line = text.trim();
  if (sameLine(line, SWAP_LOG_MORE) || sameLine(line, SOBER_SWAP)) return false;
  const evidence = swapEvidenceText(input);
  const replacing = REPLACING_A_DRINK.test(line) || ALCOHOL_WORD.test(line);
  if (abstainsFromDrink(input) && replacing) return true;
  if (INVENTED_DRINK.test(line) && !INVENTED_DRINK.test(evidence)) return true;
  for (const food of SWAP_FOODS) {
    if (food.mentioned.test(line) && !food.evidence.test(evidence)) return true;
  }
  for (const drink of SPECIFIC_ALCOHOL) {
    if (drink.mentioned.test(line) && !drink.evidence.test(evidence)) return true;
  }
  const namesFood = SWAP_FOODS.some((food) => food.mentioned.test(line));
  if (!namesFood && !replacing) return true;
  if (replacing && !stillDrinks(input)) return true;
  return false;
}

function loggedFoodAndDrink(input: PlanInput): { food: string[]; drink: string[] } {
  const food: string[] = [];
  const drink: string[] = [];
  for (const log of input.foodLogs) {
    for (const bit of [log.note, ...log.items.map((item) => item.name)]) {
      const name = bit.replace(/\s+/g, ' ').trim();
      if (!name) continue;
      if (ALCOHOL_WORD.test(name)) drink.push(name);
      else food.push(name);
    }
  }
  return { food: [...new Set(food)].slice(0, 40), drink: [...new Set(drink)].slice(0, 20) };
}

export type HealthPlanModelContext = {
  profile: {
    goal: NutritionGoal | null;
    stage: string;
    sobrietyStartedAt: string | null;
    drinks: boolean;
    stopped: boolean;
    dietNotes: string;
  };
  checkIns: PlanInput['checkIns'];
  loggedFood: string[];
  loggedDrink: string[];
  interests: string[];
  reasons: string[];
  vision: string;
  limits: string;
  finished: string[];
  body: string;
  activity: string;
  kcalTarget: number | null;
  proteinTarget: number | null;
  /** Stated week from You, or the logged routine from the last four weeks. Null when neither is usable. */
  training: TrainingBaseline | null;
  /** One fitness sentence. Null when health consent is off or there is nothing to say. */
  fitnessSnapshot: string | null;
};

/** What the model may use. Swaps may use only profile, checkIns, loggedFood, and loggedDrink. */
export function healthPlanModelContext(input: PlanInput, plan: HealthPlan): HealthPlanModelContext {
  const logged = loggedFoodAndDrink(input);
  return {
    profile: {
      goal: input.goal,
      stage: input.stage,
      sobrietyStartedAt: input.sobrietyStartedAt,
      drinks: stillDrinks(input),
      stopped: abstainsFromDrink(input),
      dietNotes: input.limits.slice(0, 280),
    },
    checkIns: input.checkIns.slice(0, 8).map((row) => ({
      mood: row.mood,
      craving: row.craving,
      sleepHours: row.sleepHours,
      note: row.note.slice(0, 160),
      createdAt: row.createdAt,
    })),
    loggedFood: logged.food,
    loggedDrink: logged.drink,
    interests: input.interestLabels,
    reasons: input.reasons.map((item) => item.slice(0, 120)),
    vision: input.visionStatement.slice(0, 160),
    limits: input.limits.slice(0, 280),
    finished: input.doneTexts.slice(0, 8),
    body: plan.nutrition.targets,
    activity: plan.fitness.intro,
    kcalTarget: input.kcalTarget,
    proteinTarget: input.proteinTarget,
    training: planBaseline(input),
    fitnessSnapshot: input.fitnessSnapshot === undefined ? fitnessSnapshotFor(input) : input.fitnessSnapshot,
  };
}

function swaps(facts: Derived): string[] {
  const evidence = swapEvidenceText(facts.input);
  const lines: string[] = [];
  const soberDone = facts.done.some((item) => sameLine(item, SOBER_SWAP));
  if (abstainsFromDrink(facts.input)) {
    if (!soberDone) lines.push(SOBER_SWAP);
  } else if (stillDrinks(facts.input)) {
    const named = evidence.match(/\b(beers?|lagers?|wines?|ciders?|pints?|gins?|vodkas?|whisk(?:y|ey)|rums?)\b/i);
    if (named?.[1]) lines.push(`Swap the ${named[1].toLowerCase()} you logged for water or a soft drink you like.`);
    else {
      lines.push('Have the first drink later, and put food on the table before it.');
      lines.push('Alternate a drink with water, and stop at the number you chose.');
    }
  }
  for (const rule of FOOD_SUGGESTIONS) {
    if (rule.evidence.test(evidence)) lines.push(rule.line);
  }
  const unique = [...new Set(lines)];
  if (!unique.length) return [SWAP_LOG_MORE];
  const sober = unique.filter((line) => sameLine(line, SOBER_SWAP));
  const rest = unique.filter((line) => !sameLine(line, SOBER_SWAP));
  if (!rest.length) return sober;
  return [...sober, ...take(facts.input.salt, 'swaps', rest, 3, facts.done)].slice(0, 4);
}

function weekdayName(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(year ?? 2026, (month ?? 1) - 1, date ?? 1);
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][next.getDay()] ?? 'Monday';
}

function joinDays(days: string[]): string {
  if (days.length <= 1) return days[0] ?? '';
  if (days.length === 2) return `${days[0]} and ${days[1]}`;
  return `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
}

/** Pain, illness, injury, or poor recovery. Limits keep the existing injury words, including a named doctor. */
function easesOff(input: PlanInput): boolean {
  if (/injur|pain|surgery|pregnant|condition|asthma|heart|doctor|gp\b/i.test(input.limits)) return true;
  const notes = input.checkIns.slice(0, 8).map((row) => row.note).join(' ');
  return /\b(injur\w*|pain|surgery|illness|sick|poor recovery|unwell)\b/i.test(`${input.limits} ${notes}`);
}

/**
 * Routine from workout minutes in the last 28 days.
 * Null unless at least four days are logged and one weekday repeats.
 * A single long day stays null so a one-off session is not treated as the week.
 */
export function trainingBaseline(input: PlanInput): TrainingBaseline | null {
  const today = isoDay(input.now);
  const start = shift(today, -27);
  const byDay = new Map<string, number>();
  for (const row of input.health) {
    if (row.kind !== 'workout_minutes') continue;
    if (row.recordedOn < start || row.recordedOn > today) continue;
    if (!Number.isFinite(row.value) || row.value <= 0) continue;
    byDay.set(row.recordedOn, (byDay.get(row.recordedOn) ?? 0) + row.value);
  }
  const logged = [...byDay.entries()];
  if (logged.length < 4) return null;

  const hits = new Map<string, number>();
  const possible = new Map<string, number>();
  for (let offset = 0; offset < 28; offset += 1) {
    const name = weekdayName(shift(today, -offset));
    possible.set(name, (possible.get(name) ?? 0) + 1);
  }
  for (const [day] of logged) {
    const name = weekdayName(day);
    hits.set(name, (hits.get(name) ?? 0) + 1);
  }

  const trainDays: string[] = [];
  const restDays: string[] = [];
  for (const name of WEEK_ORDER) {
    const hit = hits.get(name) ?? 0;
    const slots = possible.get(name) ?? 0;
    if (slots <= 0) continue;
    const rate = hit / slots;
    if (hit >= 2 && rate >= 0.5) trainDays.push(name);
    else if (slots >= 3 && rate <= 0.25) restDays.push(name);
  }
  if (!trainDays.length) return null;

  const minutes = logged.map(([, value]) => value).sort((a, b) => a - b);
  const mid = Math.floor(minutes.length / 2);
  const median = minutes.length % 2 === 0
    ? ((minutes[mid - 1] ?? 0) + (minutes[mid] ?? 0)) / 2
    : (minutes[mid] ?? 0);
  const typicalMinutes = Math.round(median);
  const sessionsPerWeek = Math.round((logged.length / 4) * 10) / 10;
  const summary = trainDays.length >= 5
    ? `You train about ${typicalMinutes} min on most days.`
    : `You train about ${typicalMinutes} min on ${joinDays(trainDays)}.`;
  return {
    sessionsPerWeek,
    typicalMinutes,
    trainDays,
    restDays,
    walkDays: [],
    summary,
    dayCount: logged.length,
    source: 'logged',
  };
}

const SCHEDULE_DAY_COLUMNS = [
  ['monday', 'Monday'],
  ['tuesday', 'Tuesday'],
  ['wednesday', 'Wednesday'],
  ['thursday', 'Thursday'],
  ['friday', 'Friday'],
  ['saturday', 'Saturday'],
  ['sunday', 'Sunday'],
] as const;

function weekdayListed(value: string | null | undefined): value is (typeof WEEK_ORDER)[number] {
  return WEEK_ORDER.some((day) => day === value);
}

/** Drops an incomplete or out-of-range week. Minutes stay inside the safety caps. */
export function normaliseTrainingSchedule(raw: {
  days?: readonly string[] | null;
  typicalMinutes?: number | null;
  longerDay?: string | null;
  longerMinutes?: number | null;
  walkDay?: string | null;
  note?: string | null;
} | null | undefined): TrainingSchedule | null {
  if (!raw) return null;
  const days = WEEK_ORDER.filter((day) => (raw.days ?? []).includes(day));
  if (!days.length) return null;
  const typical = Math.round(Number(raw.typicalMinutes));
  if (!Number.isFinite(typical) || typical < 10 || typical > 180) return null;
  let longerDay = weekdayListed(raw.longerDay) && days.includes(raw.longerDay) ? raw.longerDay : null;
  let longerMinutes = longerDay == null ? null : Math.round(Number(raw.longerMinutes));
  if (longerDay) {
    if (longerMinutes == null || !Number.isFinite(longerMinutes) || longerMinutes <= typical || longerMinutes > 240) {
      longerDay = null;
      longerMinutes = null;
    }
  }
  const walkDay = weekdayListed(raw.walkDay) && !days.includes(raw.walkDay) ? raw.walkDay : null;
  const note = (raw.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 280);
  return { days: [...days], typicalMinutes: typical, longerDay, longerMinutes, walkDay, note };
}

/** One owner row from training_schedules. Null when the week is missing or not usable. */
export function trainingScheduleFromRow(row: unknown): TrainingSchedule | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const days = SCHEDULE_DAY_COLUMNS.filter(([column]) => record[column] === true).map(([, name]) => name);
  return normaliseTrainingSchedule({
    days,
    typicalMinutes: Number(record.typical_minutes),
    longerDay: typeof record.longer_day === 'string' ? record.longer_day : null,
    longerMinutes: record.longer_minutes == null ? null : Number(record.longer_minutes),
    walkDay: typeof record.walk_day === 'string' ? record.walk_day : null,
    note: typeof record.note === 'string' ? record.note : '',
  });
}

function aimBody(schedule: TrainingSchedule): string {
  const typical = schedule.typicalMinutes;
  const longer = schedule.longerDay;
  const ordinary = schedule.days.filter((day) => day !== longer);
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const isWeekdays = ordinary.length === 5 && weekdays.every((day) => ordinary.includes(day));
  if (longer && schedule.longerMinutes && schedule.longerMinutes > typical) {
    if (!ordinary.length) return `${schedule.longerMinutes} min on ${longer}`;
    const where = isWeekdays ? 'weekdays' : joinDays(ordinary);
    return `${typical} min on ${where} and a bit more on ${longer}`;
  }
  if (isWeekdays && schedule.days.length === 5) return `${typical} min on weekdays`;
  if (schedule.days.length >= 6) return `${typical} min on most days`;
  return `${typical} min on ${joinDays(schedule.days)}`;
}

/** One line for the You card. */
export function trainingScheduleSummary(schedule: TrainingSchedule | null): string {
  if (!schedule?.days.length) return 'Not set yet.';
  const walk = schedule.walkDay ? ` Walk on ${schedule.walkDay}.` : '';
  return `${aimBody(schedule)}.${walk}`;
}

function completedThisWeek(input: PlanInput, trainDays: readonly string[]): { done: number; total: number } {
  const today = isoDay(input.now);
  const start = shift(today, -6);
  const byDay = new Map<string, number>();
  for (const row of input.health) {
    if (row.kind !== 'workout_minutes') continue;
    if (row.recordedOn < start || row.recordedOn > today) continue;
    if (!Number.isFinite(row.value) || row.value <= 0) continue;
    byDay.set(row.recordedOn, (byDay.get(row.recordedOn) ?? 0) + row.value);
  }
  let done = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const day = shift(start, offset);
    if (!trainDays.includes(weekdayName(day))) continue;
    if ((byDay.get(day) ?? 0) > 0) done += 1;
  }
  return { done, total: trainDays.length };
}

/**
 * The stated week is the plan whenever You has a saved schedule.
 * A thin or missing log does not invent rest days. A solid log adds how many of those sessions happened this week.
 */
function statedBaseline(input: PlanInput): TrainingBaseline | null {
  const schedule = normaliseTrainingSchedule(input.schedule);
  if (!schedule) return null;
  const dayMinutes: Record<string, number> = {};
  for (const day of schedule.days) {
    dayMinutes[day] = day === schedule.longerDay && schedule.longerMinutes ? schedule.longerMinutes : schedule.typicalMinutes;
  }
  const walkDays = schedule.walkDay ? [schedule.walkDay] : [];
  const restDays = WEEK_ORDER.filter((day) => !schedule.days.includes(day) && !walkDays.includes(day));
  const logged = trainingBaseline(input);
  const count = completedThisWeek(input, schedule.days);
  const comparison = logged && count.done > 0 ? `you have done ${count.done} of ${count.total} this week` : null;
  const summary = comparison
    ? `You aim for ${aimBody(schedule)}; ${comparison}`
    : `You aim for ${aimBody(schedule)}`;
  return {
    sessionsPerWeek: schedule.days.length,
    typicalMinutes: schedule.typicalMinutes,
    trainDays: [...schedule.days],
    restDays: [...restDays],
    walkDays,
    dayMinutes,
    summary,
    dayCount: logged?.dayCount ?? 0,
    source: 'stated',
    note: schedule.note,
  };
}

/** Stated schedule when You has one, otherwise the logged four-week routine. */
export function planBaseline(input: PlanInput): TrainingBaseline | null {
  return statedBaseline(input) ?? trainingBaseline(input);
}

function weekdaysMentioned(text: string): string[] {
  const found = new Set<string>();
  const range = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*(?:[-–—]|to)\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = range.exec(text)) !== null) {
    const start = WEEK_ORDER.findIndex((day) => day.toLowerCase() === match?.[1]?.toLowerCase());
    const end = WEEK_ORDER.findIndex((day) => day.toLowerCase() === match?.[2]?.toLowerCase());
    if (start >= 0 && end >= start) {
      for (let index = start; index <= end; index += 1) found.add(WEEK_ORDER[index] as string);
    }
  }
  const single = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi;
  while ((match = single.exec(text)) !== null) {
    const name = WEEK_ORDER.find((day) => day.toLowerCase() === match?.[1]?.toLowerCase());
    if (name) found.add(name);
  }
  return [...found];
}

/** A line that would train less often, or for less time, than the logged routine. */
export function mentionsRegressiveSession(text: string, baseline: TrainingBaseline | null): boolean {
  if (!baseline) return false;
  const line = text.replace(/\s+/g, ' ').trim();
  const named = weekdaysMentioned(line);
  const trainsNamed = named.some((day) => baseline.trainDays.includes(day));
  const callsRest = /\b(rest|day off|no workout|no structured|full rest)\b/i.test(line);
  if (trainsNamed && callsRest) return true;
  if (baseline.sessionsPerWeek >= 3 && /\b(full rest|no structured)\b/i.test(line)) return true;
  if (/\b(fewer sets|fewer reps)\b/i.test(line)) return true;
  const minutes = line.match(/\b(\d+)\s*(?:min|minutes)\b/i);
  if (minutes && trainsNamed) {
    const floors = named
      .filter((day) => baseline.trainDays.includes(day))
      .map((day) => baseline.dayMinutes?.[day] ?? baseline.typicalMinutes);
    const floor = floors.length ? Math.min(...floors) : baseline.typicalMinutes;
    if (Number(minutes[1]) < floor * 0.9) return true;
  }
  return false;
}

function progressionClause(facts: Derived): string {
  const goal = facts.input.goal;
  if (goal === 'elite_runner') return 'Add a little distance, about 5 to 10 percent.';
  if (goal === 'elite_heavy_boxer' || goal === 'elite_middle_boxer') return 'Add a little work on the pads or the bag.';
  if (goal === 'body_builder') return 'Add a little weight or one set.';
  return 'Add a little weight or one set.';
}

function sessionKind(facts: Derived): string {
  const goal = facts.input.goal;
  if (goal === 'elite_runner') return 'run';
  if (goal === 'elite_heavy_boxer' || goal === 'elite_middle_boxer') return 'boxing session';
  if (goal === 'body_builder') return 'lifting session';
  return 'session';
}

function routineWeek(facts: Derived, baseline: TrainingBaseline): string[] {
  const kind = sessionKind(facts);
  const progress = progressionClause(facts);
  const lines: string[] = [];
  for (const day of WEEK_ORDER) {
    if (baseline.trainDays.includes(day)) {
      const minutes = Math.round(baseline.dayMinutes?.[day] ?? baseline.typicalMinutes);
      lines.push(`${day} · Keep this ${kind}, about ${minutes} min. ${progress}`);
    } else if (baseline.walkDays?.includes(day)) lines.push(`${day} · A walk. Keep it easy.`);
    else if (baseline.restDays.includes(day)) lines.push(`${day} · Rest. You already leave this day free.`);
  }
  return lines;
}

function statedKeep(goal: PlanInput['goal']): string {
  if (goal === 'elite_runner') return 'Keep the runs and the carbohydrate.';
  if (goal === 'body_builder') return 'Keep the lifting and the protein.';
  if (goal === 'elite_heavy_boxer' || goal === 'elite_middle_boxer') return 'Keep the boxing and the protein.';
  if (goal === 'lose_fat_build_muscle') return 'Keep the resistance work and the protein.';
  return 'Keep this routine.';
}

function baselineIntro(facts: Derived, baseline: TrainingBaseline): string {
  if (baseline.source === 'stated') {
    return clip(`${baseline.summary}. ${statedKeep(facts.input.goal)} ${PLAN_DOCTOR}`, 220);
  }
  const goal = facts.input.goal;
  const next = goal === 'elite_runner'
    ? 'Keep the runs and the carbohydrate, and add a little distance.'
    : goal === 'body_builder'
      ? 'Keep the lifting and the protein, and add a little weight or one set.'
      : goal === 'elite_heavy_boxer' || goal === 'elite_middle_boxer'
        ? 'Keep the boxing and the protein, and add a little work.'
        : goal === 'lose_fat_build_muscle'
          ? 'Keep the resistance work and the protein, add a little weight or one set, and keep some easy walking.'
          : 'Keep this routine, and add a little weight or one set.';
  return clip(`${baseline.summary} ${next} ${PLAN_DOCTOR}`, 220);
}

const EASY_WEEK = [
  'Monday · Ten easy minutes of movement that does not hurt, then stop.',
  'Tuesday · Rest.',
  'Wednesday · The same easy minutes, or a shorter walk.',
  'Thursday · Rest.',
  'Friday · Only what still feels ordinary the next morning.',
  'Saturday · Rest, or a very short outing.',
  'Sunday · Rest.',
];

function sessions(facts: Derived): string[] {
  if (facts.safety.withdrawal) {
    return [
      'Rest. Do not use exercise to sweat out a drink.',
      'A slow walk is enough if you feel steady, and only if you want it.',
      'Leave the other days free.',
    ];
  }
  if (facts.safety.selfHarm) {
    return [
      'Rest is the plan.',
      'A short walk outside counts, and only if you want company or daylight.',
      'Leave training for another week.',
    ];
  }
  if (facts.injury || facts.easeOff) return EASY_WEEK;
  if (facts.baseline) return routineWeek(facts, facts.baseline);
  const athleteWeek = athleteSessions(facts);
  if (athleteWeek) return athleteWeek;
  const walk = facts.level === 'active' ? '30 minutes' : facts.level === 'some' ? '20 minutes' : '15 minutes';
  const longer = facts.level === 'starting' ? '20 minutes' : 'a little longer than last week';
  const hard = facts.gym && facts.level !== 'starting'
    ? 'Wednesday · A short gym session, one exercise less than you could do, and stop while the last set is still tidy.'
    : facts.hiking
      ? `Wednesday · A walk outdoors for ${walk}.`
      : `Wednesday · A walk for ${walk}.`;
  const weekend = facts.hiking
    ? `Saturday · A hike ${facts.level === 'starting' ? 'on an easy path, and turn back early' : longer}.`
    : facts.gym
      ? 'Saturday · The same gym session as Wednesday, or a rest if the legs are heavy.'
      : `Saturday · A walk for ${longer}.`;
  return [
    `Monday · Walk for ${walk}.`,
    'Tuesday · Rest.',
    hard,
    'Thursday · Rest.',
    `Friday · Walk for ${walk}, or skip it if Wednesday was plenty.`,
    weekend,
    'Sunday · Rest.',
  ];
}

function athleteSessions(facts: Derived): string[] | null {
  const goal = facts.input.goal;
  if (!isTrainingGoal(goal)) return null;
  const easy = facts.level === 'starting';
  const soberRest = facts.soberPath
    ? 'Sunday · Rest. Recovery is the meal, water, and sleep. A soft drink is enough if you want one.'
    : 'Sunday · Rest.';
  if (goal === 'elite_runner') {
    return [
      easy
        ? 'Monday · A brisk walk, then a carbohydrate snack you already like.'
        : 'Monday · An easy run, then a carbohydrate snack you already like.',
      'Tuesday · Rest, or a very easy spin if the legs feel ordinary.',
      easy
        ? 'Wednesday · A slightly longer walk. Eat a meal in the hour after, with carbohydrate and protein.'
        : 'Wednesday · The longer session. Eat a meal in the hour after, with carbohydrate and protein.',
      'Thursday · Rest.',
      'Friday · A short session, and stop while you could still do more.',
      'Saturday · The session you care about. Eat before it, and a proper meal after.',
      soberRest,
    ];
  }
  if (goal === 'body_builder') {
    const cut = facts.input.goalPhase === 'cut'
      ? 'Monday · A lifting session with fewer sets than your best week. Keep every meal. This cut is a small change, not a skipped meal.'
      : 'Monday · A lifting session, fewer sets than your best week, then a meal with protein.';
    return [
      cut,
      'Tuesday · Rest, or a short walk.',
      'Wednesday · The second lifting session. Eat after it.',
      'Thursday · Rest.',
      'Friday · A shorter lifting session, and stop while the last set is tidy.',
      'Saturday · Rest if the week was heavy. Otherwise the same session as Monday.',
      soberRest,
    ];
  }
  if (goal === 'elite_heavy_boxer') {
    return [
      'Monday · Pad work or a power session, then a meal with protein.',
      'Tuesday · Rest, or a short walk.',
      'Wednesday · A power session, fewer sets than your best week, then eat.',
      'Thursday · Rest.',
      'Friday · Skill work, and stop while you could still do more.',
      'Saturday · The session you care about, with food before and after.',
      soberRest,
    ];
  }
  return [
    'Monday · Skill work or a pad session, then a meal. Keep every meal.',
    'Tuesday · Rest.',
    easy
      ? 'Wednesday · A short walk or easy skill work, then stop.'
      : 'Wednesday · A shorter session than you could do.',
    'Thursday · Rest.',
    'Friday · Easy skill work, and stop if you feel flat.',
    'Saturday · The session you care about, with food before and after.',
    facts.soberPath
      ? `Sunday · Rest. ${COMPETITION_NOTE} Recovery stays alcohol-free.`
      : `Sunday · Rest. ${COMPETITION_NOTE}`,
  ];
}

function fitnessIntro(facts: Derived): string {
  if (facts.safety.withdrawal) return `${WITHDRAWAL_NOTICE}`;
  if (facts.safety.selfHarm) return 'Training can wait. A person comes first.';
  if (facts.injury || facts.easeOff) return `Keep this week short and easy, and stop if something hurts. ${PLAN_DOCTOR}`;
  if (facts.baseline) return baselineIntro(facts, facts.baseline);
  if (isTrainingGoal(facts.input.goal)) {
    const load = facts.workoutMinutes != null
      ? `${facts.workoutMinutes} workout minutes over the last week`
      : 'no workout minutes logged yet';
    const aim = facts.input.goal === 'elite_runner'
      ? 'This week keeps fuel around the sessions and a rest day after the longer one.'
      : facts.input.goal === 'body_builder'
        ? 'This week keeps the lifting volume you can recover from, with food after the sessions.'
        : facts.input.goal === 'elite_heavy_boxer'
          ? 'This week keeps food around the sessions so size and power can hold.'
          : 'This week keeps skill work and food around it. A middleweight limit belongs with a coach and a doctor.';
    return clip(`${aim} Recent training load: ${load}. That load stays on Stats.`, 280);
  }
  const steps = facts.steps != null ? `${Math.round(facts.steps).toLocaleString('en-GB')} steps on a recent day` : 'no step count yet';
  const work = facts.workoutMinutes != null ? `${facts.workoutMinutes} workout minutes over the last week` : 'no workout minutes logged';
  const pace = facts.level === 'active'
    ? 'You are already moving, so this week adds a little, then rests.'
    : facts.level === 'some'
      ? 'This week keeps the movement you have and leaves two rest days.'
      : 'This week starts with short walks and more rest than work.';
  return clip(`${pace} Recent figures: ${steps}, ${work}. Steps, weight, and workouts stay on Stats.`, 280);
}

function wellbeingHabits(facts: Derived): string[] {
  if (facts.safety.selfHarm) {
    return [SELF_HARM_NOTICE, 'A check-in can wait. If you want a person on the phone, the Samaritans line above stays open.'];
  }
  const sleep = facts.sleepHours == null
    ? 'Pick a lights-out time and keep it on four nights.'
    : facts.sleepHours < 6.5
      ? `Sleep has been about ${facts.sleepHours} hours. Bring the evening forward by 20 minutes on four nights.`
      : `Sleep has been about ${facts.sleepHours} hours. Keep that, and protect it the night before a busier day.`;
  const mood = facts.moodTrend === 'lower'
    ? 'Mood has been lower than the earlier check-ins. Keep the check-in short, and one ordinary plan in the afternoon.'
    : facts.moodTrend === 'higher'
      ? 'Mood has lifted on the later check-ins. Keep the same rhythm rather than adding a new project.'
      : 'Use Check-in on the days you already open Charioteer. Mood and craving are enough.';
  const stress = facts.cravingTrend === 'higher'
    ? 'Cravings have been higher. Use the breathing timer once when the urge shows up, then a glass of water.'
    : 'When the day spikes, use one minute of the breathing timer before you decide the next thing.';
  const wind = facts.vision
    ? `The board says “${facts.vision}”. One small step toward it is enough this week.`
    : facts.reason
      ? `Your reason, “${facts.reason}”, is the point of the easy evening.`
      : 'Leave one evening with nothing planned except the meal and an early night.';
  const rows = take(facts.input.salt, 'well', [sleep, mood, stress, wind], 4, facts.done);
  if (!isTrainingGoal(facts.input.goal)) return rows;
  const recovery = 'Protect sleep the night before a harder session. Check with a doctor before big changes.';
  return [recovery, ...rows.filter((line) => line !== recovery)].slice(0, 4);
}

const CARRY_OVER = /\b(you marked|this week moves on|so this week|one focus is enough)\b/i;
const LEADING_ACTION = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Rest|Walk|Keep|Include|Pick|Use|Leave|Bring|Log|Have|Eat|Sleep|Stop|Add|Drink|Train|Sit|Take|Choose|Protect|Start|One|A|An|The|Your|When|If)\b/i;

/** A complete sentence that fits, with no ellipsis and no mid-sentence cut. */
function trimSentence(value: string, max: number): string | null {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  let end = -1;
  for (let i = window.length - 1; i >= 24; i -= 1) {
    const mark = window[i];
    if ((mark === '.' || mark === '!' || mark === '?') && (i === window.length - 1 || window[i + 1] === ' ')) {
      end = i;
      break;
    }
  }
  if (end >= 24) return window.slice(0, end + 1).trim();
  return null;
}

function stripVocative(line: string, firstName: string): string {
  const named = firstName
    ? line.replace(new RegExp(`^${firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},\\s+`, 'i'), '')
    : line;
  if (named !== line) return named;
  const match = line.match(/^(\p{L}[\p{L}’'-]{1,30}),\s+([\s\S]+)$/u);
  if (!match?.[1] || !match[2]) return line;
  if (LEADING_ACTION.test(match[1])) return line;
  if (LEADING_ACTION.test(match[2]) || /^(you|one focus|this week)\b/i.test(match[2])) return match[2];
  return line;
}

/**
 * A focus item is one short action.
 * Progress talk, a name at the front, and a cut marked with an ellipsis come off.
 */
export function standaloneFocus(value: string, firstName = ''): string | null {
  let line = stripVocative(value.replace(/\s+/g, ' ').trim(), firstName);
  line = line.replace(/you marked\s+[“"'][\s\S]*?[”"']\s*done,?\s*so this week moves on\.?\s*/i, '');
  line = line.replace(/\b(one focus is enough|this week moves on)\.?\s*/gi, '');
  line = line.replace(/\s+/g, ' ').trim();
  const ellipsis = line.search(/…|\.{3}/);
  if (ellipsis >= 0) {
    const before = line.slice(0, ellipsis).trim();
    const end = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'));
    line = end >= 0 ? before.slice(0, end + 1).trim() : '';
  }
  line = line.replace(/\s+/g, ' ').trim();
  if (!line || CARRY_OVER.test(line)) return null;
  return trimSentence(line, 160);
}

function fitnessInput(input: PlanInput): FitnessSnapshotInput {
  const today = isoDay(input.now);
  const schedule = input.schedule;
  const scheduleWeekMinutes = schedule && schedule.days.length > 0 && schedule.typicalMinutes > 0
    ? schedule.days.reduce((total, day) => {
      if (schedule.longerDay === day && schedule.longerMinutes && schedule.longerMinutes > 0) return total + schedule.longerMinutes;
      return total + schedule.typicalMinutes;
    }, 0)
    : null;
  return {
    today,
    goal: input.goal,
    goalAge: input.goalAge,
    goalSex: input.goalSex,
    scheduleWeekMinutes,
    health: input.health,
    sleep: input.checkIns.flatMap((row) => {
      const day = row.createdAt.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || row.sleepHours <= 0) return [];
      return [{ day, hours: row.sleepHours }];
    }),
    permission: 'unknown',
  };
}

function fitnessSnapshotFor(input: PlanInput): string | null {
  return buildFitnessSnapshot(fitnessInput(input)).contextLine;
}

function focusLines(facts: Derived, habits: string[], session: string, well: string): string[] {
  const lines = [...fitnessFocusLines(fitnessInput(facts.input)), goalFocusLine(facts.input.goal) ?? '', habits[0] ?? '', session, well]
    .flatMap((line) => {
      const text = standaloneFocus(line, facts.firstName);
      return text ? [text] : [];
    });
  const unique = [...new Set(lines)];
  return unique.slice(0, facts.done.length > 2 ? 2 : 3);
}

function written(facts: Derived, updatedAt: string): HealthPlan {
  const habits = nutritionHabits(facts);
  const swapLines = swaps(facts);
  const week = sessions(facts);
  const well = wellbeingHabits(facts);
  return {
    focus: actions('focus', focusLines(facts, habits, week[0] ?? 'A short walk, then rest.', well[0] ?? 'An early night.')),
    nutrition: {
      targets: targetLine(facts),
      habits: actions('habit', habits),
      swaps: actions('swap', swapLines),
    },
    fitness: { intro: fitnessIntro(facts), sessions: actions('session', week) },
    wellbeing: { habits: actions('well', well) },
    limits: clip(facts.input.limits, 280),
    disclaimer: PLAN_DISCLAIMER,
    updatedAt,
  };
}

const LOG_IN_CHARIOTEER = 'Log meals on Nutrition. Steps and weight belong on Stats, and mood on Check-in.';

const OUTSIDE_APP = /\b(?:another app|the same app|a tracking app|tracking app|different app|other app|third-party app|third party app)\b/i;

/** Food and fitness products people are sent to instead of Nutrition, Stats, and Check-in. */
const TRACKER_NAMES = [
  'myfitnesspal',
  'my fitness pal',
  'nutracheck',
  'nutra check',
  'lose it',
  'loseit',
  'cronometer',
  'lifesum',
  'fatsecret',
  'fat secret',
  'noom',
  'yazio',
  'macrofactor',
  'macro factor',
  'carb manager',
  'fitbit',
  'garmin',
  'strava',
  'whoop',
  'oura',
  'samsung health',
  'google fit',
  'peloton',
  'nike run club',
  'mapmyrun',
  'map my run',
  'withings',
  'mynetdiary',
  'my net diary',
  'calorie king',
  'sparkpeople',
  'apple watch',
  'apple health',
  'smartwatch',
  'fitness tracker',
  'fitness watch',
  'wearable',
];

const TRACKER_NAME = new RegExp(`\\b(?:${TRACKER_NAMES.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');

/** A tip that sends logging to some other product. Charioteer's own screens stay. */
export function mentionsOtherTracker(text: string): boolean {
  return OUTSIDE_APP.test(text) || TRACKER_NAME.test(text);
}

const BANNED = /\b(i diagnose|you have (?:depression|anxiety|an eating disorder|diabetes|cancer)|prescri(?:be|ption)|stop your medication|starve|eat nothing)\b/i;
const DEFICIT = /\b(eat less|calorie deficit|skip meals|cut your calories|0 kcal)\b/i;
const HARMFUL_CUT = /\b(dehydrat\w*|sauna|water cut|diuretic)\b/i;

/** A refusal ("will not plan dehydration") stays. A suggestion to do it does not. */
function recommendsHarmfulCut(text: string): boolean {
  if (!HARMFUL_CUT.test(text)) return false;
  return !/\b(will not|do not|don't|never|not plan)\b/i.test(text);
}

function cleanLine(text: string, facts: Derived): string | null {
  const line = clip(text, 220);
  if (!line || BANNED.test(line) || recommendsHarmfulCut(line) || mentionsOtherTracker(line)) return null;
  if ((facts.underweight || facts.blockedLoss) && DEFICIT.test(line)) return null;
  if (facts.belowFloor && facts.input.kcalTarget != null && line.includes(String(facts.input.kcalTarget)) && facts.floorKcal != null) {
    return line.replaceAll(String(facts.input.kcalTarget), String(facts.floorKcal));
  }
  return line;
}

function mergeSwaps(incoming: PlanAction[], fallback: PlanAction[], facts: Derived): PlanAction[] {
  const seen = new Set<string>();
  const next: PlanAction[] = [];
  for (const action of [...incoming, ...fallback]) {
    const text = cleanLine(action.text, facts);
    if (!text || mentionsUnsupportedSwap(text, facts.input) || seen.has(text.toLowerCase())) continue;
    if (facts.done.some((done) => done.toLowerCase() === text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    next.push({ id: `swap-${next.length + 1}`, text, done: false });
    if (next.length >= 4) break;
  }
  const real = next.filter((action) => !sameLine(action.text, SWAP_LOG_MORE));
  const kept = (real.length ? real : next.filter((action) => sameLine(action.text, SWAP_LOG_MORE))).slice(0, 4);
  if (kept.length) return kept;
  const filler = abstainsFromDrink(facts.input) && !facts.done.some((item) => sameLine(item, SOBER_SWAP))
    ? SOBER_SWAP
    : SWAP_LOG_MORE;
  return [{ id: 'swap-1', text: filler, done: false }];
}

function weekdayOf(text: string): string | null {
  const match = text.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
  if (!match?.[1]) return null;
  return WEEK_ORDER.find((day) => day.toLowerCase() === match[1]?.toLowerCase()) ?? null;
}

/**
 * Sessions are not concatenated with the stock week.
 * A model week is kept only when it still covers every logged training day.
 * Pain, illness, injury, and poor recovery keep the easy local week.
 */
function mergeSessions(incoming: PlanAction[], fallback: PlanAction[], facts: Derived): PlanAction[] {
  if (facts.safety.selfHarm || facts.safety.withdrawal || facts.injury || facts.easeOff) return fallback;
  const baseline = facts.baseline;
  const seenDays = new Set<string>();
  const next: PlanAction[] = [];
  for (const action of incoming) {
    const text = cleanLine(action.text, facts);
    if (!text || (baseline && mentionsRegressiveSession(text, baseline))) continue;
    const day = weekdayOf(text);
    if (day) {
      if (seenDays.has(day)) continue;
      seenDays.add(day);
    }
    if (facts.done.some((done) => done.toLowerCase() === text.toLowerCase())) continue;
    next.push({ id: `session-${next.length + 1}`, text, done: false });
    if (next.length >= 7) break;
  }
  if (!baseline) return next.length >= 3 ? next : fallback;
  if (baseline.source === 'stated') return fallback;
  const covered = baseline.trainDays.every((day) => seenDays.has(day));
  return covered && next.length >= 3 ? next : fallback;
}

function mergeActions(prefix: string, incoming: PlanAction[], fallback: PlanAction[], facts: Derived, min: number, max: number): PlanAction[] {
  const seen = new Set<string>();
  const next: PlanAction[] = [];
  for (const action of [...incoming, ...fallback]) {
    const cleaned = cleanLine(action.text, facts);
    const text = prefix === 'focus' ? (cleaned ? standaloneFocus(cleaned, facts.firstName) : null) : cleaned;
    if (!text || seen.has(text.toLowerCase())) continue;
    if (facts.done.some((done) => done.toLowerCase() === text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    next.push({ id: `${prefix}-${next.length + 1}`, text, done: false });
    if (next.length >= max) break;
  }
  return next.slice(0, Math.max(min, Math.min(max, next.length || min)));
}

export function guardHealthPlan(plan: HealthPlan, input: PlanInput): HealthPlan {
  const facts = derive(input);
  const local = written(facts, plan.updatedAt || input.now.toISOString());
  const focus = mergeActions('focus', plan.focus, local.focus, facts, 1, 3);
  const habits = mergeActions('habit', plan.nutrition.habits, local.nutrition.habits, facts, 3, 4);
  const swapLines = mergeSwaps(plan.nutrition.swaps, local.nutrition.swaps, facts);
  let targets = cleanLine(plan.nutrition.targets, facts) ?? local.nutrition.targets;
  if ((facts.underweight || facts.blockedLoss) && !targets.includes('will not suggest eating less')) {
    targets = clip(`${targets} ${LOW_BMI_NOTE}`, 320);
  }
  let intro = cleanLine(plan.fitness.intro, facts) ?? local.fitness.intro;
  if (facts.safety.withdrawal && !intro.includes('do not stop suddenly')) intro = WITHDRAWAL_NOTICE;
  if ((facts.injury || facts.easeOff) && !facts.safety.withdrawal && !facts.safety.selfHarm) intro = local.fitness.intro;
  const introMatches = facts.baseline?.source === 'stated' ? /you aim for/i.test(intro) : /train about/i.test(intro);
  if (
    facts.baseline
    && !facts.safety.selfHarm
    && !facts.safety.withdrawal
    && !facts.injury
    && !facts.easeOff
    && !introMatches
  ) {
    intro = local.fitness.intro;
  }
  const sessionsOut = mergeSessions(plan.fitness.sessions, local.fitness.sessions, facts);
  let wellbeing = mergeActions('well', plan.wellbeing.habits, local.wellbeing.habits, facts, 2, 4);
  if (facts.safety.selfHarm && !wellbeing.some((item) => item.text.includes('116 123'))) {
    wellbeing = [{ id: 'well-crisis', text: SELF_HARM_NOTICE, done: false }, ...wellbeing].slice(0, 4);
  }
  if (facts.safety.withdrawal && !wellbeing.some((item) => item.text.includes('do not stop suddenly'))) {
    wellbeing = [{ id: 'well-withdrawal', text: WITHDRAWAL_NOTICE, done: false }, ...wellbeing].slice(0, 4);
  }
  return {
    focus: focus.length ? focus : local.focus,
    nutrition: { targets, habits: habits.length >= 3 ? habits : local.nutrition.habits, swaps: swapLines },
    fitness: { intro, sessions: sessionsOut.length ? sessionsOut : local.fitness.sessions },
    wellbeing: { habits: wellbeing.length ? wellbeing : local.wellbeing.habits },
    limits: clip(input.limits, 280),
    disclaimer: PLAN_DISCLAIMER,
    updatedAt: plan.updatedAt || input.now.toISOString(),
  };
}

export function draftHealthPlan(input: PlanInput): HealthPlan {
  const facts = derive(input);
  return guardHealthPlan(written(facts, input.now.toISOString()), input);
}

/** Adds a fitness line to this week's focus, or ticks it when it is already there. */
export function applyFitnessFocus(plan: HealthPlan | null, text: string, updatedAt: string): HealthPlan {
  const line = text.replace(/\s+/g, ' ').trim().slice(0, 160);
  if (plan) {
    const match = plan.focus.find((item) => item.text.toLowerCase() === line.toLowerCase());
    if (match) return togglePlanAction(plan, match.id);
    return {
      ...plan,
      focus: [...plan.focus, { id: `focus-fit-${plan.focus.length + 1}`, text: line, done: false }],
      updatedAt,
    };
  }
  return {
    focus: [{ id: 'focus-fit-1', text: line, done: false }],
    nutrition: { targets: 'Refresh the plan to fill this in from your figures.', habits: [], swaps: [] },
    fitness: { intro: 'Refresh the plan to fill this in from your figures.', sessions: [] },
    wellbeing: { habits: [] },
    limits: '',
    disclaimer: PLAN_DISCLAIMER,
    updatedAt,
  };
}

export function togglePlanAction(plan: HealthPlan, id: string): HealthPlan {
  const flip = (action: PlanAction): PlanAction => action.id === id ? { ...action, done: !action.done } : action;
  return {
    ...plan,
    focus: plan.focus.map(flip),
    nutrition: {
      ...plan.nutrition,
      habits: plan.nutrition.habits.map(flip),
      swaps: plan.nutrition.swaps.map(flip),
    },
    fitness: { ...plan.fitness, sessions: plan.fitness.sessions.map(flip) },
    wellbeing: { habits: plan.wellbeing.habits.map(flip) },
  };
}

export function donePlanTexts(plan: HealthPlan): string[] {
  return [
    ...plan.focus,
    ...plan.nutrition.habits,
    ...plan.nutrition.swaps,
    ...plan.fitness.sessions,
    ...plan.wellbeing.habits,
  ].filter((action) => action.done).map((action) => action.text);
}

function asActions(value: unknown, prefix: string, keepDone: boolean): PlanAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const text = typeof (item as { text?: unknown }).text === 'string' ? (item as { text: string }).text : '';
    if (!text.trim()) return [];
    const id = typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : `${prefix}-${index + 1}`;
    const done = keepDone && (item as { done?: unknown }).done === true;
    return [{ id: clip(id, 40), text, done }];
  });
}

/** A row already saved for this person. Ticks stay ticked. A model reply does not use this. */
export function healthPlanFromStored(row: unknown): HealthPlan | null {
  if (!row || typeof row !== 'object') return null;
  const data = row as Record<string, unknown>;
  const nutrition = (data.nutrition ?? null) as { targets?: unknown; habits?: unknown; swaps?: unknown } | null;
  const fitness = (data.fitness ?? null) as { intro?: unknown; sessions?: unknown } | null;
  const wellbeing = (data.wellbeing ?? null) as { habits?: unknown } | null;
  const storedFocus = asActions(data.focus, 'focus', true);
  const focus = storedFocus.flatMap((action) => {
    const text = standaloneFocus(action.text);
    return text ? [{ ...action, text }] : [];
  });
  const updatedAt = typeof data.updatedAt === 'string'
    ? data.updatedAt
    : typeof data.updated_at === 'string'
      ? data.updated_at
      : '';
  if (!storedFocus.length || !updatedAt) return null;
  const disclaimer = typeof data.disclaimer === 'string' && data.disclaimer.trim()
    ? data.disclaimer
    : PLAN_DISCLAIMER;
  return {
    focus,
    nutrition: {
      targets: typeof nutrition?.targets === 'string' ? nutrition.targets : '',
      habits: asActions(nutrition?.habits, 'habit', true),
      swaps: asActions(nutrition?.swaps, 'swap', true),
    },
    fitness: {
      intro: typeof fitness?.intro === 'string' ? fitness.intro : '',
      sessions: asActions(fitness?.sessions, 'session', true),
    },
    wellbeing: { habits: asActions(wellbeing?.habits, 'well', true) },
    limits: typeof data.limits === 'string' ? data.limits.slice(0, 280) : '',
    disclaimer,
    updatedAt,
  };
}

export function parseHealthPlanJson(raw: string): HealthPlan | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      focus?: unknown;
      nutrition?: { targets?: unknown; habits?: unknown; swaps?: unknown };
      fitness?: { intro?: unknown; sessions?: unknown };
      wellbeing?: { habits?: unknown };
    };
    return {
      focus: asActions(parsed.focus, 'focus', false),
      nutrition: {
        targets: typeof parsed.nutrition?.targets === 'string' ? parsed.nutrition.targets : '',
        habits: asActions(parsed.nutrition?.habits, 'habit', false),
        swaps: asActions(parsed.nutrition?.swaps, 'swap', false),
      },
      fitness: {
        intro: typeof parsed.fitness?.intro === 'string' ? parsed.fitness.intro : '',
        sessions: asActions(parsed.fitness?.sessions, 'session', false),
      },
      wellbeing: { habits: asActions(parsed.wellbeing?.habits, 'well', false) },
      limits: '',
      disclaimer: PLAN_DISCLAIMER,
      updatedAt: '',
    };
  } catch {
    return null;
  }
}

export const HEALTH_PLAN_PROMPT = [
  'You write a short personal health plan from the figures you are given. Reply with JSON only.',
  'Three sections: nutrition (targets sentence, 3 or 4 practical habits, food swaps), fitness (one row per weekday, following the logged training baseline), and wellbeing (sleep, stress, mood, and a check-in rhythm).',
  'Also give this week\'s focus as 1 to 3 items.',
  'Use the person\'s interests, reasons, and vision when they are present. Vary the sentences. Do not reuse a stock template.',
  'If a finished action is listed, leave it out and write the next action. Do not mention the finished action.',
  'This week\'s focus is 1 to 3 short standalone actions. Each one is a complete sentence. Do not start with the person\'s name. Do not say they marked something done, that the week moves on, or that one focus is enough. Do not use an ellipsis.',
  'Swaps may use only the profile, check-ins, and logged food and drink in the user message. That is the only allowed basis for a swap. Do not invent a food, a snack, or a drink. Do not turn an interest such as hiking into a drinking night.',
  'If profile.stopped is true, or they say they do not drink, skip every drinking and alcohol swap. Do not tell them to replace a drink, an evening drink, a drinking night, or bitters. At most one sober-positive line, and it must not tell them to replace a drink. Recovery after training stays alcohol-free.',
  'Write a drink swap only when profile.drinks is true. Exploring on its own is not drinking. profile.drinks is true for cutting down, trying to stop, weekly units above zero, or an alcohol word in logged food, a check-in note, or a reason. If profile.drinks is false, do not write "Have the first drink later" or "Alternate a drink with water".',
  'A food swap is allowed only when that food appears in loggedFood, loggedDrink, a check-in note, or dietNotes. Suggest crisps only when crisps or snacks appear there.',
  'If nothing they logged or wrote supports a swap, return one swap whose text is exactly "Log a few more meals and Thumos will suggest swaps based on what you actually eat."',
  'Nutrition, fitness, wellbeing, and this week\'s focus all follow the saved nutrition goal. Do not write a running plan, a mileage build, or a progressive distance week.',
  'When fitnessSnapshot is present, it is an estimate from their own readings, not a medical assessment. You may add one session or hold the week they already do. Never prescribe fewer sessions or fewer minutes unless they report pain, illness, injury, or poor recovery. Do not turn it into a running plan. Check with a doctor before big changes.',
  'If the goal is an elite runner, body builder, heavyweight boxer, or middleweight boxer, include training load, recovery, and fuelling around sessions. A heavyweight goal keeps size and power and does not use a deficit. A middleweight goal stays near a limit with a small change only.',
  'When the user message includes training, that object is the routine from logged workouts over the last 4 weeks: sessions per week, typical minutes, train weekdays, and rest weekdays. Maintain or progress that baseline. Never prescribe fewer sessions or fewer minutes unless they report pain, illness, injury, or poor recovery. Rest only on training.restDays. Do not invent a rest day, a full rest, or "no structured workouts" on a day they train. One row per weekday. Do not append a stock walk-and-rest week. The fitness intro must say what the log shows, for example "You train about 30 min on most days." Progress with a little more weight, one more set, or about 5 to 10 percent volume. For lose fat and build muscle, emphasise resistance training, protein, and a little easy walking or steps. A runner, boxer, or body builder keeps that sport. Check with a doctor before big changes.',
  'When training.source is "stated", the person set that week on You. Follow training.trainDays and training.dayMinutes. Rest only on training.restDays. A day in training.walkDays is a walk, not a missed gym day and not a gym session. The fitness intro states the aim, for example "You aim for 30 min on weekdays and a bit more on Saturday". If the summary says how many of those sessions they have done this week, keep that comparison. Use training.note only when they wrote one. Do not invent a time of day.',
  'Do not suggest a rapid weight cut, dehydration, a sauna, or skipping meals to make weight. A competition weigh-in belongs with a coach and a doctor.',
  'No diagnosis, no medication, no medical advice. Do not tell anyone to eat less when the figures say the intake should not fall. Do not suggest stopping alcohol suddenly.',
  'Food, steps, weight, sleep, and mood are already logged in Charioteer. Never tell the person to use another app, the same app, a tracking app, a wearable, a fitness tracker, or a named product such as MyFitnessPal, Nutracheck, Fitbit, Garmin, or Apple Health. When a habit is about tracking, name Nutrition for meals and body readings, Stats for steps, weight, and workouts, and Check-in for mood, craving, and sleep.',
  'If a limit mentions injury, pain, pregnancy, or a health condition, keep the week easy and say to check with a doctor before big changes.',
  'Shape: {"focus":[{"id":"focus-1","text":""}],"nutrition":{"targets":"","habits":[{"id":"habit-1","text":""}],"swaps":[{"id":"swap-1","text":""}]},"fitness":{"intro":"","sessions":[{"id":"session-1","text":""}]},"wellbeing":{"habits":[{"id":"well-1","text":""}]}}',
].join(' ');

/** What another member may see. Habits, swaps, sessions, targets, and limits stay off. */
export type SharedHealthPlan = {
  headline: string;
  focus: { text: string; done: boolean }[];
  ticked: number;
  total: number;
};

const UNIT_FIGURE = /\b\d[\d,.]*\s*(?:kcal|kg|g|cm|steps|bpm|hours?)\b|\b\d[\d,.]*\s*%/gi;
const NAMED_FIGURE = /\b(?:bmi|body fat|waist|lean mass)\b(?:\s*\d[\d,.]*)?|\b\d[\d,.]*\s*(?:bmi|body fat|waist|lean mass)\b/gi;

/** Drops unit-bearing readings. A bare plan such as "30 minutes" stays. */
export function redactPlanLine(text: string): string {
  const cleaned = text
    .replace(UNIT_FIGURE, ' ')
    .replace(NAMED_FIGURE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return '';
  return cleaned;
}

/**
 * Headline goal, this week's focus, and the tick count.
 * Null when the switch is off or there is no plan. Nutrition targets are never copied.
 */
export function presentSharedHealthPlan(
  plan: HealthPlan | null | undefined,
  shared: boolean,
  goal: NutritionGoal | null | undefined,
): SharedHealthPlan | null {
  if (!shared || !plan) return null;
  const focus = plan.focus.flatMap((action) => {
    const standalone = standaloneFocus(action.text);
    if (!standalone) return [];
    const text = redactPlanLine(standalone);
    if (!text) return [];
    return [{ text, done: action.done }];
  });
  return {
    headline: goal && GOAL_LABEL[goal] ? GOAL_LABEL[goal] : 'Health plan',
    focus,
    ticked: focus.filter((action) => action.done).length,
    total: focus.length,
  };
}

/** Reads the shared_health_plan payload. Anything else is hidden. */
export function parseSharedHealthPlan(value: unknown): SharedHealthPlan | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const headline = typeof row.headline === 'string' ? row.headline.trim() : '';
  const focus = (Array.isArray(row.focus) ? row.focus : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const action = item as Record<string, unknown>;
    const text = typeof action.text === 'string' ? action.text.trim() : '';
    if (!text) return [];
    return [{ text, done: action.done === true }];
  });
  if (!headline && focus.length === 0) return null;
  return {
    headline: headline || 'Health plan',
    focus,
    ticked: focus.filter((action) => action.done).length,
    total: focus.length,
  };
}
