import { profileTrendChart } from '@/domain/chartSeries';
import { formatUkDate } from './dates';
import { averageValue, formatHealthValue, HEALTH_METRICS } from './healthInsights';
import { formatGbp } from './savings';
import type { ProfileSharing, PublicProfileView, SharedHealthTrend } from './profileSharing';

/** Lead-in for the owner's list of stats other people cannot see. */
export const PROFILE_NOT_SHARED = 'Not shared';

export type ProfileStatChart =
  | { kind: 'ring'; fill: number }
  | { kind: 'bars'; values: number[] }
  | { kind: 'line'; values: number[] };

export type ProfileStatTile = {
  id: string;
  label: string;
  value: string;
  caption: string;
  chart: ProfileStatChart | null;
};

export type ProfileStatBoard = {
  tiles: ProfileStatTile[];
  /** Stat names with the switch off. The owner's view only. No figures. */
  notShared: string[];
};

const SOBER_MARKS: { days: number; label: string }[] = [
  { days: 1, label: '1 day' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 182, label: '6 months' },
  { days: 365, label: '1 year' },
];

const HEADLINE_KIND: { kind: string; pattern: RegExp }[] = [
  { kind: 'steps', pattern: /^Steps average\b/i },
  { kind: 'sleep_hours', pattern: /^Sleep average\b/i },
  { kind: 'resting_heart_rate', pattern: /^Resting heart rate average\b/i },
  { kind: 'hrv_sdnn', pattern: /^Heart rate variability average\b/i },
  { kind: 'workout_minutes', pattern: /^Workouts average\b/i },
  { kind: 'weight_kg', pattern: /^Weight average\b/i },
];

/**
 * Tiles for stats the profile already shares.
 * A member only receives tiles for figures on the shared view.
 * The owner also gets the names of switches that are off, with no figures.
 */
export function profileStatBoard(
  view: PublicProfileView,
  options: { audience: 'owner' | 'member'; sharing?: ProfileSharing },
): ProfileStatBoard {
  const owner = options.audience === 'owner' && options.sharing != null;
  const sharing = owner ? options.sharing ?? null : null;
  const tiles: ProfileStatTile[] = [];
  const notShared: string[] = [];

  pushFlag(tiles, notShared, owner, sharing?.soberDays === true, 'Days sober', () => soberTile(view), 'No date yet');
  pushFlag(tiles, notShared, owner, sharing?.moodStreak === true, 'Mood streak', () => moodTile(view.moodStreak), 'No check-ins yet');
  pushFlag(tiles, notShared, owner, sharing?.moneySaved === true, 'Money saved', () => moneyTile(view.moneySaved), 'Nothing to show yet');
  pushFlag(tiles, notShared, owner, sharing?.unitsAvoided === true, 'Units avoided', () => unitsTile(view.unitsAvoided), 'Nothing to show yet');

  for (const metric of HEALTH_METRICS) {
    const on = sharing?.healthKinds.includes(metric.kind) === true;
    const tile = healthTile(view, metric.kind, metric.label, metric.chart);
    if (owner) {
      if (on) tiles.push(tile ?? { id: metric.kind, label: metric.label, value: 'No readings this week', caption: '', chart: null });
      else notShared.push(metric.label);
    } else if (tile) tiles.push(tile);
  }

  pushCount(tiles, notShared, owner, (sharing?.gratitudeIds.length ?? 0) > 0, view.gratitude.length > 0, 'Gratitude', () => gratitudeTile(view.gratitude.length));
  pushNullable(tiles, notShared, owner, view.foodDiary, 'Today\'s meals', () => mealsTile(view.foodDiary ?? []));
  pushNullable(tiles, notShared, owner, view.calories, 'Calories', () => caloriesTile(view.calories ?? ''));
  pushNullable(tiles, notShared, owner, view.quality, 'Food quality', () => qualityTile(view));
  pushNullable(tiles, notShared, owner, view.progress, 'Meal streak', () => progressTile(view.progress ?? ''));
  pushFlag(tiles, notShared, owner, sharing?.shareBodyFigures === true, 'Body figures', () => bodyFiguresTile(view.bodyFigures), 'Nothing to show yet');
  pushNullable(tiles, notShared, owner, view.goal, 'Nutrition goal', () => goalTile(view));
  pushFlag(tiles, notShared, owner, sharing?.healthPlan === true, 'Health plan', () => planTile(view), 'No plan yet');

  return { tiles, notShared: owner ? notShared : [] };
}

