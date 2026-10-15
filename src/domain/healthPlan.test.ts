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
  presentSharedHealthPlan,
  togglePlanAction,
  type HealthPlan,
  type PlanInput,
} from './healthPlan';
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
    expect(page).toContain('Share on profile');
    expect(page).toContain('PROFILE_HIDDEN_SHARE');
    expect(page).toContain("pointerEvents={communityOn ? 'auto' : 'none'}");
    expect(page).not.toContain('Share Whole Section');
    expect(page).not.toContain('This stays on your account.');
    expect(TAB_SECTIONS.map((section) => section.label)).not.toContain('Health Plan');
    expect(TAB_SECTIONS).toHaveLength(6);
    expect(readFileSync('src/app/(main)/stats.tsx', 'utf8')).toContain("'/health-plan'");
    expect(readFileSync('src/app/(main)/profile.tsx', 'utf8')).toContain("'/health-plan'");
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
    expect(profile).toContain('sharedHealthPlan');
    expect(profile).toContain('Only a private message or a report.');
    expect(profile).toContain("reach('plan')");
    expect(profile).not.toContain('Report this plan');
  });
});
