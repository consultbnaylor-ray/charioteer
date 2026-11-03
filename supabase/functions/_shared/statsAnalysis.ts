/**
 * Summaries the stats analysis may send to xAI.
 * Raw samples, epoch slices, activity files, routes, and women's health are not fields here.
 */
import { formatUkCompactDay } from './healthInsights.ts';
import { RESTING_AEROBIC_TIP, SLEEP_WAKE_TIP, STEP_WALK_TIP, VO2_ANALYSIS_RULE, vo2IntervalPhrase, type HeartRateMax } from './trainingGuidance.ts';

export const ANALYSIS_STAT_IDS = [
  'steps',
  'sleep_hours',
  'sleep_score',
  'sleep_duration',
  'resting_heart_rate',
  'vo2',
  'weight_kg',
  'body_fat',
  'bmi',
  'weekly_active_minutes',
  'vigorous',
  'stress',
  'stress_detail',
  'body_battery_charged',
  'body_battery_drained',
  'body_battery_highest',
  'body_battery_lowest',
  'pulse_ox',
  'respiration',
  'skin_temp',
  'blood_pressure',
  'diastolic',
  'snapshot_heart',
  'epoch_minutes',
  'move_iq',
  'activity_detail',
  'hrv',
  'hrv_sdnn',
  'fitness_age',
] as const;

export type AnalysisStatId = (typeof ANALYSIS_STAT_IDS)[number];

const ID_SET = new Set<string>(ANALYSIS_STAT_IDS);

export const ANALYSIS_RATINGS = ['Excellent', 'Good', 'Fair', 'Poor', 'Usual', 'No rating yet'] as const;

export const ANALYSIS_TRENDS = ['up', 'down', 'steady', 'none'] as const;

export const ANALYSIS_STAT_NAMES: Record<AnalysisStatId, string> = {
  steps: 'Steps',
  sleep_hours: 'Sleep hours',
  sleep_score: 'Sleep score',
  sleep_duration: 'Sleep duration',
  resting_heart_rate: 'Resting heart rate',
  vo2: 'VO2 max',
  weight_kg: 'Weight',
  body_fat: 'Body fat',
  bmi: 'BMI',
  weekly_active_minutes: 'Weekly active minutes',
  vigorous: 'Vigorous minutes',
  stress: 'Stress',
  stress_detail: 'Stress detail',
  body_battery_charged: 'Body battery charged',
  body_battery_drained: 'Body battery drained',
  body_battery_highest: 'Body battery highest',
  body_battery_lowest: 'Body battery lowest',
  pulse_ox: 'Pulse ox',
  respiration: 'Breathing rate',
  skin_temp: 'Skin temperature',
  blood_pressure: 'Blood pressure',
  diastolic: 'Diastolic pressure',
  snapshot_heart: 'Health snapshot',
  epoch_minutes: 'Epoch active minutes',
  move_iq: 'Move IQ',
  activity_detail: 'Activity length',
  hrv: 'Garmin heart-rate variability',
  hrv_sdnn: 'Apple heart-rate variability',
  fitness_age: 'Fitness age',
};

export type AnalysisStat = {
  id: AnalysisStatId;
  name: string;
  /** Recent daily average, or the weekly total for minute guides. This is the rated figure. */
  value: number | null;
  latest: number | null;
  average: number | null;
  /** Today's still-open total, only when it is well below the recent days. */
  today: number | null;
  trend: (typeof ANALYSIS_TRENDS)[number];
  rating: (typeof ANALYSIS_RATINGS)[number];
  range: string;
  tip: string | null;
  /** App target for the saved goal, such as 56–62 ml/kg/min. Null when this stat has no goal band. */
  goalTarget: string | null;
  /** How far the figure sits past that target. Null when it meets the target or there is no band. */
  goalGap: number | null;
};

export type StatsAnalysisPayload = {
  age: number | null;
  sex: 'female' | 'male' | null;
  goal: string | null;
  /** Fitness-age aim the person chose. A label, not a measurement. */
  fitnessGoal?: string | null;
  /** App-derived VO2 max target for that fitness age. */
  vo2Goal?: string | null;
  /** Set when weight loss and a harder fitness aim need both fuel and a deficit. */
  fuelNote?: string | null;
  /** True only after the person accepted the competition-cut notice. */
  competitionCut?: boolean | null;
  /**
   * App-derived calorie line for a saved target weight and date.
   * Built on the phone from weight, target, date, and estimated burn. Not a new health measurement.
   */
  weightPlan?: string | null;
  /**
   * App-derived maximum heart rate from stored heart-rate readings, or 220 minus age.
   * Not a new measurement. Sent so interval targets can be written in bpm.
   */
  maxHeartRate?: HeartRateMax | null;
  /**
   * Logged meals and the targets already used on Nutrition and Daily Targets.
   * Averages are totals already stored, not a new measurement.
   */
  nutrition?: NutritionBrief | null;
  stats: AnalysisStat[];
};

