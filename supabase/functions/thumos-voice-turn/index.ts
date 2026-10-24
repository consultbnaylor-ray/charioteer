import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';
import { ensureSafetyNotices, pinnedSafetyNotices } from '../_shared/safety.ts';
import { resolveThumosMode, safetyFromText, type ThumosMode } from '../_shared/thumos.ts';
import { spokenSafetyLine, VOICE_COPY } from '../_shared/voice.ts';

type Body = { user?: string; assistant?: string; mode?: ThumosMode };

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method', message: VOICE_COPY.unsaved }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !anon || !service || !authHeader) {
    return json({ ok: false, code: 'config', message: VOICE_COPY.unsaved }, 500);
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ ok: false, code: 'unauthorised', message: 'Sign in first.' }, 401);

  const body = (await req.json().catch(() => ({}))) as Body;
  const userText = (body.user ?? '').trim();
  const assistantText = (body.assistant ?? '').trim();
  if (!userText || userText.length > 4000 || assistantText.length > 8000) {
    return json({ ok: false, code: 'content', message: VOICE_COPY.unsaved }, 400);
  }

  const profileRes = await userClient.from('profiles').select('consent_ai').eq('id', userData.user.id).single();
  if (profileRes.error || !profileRes.data) {
    return json({ ok: false, code: 'profile', message: VOICE_COPY.unsaved }, 400);
  }
  if (!profileRes.data.consent_ai) {
    return json({
      ok: false,
      code: 'consent',
      message: 'Thumos stays off until you agree to send this conversation to the coach.',
    }, 403);
  }

  const safety = safetyFromText(userText);
  const mode = resolveThumosMode({ requested: body.mode, userText, safety });
  const spoken = spokenSafetyLine(safety);
  const reply = ensureSafetyNotices(assistantText || spoken || 'I am here.', safety);
  const now = new Date().toISOString();
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { error: insertError } = await admin.from('thumos_messages').insert([
    { user_id: userData.user.id, role: 'user', content: userText, mode, created_at: now },
    { user_id: userData.user.id, role: 'assistant', content: reply, mode, created_at: new Date(Date.now() + 1).toISOString() },
  ]);
  if (insertError) return json({ ok: false, code: 'save', message: VOICE_COPY.unsaved }, 500);
  return json({ ok: true, reply, notices: pinnedSafetyNotices(safety), mode });
});
