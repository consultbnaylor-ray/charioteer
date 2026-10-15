import {
  COMPETITION_NOTE,
  GOAL_LABEL,
  LOW_BMI_NOTE,
  assessWeight,
  bmiValue,
  compositionForAssessment,
  dayItems,
  kcalFloor,
  lossBlocked,
  mifflinBmr,
  sumItems,
  weightPointsFrom,
  type BodyBuild,
  type BuilderPhase,
  type FoodLog,
  type NutritionGoal,
  type NutritionSex,
} from './nutrition.ts';
import { firstSafetyHit, SELF_HARM_NOTICE, WITHDRAWAL_NOTICE, type SafetyHit } from './safety.ts';
import { soberElapsed } from './sober.ts';

export const PLAN_DOCTOR = 'Check with your doctor before big changes.';

export const PLAN_DISCLAIMER =
  'This plan uses your own figures. It is not a diagnosis and it is not medical advice. Check with your doctor before big changes.';

export type PlanAction = { id: string; text: string; done: boolean };

export type HealthPlan = {
  focus: PlanAction[];
  nutrition: { targets: string; habits: PlanAction[]; swaps: PlanAction[] };
  fitness: { intro: string; sessions: PlanAction[] };
  wellbeing: { habits: PlanAction[] };
  limits: string;
  disclaimer: string;
  updatedAt: string;
};

export type PlanInput = {
  now: Date;
  salt: string;
  displayName: string;
  stage: string;
  sobrietyStartedAt: string | null;
  heightCm: number | null;
  visionStatement: string;
  visionCaptions: string[];
  interestLabels: string[];
  reasons: string[];
  limits: string;
  goal: NutritionGoal | null;
  goalSex: NutritionSex | null;
  goalAge: number | null;
  build: BodyBuild | null;
  kcalTarget: number | null;
  proteinTarget: number | null;
  carbTarget?: number | null;
  fatTarget?: number | null;
  goalPhase?: BuilderPhase | null;
  weightClassKg?: number | null;
  hideCalories: boolean;
  foodLogs: readonly FoodLog[];
  checkIns: readonly { mood: number; craving: number; sleepHours: number; note: string; createdAt: string }[];
  health: readonly { kind: string; value: number; recordedOn: string }[];
  bodyFatPct: number | null;
  leanMassKg: number | null;
  waistCm: number | null;
  doneTexts: string[];
};

type Level = 'starting' | 'some' | 'active';

