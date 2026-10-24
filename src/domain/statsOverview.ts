import { bodyCompositionChart, overviewLineChart, overviewScoreChart, weightChart } from '@/domain/chartSeries';
import { recentCheckInDays } from '@/domain/checkIns';
import { isoDay, parseIsoDay } from '@/domain/dates';
import {
  WAIST_ZONE_CAPTION,
  bodyFatRange,
  bodyFatZoneCaption,
  drinkFreeRing,
  soberMilestoneRing,
  waistRange,
  type ChartBar,
  type DistanceChart,
} from '@/domain/distance';
import {
  PRO_BOXING_CLASSES,
  assessWeight,
  compositionForAssessment,
  isClassBoxer,
  dayItems,
  nutritionTrendDays,
  processedFoodHeading,
  processedFoodNotes,
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
  type ProcessedFoodNote,
} from '@/domain/nutrition';
import { soberElapsed } from '@/domain/sober';
import { daysUntil, showsSoberRecord, type Stage } from '@/domain/stage';
import { proteinLoggedDays } from '@/domain/goalLed';
import { parseStatPeriod, periodDayCount, periodHeading, periodPhrase, proteinPace, rollingWindow, scaledPeriodTarget, type StatPeriod } from '@/domain/statWindow';

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
  /** Named period for a heading that would otherwise be only a count. */
  periodLine?: string;
  /** Highly processed foods behind the count. Same length as that count. */
  processedNotes?: ProcessedFoodNote[];
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
  /** Shared Day / 7 days / 30 days choice. Omitted means the last 7 days. */
  period?: StatPeriod;
};

function tile(input: Omit<StatTileModel, 'signal'> & { tone: StatsTone; signal?: string }): StatTileModel {
  return { ...input, signal: input.signal ?? STATS_SIGNAL[input.tone] };
}

function chosenPeriod(input: StatsOverviewInput): StatPeriod {
  return parseStatPeriod(input.period);
}

