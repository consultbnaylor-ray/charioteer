import { recentCheckInDays } from '@/domain/checkIns';
import { isoDay, parseIsoDay } from '@/domain/dates';
import {
  WAIST_ZONE_CAPTION,
  bodyFatRange,
  bodyFatZoneCaption,
  drinkFreeRing,
  gratitudeWeekRing,
  soberMilestoneRing,
  waistRange,
  type ChartBar,
  type DistanceChart,
} from '@/domain/distance';
import {
  assessWeight,
  compositionForAssessment,
  dayItems,
  nutritionTrendDays,
  processedLine,
  sumItems,
  todayRing,
  waistToHeight,
  waterProgress,
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
  chart: DistanceChart;
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

function dayLetter(day: string): string {
  return 'SMTWTFS'[parseIsoDay(day).getDay()] ?? '';
}

function moodBars(
  days: { day: string; label: string; value: number | null }[],
  tone: StatsTone,
  max: number,
): DistanceChart {
  return {
    kind: 'bars',
    max,
    target: null,
    bars: days.map((day) => ({
      key: day.day,
      label: day.label.slice(0, 1),
      value: day.value ?? 0,
      tone: day.value == null ? 'empty' : tone,
    })),
  };
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
        chart: { kind: 'none' },
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
      chart: { kind: 'ring', ...soberMilestoneRing(new Date(input.sobrietyStartedAt), input.now) },
      href: '/home?section=sober',
    });
  }
  if (input.stage === 'cutting_down') {
    const free = drinkFreeThisWeek(input.drinkFreeOn, input.now);
    const goal = input.drinkFreeDaysGoal;
    const met = goal != null && free >= goal;
    const days = lastDays(today, 7);
    const bars: ChartBar[] = days.map((day) => {
      const on = input.drinkFreeOn.includes(day);
      return { key: day, label: dayLetter(day), value: on ? 1 : 0, tone: on ? 'good' : 'empty' };
    });
    return tile({
      id: 'sober',
      title: 'Drink-free days',
      value: goal != null ? `${free} of ${goal}` : String(free),
      meaning: met ? 'On track' : 'Drink-free days this week',
      tone: met ? 'good' : 'info',
      series: days.map((day) => (input.drinkFreeOn.includes(day) ? 1 : 0)),
      chart: goal != null && goal > 0
        ? { kind: 'ring', ...drinkFreeRing(free, goal) }
        : { kind: 'bars', bars, max: 1, target: null },
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
      chart: { kind: 'none' },
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
    chart: { kind: 'none' },
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
      chart: moodBars(days.map((day) => ({ day: day.day, label: day.label, value: day.mood })), 'info', 10),
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
    chart: moodBars(days.map((day) => ({ day: day.day, label: day.label, value: day.mood })), tone, 10),
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
      chart: moodBars(days.map((day) => ({ day: day.day, label: day.label, value: day.craving })), 'info', 10),
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
    chart: moodBars(days.map((day) => ({ day: day.day, label: day.label, value: day.craving })), tone, 10),
    href: '/check-in?section=craving',
  });
}