export type LoggedMeal = {
  /** UK calendar date, such as 3 Nov 2026. No clock time. */
  day: string;
  slot: string;
  name: string;
  kcal: number | null;
  proteinG: number | null;
  estimated: boolean;
};

export type NutritionBrief = {
  loggedDays: number;
  averageKcal: number | null;
  averageProteinG: number | null;
  calorieTarget: number | null;
  proteinTargetG: number | null;
  /** Saved target, the training-goal figure, or the middle of the 1.6 to 2.2 g per kg guide. */
  proteinTargetSource: 'saved' | 'goal' | 'guide' | null;
  proteinGuide: string;
  meals: LoggedMeal[];
  improvements: string[];
};

export const ANALYSIS_SECTION_TITLES = [
  'Overview',
  'Cardio/VO2',
  'Steps & movement',
  'Sleep & recovery',
  'Nutrition: calories & protein',
  'This week',
] as const;

export type AnalysisSectionTitle = (typeof ANALYSIS_SECTION_TITLES)[number];

export type AnalysisSection = {
  title: AnalysisSectionTitle;
  body: string;
};

export const PROTEIN_GUIDE_RANGE =
  'About 1.6 to 2.2 g per kg of body weight is a general guide for someone who trains, including a boxer. It is not a prescription.';

export const STATS_ANALYSIS_PROMPT = [
  'Write a plain overview from the JSON only. Do not invent numbers.',
  'Open with one overall verdict against a healthy person of this age. Name the sport goal when one is set.',
  'If most ratings are Poor, say so plainly. Do not soften it.',
  'If the picture is mixed, say it looks reasonable for their age and that improvements could be made.',
  'If the ratings are mostly Good or Excellent and no stat has a goalGap, say it looks strong and to keep up the good work.',
  'A stat with a goalGap is short of the saved goal. It is not a strength, even when the rating is Good or Excellent. Say it is fine for their age, but short of the goal by that gap, and name goalTarget.',
  'Do not say keep up the good work when any stat has a goalGap. Say it is strong for their age, but some way off the goal.',
  'Return a JSON array only, with no markdown. Each item is {"title":"...","body":"..."}.',
  'Use these titles in this order: Overview, Cardio/VO2, Steps & movement, Sleep & recovery, Nutrition: calories & protein, This week.',
  'Each body is one short paragraph. Do not put a blank line inside a body. The app separates sections with a blank line.',
  'Overview is the overall summary, then one short strengths line if any qualify. Put each improvement in the matching section, largest goalGap first.',
  'Always include Nutrition: calories & protein. State the daily calorie target and the daily protein target in grams. Review the meals: UK dates, names, and the kcal and protein already stored. Give 2 to 4 specific practical changes based on those meals, using improvements when they are present. Do not invent a meal that is not listed. Do not include a clock time. If loggedDays is under 2, or nutrition is missing, say there is not enough logged food to compare intake. If fuelNote is set, say that trade-off: do not cut calories so far that training fuel is lost. If fitnessGoal or vo2Goal is set, the Cardio section uses that VO2 target. Estimates are a general guide. Not medical advice.',
  'Always include This week, with one or two practical steps.',
  'Then one short strengths line. Name at most three stats that are Good or Excellent and have no goalGap. If none qualify, do not invent a strength.',
  'Usual and No rating yet are not strengths and not levers.',
  'Then the things to improve. Lead with the largest goalGap, then the next, then Fair and Poor. Do not mention the same thing twice.',
  'For each, say why it matters and give one or two specific steps. Do not copy the range sentence, the rating word, or the tip already in the JSON.',
  VO2_ANALYSIS_RULE,
  'When weightPlan is set, state that daily calorie figure and the date in the overview. If it says the date is faster than 1 kg a week, say so and give the safer pace or later date in that sentence. Do not invent a different calorie number. This matches the Daily Targets card.',
  'If competitionCut is true, this is a short competition weight cut. Keep the calorie figure at or above the floor already in weightPlan, protect protein, and plan refeeding and rehydration after weigh-in. Dizziness, fainting, confusion, or a racing heart means stop and get urgent help. Never advise fluid restriction, a sauna, a sweat suit, diuretics, or laxatives. Say to see a qualified coach, doctor, or dietitian. General information, not medical advice.',
  'A high resting heart rate is easy aerobic work and walks, not the VO2 intervals. Short sleep keeps a steady wake time. Low steps are a short walk. Do not swap those.',
  'Say how the figures fit together and the order to work on them.',
  'Quote value. That is the recent average, or a total over the last 7 days when the range says so. Do not headline today.',
  'Do not list every stat at the end.',
  'Do not diagnose. Do not predict how long the person will live. Do not mention location or women\'s health.',
  'Do not write a medical caveat. The app shows that line.',
].join(' ');

const BANNED = /\b(diagnos\w*|obese|overweight|lifespan|you will die)\b/i;

export function analysisTextOk(text: string): boolean {
  const trimmed = text.trim();
  const flat = trimmed.replace(/\s+/g, ' ');
  if (flat.length < 40 || flat.length > 5000) return false;
  if (/\n{3,}/.test(trimmed)) return false;
  return !BANNED.test(flat);
}

