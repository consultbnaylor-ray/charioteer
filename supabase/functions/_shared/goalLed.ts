import { periodActiveMinutes } from './fitnessSnapshot.ts';
import { boxingClassWindow, classStatus } from './goalWeightRange.ts';
import { londonDay, type LondonWeek } from './healthInsights.ts';
import { GOAL_LABEL, dayItems, isClassBoxer, sumItems, weightPointsFrom, type FoodLog, type NutritionGoal, type NutritionSex } from './nutrition.ts';
import { paceJudgement, parseStatPeriod, periodHeading, periodPhrase, proteinPace, rollingWindow, scaledPeriodTarget, type StatPeriod } from './statWindow.ts';

export type GoalTone = 'good' | 'watch' | 'info' | 'attention';

export type GoalMeasure = {
  id: string;
  label: string;
  centre: string;
  unit: string;
  fill: number;
  status: string;
  tone: GoalTone;
  words: string;
  /** Replaces the tone's signal word. Early days and On pace use this. */
  signal?: string;
  /** Drawn in ink, with an icon and the word, rather than a coloured Watch mark. */
  neutral?: boolean;
};

export type GoalTick = {
  id: string;
  done: boolean;
  /** Name, number, unit, and target. */
  label: string;
  statusWord: 'Met' | 'Not yet';
  centre: string;
  unit: string;
  fill: number;
};

export type GoalLed = {
  name: string | null;
  matters: string;
  caution: string | null;
  measures: GoalMeasure[];
  nudges: string[];
  progressWords: string;
  ticks: GoalTick[];
};

export type GoalLedInput = {
  goal: NutritionGoal | null;
  stage?: 'stopped' | 'trying_to_stop' | 'cutting_down' | 'exploring' | null;
  hideCalories?: boolean;
  kcalTarget?: number | null;
  proteinTarget?: number | null;
  weightClassKg?: number | null;
  /** True when a lower intake must not be suggested. */
  blockedLoss?: boolean;
  todayLogged?: boolean;
  todayKcal?: number;
  todayProtein?: number;
  /**
   * Protein grams on each day in the London week that has protein.
   * An empty list means the week-to-date has none. Omit it to use today only.
   */
  weekProtein?: readonly number[];
  /** False when workout figures were not loaded, so the check does not invent a rest week. */
  workoutsKnown?: boolean;
  workoutDays?: number;
  workoutMinutes?: number;
  scheduledDays?: number | null;
  weightKg?: number | null;
  previousWeightKg?: number | null;
  /** Picks the heavyweight table. Other classes use the same edges for both. */
  sex?: NutritionSex | null;
  sleepHours?: number | null;
  /** Rolling window. Omitted means the last 7 days, ending today in London. */
  period?: StatPeriod;
  /** Used to tell whether a Day view is still early. */
  now?: Date | string | null;
};

const FOCUS: Record<NutritionGoal, string> = {
  lose_weight: 'Keep protein on the meal you rush, and let the weight trend run across weeks.',
  lose_fat_build_muscle: 'Include protein at the meals you already eat, and keep the strength sessions you already do.',
  maintain: 'Keep meals at the times you already use, and let weight stay steady.',
  increase: 'Add a little to a meal you already cook, with protein, and keep the strength sessions.',
  elite_runner: 'Eat before and after the sessions you already do, and protect sleep the night before the longer one.',
  body_builder: 'Keep protein on each meal, and keep the lifting you already do. Do not skip a meal.',
  elite_feather_boxer: 'Keep every meal, and keep the skill work you already do. A featherweight limit is a small change only.',
  elite_super_feather_boxer: 'Keep every meal, and keep the skill work you already do. A super featherweight limit is a small change only.',
  elite_light_boxer: 'Keep every meal, and keep the skill work you already do. A lightweight limit is a small change only.',
  elite_super_light_boxer: 'Keep every meal, and keep the skill work you already do. A super lightweight limit is a small change only.',
  elite_welter_boxer: 'Keep every meal, and keep the skill work you already do. A welterweight limit is a small change only.',
  elite_super_welter_boxer: 'Keep every meal, and keep the skill work you already do. A super welterweight limit is a small change only.',
  elite_middle_boxer: 'Keep every meal, and keep the skill work you already do. A class limit is a small change only.',
  elite_super_middle_boxer: 'Keep every meal, and keep the skill work you already do. A super middleweight limit is a small change only.',
  elite_light_heavy_boxer: 'Keep every meal, and keep the skill work you already do. A light heavyweight limit is a small change only.',
  elite_cruiser_boxer: 'Keep every meal, and keep the skill work you already do. A cruiserweight limit is a small change only.',
  elite_heavy_boxer: 'Eat before and after the sessions you already do, so size and power can hold.',
};