type Derived = {
  input: PlanInput;
  firstName: string;
  soberDays: number | null;
  soberPath: boolean;
  cutting: boolean;
  level: Level;
  steps: number | null;
  workoutMinutes: number | null;
  sleepHours: number | null;
  moodTrend: 'lower' | 'steady' | 'higher' | 'none';
  cravingTrend: 'higher' | 'steady' | 'lower' | 'none';
  weightTrend: 'down' | 'up' | 'steady' | 'none';
  recentKcal: number | null;
  recentProtein: number | null;
  assessment: string;
  underweight: boolean;
  blockedLoss: boolean;
  floorKcal: number | null;
  belowFloor: boolean;
  hiking: boolean;
  gym: boolean;
  reason: string | null;
  vision: string | null;
  injury: boolean;
  safety: SafetyHit;
  done: string[];
};

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function hash(salt: string, key: string): number {
  let h = 2166136261;
  const s = `${salt}:${key}`;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function pick<T>(salt: string, key: string, items: readonly T[]): T {
  return items[hash(salt, key) % items.length] as T;
}

function unused(items: string[], done: string[]): string[] {
  const finished = new Set(done.map((item) => item.toLowerCase()));
  const left = items.filter((item) => !finished.has(item.toLowerCase()));
  return left.length ? left : items;
}

function take(salt: string, key: string, items: string[], count: number, done: string[]): string[] {
  const pool = unused(items, done);
  const start = hash(salt, key) % pool.length;
  const chosen: string[] = [];
  for (let i = 0; i < pool.length && chosen.length < count; i += 1) {
    const text = pool[(start + i) % pool.length] as string;
    if (!chosen.includes(text)) chosen.push(text);
  }
  return chosen;
}

function actions(prefix: string, texts: string[]): PlanAction[] {
  return texts.map((text, index) => ({ id: `${prefix}-${index + 1}`, text: clip(text, 160), done: false }));
}

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function shift(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(year ?? 2026, (month ?? 1) - 1, date ?? 1);
  next.setDate(next.getDate() + delta);
  return isoDay(next);
}

function average(values: number[]): number | null {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return null;
  return Math.round((clean.reduce((sum, value) => sum + value, 0) / clean.length) * 10) / 10;
}

function trend(recent: number | null, earlier: number | null, margin: number): 'lower' | 'steady' | 'higher' | 'none' {
  if (recent == null || earlier == null) return 'none';
  if (recent <= earlier - margin) return 'lower';
  if (recent >= earlier + margin) return 'higher';
  return 'steady';
}

function derive(input: PlanInput): Derived {
  const today = isoDay(input.now);
  const days = Array.from({ length: 7 }, (_, index) => shift(today, -index));
  const logged = days.flatMap((day) => {
    const totals = sumItems(dayItems(input.foodLogs, day));
    return totals.count ? [totals] : [];
  });
  const weights = weightPointsFrom(input.health);
  const latestWeight = weights.at(-1)?.kg ?? null;
  const earlierWeight = weights.length > 1 ? weights[weights.length - 2]?.kg ?? null : null;
  const composition = compositionForAssessment([{
    id: 'latest',
    recordedOn: today,
    bodyFatPct: input.bodyFatPct,
    leanMassKg: input.leanMassKg,
    waistCm: input.waistCm,
    source: 'other',
    createdAt: input.now.toISOString(),
  }]);
  const assessment = assessWeight({
    bodyFatPct: composition.bodyFatPct,
    waistCm: composition.waistCm,
    weightKg: latestWeight,
    heightCm: input.heightCm,
    build: input.build,
    sex: input.goalSex,
  });
  const bmr = latestWeight != null && input.heightCm != null && input.goalAge != null
    ? mifflinBmr({ weightKg: latestWeight, heightCm: input.heightCm, age: input.goalAge, sex: input.goalSex })
    : null;
  const floorKcal = bmr != null ? kcalFloor(bmr, input.goalSex) : (input.goalSex === 'female' ? 1200 : 1500);
  const bmi = latestWeight != null && input.heightCm != null ? bmiValue(latestWeight, input.heightCm) : null;
  const underweight = assessment.underweight || (bmi != null && bmi < 18.5 && assessment.basis !== 'body_fat' && assessment.basis !== 'waist');
  const steps = average(input.health.filter((row) => row.kind === 'steps' && days.includes(row.recordedOn)).map((row) => row.value));
  const workoutMinutes = input.health
    .filter((row) => row.kind === 'workout_minutes' && days.includes(row.recordedOn))
    .reduce((sum, row) => sum + row.value, 0);
  const sleepFromHealth = average(input.health.filter((row) => row.kind === 'sleep_hours' && days.includes(row.recordedOn)).map((row) => row.value));
  const recentIns = input.checkIns.slice(0, 3);
  const olderIns = input.checkIns.slice(3, 6);
  const interests = input.interestLabels.join(' ').toLowerCase();
  const notes = input.checkIns.slice(0, 8).map((row) => row.note);
  const safety = firstSafetyHit([input.limits, ...input.reasons, ...notes, input.visionStatement]);
  const soberDays = input.sobrietyStartedAt ? soberElapsed(new Date(input.sobrietyStartedAt), input.now).days : null;
  const reason = input.reasons.map((item) => clip(item, 80)).find((item) => item && !firstSafetyHit([item]).selfHarm && !firstSafetyHit([item]).withdrawal) ?? null;
  const vision = clip(input.visionStatement || input.visionCaptions[0] || '', 80);
  return {
    input,
    firstName: input.displayName.split(' ')[0]?.replace(/[^\p{L}’-]/gu, '') || '',
    soberDays,
    soberPath: input.stage === 'stopped' || input.stage === 'trying_to_stop' || (soberDays != null && soberDays > 0),
    cutting: input.stage === 'cutting_down',
    level: workoutMinutes >= 150 || (steps != null && steps >= 8000) ? 'active' : workoutMinutes >= 40 || (steps != null && steps >= 4000) ? 'some' : 'starting',
    steps,
    workoutMinutes: workoutMinutes > 0 ? Math.round(workoutMinutes) : null,
    sleepHours: sleepFromHealth ?? average(recentIns.map((row) => row.sleepHours).filter((value) => value > 0)),
    moodTrend: trend(average(recentIns.map((row) => row.mood)), average(olderIns.map((row) => row.mood)), 0.6) === 'higher'
      ? 'higher'
      : trend(average(recentIns.map((row) => row.mood)), average(olderIns.map((row) => row.mood)), 0.6),
    cravingTrend: trend(average(recentIns.map((row) => row.craving)), average(olderIns.map((row) => row.craving)), 0.6) === 'lower'
      ? 'lower'
      : trend(average(recentIns.map((row) => row.craving)), average(olderIns.map((row) => row.craving)), 0.6) === 'higher'
        ? 'higher'
        : recentIns.length ? 'steady' : 'none',
    weightTrend: latestWeight != null && earlierWeight != null
      ? latestWeight < earlierWeight - 0.2 ? 'down' : latestWeight > earlierWeight + 0.2 ? 'up' : 'steady'
      : 'none',
    recentKcal: average(logged.map((row) => row.kcal)),
    recentProtein: average(logged.map((row) => row.proteinG)),
    assessment: assessment.plain,
    underweight,
    blockedLoss: lossBlocked({
      goal: input.goal,
      weightKg: latestWeight,
      heightCm: input.heightCm,
      phase: input.goalPhase ?? null,
    }) || underweight,
    floorKcal,
    belowFloor: input.kcalTarget != null && input.kcalTarget < floorKcal,
    hiking: /hik|walk|outdoor/.test(interests),
    gym: /gym|weight|lift|strength/.test(interests),
    reason,
    vision: vision || null,
    injury: /injur|pain|surgery|pregnant|condition|asthma|heart|doctor|gp\b/i.test(input.limits),
    safety,
    done: input.doneTexts.map((item) => item.trim()).filter(Boolean).slice(0, 12),
  };
}

function targetLine(facts: Derived): string {
  const goal = facts.input.goal ? GOAL_LABEL[facts.input.goal] : null;
  if (facts.blockedLoss || facts.underweight) {
    return `The aim is enough food, not a smaller intake. ${LOW_BMI_NOTE}`;
  }
  if (facts.belowFloor && facts.floorKcal != null) {
    return `The saved calorie target sits under the safety floor of ${facts.floorKcal.toLocaleString('en-GB')} kcal. This plan uses that floor. ${PLAN_DOCTOR}`;
  }
  const parts: string[] = [];
  if (goal) parts.push(goal);
  if (!facts.input.hideCalories && facts.input.kcalTarget != null) {
    parts.push(`${facts.input.kcalTarget.toLocaleString('en-GB')} kcal`);
  }
  if (facts.input.proteinTarget != null) parts.push(`${facts.input.proteinTarget} g protein`);
  if (facts.input.carbTarget != null) parts.push(`${facts.input.carbTarget} g carbohydrate`);
  if (facts.input.fatTarget != null) parts.push(`${facts.input.fatTarget} g fat`);
  if (facts.input.goal === 'body_builder') {
    parts.push(facts.input.goalPhase === 'cut' ? 'Cut phase, kept modest' : 'Surplus / lean bulk');
  }
  if (facts.input.goal === 'elite_boxer' && facts.input.weightClassKg != null) {
    parts.push(`Weight class ${facts.input.weightClassKg} kg is a note for a coach and a doctor`);
  }
  if (facts.recentKcal != null && !facts.input.hideCalories) {
    parts.push(`recent days averaged ${Math.round(facts.recentKcal).toLocaleString('en-GB')} kcal`);
  }
  if (facts.recentProtein != null) parts.push(`about ${Math.round(facts.recentProtein)} g protein`);
  if (!parts.length) return 'No calorie or protein target is saved yet. Pick one on Nutrition, and keep meals regular until then.';
  return clip(parts.join(' · '), 220);
}

function nutritionHabits(facts: Derived): string[] {
  const goal = facts.input.goal;
  const banks: Record<string, string[]> = {
    lose_weight: [
      'Put protein on the plate before anything else at the meal you rush.',
      'Fill half the dinner plate with vegetables you already buy.',
      'Decide the evening snack in the afternoon, so the cupboard is not the plan.',
      'Eat the meal sitting down, and leave the second helping until you are still hungry.',
    ],
    lose_fat_build_muscle: [
      'Include a protein food at breakfast, lunch, and dinner.',
      'Eat a proper meal after the session, not a bar in the car.',
      'Keep yoghurt or eggs in the house for the meal you usually skip.',
      'Add vegetables to the meal you already cook, rather than a new recipe.',
    ],
    maintain: [
      'Keep three meals at roughly the same times as this week.',
      'Put protein on the lunch you already eat.',
      'Swap the second biscuit for fruit you like.',
      'Drink water with the meal, then decide if you want more food.',
    ],
    increase: [
      'Add one snack you already like, beside a meal, not instead of it.',
      'Make that snack include protein, such as yoghurt, cheese, or nuts.',
      'Do not skip breakfast on the busy morning.',
      'Serve a slightly larger portion of the meal you already cook.',
    ],
    elite_runner: [
      'Eat a carbohydrate food you already like in the hour before the longer session.',
      'Eat a meal with protein and carbohydrate in the hour after training.',
      'Keep the easy day easy, and do not add a second hard session.',
      'Drink water with the meal. Sparkling water counts.',
    ],
    body_builder: facts.input.goalPhase === 'cut'
      ? [
        'Keep three meals. A cut on this screen is a slightly smaller portion, not a skipped meal.',
        'Put protein on each of those meals.',
        'Eat after the lifting session.',
        'Log body fat and lean mass when you have a reading. The scales can stay still.',
      ]
      : [
        'Add a little to the meal you already cook, on top of the meals you already eat.',
        'Put protein on breakfast, lunch, and dinner.',
        'Eat a proper meal after the lifting session.',
        'Log body fat and lean mass when you have a reading.',
      ],
    elite_boxer: [
      'Eat before the session and a proper meal after it.',
      'Keep water with the meal. Do not skip drinks to change the scales.',
      'A weight class, if you have one, is a note for a coach and a doctor.',
      'Put protein on the meals you already eat.',
    ],
    none: [
      'Keep three meals, even on a day that runs late.',
      'Add a protein food to the meal that is usually just toast or a sandwich.',
      'Keep a piece of fruit where you will see it.',
      'Drink a glass of water before the evening meal.',
    ],
  };
  return take(facts.input.salt, 'habits', banks[goal ?? 'none'] ?? banks.none, 4, facts.done);
}

function swaps(facts: Derived): string[] {
  const sober = [
    'At the hour you used to pour a drink, have sparkling water with citrus in a proper glass.',
    'Order a soft drink you actually like when everyone else is at the bar.',
    'Take a ten-minute walk at the old pub time, then eat the meal you planned.',
    facts.hiking
      ? 'Plan a short hike for the evening that used to be a drinking night.'
      : 'Cook one meal you look forward to, and sit down for it.',
  ];
  const cutting = [
    'Have the first drink later, and put food on the table before it.',
    'Alternate a drink with sparkling water.',
    'Pick a smaller measure than last week, and stop at the number you chose this morning.',
  ];
  const food = [
    'Swap the pastry breakfast for eggs or yoghurt.',
    'Keep nuts or cheese in the bag instead of the shop chocolate.',
    'Build the plate around vegetables and protein, then add the carbohydrate you like.',
    facts.gym ? 'After the gym, eat a meal you cooked rather than a second coffee.' : 'Keep the evening meal at home on two nights this week.',
  ];
  const athlete = facts.input.goal === 'elite_runner' || facts.input.goal === 'body_builder' || facts.input.goal === 'elite_boxer';
  const recovery = 'After training, eat the meal you planned and have sparkling water. A drink is not the recovery.';
  const pool = facts.soberPath && athlete
    ? [recovery, ...sober]
    : facts.soberPath
      ? sober
      : facts.cutting
        ? [...cutting, ...food.slice(0, 2)]
        : food;
  return take(facts.input.salt, 'swaps', pool, facts.soberPath ? 3 : 3, facts.done);
}

function sessions(facts: Derived): string[] {
  if (facts.safety.withdrawal) {
    return [
      'Rest. Do not use exercise to sweat out a drink.',
      'A slow walk is enough if you feel steady, and only if you want it.',
      'Leave the other days free.',
    ];
  }
  if (facts.safety.selfHarm) {
    return [
      'Rest is the plan.',
      'A short walk outside counts, and only if you want company or daylight.',
      'Leave training for another week.',
    ];
  }
  if (facts.injury) {
    return [
      'Monday · Ten easy minutes of movement that does not hurt, then stop.',
      'Tuesday · Rest.',
      'Wednesday · The same easy minutes, or a shorter walk.',
      'Thursday · Rest.',
      'Friday · Only what still feels ordinary the next morning.',
      'Saturday · Rest, or a very short outing.',
      'Sunday · Rest.',
    ];
  }
  const athleteWeek = athleteSessions(facts);
  if (athleteWeek) return athleteWeek;
  const walk = facts.level === 'active' ? '30 minutes' : facts.level === 'some' ? '20 minutes' : '15 minutes';
  const longer = facts.level === 'starting' ? '20 minutes' : 'a little longer than last week';
  const hard = facts.gym && facts.level !== 'starting'
    ? 'Wednesday · A short gym session, one exercise less than you could do, and stop while the last set is still tidy.'
    : facts.hiking
      ? `Wednesday · A walk outdoors for ${walk}.`
      : `Wednesday · A walk for ${walk}.`;
  const weekend = facts.hiking
    ? `Saturday · A hike ${facts.level === 'starting' ? 'on an easy path, and turn back early' : longer}.`
    : facts.gym
      ? 'Saturday · The same gym session as Wednesday, or a rest if the legs are heavy.'
      : `Saturday · A walk for ${longer}.`;
  return [
    `Monday · Walk for ${walk}.`,
    'Tuesday · Rest.',
    hard,
    'Thursday · Rest.',
    `Friday · Walk for ${walk}, or skip it if Wednesday was plenty.`,
    weekend,
    'Sunday · Rest.',
  ];
}

function athleteSessions(facts: Derived): string[] | null {
  const goal = facts.input.goal;
  if (goal !== 'elite_runner' && goal !== 'body_builder' && goal !== 'elite_boxer') return null;
  const easy = facts.level === 'starting';
  const soberRest = facts.soberPath
    ? 'Sunday · Rest. Recovery is the meal, water, and sleep. A soft drink is enough if you want one.'
    : 'Sunday · Rest.';
  if (goal === 'elite_runner') {
    return [
      easy
        ? 'Monday · A brisk walk, then a carbohydrate snack you already like.'
        : 'Monday · An easy run, then a carbohydrate snack you already like.',
      'Tuesday · Rest, or a very easy spin if the legs feel ordinary.',
      easy
        ? 'Wednesday · A slightly longer walk. Eat a meal in the hour after, with carbohydrate and protein.'
        : 'Wednesday · The longer session. Eat a meal in the hour after, with carbohydrate and protein.',
      'Thursday · Rest.',
      'Friday · A short session, and stop while you could still do more.',
      'Saturday · The session you care about. Eat before it, and a proper meal after.',
      soberRest,
    ];
  }
  if (goal === 'body_builder') {
    const cut = facts.input.goalPhase === 'cut'
      ? 'Monday · A lifting session with fewer sets than your best week. Keep every meal. This cut is a small change, not a skipped meal.'
      : 'Monday · A lifting session, fewer sets than your best week, then a meal with protein.';
    return [
      cut,
      'Tuesday · Rest, or a short walk.',
      'Wednesday · The second lifting session. Eat after it.',
      'Thursday · Rest.',
      'Friday · A shorter lifting session, and stop while the last set is tidy.',
      'Saturday · Rest if the week was heavy. Otherwise the same session as Monday.',
      soberRest,
    ];
  }
  return [
    'Monday · Skill work or a pad session, then a meal. Do not skip food to change the scales.',
    'Tuesday · Rest.',
    easy
      ? 'Wednesday · A short walk or easy skill work, then stop.'
      : 'Wednesday · A shorter session than you could do.',
    'Thursday · Rest.',
    'Friday · Easy skill work, and stop if you feel flat.',
    'Saturday · The session you care about, with food before and after.',
    facts.soberPath
      ? `Sunday · Rest. ${COMPETITION_NOTE} Recovery stays alcohol-free.`
      : `Sunday · Rest. ${COMPETITION_NOTE}`,
  ];
}

function fitnessIntro(facts: Derived): string {
  if (facts.safety.withdrawal) return `${WITHDRAWAL_NOTICE}`;
  if (facts.safety.selfHarm) return 'Training can wait. A person comes first.';
  if (facts.injury) return `Keep this week short and easy, and stop if something hurts. ${PLAN_DOCTOR}`;
  if (facts.input.goal === 'elite_runner' || facts.input.goal === 'body_builder' || facts.input.goal === 'elite_boxer') {
    const load = facts.workoutMinutes != null
      ? `${facts.workoutMinutes} workout minutes over the last week`
      : 'no workout minutes logged yet';
    const aim = facts.input.goal === 'elite_runner'
      ? 'This week keeps fuel around the sessions and a rest day after the longer one.'
      : facts.input.goal === 'body_builder'
        ? 'This week keeps the lifting volume you can recover from, with food after the sessions.'
        : 'This week keeps skill work and food around it. A weigh-in plan belongs with a coach and a doctor.';
    return clip(`${aim} Recent training load: ${load}.`, 280);
  }
  const steps = facts.steps != null ? `${Math.round(facts.steps).toLocaleString('en-GB')} steps on a recent day` : 'no step count yet';
  const work = facts.workoutMinutes != null ? `${facts.workoutMinutes} workout minutes over the last week` : 'no workout minutes logged';
  const pace = facts.level === 'active'
    ? 'You are already moving, so this week adds a little, then rests.'
    : facts.level === 'some'
      ? 'This week keeps the movement you have and leaves two rest days.'
      : 'This week starts with short walks and more rest than work.';
  return clip(`${pace} Recent figures: ${steps}, ${work}.`, 240);
}

function wellbeingHabits(facts: Derived): string[] {
  if (facts.safety.selfHarm) {
    return [SELF_HARM_NOTICE, 'A check-in can wait. If you want a person on the phone, the Samaritans line above stays open.'];
  }
  const sleep = facts.sleepHours == null
    ? 'Pick a lights-out time and keep it on four nights.'
    : facts.sleepHours < 6.5
      ? `Sleep has been about ${facts.sleepHours} hours. Bring the evening forward by 20 minutes on four nights.`
      : `Sleep has been about ${facts.sleepHours} hours. Keep that, and protect it the night before a busier day.`;
  const mood = facts.moodTrend === 'lower'
    ? 'Mood has been lower than the earlier check-ins. Keep the check-in short, and one ordinary plan in the afternoon.'
    : facts.moodTrend === 'higher'
      ? 'Mood has lifted on the later check-ins. Keep the same rhythm rather than adding a new project.'
      : 'Check in on the days you already open the app. Mood and craving are enough.';
  const stress = facts.cravingTrend === 'higher'
    ? 'Cravings have been higher. Use the breathing timer once when the urge shows up, then a glass of water.'
    : 'When the day spikes, use one minute of the breathing timer before you decide the next thing.';
  const wind = facts.vision
    ? `The board says “${facts.vision}”. One small step toward it is enough this week.`
    : facts.reason
      ? `Your reason, “${facts.reason}”, is the point of the easy evening.`
      : 'Leave one evening with nothing planned except the meal and an early night.';
  return take(facts.input.salt, 'well', [sleep, mood, stress, wind], 4, facts.done);
}

function focusLines(facts: Derived, habits: string[], session: string, well: string): string[] {
  const name = facts.firstName ? `${facts.firstName}, ` : '';
  const moved = facts.done[0] ? `You marked “${clip(facts.done[0], 80)}” done, so this week moves on.` : '';
  const lines = [
    clip(`${name}${moved || 'One focus is enough.'} ${habits[0] ?? ''}`.replace(/\s+/g, ' '), 160),
    session,
    well,
  ].filter((line) => line.trim().length > 0);
  const unique = [...new Set(lines)];
  return unique.slice(0, facts.done.length > 2 ? 2 : 3);
}

function written(facts: Derived, updatedAt: string): HealthPlan {
  const habits = nutritionHabits(facts);
  const swapLines = swaps(facts);
  const week = sessions(facts);
  const well = wellbeingHabits(facts);
  return {
    focus: actions('focus', focusLines(facts, habits, week[0] ?? 'A short walk, then rest.', well[0] ?? 'An early night.')),
    nutrition: {
      targets: targetLine(facts),
      habits: actions('habit', habits),
      swaps: actions('swap', swapLines),
    },
    fitness: { intro: fitnessIntro(facts), sessions: actions('session', week) },
    wellbeing: { habits: actions('well', well) },
    limits: clip(facts.input.limits, 280),
    disclaimer: PLAN_DISCLAIMER,
    updatedAt,
  };
}

const BANNED = /\b(i diagnose|you have (?:depression|anxiety|an eating disorder|diabetes|cancer)|prescri(?:be|ption)|stop your medication|starve|eat nothing)\b/i;
const DEFICIT = /\b(eat less|calorie deficit|skip meals|cut your calories|0 kcal)\b/i;
const HARMFUL_CUT = /\b(dehydrat\w*|sauna|water cut|diuretic)\b/i;

/** A refusal ("will not plan dehydration") stays. A suggestion to do it does not. */
function recommendsHarmfulCut(text: string): boolean {
  if (!HARMFUL_CUT.test(text)) return false;
  return !/\b(will not|do not|don't|never|not plan)\b/i.test(text);
}

function cleanLine(text: string, facts: Derived): string | null {
  const line = clip(text, 220);
  if (!line || BANNED.test(line) || recommendsHarmfulCut(line)) return null;
  if ((facts.underweight || facts.blockedLoss) && DEFICIT.test(line)) return null;
  if (facts.belowFloor && facts.input.kcalTarget != null && line.includes(String(facts.input.kcalTarget)) && facts.floorKcal != null) {
    return line.replaceAll(String(facts.input.kcalTarget), String(facts.floorKcal));
  }
  return line;
}

function mergeActions(prefix: string, incoming: PlanAction[], fallback: PlanAction[], facts: Derived, min: number, max: number): PlanAction[] {
  const seen = new Set<string>();
  const next: PlanAction[] = [];
  for (const action of [...incoming, ...fallback]) {
    const text = cleanLine(action.text, facts);
    if (!text || seen.has(text.toLowerCase())) continue;
    if (facts.done.some((done) => done.toLowerCase() === text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    next.push({ id: `${prefix}-${next.length + 1}`, text, done: false });
    if (next.length >= max) break;
  }
  return next.slice(0, Math.max(min, Math.min(max, next.length || min)));
}

export function guardHealthPlan(plan: HealthPlan, input: PlanInput): HealthPlan {
  const facts = derive(input);
  const local = written(facts, plan.updatedAt || input.now.toISOString());
  const focus = mergeActions('focus', plan.focus, local.focus, facts, 1, 3);
  const habits = mergeActions('habit', plan.nutrition.habits, local.nutrition.habits, facts, 3, 4);
  const swapLines = mergeActions('swap', plan.nutrition.swaps, local.nutrition.swaps, facts, 2, 4);
  let targets = cleanLine(plan.nutrition.targets, facts) ?? local.nutrition.targets;
  if ((facts.underweight || facts.blockedLoss) && !targets.includes('will not suggest eating less')) {
    targets = clip(`${targets} ${LOW_BMI_NOTE}`, 320);
  }
  let intro = cleanLine(plan.fitness.intro, facts) ?? local.fitness.intro;
  if (facts.injury && !intro.includes(PLAN_DOCTOR)) intro = clip(`${intro} ${PLAN_DOCTOR}`, 320);
  if (facts.safety.withdrawal && !intro.includes('do not stop suddenly')) intro = WITHDRAWAL_NOTICE;
  const sessionsOut = facts.safety.selfHarm || facts.safety.withdrawal || facts.injury
    ? local.fitness.sessions
    : mergeActions('session', plan.fitness.sessions, local.fitness.sessions, facts, 3, 7);
  let wellbeing = mergeActions('well', plan.wellbeing.habits, local.wellbeing.habits, facts, 2, 4);
  if (facts.safety.selfHarm && !wellbeing.some((item) => item.text.includes('116 123'))) {
    wellbeing = [{ id: 'well-crisis', text: SELF_HARM_NOTICE, done: false }, ...wellbeing].slice(0, 4);
  }
  if (facts.safety.withdrawal && !wellbeing.some((item) => item.text.includes('do not stop suddenly'))) {
    wellbeing = [{ id: 'well-withdrawal', text: WITHDRAWAL_NOTICE, done: false }, ...wellbeing].slice(0, 4);
  }
  return {
    focus: focus.length ? focus : local.focus,
    nutrition: { targets, habits: habits.length >= 3 ? habits : local.nutrition.habits, swaps: swapLines.length >= 2 ? swapLines : local.nutrition.swaps },
    fitness: { intro, sessions: sessionsOut.length ? sessionsOut : local.fitness.sessions },
    wellbeing: { habits: wellbeing.length ? wellbeing : local.wellbeing.habits },
    limits: clip(input.limits, 280),
    disclaimer: PLAN_DISCLAIMER,
    updatedAt: plan.updatedAt || input.now.toISOString(),
  };
}

export function draftHealthPlan(input: PlanInput): HealthPlan {
  const facts = derive(input);
  return guardHealthPlan(written(facts, input.now.toISOString()), input);
}

export function togglePlanAction(plan: HealthPlan, id: string): HealthPlan {
  const flip = (action: PlanAction): PlanAction => action.id === id ? { ...action, done: !action.done } : action;
  return {
    ...plan,
    focus: plan.focus.map(flip),
    nutrition: {
      ...plan.nutrition,
      habits: plan.nutrition.habits.map(flip),
      swaps: plan.nutrition.swaps.map(flip),
    },
    fitness: { ...plan.fitness, sessions: plan.fitness.sessions.map(flip) },
    wellbeing: { habits: plan.wellbeing.habits.map(flip) },
  };
}

export function donePlanTexts(plan: HealthPlan): string[] {
  return [
    ...plan.focus,
    ...plan.nutrition.habits,
    ...plan.nutrition.swaps,
    ...plan.fitness.sessions,
    ...plan.wellbeing.habits,
  ].filter((action) => action.done).map((action) => action.text);
}

function asActions(value: unknown, prefix: string, keepDone: boolean): PlanAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const text = typeof (item as { text?: unknown }).text === 'string' ? (item as { text: string }).text : '';
    if (!text.trim()) return [];
    const id = typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : `${prefix}-${index + 1}`;
    const done = keepDone && (item as { done?: unknown }).done === true;
    return [{ id: clip(id, 40), text, done }];
  });
}

/** A row already saved for this person. Ticks stay ticked. A model reply does not use this. */
export function healthPlanFromStored(row: unknown): HealthPlan | null {
  if (!row || typeof row !== 'object') return null;
  const data = row as Record<string, unknown>;
  const nutrition = (data.nutrition ?? null) as { targets?: unknown; habits?: unknown; swaps?: unknown } | null;
  const fitness = (data.fitness ?? null) as { intro?: unknown; sessions?: unknown } | null;
  const wellbeing = (data.wellbeing ?? null) as { habits?: unknown } | null;
  const focus = asActions(data.focus, 'focus', true);
  const updatedAt = typeof data.updatedAt === 'string'
    ? data.updatedAt
    : typeof data.updated_at === 'string'
      ? data.updated_at
      : '';
  if (!focus.length || !updatedAt) return null;
  const disclaimer = typeof data.disclaimer === 'string' && data.disclaimer.trim()
    ? data.disclaimer
    : PLAN_DISCLAIMER;
  return {
    focus,
    nutrition: {
      targets: typeof nutrition?.targets === 'string' ? nutrition.targets : '',
      habits: asActions(nutrition?.habits, 'habit', true),
      swaps: asActions(nutrition?.swaps, 'swap', true),
    },
    fitness: {
      intro: typeof fitness?.intro === 'string' ? fitness.intro : '',
      sessions: asActions(fitness?.sessions, 'session', true),
    },
    wellbeing: { habits: asActions(wellbeing?.habits, 'well', true) },
    limits: typeof data.limits === 'string' ? data.limits.slice(0, 280) : '',
    disclaimer,
    updatedAt,
  };
}

export function parseHealthPlanJson(raw: string): HealthPlan | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      focus?: unknown;
      nutrition?: { targets?: unknown; habits?: unknown; swaps?: unknown };
      fitness?: { intro?: unknown; sessions?: unknown };
      wellbeing?: { habits?: unknown };
    };
    return {
      focus: asActions(parsed.focus, 'focus', false),
      nutrition: {
        targets: typeof parsed.nutrition?.targets === 'string' ? parsed.nutrition.targets : '',
        habits: asActions(parsed.nutrition?.habits, 'habit', false),
        swaps: asActions(parsed.nutrition?.swaps, 'swap', false),
      },
      fitness: {
        intro: typeof parsed.fitness?.intro === 'string' ? parsed.fitness.intro : '',
        sessions: asActions(parsed.fitness?.sessions, 'session', false),
      },
      wellbeing: { habits: asActions(parsed.wellbeing?.habits, 'well', false) },
      limits: '',
      disclaimer: PLAN_DISCLAIMER,
      updatedAt: '',
    };
  } catch {
    return null;
  }
}

