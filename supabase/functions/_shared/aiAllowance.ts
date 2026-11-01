import { entitlementActive, type SubscriptionRecord } from './subscriptionRules.ts';
import {
  AI_MAX_TOKENS,
  CRISIS_STATIC_REPLY,
  TIER_LIMITS,
  decideAllowance,
  entitlementEnforced,
  limitReachedMessage,
  londonDayKey,
  londonMonthStart,
  subscriptionRequiredMessage,
  tierForProduct,
  type Tier,
  type UsageKind,
} from './tierLimits.ts';

export { AI_MAX_TOKENS, CRISIS_STATIC_REPLY };

type AdminClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
      };
    };
  };
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }>;
};

export type AiGate =
  | { ok: true; tier: Tier | null; used: number; limit: number }
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
}): Promise<AiGate> {
  const now = input.now ?? new Date();
  const enforced = entitlementEnforced(input.enforcedFlag);
  if (!enforced) return { ok: true, tier: null, used: 0, limit: 0 };

  const sub = await input.admin.from('subscriptions').select('product_id, status, expires_at, is_trial, environment').eq('user_id', input.userId).maybeSingle();
  if (sub.error) return { ok: false, status: 503, body: { ok: false, code: 'usage_unavailable', message: 'Could not check the subscription.' } };
  const row = subscriptionFromGate(sub.data);
  const tier = row && entitlementActive(row, now.getTime()) ? tierForProduct(row.productId) : null;
  if (!tier) {
    if (input.crisis) return { ok: false, status: 200, crisis: true, reply: CRISIS_STATIC_REPLY };
    return { ok: false, status: 402, body: { ok: false, code: 'subscription_required', message: subscriptionRequiredMessage() } };
  }
  const limits = TIER_LIMITS[tier][input.kind];
  const day = londonDayKey(now);
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
    const decision = decideAllowance({
      enforced: true,
      crisis: input.crisis === true,
      tier,
      dayCount: usage.dayCount,
      monthCount: usage.monthCount,
      kind: input.kind,
      now,
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
        message: limitReachedMessage(decision),
      },
    };
  }
  return { ok: true, tier, used: usage.dayCount, limit: limits.day };
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
