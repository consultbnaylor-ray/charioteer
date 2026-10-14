import { recentCheckInDays } from '@/domain/checkIns';
import { isoDay, parseIsoDay } from '@/domain/dates';
import {
  assessWeight,
  compositionForAssessment,
  dayItems,
  nutritionTrendDays,
  processedLine,
  sumItems,
  waistToHeight,
  weightDirection,
  weightPointsFrom,
  type BodyCompositionReading,
  type FoodLog,
  type NutritionDay,
  type NutritionSettings,
} from '@/domain/nutrition';
import { soberElapsed } from '@/domain/sober';
import { daysUntil, drinkFreeThisWeek, showsSoberRecord, type Stage } from '@/domain/stage';

export type StatsTone = 'good' | 'watch' | 'info' | 'attention';

export const STATS_SIGNAL: Record<StatsTone, string> = {
  good: 'On track',
  watch: 'Watch',
  info: 'Note',
  attention: 'Needs attention',
};

export type StatTileModel = {
  id: string;
  title: string;
  value: string;
  /** One plain line. The signal word is separate, so colour is never the only cue. */
  meaning: string;
  tone: StatsTone;
  signal: string;
  series: number[];
  href: string;
};

export type StatsOverviewInput = {
  now: Date;
  stage: Stage;
  sobrietyStartedAt: string | null;
  plannedQuitAt: string | null;
  drinkFreeOn: readonly string[];
  drinkFreeDaysGoal: number | null;
  checkIns: readonly { mood: number; craving: number; createdAt: string }[];
  health: readonly { kind: string; value: number; recordedOn: string }[];
  heightCm: number | null;
  nutrition: Pick<NutritionSettings, 'goal' | 'goalSex' | 'build' | 'kcalTarget' | 'proteinTarget' | 'hideCalories'>;
  foodLogs: readonly FoodLog[];
  waterDays: readonly NutritionDay[];
  bodyComposition: readonly BodyCompositionReading[];
  gratitude: readonly { entryDate: string }[];
};

function tile(input: Omit<StatTileModel, 'signal'> & { tone: StatsTone }): StatTileModel {
  return { ...input, signal: STATS_SIGNAL[input.tone] };
}

function shiftDay(day: string, delta: number): string {
  const date = parseIsoDay(day);
  date.setDate(date.getDate() + delta);
  return isoDay(date);
}

