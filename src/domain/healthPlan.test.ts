import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { TAB_SECTIONS } from './sections';
import {
  PLAN_DISCLAIMER,
  PLAN_DOCTOR,
  donePlanTexts,
  HEALTH_PLAN_PROMPT,
  SOBER_SWAP,
  SWAP_LOG_MORE,
  draftHealthPlan,
  guardHealthPlan,
  healthPlanFromStored,
  standaloneFocus,
  healthPlanModelContext,
  mentionsOtherTracker,
  mentionsRegressiveSession,
  mentionsUnsupportedSwap,
  planBaseline,
  trainingBaseline,
  trainingScheduleFromRow,
  trainingScheduleSummary,
  presentSharedHealthPlan,
  togglePlanAction,
  type HealthPlan,
  type PlanInput,
} from './healthPlan';
import type { FoodLog } from './nutrition';
import { defaultNutritionSettings } from './nutrition';
import { defaultProfileSharing, projectPublicProfile, sharedReportItems, type ShareSource } from './profileSharing';

function input(partial: Partial<PlanInput> = {}): PlanInput {
  return {
    now: new Date('2026-10-15T09:00:00.000Z'),
    salt: 'test',
    displayName: 'Alex Hart',
    stage: 'exploring',
    sobrietyStartedAt: null,
    heightCm: 178,
    visionStatement: '',
    visionCaptions: [],
    interestLabels: [],
    reasons: [],
    limits: '',
    goal: 'maintain',
    goalSex: 'male',
    goalAge: 34,
    build: null,
    kcalTarget: 2200,
    proteinTarget: 140,
    hideCalories: false,
    foodLogs: [],
    checkIns: [],
    health: [
      { kind: 'weight_kg', value: 80, recordedOn: '2026-10-14' },
      { kind: 'steps', value: 9000, recordedOn: '2026-10-15' },
    ],
    bodyFatPct: null,
    leanMassKg: null,
    waistCm: null,
    doneTexts: [],
    ...partial,
  };
}

function joined(plan: ReturnType<typeof draftHealthPlan>): string {
  return JSON.stringify(plan);
}

function isoShift(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(year ?? 2026, (month ?? 1) - 1, date ?? 1);
  next.setDate(next.getDate() + delta);
  const monthText = String(next.getMonth() + 1).padStart(2, '0');
  const dateText = String(next.getDate()).padStart(2, '0');
  return `${next.getFullYear()}-${monthText}-${dateText}`;
}

function weekdayOf(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(year ?? 2026, (month ?? 1) - 1, date ?? 1);
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][next.getDay()] ?? '';
}

