import { overrideActive, parseEntitlementOverride, tierForAllowance } from './entitlementOverride.ts';
import { aiTierForSubscription, inFreeTrial, type SubscriptionRecord } from './subscriptionRules.ts';
import {
  AI_MAX_TOKENS,
  CRISIS_STATIC_REPLY,
  TIER_LIMITS,
  decideAllowance,
  entitlementEnforcedForUser,
  limitReachedMessage,
  londonDayKey,
  londonMonthStart,
  subscriptionRequiredMessage,
  TRIAL_AI_MESSAGE,
  type Tier,
  type UsageKind,
} from './tierLimits.ts';

export { AI_MAX_TOKENS, CRISIS_STATIC_REPLY };

type DbError = { message?: string } | null;
type UsageRows = PromiseLike<{ data: Record<string, unknown>[] | null; error: DbError }>;
/** Enough of the query builder for the subscription, the comp, and this month's usage rows. */
type FilterChain = {
  maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: DbError }>;
  eq(column: string, value: string): FilterChain;
  gte(column: string, value: string): { lt(column: string, value: string): UsageRows };
};
type AdminClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): FilterChain;
    };
  };
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>;
};

export type AiGate =
  /** counted is false when the use is only checked here and countAiUse records it after a usable answer. */
  | { ok: true; tier: Tier | null; used: number; limit: number; counted: boolean }
  | { ok: false; status: 402 | 429 | 503; body: Record<string, unknown> }
  | { ok: false; status: 200; crisis: true; reply: string };

/**
 * AI_ENTITLEMENT_ENFORCED=false turns the check off so testers are not locked
 * out before the usage migration and the App Store products are live.
 * Any other value, including unset, enforces.
 */
export async function gateAiUse(input: {
  admin: AdminClient;
  userId: string;
  kind: UsageKind;
  crisis?: boolean;
  now?: Date;
  enforcedFlag?: string;
  /** Comma-separated user ids enforced while AI_ENTITLEMENT_ENFORCED is false. */
  allowlist?: string;
  /**
   * 'before' (default) counts the use now, before the model runs.
   * 'after' only checks there is room. The caller counts with countAiUse once the model gave a usable answer,
   * so an outage, a refusal, or a timeout does not use up the allowance.
   */
  countWhen?: 'before' | 'after';
}): Promise<AiGate> {
  const now = input.now ?? new Date();
  const enforced = entitlementEnforcedForUser(input.enforcedFlag, input.userId, input.allowlist);
  if (!enforced) return { ok: true, tier: null, used: 0, limit: 0, counted: false };

  const sub = await input.admin.from('subscriptions').select('product_id, status, expires_at, is_trial, environment').eq('user_id', input.userId).maybeSingle();
  if (sub.error) return { ok: false, status: 503, body: { ok: false, code: 'usage_unavailable', message: 'Could not check the subscription.' } };
  const overrideRes = await input.admin.from('entitlement_overrides').select('tier, expires_at').eq('user_id', input.userId).maybeSingle();
  const override = overrideRes.error ? null : parseEntitlementOverride(overrideRes.data);
  const comp = overrideActive(override, now.getTime());
  const row = subscriptionFromGate(sub.data);
  const storeTier = aiTierForSubscription(row, now.getTime());
  const trialOnly = !comp && inFreeTrial(row, now.getTime());
  const tier = tierForAllowance(override, storeTier, now.getTime());
  if (!tier) {
    if (input.crisis) return { ok: false, status: 200, crisis: true, reply: CRISIS_STATIC_REPLY };
    if (trialOnly) {
      return { ok: false, status: 402, body: { ok: false, code: 'subscription_required', reason: 'trial', message: TRIAL_AI_MESSAGE } };
    }
    return { ok: false, status: 402, body: { ok: false, code: 'subscription_required', message: subscriptionRequiredMessage() } };
  }
  const limits = TIER_LIMITS[tier][input.kind];
  const day = londonDayKey(now);
  if (input.countWhen === 'after') {
    const usage = await readUsage(input.admin, input.userId, input.kind, day);
    if (!usage) return { ok: false, status: 503, body: { ok: false, code: 'usage_unavailable', message: 'Usage limits are not ready yet.' } };
    if (usage.dayCount < limits.day && usage.monthCount < limits.month) {
      return { ok: true, tier, used: usage.dayCount, limit: limits.day, counted: false };
    }
    return refusal({ tier, kind: input.kind, crisis: input.crisis === true, comp: comp != null, now, ...usage });
  }
  const counted = await input.admin.rpc('increment_ai_usage', {
    p_user_id: input.userId,
    p_kind: input.kind,
    p_day: day,
    p_month_start: londonMonthStart(day),
    p_day_limit: limits.day,
    p_month_limit: limits.month,
  });
  if (counted.error) {
    return { ok: false, status: 503, body: { ok: false, code: 'usage_unavailable', message: 'Usage limits are not ready yet.' } };
  }
  const usage = firstUsageRow(counted.data);
  if (!usage.allowed) {
    return refusal({ tier, kind: input.kind, crisis: input.crisis === true, comp: comp != null, now, dayCount: usage.dayCount, monthCount: usage.monthCount });
  }
  return { ok: true, tier, used: usage.dayCount, limit: limits.day, counted: true };
}

