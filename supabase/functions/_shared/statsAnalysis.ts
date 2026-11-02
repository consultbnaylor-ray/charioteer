/**
 * Summaries the stats analysis may send to xAI.
 * Raw samples, epoch slices, activity files, routes, and women's health are not fields here.
 */

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
};

export type StatsAnalysisPayload = {
  age: number | null;
  sex: 'female' | 'male' | null;
  goal: string | null;
  stats: AnalysisStat[];
};

export const STATS_ANALYSIS_PROMPT = [
  'Write a plain overview that considers every stat in the JSON. Do not skip one.',
  'Open with one overall verdict against a healthy person of this age. If a sport goal is set, name that aim.',
  'If most ratings are Poor, say so plainly. Do not soften it.',
  'If the picture is mixed, say the health looks reasonable for their age and that improvements could be made, as covered below and throughout the app.',
  'If the ratings are mostly Good or Excellent, say it looks strong and to keep up the good work.',
  'Then name the genuine strengths: only stats rated Good or Excellent, each with its value. If none are Good or Excellent, do not invent a strength.',
  'Usual and No rating yet are not strengths and not levers.',
  'Then name the two or three biggest levers among Fair and Poor, each with its value and its one tip. Do not add a tip that is not in the JSON.',
  'Quote value. That is the recent daily average, or a weekly total when the range is a week. Do not headline today. Mention today only when it is present, and say the day is still in progress.',
  'Close with Looked at: and then every stat name in the list.',
  'Use only the JSON. Do not invent numbers or praise.',
  'Do not diagnose. Do not predict how long the person will live. Do not mention location or women\'s health.',
  'Do not write a medical caveat. The app shows that line.',
].join(' ');

const BANNED = /\b(diagnos\w*|obese|overweight|lifespan|you will die)\b/i;

export function analysisTextOk(text: string): boolean {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length < 40 || trimmed.length > 2200) return false;
  return !BANNED.test(trimmed);
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
  const good = payload.stats.filter((stat) => stat.rating === 'Good' || stat.rating === 'Excellent');
  const looked = payload.stats.map(statName).join(', ');
  const lookedLine = looked ? ` Looked at: ${looked}.` : '';
  const strengthLine = good.length
    ? ` Strengths: ${good.map((stat) => `${statName(stat)}${figureOf(stat)}`).join(', ')}.`
    : '';
  const leverLine = poor.slice(0, 3).map((stat) => {
    const tip = stat.tip ? ` ${stat.tip}` : '';
    return `${statName(stat)}${figureOf(stat)} (${stat.rating}).${tip}`;
  }).join(' ');
  if (good.length + poor.length === 0) {
    return `There are not enough rated readings yet for an overall view${age}.${goal}${lookedLine}`.replace(/\s+/g, ' ').trim();
  }
  if (poor.length > good.length && poor.length >= 3) {
    const levers = leverLine ? ` The biggest levers are ${leverLine}` : '';
    return `Most of these ratings are Poor or Fair${age}.${goal}${strengthLine}${levers}${lookedLine}`.replace(/\s+/g, ' ').trim();
  }
  if (good.length >= 3 && poor.length === 0) {
    return `Your overall health looks strong${age}.${goal}${strengthLine} Keep up the good work.${lookedLine}`.replace(/\s+/g, ' ').trim();
  }
  const levers = leverLine ? ` The biggest levers are ${leverLine}` : '';
  return `Your overall health looks reasonable${age}, but improvements could be made, as covered below and throughout the app.${goal}${strengthLine}${levers}${lookedLine}`.replace(/\s+/g, ' ').trim();
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
    });
  }
  if (stats.length === 0) return null;
  return { age: age != null && age >= 10 && age <= 110 ? age : null, sex, goal: goal || null, stats };
}
