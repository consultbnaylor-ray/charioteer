import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';
import { forgetGarminAccount, type GarminDb } from '../_shared/garmin.ts';

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

  const admin = createClient(url, service, { auth: { persistSession: false } }) as unknown as GarminDb;
  try {
    await forgetGarminAccount(admin, userData.user.id, {
      clientId: (Deno.env.get('GARMIN_CLIENT_ID') ?? '').trim(),
      clientSecret: (Deno.env.get('GARMIN_CLIENT_SECRET') ?? '').trim(),
      tokenKey: (Deno.env.get('GARMIN_TOKEN_KEY') ?? '').trim(),
      now: Date.now(),
    });
  } catch {
    console.error('garmin-disconnect: failed');
    return json({ ok: false, code: 'disconnect' }, 500);
  }
  return json({ ok: true });
});
