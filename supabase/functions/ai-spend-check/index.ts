import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';

import {
  dueSpendAlert,
  parseBudgetUsd,
  spendAlertText,
  utcMonthStart,
  xaiUsageRequest,
  xaiUsageTotalUsd,
} from '../_shared/aiSpend.ts';
import { json, preflight } from '../_shared/http.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MANAGEMENT_URL = 'https://management-api.x.ai';

/**
 * Compares this month's AI spend with the budget and sends Ben a push at 70% and 90%.
 * Call it hourly (for example a Supabase scheduled function or pg_cron with pg_net),
 * with header x-ai-spend-secret set to AI_SPEND_CHECK_SECRET.
 *
 * Secrets:
 *   AI_SPEND_CHECK_SECRET   required, shared with the scheduler
 *   AI_MONTHLY_BUDGET_USD   required, for example 20
 *   AI_SPEND_ALERT_USER_ID  required, Ben's user id: the push goes to his registered devices
 *   XAI_MANAGEMENT_KEY and XAI_TEAM_ID   optional. When both are set, spend is read from xAI's
 *   Management API (the real bill). Otherwise it is the sum of ai_spend_log, which is the
 *   cost xAI reported on each answered call.
 */
Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST' && req.method !== 'GET') return json({ ok: false, code: 'method' }, 405);

  const secret = Deno.env.get('AI_SPEND_CHECK_SECRET');
  if (!secret || req.headers.get('x-ai-spend-secret') !== secret) {
    console.error('ai-spend-check: refused, secret missing or wrong');
    return json({ ok: false, code: 'unauthorised' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const budget = parseBudgetUsd(Deno.env.get('AI_MONTHLY_BUDGET_USD'));
  const alertUserId = Deno.env.get('AI_SPEND_ALERT_USER_ID');
  if (!url || !service) return json({ ok: false, code: 'config' }, 500);
  if (!budget || !alertUserId) {
    console.error('ai-spend-check: AI_MONTHLY_BUDGET_USD or AI_SPEND_ALERT_USER_ID is not set');
    return json({ ok: false, code: 'not_configured' }, 503);
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const now = new Date();
  const month = utcMonthStart(now);

  const logged = await admin.rpc('ai_spend_month', { p_month_start: month });
  const loggedRow = Array.isArray(logged.data) ? logged.data[0] : logged.data;
  const loggedUsd = logged.error || !loggedRow ? null : Number((loggedRow as { cost_usd?: unknown }).cost_usd);

  const billedUsd = await readXaiSpend(now);
  const spend = billedUsd ?? (loggedUsd != null && Number.isFinite(loggedUsd) ? loggedUsd : null);
  if (spend == null) {
    console.error('ai-spend-check: no spend figure', logged.error?.message ?? 'rpc empty');
    return json({ ok: false, code: 'no_spend' }, 503);
  }
  const source = billedUsd != null ? 'xai' : 'log';

  const sentRes = await admin.from('ai_spend_alerts').select('threshold').eq('month', month);
  if (sentRes.error) {
    console.error('ai-spend-check: alerts table', sentRes.error.message);
    return json({ ok: false, code: 'alerts_unavailable' }, 503);
  }
  const alreadySent = (sentRes.data ?? []).map((row: { threshold: number }) => row.threshold);
  const due = dueSpendAlert(spend, budget, alreadySent);
  const summary = { spendUsd: Number(spend.toFixed(2)), budgetUsd: budget, percent: Math.round((spend / budget) * 100), source };
  if (due.send == null) return json({ ok: true, alerted: null, ...summary });

  const claimed = await admin.from('ai_spend_alerts').insert(due.mark.map((threshold) => ({
    month,
    threshold,
    spend_usd: Number(spend.toFixed(2)),
    budget_usd: budget,
  })));
  if (claimed.error) {
    // Another run took it first, or the table is not there. Either way no second push.
    console.error('ai-spend-check: claim', claimed.error.message);
    return json({ ok: true, alerted: null, ...summary });
  }

  const delivered = await pushToBen(admin, alertUserId, spendAlertText(due.send, spend, budget));
  if (!delivered) {
    await admin.from('ai_spend_alerts').delete().eq('month', month).in('threshold', due.mark);
    return json({ ok: false, code: 'push', ...summary }, 502);
  }
  console.error(`AI_SPEND_ALERT ${due.send}% spend=${summary.spendUsd} budget=${budget} source=${source}`);
  return json({ ok: true, alerted: due.send, ...summary });
});

/** Month-to-date cost from xAI's Management API, or null when it is not set up or did not answer. */
async function readXaiSpend(now: Date): Promise<number | null> {
  const key = Deno.env.get('XAI_MANAGEMENT_KEY');
  const team = Deno.env.get('XAI_TEAM_ID');
  if (!key || !team) return null;
  try {
    const response = await fetch(`${MANAGEMENT_URL}/v1/billing/teams/${encodeURIComponent(team)}/usage`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(xaiUsageRequest(now)),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error('ai-spend-check: management API HTTP', response.status);
      return null;
    }
    return xaiUsageTotalUsd(await response.json());
  } catch {
    console.error('ai-spend-check: management API unreachable');
    return null;
  }
}

async function pushToBen(
  admin: SupabaseClient,
  userId: string,
  message: { title: string; body: string },
): Promise<boolean> {
  const tokens = await admin.from('device_tokens').select('expo_push_token').eq('user_id', userId);
  if (tokens.error) return false;
  const targets = (tokens.data ?? []).map((row: { expo_push_token: string }) => row.expo_push_token).filter(Boolean);
  if (!targets.length) {
    console.error('ai-spend-check: no registered device for the alert user');
    return false;
  }
  try {
    const sent = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(targets.map((to) => ({ to, title: message.title, body: message.body, sound: 'default' }))),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await sent.json().catch(() => null) as { data?: { status?: string }[] } | null;
    return sent.ok && Boolean(result?.data?.some((ticket) => ticket.status === 'ok'));
  } catch {
    return false;
  }
}
