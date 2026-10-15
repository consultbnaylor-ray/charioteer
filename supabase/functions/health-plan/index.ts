import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';

import {
  HEALTH_PLAN_PROMPT,
  draftHealthPlan,
  guardHealthPlan,
  parseHealthPlanJson,
  type PlanInput,
} from '../_shared/healthPlan.ts';
import { json, preflight } from '../_shared/http.ts';
import { isBodyBuild, isNutritionGoal, isNutritionSex, type FoodItem, type FoodLog, type NutritionGoal } from '../_shared/nutrition.ts';
import { buildChatCompletionBody, THUMOS_CHAT } from '../_shared/thumos.ts';

type Body = { limits?: string };

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function completionText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const choices = (payload as { choices?: { message?: { content?: unknown } }[] }).choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !anon || !authHeader) return json({ ok: false, code: 'config' }, 500);

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ ok: false, code: 'unauthorised' }, 401);
  const userId = userData.user.id;

  const profileRes = await userClient.from('profiles').select('display_name, stage, sobriety_started_at, height_cm, vision_statement, consent_ai').eq('id', userId).single();
  if (profileRes.error || !profileRes.data) return json({ ok: false, code: 'profile', message: 'Finish setting up your account first.' }, 400);
  if (!profileRes.data.consent_ai) {
    return json({
      ok: false,
      code: 'consent',
      message: 'Writing a plan needs the coach consent, because your figures are sent to the model.',
    }, 403);
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const limits = textOf(body.limits).trim().slice(0, 280);

  const [settingsRes, logsRes, checkRes, healthRes, bodyRes, reasonsRes, visionRes, interestRes, savedRes] = await Promise.all([
    userClient.from('nutrition_settings').select('goal, goal_age, goal_sex, build, kcal_target, protein_target_g, hide_calories').eq('user_id', userId).maybeSingle(),
    userClient.from('food_logs').select('id, eaten_on, meal, items, estimated, created_at').eq('user_id', userId).order('eaten_on', { ascending: false }).limit(40),
    userClient.from('check_ins').select('mood, craving, sleep_hours, note, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(14),
    userClient.from('health_samples').select('kind, value, recorded_on').eq('user_id', userId).order('recorded_on', { ascending: false }).limit(80),
    userClient.from('body_composition').select('body_fat_pct, lean_mass_kg, waist_cm, recorded_on').eq('user_id', userId).order('recorded_on', { ascending: false }).limit(8),
    userClient.from('reasons').select('body').eq('user_id', userId).order('sort_order').limit(6),
    userClient.from('vision_board_items').select('caption').eq('user_id', userId).order('position').limit(6),
    userClient.from('profile_interests').select('interest_id, interests(label)').eq('user_id', userId),
    userClient.from('health_plans').select('focus, nutrition, fitness, wellbeing, limits').eq('user_id', userId).maybeSingle(),
  ]);

  const settings = (settingsRes.data ?? {}) as Record<string, unknown>;
  const goal = isNutritionGoal(textOf(settings.goal)) ? settings.goal as NutritionGoal : null;
  const logs: FoodLog[] = ((logsRes.data ?? []) as Record<string, unknown>[]).flatMap((row) => {
    const items = Array.isArray(row.items) ? row.items as FoodItem[] : [];
    const eatenOn = textOf(row.eaten_on);
    if (!eatenOn) return [];
    return [{
      id: textOf(row.id) || eatenOn,
      userId,
      eatenOn,
      eatenAt: null,
      meal: 'dinner',
      source: 'manual',
      note: '',
      items,
      estimated: Boolean(row.estimated),
      previewUrl: null,
      createdAt: textOf(row.created_at),
      portion: 1,
    }];
  });
  const saved = (savedRes.data ?? null) as { focus?: unknown; nutrition?: { habits?: unknown; swaps?: unknown }; fitness?: { sessions?: unknown }; wellbeing?: { habits?: unknown }; limits?: unknown } | null;
  const doneTexts = saved
    ? [saved.focus, saved.nutrition?.habits, saved.nutrition?.swaps, saved.fitness?.sessions, saved.wellbeing?.habits]
      .flatMap((list) => Array.isArray(list) ? list : [])
      .flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const row = item as { text?: unknown; done?: unknown };
        return row.done === true && typeof row.text === 'string' ? [row.text] : [];
      })
    : [];
  const interestLabels = ((interestRes.data ?? []) as { interests?: { label?: string } | { label?: string }[] | null }[]).flatMap((row) => {
    const joined = row.interests;
    if (Array.isArray(joined)) return joined.map((item) => textOf(item.label)).filter(Boolean);
    return textOf(joined?.label) ? [textOf(joined?.label)] : [];
  });
  const bodies = ((bodyRes.data ?? []) as Record<string, unknown>[]);
  const latestFat = bodies.find((row) => typeof row.body_fat_pct === 'number');
  const latestLean = bodies.find((row) => typeof row.lean_mass_kg === 'number');
  const latestWaist = bodies.find((row) => typeof row.waist_cm === 'number');
  const input: PlanInput = {
    now: new Date(),
    salt: new Date().toISOString(),
    displayName: textOf(profileRes.data.display_name).slice(0, 80),
    stage: textOf(profileRes.data.stage) || 'exploring',
    sobrietyStartedAt: textOf(profileRes.data.sobriety_started_at) || null,
    heightCm: typeof profileRes.data.height_cm === 'number' ? profileRes.data.height_cm : null,
    visionStatement: textOf(profileRes.data.vision_statement).slice(0, 240),
    visionCaptions: ((visionRes.data ?? []) as { caption?: string }[]).map((row) => textOf(row.caption)).filter(Boolean).slice(0, 4),
    interestLabels,
    reasons: ((reasonsRes.data ?? []) as { body?: string }[]).map((row) => textOf(row.body)).filter(Boolean).slice(0, 5),
    limits: limits || textOf(saved?.limits).slice(0, 280),
    goal,
    goalSex: isNutritionSex(textOf(settings.goal_sex)) ? textOf(settings.goal_sex) as PlanInput['goalSex'] : null,
    goalAge: typeof settings.goal_age === 'number' ? settings.goal_age : null,
    build: isBodyBuild(textOf(settings.build)) ? textOf(settings.build) as PlanInput['build'] : null,
    kcalTarget: typeof settings.kcal_target === 'number' ? settings.kcal_target : null,
    proteinTarget: typeof settings.protein_target_g === 'number' ? settings.protein_target_g : null,
    hideCalories: Boolean(settings.hide_calories),
    foodLogs: logs,
    checkIns: ((checkRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
      mood: Number(row.mood) || 0,
      craving: Number(row.craving) || 0,
      sleepHours: Number(row.sleep_hours) || 0,
      note: textOf(row.note).slice(0, 160),
      createdAt: textOf(row.created_at),
    })),
    health: ((healthRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
      kind: textOf(row.kind),
      value: Number(row.value) || 0,
      recordedOn: textOf(row.recorded_on),
    })),
    bodyFatPct: typeof latestFat?.body_fat_pct === 'number' ? latestFat.body_fat_pct : null,
    leanMassKg: typeof latestLean?.lean_mass_kg === 'number' ? latestLean.lean_mass_kg : null,
    waistCm: typeof latestWaist?.waist_cm === 'number' ? latestWaist.waist_cm : null,
    doneTexts,
  };

  const local = draftHealthPlan(input);
  if (input.limits && local.limits !== input.limits) local.limits = input.limits;
  const apiKey = Deno.env.get('XAI_API_KEY');
  if (!apiKey || local.wellbeing.habits.some((item) => item.text.includes('116 123') || item.text.includes('do not stop suddenly'))) {
    return json({ ok: true, plan: { ...local, limits: input.limits }, source: 'local' });
  }

  try {
    const response = await fetch(THUMOS_CHAT.completionsUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildChatCompletionBody({
        model: Deno.env.get('THUMOS_MODEL') || THUMOS_CHAT.model,
        system: HEALTH_PLAN_PROMPT,
        history: [],
        user: JSON.stringify({
          stage: input.stage,
          soberDays: input.sobrietyStartedAt,
          goal: input.goal,
          kcalTarget: input.kcalTarget,
          proteinTarget: input.proteinTarget,
          interests: input.interestLabels,
          reasons: input.reasons.map((item) => item.slice(0, 120)),
          vision: input.visionStatement.slice(0, 160),
          limits: input.limits,
          finished: input.doneTexts.slice(0, 8),
          body: local.nutrition.targets,
          activity: local.fitness.intro,
        }),
        stream: false,
      })),
    });
    if (!response.ok) return json({ ok: true, plan: { ...local, limits: input.limits }, source: 'local' });
    const parsed = parseHealthPlanJson(completionText(await response.json()));
    if (!parsed) return json({ ok: true, plan: { ...local, limits: input.limits }, source: 'local' });
    const plan = guardHealthPlan({ ...parsed, limits: input.limits, updatedAt: new Date().toISOString() }, input);
    return json({ ok: true, plan, source: 'model' });
  } catch {
    return json({ ok: true, plan: { ...local, limits: input.limits }, source: 'local' });
  }
});
