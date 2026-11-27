import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';

import { countAiUse, gateAiUse } from '../_shared/aiAllowance.ts';
import { AI_BILLING_MESSAGES, logAiBilling, xaiBillingRefusal, xaiErrorText } from '../_shared/aiBilling.ts';
import { corsHeaders, json, preflight } from '../_shared/http.ts';
import { stripJpegBase64 } from '../_shared/photoLocation.ts';
import { MEAL_NO_RETRY_HEADER, mealProviderResult, providerRetryPointless, type MealProviderFault } from '../_shared/mealProvider.ts';
import { MEAL_ESTIMATE_PROMPT, PHOTO_READ_FAIL, estimateFromText, parseMealEstimate } from '../_shared/nutrition.ts';
import { buildChatCompletionBody, THUMOS_CHAT } from '../_shared/thumos.ts';
import { coachingPersonalDataAllowed, readInterimCoachOptIn } from '../_shared/xaiPersonal.ts';

type Body = { text?: string; imageBase64?: string; source?: string };

function completionText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const choices = (payload as { choices?: { message?: { content?: unknown } }[] }).choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

function requestLabel(req: Request): string {
  const raw = req.headers.get('X-Request-Id') ?? '';
  return /^[0-9a-f-]{8,40}$/i.test(raw) ? raw : '';
}

/** A 503 the phone should show at once instead of retrying, because the provider is out of credit. */
function noRetry(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      [MEAL_NO_RETRY_HEADER]: '1',
      'Access-Control-Expose-Headers': MEAL_NO_RETRY_HEADER,
    },
  });
}

/** Category only. The photo, the meal text, the key, and provider bodies are not logged. */
function note(requestId: string, code: string): void {
  console.error('estimate-meal', requestId || 'no-request', code);
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  const requestId = requestLabel(req);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !anon || !service || !authHeader) return json({ ok: false, code: 'config' }, 500);

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    note(requestId, 'auth');
    return json({ ok: false, code: 'unauthorised', requestId: requestId || null }, 401);
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const text = (body.text ?? '').trim().slice(0, 500);
  const image = typeof body.imageBase64 === 'string' ? stripJpegBase64(body.imageBase64.trim()) : '';
  if (!text && !image) {
    note(requestId, 'content');
    return json({ ok: false, code: 'content', requestId: requestId || null, message: 'Add a photo or describe the meal.' }, 400);
  }
  if (image.length > 6_000_000) {
    note(requestId, 'content');
    return json({ ok: false, code: 'content', requestId: requestId || null, message: 'That photo is too large.' }, 400);
  }

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

  const typed = text ? estimateFromText(text) : [];
  const warnMeal = (reason: string) => {
    console.warn(`meal-estimate ${reason}`);
    note(requestId, reason);
  };
  const replyFor = (fault: MealProviderFault, billing = false) => {
    const decision = mealProviderResult(Boolean(image), fault);
    // Our provider account refused. The phone says it is not their fault and no credit was used.
    const billed = billing ? { billing: true, message: AI_BILLING_MESSAGES.meal } : {};
    if (decision.outcome === 'unread') {
      return json({ ok: false, code: 'unread', requestId: requestId || null, message: PHOTO_READ_FAIL }, 422);
    }
    if (decision.outcome === 'unavailable') {
      const body = { ok: false, code: decision.code, requestId: requestId || null, ...billed };
      return providerRetryPointless(fault) || billing ? noRetry(body, 503) : json(body, 503);
    }
    if (decision.providerUnavailable) {
      return json({ ok: true, items: typed, source: 'local', providerUnavailable: true, ...billed });
    }
    return json({ ok: true, items: typed, source: 'local' });
  };
  /**
   * Supabase stops an edge function at 150s on the Free plan and 400s on Pro.
   * 90s leaves headroom for boot, auth, and sending the reply.
   */
  const ESTIMATE_PROVIDER_TIMEOUT_MS = 90_000;
  const apiKey = Deno.env.get('XAI_API_KEY');
  const personalDataEnabled = coachingPersonalDataAllowed({
    personalDataFlag: Deno.env.get('XAI_PERSONAL_DATA_ENABLED'),
    interimFlag: Deno.env.get('XAI_INTERIM_OPT_IN_ALLOWED'),
    userOptIn: await readInterimCoachOptIn(userClient, userData.user.id),
  });
  if (!apiKey) {
    warnMeal('no_key');
    return replyFor({ kind: 'missing_key' });
  }
  if (!personalDataEnabled) {
    if (image) warnMeal('gate');
    // The model is not called. That is not a photo the model failed to read.
    if (image) return json({ ok: false, code: 'provider_unavailable', requestId: requestId || null }, 503);
    return json({ ok: true, items: typed, source: 'local' });
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const gate = await gateAiUse({
    admin,
    userId: userData.user.id,
    kind: 'meal',
    enforcedFlag: Deno.env.get('AI_ENTITLEMENT_ENFORCED'),
    allowlist: Deno.env.get('AI_ENTITLEMENT_USERS'),
    // Counted below only once the model returns a usable estimate.
    countWhen: 'after',
  });
  if (!gate.ok && 'body' in gate) return json({ ...gate.body, usage: null }, gate.status);

  const content: ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'low' } })[] = [
    { type: 'text', text: text ? `${MEAL_ESTIMATE_PROMPT}\n\nMeal: ${text}` : MEAL_ESTIMATE_PROMPT },
  ];
  if (image) {
    const urlPart = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
    content.push({ type: 'image_url', image_url: { url: urlPart, detail: 'high' } });
  }

  const textBody = buildChatCompletionBody({
    model: Deno.env.get('THUMOS_MODEL') || THUMOS_CHAT.model,
    system: 'You estimate meals. Reply with JSON only.',
    history: [],
    user: text || 'See the photo.',
    stream: false,
  });
  const photoBody = {
    model: THUMOS_CHAT.model,
    reasoning_effort: 'low' as const,
    stream: false,
    max_tokens: 2000,
    messages: [
      { role: 'system' as const, content: 'You estimate meals. Reply with JSON only.' },
      { role: 'user' as const, content },
    ],
  };

  try {
    const response = await fetch(THUMOS_CHAT.completionsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(image ? photoBody : { ...textBody, messages: [
        { role: 'system', content: 'You estimate meals. Reply with JSON only.' },
        { role: 'user', content },
      ] }),
      signal: AbortSignal.timeout(ESTIMATE_PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) {
      const billing = response.status === 402 || xaiBillingRefusal(response.status, await xaiErrorText(response));
      if (response.status === 402) await response.body?.cancel().catch(() => undefined);
      warnMeal(`http ${response.status}`);
      if (billing) logAiBilling('estimate-meal', response.status);
      return replyFor({ kind: 'http', status: response.status }, billing);
    }
    const parsed = parseMealEstimate(completionText(await response.json()));
    if (!parsed) {
      warnMeal('parse');
      return replyFor({ kind: 'unparsed' });
    }
    await countAiUse({
      admin,
      userId: userData.user.id,
      kind: 'meal',
      tier: gate.ok ? gate.tier : null,
      requestId,
    }).catch(() => false);
    return json({ ok: true, items: parsed, source: 'model', requestId: requestId || null });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    warnMeal(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'http');
    return replyFor(name === 'TimeoutError' || name === 'AbortError' ? { kind: 'timeout' } : { kind: 'network' });
  }
});
