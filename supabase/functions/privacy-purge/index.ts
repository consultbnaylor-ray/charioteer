import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';

import { json, preflight } from '../_shared/http.ts';

/**
 * Deletes expired privacy rows. Call with header x-privacy-purge set to
 * PRIVACY_PURGE_SECRET. Each SQL function does its own delete.
 */
Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);

  const secret = Deno.env.get('PRIVACY_PURGE_SECRET');
  if (!secret || req.headers.get('x-privacy-purge') !== secret) {
    return json({ ok: false, code: 'unauthorised' }, 401);
  }
  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !service) return json({ ok: false, code: 'config' }, 500);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const errors = await admin.rpc('purge_client_errors');
  const reports = await admin.rpc('purge_deleted_account_reports');
  if (errors.error || reports.error) {
    console.error('privacy purge failed');
    return json({ ok: false, code: 'purge' }, 500);
  }
  return json({ ok: true });
});