function checkInTile(input: StatsOverviewInput, today: Date): StatTileModel {
  const days = recentCheckInDays([...input.checkIns], today);
  const count = days.filter((day) => day.mood != null).length;
  const tone: StatsTone = count >= 5 ? 'good' : 'info';
  return tile({
    id: 'check-ins',
    title: 'Check-ins',
    value: `${count} of 7`,
    meaning: count >= 5 ? 'On track' : count === 0 ? 'None this week' : 'A few days in',
    tone,
    series: days.map((day) => (day.mood == null ? 0 : 1)),
    chart: {
      kind: 'bars',
      max: 1,
      target: null,
      bars: days.map((day) => ({
        key: day.day,
        label: day.label.slice(0, 1),
        value: day.mood == null ? 0 : 1,
        tone: day.mood == null ? 'empty' : tone,
      })),
    },
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
  const chart: DistanceChart = series.length >= 2 ? { kind: 'line', points: series } : { kind: 'none' };
  if (direction === 'unknown') {
    return tile({
      id: 'weight',
      title: 'Weight',
      value,
      meaning: 'Log weight more than once',
      tone: 'info',
      series,
      chart,
      href: '/nutrition?section=weight',
    });
  }
  if (goal === 'lose_fat_build_muscle' || goal === 'body_builder') {
    return tile({
      id: 'weight',
      title: 'Weight',
      value,
      meaning: goal === 'body_builder'
        ? 'Body fat and lean mass matter more than the scales'
        : 'The scales can stay still while the body changes',
      tone: 'info',
      series,
      chart,
      href: '/nutrition?section=weight',
    });
  }
  if (goal === 'elite_runner') {
    return tile({
      id: 'weight',
      title: 'Weight',
      value,
      meaning: 'Body fat and training matter more than a small change',
      tone: 'info',
      series,
      chart,
      href: '/nutrition?section=weight',
    });
  }
  if (goal === 'elite_heavy_boxer') {
    return tile({
      id: 'weight',
      title: 'Weight',
      value,
      meaning: 'Size and power matter more than a small change',
      tone: 'info',
      series,
      chart,
      href: '/nutrition?section=weight',
    });
  }
  if (goal === 'elite_middle_boxer') {
    return tile({
      id: 'weight',
      title: 'Weight',
      value,
      meaning: 'A middleweight limit is not a race on this screen',
      tone: 'info',
      series,
      chart,
      href: '/nutrition?section=weight',
    });
  }
  const lower = direction === 'down';
  const higher = direction === 'up';
  const steady = direction === 'steady';
  if (goal === 'lose_weight' && lower) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'Lower than the earlier reading', tone: 'good', series, chart, href: '/nutrition?section=weight' });
  }
  if (goal === 'lose_weight' && higher) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'Higher than the earlier reading', tone: 'watch', series, chart, href: '/nutrition?section=weight' });
  }
  if (goal === 'increase' && higher) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'Higher than the earlier reading', tone: 'good', series, chart, href: '/nutrition?section=weight' });
  }
  if (goal === 'increase' && lower) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'Lower than you aimed for', tone: 'watch', series, chart, href: '/nutrition?section=weight' });
  }
  if (goal === 'maintain' && steady) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'On track', tone: 'good', series, chart, href: '/nutrition?section=weight' });
  }
  if ((goal === 'maintain' || goal === 'lose_weight') && !steady) {
    return tile({
      id: 'weight',
      title: 'Weight',
      value,
      meaning: steady ? 'Near the earlier reading' : higher ? 'Higher than the earlier reading' : 'Lower than the earlier reading',
      tone: 'watch',
      series,
      chart,
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
    chart,
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
    const range = bodyFatRange(composition.bodyFatPct, input.nutrition.goalSex);
    return tile({
      id: 'body',
      title: 'Body fat',
      value: `${round1(composition.bodyFatPct)}%`,
      meaning: range.within ? 'Within healthy range' : assessment.label === 'Low body fat' ? 'Low body fat. This is not a diagnosis' : 'Above the body-fat band. This is not a diagnosis',
      tone: range.within ? 'good' : 'watch',
      series: fatSeries,
      chart: {
        kind: 'range',
        value: composition.bodyFatPct,
        zoneLow: range.zoneLow,
        zoneHigh: range.zoneHigh,
        scaleMin: range.scaleMin,
        scaleMax: range.scaleMax,
        status: range.status,
        zoneCaption: bodyFatZoneCaption(range),
      },
      href: '/nutrition?section=body',
    });
  }
  if (assessment.basis === 'waist' && composition.waistCm != null && input.heightCm != null) {
    const ratio = waistToHeight(composition.waistCm, input.heightCm);
    const range = ratio == null ? null : waistRange(ratio);
    const healthy = range?.within === true;
    return tile({
      id: 'body',
      title: 'Waist to height',
      value: ratio == null ? '—' : ratio.toFixed(2),
      meaning: healthy ? 'Within healthy range' : 'Outside the healthy band. This is not a diagnosis',
      tone: healthy ? 'good' : 'watch',
      series: waistSeries,
      chart: range == null || ratio == null
        ? { kind: 'none' }
        : {
          kind: 'range',
          value: ratio,
          zoneLow: range.zoneLow,
          zoneHigh: range.zoneHigh,
          scaleMin: range.scaleMin,
          scaleMax: range.scaleMax,
          status: range.status,
          zoneCaption: WAIST_ZONE_CAPTION,
        },
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
      chart: { kind: 'none' },
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
    chart: { kind: 'none' },
    href: '/nutrition?section=body',
  });
}

function leanTile(input: StatsOverviewInput): StatTileModel | null {
  if (input.nutrition.goal !== 'body_builder') return null;
  const series = [...input.bodyComposition]
    .filter((row) => row.leanMassKg != null)
    .sort((left, right) => left.recordedOn.localeCompare(right.recordedOn))
    .map((row) => row.leanMassKg as number);
  const latest = series.at(-1);
  const earlier = series.length >= 2 ? series[0] : null;
  const delta = latest != null && earlier != null ? latest - earlier : null;
  const meaning = delta == null
    ? 'Log lean mass more than once'
    : delta >= 0.3
      ? 'Higher than the earlier reading'
      : delta <= -0.3
        ? 'Lower than the earlier reading'
        : 'Near the earlier reading';
  const tone: StatsTone = delta != null && delta >= 0.3 ? 'good' : delta != null && delta <= -0.3 ? 'watch' : 'info';
  return tile({
    id: 'lean',
    title: 'Lean mass',
    value: latest == null ? '—' : `${round1(latest)} kg`,
    meaning,
    tone,
    series: series.slice(-8),
    chart: series.length >= 2 ? { kind: 'line', points: series.slice(-8) } : { kind: 'none' },
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
      chart: { kind: 'none' },
      href: '/nutrition?section=calories',
    });
  }
  const items = dayItems(input.foodLogs, today);
  const kcal = sumItems(items).kcal;
  const target = input.nutrition.kcalTarget;
  const value = `${Math.round(kcal).toLocaleString('en-GB')} kcal`;
  const ring = todayRing({
    hideCalories: false,
    kcal,
    kcalTarget: target,
    proteinG: 0,
    proteinTarget: null,
    logged: items.length > 0,
  });
  const chart: DistanceChart = { kind: 'ring', centre: ring.centre, unit: 'kcal', fill: ring.fill, status: ring.status };
  if (!items.length) {
    return tile({ id: 'calories', title: 'Calories', value, meaning: 'Nothing logged today', tone: 'info', series: trend, chart, href: '/nutrition?section=today' });
  }
  if (target == null || target <= 0) {
    return tile({ id: 'calories', title: 'Calories', value, meaning: 'No target yet', tone: 'info', series: trend, chart, href: '/nutrition?section=today' });
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
      chart,
      href: '/nutrition?section=today',
    });
  }
  if (kcal >= target * 0.85) {
    return tile({ id: 'calories', title: 'Calories', value, meaning: 'On track', tone: 'good', series: trend, chart, href: '/nutrition?section=today' });
  }
  return tile({ id: 'calories', title: 'Calories', value, meaning: 'Within your target so far', tone: 'info', series: trend, chart, href: '/nutrition?section=today' });
}

