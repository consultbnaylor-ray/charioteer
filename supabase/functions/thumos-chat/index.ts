import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { ALCOHOL_FACTS } from '../_shared/facts.ts';
import { corsHeaders, json, preflight } from '../_shared/http.ts';
import { encodeSse, type ThumosServerEvent } from '../_shared/sse.ts';
import { ensureSafetyNotices } from '../_shared/safety.ts';
import {
  buildChatCompletionBody,
  buildSystemPrompt,
  buildThumosContext,
  completionDeltaText,
  OFFLINE_COACH_MESSAGE,
  safetyFromText,
  THUMOS_CHAT,
  type CheckInSummary,
  type HealthTrend,
  type ThumosMode,
} from '../_shared/thumos.ts';

type Body = { content?: string; mode?: ThumosMode };

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
  const [profileRes, reasonsRes, checkRes, healthRes, historyRes] = await Promise.all([
    userClient.from('profiles').select('*').eq('id', userId).single(),
    userClient.from('reasons').select('body, sort_order').eq('user_id', userId).order('sort_order'),
    userClient.from('check_ins').select('mood, sleep_hours, craving, note, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(THUMOS_CHAT.checkInLimit),
    userClient.from('health_samples').select('kind, value, unit, recorded_on').eq('user_id', userId).order('recorded_on', { ascending: false }).limit(40),
    userClient.from('thumos_messages').select('role, content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(THUMOS_CHAT.historyLimit),
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

  const safety = safetyFromText(content);
  const requested = body.mode;
  const mode: ThumosMode =
    safety.selfHarm || safety.withdrawal
      ? 'support'
      : requested === 'support' || requested === 'growth' || requested === 'opening' || requested === 'steady'
        ? requested
        : 'steady';

  const byKind = new Map<string, { value: number; unit: string; recordedOn: string }[]>();
  for (const row of healthRes.data ?? []) {
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

  const checkIns: CheckInSummary[] = (checkRes.data ?? []).map((row) => ({
    createdAt: row.created_at,
    mood: row.mood,
    sleepHours: Number(row.sleep_hours),
    craving: row.craving,
    note: row.note ?? '',
  }));

  const context = buildThumosContext({
    now: new Date(),
    displayName: profileRes.data.display_name ?? '',
    sobrietyStartedAt: profileRes.data.sobriety_started_at,
    reasons: (reasonsRes.data ?? []).map((row) => row.body),
    weeklySpendGbp: profileRes.data.weekly_spend_gbp == null ? null : Number(profileRes.data.weekly_spend_gbp),
    weeklyUnits: profileRes.data.weekly_units == null ? null : Number(profileRes.data.weekly_units),
    checkIns,
    health,
    mode,
    safety,
  });

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const apiKey = Deno.env.get('XAI_API_KEY');
  const history = [...(historyRes.data ?? [])].reverse().map((row) => ({
    role: row.role === 'user' ? 'user' as const : 'assistant' as const,
    content: row.content as string,
  }));
  const model = Deno.env.get('THUMOS_MODEL') || THUMOS_CHAT.model;
  const system = buildSystemPrompt(context, mode, ALCOHOL_FACTS);

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
            const response = await fetch(THUMOS_CHAT.completionsUrl, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(buildChatCompletionBody({ model, system, history, user: content, stream: true })),
            });
            if (!response.ok || !response.body) {
              reply = ensureSafetyNotices(
                'Thumos could not get a reply from the coach just now. This is not a model answer. If you are in danger, call 999. For withdrawal, call NHS 111 or your GP. For suicidal thoughts, call the Samaritans on 116 123.',
                safety,
              );
              send({ type: 'delta', text: reply });
            } else {
              const text = await readCompletionStream(response.body, (delta) => send({ type: 'delta', text: delta }));
              reply = ensureSafetyNotices(
                text.trim() ? text.trim() : 'I am here. Say a little more if you can.',
                safety,
              );
              role = 'assistant';
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

async function readCompletionStream(body: ReadableStream<Uint8Array>, onDelta: (text: string) => void): Promise<string> {
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
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const text = completionDeltaText(JSON.parse(payload));
        if (!text) continue;
        reply += text;
        onDelta(text);
      } catch {
        // A partial JSON line is completed on the next chunk.
      }
    }
  }
  return reply;
}
