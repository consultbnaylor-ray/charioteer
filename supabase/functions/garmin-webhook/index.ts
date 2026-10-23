import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';
import {
  activityRowsFor,
  dailyRowsFor,
  deleteGarminRows,
  mapGarminPush,
  sleepRowsFor,
  userMetricRowsFor,
  webhookGate,
  webhookPathSecret,
  type GarminDb,
} from '../_shared/garmin.ts';

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ ok: false, code: 'method' }, 405);

  const url = new URL(req.url);
  const gate = webhookGate(
    req.headers.get('Authorization'),
    url.searchParams.get('token'),
    Deno.env.get('GARMIN_WEBHOOK_SECRET'),
    {
      path: webhookPathSecret(url.pathname),
      clientIdHeader: req.headers.get('garmin-client-id'),
      clientId: Deno.env.get('GARMIN_CLIENT_ID'),
    },
  );
  if (!gate.ok) {
    console.error(gate.log);
    return json({ ok: false, code: gate.status === 503 ? 'config' : 'unauthorised' }, gate.status);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !service) return json({ ok: false, code: 'config' }, 500);

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, code: 'body' }, 400);
  const plan = mapGarminPush(body);
  const admin = createClient(supabaseUrl, service, { auth: { persistSession: false } }) as unknown as GarminDb;
  const garminIds = [
    ...plan.dailies.map((row) => row.garminUserId),
    ...plan.activities.map((row) => row.garminUserId),
    ...plan.sleep.map((row) => row.garminUserId),
    ...plan.userMetrics.map((row) => row.garminUserId),
    ...plan.deregistered,
    ...plan.permissionChanges.map((row) => row.garminUserId),
  ];
  const userIdByGarmin = await loadUsers(admin, [...new Set(garminIds)]);

  const dailies = dailyRowsFor(plan, userIdByGarmin);
  const activities = activityRowsFor(plan, userIdByGarmin);
  const sleep = sleepRowsFor(plan, userIdByGarmin);
  const metrics = userMetricRowsFor(plan, userIdByGarmin);
  if (dailies.length) {
    const saved = await admin.from('garmin_dailies').upsert(dailies, { onConflict: 'user_id,calendar_date' });
    if (saved.error) return json({ ok: false, code: 'daily' }, 500);
  }
  if (activities.length) {
    const saved = await admin.from('garmin_activities').upsert(activities, { onConflict: 'user_id,summary_id' });
    if (saved.error) return json({ ok: false, code: 'activity' }, 500);
  }
  if (sleep.length) {
    const saved = await admin.from('garmin_sleep').upsert(sleep, { onConflict: 'user_id,summary_id' });
    if (saved.error) return json({ ok: false, code: 'sleep' }, 500);
  }
  if (metrics.length) {
    const saved = await admin.from('garmin_user_metrics').upsert(metrics, { onConflict: 'user_id,summary_id' });
    if (saved.error) return json({ ok: false, code: 'metrics' }, 500);
  }

  for (const garminUserId of plan.deregistered) {
    const userId = userIdByGarmin.get(garminUserId);
    if (userId) await deleteGarminRows(admin, userId);
  }

  for (const change of plan.permissionChanges) {
    const userId = userIdByGarmin.get(change.garminUserId);
    if (!userId) continue;
    const saved = await admin.from('garmin_connections').update({ permissions: change.permissions }).eq('user_id', userId);
    if (saved.error) return json({ ok: false, code: 'permissions' }, 500);
    const named = change.permissions.split(' ').filter(Boolean);
    const keepsSummaries = named.includes('HEALTH_EXPORT') || named.includes('ACTIVITY_EXPORT');
    if (!keepsSummaries) {
      await admin.from('garmin_dailies').delete().eq('user_id', userId);
      await admin.from('garmin_activities').delete().eq('user_id', userId);
      await admin.from('garmin_sleep').delete().eq('user_id', userId);
      await admin.from('garmin_user_metrics').delete().eq('user_id', userId);
    }
  }

  return json({ ok: true });
});

async function loadUsers(admin: GarminDb, garminIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!garminIds.length) return map;
  const found = await admin
    .from('garmin_connections')
    .select('user_id, garmin_user_id, revoked_at')
    .in('garmin_user_id', garminIds);
  if (found.error || !Array.isArray(found.data)) return map;
  for (const row of found.data) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    if (record.revoked_at) continue;
    const garminUserId = typeof record.garmin_user_id === 'string' ? record.garmin_user_id : '';
    const userId = typeof record.user_id === 'string' ? record.user_id : '';
    if (garminUserId && userId) map.set(garminUserId, userId);
  }
  return map;
}
