import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';

import { json, preflight } from '../_shared/http.ts';
import { readTransactionClaims } from '../_shared/subscriptionRules.ts';
import { StoreKitVerifyError, verifyProductionJws } from '../_shared/storeKitJws.ts';

const JWS_LIMIT = 100_000;

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

  const body = await req.json().catch(() => null) as { jws?: unknown } | null;
  const jws = typeof body?.jws === 'string' ? body.jws : '';
  if (!jws || jws.length > JWS_LIMIT) return json({ ok: false, code: 'jws' }, 400);

  let payload: unknown;
  try {
    payload = await verifyProductionJws(jws);
  } catch (caught) {
    const reason = caught instanceof StoreKitVerifyError ? caught.reason : 'signature';
    console.error('subscription-verify', reason);
    return json({ ok: false, code: 'verify' }, 400);
  }
  const read = readTransactionClaims(payload);
  if (!read.ok) return json({ ok: false, code: read.reason }, 400);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const existing = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('original_transaction_id', read.subscription.originalTransactionId)
    .maybeSingle();
  if (existing.error) return json({ ok: false, code: 'read' }, 500);
  if (existing.data && existing.data.user_id !== userData.user.id) return json({ ok: false, code: 'taken' }, 409);

  const row = {
    user_id: userData.user.id,
    original_transaction_id: read.subscription.originalTransactionId,
    product_id: read.subscription.productId,
    status: read.subscription.status,
    expires_at: read.subscription.expiresAt,
    is_trial: read.subscription.isTrial,
    environment: read.subscription.environment,
    updated_at: new Date().toISOString(),
  };
  const saved = await admin.from('subscriptions').upsert(row, { onConflict: 'user_id' });
  if (saved.error) return json({ ok: false, code: 'save' }, 500);
  return json({
    ok: true,
    subscription: {
      product_id: row.product_id,
      status: row.status,
      expires_at: row.expires_at,
      is_trial: row.is_trial,
      environment: row.environment,
    },
  });
});
