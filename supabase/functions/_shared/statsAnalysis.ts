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
  'fitness_age',
] as const;

export type AnalysisStatId = (typeof ANALYSIS_STAT_IDS)[number];

const ID_SET = new Set<string>(ANALYSIS_STAT_IDS);

export const ANALYSIS_RATINGS = ['Excellent', 'Good', 'Fair', 'Poor', 'Usual', 'No rating yet'] as const;

export const ANALYSIS_TRENDS = ['up', 'down', 'steady', 'none'] as const;

export type AnalysisStat = {
  id: AnalysisStatId;
  latest: number | null;
  average: number | null;
  trend: (typeof ANALYSIS_TRENDS)[number];
  rating: (typeof ANALYSIS_RATINGS)[number];
  range: string;
};

export type StatsAnalysisPayload = {
  age: number | null;
  sex: 'female' | 'male' | null;
  goal: string | null;
  stats: AnalysisStat[];
};

export const STATS_ANALYSIS_PROMPT = [
  'Write a short overview of these summarised figures.',
  'Open with one overall verdict against a healthy person of this age. If a sport goal is set, mention that aim.',
  'If the picture is mixed, say the health looks reasonable for their age and that improvements could be made, as covered below and throughout the app.',
  'If the ratings are mostly Good or Excellent, say it looks strong and to keep up the good work.',
  'Then name the two or three biggest levers, using the figures rated Fair or Poor.',
  'Use only the JSON. Do not invent numbers.',
  'Do not diagnose. Do not predict how long the person will live. Do not mention location or women\'s health.',
  'Do not write "Not medical advice". The app shows that line.',
  'Four to seven sentences. Plain and honest.',
].join(' ');

const BANNED = /\b(diagnos\w*|obese|overweight|lifespan|you will die)\b/i;

export function analysisTextOk(text: string): boolean {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length < 40 || trimmed.length > 1200) return false;
  return !BANNED.test(trimmed);
}

export function localStatsVerdict(payload: StatsAnalysisPayload): string {
  const age = payload.age != null ? ` for someone aged ${Math.round(payload.age)}` : '';
  const goal = payload.goal ? ` The saved aim is ${payload.goal}.` : '';
  const poor = payload.stats.filter((stat) => stat.rating === 'Fair' || stat.rating === 'Poor');
  const good = payload.stats.filter((stat) => stat.rating === 'Good' || stat.rating === 'Excellent');
  const levers = poor.slice(0, 3).map((stat) => stat.id.replace(/_/g, ' ')).join(', ');
  if (good.length >= 3 && poor.length === 0) {
    return `Your overall health looks strong${age}.${goal} Keep up the good work.`;
  }
  if (good.length + poor.length === 0) {
    return `There are not enough readings yet for an overall view${age}.${goal}`.replace(/\s+/g, ' ').trim();
  }
  const leverLine = levers ? ` The biggest levers are ${levers}.` : '';
  return `Your overall health looks reasonable${age}, but improvements could be made, as covered below and throughout the app.${goal}${leverLine}`;
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
    stats.push({
      id: id as AnalysisStatId,
      latest: finite(row.latest),
      average: finite(row.average),
      trend,
      rating,
      range: text(row.range, 220),
    });
  }
  if (stats.length === 0) return null;
  return { age: age != null && age >= 10 && age <= 110 ? age : null, sex, goal: goal || null, stats };
}
