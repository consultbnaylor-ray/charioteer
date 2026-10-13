import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { ALCOHOL_FACTS } from '../_shared/facts.ts';
import { corsHeaders, json, preflight } from '../_shared/http.ts';
import { encodeSse, type ThumosServerEvent } from '../_shared/sse.ts';
import { ensureSafetyNotices } from '../_shared/safety.ts';
import { pinnedStoicQuote } from '../_shared/stoicQuotes.ts';
import {
  buildChatCompletionBody,
  buildSystemPrompt,
  buildThumosContext,
  completionDeltaText,
  conversationCues,
  detectCommittedAction,
  detectRisk,
  freshThumosFallback,
  historyTurnsForModel,
  interestLabelsFromRows,
  isThumosFollowUp,
  mentionsCheckInOrHealth,
  OFFLINE_COACH_MESSAGE,
  resolveThumosMode,
  safetyFromText,
  THUMOS_CHAT,
  THUMOS_RETRY_NOTE,
  thumosReplyFaults,
  type ChatTurn,
  type CheckInSummary,
  type HealthTrend,
  type ThumosMode,
} from '../_shared/thumos.ts';
import { gratitudeFromRows, type GratitudeEntry } from '../_shared/gratitude.ts';
import { visionContextFrom, type VisionContext } from '../_shared/visionBoard.ts';
import { buildHealthInsights, londonDay } from '../_shared/healthInsights.ts';
import { loadNutritionLines } from '../_shared/nutritionLoad.ts';
import { moodOnTen } from '../_shared/mood.ts';

type Body = { content?: string; mode?: ThumosMode };

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

async function loadVision(userClient: SupabaseClient, userId: string, statement: unknown, startedOn: unknown): Promise<VisionContext> {
  const res = await userClient
    .from('vision_board_items')
    .select('caption, area')
    .eq('user_id', userId)
    .order('position')
    .limit(40);
  const rows = res.error || !Array.isArray(res.data) ? [] : res.data;
  const started = typeof startedOn === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(startedOn)?.[1] ?? null : null;
  return visionContextFrom(
    typeof statement === 'string' ? statement : '',
    started,
    rows.map((row) => ({
      caption: typeof row.caption === 'string' ? row.caption : '',
      area: typeof row.area === 'string' ? row.area : null,
    })),
  );
}

