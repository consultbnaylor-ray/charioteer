import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import {
  gratitudeReflectMessages,
  isGratitudeCategory,
  localGratitudeReflect,
  parseGratitudeReflect,
} from '../_shared/gratitude.ts';
import { json, preflight } from '../_shared/http.ts';
import { buildChatCompletionBody, THUMOS_CHAT } from '../_shared/thumos.ts';
import { coachingPersonalDataAllowed, readInterimCoachOptIn } from '../_shared/xaiPersonal.ts';

type Body = { body?: string; category?: string | null };

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

  const body = (await req.json().catch(() => ({}))) as Body;
  const text = (body.body ?? '').trim();
  if (!text || text.length > 1000) {
    return json({ ok: false, code: 'content', message: 'Write a line under 1,000 characters.' }, 400);
  }
  const category = isGratitudeCategory(body.category) ? body.category : null;

  const profileRes = await userClient.from('profiles').select('consent_ai').eq('id', userData.user.id).single();
  if (profileRes.error || !profileRes.data) {
    return json({ ok: false, code: 'profile', message: 'Finish setting up your account first.' }, 400);
  }
  if (!profileRes.data.consent_ai) {
    return json({
      ok: false,
      code: 'consent',
      message: 'Thumos stays off until you agree to send this line to the coach.',
    }, 403);
  }

  const local = localGratitudeReflect(text, category);
  const apiKey = Deno.env.get('XAI_API_KEY');
  const personalDataEnabled = coachingPersonalDataAllowed({
    personalDataFlag: Deno.env.get('XAI_PERSONAL_DATA_ENABLED'),
    interimFlag: Deno.env.get('XAI_INTERIM_OPT_IN_ALLOWED'),
    userOptIn: await readInterimCoachOptIn(userClient, userData.user.id),
  });
  if (!apiKey || !personalDataEnabled) {
    return json({ ok: true, comment: local.comment, suggestions: local.suggestions, source: 'local' });
  }

  const messages = gratitudeReflectMessages(text, category);
  try {
    const response = await fetch(THUMOS_CHAT.completionsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildChatCompletionBody({
        model: Deno.env.get('THUMOS_MODEL') || THUMOS_CHAT.model,
        system: messages.system,
        history: [],
        user: messages.user,
        stream: false,
      })),
    });
    if (!response.ok) return json({ ok: true, comment: local.comment, suggestions: local.suggestions, source: 'local' });
    const parsed = parseGratitudeReflect(completionText(await response.json()));
    if (!parsed) return json({ ok: true, comment: local.comment, suggestions: local.suggestions, source: 'local' });
    return json({ ok: true, comment: parsed.comment, suggestions: parsed.suggestions, source: 'model' });
  } catch {
    return json({ ok: true, comment: local.comment, suggestions: local.suggestions, source: 'local' });
  }
});