function periodIn(period: StatPeriod): string {
  return period === 'day' ? 'today' : `in ${periodPhrase(period)}`;
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

function scoreLine(
  days: readonly { day: string; value: number | null }[],
  today: Date,
  period: StatPeriod,
): DistanceChart {
  const window = rollingWindow(isoDay(today), period);
  const readings = overviewScoreChart(days);
  return {
    kind: 'line',
    points: readings.map((point) => point.value),
    readings,
    unit: '/10',
    start: window.start,
    end: window.end,
  };
}

function datedLine(points: readonly { day: string; value: number }[], unit: string): DistanceChart {
  const ordered = overviewLineChart(points);
  if (ordered.length < 2) return { kind: 'none' };
  const start = ordered[0]?.day ?? '';
  const end = ordered[ordered.length - 1]?.day ?? start;
  return {
    kind: 'line',
    points: ordered.map((point) => point.value),
    readings: ordered,
    unit,
    start,
    end,
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
    const period = chosenPeriod(input);
    const days = lastDays(today, periodDayCount(period));
    const free = days.filter((day) => input.drinkFreeOn.includes(day)).length;
    const weekly = input.drinkFreeDaysGoal;
    const goal = weekly == null ? null : scaledPeriodTarget(weekly, period);
    const met = goal != null && free >= goal;
    const bars: ChartBar[] = days.map((day) => {
      const on = input.drinkFreeOn.includes(day);
      return { key: day, label: dayLetter(day), value: on ? 1 : 0, tone: on ? 'good' : 'empty' };
    });
    const drinkRing = goal != null && goal > 0 ? drinkFreeRing(free, goal) : null;
    return tile({
      id: 'sober',
      title: 'Drink-free days',
      value: goal != null ? `${free} of ${goal} days` : `${free} days`,
      meaning: met ? 'On track' : `Drink-free days ${periodIn(period)}`,
      tone: met ? 'good' : 'info',
      series: days.map((day) => (input.drinkFreeOn.includes(day) ? 1 : 0)),
      chart: drinkRing
        ? { kind: 'ring', ...drinkRing, status: met ? 'On track' : drinkRing.status }
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
  const period = chosenPeriod(input);
  const days = recentCheckInDays([...input.checkIns], today, periodDayCount(period));
  const moods = days.flatMap((day) => (day.mood == null ? [] : [day.mood]));
  const latest = moods.at(-1) ?? null;
  if (latest == null) {
    return tile({
      id: 'mood',
      title: 'Mood',
      value: '—',
      meaning: `No check-in ${periodIn(period)}`,
      tone: 'info',
      series: [],
      chart: scoreLine(days.map((day) => ({ day: day.day, value: day.mood })), today, period),
      href: '/check-in?section=mood',
    });
  }
  const earlier = moods.slice(0, -1);
  const earlierAverage = earlier.length ? earlier.reduce((sum, value) => sum + value, 0) / earlier.length : null;
  let tone: StatsTone = latest >= 6 ? 'good' : 'info';
  const phrase = periodIn(period);
  let meaning = tone === 'good' ? 'On track' : `Steady ${phrase}`;
  if (earlierAverage != null && latest <= earlierAverage - 2) {
    tone = 'watch';
    meaning = `Lower than earlier ${phrase}`;
  } else if (earlierAverage != null && latest >= earlierAverage + 2) {
    tone = 'good';
    meaning = `Higher than earlier ${phrase}`;
  } else if (moods.reduce((sum, value) => sum + value, 0) / moods.length < 4) {
    tone = 'watch';
    meaning = `On the lower side ${phrase}`;
  }
  if (tone === 'watch' && moods.length < 2) {
    tone = 'info';
    meaning = 'Early days';
  }
  return tile({
    id: 'mood',
    title: 'Mood',
    value: `${latest}/10`,
    meaning,
    tone,
    signal: meaning === 'Early days' ? 'Early days' : undefined,
    series: moods,
    chart: scoreLine(days.map((day) => ({ day: day.day, value: day.mood })), today, period),
    href: '/check-in?section=mood',
  });
}

function cravingTile(input: StatsOverviewInput, today: Date): StatTileModel {
  const period = chosenPeriod(input);
  const days = recentCheckInDays([...input.checkIns], today, periodDayCount(period));
  const cravings = days.flatMap((day) => (day.craving == null ? [] : [day.craving]));
  const latest = cravings.at(-1) ?? null;
  if (latest == null) {
    return tile({
      id: 'craving',
      title: 'Cravings',
      value: '—',
      meaning: `No check-in ${periodIn(period)}`,
      tone: 'info',
      series: [],
      chart: scoreLine(days.map((day) => ({ day: day.day, value: day.craving })), today, period),
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
    chart: scoreLine(days.map((day) => ({ day: day.day, value: day.craving })), today, period),
    href: '/check-in?section=craving',
  });
}

function checkInTile(input: StatsOverviewInput, today: Date): StatTileModel {
  const period = chosenPeriod(input);
  const span = periodDayCount(period);
  const days = recentCheckInDays([...input.checkIns], today, span);
  const count = days.filter((day) => day.mood != null).length;
  const aim = scaledPeriodTarget(5, period);
  const tone: StatsTone = count >= aim ? 'good' : 'info';
  return tile({
    id: 'check-ins',
    title: 'Check-ins',
    value: `${count} of ${span} days`,
    meaning: count >= aim ? 'On track' : count === 0 ? `None ${periodIn(period)}` : 'A few days in',
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
  const points = weightChart(input.health).map((point) => ({ day: point.day, kg: point.value }));
  const latest = points.at(-1);
  const direction = weightDirection(points);
  const goal = input.nutrition.goal;
  const value = latest ? `${round1(latest.kg)} kg` : '—';
  const dated = points.slice(-8).map((point) => ({ day: point.day, value: point.kg }));
  const series = dated.map((point) => point.value);
  const chart: DistanceChart = datedLine(dated, 'kg');
  if (direction === 'unknown') {
    return tile({
      id: 'weight',
      title: 'Weight',
      value,
      meaning: 'Log weight more than once',
      tone: 'info',
      series,
      chart,
      href: '/weight-waist?section=weight',
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
      href: '/weight-waist?section=weight',
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
      href: '/weight-waist?section=weight',
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
      href: '/weight-waist?section=weight',
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
      href: '/weight-waist?section=weight',
    });
  }
  if (isClassBoxer(goal)) {
    return tile({
      id: 'weight',
      title: 'Weight',
      value,
      meaning: `A ${PRO_BOXING_CLASSES[goal].short} limit is not a race on this screen`,
      tone: 'info',
      series,
      chart,
      href: '/weight-waist?section=weight',
    });
  }
  const lower = direction === 'down';
  const higher = direction === 'up';
  const steady = direction === 'steady';
  if (goal === 'lose_weight' && lower) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'Lower than the earlier reading', tone: 'good', series, chart, href: '/weight-waist?section=weight' });
  }
  if (goal === 'lose_weight' && higher) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'Higher than the earlier reading', tone: 'watch', series, chart, href: '/weight-waist?section=weight' });
  }
  if (goal === 'increase' && higher) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'Higher than the earlier reading', tone: 'good', series, chart, href: '/weight-waist?section=weight' });
  }
  if (goal === 'increase' && lower) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'Lower than you aimed for', tone: 'watch', series, chart, href: '/weight-waist?section=weight' });
  }
  if (goal === 'maintain' && steady) {
    return tile({ id: 'weight', title: 'Weight', value, meaning: 'On track', tone: 'good', series, chart, href: '/weight-waist?section=weight' });
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
      href: '/weight-waist?section=weight',
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
    href: '/weight-waist?section=weight',
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
  const fatSeries = bodyCompositionChart(input.bodyComposition.map((row) => ({
    recordedOn: row.recordedOn,
    value: row.bodyFatPct,
  }))).map((point) => point.value);
  const waistSeries = bodyCompositionChart(input.bodyComposition.map((row) => ({
    recordedOn: row.recordedOn,
    value: row.waistCm,
  }))).flatMap((point) => {
    const ratio = input.heightCm == null ? null : waistToHeight(point.value, input.heightCm);
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
      href: '/weight-waist?section=body',
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
      href: '/weight-waist?section=body',
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
      href: '/weight-waist?section=body',
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
    href: '/weight-waist?section=body',
  });
}