async function loadGratitude(userClient: SupabaseClient, userId: string): Promise<GratitudeEntry[]> {
  const gratitudeRes = await userClient
    .from('gratitude_entries')
    .select('id, body, category, is_favourite, entry_date, created_at, updated_at')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false })
    .limit(40);
  if (gratitudeRes.error) return [];
  return gratitudeFromRows(gratitudeRes.data);
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !anon || !service || !authHeader) {
    return json({ ok: false, code: 'config', message: 'Supabase is not configured for Thumos.' }, 500);
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ ok: false, code: 'unauthorised' }, 401);

  const body = (await req.json().catch(() => ({}))) as Body;
  const content = (body.content ?? '').trim();
  if (!content || content.length > 4000) {
    return json({ ok: false, code: 'content', message: 'Write a message under 4,000 characters.' }, 400);
  }

  const userId = userData.user.id;
  const [profileRes, reasonsRes, checkRes, healthRes, historyRes, interestRes] = await Promise.all([
    userClient.from('profiles').select('*').eq('id', userId).single(),
    userClient.from('reasons').select('body, sort_order').eq('user_id', userId).order('sort_order'),
    userClient.from('check_ins').select('mood, mood_10, sleep_hours, craving, note, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(THUMOS_CHAT.checkInLimit),
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

  const gratitude = await loadGratitude(userClient, userId);
  const vision = await loadVision(userClient, userId, profileRes.data.vision_statement, profileRes.data.vision_started_on);

  const safety = safetyFromText(content);
  const mode = resolveThumosMode({ requested: body.mode, userText: content, safety });

  const profile = profileRes.data;
  const stage = profile.stage === 'trying_to_stop' || profile.stage === 'cutting_down' || profile.stage === 'exploring' || profile.stage === 'stopped'
    ? profile.stage
    : profile.sobriety_started_at ? 'stopped' : 'exploring';
  const shareHealth = profile.consent_health === true;
  const healthRows = shareHealth ? (healthRes.data ?? []) : [];
  const byKind = new Map<string, { value: number; unit: string; recordedOn: string }[]>();
  for (const row of healthRows) {
    const list = byKind.get(row.kind) ?? [];
    list.push({ value: Number(row.value), unit: row.unit, recordedOn: row.recorded_on });
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
    mood: moodOnTen(row.mood, row.mood_10),
    sleepHours: Number(row.sleep_hours),
    craving: row.craving,
    note: row.note ?? '',
  }));
  const nutritionLines = safety.selfHarm ? [] : await loadNutritionLines(userClient, profile, checkIns);

  const context = buildThumosContext({
    now: new Date(),
    displayName: profile.display_name ?? '',
    sobrietyStartedAt: profile.sobriety_started_at,
    reasons: (reasonsRes.data ?? []).map((row) => row.body),
    weeklySpendGbp: profile.weekly_spend_gbp == null ? null : Number(profile.weekly_spend_gbp),
    weeklyUnits: profile.weekly_units == null ? null : Number(profile.weekly_units),
    checkIns,
    health,
    healthInsights,
    mode,
    safety,
    stage,
    plannedQuitAt: profile.planned_quit_at ?? null,
    weeklyUnitsGoal: profile.weekly_units_goal == null ? null : Number(profile.weekly_units_goal),
    drinkFreeDaysGoal: profile.drink_free_days_goal == null ? null : Number(profile.drink_free_days_goal),
    drinkFreeThisWeek: drinkFreeCount(profile.drink_free_on, new Date()),
    gratitude,
    vision,
    interests: interestRes.error ? [] : interestLabelsFromRows(interestRes.data),
    pinnedQuote: pinnedStoicQuote(profile.pinned_quote_id),
    nutritionLines,
  });

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const apiKey = Deno.env.get('XAI_API_KEY');
  const historyRows = (historyRes.data ?? []).map((row) => ({
    role: row.role as string,
    content: row.content as string,
    createdAt: row.created_at as string,
  }));
  const history = historyTurnsForModel(historyRows);
  const model = Deno.env.get('THUMOS_MODEL') || THUMOS_CHAT.model;
  const cues = conversationCues({
    history: historyRows,
    reasons: (reasonsRes.data ?? []).map((row) => row.body),
  });
  const committedAction = safety.selfHarm ? null : detectCommittedAction(content);
  const earlierAssistant = [...historyRows]
    .filter((row) => row.role === 'assistant' && row.content.trim())
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .map((row) => row.content);
  const system = buildSystemPrompt(context, mode, ALCOHOL_FACTS, {
    followUp: mode === 'support' && isThumosFollowUp(historyRows),
    supportShape: detectRisk(content) === 'planning' ? 'planning' : 'acute',
    committedAction,
    selfHarm: safety.selfHarm,
    soberTimeAlreadySaid: cues.soberTimeAlreadySaid,
    reasonsAlreadyUsed: cues.reasonsAlreadyUsed,
    healthAlreadySaid: earlierAssistant.some((item) => mentionsCheckInOrHealth(item)),
    stage,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: ThumosServerEvent) => controller.enqueue(encoder.encode(encodeSse(event)));
      let reply = OFFLINE_COACH_MESSAGE;
      let role: 'assistant' | 'offline' = 'offline';
      try {
        if (!apiKey) {
          reply = ensureSafetyNotices(OFFLINE_COACH_MESSAGE, safety);
          send({ type: 'delta', text: reply });
        } else {
          try {
            const first = await completeThumos({ apiKey, model, system, history, user: content });
            if (!first.ok) {
              reply = ensureSafetyNotices(
                'Thumos could not get a reply from the coach just now. This is not a model answer. If you are in danger, call 999. For withdrawal, call NHS 111 or your GP. For suicidal thoughts, call the Samaritans on 116 123.',
                safety,
              );
              send({ type: 'delta', text: reply });
            } else {
              let modelText = first.text || 'I am here. Say a little more if you can.';
              if (!safety.selfHarm && thumosReplyFaults(modelText, earlierAssistant).length > 0) {
                const second = await completeThumos({
                  apiKey,
                  model,
                  system: `${system}\n\n${THUMOS_RETRY_NOTE}`,
                  history,
                  user: content,
                });
                modelText = second.ok && second.text && thumosReplyFaults(second.text, earlierAssistant).length === 0
                  ? second.text
                  : freshThumosFallback(earlierAssistant);
              }
              reply = ensureSafetyNotices(modelText, safety);
              role = 'assistant';
              send({ type: 'delta', text: reply });
            }
          } catch {
            reply = ensureSafetyNotices(OFFLINE_COACH_MESSAGE, safety);
            send({ type: 'delta', text: reply });
          }
        }

        const now = new Date().toISOString();
        const { error: insertError } = await admin.from('thumos_messages').insert([
          { user_id: userId, role: 'user', content, mode, created_at: now },
          { user_id: userId, role, content: reply, mode, created_at: new Date(Date.now() + 1).toISOString() },
        ]);
        if (insertError) {
          send({ type: 'error', message: 'The message could not be saved.' });
        } else {
          send({ type: 'done', reply, role, ok: role === 'assistant' });
        }
      } catch {
        send({ type: 'error', message: 'Thumos could not finish that reply.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

async function completeThumos(input: {
  apiKey: string;
  model: string;
  system: string;
  history: ChatTurn[];
  user: string;
}): Promise<{ ok: true; text: string } | { ok: false }> {
  const response = await fetch(THUMOS_CHAT.completionsUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildChatCompletionBody({
      model: input.model,
      system: input.system,
      history: input.history,
      user: input.user,
      stream: true,
    })),
  });
  if (!response.ok || !response.body) return { ok: false };
  const text = (await readCompletionStream(response.body)).trim();
  return { ok: true, text };
}

async function readCompletionStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reply = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    reply += textFromSseLines(lines);
  }
  buffer += decoder.decode();
  if (buffer.trim()) reply += textFromSseLines(buffer.split('\n'));
  return reply;
}

function textFromSseLines(lines: string[]): string {
  let reply = '';
  for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const text = completionDeltaText(JSON.parse(payload));
        if (!text) continue;
        reply += text;
      } catch {
        // A partial JSON line is completed on the next chunk.
      }
  }
  return reply;
}
