import { GOAL_LABEL, MIDDLEWEIGHT_LIMIT_KG, PRO_BOXING_CLASSES, classBoxerLimitKg, isClassBoxer, type NutritionGoal } from './nutrition.ts';

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
};

export type GoalTick = {
  id: string;
  done: boolean;
  label: string;
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
  /** False when workout figures were not loaded, so the check does not invent a rest week. */
  workoutsKnown?: boolean;
  workoutDays?: number;
  workoutMinutes?: number;
  scheduledDays?: number | null;
  weightKg?: number | null;
  previousWeightKg?: number | null;
  sleepHours?: number | null;
};

const FOCUS: Record<NutritionGoal, string> = {
  lose_weight: 'Keep protein on the meal you rush, and let the weight trend run across weeks.',
  lose_fat_build_muscle: 'Include protein at the meals you already eat, and keep the strength sessions you already do.',
  maintain: 'Keep meals at the times you already use, and let weight stay steady.',
  increase: 'Add a little to a meal you already cook, with protein, and keep the strength sessions.',
  elite_runner: 'Eat before and after the sessions you already do, and protect sleep the night before the longer one.',
  body_builder: 'Keep protein on each meal, and keep the lifting you already do. Do not skip a meal.',
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

function proteinMeasure(input: GoalLedInput): GoalMeasure {
  const target = num(input.proteinTarget);
  const protein = Math.max(0, input.todayProtein ?? 0);
  if (!input.todayLogged) {
    return { id: 'protein', label: 'Protein', centre: '0', unit: 'g', fill: 0, status: 'Nothing logged yet', tone: 'info', words: 'Log a meal and this shows protein for today.' };
  }
  if (target != null && target > 0) {
    const on = protein >= target;
    return {
      id: 'protein',
      label: 'Protein',
      centre: String(Math.round(protein)),
      unit: 'g',
      fill: clamp01(protein / target),
      status: on ? 'On track' : 'Short',
      tone: on ? 'good' : 'watch',
      words: on ? `Protein is at the ${Math.round(target)} g you set.` : `Protein is ${Math.round(target - protein)} g short for today.`,
    };
  }
  return {
    id: 'protein',
    label: 'Protein',
    centre: String(Math.round(protein)),
    unit: 'g',
    fill: protein > 0 ? 1 : 0,
    status: protein > 0 ? 'Logged' : 'Nothing logged yet',
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
  if (aim === 'match') {
    status = close ? 'Close' : over ? 'Above' : 'Under';
    tone = close ? 'good' : 'watch';
  } else if (aim === 'under-or-at') {
    status = over ? 'Above' : 'Within';
    tone = over ? 'watch' : 'good';
  } else {
    status = under ? 'Under' : 'Enough';
    tone = under ? 'watch' : 'good';
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
  const days = Math.max(0, input.workoutDays ?? 0);
  const minutes = Math.max(0, Math.round(input.workoutMinutes ?? 0));
  const aim = input.scheduledDays != null && input.scheduledDays > 0 ? input.scheduledDays : null;
  const fill = aim ? clamp01(days / aim) : (minutes > 0 ? 1 : 0);
  const on = aim ? days >= aim : minutes >= 20;
  return {
    id: 'sessions',
    label: 'Training',
    centre: String(days),
    unit: days === 1 ? 'day' : 'days',
    fill,
    status: aim ? `${days} of ${aim}` : minutes > 0 ? `${minutes} min` : 'Nothing logged yet',
    tone: on ? 'good' : days > 0 || minutes > 0 ? 'info' : 'watch',
    words: aim
      ? `${days} of ${aim} planned training days have a workout logged.`
      : minutes > 0
        ? `${minutes} workout minutes are logged this week.`
        : 'No workout minutes are logged this week.',
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
    const named = isClassBoxer(input.goal) ? PRO_BOXING_CLASSES[input.goal].short : 'middleweight';
    const limit = isClassBoxer(input.goal)
      ? classBoxerLimitKg(input.goal) ?? MIDDLEWEIGHT_LIMIT_KG
      : num(input.weightClassKg) ?? MIDDLEWEIGHT_LIMIT_KG;
    const near = latest <= limit + 1;
    return {
      id: 'weight',
      label: 'Class',
      centre: String(round1(latest)),
      unit: 'kg',
      fill: latest > 0 ? clamp01(limit / latest) : 0,
      status: near ? 'Near the class' : 'Above the class',
      tone: near ? 'good' : 'watch',
      words: isClassBoxer(input.goal)
        ? near
          ? `Weight is near the ${named} limit of ${limit} kg. Keep every meal.`
          : `Weight is above the ${named} limit of ${limit} kg. Keep every meal. A small change only.`
        : near
          ? `Weight is near the ${limit} kg class. Keep every meal.`
          : `Weight is above the ${limit} kg class. Keep every meal. A small change only.`,
    };
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
    words: steady ? 'Weight is steady on the last two readings.' : `Weight is ${change > 0 ? 'up' : 'down'} ${Math.abs(change)} kg on the last two readings.`,
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
    words: usual ? 'Sleep is in the usual 7 to 9 hour range.' : `Sleep was about ${round1(hours)} hours.${input.goal ? ` Recovery matters for ${GOAL_LABEL[input.goal]}.` : ''}`,
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
  if (protein?.status === 'Short' && protein.words.includes('short')) lines.push(protein.words.replace(/\.$/, '') + '.');
  const sleep = measures.find((item) => item.id === 'sleep');
  if (sleep?.status === 'Short') lines.push(sleep.words);
  const weight = measures.find((item) => item.id === 'weight' && item.status === 'Above the class');
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

function tickLabel(measure: GoalMeasure): string {
  if (measure.id === 'protein') {
    if (measure.status === 'On track') return 'Protein is on track';
    if (measure.status === 'Short') return 'Protein is short today';
    if (measure.status === 'Logged') return 'Protein is logged';
    return 'Protein is not logged yet';
  }
  if (measure.id === 'kcal') {
    if (measure.status === 'Above') return 'Calories are above the target';
    if (measure.status === 'Under') return 'Calories are under the target';
    if (measure.status === 'No target yet') return 'No calorie target yet';
    if (measure.status === 'Nothing logged yet') return 'Calories are not logged yet';
    return 'Calories are in range';
  }
  if (measure.id === 'sessions') {
    if (measure.status === 'Nothing logged yet') return 'No training logged this week';
    return `Training is ${measure.status}`;
  }
  if (measure.id === 'sleep') {
    if (measure.status === 'In the usual range') return 'Sleep is in the usual range';
    if (measure.status === 'Short') return 'Sleep is short';
    if (measure.status === 'Nothing logged yet') return 'Sleep is not logged yet';
    return 'Sleep is above the usual range';
  }
  if (measure.status === 'Above the class') return 'Weight is above the class';
  if (measure.status === 'Near the class') return 'Weight is near the class';
  if (measure.status === 'Steady') return 'Weight is steady';
  if (measure.status === 'Down') return 'Weight is down';
  if (measure.status === 'Up') return 'Weight is up';
  if (measure.status === 'One reading') return 'Weight needs another reading';
  return 'Weight is not logged yet';
}

function ticksFor(input: GoalLedInput, measures: GoalMeasure[]): GoalTick[] {
  if (!input.goal) return [];
  return measures.map((item) => ({
    id: item.id,
    done: item.tone === 'good',
    label: tickLabel(item),
  }));
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
    ? `This week: ${ticks.map((tick) => tick.label.charAt(0).toLowerCase() + tick.label.slice(1)).join(', ')}.`
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
  const line = `How they're doing toward ${view.name}: ${view.progressWords}${nudge && !view.progressWords.includes(nudge) ? ` ${nudge}` : ''}`;
  return input.hideCalories ? line.replace(/\d[\d,]*\s*kcal/gi, 'the amount they set').replace(/\bkcal\b/gi, 'food') : line;
}