export function analysisParagraphs(text: string): string[] {
  const parts = text.split(/\n\s*\n/).map((part) => part.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  return parts.length > 0 ? parts : [text.trim()];
}

function statName(stat: AnalysisStat): string {
  return stat.name || ANALYSIS_STAT_NAMES[stat.id] || stat.id.replace(/_/g, ' ');
}

function figureOf(stat: AnalysisStat): string {
  const figure = stat.value ?? stat.average ?? stat.latest;
  return figure == null ? '' : ` ${figure}`;
}

export function localStatsVerdict(payload: StatsAnalysisPayload): string {
  return sectionsToText(localAnalysisSections(payload));
}

export function localAnalysisSections(payload: StatsAnalysisPayload): AnalysisSection[] {
  const age = payload.age != null ? ` for someone aged ${Math.round(payload.age)}` : '';
  const goal = payload.goal ? ` The saved aim is ${payload.goal}.` : '';
  const poor = payload.stats.filter((stat) => stat.rating === 'Fair' || stat.rating === 'Poor');
  const short = payload.stats.filter((stat) => stat.goalGap != null && stat.goalGap > 0)
    .sort((left, right) => (right.goalGap ?? 0) - (left.goalGap ?? 0));
  const shortIds = new Set(short.map((stat) => stat.id));
  const good = payload.stats.filter((stat) => (stat.rating === 'Good' || stat.rating === 'Excellent') && !shortIds.has(stat.id));
  const strengthLine = good.length
    ? `Strengths: ${good.slice(0, 3).map((stat) => `${statName(stat)}${figureOf(stat)}`).join(', ')}.`
    : '';
  const work = [...short, ...poor.filter((stat) => !shortIds.has(stat.id))].slice(0, 4);
  const planLine = payload.weightPlan ? ` ${payload.weightPlan}` : '';
  let verdict = `There are not enough rated readings yet for an overall view${age}.${goal}`;
  if (good.length + poor.length + short.length > 0) {
    if (short.length > 0) {
      const ageBit = good.length + short.length > poor.length ? 'Strong for your age' : 'Your overall health looks mixed for your age';
      verdict = `${ageBit}, but some way off the saved goal.${goal}${planLine}`;
    } else if (poor.length > good.length && poor.length >= 3) {
      verdict = `Most of these ratings are Poor or Fair${age}.${goal}${planLine}`;
    } else if (good.length >= 3 && poor.length === 0) {
      verdict = `Your overall health looks strong${age}.${goal} Keep up the good work.${planLine}`;
    } else {
      verdict = `Your overall health looks reasonable${age}, but improvements could be made.${goal}${planLine}`;
    }
  }
  const grouped = new Map<AnalysisSectionTitle, string[]>();
  for (const stat of work) {
    const title = sectionForStat(stat.id);
    const list = grouped.get(title) ?? [];
    list.push(improvementParagraph(stat, payload.maxHeartRate ?? null));
    grouped.set(title, list);
  }
  const overviewExtra = grouped.get('Overview') ?? [];
  grouped.delete('Overview');
  const sections: AnalysisSection[] = [{
    title: 'Overview',
    body: tidy([verdict, strengthLine, ...overviewExtra].join(' ')),
  }];
  for (const title of ['Cardio/VO2', 'Steps & movement', 'Sleep & recovery'] as const) {
    const body = tidy((grouped.get(title) ?? []).join(' '));
    if (body) sections.push({ title, body });
  }
  sections.push({ title: 'Nutrition: calories & protein', body: nutritionSection(payload) });
  sections.push({ title: 'This week', body: thisWeek(work.map((stat) => improvementParagraph(stat, payload.maxHeartRate ?? null))) });
  return sections;
}

const CARDIO_IDS = new Set<AnalysisStatId>(['vo2', 'fitness_age', 'resting_heart_rate']);
const STEP_IDS = new Set<AnalysisStatId>(['steps', 'weekly_active_minutes', 'vigorous', 'epoch_minutes', 'move_iq', 'activity_detail']);
const SLEEP_IDS = new Set<AnalysisStatId>(['sleep_hours', 'sleep_score', 'sleep_duration', 'hrv', 'hrv_sdnn', 'stress', 'stress_detail', 'body_battery_charged', 'body_battery_drained', 'body_battery_highest', 'body_battery_lowest']);

export function proteinGuideFor(weightKg: number | null): string {
  if (weightKg == null || !(weightKg >= 30 && weightKg <= 300)) return PROTEIN_GUIDE_RANGE;
  const low = Math.round(weightKg * 1.6);
  const high = Math.round(weightKg * 2.2);
  return `${PROTEIN_GUIDE_RANGE} At ${Math.round(weightKg)} kg that is about ${low} to ${high} g a day.`;
}

export function kcalFromWeightPlan(line: string | null | undefined): number | null {
  const match = /target ([\d,]+) kcal/i.exec(line ?? '');
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return value >= 800 && value <= 6000 ? Math.round(value) : null;
}

type MealRow = {
  eatenOn: string;
  meal?: string;
  note?: string;
  estimated?: boolean;
  portion?: number;
  items: readonly { name?: string; kcal?: number; proteinG?: number }[];
};

const SLOT_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/** Recent days that have a meal. Empty days are not treated as zero. */
export function nutritionBriefFromLogs(input: {
  today: string;
  logs: readonly MealRow[];
  weightKg: number | null;
  calorieTarget: number | null;
  proteinTargetG: number | null;
  /** Goal-specific grams when no saved protein target is set. */
  goalProteinG?: number | null;
  hideCalories?: boolean;
  days?: number;
}): NutritionBrief {
  const span = input.days ?? 7;
  const start = shiftIso(input.today, -(span - 1));
  const hide = input.hideCalories === true;
  const byDay = new Map<string, { kcal: number; protein: number }>();
  const collected: (LoggedMeal & { iso: string })[] = [];
  for (const log of input.logs) {
    const day = log.eatenOn.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < start || day > input.today) continue;
    const portion = log.portion != null && log.portion > 0 ? log.portion : 1;
    let kcal = 0;
    let protein = 0;
    const names: string[] = [];
    for (const item of log.items) {
      if (item.kcal != null && item.kcal > 0) kcal += item.kcal * portion;
      if (item.proteinG != null && item.proteinG > 0) protein += item.proteinG * portion;
      const name = cleanMealName(item.name ?? '');
      if (name) names.push(name);
    }
    if (kcal <= 0 && protein <= 0 && names.length === 0 && !cleanMealName(log.note ?? '')) continue;
    const current = byDay.get(day) ?? { kcal: 0, protein: 0 };
    byDay.set(day, { kcal: current.kcal + kcal, protein: current.protein + protein });
    collected.push({
      iso: day,
      day: formatUkCompactDay(day),
      slot: SLOT_LABEL[log.meal ?? ''] ?? 'Meal',
      name: (names.join(', ') || cleanMealName(log.note ?? '') || 'Logged meal').slice(0, 80),
      kcal: hide ? null : Math.round(kcal),
      proteinG: Math.round(protein),
      estimated: log.estimated === true,
    });
  }
  collected.sort((left, right) => right.iso.localeCompare(left.iso) || (SLOT_RANK[right.slot] ?? '2').localeCompare(SLOT_RANK[left.slot] ?? '2'));
  const shown = collected.slice(0, 12).map(({ iso: _iso, ...meal }) => meal);
  const days = [...byDay.values()];
  const average = (pick: (row: { kcal: number; protein: number }) => number) =>
    days.length ? Math.round(days.reduce((sum, row) => sum + pick(row), 0) / days.length) : null;
  const savedProtein = boundedNumber(input.proteinTargetG, 1, 400);
  const goalProtein = boundedNumber(input.goalProteinG ?? null, 1, 400);
  const guideProtein = input.weightKg != null && input.weightKg >= 30 && input.weightKg <= 300 ? Math.round(input.weightKg * 1.9) : null;
  const proteinTargetG = savedProtein ?? goalProtein ?? guideProtein;
  const proteinTargetSource = savedProtein != null ? 'saved' : goalProtein != null ? 'goal' : guideProtein != null ? 'guide' : null;
  const brief: NutritionBrief = {
    loggedDays: days.length,
    averageKcal: hide ? null : average((row) => row.kcal),
    averageProteinG: average((row) => row.protein),
    calorieTarget: hide ? null : boundedNumber(input.calorieTarget, 800, 6000),
    proteinTargetG,
    proteinTargetSource,
    proteinGuide: proteinGuideFor(input.weightKg),
    meals: shown,
    improvements: [],
  };
  brief.improvements = mealImprovements(shown, brief);
  return brief;
}

