import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { exchangeAppleAuthorizationCode, readAppleSecrets } from '../_shared/appleRevoke.ts';
import { json, preflight } from '../_shared/http.ts';

/**
 * Stores an Apple refresh token for the signed-in person. Do not deploy this from the app.
 * The authorization code is exchanged and then dropped. It is not written down.
 */
Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !anon || !service || !authHeader) return json({ ok: false, code: 'config' }, 500);

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error } = await userClient.auth.getUser();
  if (error || !userData.user) return json({ ok: false, code: 'unauthorised' }, 401);

  const body = await req.json().catch(() => ({})) as { code?: unknown };
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code || code.length > 2000) return json({ ok: false, code: 'code' }, 400);

  const secrets = readAppleSecrets(Deno.env);
  if (!secrets) return json({ ok: false, code: 'config' }, 503);

  const refresh = await exchangeAppleAuthorizationCode({ code, secrets });
  if (!refresh) return json({ ok: false, code: 'apple' }, 502);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const saved = await admin.from('apple_siwa_tokens').upsert({
    user_id: userData.user.id,
    refresh_token: refresh,
    updated_at: new Date().toISOString(),
  });
  if (saved.error) return json({ ok: false, code: 'store' }, 500);
  return json({ ok: true });
});