/** One weekly focus sentence for this goal. It does not cut a session they already do. */
export function goalFocusLine(goal: NutritionGoal | null): string | null {
  if (!goal) return null;
  return FOCUS[goal];
}

/** Days in the London week that have protein, in calendar order. A day of meals with no protein stays out. */
export function proteinLoggedDays(logs: readonly FoodLog[], days: readonly string[]): number[] {
  const totals: number[] = [];
  for (const day of days) {
    const items = dayItems(logs, day);
    if (!items.length) continue;
    const protein = sumItems(items).proteinG;
    if (protein > 0) totals.push(protein);
  }
  return totals;
}

/** Workout days and minutes from Monday through the London today. */
export function trainingThisWeek(
  samples: readonly { kind: string; value: number; recordedOn: string }[],
  week: Pick<LondonWeek, 'start' | 'today'>,
): { days: number; minutes: number } {
  const active = periodActiveMinutes({
    samples,
    today: week.today,
    start: week.start,
    end: week.today,
  });
  return { days: active.days, minutes: active.minutes };
}

/**
 * Latest weight on or before today, compared with the reading before it.
 * Class and weight do not follow the Day / 7 days / 30 days choice.
 */
export function latestWeight(
  points: readonly { day: string; kg: number }[],
  today: string,
): { weightKg: number | null; previousWeightKg: number | null } {
  const known = points.filter((point) => point.day <= today);
  const latest = known.at(-1) ?? null;
  if (!latest) return { weightKg: null, previousWeightKg: null };
  const previous = known.filter((point) => point.day < latest.day).at(-1);
  return { weightKg: latest.kg, previousWeightKg: previous?.kg ?? null };
}

/**
 * Latest weight inside the London week, compared with the reading before it.
 * When the week has none, the latest reading on or before today still shows.
 */
export function weightThisWeek(
  points: readonly { day: string; kg: number }[],
  week: Pick<LondonWeek, 'start' | 'today'>,
): { weightKg: number | null; previousWeightKg: number | null } {
  const known = points.filter((point) => point.day <= week.today);
  const inWeek = known.filter((point) => point.day >= week.start);
  const latest = inWeek.at(-1) ?? known.at(-1) ?? null;
  if (!latest) return { weightKg: null, previousWeightKg: null };
  const previous = known.filter((point) => point.day < latest.day).at(-1);
  return { weightKg: latest.kg, previousWeightKg: previous?.kg ?? null };
}

function checkInDay(createdAt: string): string {
  return createdAt.length > 10 ? londonDay(createdAt) : createdAt.slice(0, 10);
}

/** Latest check-in sleep whose London day sits in the week-to-date. */
export function sleepThisWeek(
  checkIns: readonly { createdAt: string; sleepHours: number }[],
  week: Pick<LondonWeek, 'start' | 'today'>,
): number | null {
  const rows = checkIns.filter((item) => {
    if (!Number.isFinite(item.sleepHours)) return false;
    const day = checkInDay(item.createdAt);
    return day >= week.start && day <= week.today;
  });
  rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return rows[0]?.sleepHours ?? null;
}