const SLOT_RANK: Record<string, string> = { Breakfast: '1', Lunch: '2', Dinner: '3', Snack: '4', Meal: '2' };

export function mealImprovements(
  meals: readonly LoggedMeal[],
  brief: Pick<NutritionBrief, 'calorieTarget' | 'proteinTargetG' | 'averageKcal' | 'averageProteinG'>,
): string[] {
  const tips: string[] = [];
  const breakfasts = meals.filter((meal) => meal.slot === 'Breakfast' && meal.proteinG != null);
  if (breakfasts.length) {
    const mean = breakfasts.reduce((sum, meal) => sum + (meal.proteinG ?? 0), 0) / breakfasts.length;
    if (mean < 20 || (brief.proteinTargetG != null && mean < brief.proteinTargetG * 0.2)) {
      tips.push('Breakfast is low in protein, so add Greek yoghurt or eggs.');
    }
  }
  if (brief.calorieTarget != null) {
    const byDay = new Map<string, { total: number; snack: number }>();
    for (const meal of meals) {
      const row = byDay.get(meal.day) ?? { total: 0, snack: 0 };
      row.total += meal.kcal ?? 0;
      if (meal.slot === 'Snack') row.snack += meal.kcal ?? 0;
      byDay.set(meal.day, row);
    }
    const over = [...byDay.values()].some((day) => day.snack > 0 && day.total > (brief.calorieTarget ?? 0) && day.snack >= day.total * 0.15);
    if (over) tips.push('Evening snacks push you over the calorie target.');
  }
  if (brief.proteinTargetG != null && brief.averageProteinG != null && brief.averageProteinG < brief.proteinTargetG * 0.9) {
    const light = meals
      .filter((meal) => meal.proteinG != null && meal.slot !== 'Snack' && meal.name !== 'Logged meal')
      .sort((left, right) => (left.proteinG ?? 0) - (right.proteinG ?? 0))[0];
    if (light && !tips.some((tip) => tip.startsWith('Breakfast') && light.slot === 'Breakfast')) {
      tips.push(`${light.slot} is light on protein (${light.name}). Add chicken, eggs, yoghurt, or fish.`);
    } else if (!tips.some((tip) => tip.startsWith('Breakfast'))) {
      tips.push('Protein is under the daily target. Add a protein food at the meal you usually rush.');
    }
  }
  if (brief.calorieTarget != null && brief.averageKcal != null && brief.averageKcal > brief.calorieTarget * 1.1) {
    tips.push('Logged days sit above the calorie target. Trim the largest meal rather than skipping one.');
  }
  if (meals.some((meal) => meal.estimated)) {
    tips.push('Some meals are estimates from a photo or a description, so treat the grams as a guide.');
  }
  if (tips.length < 2 && meals.length) tips.push('Keep a protein food at breakfast, lunch, and dinner, and stay near the daily targets.');
  return [...new Set(tips)].slice(0, 4);
}

