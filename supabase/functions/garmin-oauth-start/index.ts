import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';
import {
  garminAuthorizeUrl,
  missingRelation,
  pkceChallenge,
  pkceRecord,
  PKCE_TTL_MS,
} from '../_shared/garmin.ts';

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('GARMIN_CLIENT_ID') ?? '';
  const authHeader = req.headers.get('Authorization');
  if (!url || !anon || !service || !authHeader || !clientId.trim()) {
    console.error('garmin-oauth: config');
    return json({ ok: false, code: 'config' }, 500);
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error } = await userClient.auth.getUser();
  if (error || !userData.user) return json({ ok: false, code: 'unauthorised' }, 401);

  const now = Date.now();
  const verifierRandom = crypto.getRandomValues(new Uint8Array(64));
  const stateRandom = crypto.getRandomValues(new Uint8Array(64));
  const row = pkceRecord(userData.user.id, now, verifierRandom, stateRandom);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const expiredBefore = new Date(now - PKCE_TTL_MS).toISOString();
  await admin.from('garmin_oauth_states').delete().eq('user_id', userData.user.id).lt('expires_at', expiredBefore);
  const saved = await admin.from('garmin_oauth_states').insert({
    state: row.state,
    user_id: row.userId,
    code_verifier: row.codeVerifier,
    created_at: row.createdAt,
    expires_at: row.expiresAt,
  });
  if (saved.error) {
    if (missingRelation(saved.error.message)) return json({ ok: false, code: 'unavailable' }, 503);
    console.error('garmin-oauth: state');
    return json({ ok: false, code: 'state' }, 500);
  }

  const challenge = await pkceChallenge(row.codeVerifier);
  return json({
    ok: true,
    url: garminAuthorizeUrl({ clientId: clientId.trim(), codeChallenge: challenge, state: row.state }),
  });
});