/** Workout minutes on each of the last 28 days, optionally skipping a weekday. */
function dailyWorkouts(minutes: number, skip: (day: string) => boolean = () => false) {
  const rows: { kind: string; value: number; recordedOn: string }[] = [];
  for (let offset = 0; offset < 28; offset += 1) {
    const recordedOn = isoShift('2026-10-15', -offset);
    if (skip(recordedOn)) continue;
    rows.push({ kind: 'workout_minutes', value: minutes, recordedOn });
  }
  return rows;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function mealLog(name: string, note = ''): FoodLog {
  return {
    id: name,
    userId: 'user',
    eatenOn: '2026-10-15',
    eatenAt: null,
    meal: 'snack',
    source: 'manual',
    note,
    items: [{
      name,
      kcal: 1,
      proteinG: 0,
      carbsG: 0,
      sugarG: 0,
      fibreG: 0,
      unsaturatedG: 0,
      saturatedG: 0,
      transG: 0,
      sodiumMg: 0,
      processed: false,
    }],
    estimated: false,
    portion: 1,
    createdAt: '2026-10-15T09:00:00.000Z',
    previewUrl: null,
  };
}

describe('health plan writer', () => {
  it('writes a different plan for a sober hiker than for someone cutting weight', () => {
    const sober = draftHealthPlan(input({
      salt: 'sober-hike',
      stage: 'stopped',
      sobrietyStartedAt: '2026-06-01',
      interestLabels: ['Hiking', 'Gym'],
      visionStatement: 'A steady morning.',
      reasons: ['Evenings with my sister.'],
      goal: null,
    }));
    const cutting = draftHealthPlan(input({
      salt: 'films',
      displayName: 'Sam Cole',
      stage: 'exploring',
      goal: 'lose_weight',
      interestLabels: ['Films'],
      health: [{ kind: 'weight_kg', value: 82, recordedOn: '2026-10-14' }],
    }));
    const soberText = joined(sober).toLowerCase();
    const cuttingText = joined(cutting).toLowerCase();
    expect(soberText).not.toBe(cuttingText);
    expect(soberText).toMatch(/hike/);
    expect(sober.nutrition.swaps.map((item) => item.text).join(' ')).not.toMatch(/drinking night|evening drink|bitters|crisp|replace any/i);
    expect(sober.nutrition.swaps.some((item) => item.text === SOBER_SWAP)).toBe(true);
    expect(cuttingText).not.toMatch(/sparkling water/);
    expect(sober.fitness.sessions.some((item) => /rest/i.test(item.text))).toBe(true);
    expect(sober.focus.length).toBeGreaterThanOrEqual(1);
    expect(sober.focus.length).toBeLessThanOrEqual(3);
    expect(sober.disclaimer).toBe(PLAN_DISCLAIMER);
  });

  it('changes the habits when the salt changes', () => {
    const first = draftHealthPlan(input({ salt: 'alpha-plan' }));
    const second = draftHealthPlan(input({ salt: 'salt-2' }));
    expect(first.nutrition.habits.map((item) => item.text).join('|')).not.toBe(
      second.nutrition.habits.map((item) => item.text).join('|'),
    );
  });

  it('refuses a low intake for an underweight person and does not keep 900 kcal', () => {
    const plan = draftHealthPlan(input({
      salt: 'under',
      goal: 'lose_weight',
      kcalTarget: 900,
      health: [{ kind: 'weight_kg', value: 50, recordedOn: '2026-10-14' }],
    }));
    expect(plan.nutrition.targets).toContain('will not suggest eating less');
    expect(joined(plan)).not.toContain('900');
    expect(plan.nutrition.habits.map((item) => item.text).join(' ')).not.toMatch(/\beat less\b/i);
  });

  it('keeps a carrying-extra plan on a healthy protein weight and a doctor check', () => {
    const plan = draftHealthPlan(input({
      salt: 'carry',
      goal: 'lose_weight',
      build: 'carrying_extra',
      kcalTarget: 2100,
      proteinTarget: 140,
      heightCm: 170,
      health: [{ kind: 'weight_kg', value: 90, recordedOn: '2026-10-14' }],
    }));
    expect(plan.nutrition.targets).toContain('healthy weight');
    expect(plan.nutrition.targets).toContain('not a crash diet');
    expect(plan.nutrition.targets).toContain(PLAN_DOCTOR);
    expect(plan.nutrition.targets).toContain('140 g protein');
    expect(joined(plan)).not.toMatch(/skip meals|rapid cut|eat less|crash week/i);
    const context = healthPlanModelContext(input({
      salt: 'carry',
      goal: 'lose_weight',
      build: 'carrying_extra',
      kcalTarget: 2100,
      proteinTarget: 140,
      heightCm: 170,
      goalAge: 40,
      goalSex: 'male',
      health: [{ kind: 'weight_kg', value: 90, recordedOn: '2026-10-14' }],
    }), plan);
    expect(context.weightRange).toContain('0.5 to 1 kg');
    expect(context.weightRange).toContain('Check with a doctor');
    expect(context.fitnessSnapshot).toContain('Do not add a mileage plan');
    expect(context.fitnessSnapshot).not.toMatch(/progressive distance|crash week/);
    expect(HEALTH_PLAN_PROMPT).toContain('carrying extra weight');
    expect(HEALTH_PLAN_PROMPT).toContain('do not write a crash diet');
  });

  it('lifts an aggressive target up to the safety floor', () => {
    const plan = draftHealthPlan(input({
      salt: 'floor',
      goal: 'maintain',
      kcalTarget: 900,
    }));
    expect(plan.nutrition.targets).toContain('1,748');
    expect(plan.nutrition.targets).toContain(PLAN_DOCTOR);
    expect(joined(plan)).not.toContain('900');
  });

  it('keeps an injured week easy and names the doctor', () => {
    const plan = draftHealthPlan(input({
      salt: 'knee',
      limits: 'Sore knee after surgery',
    }));
    const week = plan.fitness.sessions.map((item) => item.text).join(' ');
    expect(plan.fitness.intro).toContain(PLAN_DOCTOR);
    expect(week.toLowerCase()).not.toContain('push');
    expect(week).toMatch(/Rest/);
  });

  it('leaves a finished action off the next plan', () => {
    const first = draftHealthPlan(input({ salt: 'done-week' }));
    const finished = first.nutrition.habits[0]?.text ?? '';
    const next = draftHealthPlan(input({ salt: 'done-week', doneTexts: [finished] }));
    expect(finished.length).toBeGreaterThan(0);
    expect(next.nutrition.habits.map((item) => item.text)).not.toContain(finished);
    const focusText = next.focus.map((item) => item.text).join(' ');
    expect(focusText).not.toMatch(/moves on|you marked|one focus is enough|Alex,/i);
    expect(focusText).not.toMatch(/…|\.{3}/);
    expect(next.focus.every((item) => item.text.length > 0 && item.text.length <= 160)).toBe(true);
    const ticked = togglePlanAction(first, first.focus[0]?.id ?? '');
    expect(ticked.updatedAt).toBe(first.updatedAt);
    expect(donePlanTexts(ticked)).toContain(first.focus[0]?.text);
  });

  it('leads with the crisis notice and rest when a reason names self-harm', () => {
    const plan = draftHealthPlan(input({ reasons: ['I want to die'] }));
    expect(plan.wellbeing.habits.map((item) => item.text).join(' ')).toContain('116 123');
    expect(plan.fitness.sessions.map((item) => item.text).join(' ')).toContain('Rest is the plan.');
  });

  it('keeps the withdrawal notice and does not ask for a hard week', () => {
    const plan = draftHealthPlan(input({
      reasons: ['I drink a bottle every day and I will stop suddenly tonight'],
    }));
    const text = joined(plan);
    expect(text).toContain('do not stop suddenly');
    expect(plan.fitness.sessions[0]?.text).toMatch(/Rest/);
  });

  it('writes training load, recovery, and fuelling for the three training goals', () => {
    const runner = draftHealthPlan(input({
      salt: 'runner',
      stage: 'stopped',
      sobrietyStartedAt: '2026-06-01',
      goal: 'elite_runner',
      health: [
        { kind: 'weight_kg', value: 70, recordedOn: '2026-10-14' },
        { kind: 'workout_minutes', value: 180, recordedOn: '2026-10-15' },
      ],
    }));
    const runnerText = joined(runner);
    expect(runnerText).toMatch(/carbohydrate|fuel/i);
    expect(runnerText).toMatch(/sparkling water|soft drink|alcohol-free/i);
    expect(runnerText).toContain('workout minutes');
    expect(runnerText).not.toMatch(/have the first drink/i);

    const builder = draftHealthPlan(input({ salt: 'builder', goal: 'body_builder', goalPhase: 'cut' }));
    const builderText = joined(builder);
    expect(builderText).toMatch(/lifting|lean mass/i);
    expect(builderText).toContain('not a skipped meal');
    expect(builderText).toContain('Cut phase');

    const heavy = draftHealthPlan(input({ salt: 'heavy', goal: 'elite_heavy_boxer' }));
    const heavyText = joined(heavy);
    expect(heavyText).toMatch(/size and power/i);
    expect(heavyText).toMatch(/protein/i);
    expect(heavyText.toLowerCase()).not.toMatch(/sauna to|skip water|sweat out/);

    const boxer = draftHealthPlan(input({ salt: 'boxer', goal: 'elite_middle_boxer', weightClassKg: 75 }));
    const boxerText = joined(boxer);
    expect(boxerText).toMatch(/middleweight/i);
    expect(boxerText).toMatch(/coach/);
    expect(boxerText).toMatch(/doctor/);
    expect(boxerText.toLowerCase()).not.toMatch(/sauna to|skip water|sweat out/);
  });

  it('drops a rapid-cut suggestion and keeps a refusal', () => {
    const base = draftHealthPlan(input({ salt: 'cut-guard', goal: 'elite_middle_boxer' }));
    const guarded = guardHealthPlan({
      ...base,
      fitness: {
        ...base.fitness,
        sessions: [
          { id: 'session-x', text: 'Spend an hour in a sauna to make weight.', done: false },
          ...base.fitness.sessions,
        ],
      },
    }, input({ salt: 'cut-guard', goal: 'elite_middle_boxer' }));
    expect(joined(guarded).toLowerCase()).not.toContain('sauna to');
    expect(joined(guarded)).toMatch(/coach/);
  });

  it('does not invent a drink or a crisp swap for a sober user', () => {
    const sober = input({
      salt: 'sober-plain',
      stage: 'stopped',
      sobrietyStartedAt: '2026-06-01',
      goal: null,
      interestLabels: ['Hiking'],
      limits: 'Shift work',
      weeklyUnits: 28,
      foodLogs: [mealLog('Porridge', 'Porridge and a banana')],
      checkIns: [{ mood: 6, craving: 2, sleepHours: 7, note: 'Quiet evening', createdAt: '2026-10-14T21:00:00.000Z' }],
    });
    expect(mentionsUnsupportedSwap('Replace any evening drink with sparkling water, fresh lime and a dash of bitters.', sober)).toBe(true);
    expect(mentionsUnsupportedSwap('Plan a short hike for the evening that used to be a drinking night.', sober)).toBe(true);
    expect(mentionsUnsupportedSwap('Swap crisps for a small handful of almonds and berries.', sober)).toBe(true);
    expect(mentionsUnsupportedSwap(SOBER_SWAP, sober)).toBe(false);
    const plan = draftHealthPlan(sober);
    const swaps = plan.nutrition.swaps.map((item) => item.text).join(' ');
    expect(swaps).not.toMatch(/crisp|snack|drinking night|evening drink|bitters|used to pour|pub|replace any/i);
    expect(plan.nutrition.swaps.map((item) => item.text)).toEqual([SOBER_SWAP]);
    const guarded = guardHealthPlan({
      ...plan,
      nutrition: {
        ...plan.nutrition,
        swaps: [
          { id: 's1', text: 'Replace any evening drink with sparkling water, fresh lime and a dash of bitters.', done: false },
          { id: 's2', text: 'Plan a short hike for the evening that used to be a drinking night.', done: false },
          { id: 's3', text: 'Swap crisps for a small handful of almonds and berries.', done: false },
        ],
      },
    }, sober);
    expect(guarded.nutrition.swaps.map((item) => item.text).join(' ')).not.toMatch(/crisp|drinking night|evening drink|bitters/i);
    expect(guarded.nutrition.swaps.some((item) => item.text === SOBER_SWAP)).toBe(true);
    const context = healthPlanModelContext(sober, plan);
    expect(context.profile.stopped).toBe(true);
    expect(context.profile.drinks).toBe(false);
    expect(context.profile.goal).toBeNull();
    expect(context.profile.sobrietyStartedAt).toBe('2026-06-01');
    expect(context.profile.dietNotes).toBe('Shift work');
    expect(context.loggedFood.join(' ')).toMatch(/Porridge/);
    expect(context.loggedFood.join(' ')).not.toMatch(/crisp/i);
    expect(context.loggedDrink).toEqual([]);
    expect(context.checkIns[0]?.note).toBe('Quiet evening');
    expect(HEALTH_PLAN_PROMPT).toMatch(/only allowed basis/);
    expect(HEALTH_PLAN_PROMPT).toMatch(/Log a few more meals/);
    expect(HEALTH_PLAN_PROMPT).not.toMatch(/alcohol-replacement/);
    const named = input({ stage: 'exploring', sobrietyStartedAt: null, limits: "I don't drink", foodLogs: [] });
    expect(draftHealthPlan(named).nutrition.swaps.map((item) => item.text)).toEqual([SOBER_SWAP]);
    const crisps = input({
      stage: 'stopped',
      sobrietyStartedAt: '2026-06-01',
      foodLogs: [mealLog('Crisps', 'Crisps after a short night')],
    });
    expect(mentionsUnsupportedSwap('Swap crisps for a small handful of almonds and berries.', crisps)).toBe(false);
    expect(draftHealthPlan(crisps).nutrition.swaps.map((item) => item.text).join(' ')).toMatch(/crisps/i);
    const cutting = draftHealthPlan(input({ stage: 'cutting_down', sobrietyStartedAt: null, foodLogs: [] }));
    expect(cutting.nutrition.swaps.map((item) => item.text).join(' ')).toMatch(/drink/i);
    expect(cutting.nutrition.swaps.map((item) => item.text).join(' ')).not.toMatch(/crisp|drinking night|bitters/i);
    const blank = draftHealthPlan(input({ stage: 'unknown', sobrietyStartedAt: null, foodLogs: [], limits: '', reasons: [], weeklyUnits: 0 }));
    expect(blank.nutrition.swaps.map((item) => item.text)).toEqual([SWAP_LOG_MORE]);
  });

  it('does not give drink swaps to an exploring user with no drink evidence', () => {
    const fresh = input({
      salt: 'new-exploring',
      stage: 'exploring',
      sobrietyStartedAt: null,
      weeklyUnits: 0,
      foodLogs: [],
      checkIns: [],
      reasons: [],
      limits: '',
      visionStatement: '',
    });
    const plan = draftHealthPlan(fresh);
    expect(plan.nutrition.swaps.map((item) => item.text)).toEqual([SWAP_LOG_MORE]);
    expect(mentionsUnsupportedSwap('Have the first drink later, and put food on the table before it.', fresh)).toBe(true);
    expect(mentionsUnsupportedSwap('Alternate a drink with water, and stop at the number you chose.', fresh)).toBe(true);
    const guarded = guardHealthPlan({
      ...plan,
      nutrition: {
        ...plan.nutrition,
        swaps: [
          { id: 's1', text: 'Have the first drink later, and put food on the table before it.', done: false },
          { id: 's2', text: 'Alternate a drink with water, and stop at the number you chose.', done: false },
        ],
      },
    }, fresh);
    expect(guarded.nutrition.swaps.map((item) => item.text)).toEqual([SWAP_LOG_MORE]);
    expect(healthPlanModelContext(fresh, plan).profile.drinks).toBe(false);
    expect(HEALTH_PLAN_PROMPT).toMatch(/Exploring on its own is not drinking/);
    const units = draftHealthPlan(input({ stage: 'exploring', weeklyUnits: 8, foodLogs: [], sobrietyStartedAt: null, limits: '', reasons: [] }));
    expect(units.nutrition.swaps.map((item) => item.text).join(' ')).toMatch(/first drink|Alternate a drink/i);
    const beer = draftHealthPlan(input({
      stage: 'exploring',
      weeklyUnits: 0,
      reasons: ['A beer after work'],
      foodLogs: [],
      sobrietyStartedAt: null,
    }));
    expect(beer.nutrition.swaps.map((item) => item.text).join(' ')).toMatch(/beer/i);
    const stopping = draftHealthPlan(input({ stage: 'trying_to_stop', sobrietyStartedAt: null, foodLogs: [], weeklyUnits: 0, limits: '', reasons: [] }));
    expect(stopping.nutrition.swaps.map((item) => item.text).join(' ')).toMatch(/drink/i);
  });

  it('drops a tip that sends logging to another app', () => {
    expect(mentionsOtherTracker('Track intake in the same app you use for steps so patterns show up fast.')).toBe(true);
    expect(mentionsOtherTracker('Log breakfast in MyFitnessPal.')).toBe(true);
    expect(mentionsOtherTracker('Use Nutracheck for the evening meal.')).toBe(true);
    expect(mentionsOtherTracker('A tracking app will show the pattern.')).toBe(true);
    expect(mentionsOtherTracker('Try another app for steps.')).toBe(true);
    expect(mentionsOtherTracker('Log meals on Nutrition. Steps and weight belong on Stats, and mood on Check-in.')).toBe(false);
    const base = draftHealthPlan(input({ salt: 'apps', goal: null }));
    const guarded = guardHealthPlan({
      ...base,
      nutrition: {
        ...base.nutrition,
        habits: [
          { id: 'habit-x', text: 'Track intake in the same app you use for steps so patterns show up fast.', done: false },
          { id: 'habit-y', text: 'Log breakfast in MyFitnessPal and steps on a Fitbit.', done: false },
          { id: 'habit-z', text: 'A tracking app will show the pattern.', done: false },
        ],
      },
    }, input({ salt: 'apps', goal: null }));
    const text = joined(guarded);
    expect(text).not.toMatch(/same app|another app|tracking app|myfitnesspal|nutracheck|fitbit/i);
    expect(text).toMatch(/Nutrition/);
    expect(text).toMatch(/Stats/);
    expect(text).toMatch(/Check-in/);
    expect(HEALTH_PLAN_PROMPT).toMatch(/another app/);
    expect(HEALTH_PLAN_PROMPT).toMatch(/MyFitnessPal/);
    expect(HEALTH_PLAN_PROMPT).toMatch(/Nutrition/);
    expect(HEALTH_PLAN_PROMPT).toMatch(/Check-in/);
  });

  it('drops a diagnosis the model tried to add', () => {
    const base = draftHealthPlan(input({ salt: 'guard' }));
    const guarded = guardHealthPlan({
      ...base,
      nutrition: {
        ...base.nutrition,
        habits: [
          { id: 'habit-x', text: 'You have depression and should rest.', done: false },
          ...base.nutrition.habits,
        ],
      },
    }, input({ salt: 'guard' }));
    expect(joined(guarded).toLowerCase()).not.toContain('you have depression');
    expect(guarded.disclaimer).toContain('not a diagnosis');
  });

  it('keeps a daily 30 minute routine and does not invent rest days', () => {
    const person = input({
      salt: 'daily-gym',
      goal: 'lose_fat_build_muscle',
      health: [
        { kind: 'weight_kg', value: 80, recordedOn: '2026-10-14' },
        ...dailyWorkouts(30),
      ],
    });
    const baseline = trainingBaseline(person);
    expect(baseline?.sessionsPerWeek).toBe(7);
    expect(baseline?.typicalMinutes).toBe(30);
    expect(baseline?.trainDays).toEqual(WEEKDAYS);
    expect(baseline?.restDays).toEqual([]);
    expect(baseline?.summary).toBe('You train about 30 min on most days.');
    const plan = draftHealthPlan(person);
    expect(plan.fitness.intro).toMatch(/You train about 30 min on most days/);
    expect(plan.fitness.intro).toMatch(/resistance/);
    expect(plan.fitness.intro).toMatch(/protein/);
    expect(plan.fitness.intro).toMatch(/walking/);
    expect(plan.fitness.intro).toContain(PLAN_DOCTOR);
    expect(plan.fitness.intro.length).toBeLessThanOrEqual(220);
    const texts = plan.fitness.sessions.map((item) => item.text);
    expect(texts).toHaveLength(7);
    for (const day of WEEKDAYS) {
      expect(texts.filter((text) => text.startsWith(`${day} ·`))).toHaveLength(1);
    }
    expect(texts.join(' ')).not.toMatch(/\bRest\b|full rest|no structured|Walk for 30 minutes/i);
    expect(texts[0]).toMatch(/Monday · Keep this session, about 30 min/);
    expect(texts.join(' ')).toMatch(/Add a little weight or one set/);
    const context = healthPlanModelContext(person, plan);
    expect(context.training?.sessionsPerWeek).toBe(7);
    expect(context.training?.trainDays).toContain('Tuesday');
    expect(HEALTH_PLAN_PROMPT).toMatch(/Never prescribe fewer sessions/);
    expect(HEALTH_PLAN_PROMPT).toMatch(/You train about 30 min on most days/);
    expect(HEALTH_PLAN_PROMPT).not.toMatch(/realistic week with rest days/);
    expect(trainingBaseline(input({
      health: [{ kind: 'workout_minutes', value: 180, recordedOn: '2026-10-15' }],
    }))).toBeNull();
    expect(trainingBaseline(input({
      health: [
        { kind: 'workout_minutes', value: 40, recordedOn: '2026-10-15' },
        { kind: 'workout_minutes', value: 30, recordedOn: '2026-10-13' },
        { kind: 'workout_minutes', value: 20, recordedOn: '2026-10-10' },
        { kind: 'workout_minutes', value: 25, recordedOn: '2026-10-07' },
      ],
    }))).toBeNull();
  });

  it('rests only on the weekday the log already leaves free', () => {
    const person = input({
      salt: 'sunday-off',
      goal: 'lose_fat_build_muscle',
      health: dailyWorkouts(30, (day) => weekdayOf(day) === 'Sunday'),
    });
    const baseline = trainingBaseline(person);
    expect(baseline?.restDays).toEqual(['Sunday']);
    expect(baseline?.trainDays).not.toContain('Sunday');
    expect(baseline?.sessionsPerWeek).toBe(6);
    const texts = draftHealthPlan(person).fitness.sessions.map((item) => item.text);
    expect(texts.filter((text) => /\bRest\b/.test(text))).toEqual(['Sunday · Rest. You already leave this day free.']);
    expect(texts.join(' ')).not.toMatch(/Tuesday · Rest|Friday-Sunday|full rest|no structured/i);
    expect(texts.filter((text) => text.startsWith('Tuesday ·'))).toHaveLength(1);
  });

  it('follows a stated weekday 30 minute week plus a longer Saturday', () => {
    const schedule = {
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      typicalMinutes: 30,
      longerDay: 'Saturday',
      longerMinutes: 45,
      walkDay: 'Sunday',
      note: 'Weekday mornings.',
    };
    const thin = input({
      salt: 'stated-thin',
      goal: 'lose_fat_build_muscle',
      schedule,
      health: [{ kind: 'weight_kg', value: 80, recordedOn: '2026-10-14' }],
    });
    expect(trainingBaseline(thin)).toBeNull();
    expect(planBaseline(thin)?.source).toBe('stated');
    const plan = draftHealthPlan(thin);
    expect(plan.fitness.intro).toBe('You aim for 30 min on weekdays and a bit more on Saturday. Keep the resistance work and the protein. Check with your doctor before big changes.');
    expect(plan.fitness.intro).not.toMatch(/you have done/);
    expect(plan.fitness.intro).toContain(PLAN_DOCTOR);
    expect(plan.fitness.intro.length).toBeLessThanOrEqual(220);
    const texts = plan.fitness.sessions.map((item) => item.text);
    expect(texts).toHaveLength(7);
    expect(texts.join(' ')).not.toMatch(/Tuesday · Rest|full rest|no structured/i);
    expect(texts.find((text) => text.startsWith('Monday ·'))).toMatch(/about 30 min/);
    expect(texts.find((text) => text.startsWith('Monday ·'))).toMatch(/Add a little weight or one set/);
    expect(texts.find((text) => text.startsWith('Saturday ·'))).toMatch(/about 45 min/);
    expect(texts.find((text) => text.startsWith('Sunday ·'))).toBe('Sunday · A walk. Keep it easy.');
    expect(texts.join(' ')).not.toMatch(/\bRest\b/);
    const context = healthPlanModelContext(thin, plan);
    expect(context.training?.trainDays).toContain('Tuesday');
    expect(context.training?.restDays).toEqual([]);
    expect(context.training?.walkDays).toEqual(['Sunday']);
    expect(context.training?.dayMinutes?.Saturday).toBe(45);
    expect(context.training?.dayMinutes?.Monday).toBe(30);
    expect(context.training?.note).toBe('Weekday mornings.');
    expect(HEALTH_PLAN_PROMPT).toMatch(/You aim for 30 min on weekdays and a bit more on Saturday/);
    expect(trainingScheduleSummary(schedule)).toBe('30 min on weekdays and a bit more on Saturday. Walk on Sunday.');
    expect(trainingScheduleFromRow({
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: false,
      typical_minutes: 30,
      longer_day: 'Saturday',
      longer_minutes: 45,
      walk_day: 'Sunday',
      note: 'Weekday mornings.',
    })).toEqual(schedule);

    const loggedDays: { kind: string; value: number; recordedOn: string }[] = [];
    for (let offset = 0; offset < 28; offset += 1) {
      const recordedOn = isoShift('2026-10-15', -offset);
      const name = weekdayOf(recordedOn);
      if (name === 'Monday' || name === 'Tuesday' || name === 'Wednesday' || name === 'Thursday') {
        loggedDays.push({ kind: 'workout_minutes', value: 30, recordedOn });
      }
    }
    const logged = input({
      salt: 'stated-compare',
      goal: 'lose_fat_build_muscle',
      schedule,
      health: loggedDays,
    });
    expect(trainingBaseline(logged)?.trainDays).not.toContain('Saturday');
    const compared = draftHealthPlan(logged);
    expect(compared.fitness.intro).toMatch(/You aim for 30 min on weekdays and a bit more on Saturday; you have done 4 of 6 this week/);
    expect(compared.fitness.intro).toContain(PLAN_DOCTOR);
    expect(compared.fitness.intro.length).toBeLessThanOrEqual(220);
    const comparedTexts = compared.fitness.sessions.map((item) => item.text);
    expect(comparedTexts.find((text) => text.startsWith('Tuesday ·'))).toMatch(/about 30 min/);
    expect(comparedTexts.find((text) => text.startsWith('Saturday ·'))).toMatch(/about 45 min/);
    expect(comparedTexts.find((text) => text.startsWith('Sunday ·'))).toMatch(/A walk/);
    expect(comparedTexts.join(' ')).not.toMatch(/Tuesday · Rest/);

    const guarded = guardHealthPlan({
      ...compared,
      fitness: {
        intro: 'Tuesday is a rest day and Sunday is a gym session.',
        sessions: [
          { id: 'a', text: 'Tuesday · Rest.', done: false },
          { id: 'b', text: 'Saturday · Keep this session, about 30 min.', done: false },
          { id: 'c', text: 'Sunday · Gym for 40 minutes.', done: false },
        ],
      },
    }, logged);
    expect(guarded.fitness.intro).toMatch(/You aim for 30 min on weekdays and a bit more on Saturday; you have done 4 of 6 this week/);
    expect(guarded.fitness.intro).toContain(PLAN_DOCTOR);
    const guardedTexts = guarded.fitness.sessions.map((item) => item.text);
    expect(guardedTexts.find((text) => text.startsWith('Tuesday ·'))).toMatch(/about 30 min/);
    expect(guardedTexts.find((text) => text.startsWith('Saturday ·'))).toMatch(/about 45 min/);
    expect(guardedTexts.find((text) => text.startsWith('Sunday ·'))).toMatch(/A walk/);
    const stated = planBaseline(logged);
    expect(mentionsRegressiveSession('Saturday · Keep this session, about 30 min.', stated)).toBe(true);
    expect(mentionsRegressiveSession('Saturday · Keep this session, about 45 min. Add a little weight or one set.', stated)).toBe(false);

    const hurt = draftHealthPlan(input({
      salt: 'stated-hurt',
      goal: 'lose_fat_build_muscle',
      schedule,
      limits: 'Sore knee after surgery',
      health: dailyWorkouts(30),
    }));
    expect(hurt.fitness.intro).toContain(PLAN_DOCTOR);
    expect(hurt.fitness.sessions.map((item) => item.text).join(' ')).toMatch(/\bRest\b/);
    expect(hurt.fitness.sessions.map((item) => item.text).join(' ')).not.toMatch(/Add a little weight/);

    const page = readFileSync('src/app/(main)/profile.tsx', 'utf8');
    expect(page).toContain('<TrainingScheduleCard');
    const card = readFileSync('src/ui/TrainingSchedule.tsx', 'utf8');
    expect(card).toContain('My training schedule');
    expect(card).toContain('aria-expanded={open}');
    expect(card).toContain('accessibilityState={{ expanded: open }}');
    expect(card).toContain('Save schedule');
    expect(card).toContain('Walk day');
    const sql = readFileSync('supabase/migrations/20261015240000_training_schedules.sql', 'utf8');
    expect(sql).toContain('create table public.training_schedules');
    expect(sql).toContain('training_schedules_own');
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql).toContain('grant update (');
    expect(sql).toContain("'training_schedules'");
    expect(sql.toLowerCase()).not.toMatch(/drop table|delete from/i);
    expect(readFileSync('supabase/functions/health-plan/index.ts', 'utf8')).toContain("from('training_schedules')");
  });

  it('drops a regressive model week instead of appending the stock walk rows', () => {
    const person = input({
      salt: 'regress',
      goal: 'lose_fat_build_muscle',
      health: [
        { kind: 'weight_kg', value: 80, recordedOn: '2026-10-14' },
        ...dailyWorkouts(30),
      ],
    });
    const baseline = trainingBaseline(person);
    expect(mentionsRegressiveSession('Tuesday · Rest.', baseline)).toBe(true);
    expect(mentionsRegressiveSession('Tuesday full rest', baseline)).toBe(true);
    expect(mentionsRegressiveSession('Friday-Sunday rest, no structured workouts', baseline)).toBe(true);
    expect(mentionsRegressiveSession('Monday · Walk for 20 minutes', baseline)).toBe(true);
    expect(mentionsRegressiveSession('Monday · Keep this session, about 30 min. Add a little weight or one set.', baseline)).toBe(false);
    const local = draftHealthPlan(person);
    const guarded = guardHealthPlan({
      ...local,
      fitness: {
        intro: 'Three gym days, then Friday-Sunday rest.',
        sessions: [
          { id: 'a', text: 'Monday · Gym for 30 minutes.', done: false },
          { id: 'b', text: 'Wednesday · Gym for 30 minutes.', done: false },
          { id: 'c', text: 'Thursday · Gym for 30 minutes.', done: false },
          { id: 'd', text: 'Tuesday full rest', done: false },
          { id: 'e', text: 'Friday-Sunday rest, no structured workouts', done: false },
          { id: 'f', text: 'Monday · Walk for 30 minutes', done: false },
          { id: 'g', text: 'Tuesday · Rest.', done: false },
        ],
      },
    }, person);
    const texts = guarded.fitness.sessions.map((item) => item.text);
    expect(guarded.fitness.intro).toMatch(/You train about 30 min on most days/);
    expect(texts).toHaveLength(7);
    for (const day of WEEKDAYS) {
      expect(texts.filter((text) => text.startsWith(`${day} ·`))).toHaveLength(1);
    }
    expect(texts.join(' ')).not.toMatch(/Walk for 30 minutes|Tuesday · Rest|full rest|no structured/i);
    expect(texts.join(' ')).toMatch(/about 30 min/);
  });

  it('eases a daily routine off when the week reports an injury', () => {
    const plan = draftHealthPlan(input({
      salt: 'knee-daily',
      goal: 'lose_fat_build_muscle',
      limits: 'Sore knee after surgery',
      health: dailyWorkouts(30),
    }));
    expect(plan.fitness.intro).toContain(PLAN_DOCTOR);
    expect(plan.fitness.intro).not.toMatch(/Add a little weight/);
    const week = plan.fitness.sessions.map((item) => item.text).join(' ');
    expect(week).toMatch(/Rest/);
    expect(week.toLowerCase()).not.toContain('push');
    const ill = draftHealthPlan(input({
      salt: 'ill-daily',
      goal: 'lose_fat_build_muscle',
      checkIns: [{ mood: 4, craving: 1, sleepHours: 5, note: 'Poor recovery this week', createdAt: '2026-10-14T21:00:00.000Z' }],
      health: dailyWorkouts(30),
    }));
    expect(ill.fitness.sessions.map((item) => item.text).join(' ')).toMatch(/Rest/);
    expect(ill.fitness.intro).toContain(PLAN_DOCTOR);
  });

  it('keeps a runner, a boxer, and a body builder on their own work when the log is daily', () => {
    const runner = draftHealthPlan(input({
      salt: 'daily-run',
      goal: 'elite_runner',
      health: dailyWorkouts(40),
    }));
    const runnerText = joined(runner);
    expect(runner.fitness.intro).toMatch(/You train about 40 min on most days/);
    expect(runnerText).toMatch(/run/i);
    expect(runnerText).toMatch(/carbohydrate/);
    expect(runnerText).not.toMatch(/fewer sets|Walk for 30 minutes|Tuesday · Rest/i);
    const boxer = draftHealthPlan(input({
      salt: 'daily-box',
      goal: 'elite_middle_boxer',
      weightClassKg: 75,
      health: dailyWorkouts(30),
    }));
    expect(joined(boxer)).toMatch(/boxing/);
    expect(joined(boxer)).toMatch(/protein/);
    expect(joined(boxer)).toContain(PLAN_DOCTOR);
    const builder = draftHealthPlan(input({
      salt: 'daily-build',
      goal: 'body_builder',
      health: dailyWorkouts(45),
    }));
    expect(joined(builder)).toMatch(/lifting/);
    expect(joined(builder)).toMatch(/protein/);
    expect(joined(builder)).not.toMatch(/fewer sets/);
  });

  it('drops a carry-over sentence from a focus item', () => {
    const leaked = 'Ben, You marked "Stay consistent with the six resistance sessions to build muscle while losing f..." done, so this week moves on. Include a protein food at break...';
    expect(standaloneFocus(leaked, 'Ben')).toBeNull();
    expect(standaloneFocus('Ben, Include a protein food at breakfast.', 'Ben')).toBe('Include a protein food at breakfast.');
    expect(standaloneFocus('Walk 30 minutes on Monday.')).toBe('Walk 30 minutes on Monday.');
    const base = draftHealthPlan(input({ salt: 'carry', displayName: 'Ben Hart' }));
    const guarded = guardHealthPlan({
      ...base,
      focus: [
        { id: 'focus-1', text: leaked, done: false },
        { id: 'focus-2', text: 'Keep lunch at the same time.', done: false },
      ],
    }, input({ salt: 'carry', displayName: 'Ben Hart' }));
    const text = guarded.focus.map((item) => item.text).join(' ');
    expect(text).not.toMatch(/Ben,|you marked|moves on|…|\.{3}/i);
    expect(text).toContain('Keep lunch at the same time.');
    const stored = healthPlanFromStored({
      ...base,
      focus: [{ id: 'focus-9', text: leaked, done: true }, ...base.focus],
      updatedAt: base.updatedAt,
    });
    expect(stored?.focus.map((item) => item.text).join(' ')).not.toMatch(/you marked|moves on|…/);
    expect(HEALTH_PLAN_PROMPT).toMatch(/standalone actions/);
    expect(HEALTH_PLAN_PROMPT).toMatch(/Do not use an ellipsis/);
    expect(HEALTH_PLAN_PROMPT).not.toMatch(/Move on to the next step/);
    const bodySql = readFileSync('supabase/migrations/20261016130000_share_body_figures.sql', 'utf8');
    expect(bodySql).toContain("settings->'shareBodyFigures'");
    expect(bodySql).toContain('share_prog or share_body');
    expect(bodySql).toContain('viewer_in_community()');
    expect(bodySql.toLowerCase()).not.toContain('grant select on public.body_composition');
    expect(bodySql.toLowerCase()).not.toContain('grant select on public.health_samples');
    expect(bodySql).toContain('shared_health_plan');
    expect(bodySql).toContain('you marked|this week moves on|one focus is enough');
  });

  it('keeps ticks when a stored row is read back', () => {
    const plan = draftHealthPlan(input({ salt: 'stored' }));
    const ticked = togglePlanAction(plan, plan.focus[0]?.id ?? '');
    const stored = healthPlanFromStored({ ...ticked, updated_at: ticked.updatedAt, updatedAt: undefined });
    expect(stored?.focus[0]?.done).toBe(true);
    expect(stored?.updatedAt).toBe(plan.updatedAt);
  });
});