export function intakeContextLine(brief: NutritionBrief): string {
  return nutritionReviewLines(brief).join(' ');
}

export function sectionsToText(sections: readonly AnalysisSection[]): string {
  return sections
    .map((section) => `${section.title}\n${keepParagraphs(section.body)}`)
    .filter((block) => block.length > sectionTitleLength(block))
    .join('\n\n');
}

/** The card always shows this review under Nutrition, even if the model wrote something thinner. */
export function withNutritionReview(
  sections: readonly AnalysisSection[],
  brief: NutritionBrief | null | undefined,
  notes?: { fitnessGoal?: string | null; vo2Goal?: string | null; fuelNote?: string | null },
): AnalysisSection[] {
  const lines = brief ? [...nutritionReviewLines(brief)] : [];
  const aim = [notes?.fitnessGoal ? `Fitness goal: ${notes.fitnessGoal}.` : '', notes?.vo2Goal ? `VO2 max target ${notes.vo2Goal}.` : ''].filter(Boolean).join(' ');
  if (aim) lines.splice(Math.min(1, lines.length), 0, aim);
  if (notes?.fuelNote) lines.splice(Math.max(lines.length - 1, 0), 0, notes.fuelNote);
  if (!lines.length) return [...sections];
  const nutrition: AnalysisSection = {
    title: 'Nutrition: calories & protein',
    body: lines.join('\n\n'),
  };
  const rest = sections.filter((section) => section.title !== nutrition.title);
  const week = rest.findIndex((section) => section.title === 'This week');
  if (week >= 0) return [...rest.slice(0, week), nutrition, ...rest.slice(week)];
  return [...rest, nutrition];
}

export function resolvedAnalysisSections(
  modelText: string,
  payload: StatsAnalysisPayload,
): { sections: AnalysisSection[]; source: 'model' | 'local' } {
  const trimmed = modelText.trim();
  if (trimmed) {
    const parsed = parseModelSections(trimmed);
    if (parsed && parsed.length >= 2 && sectionsOk(parsed)) {
      return { sections: ensureRequired(parsed, payload), source: 'model' };
    }
    if (analysisTextOk(trimmed)) {
      const split = analysisSectionsFromText(trimmed);
      if (split.length) return { sections: ensureRequired(split, payload), source: 'model' };
    }
  }
  return { sections: localAnalysisSections(payload), source: 'local' };
}

export function coerceAnalysisSections(value: unknown, fallbackText = ''): AnalysisSection[] {
  if (Array.isArray(value)) {
    const sections = value.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as { title?: unknown; body?: unknown };
      const title = canonicalTitle(typeof row.title === 'string' ? row.title : '');
      const body = keepParagraphs(typeof row.body === 'string' ? row.body : '');
      if (!title || !body) return [];
      return [{ title, body }];
    });
    const merged = mergeSections(sections);
    if (merged.length) return merged;
  }
  return analysisSectionsFromText(fallbackText);
}