function lastDays(today: string, count: number): string[] {
  const days: string[] = [];
  for (let ago = count - 1; ago >= 0; ago -= 1) days.push(shiftDay(today, -ago));
  return days;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function soberTile(input: StatsOverviewInput, today: string): StatTileModel {
  if (showsSoberRecord(input.stage)) {
    if (!input.sobrietyStartedAt) {
      return tile({
        id: 'sober',
        title: 'Sober days',
        value: '—',
        meaning: 'Add the day you stopped',
        tone: 'info',
        series: [],
        href: '/home?section=sober',
      });
    }
    const elapsed = soberElapsed(new Date(input.sobrietyStartedAt), input.now);
    const start = isoDay(new Date(input.sobrietyStartedAt));
    return tile({
      id: 'sober',
      title: 'Sober days',
      value: elapsed.days === 1 ? '1 day' : `${elapsed.days} days`,
      meaning: 'Still going',
      tone: 'good',
      series: lastDays(today, 14).map((day) => (day >= start ? 1 : 0)),
      href: '/home?section=sober',
    });
  }
  if (input.stage === 'cutting_down') {
    const free = drinkFreeThisWeek(input.drinkFreeOn, input.now);
    const goal = input.drinkFreeDaysGoal;
    const met = goal != null && free >= goal;
    return tile({
      id: 'sober',
      title: 'Drink-free days',
      value: goal != null ? `${free} of ${goal}` : String(free),
      meaning: met ? 'On track' : 'Drink-free days this week',
      tone: met ? 'good' : 'info',
      series: lastDays(today, 7).map((day) => (input.drinkFreeOn.includes(day) ? 1 : 0)),
      href: '/home?section=sober',
    });
  }
  if (input.stage === 'trying_to_stop') {
    const left = input.plannedQuitAt ? daysUntil(input.plannedQuitAt, input.now) : null;
    const value = left == null ? 'No date' : left === 0 ? 'Today' : left === 1 ? '1 day' : `${left} days`;
    return tile({
      id: 'sober',
      title: 'Planned stop',
      value,
      meaning: left == null ? 'You can set a date when you are ready' : 'Days until the date you chose',
      tone: 'info',
      series: [],
      href: '/home?section=sober',
    });
  }
  return tile({
    id: 'sober',
    title: 'Sober days',
    value: '—',
    meaning: 'Nothing here assumes you have stopped',
    tone: 'info',
    series: [],
    href: '/home?section=sober',
  });
}

function moodTile(input: StatsOverviewInput, today: Date): StatTileModel {
  const days = recentCheckInDays([...input.checkIns], today);
  const moods = days.flatMap((day) => (day.mood == null ? [] : [day.mood]));
  const latest = moods.at(-1) ?? null;
  if (latest == null) {
    return tile({
      id: 'mood',
      title: 'Mood',
      value: '—',
      meaning: 'No check-in this week',
      tone: 'info',
      series: [],
      href: '/check-in?section=mood',
    });
  }
  const earlier = moods.slice(0, -1);
  const earlierAverage = earlier.length ? earlier.reduce((sum, value) => sum + value, 0) / earlier.length : null;
  let tone: StatsTone = latest >= 6 ? 'good' : 'info';
  let meaning = tone === 'good' ? 'On track' : 'Steady this week';
  if (earlierAverage != null && latest <= earlierAverage - 2) {
    tone = 'watch';
    meaning = 'Lower than earlier this week';
  } else if (earlierAverage != null && latest >= earlierAverage + 2) {
    tone = 'good';
    meaning = 'Higher than earlier this week';
  } else if (moods.reduce((sum, value) => sum + value, 0) / moods.length < 4) {
    tone = 'watch';
    meaning = 'On the lower side this week';
  }
  return tile({
    id: 'mood',
    title: 'Mood',
    value: `${latest}/10`,
    meaning,
    tone,
    series: moods,
    href: '/check-in?section=mood',
  });
}

function cravingTile(input: StatsOverviewInput, today: Date): StatTileModel {
  const days = recentCheckInDays([...input.checkIns], today);
  const cravings = days.flatMap((day) => (day.craving == null ? [] : [day.craving]));
  const latest = cravings.at(-1) ?? null;
  if (latest == null) {
    return tile({
      id: 'craving',
      title: 'Cravings',
      value: '—',
      meaning: 'No check-in this week',
      tone: 'info',
      series: [],
      href: '/check-in?section=craving',
    });
  }
  const tone: StatsTone = latest <= 3 ? 'good' : 'watch';
  const meaning = latest <= 3 ? 'Quiet just now' : latest >= 7 ? 'High just now' : 'Worth a look';
  return tile({
    id: 'craving',
    title: 'Cravings',
    value: `${latest}/10`,
    meaning,
    tone,
    series: cravings,
    href: '/check-in?section=craving',
  });
}

function checkInTile(input: StatsOverviewInput, today: Date): StatTileModel {
  const days = recentCheckInDays([...input.checkIns], today);
  const count = days.filter((day) => day.mood != null).length;
  return tile({
    id: 'check-ins',
    title: 'Check-ins',
    value: `${count} of 7`,
    meaning: count >= 5 ? 'On track' : count === 0 ? 'None this week' : 'A few days in',
    tone: count >= 5 ? 'good' : 'info',
    series: days.map((day) => (day.mood == null ? 0 : 1)),
    href: '/check-in?section=recent',
  });
}

function weightTile(input: StatsOverviewInput): StatTileModel {
  const points = weightPointsFrom(input.health);
  const latest = points.at(-1);
  const direction = weightDirection(points);
  const goal = input.nutrition.goal;
  const value = latest ? `${round1(latest.kg)} kg` : '—';
  const series = points.slice(-8).map((point) => point.kg);
  if (direction === 'unknown') {
    return tile({
      id: 'weight',
      title: 'Weight',
      value,
      meaning: 'Log weight more than once',
      tone: 'info',
      series,
      href: '/nutrition?section=weight',
    });
  }
  if (goal === 'lose_fat_build_muscle') {
    return tile({
      id: 'weight',
      title: 'Weight',
      value,
      meaning: 'The scales can stay still while the body changes',
      tone: 'info',
      series,
      href: '/nutrition?section=weight',
    });
  }
  const lower = direction === 'down';
  const higher = direction === 'up';
  const steady = direction === 'steady';
  if (goal === 'lose_weight' && lower) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'Lower than the earlier reading', tone: 'good', series, href: '/nutrition?section=weight' });
  }
  if (goal === 'lose_weight' && higher) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'Higher than the earlier reading', tone: 'watch', series, href: '/nutrition?section=weight' });
  }
  if (goal === 'increase' && higher) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'Higher than the earlier reading', tone: 'good', series, href: '/nutrition?section=weight' });
  }
  if (goal === 'increase' && lower) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'Lower than you aimed for', tone: 'watch', series, href: '/nutrition?section=weight' });
  }
  if (goal === 'maintain' && steady) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'On track', tone: 'good', series, href: '/nutrition?section=weight' });
  }
  if ((goal === 'maintain' || goal === 'lose_weight') && !steady) {
    return tile({
      id: 'weight',
      title: 'Weight',
      value,
      meaning: steady ? 'Near the earlier reading' : higher ? 'Higher than the earlier reading' : 'Lower than the earlier reading',
      tone: 'watch',
      series,
      href: '/nutrition?section=weight',
    });
  }
  return tile({
    id: 'weight',
    title: 'Weight',
    value,
    meaning: steady ? 'Near the earlier reading' : higher ? 'Higher than the earlier reading' : 'Lower than the earlier reading',
    tone: 'info',
    series,
    href: '/nutrition?section=weight',
  });
}