/** The 429 (or crisis reply) for a person with a plan who has no room left. */
function refusal(input: {
  tier: Tier;
  kind: UsageKind;
  crisis: boolean;
  comp: boolean;
  now: Date;
  dayCount: number;
  monthCount: number;
}): AiGate {
  const decision = decideAllowance({
    enforced: true,
    crisis: input.crisis,
    tier: input.tier,
    dayCount: input.dayCount,
    monthCount: input.monthCount,
    kind: input.kind,
    now: input.now,
  });
  if (decision.action === 'crisis_static') return { ok: false, status: 200, crisis: true, reply: CRISIS_STATIC_REPLY };
  if (decision.action !== 'limit_reached') {
    return { ok: false, status: 503, body: { ok: false, code: 'usage_unavailable', message: 'Usage limits are not ready yet.' } };
  }
  return {
    ok: false,
    status: 429,
    body: {
      ok: false,
      code: 'limit_reached',
      tier: decision.tier,
      kind: input.kind,
      limit: decision.limit,
      used: decision.used,
      window: decision.window,
      resets_at: decision.resetsAt,
      message: input.comp
        ? limitReachedMessage({ ...decision, kind: input.kind }).replace(/\s*Upgrade to [^.]+\./g, '').trim()
        : limitReachedMessage({ ...decision, kind: input.kind }),
    },
  };
}

/** Today's count and this month's total, read without changing them. Null when the read fails. */
async function readUsage(admin: AdminClient, userId: string, kind: UsageKind, day: string): Promise<{ dayCount: number; monthCount: number } | null> {
  const start = londonMonthStart(day);
  const res = await admin.from('ai_usage').select('day, count').eq('user_id', userId).eq('kind', kind).gte('day', start).lt('day', nextMonthStart(start));
  if (res.error || !Array.isArray(res.data)) return null;
  let dayCount = 0;
  let monthCount = 0;
  for (const row of res.data) {
    const count = typeof row.count === 'number' ? row.count : 0;
    monthCount += count;
    if (row.day === day) dayCount += count;
  }
  return { dayCount, monthCount };
}

function nextMonthStart(monthStart: string): string {
  const [year, month] = monthStart.split('-').map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

/** Request ids already counted by this worker. A retry of an answered request is not counted twice. */
const countedRequests = new Map<string, number>();
const COUNTED_REQUEST_TTL_MS = 10 * 60_000;

/** Forget the remembered request ids. For tests. */
export function resetCountedRequests(): void {
  countedRequests.clear();
}

/**
 * Count one use after the model gave a usable answer (see gateAiUse countWhen 'after').
 * The same request id is counted once, so the phone's automatic retries cost one credit.
 * Returns whether a count was written. A failed count does not take the answer away.
 */
export async function countAiUse(input: {
  admin: AdminClient;
  userId: string;
  kind: UsageKind;
  tier: Tier | null;
  requestId?: string;
  now?: Date;
}): Promise<boolean> {
  if (!input.tier) return false;
  const nowMs = (input.now ?? new Date()).getTime();
  for (const [key, at] of countedRequests) {
    if (nowMs - at > COUNTED_REQUEST_TTL_MS) countedRequests.delete(key);
  }
  const key = input.requestId ? `${input.userId}:${input.kind}:${input.requestId}` : '';
  if (key && countedRequests.has(key)) return false;
  if (key) countedRequests.set(key, nowMs);
  const day = londonDayKey(input.now ?? new Date());
  const limits = TIER_LIMITS[input.tier][input.kind];
  // The allowance was checked before the call. The limits here only stop the count going past the plan.
  const counted = await input.admin.rpc('increment_ai_usage', {
    p_user_id: input.userId,
    p_kind: input.kind,
    p_day: day,
    p_month_start: londonMonthStart(day),
    p_day_limit: limits.day,
    p_month_limit: limits.month,
  });
  if (counted.error) {
    if (key) countedRequests.delete(key);
    return false;
  }
  return firstUsageRow(counted.data).allowed;
}

function subscriptionFromGate(row: Record<string, unknown> | null): SubscriptionRecord | null {
  if (!row || typeof row.product_id !== 'string' || typeof row.status !== 'string' || typeof row.environment !== 'string') return null;
  return {
    productId: row.product_id,
    status: row.status as SubscriptionRecord['status'],
    expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null,
    isTrial: row.is_trial === true,
    environment: row.environment as SubscriptionRecord['environment'],
  };
}

function firstUsageRow(data: unknown): { allowed: boolean; dayCount: number; monthCount: number } {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return { allowed: false, dayCount: 0, monthCount: 0 };
  const record = row as { allowed?: unknown; day_count?: unknown; month_count?: unknown };
  return {
    allowed: record.allowed === true,
    dayCount: typeof record.day_count === 'number' ? record.day_count : 0,
    monthCount: typeof record.month_count === 'number' ? record.month_count : 0,
  };
}

/** The day count returned after a successful increment, for the coach meter. */
export function usageMeter(kind: UsageKind, tier: Tier, dayCount: number): { kind: UsageKind; used: number; limit: number } {
  return { kind, used: dayCount, limit: TIER_LIMITS[tier][kind].day };
}