/** Blank lines first. A single block is split into sentences and grouped by topic. */
export function analysisSectionsFromText(text: string): AnalysisSection[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parsed = parseModelSections(trimmed);
  if (parsed?.length) return parsed;
  const blocks = trimmed.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length > 1) {
    const sections = blocks.flatMap((block) => {
      const section = blockToSection(block);
      return section ? [section] : [];
    });
    return mergeSections(sections);
  }
  const parts = sentencesOf(blocks[0] ?? trimmed);
  if (parts.length <= 1) {
    return [{ title: 'Overview', body: tidy(trimmed) }];
  }
  const groups = new Map<AnalysisSectionTitle, string[]>();
  for (const sentence of parts) {
    const title = bucketTitle(sentence);
    const list = groups.get(title) ?? [];
    list.push(sentence);
    groups.set(title, list);
  }
  return ANALYSIS_SECTION_TITLES.flatMap((title) => {
    const body = tidy((groups.get(title) ?? []).join(' '));
    return body ? [{ title, body }] : [];
  });
}

function sectionForStat(id: AnalysisStatId): AnalysisSectionTitle {
  if (CARDIO_IDS.has(id)) return 'Cardio/VO2';
  if (STEP_IDS.has(id)) return 'Steps & movement';
  if (SLEEP_IDS.has(id)) return 'Sleep & recovery';
  return 'Overview';
}

function nutritionSection(payload: StatsAnalysisPayload): string {
  return nutritionReviewLines(nutritionBriefOf(payload)).join('\n\n');
}

/** The same review the health-plan card and Thumos chat both send. One line per point. */
export function nutritionReviewLines(brief: NutritionBrief): string[] {
  const lines = [dailyTargetSentence(brief)];
  if (brief.loggedDays < 2) {
    lines.push('There is not enough logged food yet to compare intake with the targets.');
  } else if (brief.averageKcal != null) {
    lines.push(`Logged meals on ${brief.loggedDays} days average about ${countText(brief.averageKcal)} kcal and ${countText(brief.averageProteinG ?? 0)} g protein.`);
  } else {
    lines.push(`Logged meals on ${brief.loggedDays} days average about ${countText(brief.averageProteinG ?? 0)} g protein. Calories stay hidden.`);
  }
  if (brief.averageKcal != null && brief.calorieTarget != null) {
    lines.push(`Intake is ${compareWord(brief.averageKcal, brief.calorieTarget)} the daily calorie target of ${countText(brief.calorieTarget)} kcal.`);
  }
  if (brief.averageProteinG != null && brief.proteinTargetG != null && brief.loggedDays >= 2) {
    lines.push(`Protein is ${compareWord(brief.averageProteinG, brief.proteinTargetG)} the daily protein target of ${countText(brief.proteinTargetG)} g.`);
  }
  for (const meal of brief.meals) lines.push(mealSentence(meal));
  for (const tip of brief.improvements) lines.push(tip);
  if (brief.proteinGuide) lines.push(brief.proteinGuide);
  lines.push('Not medical advice.');
  return lines.map((line) => tidy(line)).filter(Boolean);
}

function nutritionBriefOf(payload: StatsAnalysisPayload): NutritionBrief {
  return payload.nutrition ?? {
    loggedDays: 0,
    averageKcal: null,
    averageProteinG: null,
    calorieTarget: kcalFromWeightPlan(payload.weightPlan),
    proteinTargetG: null,
    proteinTargetSource: null,
    proteinGuide: proteinGuideFor(weightKgOf(payload)),
    meals: [],
    improvements: [],
  };
}

function dailyTargetSentence(brief: Pick<NutritionBrief, 'calorieTarget' | 'proteinTargetG' | 'proteinTargetSource'>): string {
  const kcal = brief.calorieTarget != null ? `${countText(brief.calorieTarget)} kcal` : 'no calorie target saved yet';
  if (brief.proteinTargetG == null) return `Daily targets: ${kcal}, and no protein target in grams yet.`;
  const grams = `${countText(brief.proteinTargetG)} g protein`;
  if (brief.proteinTargetSource === 'goal') return `Daily targets: ${kcal} and about ${grams} for this training goal. That sits inside a general guide of 1.6 to 2.2 g per kg. Not a prescription.`;
  if (brief.proteinTargetSource === 'guide') return `Daily targets: ${kcal} and about ${grams}, the middle of a general guide of 1.6 to 2.2 g per kg. Not a prescription.`;
  return `Daily targets: ${kcal} and ${grams}.`;
}

function mealSentence(meal: LoggedMeal): string {
  const macros = [
    meal.kcal != null ? `${countText(meal.kcal)} kcal` : '',
    meal.proteinG != null ? `${countText(meal.proteinG)} g protein` : '',
  ].filter(Boolean).join(', ');
  const estimate = meal.estimated ? ' Estimate.' : '';
  return `${meal.day}, ${meal.slot}: ${meal.name}.${macros ? ` ${macros}.` : ''}${estimate}`;
}