function bodyTile(input: StatsOverviewInput): StatTileModel {
  const composition = compositionForAssessment(input.bodyComposition);
  const weightKg = weightPointsFrom(input.health).at(-1)?.kg ?? null;
  const assessment = assessWeight({
    bodyFatPct: composition.bodyFatPct,
    waistCm: composition.waistCm,
    weightKg,
    heightCm: input.heightCm,
    build: input.nutrition.build,
    sex: input.nutrition.goalSex,
  });
  const fatSeries = [...input.bodyComposition]
    .filter((row) => row.bodyFatPct != null)
    .sort((left, right) => left.recordedOn.localeCompare(right.recordedOn))
    .map((row) => row.bodyFatPct as number);
  const waistSeries = [...input.bodyComposition]
    .filter((row) => row.waistCm != null && input.heightCm != null)
    .sort((left, right) => left.recordedOn.localeCompare(right.recordedOn))
    .flatMap((row) => {
      const ratio = waistToHeight(row.waistCm as number, input.heightCm as number);
      return ratio == null ? [] : [ratio];
    });
  if (assessment.basis === 'body_fat' && composition.bodyFatPct != null) {
    const within = assessment.label === 'Within the body-fat band';
    return tile({
      id: 'body',
      title: 'Body fat',
      value: `${round1(composition.bodyFatPct)}%`,
      meaning: within ? 'On track' : assessment.label === 'Low body fat' ? 'Low body fat. This is not a diagnosis' : 'Above the body-fat band. This is not a diagnosis',
      tone: within ? 'good' : 'watch',
      series: fatSeries,
      href: '/nutrition?section=body',
    });
  }
  if (assessment.basis === 'waist' && composition.waistCm != null && input.heightCm != null) {
    const ratio = waistToHeight(composition.waistCm, input.heightCm);
    const healthy = assessment.label === 'Within the healthy band';
    return tile({
      id: 'body',
      title: 'Waist to height',
      value: ratio == null ? '—' : ratio.toFixed(2),
      meaning: healthy ? 'On track' : 'Outside the healthy band. This is not a diagnosis',
      tone: healthy ? 'good' : 'watch',
      series: waistSeries,
      href: '/nutrition?section=body',
    });
  }
  if (assessment.underweight) {
    return tile({
      id: 'body',
      title: 'Body',
      value: 'Under 18.5',
      meaning: 'Below the healthy range',
      tone: 'attention',
      series: [],
      href: '/nutrition?section=body',
    });
  }
  return tile({
    id: 'body',
    title: 'Body fat',
    value: '—',
    meaning: assessment.hideBmiCategory ? 'BMI labels stay off. Add body fat or waist' : 'Add body fat or a waist measurement',
    tone: 'info',
    series: fatSeries.length ? fatSeries : waistSeries,
    href: '/nutrition?section=body',
  });
}

function calorieTile(input: StatsOverviewInput, today: string): StatTileModel {
  const trend = nutritionTrendDays(input.foodLogs, today, 7).map((day) => day.kcal);
  if (input.nutrition.hideCalories) {
    return tile({
      id: 'calories',
      title: 'Calories',
      value: 'Hidden',
      meaning: 'Calories are hidden',
      tone: 'info',
      series: [],
      href: '/nutrition?section=calories',
    });
  }
  const items = dayItems(input.foodLogs, today);
  const kcal = sumItems(items).kcal;
  const target = input.nutrition.kcalTarget;
  const value = `${Math.round(kcal).toLocaleString('en-GB')} kcal`;
  if (!items.length) {
    return tile({ id: 'calories', title: 'Calories', value, meaning: 'Nothing logged today', tone: 'info', series: trend, href: '/nutrition?section=today' });
  }
  if (target == null || target <= 0) {
    return tile({ id: 'calories', title: 'Calories', value, meaning: 'No target yet', tone: 'info', series: trend, href: '/nutrition?section=today' });
  }
  if (kcal > target) {
    const slightly = kcal <= target * 1.1;
    return tile({
      id: 'calories',
      title: 'Calories',
      value,
      meaning: slightly ? 'Slightly above your target' : 'Above your target. There is no failing a day',
      tone: 'watch',
      series: trend,
      href: '/nutrition?section=today',
    });
  }
  if (kcal >= target * 0.85) {
    return tile({ id: 'calories', title: 'Calories', value, meaning: 'On track', tone: 'good', series: trend, href: '/nutrition?section=today' });
  }
  return tile({ id: 'calories', title: 'Calories', value, meaning: 'Within your target so far', tone: 'info', series: trend, href: '/nutrition?section=today' });
}