function pushFlag(
  tiles: ProfileStatTile[],
  notShared: string[],
  owner: boolean,
  on: boolean,
  label: string,
  build: () => ProfileStatTile | null,
  emptyValue: string,
) {
  if (owner) {
    if (!on) {
      notShared.push(label);
      return;
    }
    tiles.push(build() ?? { id: label.toLowerCase().replace(/\s+/g, '-'), label, value: emptyValue, caption: '', chart: null });
    return;
  }
  const tile = build();
  if (tile) tiles.push(tile);
}

function pushNullable<T>(
  tiles: ProfileStatTile[],
  notShared: string[],
  owner: boolean,
  value: T | null,
  label: string,
  build: () => ProfileStatTile | null,
) {
  if (value == null) {
    if (owner) notShared.push(label);
    return;
  }
  const tile = build();
  if (tile) tiles.push(tile);
}

function pushCount(
  tiles: ProfileStatTile[],
  notShared: string[],
  owner: boolean,
  ownerOn: boolean,
  memberOn: boolean,
  label: string,
  build: () => ProfileStatTile,
) {
  if (owner) {
    if (!ownerOn) {
      notShared.push(label);
      return;
    }
    tiles.push(build());
    return;
  }
  if (memberOn) tiles.push(build());
}

function soberTile(view: PublicProfileView): ProfileStatTile | null {
  const sober = view.sober;
  if (!sober || typeof sober.days !== 'number') return null;
  const days = Math.max(0, Math.round(sober.days));
  const next = SOBER_MARKS.find((mark) => days < mark.days);
  const since = sober.since ? `Since ${formatUkDate(sober.since)}` : '';
  const towards = next ? `Towards ${next.label}` : 'A year or more';
  return {
    id: 'sober',
    label: 'Days sober',
    value: `${days} ${days === 1 ? 'day' : 'days'}`,
    caption: [since, towards].filter(Boolean).join(' · '),
    chart: { kind: 'ring', fill: next ? days / next.days : 1 },
  };
}

function moodTile(streak: number | null): ProfileStatTile | null {
  if (streak == null || !Number.isFinite(streak)) return null;
  const days = Math.max(0, Math.round(streak));
  return {
    id: 'mood',
    label: 'Mood streak',
    value: `${days} ${days === 1 ? 'day' : 'days'} in a row`,
    caption: 'Check-in days. Mood scores stay private.',
    chart: { kind: 'ring', fill: Math.min(1, days / 7) },
  };
}

function moneyTile(amount: number | null): ProfileStatTile | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return {
    id: 'money',
    label: 'Money saved',
    value: formatGbp(amount),
    caption: 'Saved',
    chart: amount > 0 ? { kind: 'bars', values: [amount] } : null,
  };
}

function unitsTile(amount: number | null): ProfileStatTile | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const shown = formatPlain(amount);
  return {
    id: 'units',
    label: 'Units avoided',
    value: `${shown} ${shown === '1' ? 'unit' : 'units'}`,
    caption: 'Avoided',
    chart: amount > 0 ? { kind: 'bars', values: [amount] } : null,
  };
}

function healthTile(
  view: PublicProfileView,
  kind: string,
  label: string,
  shape: 'bar' | 'line',
): ProfileStatTile | null {
  const trend = view.healthTrends.find((item) => item.kind === kind);
  const points = positivePoints(trend);
  if (points.length) {
    const average = averageValue(points.map((point) => ({ day: point.day, value: point.value })));
    const values = points.map((point) => point.value);
    return {
      id: kind,
      label,
      value: average == null ? 'No readings this week' : formatHealthValue(kind, average),
      caption: 'This week',
      chart: chartFor(shape, values),
    };
  }
  const headline = view.health.find((line) => HEADLINE_KIND.find((item) => item.kind === kind)?.pattern.test(line));
  if (!headline) return null;
  const amount = firstNumber(headline);
  return {
    id: kind,
    label,
    value: headline,
    caption: '',
    chart: amount != null && amount > 0 ? { kind: 'bars', values: [amount] } : null,
  };
}

