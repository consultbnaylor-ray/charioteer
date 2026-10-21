import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';

import { json, preflight } from '../_shared/http.ts';
import { stripJpegBase64 } from '../_shared/photoLocation.ts';
import { MEAL_ESTIMATE_PROMPT, estimateFromText, parseMealEstimate, samplePhotoMeal } from '../_shared/nutrition.ts';
import { buildChatCompletionBody, THUMOS_CHAT } from '../_shared/thumos.ts';
import { xaiPersonalDataEnabled } from '../_shared/xaiPersonal.ts';

type Body = { text?: string; imageBase64?: string; source?: string };

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
  const text = (body.text ?? '').trim().slice(0, 500);
  const image = typeof body.imageBase64 === 'string' ? stripJpegBase64(body.imageBase64.trim()) : '';
  if (!text && !image) return json({ ok: false, code: 'content', message: 'Add a photo or describe the meal.' }, 400);
  if (image.length > 6_000_000) return json({ ok: false, code: 'content', message: 'That photo is too large.' }, 400);

  const profileRes = await userClient.from('profiles').select('consent_ai').eq('id', userData.user.id).single();
  if (profileRes.error || !profileRes.data) {
    return json({ ok: false, code: 'profile', message: 'Finish setting up your account first.' }, 400);
  }
  if (!profileRes.data.consent_ai) {
    return json({
      ok: false,
      code: 'consent',
      message: 'Reading a meal needs the coach consent, because the photo or the words are sent to the model. You can still type the meal in yourself.',
    }, 403);
  }

  const local = text ? estimateFromText(text) : samplePhotoMeal();
  const ESTIMATE_PROVIDER_TIMEOUT_MS = 28_000;
  const apiKey = Deno.env.get('XAI_API_KEY');
  if (!apiKey || !xaiPersonalDataEnabled(Deno.env.get('XAI_PERSONAL_DATA_ENABLED'))) return json({ ok: true, items: local, source: 'local' });

  const content: ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[] = [
    { type: 'text', text: text ? `${MEAL_ESTIMATE_PROMPT}\n\nMeal: ${text}` : MEAL_ESTIMATE_PROMPT },
  ];
  if (image) {
    const urlPart = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
    content.push({ type: 'image_url', image_url: { url: urlPart } });
  }

  try {
    const response = await fetch(THUMOS_CHAT.completionsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...buildChatCompletionBody({
          model: Deno.env.get('THUMOS_MODEL') || THUMOS_CHAT.model,
          system: 'You estimate meals. Reply with JSON only.',
          history: [],
          user: text || 'See the photo.',
          stream: false,
        }),
        messages: [
          { role: 'system', content: 'You estimate meals. Reply with JSON only.' },
          { role: 'user', content },
        ],
      }),
      signal: AbortSignal.timeout(ESTIMATE_PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) return json({ ok: true, items: local, source: 'local' });
    const parsed = parseMealEstimate(completionText(await response.json()));
    if (!parsed) return json({ ok: true, items: local, source: 'local' });
    return json({ ok: true, items: parsed, source: 'model' });
  } catch {
    return json({ ok: true, items: local, source: 'local' });
  }
});