function proteinTile(input: StatsOverviewInput, today: string): StatTileModel {
  const trend = nutritionTrendDays(input.foodLogs, today, 7).map((day) => day.proteinG);
  const items = dayItems(input.foodLogs, today);
  const protein = sumItems(items).proteinG;
  const target = input.nutrition.proteinTarget;
  const value = items.length ? `${round1(protein)} g` : '—';
  if (!items.length) {
    return tile({ id: 'protein', title: 'Protein', value, meaning: 'Nothing logged today', tone: 'info', series: trend, href: '/nutrition?section=goal' });
  }
  if (target == null || target <= 0) {
    return tile({ id: 'protein', title: 'Protein', value, meaning: 'No target yet', tone: 'info', series: trend, href: '/nutrition?section=goal' });
  }
  if (protein >= target) {
    return tile({ id: 'protein', title: 'Protein', value, meaning: 'On track', tone: 'good', series: trend, href: '/nutrition?section=goal' });
  }
  return tile({ id: 'protein', title: 'Protein', value, meaning: 'Short of your target so far', tone: 'info', series: trend, href: '/nutrition?section=goal' });
}

function qualityTile(input: StatsOverviewInput, today: string): StatTileModel {
  const series = lastDays(today, 7).map((day) => dayItems(input.foodLogs, day).filter((item) => item.processed).length);
  const items = dayItems(input.foodLogs, today);
  const line = processedLine(items);
  if (!line) {
    return tile({ id: 'quality', title: 'Food quality', value: '—', meaning: 'Nothing logged today', tone: 'info', series, href: '/nutrition?section=today' });
  }
  const processed = items.filter((item) => item.processed).length;
  return tile({
    id: 'quality',
    title: 'Food quality',
    value: processed === 0 ? 'Whole foods' : processed === 1 ? '1 item' : `${processed} items`,
    meaning: processed === 0 ? 'On track' : processed === 1 ? '1 item looks highly processed' : `${processed} items look highly processed`,
    tone: processed === 0 ? 'good' : 'watch',
    series,
    href: '/nutrition?section=today',
  });
}

function waterTile(input: StatsOverviewInput, today: string): StatTileModel {
  const byDay = new Map(input.waterDays.map((day) => [day.day, day.waterMl]));
  const ml = byDay.get(today) ?? 0;
  const series = lastDays(today, 7).map((day) => byDay.get(day) ?? 0);
  const tone: StatsTone = ml >= 2000 ? 'good' : 'info';
  const meaning = ml >= 2000 ? 'On track' : ml > 0 ? 'Some logged today' : 'None logged today';
  return tile({
    id: 'water',
    title: 'Water',
    value: `${ml.toLocaleString('en-GB')} ml`,
    meaning,
    tone,
    series,
    href: '/nutrition?section=water',
  });
}

function gratitudeTile(input: StatsOverviewInput, today: string): StatTileModel {
  const days = lastDays(today, 7);
  const series = days.map((day) => input.gratitude.filter((entry) => entry.entryDate === day).length);
  const count = series.reduce((sum, value) => sum + value, 0);
  return tile({
    id: 'gratitude',
    title: 'Gratitude',
    value: count === 1 ? '1 line' : `${count} lines`,
    meaning: count > 0 ? 'A line kept this week' : 'None this week',
    tone: count > 0 ? 'good' : 'info',
    series,
    href: '/gratitude?section=diary',
  });
}

/** One tile per figure already kept in the app. Order is the grid order. */
export function buildStatsOverview(input: StatsOverviewInput): StatTileModel[] {
  const today = isoDay(input.now);
  return [
    soberTile(input, today),
    moodTile(input, input.now),
    cravingTile(input, input.now),
    checkInTile(input, input.now),
    weightTile(input),
    bodyTile(input),
    calorieTile(input, today),
    proteinTile(input, today),
    qualityTile(input, today),
    waterTile(input, today),
    gratitudeTile(input, today),
  ];
}