function proteinTile(input: StatsOverviewInput, today: string): StatTileModel {
  const trend = nutritionTrendDays(input.foodLogs, today, 7).map((day) => day.proteinG);
  const items = dayItems(input.foodLogs, today);
  const protein = sumItems(items).proteinG;
  const target = input.nutrition.proteinTarget;
  const value = items.length ? `${round1(protein)} g` : '—';
  const ring = todayRing({
    hideCalories: true,
    kcal: 0,
    kcalTarget: null,
    proteinG: protein,
    proteinTarget: target,
    logged: items.length > 0,
  });
  const chart: DistanceChart = { kind: 'ring', centre: ring.centre, unit: 'g', fill: ring.fill, status: ring.status };
  if (!items.length) {
    return tile({ id: 'protein', title: 'Protein', value, meaning: 'Nothing logged today', tone: 'info', series: trend, chart, href: '/nutrition?section=goal' });
  }
  if (target == null || target <= 0) {
    return tile({ id: 'protein', title: 'Protein', value, meaning: 'No target yet', tone: 'info', series: trend, chart, href: '/nutrition?section=goal' });
  }
  if (protein >= target) {
    return tile({ id: 'protein', title: 'Protein', value, meaning: 'On track', tone: 'good', series: trend, chart, href: '/nutrition?section=goal' });
  }
  return tile({ id: 'protein', title: 'Protein', value, meaning: 'Short of your target so far', tone: 'info', series: trend, chart, href: '/nutrition?section=goal' });
}

