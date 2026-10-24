import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json, preflight } from '../_shared/http.ts';
import {
  activityRowsFor,
  dailyRowsFor,
  dedupeBy,
  deleteGarminRows,
  hrvRowsFor,
  mapGarminPush,
  missingRelation,
  preferLargerDuration,
  preferLast,
  pulseOxRowsFor,
  respirationRowsFor,
  sleepRowsFor,
  userMetricRowsFor,
  webhookGate,
  webhookPathSecret,
  type GarminDb,
} from '../_shared/garmin.ts';

const DAILY_BASE = [
  'user_id',
  'calendar_date',
  'resting_heart_rate_bpm',
  'average_heart_rate_bpm',
  'moderate_minutes',
  'vigorous_minutes',
  'active_kilocalories',
] as const;

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
    ...plan.respiration.map((row) => row.garminUserId),
    ...plan.pulseOx.map((row) => row.garminUserId),
    ...plan.hrv.map((row) => row.garminUserId),
    ...plan.deregistered,
    ...plan.permissionChanges.map((row) => row.garminUserId),
  ];
  const userIdByGarmin = await loadUsers(admin, [...new Set(garminIds)]);

  const dailies = dedupeBy(
    dailyRowsFor(plan, userIdByGarmin),
    (row) => `${String(row.user_id)}:${String(row.calendar_date)}`,
    preferLargerDuration,
  );
  const activities = dedupeBy(
    activityRowsFor(plan, userIdByGarmin),
    (row) => `${String(row.user_id)}:${String(row.summary_id)}`,
    preferLast,
  );
  const sleep = dedupeBy(
    sleepRowsFor(plan, userIdByGarmin),
    (row) => `${String(row.user_id)}:${String(row.summary_id)}`,
    preferLast,
  );
  const metrics = dedupeBy(
    userMetricRowsFor(plan, userIdByGarmin),
    (row) => `${String(row.user_id)}:${String(row.summary_id)}`,
    preferLast,
  );
  const respiration = dedupeBy(
    respirationRowsFor(plan, userIdByGarmin),
    (row) => `${String(row.user_id)}:${String(row.summary_id)}`,
    preferLast,
  );
  const pulseOx = dedupeBy(
    pulseOxRowsFor(plan, userIdByGarmin),
    (row) => `${String(row.user_id)}:${String(row.summary_id)}`,
    preferLast,
  );
  const hrv = dedupeBy(
    hrvRowsFor(plan, userIdByGarmin),
    (row) => `${String(row.user_id)}:${String(row.summary_id)}`,
    preferLast,
  );
  if (!(await saveRows(admin, 'garmin_dailies', dailies, { onConflict: 'user_id,calendar_date' }))) {
    return json({ ok: false, code: 'daily' }, 500);
  }
  if (!(await saveRows(admin, 'garmin_activities', activities, { onConflict: 'user_id,summary_id' }))) {
    return json({ ok: false, code: 'activity' }, 500);
  }
  if (!(await saveRows(admin, 'garmin_sleep', sleep, { onConflict: 'user_id,summary_id' }))) {
    return json({ ok: false, code: 'sleep' }, 500);
  }
  if (!(await saveRows(admin, 'garmin_user_metrics', metrics, { onConflict: 'user_id,summary_id' }))) {
    return json({ ok: false, code: 'metrics' }, 500);
  }
  if (!(await saveRows(admin, 'garmin_respiration', respiration, { onConflict: 'user_id,summary_id' }, true))) {
    return json({ ok: false, code: 'respiration' }, 500);
  }
  if (!(await saveRows(admin, 'garmin_pulse_ox', pulseOx, { onConflict: 'user_id,summary_id' }, true))) {
    return json({ ok: false, code: 'pulseox' }, 500);
  }
  if (!(await saveRows(admin, 'garmin_hrv', hrv, { onConflict: 'user_id,summary_id' }, true))) {
    return json({ ok: false, code: 'hrv' }, 500);
  }
  await noteGarminPush(admin, [...dailies, ...activities, ...sleep, ...metrics, ...respiration, ...pulseOx, ...hrv]);

  for (const garminUserId of plan.deregistered) {
    const userId = userIdByGarmin.get(garminUserId);
    if (userId) await deleteGarminRows(admin, userId);
  }

  for (const change of plan.permissionChanges) {
    const userId = userIdByGarmin.get(change.garminUserId);
    if (!userId) continue;
    let saved = await admin.from('garmin_connections').update({
      permissions: change.permissions,
      permissions_checked_at: new Date().toISOString(),
    }).eq('user_id', userId);
    if (saved.error?.message.includes('permissions_checked_at')) {
      saved = await admin.from('garmin_connections').update({ permissions: change.permissions }).eq('user_id', userId);
    }
    if (saved.error) {
      console.error('garmin-webhook: permissions');
      return json({ ok: false, code: 'permissions' }, 500);
    }
    const named = change.permissions.split(' ').filter(Boolean);
    const keepsSummaries = named.includes('HEALTH_EXPORT') || named.includes('ACTIVITY_EXPORT');
    if (!keepsSummaries) {
      await admin.from('garmin_dailies').delete().eq('user_id', userId);
      await admin.from('garmin_activities').delete().eq('user_id', userId);
      await admin.from('garmin_sleep').delete().eq('user_id', userId);
      await admin.from('garmin_user_metrics').delete().eq('user_id', userId);
      await admin.from('garmin_respiration').delete().eq('user_id', userId);
      await admin.from('garmin_pulse_ox').delete().eq('user_id', userId);
      await admin.from('garmin_hrv').delete().eq('user_id', userId);
    }
  }

  return json({ ok: true });
});

async function saveRows(
  admin: GarminDb,
  table: string,
  rows: Record<string, unknown>[],
  conflict: { onConflict: string },
  optional = false,
): Promise<boolean> {
  if (!rows.length) return true;
  let saved = await admin.from(table).upsert(rows, conflict);
  if (saved.error && table === 'garmin_dailies' && columnMissing(saved.error.message)) {
    const base = rows.map((row) => {
      const next: Record<string, unknown> = {};
      for (const key of DAILY_BASE) next[key] = row[key] ?? null;
      return next;
    });
    saved = await admin.from(table).upsert(base, conflict);
  }
  if (!saved.error) return true;
  console.error(`garmin-webhook: ${table} ${sqlState(saved.error)} ${rows.length}`);
  if (optional && missingRelation(saved.error.message)) return true;
  return false;
}

function columnMissing(message: string): boolean {
  return /does not exist|schema cache|could not find/i.test(message);
}

function sqlState(error: { code?: string; message?: string }): string {
  if (error.code && /^[0-9A-Z]{5}$/.test(error.code)) return error.code;
  return error.message?.match(/\b[0-9A-Z]{5}\b/)?.[0] ?? 'unknown';
}

async function noteGarminPush(admin: GarminDb, rows: Record<string, unknown>[]): Promise<void> {
  const userIds = new Set<string>();
  for (const row of rows) {
    if (typeof row.user_id === 'string' && row.user_id) userIds.add(row.user_id);
  }
  const at = new Date().toISOString();
  for (const userId of userIds) {
    const stamped = await admin.from('garmin_connections').update({ last_push_at: at }).eq('user_id', userId);
    if (stamped.error && !stamped.error.message.includes('last_push_at')) console.error('garmin-webhook: push clock');
  }
}

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