function cleanMealName(value: string): string {
  return value.replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function thisWeek(improvements: readonly string[]): string {
  const tips = improvements.slice(0, 2).map(firstSentence).filter(Boolean);
  if (!tips.length) return 'Keep the sessions already in the week, and log meals on training days. Not medical advice.';
  return tidy(`This week: ${tips.join(' ')} Not medical advice.`);
}

function ensureRequired(sections: readonly AnalysisSection[], payload: StatsAnalysisPayload): AnalysisSection[] {
  const merged = mergeSections(sections.filter((section) => section.title !== 'Nutrition: calories & protein'));
  if (!merged.some((section) => section.title === 'This week')) {
    merged.push({ title: 'This week', body: thisWeek([]) });
  }
  return withNutritionReview(merged, nutritionBriefOf(payload), {
    fitnessGoal: payload.fitnessGoal,
    vo2Goal: payload.vo2Goal,
    fuelNote: payload.fuelNote,
  });
}

function weightKgOf(payload: StatsAnalysisPayload): number | null {
  const stat = payload.stats.find((item) => item.id === 'weight_kg');
  const value = stat?.value ?? stat?.latest ?? null;
  return value != null && value >= 30 && value <= 300 ? value : null;
}

function compareWord(actual: number, target: number): string {
  if (actual > target * 1.1) return 'above';
  if (actual < target * 0.9) return 'under';
  return 'close to';
}

function firstSentence(text: string): string {
  const match = tidy(text).match(/^.*?[.!?](?:\s|$)/);
  return match ? match[0].trim() : tidy(text);
}

function sentencesOf(text: string): string[] {
  return tidy(text).split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((part) => part.trim()).filter(Boolean);
}

function bucketTitle(sentence: string): AnalysisSectionTitle {
  if (/\b(protein|kcal|calorie|nutrition|meal)\b/i.test(sentence)) return 'Nutrition: calories & protein';
  if (/\b(vo2|cardio|interval|bpm|heart rate|aerobic)\b/i.test(sentence)) return 'Cardio/VO2';
  if (/\b(sleep|recover|hrv)\b/i.test(sentence)) return 'Sleep & recovery';
  if (/\b(steps?|walk\w*|movement)\b/i.test(sentence)) return 'Steps & movement';
  if (/\bthis week\b/i.test(sentence)) return 'This week';
  return 'Overview';
}

function blockToSection(block: string): AnalysisSection | null {
  const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
  const title = canonicalTitle(lines[0] ?? '');
  if (title && lines.length > 1) return { title, body: tidy(lines.slice(1).join(' ')) };
  const body = tidy(block);
  if (!body) return null;
  return { title: bucketTitle(body), body };
}

function parseModelSections(text: string): AnalysisSection[] | null {
  const cleaned = text.replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    if (!Array.isArray(value)) return null;
    const sections = value.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as { title?: unknown; body?: unknown };
      const title = canonicalTitle(typeof row.title === 'string' ? row.title : '');
      const body = tidy(typeof row.body === 'string' ? row.body : '');
      if (!title || body.length < 20 || body.length > 1600 || BANNED.test(body)) return [];
      return [{ title, body }];
    });
    return sections.length ? mergeSections(sections) : null;
  } catch {
    return null;
  }
}

function canonicalTitle(value: string): AnalysisSectionTitle | null {
  const key = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (key === 'overview') return 'Overview';
  if (key === 'cardio vo2' || key === 'cardio' || key === 'vo2') return 'Cardio/VO2';
  if (key.startsWith('steps')) return 'Steps & movement';
  if (key.startsWith('sleep')) return 'Sleep & recovery';
  if (key.startsWith('nutrition')) return 'Nutrition: calories & protein';
  if (key.startsWith('this week')) return 'This week';
  return null;
}

function mergeSections(sections: readonly AnalysisSection[]): AnalysisSection[] {
  const byTitle = new Map<AnalysisSectionTitle, string[]>();
  for (const section of sections) {
    const list = byTitle.get(section.title) ?? [];
    if (section.body) list.push(section.body);
    byTitle.set(section.title, list);
  }
  return ANALYSIS_SECTION_TITLES.flatMap((title) => {
    const body = keepParagraphs((byTitle.get(title) ?? []).join('\n\n'));
    return body ? [{ title, body }] : [];
  });
}

function sectionsOk(sections: readonly AnalysisSection[]): boolean {
  const flat = sections.map((section) => section.body).join(' ');
  return flat.length >= 40 && flat.length <= 5000 && !BANNED.test(flat);
}

function sectionTitleLength(block: string): number {
  return block.indexOf('\n') + 1;
}