export const HEALTH_PLAN_PROMPT = [
  'You write a short personal health plan from the figures you are given. Reply with JSON only.',
  'Three sections: nutrition (targets sentence, 3 or 4 practical habits, food swaps), fitness (a realistic week with rest days, matched to the activity already logged), and wellbeing (sleep, stress, mood, and a check-in rhythm).',
  'Also give this week\'s focus as 1 to 3 items.',
  'Use the person\'s interests, reasons, and vision when they are present. Vary the sentences. Do not reuse a stock template.',
  'If a finished action is listed, do not repeat it. Move on to the next step.',
  'For someone sober or trying to stop, include alcohol-replacement ideas in the swaps. Recovery after training stays alcohol-free.',
  'If the goal is an elite runner, body builder, or combat-sport athlete, include training load, recovery, and fuelling around sessions.',
  'Do not suggest a rapid weight cut, dehydration, a sauna, or skipping meals to make weight. A competition weigh-in belongs with a coach and a doctor.',
  'No diagnosis, no medication, no medical advice. Do not tell anyone to eat less when the figures say the intake should not fall. Do not suggest stopping alcohol suddenly.',
  'If a limit mentions injury, pain, pregnancy, or a health condition, keep the week easy and say to check with a doctor before big changes.',
  'Shape: {"focus":[{"id":"focus-1","text":""}],"nutrition":{"targets":"","habits":[{"id":"habit-1","text":""}],"swaps":[{"id":"swap-1","text":""}]},"fitness":{"intro":"","sessions":[{"id":"session-1","text":""}]},"wellbeing":{"habits":[{"id":"well-1","text":""}]}}',
].join(' ');

