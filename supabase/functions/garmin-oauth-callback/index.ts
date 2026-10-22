import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import {
  GARMIN_PERMISSIONS_URL,
  GARMIN_TOKEN_URL,
  GARMIN_USER_ID_URL,
  GARMIN_TOKEN_KEY_VERSION,
  garminAppReturn,
  garminTokenAad,
  garminTokenForm,
  readTokenResponse,
  sealGarminToken,
} from '../_shared/garmin.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method !== 'GET') return redirect(false);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  if (!code || !state || url.searchParams.get('error')) return redirect(false);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = (Deno.env.get('GARMIN_CLIENT_ID') ?? '').trim();
  const clientSecret = (Deno.env.get('GARMIN_CLIENT_SECRET') ?? '').trim();
  const tokenKey = (Deno.env.get('GARMIN_TOKEN_KEY') ?? '').trim();
  if (!supabaseUrl || !service || !clientId || !clientSecret || !tokenKey) {
    console.error('garmin-oauth: config');
    return redirect(false);
  }

  const admin = createClient(supabaseUrl, service, { auth: { persistSession: false } });
  const saved = await admin
    .from('garmin_oauth_states')
    .select('user_id, code_verifier, expires_at')
    .eq('state', state)
    .maybeSingle();
  await admin.from('garmin_oauth_states').delete().eq('state', state);
  const row = saved.data;
  if (saved.error || !row?.user_id || !row.code_verifier) return redirect(false);
  if (Date.parse(String(row.expires_at)) <= Date.now()) return redirect(false);

  const now = Date.now();
  let tokens;
  try {
    const response = await fetch(GARMIN_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: garminTokenForm({
        clientId,
        clientSecret,
        code,
        codeVerifier: String(row.code_verifier),
      }),
    });
    if (!response.ok) {
      console.error('garmin-oauth: exchange');
      return redirect(false);
    }
    tokens = readTokenResponse(await response.json(), now);
  } catch {
    console.error('garmin-oauth: exchange');
    return redirect(false);
  }
  if (!tokens) return redirect(false);

  let garminUserId = '';
  try {
    const response = await fetch(GARMIN_USER_ID_URL, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!response.ok) {
      console.error('garmin-oauth: user');
      return redirect(false);
    }
    const body = await response.json() as { userId?: unknown };
    garminUserId = typeof body.userId === 'string' ? body.userId : '';
  } catch {
    console.error('garmin-oauth: user');
    return redirect(false);
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(garminUserId)) return redirect(false);

  const existing = await admin
    .from('garmin_connections')
    .select('user_id')
    .eq('garmin_user_id', garminUserId)
    .maybeSingle();
  if (existing.data?.user_id && existing.data.user_id !== row.user_id) return redirect(false);

  const permissions = await readPermissions(tokens.accessToken);
  let accessSeal;
  let refreshSeal;
  try {
    accessSeal = await sealGarminToken(tokens.accessToken, tokenKey, garminTokenAad(String(row.user_id), 'access', GARMIN_TOKEN_KEY_VERSION));
    refreshSeal = await sealGarminToken(tokens.refreshToken, tokenKey, garminTokenAad(String(row.user_id), 'refresh', GARMIN_TOKEN_KEY_VERSION));
  } catch {
    console.error('garmin-oauth: key');
    return redirect(false);
  }
  const stored = await admin.from('garmin_connections').upsert({
    user_id: row.user_id,
    garmin_user_id: garminUserId,
    access_token_ciphertext: accessSeal.ciphertext,
    access_token_nonce: accessSeal.nonce,
    refresh_token_ciphertext: refreshSeal.ciphertext,
    refresh_token_nonce: refreshSeal.nonce,
    token_key_version: accessSeal.keyVersion,
    access_expires_at: tokens.accessExpiresAt,
    refresh_expires_at: tokens.refreshExpiresAt,
    scopes: tokens.scopes,
    permissions,
    connected_at: new Date(now).toISOString(),
    revoked_at: null,
  }, { onConflict: 'user_id' });
  if (stored.error) {
    console.error('garmin-oauth: store');
    return redirect(false);
  }
  return redirect(true);
});

function redirect(connected: boolean): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: garminAppReturn(connected) },
  });
}

async function readPermissions(accessToken: string): Promise<string> {
  try {
    const response = await fetch(GARMIN_PERMISSIONS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return '';
    const body: unknown = await response.json();
    const values = Array.isArray(body)
      ? body
      : body && typeof body === 'object' && Array.isArray((body as { permissions?: unknown }).permissions)
        ? (body as { permissions: unknown[] }).permissions
        : [];
    return values
      .map((item) => typeof item === 'string' ? item.trim() : '')
      .filter((item) => /^[A-Z0-9_]{1,40}$/.test(item))
      .join(' ');
  } catch {
    return '';
  }
}