function tidy(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function keepParagraphs(value: string): string {
  return value.split(/\n\s*\n/).map((part) => part.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n\n');
}

function countText(value: number): string {
  return Math.round(value).toLocaleString('en-GB');
}

function boundedNumber(value: number | null, min: number, max: number): number | null {
  if (value == null || !Number.isFinite(value) || value < min || value > max) return null;
  return Math.round(value);
}

function shiftIso(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nutritionField(value: unknown): NutritionBrief | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const logged = finite(row.loggedDays);
  const loggedDays = logged != null && logged >= 0 && logged <= 30 ? Math.round(logged) : 0;
  const proteinGuide = text(row.proteinGuide, 320) || PROTEIN_GUIDE_RANGE;
  const source = row.proteinTargetSource === 'saved' || row.proteinTargetSource === 'goal' || row.proteinTargetSource === 'guide'
    ? row.proteinTargetSource
    : null;
  return {
    loggedDays,
    averageKcal: bounded(row.averageKcal, 0, 8000),
    averageProteinG: bounded(row.averageProteinG, 0, 400),
    calorieTarget: bounded(row.calorieTarget, 800, 6000),
    proteinTargetG: bounded(row.proteinTargetG, 1, 400),
    proteinTargetSource: source,
    proteinGuide,
    meals: mealField(row.meals),
    improvements: improvementField(row.improvements),
  };
}

function mealField(value: unknown): LoggedMeal[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const day = text(row.day, 40);
    const name = text(row.name, 80);
    if (!day || !name || /\d{4}-\d{2}-\d{2}T|T\d{2}:\d{2}/.test(`${day} ${name}`)) return [];
    const slot = text(row.slot, 20) || 'Meal';
    return [{
      day,
      slot,
      name,
      kcal: bounded(row.kcal, 0, 4000),
      proteinG: bounded(row.proteinG, 0, 300),
      estimated: row.estimated === true,
    }];
  });
}

function improvementField(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).flatMap((item) => {
    const line = text(item, 180);
    return line ? [line] : [];
  });
}

function bounded(value: unknown, min: number, max: number): number | null {
  const number = finite(value);
  if (number == null || number < min || number > max) return null;
  return Math.round(number);
}

function improvementParagraph(stat: AnalysisStat, max: HeartRateMax | null): string {
  const name = statName(stat);
  const gap = stat.goalGap != null && stat.goalGap > 0 && stat.goalTarget
    ? `${name} is ${stat.goalGap} short of ${stat.goalTarget}.`
    : `${name} is ${stat.rating.toLowerCase()} at${figureOf(stat)}.`;
  if (stat.id === 'vo2' || stat.id === 'fitness_age') return `${gap} ${vo2IntervalPhrase(max)}`;
  if (stat.id === 'steps') return `${gap} ${STEP_WALK_TIP}`;
  if (stat.id === 'sleep_hours' || stat.id === 'sleep_score' || stat.id === 'sleep_duration') return `${gap} ${SLEEP_WAKE_TIP}`;
  if (stat.id === 'resting_heart_rate') return `${gap} ${RESTING_AEROBIC_TIP}`;
  return gap;
}

function finite(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) > 100000) return null;
  return rounded;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Drops every key that is not a summary field. Location and women's health cannot survive this. */
export function sanitizeStatsAnalysis(input: unknown): StatsAnalysisPayload | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const age = finite(record.age);
  const sex = record.sex === 'female' || record.sex === 'male' ? record.sex : null;
  const goal = text(record.goal, 80);
  if (!Array.isArray(record.stats)) return null;
  const stats: AnalysisStat[] = [];
  for (const item of record.stats.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = text(row.id, 40);
    if (!ID_SET.has(id)) continue;
    const rating = ANALYSIS_RATINGS.find((label) => label === row.rating) ?? 'No rating yet';
    const trend = ANALYSIS_TRENDS.find((label) => label === row.trend) ?? 'none';
    const statId = id as AnalysisStatId;
    const latest = finite(row.latest);
    const average = finite(row.average);
    const lever = rating === 'Fair' || rating === 'Poor';
    stats.push({
      id: statId,
      name: ANALYSIS_STAT_NAMES[statId],
      value: finite(row.value) ?? average ?? latest,
      latest,
      average,
      today: finite(row.today),
      trend,
      rating,
      range: text(row.range, 220),
      tip: lever ? text(row.tip, 180) || null : null,
      goalTarget: text(row.goalTarget, 80) || null,
      goalGap: finite(row.goalGap) != null && (finite(row.goalGap) ?? 0) > 0 ? finite(row.goalGap) : null,
    });
  }
  if (stats.length === 0) return null;
  const weightPlan = text(record.weightPlan, 400);
  const maxHeartRate = maxHeartField(record.maxHeartRate);
  return {
    age: age != null && age >= 10 && age <= 110 ? age : null,
    sex,
    goal: goal || null,
    fitnessGoal: text(record.fitnessGoal, 40) || null,
    vo2Goal: text(record.vo2Goal, 180) || null,
    fuelNote: text(record.fuelNote, 400) || null,
    competitionCut: record.competitionCut === true,
    weightPlan: weightPlan || null,
    maxHeartRate,
    nutrition: nutritionField(record.nutrition),
    stats,
  };
}

function maxHeartField(value: unknown): HeartRateMax | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { bpm?: unknown; source?: unknown };
  const bpm = finite(row.bpm);
  if (bpm == null || bpm < 100 || bpm > 230) return null;
  if (row.source !== 'recorded' && row.source !== 'estimate') return null;
  return { bpm: Math.round(bpm), source: row.source };
}
