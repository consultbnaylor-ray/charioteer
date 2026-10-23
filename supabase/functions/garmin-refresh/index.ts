import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';
import {
  GARMIN_BACKFILL_TYPES,
  bearerForGarminUser,
  garminBackfillUrl,
  garminRefreshCooling,
  type GarminDb,
} from '../_shared/garmin.ts';

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
  const userId = userData.user.id;
  const now = Date.now();
  const clock = await admin.from('garmin_connections').select('last_manual_refresh_at, revoked_at').eq('user_id', userId).maybeSingle();
  if (clock.error) {
    console.error(`garmin-refresh: clock ${clock.error.message.includes('last_manual_refresh_at') ? 'column' : 'read'}`);
    return json({ ok: false, code: 'clock' }, 503);
  }
  const row = clock.data && typeof clock.data === 'object' ? clock.data as Record<string, unknown> : null;
  if (!row || row.revoked_at) return json({ ok: true, garmin: 'off' });
  const lastAt = typeof row.last_manual_refresh_at === 'string' ? row.last_manual_refresh_at : null;
  if (garminRefreshCooling(lastAt, now)) return json({ ok: true, garmin: 'recent' });

  let bearer = '';
  try {
    bearer = await bearerForGarminUser(admin, userId, {
      clientId: (Deno.env.get('GARMIN_CLIENT_ID') ?? '').trim(),
      clientSecret: (Deno.env.get('GARMIN_CLIENT_SECRET') ?? '').trim(),
      tokenKey: (Deno.env.get('GARMIN_TOKEN_KEY') ?? '').trim(),
      now,
    });
  } catch {
    console.error('garmin-refresh: token');
    return json({ ok: false, code: 'token' }, 500);
  }
  if (!bearer) return json({ ok: true, garmin: 'off' });

  const marked = await admin.from('garmin_connections').update({ last_manual_refresh_at: new Date(now).toISOString() }).eq('user_id', userId);
  if (marked.error) {
    console.error('garmin-refresh: clock write');
    return json({ ok: false, code: 'clock' }, 503);
  }

  for (const type of GARMIN_BACKFILL_TYPES) {
    let status = 0;
    try {
      const response = await fetch(garminBackfillUrl(type, now), {
        method: 'GET',
        headers: { Authorization: `Bearer ${bearer}` },
      });
      status = response.status;
    } catch {
      console.error(`garmin-refresh: ${type} 0`);
      return json({ ok: false, code: 'backfill' }, 502);
    }
    console.error(`garmin-refresh: ${type} ${status}`);
    if (status === 202 || status === 409 || status === 204) continue;
    if (status === 400 || status === 403) continue;
    if (status === 429) return json({ ok: false, code: 'rate' }, 429);
    return json({ ok: false, code: 'backfill' }, 502);
  }

  return json({ ok: true, garmin: 'asked' });
});
