/**
 * Summaries the stats analysis may send to xAI.
 * Raw samples, epoch slices, activity files, routes, and women's health are not fields here.
 */
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
  stats: AnalysisStat[];
};

export const STATS_ANALYSIS_PROMPT = [
  'Write a plain overview from the JSON only. Do not invent numbers.',
  'Open with one overall verdict against a healthy person of this age. Name the sport goal when one is set.',
  'If most ratings are Poor, say so plainly. Do not soften it.',
  'If the picture is mixed, say it looks reasonable for their age and that improvements could be made.',
  'If the ratings are mostly Good or Excellent and no stat has a goalGap, say it looks strong and to keep up the good work.',
  'A stat with a goalGap is short of the saved goal. It is not a strength, even when the rating is Good or Excellent. Say it is fine for their age, but short of the goal by that gap, and name goalTarget.',
  'Do not say keep up the good work when any stat has a goalGap. Say it is strong for their age, but some way off the goal.',
  'Write short paragraphs separated by a blank line. The first paragraph is the overall summary. Then one short strengths paragraph, if any qualify. Then one paragraph per improvement, in ranked order, with a blank line between them.',
  'Then one short strengths line. Name at most three stats that are Good or Excellent and have no goalGap. If none qualify, do not invent a strength.',
  'Usual and No rating yet are not strengths and not levers.',
  'Then the things to improve. Lead with the largest goalGap, then the next, then Fair and Poor. Do not mention the same thing twice.',
  'For each, say why it matters and give one or two specific steps. Do not copy the range sentence, the rating word, or the tip already in the JSON.',
  VO2_ANALYSIS_RULE,
  'When weightPlan is set, state that daily calorie figure and the date in the overview. If it says the date is faster than 1 kg a week, say so and give the safer pace or later date in that sentence. Do not invent a different calorie number. This matches the Daily Targets card.',
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
  if (flat.length < 40 || flat.length > 3200) return false;
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
  const age = payload.age != null ? ` for someone aged ${Math.round(payload.age)}` : '';
  const goal = payload.goal ? ` The saved aim is ${payload.goal}.` : '';
  const poor = payload.stats.filter((stat) => stat.rating === 'Fair' || stat.rating === 'Poor');
  const short = payload.stats.filter((stat) => stat.goalGap != null && stat.goalGap > 0)
    .sort((left, right) => (right.goalGap ?? 0) - (left.goalGap ?? 0));
  const shortIds = new Set(short.map((stat) => stat.id));
  const good = payload.stats.filter((stat) => (stat.rating === 'Good' || stat.rating === 'Excellent') && !shortIds.has(stat.id));
  const strengthLine = good.length
    ? ` Strengths: ${good.slice(0, 3).map((stat) => `${statName(stat)}${figureOf(stat)}`).join(', ')}.`
    : '';
  const work = [...short, ...poor.filter((stat) => !shortIds.has(stat.id))].slice(0, 3);
  if (good.length + poor.length + short.length === 0) {
    return `There are not enough rated readings yet for an overall view${age}.${goal}`.replace(/\s+/g, ' ').trim();
  }
  const planLine = payload.weightPlan ? ` ${payload.weightPlan}` : '';
  const improvements = work.map((stat) => improvementParagraph(stat, payload.maxHeartRate ?? null));
  if (short.length > 0) {
    const ageBit = good.length + short.length > poor.length ? 'Strong for your age' : 'Your overall health looks mixed for your age';
    return joinParagraphs([
      `${ageBit}, but some way off the saved goal.${goal}${planLine}`,
      strengthLine,
      ...improvements,
    ]);
  }
  if (poor.length > good.length && poor.length >= 3) {
    return joinParagraphs([
      `Most of these ratings are Poor or Fair${age}.${goal}${planLine}`,
      strengthLine,
      ...improvements,
    ]);
  }
  if (good.length >= 3 && poor.length === 0) {
    return joinParagraphs([
      `Your overall health looks strong${age}.${goal} Keep up the good work.${planLine}`,
      strengthLine,
    ]);
  }
  return joinParagraphs([
    `Your overall health looks reasonable${age}, but improvements could be made.${goal}${planLine}`,
    strengthLine,
    ...improvements,
  ]);
}

function joinParagraphs(parts: readonly (string | null | undefined)[]): string {
  return parts.map((part) => part?.replace(/[ \t]+/g, ' ').trim() ?? '').filter(Boolean).join('\n\n');
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
    weightPlan: weightPlan || null,
    maxHeartRate,
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
