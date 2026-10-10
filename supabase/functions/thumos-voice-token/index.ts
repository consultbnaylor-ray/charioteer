import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';
import { GROK_VOICE } from '../_shared/voice.ts';

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const authHeader = req.headers.get('Authorization');
  const apiKey = Deno.env.get('XAI_API_KEY');
  if (!url || !anon || !authHeader) return json({ ok: false, code: 'config' }, 500);

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return json({ ok: false, code: 'unauthorised' }, 401);

  if (!apiKey) {
    return json({
      ok: false,
      code: 'missing_key',
      message: 'Voice needs XAI_API_KEY on the server. Text chat uses the same key. Nothing was sent to xAI.',
    });
  }

  const response = await fetch(GROK_VOICE.clientSecretUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expires_after: { seconds: 300 } }),
  });
  if (!response.ok) {
    return json({ ok: false, code: 'upstream', message: 'xAI did not issue a voice token.' }, 502);
  }
  const payload = await response.json();
  if (!payload?.value) return json({ ok: false, code: 'upstream', message: 'The voice token was empty.' }, 502);
  return json({ ok: true, token: payload.value, expiresAt: payload.expires_at ?? null });
});
