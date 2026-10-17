/**
 * Approximate weight ranges for the stats, goal, and health-plan screens.
 * Healthy weight is NICE NG246 BMI 18.5 to 24.9 for this height.
 * A goal range is added only where a published source gives one.
 * Boxing class limits are a reference. This module never plans a weight cut.
 */

import {
  COMPETITION_NOTE,
  GOAL_LABEL,
  assessWeight,
  type BodyBuild,
  type BuilderPhase,
  type NutritionGoal,
  type NutritionSex,
} from './nutrition.ts';

export const NICE_BMI_HEALTHY_MIN = 18.5;
export const NICE_BMI_HEALTHY_MAX = 24.9;

export const NICE_BMI_URL = 'https://www.nice.org.uk/guidance/ng246';
export const NHS_OBESITY_URL = 'https://www.nhs.uk/conditions/overweight-and-obesity/';
export const NHS_BMI_URL = 'https://www.nhs.uk/health-assessment-tools/calculate-your-body-mass-index/calculate-bmi-for-adults';
export const NHS_LOSS_PACE_URL = 'https://www.nhs.uk/live-well/healthy-weight/managing-your-weight/tips-to-help-you-lose-weight/';
export const IBA_RULES_URL = 'https://www.iba.sport/wp-content/uploads/2026/06/20260415-IBA-Technical-Competition-Rules.pdf';

export const DOCTOR_NOTE = 'Check with a doctor before big changes.';
export const LOSS_PACE_KG = 'A steady loss is about 0.5 to 1 kg a week at most.';
export const LOSS_PACE_LB = 'A steady loss is about 1 to 2 lb a week at most.';
export const NO_CUT = 'This app will not plan a weight cut.';
export const NOT_BELOW = 'This app will not suggest going lower than the healthy minimum.';
export const APPROXIMATE = 'These ranges are approximate.';
export const BMI_ROUGH = 'BMI is a rough guide. It cannot tell muscle from fat.';
export const RANGE_CAVEAT = 'The NHS uses a lower BMI figure for some family backgrounds. Family background is not stored, so that figure is not applied here.';

/** Avoirdupois. One stone is 14 pounds. Matches the weight entry screen. */
const KG_PER_POUND = 0.45359237;
const POUNDS_PER_STONE = 14;

export type WeightUnitMode = 'kg' | 'stlb';

export type GoalWeightInput = {
  goal: NutritionGoal | null;
  phase?: BuilderPhase | null;
  weightClassKg?: number | null;
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: NutritionSex | null;
  build?: BodyBuild | null;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  unit?: WeightUnitMode;
};

/** highKg is null when a published class has no upper limit. lowExclusive means the class starts over lowKg. */
export type WeightSpan = { lowKg: number; highKg: number | null; lowExclusive?: boolean };

export type GoalWeightSource = { name: string; url: string };

export type GoalWeightView = {
  status: 'prompt' | 'ready';
  prompt: string | null;
  weightKg: number | null;
  healthy: WeightSpan | null;
  /** Null when this goal has no separate published weight range. The healthy band is still shown. */
  goal: (WeightSpan & { label: string }) | null;
  withinRange: boolean;
  /** Numeric gap. Null when already in range, or when a loss would be a cut or would ignore a better measure. */
  gap: string | null;
  words: string;
  pace: string | null;
  doctor: string | null;
  muscle: string | null;
  classReference: string | null;
  goalNote: string | null;
  floorNote: string | null;
  caveat: string | null;
  sources: GoalWeightSource[];
  contextLine: string;
};

const BMI_SOURCES: GoalWeightSource[] = [
  { name: 'NICE NG246: healthy weight is a BMI of 18.5 to 24.9 for most adults', url: NICE_BMI_URL },
  { name: 'NHS: overweight and obesity', url: NHS_OBESITY_URL },
  { name: 'NHS BMI calculator, for adults, not for under 18s', url: NHS_BMI_URL },
];

const PACE_SOURCE: GoalWeightSource = {
  name: 'NHS: aim to lose 0.5 to 1 kg, or 1 to 2 lb, a week',
  url: NHS_LOSS_PACE_URL,
};

