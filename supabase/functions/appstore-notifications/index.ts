import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';

import { json, preflight } from '../_shared/http.ts';
import { applyServerNotification, readNotificationClaims, readTransactionClaims } from '../_shared/subscriptionRules.ts';
import { StoreKitVerifyError, verifyProductionJws } from '../_shared/storeKitJws.ts';

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !service) return json({ ok: false, code: 'config' }, 500);

  const body = await req.json().catch(() => null) as { signedPayload?: unknown } | null;
  const signedPayload = typeof body?.signedPayload === 'string' ? body.signedPayload : '';
  if (!signedPayload || signedPayload.length > 100_000) return json({ ok: false, code: 'jws' }, 400);

  let outer: unknown;
  try {
    outer = await verifyProductionJws(signedPayload);
  } catch (caught) {
    const reason = caught instanceof StoreKitVerifyError ? caught.reason : 'signature';
    console.error('appstore-notifications', reason);
    return json({ ok: false, code: 'verify' }, 400);
  }
  const note = readNotificationClaims(outer);
  if (!note.ok) return json({ ok: false, code: note.reason }, 400);
  if (note.kind === 'test') return json({ ok: true, stored: false });

  let transaction: unknown;
  try {
    transaction = await verifyProductionJws(note.signedTransactionInfo);
  } catch (caught) {
    const reason = caught instanceof StoreKitVerifyError ? caught.reason : 'signature';
    console.error('appstore-notifications transaction', reason);
    return json({ ok: false, code: 'verify' }, 400);
  }
  const read = readTransactionClaims(transaction);
  if (!read.ok) return json({ ok: false, code: read.reason }, 400);
  const next = applyServerNotification(read.subscription, note.notificationType, note.subtype);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const saved = await admin
    .from('subscriptions')
    .update({
      product_id: next.productId,
      status: next.status,
      expires_at: next.expiresAt,
      is_trial: next.isTrial,
      environment: next.environment,
      updated_at: new Date().toISOString(),
    })
    .eq('original_transaction_id', next.originalTransactionId)
    .select('user_id');
  if (saved.error) return json({ ok: false, code: 'save' }, 500);
  return json({ ok: true, stored: Array.isArray(saved.data) && saved.data.length > 0 });
});