function leanTile(input: StatsOverviewInput): StatTileModel | null {
  if (input.nutrition.goal !== 'body_builder') return null;
  const all = bodyCompositionChart(input.bodyComposition.map((row) => ({
    recordedOn: row.recordedOn,
    value: row.leanMassKg,
  })));
  const dated = all.slice(-8);
  const series = dated.map((point) => point.value);
  const latest = all.at(-1)?.value;
  const earlier = all.length >= 2 ? all[0]?.value ?? null : null;
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
    series,
    chart: datedLine(dated, 'kg'),
    href: '/weight-waist?section=body',
  });
}

function calorieTile(input: StatsOverviewInput, today: string): StatTileModel {
  const period = chosenPeriod(input);
  const trend = nutritionTrendDays(input.foodLogs, today, periodDayCount(period)).map((day) => day.kcal);
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
  const window = rollingWindow(today, period);
  const loggedDays = window.days.flatMap((day) => {
    const items = dayItems(input.foodLogs, day);
    return items.length ? [sumItems(items).kcal] : [];
  });
  const kcal = loggedDays.length ? loggedDays.reduce((sum, value) => sum + value, 0) / loggedDays.length : 0;
  const target = input.nutrition.kcalTarget;
  const value = loggedDays.length ? `${Math.round(kcal).toLocaleString('en-GB')} kcal` : '0 kcal';
  const ring = todayRing({
    hideCalories: false,
    kcal,
    kcalTarget: target,
    proteinG: 0,
    proteinTarget: null,
    logged: loggedDays.length > 0,
  });
  const chart: DistanceChart = { kind: 'ring', centre: ring.centre, unit: 'kcal', fill: ring.fill, status: ring.status };
  if (!loggedDays.length) {
    return tile({ id: 'calories', title: 'Calories', value, meaning: period === 'day' ? 'Nothing logged today' : `Nothing logged ${periodIn(period)}`, tone: 'info', series: trend, chart, href: '/nutrition?section=today' });
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
  const period = chosenPeriod(input);
  const trend = nutritionTrendDays(input.foodLogs, today, periodDayCount(period)).map((day) => day.proteinG);
  const window = rollingWindow(today, period);
  const days = proteinLoggedDays(input.foodLogs, window.days);
  const protein = days.length ? days.reduce((sum, value) => sum + value, 0) / days.length : 0;
  const target = input.nutrition.proteinTarget;
  const value = days.length ? `${Math.round(protein)} g` : '—';
  const ring = todayRing({
    hideCalories: true,
    kcal: 0,
    kcalTarget: null,
    proteinG: protein,
    proteinTarget: target,
    logged: days.length > 0,
  });
  const chart: DistanceChart = {
    kind: 'ring',
    centre: days.length ? String(Math.round(protein)) : ring.centre,
    unit: 'g',
    fill: ring.fill,
    status: ring.status,
  };
  if (!days.length) {
    return tile({ id: 'protein', title: 'Protein', value, meaning: period === 'day' ? 'Nothing logged today' : `Nothing logged ${periodIn(period)}`, tone: 'info', series: trend, chart, href: '/nutrition?section=goal' });
  }
  if (target == null || target <= 0) {
    return tile({ id: 'protein', title: 'Protein', value, meaning: 'No target yet', tone: 'info', series: trend, chart, href: '/nutrition?section=goal' });
  }
  const hits = days.filter((grams) => grams >= target).length;
  const pace = proteinPace({ period, loggedDays: days.length, now: input.now, average: protein, target, hits });
  if (pace.word === 'On track') {
    return tile({ id: 'protein', title: 'Protein', value, meaning: 'On track', tone: 'good', series: trend, chart, href: '/nutrition?section=goal' });
  }
  if (pace.neutral) {
    return tile({ id: 'protein', title: 'Protein', value, meaning: pace.word, signal: pace.word, tone: 'info', series: trend, chart, href: '/nutrition?section=goal' });
  }
  return tile({ id: 'protein', title: 'Protein', value, meaning: 'Short of your target so far', tone: 'watch', series: trend, chart, href: '/nutrition?section=goal' });
}

function qualityTile(input: StatsOverviewInput, today: string): StatTileModel {
  const period = chosenPeriod(input);
  const days = lastDays(today, periodDayCount(period));
  const series = days.map((day) => dayItems(input.foodLogs, day).filter((item) => item.processed).length);
  const items = days.flatMap((day) => dayItems(input.foodLogs, day));
  const line = processedLine(items);
  if (!line) {
    return tile({ id: 'quality', title: 'Food quality', value: '—', meaning: period === 'day' ? 'Nothing logged today' : `Nothing logged ${periodIn(period)}`, tone: 'info', series, chart: { kind: 'none' }, href: '/nutrition?section=quality' });
  }
  const notes = processedFoodNotes(input.foodLogs, days);
  const processed = notes.length;
  const whole = items.length - processed;
  return tile({
    id: 'quality',
    title: 'Food quality',
    value: processedFoodHeading(whole, processed),
    periodLine: periodHeading(period),
    processedNotes: notes,
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
    href: '/nutrition?section=quality',
  });
}

function waterTile(input: StatsOverviewInput, today: string): StatTileModel {
  const period = chosenPeriod(input);
  const byDay = new Map(input.waterDays.map((day) => [day.day, day.waterMl]));
  const days = lastDays(today, periodDayCount(period));
  const logged = days.flatMap((day) => (byDay.has(day) ? [byDay.get(day) ?? 0] : []));
  const ml = logged.length ? Math.round(logged.reduce((sum, value) => sum + value, 0) / logged.length) : 0;
  const series = days.map((day) => byDay.get(day) ?? 0);
  const tone: StatsTone = ml >= 2000 ? 'good' : 'info';
  const meaning = ml >= 2000 ? 'On track' : ml > 0 ? `Some logged ${periodIn(period)}` : `None logged ${periodIn(period)}`;
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
  const period = chosenPeriod(input);
  const days = lastDays(today, periodDayCount(period));
  const series = days.map((day) => input.gratitude.filter((entry) => entry.entryDate === day).length);
  const count = series.reduce((sum, value) => sum + value, 0);
  const aim = scaledPeriodTarget(7, period);
  const left = Math.max(0, aim - count);
  const status = count >= aim
    ? 'On track'
    : count <= 0
      ? (period === 'day' ? 'None today' : `None ${periodIn(period)}`)
      : left === 1
        ? '1 line to go'
        : `${left} lines to go`;
  return tile({
    id: 'gratitude',
    title: 'Gratitude',
    value: count === 1 ? '1 line' : `${count} lines`,
    meaning: count > 0 ? `A line kept ${periodIn(period)}` : `None ${periodIn(period)}`,
    tone: count > 0 ? 'good' : 'info',
    series,
    chart: {
      kind: 'ring',
      centre: String(count),
      unit: count === 1 ? 'line' : 'lines',
      fill: aim > 0 ? Math.min(1, count / aim) : 0,
      status,
    },
    href: '/gratitude?section=diary',
  });
}

/** One tile per figure already kept in the app. Order is the grid order. The period is the shared Day / 7 days / 30 days choice. */
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
