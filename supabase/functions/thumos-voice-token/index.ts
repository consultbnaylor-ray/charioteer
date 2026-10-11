import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { gratitudeFromRows } from '../_shared/gratitude.ts';
import { visionContextFrom } from '../_shared/visionBoard.ts';
import { json, preflight } from '../_shared/http.ts';
import {
  buildVoiceBriefing,
  GROK_VOICE,
  VOICE_COPY,
} from '../_shared/voice.ts';
import { buildHealthInsights, londonDay } from '../_shared/healthInsights.ts';
import {
  interestLabelsFromRows,
  THUMOS_CHAT,
  type CheckInSummary,
  type HealthTrend,
  type ThumosMode,
} from '../_shared/thumos.ts';

type Body = { mode?: ThumosMode };

function drinkFreeCount(dates: unknown, now: Date): number {
  if (!Array.isArray(dates)) return 0;
  const weekday = now.getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset));
  const start = monday.toISOString().slice(0, 10);
  const endDate = new Date(monday);
  endDate.setUTCDate(endDate.getUTCDate() + 7);
  const end = endDate.toISOString().slice(0, 10);
  return new Set(dates.map(String).filter((item) => item >= start && item < end)).size;
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method', message: VOICE_COPY.failed }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const authHeader = req.headers.get('Authorization');
  const apiKey = Deno.env.get('XAI_API_KEY');
  if (!url || !anon || !authHeader) return json({ ok: false, code: 'config', message: VOICE_COPY.token }, 500);

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return json({ ok: false, code: 'unauthorised', message: 'Sign in first.' }, 401);

  const body = (await req.json().catch(() => ({}))) as Body;
  const userId = data.user.id;
  const [profileRes, reasonsRes, checkRes, healthRes, historyRes, interestRes] = await Promise.all([
    userClient.from('profiles').select('*').eq('id', userId).single(),
    userClient.from('reasons').select('body, sort_order').eq('user_id', userId).order('sort_order'),
    userClient.from('check_ins').select('mood, sleep_hours, craving, note, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(THUMOS_CHAT.checkInLimit),
    userClient.from('health_samples').select('kind, value, unit, recorded_on').eq('user_id', userId).order('recorded_on', { ascending: false }).limit(1000),
    userClient.from('thumos_messages').select('role, content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(THUMOS_CHAT.historyLimit),
    userClient.from('profile_interests').select('interests(label)').eq('user_id', userId),
  ]);

  if (profileRes.error || !profileRes.data) {
    return json({ ok: false, code: 'profile', message: 'Finish setting up your account first.' }, 400);
  }
  if (!profileRes.data.consent_ai) {
    return json({
      ok: false,
      code: 'consent',
      message: 'Thumos stays off until you agree to send this conversation to the coach.',
    }, 403);
  }
  if (!apiKey) {
    return json({
      ok: false,
      code: 'missing_key',
      message: 'Voice needs XAI_API_KEY on the server. Text chat uses the same key. Nothing was sent to xAI.',
    });
  }

  const gratitudeRes = await userClient
    .from('gratitude_entries')
    .select('id, body, category, is_favourite, entry_date, created_at, updated_at')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false })
    .limit(40);
  const gratitude = gratitudeRes.error ? [] : gratitudeFromRows(gratitudeRes.data);
  const visionRes = await userClient
    .from('vision_board_items')
    .select('caption, area')
    .eq('user_id', userId)
    .order('position')
    .limit(40);
  const visionRows = visionRes.error || !Array.isArray(visionRes.data) ? [] : visionRes.data;
  const visionStarted = typeof profileRes.data.vision_started_on === 'string'
    ? /^(\d{4}-\d{2}-\d{2})/.exec(profileRes.data.vision_started_on)?.[1] ?? null
    : null;
  const vision = visionContextFrom(
    typeof profileRes.data.vision_statement === 'string' ? profileRes.data.vision_statement : '',
    visionStarted,
    visionRows.map((row) => ({
      caption: typeof row.caption === 'string' ? row.caption : '',
      area: typeof row.area === 'string' ? row.area : null,
    })),
  );

  const profile = profileRes.data;
  const stage = profile.stage === 'trying_to_stop' || profile.stage === 'cutting_down' || profile.stage === 'exploring' || profile.stage === 'stopped'
    ? profile.stage
    : profile.sobriety_started_at ? 'stopped' : 'exploring';
  const shareHealth = profile.consent_health === true;
  const healthRows = shareHealth ? (healthRes.data ?? []) : [];
  const byKind = new Map<string, { value: number; unit: string; recordedOn: string }[]>();
  for (const row of healthRows) {
    const list = byKind.get(row.kind) ?? [];
    list.push({ value: Number(row.value), unit: row.unit, recordedOn: String(row.recorded_on) });
    byKind.set(row.kind, list);
  }
  const health: HealthTrend[] = [...byKind.entries()].map(([kind, rows]) => ({
    kind,
    latest: rows[0]?.value ?? null,
    previous: rows[1]?.value ?? null,
    unit: rows[0]?.unit ?? '',
  }));
  const healthInsights = shareHealth
    ? buildHealthInsights({
        today: londonDay(new Date()),
        samples: healthRows.map((row) => ({
          kind: row.kind,
          value: Number(row.value),
          recordedOn: String(row.recorded_on),
        })),
        soberOn: stage === 'stopped' && profile.sobriety_started_at ? londonDay(profile.sobriety_started_at) : null,
        stage,
      }).headlines
    : [];
  const checkIns: CheckInSummary[] = (checkRes.data ?? []).map((row) => ({
    createdAt: row.created_at,
    mood: row.mood,
    sleepHours: Number(row.sleep_hours),
    craving: row.craving,
    note: row.note ?? '',
  }));
  const now = new Date();
  const briefing = buildVoiceBriefing({
    requestedMode: body.mode,
    historyRows: (historyRes.data ?? []).map((row) => ({
      role: row.role as string,
      content: row.content as string,
      createdAt: row.created_at as string,
    })),
    context: {
      now,
      displayName: profile.display_name ?? '',
      sobrietyStartedAt: profile.sobriety_started_at,
      reasons: (reasonsRes.data ?? []).map((row) => row.body),
      weeklySpendGbp: profile.weekly_spend_gbp == null ? null : Number(profile.weekly_spend_gbp),
      weeklyUnits: profile.weekly_units == null ? null : Number(profile.weekly_units),
      checkIns,
      health,
      healthInsights,
      mode: 'steady',
      safety: { selfHarm: false, withdrawal: false, reasons: [] },
      stage,
      plannedQuitAt: profile.planned_quit_at ?? null,
      weeklyUnitsGoal: profile.weekly_units_goal == null ? null : Number(profile.weekly_units_goal),
      drinkFreeDaysGoal: profile.drink_free_days_goal == null ? null : Number(profile.drink_free_days_goal),
      drinkFreeThisWeek: drinkFreeCount(profile.drink_free_on, now),
      gratitude,
      vision,
      interests: interestRes.error ? [] : interestLabelsFromRows(interestRes.data),
    },
  });

  const response = await fetch(GROK_VOICE.clientSecretUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expires_after: { seconds: 300 } }),
  });
  if (!response.ok) {
    return json({ ok: false, code: 'upstream', message: 'Voice could not be started. Text chat is still here.' }, 502);
  }
  const payload = await response.json();
  if (!payload?.value) return json({ ok: false, code: 'upstream', message: 'Voice could not be started. Text chat is still here.' }, 502);
  return json({
    ok: true,
    token: payload.value,
    expiresAt: payload.expires_at ?? null,
    instructions: briefing.instructions,
    crisisInstructions: briefing.crisisInstructions,
    history: briefing.history,
    greeting: briefing.greeting,
    mode: briefing.mode,
  });
});