function chartFor(shape: 'bar' | 'line', values: number[]): ProfileStatChart | null {
  if (!values.some((value) => value > 0)) return null;
  if (shape === 'line' && values.length >= 2) return { kind: 'line', values };
  return { kind: 'bars', values };
}

function positivePoints(trend: SharedHealthTrend | undefined): { day: string; value: number }[] {
  if (!trend) return [];
  return profileTrendChart(trend.points);
}

function gratitudeTile(count: number): ProfileStatTile {
  const lines = Math.max(0, count);
  return {
    id: 'gratitude',
    label: 'Gratitude',
    value: `${lines} ${lines === 1 ? 'line' : 'lines'}`,
    caption: 'Shared lines',
    chart: lines > 0 ? { kind: 'bars', values: Array.from({ length: Math.min(lines, 7) }, () => 1) } : null,
  };
}

function mealsTile(meals: { meal: string; detail: string }[]): ProfileStatTile {
  const count = meals.length;
  return {
    id: 'meals',
    label: 'Today\'s meals',
    value: count === 0 ? 'Nothing logged today' : count === 1 ? '1 meal today' : `${count} meals today`,
    caption: '',
    chart: count > 0 ? { kind: 'bars', values: Array.from({ length: count }, () => 1) } : null,
  };
}

function caloriesTile(line: string): ProfileStatTile {
  const pairs: { name: string; grams: number }[] = [];
  for (const name of ['protein', 'carbohydrate', 'sugar', 'fibre']) {
    const grams = gramsNamed(line, name);
    if (grams != null && grams > 0) pairs.push({ name, grams });
  }
  return {
    id: 'calories',
    label: 'Calories',
    value: line,
    caption: '',
    chart: pairs.length ? { kind: 'bars', values: pairs.map((pair) => pair.grams) } : null,
  };
}

function qualityTile(view: PublicProfileView): ProfileStatTile | null {
  const quality = view.quality;
  if (!quality) return null;
  const values = [quality.unsaturated, quality.other].filter((value) => value > 0);
  return {
    id: 'quality',
    label: 'Food quality',
    value: quality.line,
    caption: `Unsaturated ${formatPlain(quality.unsaturated)} g · saturated and trans ${formatPlain(quality.other)} g`,
    chart: values.length ? { kind: 'bars', values } : null,
  };
}

function bodyFiguresTile(line: string | null): ProfileStatTile | null {
  if (!line) return null;
  const value = firstNumber(line);
  return {
    id: 'body-figures',
    label: 'Body figures',
    value: line,
    caption: '',
    chart: value != null && value > 0 ? { kind: 'bars', values: [value] } : null,
  };
}

function progressTile(line: string): ProfileStatTile {
  const days = leadingDays(line);
  return {
    id: 'progress',
    label: 'Meal streak',
    value: line,
    caption: '',
    chart: days != null && days > 0 ? { kind: 'ring', fill: Math.min(1, days / 7) } : null,
  };
}

function goalTile(view: PublicProfileView): ProfileStatTile | null {
  const goal = view.goal;
  if (!goal) return null;
  return {
    id: 'goal',
    label: 'Nutrition goal',
    value: goal.label || goal.line,
    caption: goal.label && goal.line && goal.line !== goal.label ? goal.line : '',
    chart: null,
  };
}

function planTile(view: PublicProfileView): ProfileStatTile | null {
  const plan = view.healthPlan;
  if (!plan) return null;
  const total = Math.max(0, plan.total);
  const ticked = Math.max(0, Math.min(plan.ticked, total));
  return {
    id: 'plan',
    label: 'Health plan',
    value: total === 0 ? 'Nothing ticked yet' : `${ticked} of ${total} ticked`,
    caption: plan.headline && plan.headline !== 'Health plan' ? plan.headline : '',
    chart: total > 0 ? { kind: 'ring', fill: ticked / total } : null,
  };
}

function gramsNamed(line: string, name: string): number | null {
  const match = line.match(new RegExp(`${name}\\s+([\\d,]+(?:\\.\\d+)?)\\s*g`, 'i'));
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

function leadingDays(line: string): number | null {
  const match = line.match(/^(\d+)\s+day/);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function firstNumber(line: string): number | null {
  const match = line.match(/([\d,]+(?:\.\d+)?)/);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

function formatPlain(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
