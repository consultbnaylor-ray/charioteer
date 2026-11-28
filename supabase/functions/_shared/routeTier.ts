/**
 * The person's plan for route length: an active store subscription (a free trial counts as Standard),
 * or a comp in entitlement_overrides. No plan is treated as Standard by the caller.
 */
import { parseEntitlementOverride, tierForAllowance } from './entitlementOverride.ts';
import { storeTierForSubscription, type StoreEnvironment, type SubscriptionRecord, type SubscriptionStatus } from './subscriptionRules.ts';
import type { Tier } from './tierLimits.ts';

type Lookup = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
      };
    };
  };
};

const STATUSES = new Set(['active', 'grace', 'billing_retry', 'cancelled', 'revoked', 'expired']);
const ENVIRONMENTS = new Set(['Sandbox', 'Production', 'Xcode']);

function subscriptionRow(data: Record<string, unknown> | null): SubscriptionRecord | null {
  if (!data) return null;
  const status = data.status;
  const environment = data.environment;
  if (typeof data.product_id !== 'string') return null;
  if (typeof status !== 'string' || !STATUSES.has(status)) return null;
  if (typeof environment !== 'string' || !ENVIRONMENTS.has(environment)) return null;
  return {
    productId: data.product_id,
    status: status as SubscriptionStatus,
    expiresAt: typeof data.expires_at === 'string' ? data.expires_at : null,
    isTrial: data.is_trial === true,
    environment: environment as StoreEnvironment,
  };
}

export async function resolveRouteTier(
  admin: Lookup | null,
  userId: string,
  now = Date.now(),
): Promise<Tier | null> {
  if (!admin || !userId) return null;
  try {
    const sub = await admin.from('subscriptions').select('product_id, status, expires_at, is_trial, environment').eq('user_id', userId).maybeSingle();
    const overrideRes = await admin.from('entitlement_overrides').select('tier, expires_at').eq('user_id', userId).maybeSingle();
    const override = overrideRes.error ? null : parseEntitlementOverride(overrideRes.data);
    const row = sub.error ? null : subscriptionRow(sub.data);
    const storeTier = storeTierForSubscription(row, now);
    return tierForAllowance(override, storeTier, now);
  } catch {
    return null;
  }
}
