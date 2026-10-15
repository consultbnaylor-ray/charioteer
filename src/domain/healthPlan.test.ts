import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { TAB_SECTIONS } from './sections';
import {
  PLAN_DISCLAIMER,
  PLAN_DOCTOR,
  donePlanTexts,
  draftHealthPlan,
  guardHealthPlan,
  healthPlanFromStored,
  togglePlanAction,
  type PlanInput,
} from './healthPlan';

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
    expect(soberText).toMatch(/sparkling water|soft drink|hike/);
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
    expect(next.focus.map((item) => item.text).join(' ')).toContain('moves on');
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
    expect(page).not.toContain('Share');
    expect(TAB_SECTIONS.map((section) => section.label)).not.toContain('Health Plan');
    expect(TAB_SECTIONS).toHaveLength(6);
    expect(readFileSync('src/app/(main)/stats.tsx', 'utf8')).toContain("'/health-plan'");
    expect(readFileSync('src/app/(main)/profile.tsx', 'utf8')).toContain("'/health-plan'");
  });
});