describe('health plan wiring', () => {
  it('stores the plan for the owner only and includes it in the export', () => {
    const sql = readFileSync('supabase/migrations/20261015140000_health_plans.sql', 'utf8');
    expect(sql).toContain('create table public.health_plans');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql.toLowerCase()).toContain('revoke all on table public.health_plans from public, anon, authenticated');
    expect(sql).toContain('health_plans_own');
    expect(sql.toLowerCase()).toContain('grant select');
    expect(sql).toContain("'health_plans'");
  });

  it('asks grok only after coach consent', () => {
    const fn = readFileSync('supabase/functions/health-plan/index.ts', 'utf8');
    expect(fn).toContain('consent_ai');
    expect(fn).toContain('XAI_API_KEY');
    expect(fn).toContain('buildChatCompletionBody');
    expect(fn).toContain('THUMOS_CHAT');
    expect(fn).toContain('HEALTH_PLAN_PROMPT');
    expect(fn).toContain('healthPlanModelContext');
    expect(fn).toContain('weekly_units');
    expect(fn).toContain('isMealSlot');
    expect(fn).toContain('.limit(800)');
    expect(readFileSync('supabase/functions/_shared/healthPlan.ts', 'utf8')).toContain('not a diagnosis');
    expect(readFileSync('supabase/config.toml', 'utf8')).toContain('[functions.health-plan]');
  });

  it('places the page from Stats and You, and not on the tab bar', () => {
    const page = readFileSync('src/app/(main)/health-plan.tsx', 'utf8');
    expect(page).toContain("This week's focus");
    expect(page).toContain('Refresh plan');
    expect(page).toContain('Last updated');
    expect(page).toContain('buildStatsOverview');
    expect(page).toContain('StatTile');
    expect(page).toContain('Share on profile');
    expect(page).toContain('Share weight and body figures');
    expect(page).toContain('Other members see the goal, this week\'s focus, and how many are ticked.');
    expect(page).toContain('Other members see the weight average, and body fat, waist, or lean mass. Height stays private.');
    expect(page).toContain('Community is off. Other members can see what you share here only when Community is on.');
    expect(page.indexOf('Share on profile')).toBeLessThan(page.indexOf("This week's focus"));
    expect(page).not.toContain('pointerEvents');
    expect(page).not.toContain('accessibilityElementsHidden');
    expect(page).toContain('applyWeightAndBodyShare');
    expect(page).not.toContain('Share Whole Section');
    expect(page).not.toContain('This stays on your account.');
    expect(TAB_SECTIONS.map((section) => section.label)).not.toContain('Health Plan');
    expect(TAB_SECTIONS).toHaveLength(6);
    expect(readFileSync('src/app/(main)/stats.tsx', 'utf8')).toContain("'/health-plan'");
    expect(readFileSync('src/app/(main)/profile.tsx', 'utf8')).toContain("'/health-plan'");
  });

  it('shows the written plan when the save fails, and keeps the other failure copy', () => {
    const page = readFileSync('src/app/(main)/health-plan.tsx', 'utf8');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const refresh = repo.slice(repo.indexOf('async refreshHealthPlan'), repo.indexOf('async sharedNutrition'));
    const saved = refresh.slice(refresh.lastIndexOf(".from('health_plans')"));
    expect(page).toContain('PLAN_NOT_SAVED');
    expect(page).toContain("setError(PLAN_NOT_SAVED)");
    expect(page).toContain("shownError(err, 'Could not write a plan.')");
    expect(page.indexOf('PLAN_NOT_SAVED')).toBeLessThan(page.indexOf("shownError(err, 'Could not write a plan.')"));
    expect(saved.indexOf('this.emit')).toBeGreaterThan(0);
    expect(saved.indexOf('this.emit')).toBeLessThan(saved.indexOf('if (error)'));
    expect(saved.indexOf('logClientError')).toBeGreaterThan(saved.indexOf('if (error)'));
    expect(saved.indexOf('PLAN_NOT_SAVED')).toBeGreaterThan(saved.indexOf('logClientError'));
    expect(refresh.indexOf('PLAN_UNREACHABLE')).toBeGreaterThan(0);
    expect(refresh.indexOf('PLAN_UNREACHABLE')).toBeLessThan(refresh.lastIndexOf(".from('health_plans')"));
  });

  it('shares the headline, focus, and ticks, and leaves the figures behind', () => {
    const plan: HealthPlan = {
      focus: [
        { id: 'a', text: 'Walk 30 minutes on Monday.', done: true },
        { id: 'b', text: 'Recent days averaged 1,748 kcal and weight is 80 kg.', done: false },
        { id: 'c', text: 'Body fat 15% and waist 84 cm stay off this line.', done: false },
        { id: 'd', text: '80 kg', done: false },
      ],
      nutrition: {
        targets: '2,200 kcal · BMI 25.2',
        habits: [{ id: 'h', text: 'Secret habit with 90 g protein', done: false }],
        swaps: [{ id: 's', text: 'Sparkling water', done: false }],
      },
      fitness: { intro: '8,689 steps', sessions: [{ id: 'gym', text: 'Short gym session', done: false }] },
      wellbeing: { habits: [{ id: 'w', text: 'Sleep 7.4 hours', done: true }] },
      limits: 'sore knee',
      disclaimer: PLAN_DISCLAIMER,
      updatedAt: '2026-10-15T09:00:00.000Z',
    };
    expect(presentSharedHealthPlan(plan, false, 'lose_weight')).toBeNull();
    expect(presentSharedHealthPlan(null, true, 'lose_weight')).toBeNull();
    const shared = presentSharedHealthPlan(plan, true, 'lose_weight');
    expect(shared).toEqual({
      headline: 'Lose Weight',
      focus: [
        { text: 'Walk 30 minutes on Monday.', done: true },
        { text: 'Recent days averaged and weight is.', done: false },
        { text: 'and stay off this line.', done: false },
      ],
      ticked: 1,
      total: 3,
    });
    expect(presentSharedHealthPlan(plan, true, null)?.headline).toBe('Health plan');
    const payload = JSON.stringify(shared);
    expect(payload).not.toMatch(/kcal|kg|steps|body fat|bmi|waist|hours/i);
    expect(payload).not.toContain('Secret habit');
    expect(payload).not.toContain('Sparkling water');
    expect(payload).not.toContain('Short gym');
    expect(payload).not.toContain('Sleep');
    expect(payload).toContain('30 minutes');

    const source: ShareSource = {
      now: new Date('2026-10-15T09:00:00.000Z'),
      today: '2026-10-15',
      displayName: 'Alex Hart',
      bio: '',
      town: null,
      stage: 'stopped',
      sobrietyStartedAt: null,
      weeklySpendGbp: null,
      weeklyUnits: null,
      interestLabels: [],
      reasons: [],
      checkIns: [],
      health: [],
      gratitude: [],
      vision: [],
      progressPhotos: [],
      pinnedQuoteId: null,
      nutrition: { logs: [], settings: { ...defaultNutritionSettings(), goal: 'lose_weight', shareGoal: false } },
      healthPlan: plan,
    };
    const hidden = projectPublicProfile(source, defaultProfileSharing());
    expect(hidden.healthPlan).toBeNull();
    expect(hidden.hiddenLabels).toContain('Health Plan');
    expect(hidden.goal).toBeNull();
    const shown = projectPublicProfile(source, { ...defaultProfileSharing(), healthPlan: true });
    expect(shown.sharedLabels).toContain('Health Plan');
    expect(shown.healthPlan?.headline).toBe('Lose Weight');
    expect(shown.goal).toBeNull();
    expect(sharedReportItems(shown).some((item) => item.label === 'Health plan' && item.summary.includes('1 of 3 ticked'))).toBe(true);

    const sql = readFileSync('supabase/migrations/20261015150000_health_plan_share.sql', 'utf8');
    expect(sql).toContain('shared_health_plan');
    expect(sql).toContain('viewer_in_community()');
    expect(sql).toContain("settings->>'healthPlan'");
    expect(sql).toContain('hp.focus');
    expect(sql.toLowerCase()).not.toContain('body_fat');
    expect(sql.toLowerCase()).not.toContain('weight_kg');
    expect(sql).not.toContain('nutrition.targets');
    expect(sql).not.toMatch(/function public\.public_profile/);
    expect(sql).toContain('revoke all on function public.shared_health_plan(uuid) from public, anon');
    expect(sql).toContain('grant execute on function public.shared_health_plan(uuid) to authenticated');
    const profile = readFileSync('src/ui/CommunityProfile.tsx', 'utf8');
    const planPage = readFileSync('src/app/(main)/health-plan.tsx', 'utf8');
    const tick = readFileSync('src/ui/PlanTick.tsx', 'utf8');
    expect(profile).toContain('sharedHealthPlan');
    expect(profile).toContain('<PlanTick');
    expect(profile).not.toContain('line-through');
    expect(profile).toContain('of ${plan.total} ticked');
    expect(planPage).toContain('<PlanTick');
    expect(planPage).not.toContain('line-through');
    expect(tick).toContain('accessibilityLabel="Done"');
    expect(tick).toContain('statsToneColors');
    expect(tick).toContain('borderRadius: SIZE / 2');
    expect(profile).toContain('Only a private message or a report.');
    expect(profile).toContain("reach('plan')");
    expect(profile).not.toContain('Report this plan');
  });
});