/** What another member may see. Habits, swaps, sessions, targets, and limits stay off. */
export type SharedHealthPlan = {
  headline: string;
  focus: { text: string; done: boolean }[];
  ticked: number;
  total: number;
};

const UNIT_FIGURE = /\b\d[\d,.]*\s*(?:kcal|kg|g|cm|steps|bpm|hours?)\b|\b\d[\d,.]*\s*%/gi;
const NAMED_FIGURE = /\b(?:bmi|body fat|waist|lean mass)\b(?:\s*\d[\d,.]*)?|\b\d[\d,.]*\s*(?:bmi|body fat|waist|lean mass)\b/gi;

/** Drops unit-bearing readings. A bare plan such as "30 minutes" stays. */
export function redactPlanLine(text: string): string {
  const cleaned = text
    .replace(UNIT_FIGURE, ' ')
    .replace(NAMED_FIGURE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return '';
  return cleaned;
}

/**
 * Headline goal, this week's focus, and the tick count.
 * Null when the switch is off or there is no plan. Nutrition targets are never copied.
 */
export function presentSharedHealthPlan(
  plan: HealthPlan | null | undefined,
  shared: boolean,
  goal: NutritionGoal | null | undefined,
): SharedHealthPlan | null {
  if (!shared || !plan) return null;
  const focus = plan.focus.flatMap((action) => {
    const text = redactPlanLine(action.text);
    if (!text) return [];
    return [{ text, done: action.done }];
  });
  return {
    headline: goal && GOAL_LABEL[goal] ? GOAL_LABEL[goal] : 'Health plan',
    focus,
    ticked: focus.filter((action) => action.done).length,
    total: focus.length,
  };
}

/** Reads the shared_health_plan payload. Anything else is hidden. */
export function parseSharedHealthPlan(value: unknown): SharedHealthPlan | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const headline = typeof row.headline === 'string' ? row.headline.trim() : '';
  const focus = (Array.isArray(row.focus) ? row.focus : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const action = item as Record<string, unknown>;
    const text = typeof action.text === 'string' ? action.text.trim() : '';
    if (!text) return [];
    return [{ text, done: action.done === true }];
  });
  if (!headline && focus.length === 0) return null;
  return {
    headline: headline || 'Health plan',
    focus,
    ticked: focus.filter((action) => action.done).length,
    total: focus.length,
  };
}