/** Protein, training, and sleep for the rolling London window ending today. Weight is the latest reading. */
export function figuresForLondonWeek(input: {
  now: Date;
  logs: readonly FoodLog[];
  health: readonly { kind: string; value: number; recordedOn: string }[];
  checkIns: readonly { createdAt: string; sleepHours: number }[];
  period?: StatPeriod;
}) {
  const today = londonDay(input.now);
  const period = input.period ?? '7';
  const window = rollingWindow(today, period);
  const week: LondonWeek = { start: window.start, end: window.end, today: window.today, days: window.days };
  const todayItems = dayItems(input.logs, week.today);
  const totals = sumItems(todayItems);
  const training = trainingThisWeek(input.health, week);
  const weight = latestWeight(weightPointsFrom(input.health), week.today);
  return {
    week,
    period,
    todayLogged: todayItems.length > 0,
    todayKcal: totals.kcal,
    todayProtein: totals.proteinG,
    weekProtein: proteinLoggedDays(input.logs, week.days),
    workoutDays: training.days,
    workoutMinutes: training.minutes,
    weightKg: weight.weightKg,
    previousWeightKg: weight.previousWeightKg,
    sleepHours: sleepThisWeek(input.checkIns, week),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function num(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : value;
}

function mattersFor(goal: NutritionGoal, stage: GoalLedInput['stage'], blocked: boolean): string {
  const sober = stage === 'stopped' ? ' Recovery stays alcohol-free.' : '';
  if (blocked && (goal === 'lose_weight' || goal === 'lose_fat_build_muscle')) {
    return `What matters most is enough food, not a smaller intake.${sober}`;
  }
  const line: Record<NutritionGoal, string> = {
    lose_weight: 'What matters most is a steady intake you can keep, protein at meals, and the weight trend over weeks.',
    lose_fat_build_muscle: 'What matters most is protein at meals, enough food to train, and the strength sessions you already do.',
    maintain: 'What matters most is eating about what you use, and a weight that stays steady.',
    increase: 'What matters most is a little more food than you use, protein at meals, and the strength sessions you already do.',
    elite_runner: 'What matters most is fuel around the sessions you already do, protein, and sleep before the longer day.',
    body_builder: 'What matters most is protein, the lifting you already do, and enough food to recover.',
    elite_feather_boxer: 'What matters most is the skill work you already do, protein, and staying near the featherweight limit with a small change only.',
    elite_super_feather_boxer: 'What matters most is the skill work you already do, protein, and staying near the super featherweight limit with a small change only.',
    elite_light_boxer: 'What matters most is the skill work you already do, protein, and staying near the lightweight limit with a small change only.',
    elite_super_light_boxer: 'What matters most is the skill work you already do, protein, and staying near the super lightweight limit with a small change only.',
    elite_welter_boxer: 'What matters most is the skill work you already do, protein, and staying near the welterweight limit with a small change only.',
    elite_super_welter_boxer: 'What matters most is the skill work you already do, protein, and staying near the super welterweight limit with a small change only.',
    elite_middle_boxer: 'What matters most is the skill work you already do, protein, and staying near your class with a small change only.',
    elite_super_middle_boxer: 'What matters most is the skill work you already do, protein, and staying near the super middleweight limit with a small change only.',
    elite_light_heavy_boxer: 'What matters most is the skill work you already do, protein, and staying near the light heavyweight limit with a small change only.',
    elite_cruiser_boxer: 'What matters most is the skill work you already do, protein, and staying near the cruiserweight limit with a small change only.',
    elite_heavy_boxer: 'What matters most is food around the sessions you already do, protein, and recovery. Size and power need that food.',
  };
  return `${line[goal]}${sober}`;
}

function cautionFor(goal: NutritionGoal | null, blocked: boolean): string | null {
  if (!goal) return null;
  if (goal === 'elite_middle_boxer' || isClassBoxer(goal)) {
    return 'Keep every meal. A small change only. No rapid cut, skipped drinks, or a sauna. Check with a doctor before big changes.';
  }
  if (goal === 'elite_heavy_boxer' || goal === 'elite_runner' || goal === 'body_builder' || blocked) {
    return 'Check with a doctor before big changes.';
  }
  return null;
}

function chosenPeriod(input: GoalLedInput): StatPeriod {
  return parseStatPeriod(input.period);
}

function loggedProteinDays(input: GoalLedInput): number[] {
  if (input.weekProtein != null) return input.weekProtein.filter((value) => Number.isFinite(value) && value > 0);
  const today = Math.max(0, input.todayProtein ?? 0);
  return input.todayLogged && today > 0 ? [today] : [];
}

function proteinLine(average: number, hits: number, logged: number, target: number | null): string {
  const avg = Math.round(average);
  const dayWord = logged === 1 ? 'day' : 'days';
  if (target == null || target <= 0) {
    return `Protein · average ${avg} g a day · ${logged} ${dayWord} you logged food · no protein target saved`;
  }
  return `Protein · average ${avg} g a day (target ${Math.round(target)} g) · hit on ${hits} of ${logged} ${dayWord} you logged food`;
}

function proteinMeasure(input: GoalLedInput): GoalMeasure {
  const target = num(input.proteinTarget);
  const days = loggedProteinDays(input);
  if (!days.length) {
    return {
      id: 'protein',
      label: 'Protein',
      centre: '0',
      unit: 'g',
      fill: 0,
      status: 'Nothing logged yet',
      tone: 'info',
      words: `Log a meal and this shows protein for ${periodPhrase(chosenPeriod(input))}.`,
    };
  }
  const average = days.reduce((sum, value) => sum + value, 0) / days.length;
  const centre = String(Math.round(average));
  if (target != null && target > 0) {
    const hits = days.filter((value) => value >= target).length;
    const words = proteinLine(average, hits, days.length, target);
    const pace = proteinPace({
      period: chosenPeriod(input),
      loggedDays: days.length,
      now: input.now,
      average,
      target,
      hits,
    });
    return {
      id: 'protein',
      label: 'Protein',
      centre,
      unit: 'g',
      fill: clamp01(average / target),
      status: words,
      tone: pace.tone,
      signal: pace.word,
      neutral: pace.neutral,
      words,
    };
  }
  return {
    id: 'protein',
    label: 'Protein',
    centre,
    unit: 'g',
    fill: 1,
    status: proteinLine(average, 0, days.length, null),
    tone: 'info',
    words: 'No protein target is saved yet.',
  };
}

function kcalMeasure(input: GoalLedInput, aim: 'match' | 'under-or-at' | 'at-or-over'): GoalMeasure | null {
  if (input.hideCalories) return null;
  const target = num(input.kcalTarget);
  const kcal = Math.max(0, input.todayKcal ?? 0);
  if (!input.todayLogged || target == null || target <= 0) {
    return {
      id: 'kcal',
      label: 'Calories',
      centre: input.todayLogged ? String(Math.round(kcal)) : '0',
      unit: 'kcal',
      fill: 0,
      status: input.todayLogged && target == null ? 'No target yet' : 'Nothing logged yet',
      tone: 'info',
      words: target == null ? 'Set a calorie target on Nutrition if you want this ring.' : 'Log a meal and this shows today.',
    };
  }
  const ratio = kcal / target;
  const close = ratio >= 0.9 && ratio <= 1.1;
  const over = ratio > 1.1;
  const under = ratio < 0.9;
  let status = 'Close';
  let tone: GoalTone = 'good';
  let short = false;
  if (aim === 'match') {
    status = close ? 'Close' : over ? 'Above' : 'Under';
    tone = close ? 'good' : 'watch';
    short = !close && !over;
  } else if (aim === 'under-or-at') {
    status = over ? 'Above' : 'Within';
    tone = over ? 'watch' : 'good';
  } else {
    status = under ? 'Under' : 'Enough';
    tone = under ? 'watch' : 'good';
    short = under;
  }
  const loggedDays = input.weekProtein != null ? input.weekProtein.length : input.todayLogged ? 1 : 0;
  if (short && tone === 'watch') {
    const pace = paceJudgement({
      period: chosenPeriod(input),
      loggedDays,
      now: input.now,
      met: false,
      behind: 'Watch',
    });
    if (pace.neutral) {
      tone = 'info';
      return {
        id: 'kcal',
        label: 'Calories',
        centre: String(Math.round(kcal)),
        unit: 'kcal',
        fill: clamp01(ratio),
        status,
        tone,
        signal: pace.word,
        neutral: true,
        words: `Today against the ${Math.round(target).toLocaleString('en-GB')} kcal you set. There is no failing a day.`,
      };
    }
  }
  return {
    id: 'kcal',
    label: 'Calories',
    centre: String(Math.round(kcal)),
    unit: 'kcal',
    fill: clamp01(ratio),
    status,
    tone,
    words: `Today against the ${Math.round(target).toLocaleString('en-GB')} kcal you set. There is no failing a day.`,
  };
}

function sessionMeasure(input: GoalLedInput): GoalMeasure | null {
  if (!input.workoutsKnown) return null;
  const period = chosenPeriod(input);
  const days = Math.max(0, input.workoutDays ?? 0);
  const minutes = Math.max(0, Math.round(input.workoutMinutes ?? 0));
  const weekly = input.scheduledDays != null && input.scheduledDays > 0 ? input.scheduledDays : null;
  const aim = weekly == null ? null : scaledPeriodTarget(weekly, period);
  const fill = aim ? clamp01(days / aim) : (minutes > 0 ? 1 : 0);
  const met = aim ? days >= aim : minutes >= 20;
  const pace = paceJudgement({
    period,
    loggedDays: days,
    now: input.now,
    met,
    behind: 'Watch',
  });
  const when = period === 'day' ? 'today' : `in ${periodPhrase(period)}`;
  const quiet = days === 0 && minutes === 0;
  const line = quiet
    ? 'Nothing logged yet'
    : aim
      ? `Training · ${days} of ${aim} planned training days done ${when}`
      : `Training · ${minutes} min ${when} · no planned training days set`;
  const tone: GoalTone = pace.neutral ? 'info' : met ? 'good' : quiet ? 'info' : pace.tone === 'watch' ? 'info' : pace.tone;
  const signal = pace.neutral ? pace.word : met ? 'On track' : 'Note';
  return {
    id: 'sessions',
    label: 'Training',
    centre: quiet ? '0' : aim ? String(days) : String(minutes),
    unit: quiet ? 'days' : aim ? `of ${aim}` : 'min',
    fill,
    status: line,
    tone,
    signal,
    neutral: pace.neutral,
    words: line === 'Nothing logged yet' ? `No workout minutes are logged ${when}.` : `${line}.`,
  };
}

function weightMeasure(input: GoalLedInput, hope: 'down' | 'steady' | 'up' | 'class'): GoalMeasure | null {
  const latest = num(input.weightKg);
  if (latest == null) {
    return {
      id: 'weight',
      label: hope === 'class' ? 'Class' : 'Weight',
      centre: '—',
      unit: 'kg',
      fill: 0,
      status: 'Nothing logged yet',
      tone: 'info',
      words: 'A weight reading on Stats lets this follow the trend.',
    };
  }
  if (hope === 'class') {
    const window = boxingClassWindow(input.goal, input.sex ?? null);
    if (window) {
      const status = classStatus(latest, window);
      const keep = status.place === 'above' ? 'Keep every meal. A small change only.' : 'Keep every meal.';
      return {
        id: 'weight',
        label: 'Class',
        centre: String(round1(latest)),
        unit: 'kg',
        fill: status.fill,
        status: status.line,
        tone: status.tone,
        signal: status.signal,
        words: `${status.line} ${keep}`,
      };
    }
  }
  const previous = num(input.previousWeightKg);
  if (previous == null) {
    return {
      id: 'weight',
      label: 'Weight',
      centre: String(round1(latest)),
      unit: 'kg',
      fill: 0,
      status: 'One reading',
      tone: 'info',
      words: 'One weight reading so far. A second reading shows the trend.',
    };
  }
  const change = round1(latest - previous);
  const steady = Math.abs(change) <= 0.4;
  const status = steady ? 'Steady' : change < 0 ? 'Down' : 'Up';
  const good = hope === 'steady' ? steady : hope === 'down' ? change <= 0.4 : change >= -0.4;
  return {
    id: 'weight',
    label: 'Weight',
    centre: String(round1(latest)),
    unit: 'kg',
    fill: steady ? 1 : 0.6,
    status,
    tone: good ? 'good' : 'watch',
    words: steady
      ? `Weight · ${round1(latest)} kg · previous ${round1(previous)} kg · steady`
      : `Weight · ${round1(latest)} kg · ${change > 0 ? 'up' : 'down'} ${Math.abs(change)} kg from ${round1(previous)} kg`,
  };
}

function sleepMeasure(input: GoalLedInput): GoalMeasure {
  const hours = num(input.sleepHours);
  if (hours == null) {
    return { id: 'sleep', label: 'Sleep', centre: '—', unit: 'h', fill: 0, status: 'Nothing logged yet', tone: 'info', words: input.goal ? `A check-in records sleep for ${GOAL_LABEL[input.goal]}.` : 'A check-in records sleep.' };
  }
  const usual = hours >= 7 && hours <= 9;
  return {
    id: 'sleep',
    label: 'Sleep',
    centre: String(round1(hours)),
    unit: 'h',
    fill: usual ? 1 : hours < 7 ? clamp01(hours / 7) : clamp01(9 / hours),
    status: usual ? 'In the usual range' : hours < 7 ? 'Short' : 'Above the usual range',
    tone: usual ? 'good' : 'watch',
    words: usual
      ? `Sleep · ${round1(hours)} h · usual range 7 to 9 h · in the usual range`
      : `Sleep · ${round1(hours)} h · usual range 7 to 9 h · ${hours < 7 ? 'short' : 'above the usual range'}${input.goal ? `. Recovery matters for ${GOAL_LABEL[input.goal]}` : ''}`,
  };
}

function measuresFor(input: GoalLedInput): GoalMeasure[] {
  const goal = input.goal;
  if (!goal) return [];
  const protein = proteinMeasure(input);
  const sessions = sessionMeasure(input);
  const picked: (GoalMeasure | null)[] = [];
  if (goal === 'lose_weight') {
    picked.push(input.blockedLoss ? protein : kcalMeasure(input, 'under-or-at'), protein, weightMeasure(input, 'down'));
  } else if (goal === 'lose_fat_build_muscle') {
    picked.push(protein, sessions, input.hideCalories || input.blockedLoss ? weightMeasure(input, 'down') : kcalMeasure(input, 'under-or-at'));
  } else if (goal === 'maintain') {
    picked.push(kcalMeasure(input, 'match'), weightMeasure(input, 'steady'), protein);
  } else if (goal === 'increase') {
    picked.push(kcalMeasure(input, 'at-or-over'), protein, sessions);
  } else if (goal === 'elite_runner') {
    picked.push(sessions, protein, sleepMeasure(input));
  } else if (goal === 'body_builder') {
    picked.push(protein, sessions, kcalMeasure(input, 'at-or-over'));
  } else if (goal === 'elite_heavy_boxer') {
    picked.push(sessions, protein, sleepMeasure(input));
  } else {
    picked.push(protein, sessions, weightMeasure(input, 'class'));
  }
  return picked.filter((item): item is GoalMeasure => item != null).slice(0, 3);
}

function nudgesFor(input: GoalLedInput, measures: GoalMeasure[]): string[] {
  if (!input.goal) return [];
  const lines: string[] = [];
  const protein = measures.find((item) => item.id === 'protein');
  if (protein?.tone === 'watch' && protein.status !== 'Nothing logged yet') {
    lines.push(protein.words.endsWith('.') ? protein.words : `${protein.words}.`);
  }
  const sleep = measures.find((item) => item.id === 'sleep');
  if (sleep?.status === 'Short') lines.push(sleep.words);
  const weight = measures.find((item) => item.id === 'weight' && item.status.startsWith('Over the class'));
  if (weight) lines.push(weight.words);
  const kcal = measures.find((item) => item.id === 'kcal');
  if (!input.hideCalories && kcal?.status === 'Above' && (input.goal === 'lose_weight' || input.goal === 'lose_fat_build_muscle') && !input.blockedLoss) {
    lines.push('Today\'s meals are above the calorie target you set. There is no failing a day.');
  }
  if (!input.hideCalories && kcal?.status === 'Under' && (input.goal === 'increase' || input.goal === 'body_builder' || input.goal === 'elite_heavy_boxer')) {
    lines.push('Today\'s meals are under the amount you set. A little more of a meal you already eat covers it.');
  }
  return lines.slice(0, 2);
}

function firstSentence(words: string): string {
  return words.split('. ')[0]?.replace(/\.$/, '') ?? words;
}

function tickLabel(measure: GoalMeasure, period: StatPeriod): string {
  const phrase = periodPhrase(period);
  if (measure.id === 'protein') {
    if (measure.status === 'Nothing logged yet') return `Protein · 0 g · nothing logged ${phrase}`;
    return measure.status;
  }
  if (measure.id === 'kcal') {
    if (measure.status === 'No target yet') {
      const shown = Number(measure.centre);
      if (Number.isFinite(shown) && shown > 0) {
        return `Calories · ${shown.toLocaleString('en-GB')} kcal today · no calorie target saved`;
      }
      return 'Calories · no calorie target saved';
    }
    if (measure.status === 'Nothing logged yet') return 'Calories · 0 kcal · nothing logged today';
    const target = measure.words.match(/([\d,]+) kcal/)?.[1];
    const state = measure.status === 'Above'
      ? 'above the target'
      : measure.status === 'Under'
        ? 'under the target'
        : measure.status === 'Within'
          ? 'within the target'
          : measure.status === 'Close'
            ? 'close to the target'
            : measure.status === 'Enough'
              ? 'at the target'
              : 'in range';
    const shown = Number(measure.centre).toLocaleString('en-GB');
    return target
      ? `Calories · ${shown} kcal today (target ${target} kcal) · ${state}`
      : `Calories · ${shown} kcal today · ${state}`;
  }
  if (measure.id === 'sessions') {
    if (measure.status === 'Nothing logged yet') return `Training · 0 days · nothing logged ${phrase}`;
    return firstSentence(measure.words);
  }
  if (measure.id === 'sleep') {
    if (measure.status === 'Nothing logged yet') return `Sleep · nothing logged ${phrase}`;
    return firstSentence(measure.words);
  }
  if (measure.status === 'One reading') return `Weight · ${measure.centre} kg · one reading · another reading shows the change`;
  if (measure.status === 'Nothing logged yet') return 'Weight · nothing logged yet';
  return firstSentence(measure.words);
}

/** Met when the named target is reached. Early in a period can still be Met. */
function targetMet(item: GoalMeasure): boolean {
  if (item.status === 'Nothing logged yet' || item.status === 'No target yet' || item.status === 'One reading') return false;
  if (item.id === 'protein') return /\(target \d[\d,]* g\)/.test(item.status) && item.fill >= 0.999;
  if (item.id === 'sessions') return item.fill >= 0.999;
  return item.tone === 'good';
}

function ticksFor(input: GoalLedInput, measures: GoalMeasure[]): GoalTick[] {
  if (!input.goal) return [];
  return measures.map((item) => {
    const done = targetMet(item);
    return {
      id: item.id,
      done,
      label: tickLabel(item, chosenPeriod(input)),
      statusWord: done ? 'Met' : 'Not yet',
      centre: item.centre,
      unit: item.unit,
      fill: item.fill,
    };
  });
}

/** What matters for the saved goal, from figures already logged. */
export function buildGoalLed(input: GoalLedInput): GoalLed {
  if (!input.goal) {
    return {
      name: null,
      matters: 'Pick a goal on You. Today, Stats, and the Health Plan follow it.',
      caution: null,
      measures: [],
      nudges: [],
      progressWords: 'Choose a goal and this check will follow it.',
      ticks: [],
    };
  }
  const measures = measuresFor(input);
  const ticks = ticksFor(input, measures);
  const progressWords = ticks.length
    ? periodHeading(chosenPeriod(input))
    : 'Log a meal, a workout, or a weight reading and this check will fill in.';
  return {
    name: GOAL_LABEL[input.goal],
    matters: mattersFor(input.goal, input.stage, input.blockedLoss === true),
    caution: cautionFor(input.goal, input.blockedLoss === true),
    measures,
    nudges: nudgesFor(input, measures),
    progressWords,
    ticks,
  };
}

/** One context line for Thumos. Calories stay out when they are hidden. */
export function goalProgressLine(input: GoalLedInput): string | null {
  const view = buildGoalLed(input);
  if (!view.name) return null;
  const nudge = view.nudges[0] ?? '';
  const detail = view.ticks.map((tick) => `${tick.label} (${tick.statusWord})`).join('. ');
  const line = `How they're doing toward ${view.name}. ${view.progressWords}. ${detail}${nudge && !detail.includes(nudge) ? ` ${nudge}` : ''}`;
  return input.hideCalories ? line.replace(/\d[\d,]*\s*kcal/gi, 'the amount they set').replace(/\bkcal\b/gi, 'food') : line;
}
