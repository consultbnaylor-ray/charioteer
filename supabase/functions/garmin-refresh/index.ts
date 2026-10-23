import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';
import {
  bearerForGarminUser,
  garminBackfillDecision,
  garminBackfillTypes,
  garminBackfillUrl,
  garminBackfillWindow,
  garminAllHistoricalRefusal,
  garminHistoryBody,
  garminHistoryCooling,
  garminMissingPermissions,
  garminPermissionCheckDue,
  garminRefreshCooling,
  readGarminPermissions,
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

  const body: unknown = await req.json().catch(() => null);
  const permissionCheck = refreshAsksPermissions(body);
  const force = refreshForcesPermissions(body);
  const admin = createClient(url, service, { auth: { persistSession: false } }) as unknown as GarminDb;
  const userId = userData.user.id;
  const now = Date.now();
  const clock = await loadConnection(admin, userId);
  if (clock.error) {
    console.error(`garmin-refresh: clock ${clock.error.message.includes('last_manual_refresh_at') ? 'column' : 'read'}`);
    return json({ ok: false, code: 'clock' }, 503);
  }
  const row = clock.data && typeof clock.data === 'object' ? clock.data as Record<string, unknown> : null;
  if (!row || row.revoked_at) return json({ ok: true, garmin: 'off' });
  const checkedAt = typeof row.permissions_checked_at === 'string' ? row.permissions_checked_at : null;
  if (permissionCheck && !force && !garminPermissionCheckDue(checkedAt, now)) {
    return json({ ok: true, garmin: 'permissions', checked: false });
  }
  const historyAt = typeof row.history_backfill_refused_at === 'string' ? row.history_backfill_refused_at : null;
  if (!permissionCheck && garminHistoryCooling(historyAt, now)) return json(garminHistoryBody(), 200);

  const lastAt = typeof row.last_manual_refresh_at === 'string' ? row.last_manual_refresh_at : null;
  if (!permissionCheck && garminRefreshCooling(lastAt, now)) return json({ ok: true, garmin: 'recent' });

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

  const lookedUp = await readGarminPermissions(bearer);
  const stored = typeof row.permissions === 'string' ? row.permissions : null;
  await rememberPermissions(admin, userId, lookedUp, now);
  if (permissionCheck) {
    const missing = garminMissingPermissions(lookedUp != null ? lookedUp : stored);
    return json({ ok: true, garmin: 'permissions', checked: true, needsPermissions: missing.length > 0, missing });
  }

  const permissions = lookedUp != null ? lookedUp : null;
  const effective = lookedUp != null ? lookedUp : stored;
  const missing = garminMissingPermissions(effective);
  const connectedAt = typeof row.connected_at === 'string' ? row.connected_at : null;
  const window = garminBackfillWindow(connectedAt, now);
  const types = garminBackfillTypes(permissions);
  if (!window) return json({ ok: true, garmin: 'recent' });
  if (types.length === 0) return json({ ok: false, code: 'permission', missing }, 200);

  const statuses: number[] = [];
  for (const type of types) {
    let status = 0;
    try {
      const response = await fetch(garminBackfillUrl(type, window.start, window.end), {
        method: 'GET',
        headers: { Authorization: `Bearer ${bearer}` },
      });
      status = response.status;
    } catch {
      status = 0;
    }
    console.error(`garmin-refresh: ${type} ${status}`);
    statuses.push(status);
    if (status === 429) break;
  }

  const decision = garminBackfillDecision(statuses);
  if (garminAllHistoricalRefusal(statuses) && missing.length === 0) {
    await rememberHistoryRefusal(admin, userId, now);
    return json(garminHistoryBody(), 200);
  }
  if (decision.accepted) {
    const marked = await admin.from('garmin_connections').update({ last_manual_refresh_at: new Date(now).toISOString() }).eq('user_id', userId);
    if (marked.error) {
      console.error('garmin-refresh: clock write');
      return json({ ok: false, code: 'clock' }, 503);
    }
  }
  if (decision.code === 'asked') return json({ ok: true, garmin: 'asked' });
  if (decision.code === 'rate') return json({ ok: false, code: 'rate' }, 200);
  if (decision.code === 'permission') return json({ ok: false, code: 'permission', missing }, 200);
  return json({ ok: false, code: 'backfill' }, 502);
});

function refreshAsksPermissions(body: unknown): boolean {
  return Boolean(body && typeof body === 'object' && !Array.isArray(body) && (body as { check?: unknown }).check === 'permissions');
}

function refreshForcesPermissions(body: unknown): boolean {
  return Boolean(body && typeof body === 'object' && !Array.isArray(body) && (body as { force?: unknown }).force === true);
}

async function loadConnection(admin: GarminDb, userId: string) {
  const rich = 'last_manual_refresh_at, revoked_at, connected_at, permissions, permissions_checked_at, history_backfill_refused_at';
  let clock = await admin.from('garmin_connections').select(rich).eq('user_id', userId).maybeSingle();
  if (clock.error?.message.includes('history_backfill_refused_at')) {
    clock = await admin.from('garmin_connections').select('last_manual_refresh_at, revoked_at, connected_at, permissions, permissions_checked_at').eq('user_id', userId).maybeSingle();
  }
  if (clock.error?.message.includes('permissions_checked_at')) {
    return admin.from('garmin_connections').select('last_manual_refresh_at, revoked_at, connected_at, permissions').eq('user_id', userId).maybeSingle();
  }
  return clock;
}

async function rememberHistoryRefusal(admin: GarminDb, userId: string, now: number): Promise<void> {
  const stamped = await admin.from('garmin_connections').update({ history_backfill_refused_at: new Date(now).toISOString() }).eq('user_id', userId);
  if (stamped.error && !stamped.error.message.includes('history_backfill_refused_at')) console.error('garmin-refresh: history');
}

async function rememberPermissions(admin: GarminDb, userId: string, lookedUp: string | null, now: number): Promise<void> {
  if (lookedUp != null) {
    const saved = await admin.from('garmin_connections').update({ permissions: lookedUp }).eq('user_id', userId);
    if (saved.error) console.error('garmin-refresh: permissions');
  }
  const stamped = await admin.from('garmin_connections').update({ permissions_checked_at: new Date(now).toISOString() }).eq('user_id', userId);
  if (stamped.error && !stamped.error.message.includes('permissions_checked_at')) console.error('garmin-refresh: permissions');
}