function qualityTile(input: StatsOverviewInput, today: string): StatTileModel {
  const series = lastDays(today, 7).map((day) => dayItems(input.foodLogs, day).filter((item) => item.processed).length);
  const items = dayItems(input.foodLogs, today);
  const line = processedLine(items);
  if (!line) {
    return tile({ id: 'quality', title: 'Food quality', value: '—', meaning: 'Nothing logged today', tone: 'info', series, chart: { kind: 'none' }, href: '/nutrition?section=today' });
  }
  const processed = items.filter((item) => item.processed).length;
  const whole = items.length - processed;
  return tile({
    id: 'quality',
    title: 'Food quality',
    value: processed === 0 ? 'Whole foods' : processed === 1 ? '1 item' : `${processed} items`,
    meaning: processed === 0 ? 'On track' : processed === 1 ? '1 item looks highly processed' : `${processed} items look highly processed`,
    tone: processed === 0 ? 'good' : 'watch',
    series,
    chart: {
      kind: 'bars',
      layout: 'row',
      max: Math.max(whole, processed, 1),
      target: null,
      bars: [
        { key: 'whole', label: `Whole ${whole}`, value: whole, tone: whole > 0 ? 'good' : 'empty' },
        { key: 'processed', label: `Processed ${processed}`, value: processed, tone: processed > 0 ? 'watch' : 'info' },
      ],
    },
    href: '/nutrition?section=today',
  });
}

function waterTile(input: StatsOverviewInput, today: string): StatTileModel {
  const byDay = new Map(input.waterDays.map((day) => [day.day, day.waterMl]));
  const ml = byDay.get(today) ?? 0;
  const series = lastDays(today, 7).map((day) => byDay.get(day) ?? 0);
  const tone: StatsTone = ml >= 2000 ? 'good' : 'info';
  const meaning = ml >= 2000 ? 'On track' : ml > 0 ? 'Some logged today' : 'None logged today';
  const water = waterProgress(ml);
  return tile({
    id: 'water',
    title: 'Water',
    value: `${ml.toLocaleString('en-GB')} ml`,
    meaning,
    tone,
    series,
    chart: { kind: 'ring', centre: water.ml.toLocaleString('en-GB'), unit: 'ml', fill: water.fill, status: water.status },
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
    chart: { kind: 'ring', ...gratitudeWeekRing(count) },
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
    ...[leanTile(input)].filter((item): item is StatTileModel => item != null),
    calorieTile(input, today),
    proteinTile(input, today),
    qualityTile(input, today),
    waterTile(input, today),
    gratitudeTile(input, today),
  ];
}