const IBA_SOURCE: GoalWeightSource = {
  name: 'IBA Technical and Competition Rules, effective 15 April 2026, section 2.2',
  url: IBA_RULES_URL,
};

type ClassWindow = {
  label: string;
  /** Official lower edge. The class starts over this weight. */
  lowOver: number;
  /** Official upper edge, inclusive. Null when the table has no upper limit. */
  highTo: number | null;
  /** Heavyweight goal also covers the super-heavyweight class above the heavyweight top. */
  countsAbove: boolean;
  sentence: string;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function kgAtBmi(bmi: number, heightCm: number): number {
  const metres = heightCm / 100;
  return round1(bmi * metres * metres);
}

export function formatWeightAmount(kg: number, unit: WeightUnitMode): string {
  const rounded = round1(Math.abs(kg));
  if (unit === 'kg') return Number.isInteger(rounded) ? `${rounded} kg` : `${rounded.toFixed(1)} kg`;
  const totalPounds = rounded / KG_PER_POUND;
  let stones = Math.floor(totalPounds / POUNDS_PER_STONE);
  let pounds = round1(totalPounds - stones * POUNDS_PER_STONE);
  if (pounds >= POUNDS_PER_STONE) {
    stones += 1;
    pounds = round1(pounds - POUNDS_PER_STONE);
  }
  const poundText = Number.isInteger(pounds) ? String(pounds) : pounds.toFixed(1);
  if (stones <= 0) return `${poundText} lb`;
  if (pounds === 0) return `${stones} st`;
  return `${stones} st ${poundText} lb`;
}

function spanText(span: WeightSpan, unit: WeightUnitMode): string {
  const low = formatWeightAmount(span.lowKg, unit);
  if (span.highKg == null) return span.lowExclusive ? `over ${low}` : `${low} and above`;
  const high = formatWeightAmount(span.highKg, unit);
  return span.lowExclusive ? `over ${low} to ${high}` : `${low} to ${high}`;
}

/** Legend for a goal band. A class limit is a reference, not an approximate target. */
export function goalBandLegend(span: WeightSpan & { label: string }, unit: WeightUnitMode = 'kg'): string {
  const text = spanText(span, unit);
  return span.lowExclusive ? `${span.label}: ${text}` : `${span.label}, approximate, ${text}`;
}

function missingPrompt(missing: string[]): string {
  const list = missing.length === 1
    ? missing[0]
    : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
  return `Add your ${list}, then this range can be shown. Nothing here is guessed.`;
}

function promptView(prompt: string): GoalWeightView {
  return {
    status: 'prompt',
    prompt,
    weightKg: null,
    healthy: null,
    goal: null,
    withinRange: false,
    gap: null,
    words: prompt,
    pace: null,
    doctor: null,
    muscle: null,
    classReference: null,
    goalNote: null,
    floorNote: null,
    caveat: null,
    sources: [],
    contextLine: `Weight range: ${prompt}`,
  };
}

function loseSentence(weightKg: number, highKg: number, unit: WeightUnitMode): string | null {
  const gap = round1(weightKg - highKg);
  if (gap <= 0) return null;
  return `About ${formatWeightAmount(gap, unit)} to lose to reach the top of this range`;
}

function gainSentence(weightKg: number, lowKg: number, unit: WeightUnitMode, place: 'range' | 'class'): string | null {
  const gap = round1(lowKg - weightKg);
  if (gap <= 0) return null;
  const where = place === 'class' ? 'the bottom of this class' : 'the bottom of this range';
  return `About ${formatWeightAmount(gap, unit)} to gain to reach ${where}`;
}

function boxerClass(goal: NutritionGoal, sex: NutritionSex): ClassWindow | null {
  if (goal === 'elite_middle_boxer' && sex === 'male') {
    return {
      label: 'Middleweight class (reference)',
      lowOver: 71,
      highTo: 75,
      countsAbove: false,
      sentence: 'IBA elite men, middleweight, over 71 kg to 75 kg.',
    };
  }
  if (goal === 'elite_middle_boxer' && sex === 'female') {
    return {
      label: 'Middleweight class (reference)',
      lowOver: 70,
      highTo: 75,
      countsAbove: false,
      sentence: 'IBA elite and youth women, middleweight, over 70 kg to 75 kg.',
    };
  }
  if (goal === 'elite_heavy_boxer' && sex === 'male') {
    return {
      label: 'Heavyweight class (reference)',
      lowOver: 92,
      highTo: 100,
      countsAbove: true,
      sentence: 'IBA elite men, heavyweight, over 92 kg to 100 kg. Super heavyweight is over 100 kg.',
    };
  }
  if (goal === 'elite_heavy_boxer' && sex === 'female') {
    return {
      label: 'Heavyweight class (reference)',
      lowOver: 81,
      highTo: null,
      countsAbove: false,
      sentence: 'IBA elite and youth women, heavyweight, over 81 kg, with no upper limit in that table.',
    };
  }
  return null;
}

function classInRange(weightKg: number, klass: ClassWindow): boolean {
  if (!(weightKg > klass.lowOver)) return false;
  if (klass.highTo == null || klass.countsAbove) return true;
  return weightKg <= klass.highTo + 0.05;
}

function typedLimit(goal: NutritionGoal, weightClassKg: number | null | undefined): string | null {
  if (goal !== 'elite_middle_boxer') return null;
  if (weightClassKg == null || !Number.isFinite(weightClassKg) || weightClassKg < 40 || weightClassKg > 200) return null;
  return `You noted a limit of ${round1(weightClassKg)} kg.`;
}

function muscleNote(input: GoalWeightInput, basis: 'body_fat' | 'waist' | 'bmi' | 'none'): string {
  if (basis === 'body_fat' || basis === 'waist') {
    return `${BMI_ROUGH} Body fat or waist is the better check when you have logged it.`;
  }
  if (input.build === 'muscular') return `${BMI_ROUGH} Muscle can sit above the healthy BMI band.`;
  return BMI_ROUGH;
}

function goalCopy(goal: NutritionGoal | null, phase: BuilderPhase | null): string | null {
  const title = goal ? GOAL_LABEL[goal] : null;
  if (goal === 'lose_weight' || goal === 'maintain') return `The range for ${title} is the healthy BMI band for your height.`;
  if (goal === 'increase') return `The published range for ${title} is the healthy BMI band. There is no separate published weight above it.`;
  if (goal === 'lose_fat_build_muscle') {
    return `There is no separate published scale range for ${title}. The band is the healthy BMI range. The scales can stay still while the body changes.`;
  }
  if (goal === 'elite_runner') {
    return `There is no separate published weight range for ${title}. Lean body composition matters more than the scales.`;
  }
  if (goal === 'body_builder') {
    const cut = phase === 'cut' ? ' A cut on this screen stays modest and does not go below the healthy minimum.' : '';
    return `There is no separate published weight range for ${title}. Body fat and lean mass matter more than the scales.${cut}`;
  }
  if (goal == null) return 'Choose a goal to see a goal-level range. The band shown is the healthy BMI range.';
  return null;
}

function healthyAsGoal(goal: NutritionGoal | null, healthy: WeightSpan): (WeightSpan & { label: string }) | null {
  if (goal == null) return null;
  if (goal === 'elite_heavy_boxer' || goal === 'elite_middle_boxer') return null;
  const label = goal === 'lose_weight' || goal === 'maintain' || goal === 'increase'
    ? `Typical for ${GOAL_LABEL[goal]}`
    : `Healthy weight, used for ${GOAL_LABEL[goal]}`;
  return { ...healthy, label };
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function contextFrom(view: Omit<GoalWeightView, 'contextLine'>): string {
  if (view.status === 'prompt') return `Weight range: ${view.prompt}`;
  const parts = ['Weight range.'];
  if (view.weightKg != null) parts.push(`Current weight ${formatWeightAmount(view.weightKg, 'kg')}.`);
  if (view.healthy?.highKg != null) {
    parts.push(`Healthy weight for this height is about ${spanText(view.healthy, 'kg')}.`);
  }
  if (view.goal) parts.push(`${goalBandLegend(view.goal, 'kg')}.`);
  if (view.goalNote) parts.push(view.goalNote);
  if (view.words && view.words !== 'Within range') parts.push(sentence(view.words));
  if (view.withinRange) parts.push('Within range.');
  else if (view.gap && view.gap !== view.words) parts.push(sentence(view.gap));
  if (view.classReference) parts.push(view.classReference);
  if (view.muscle) parts.push(view.muscle);
  if (view.floorNote) parts.push(view.floorNote);
  if (view.pace) parts.push(view.pace);
  if (view.doctor) parts.push(view.doctor);
  return parts.join(' ').slice(0, 900);
}

/**
 * Height, sex, and age are all required. A missing one returns a prompt and no guessed range.
 * Under 18s get the NHS note and no adult band.
 */
export function goalWeightRange(input: GoalWeightInput): GoalWeightView {
  const unit: WeightUnitMode = input.unit === 'stlb' ? 'stlb' : 'kg';
  const view = buildRange(input, unit);
  const contextSource = unit === 'kg' ? view : buildRange(input, 'kg');
  return { ...view, contextLine: contextFrom(contextSource) };
}

function buildRange(input: GoalWeightInput, unit: WeightUnitMode): Omit<GoalWeightView, 'contextLine'> {
  const missing: string[] = [];
  if (input.heightCm == null || !(input.heightCm >= 50 && input.heightCm <= 250)) missing.push('height');
  if (input.sex !== 'female' && input.sex !== 'male') missing.push('sex');
  if (input.age == null || !Number.isFinite(input.age)) missing.push('age');
  if (missing.length) return promptView(missingPrompt(missing));
  if ((input.age as number) < 18) {
    return promptView('These adult ranges are not shown under 18. The NHS BMI calculator is not for under 18s. Nothing here is guessed.');
  }

  const heightCm = input.heightCm as number;
  const sex = input.sex as NutritionSex;
  const healthy: WeightSpan = {
    lowKg: kgAtBmi(NICE_BMI_HEALTHY_MIN, heightCm),
    highKg: kgAtBmi(NICE_BMI_HEALTHY_MAX, heightCm),
  };
  const assessment = assessWeight({
    bodyFatPct: input.bodyFatPct ?? null,
    waistCm: input.waistCm ?? null,
    weightKg: input.weightKg,
    heightCm,
    build: input.build ?? null,
    sex,
  });
  const compositionLogged = assessment.basis === 'body_fat' || assessment.basis === 'waist';
  const compositionWithin = assessment.label === 'Within the body-fat band' || assessment.label === 'Within the healthy band';
  const athleteGoal = input.goal === 'elite_runner' || input.goal === 'body_builder' || input.goal === 'elite_heavy_boxer' || input.goal === 'elite_middle_boxer';
  const suppressLoss = compositionLogged || input.build === 'muscular' || athleteGoal || input.goal === 'increase';
  const klass = input.goal === 'elite_heavy_boxer' || input.goal === 'elite_middle_boxer'
    ? boxerClass(input.goal, sex)
    : null;
  const noted = input.goal ? typedLimit(input.goal, input.weightClassKg) : null;
  const classReference = klass
    ? [klass.sentence, noted, 'This is a reference, not a target.', NO_CUT, COMPETITION_NOTE].filter(Boolean).join(' ')
    : null;
  const goal = klass
    ? {
      lowKg: klass.lowOver,
      highKg: klass.highTo,
      lowExclusive: true,
      label: klass.label,
    }
    : healthyAsGoal(input.goal, healthy);
  const goalNote = klass ? null : goalCopy(input.goal, input.phase === 'cut' || input.phase === 'surplus' ? input.phase : null);
  const muscle = muscleNote(input, assessment.basis);
  const weightKg = input.weightKg != null && Number.isFinite(input.weightKg) && input.weightKg > 0 ? round1(input.weightKg) : null;

  let withinRange = false;
  let gap: string | null = null;
  let words = 'Log a weight to see where you sit. Nothing here is guessed.';
  let pace: string | null = null;
  let floorNote: string | null = null;

  if (weightKg != null && healthy.highKg != null) {
    const underFloor = weightKg < healthy.lowKg - 0.05;
    const insideHealthy = weightKg >= healthy.lowKg - 0.05 && weightKg <= healthy.highKg + 0.05;
    if (underFloor) {
      gap = gainSentence(weightKg, healthy.lowKg, unit, 'range');
      words = gap ?? words;
      floorNote = NOT_BELOW;
    } else if (klass && input.goal) {
      const named = `For ${GOAL_LABEL[input.goal]}`;
      if (classInRange(weightKg, klass)) {
        withinRange = true;
        words = klass.countsAbove && klass.highTo != null && weightKg > klass.highTo + 0.05
          ? `${named}, you are in the super heavyweight class, over ${formatWeightAmount(klass.highTo, unit)}. This is a reference, not a target.`
          : `${named}, you are inside this class.`;
      } else if (weightKg <= klass.lowOver) {
        const gapKg = round1(klass.lowOver - weightKg);
        if (gapKg > 0 && klass.lowOver + 0.05 >= healthy.lowKg) {
          gap = `The gap to the bottom of this class is about ${formatWeightAmount(gapKg, unit)}`;
          words = `${named}, you are under this class.`;
        } else if (gapKg <= 0) {
          withinRange = true;
          words = `${named}, you are inside this class.`;
        } else {
          words = `${named}, you are under this class. This is a reference, not a target.`;
        }
      } else if (klass.highTo != null) {
        gap = `The gap above this class is about ${formatWeightAmount(round1(weightKg - klass.highTo), unit)}`;
        words = `${named}, you are above this class. This is a reference, not a target. ${NO_CUT}`;
      } else {
        words = `${named}, you are above this class. This is a reference, not a target. ${NO_CUT}`;
      }
    } else if (insideHealthy) {
      withinRange = true;
      words = 'Within range';
    } else if (weightKg > healthy.highKg) {
      if (input.goal === 'increase') {
        words = `${GOAL_LABEL[input.goal]} has no separate published weight above the healthy band.`;
      } else if (suppressLoss && compositionLogged && compositionWithin) {
        withinRange = true;
        words = 'Within range';
      } else if (suppressLoss && compositionLogged) {
        words = assessment.basis === 'body_fat'
          ? 'Body fat is the better check here, so there is no scale target.'
          : 'Waist is the better check here, so there is no scale target.';
      } else if (suppressLoss) {
        words = input.goal === 'body_builder' || input.goal === 'elite_runner'
          ? `For ${GOAL_LABEL[input.goal]}, there is no separate published weight range, so there is no scale target.`
          : input.build === 'muscular'
            ? 'Muscle can sit above the BMI band, so there is no scale target.'
            : input.goal
              ? `${GOAL_LABEL[input.goal]} has no separate published weight above the healthy band.`
              : 'There is no separate published weight above the healthy band.';
      } else {
        gap = loseSentence(weightKg, healthy.highKg, unit);
        words = gap ?? 'Within range';
        if (gap) pace = unit === 'stlb' ? LOSS_PACE_LB : LOSS_PACE_KG;
        else withinRange = true;
        if (gap && healthy.highKg < healthy.lowKg) {
          gap = null;
          pace = null;
          words = NOT_BELOW;
          floorNote = NOT_BELOW;
        }
      }
    }
  }

  const sources = [...BMI_SOURCES];
  if (pace) sources.push(PACE_SOURCE);
  if (classReference) sources.push(IBA_SOURCE);

  return {
    status: 'ready',
    prompt: null,
    weightKg,
    healthy,
    goal,
    withinRange,
    gap,
    words,
    pace,
    doctor: DOCTOR_NOTE,
    muscle,
    classReference,
    goalNote,
    floorNote,
    caveat: RANGE_CAVEAT,
    sources,
  };
}
