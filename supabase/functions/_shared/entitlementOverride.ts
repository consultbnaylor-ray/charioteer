import type { Tier } from './tierLimits.ts';

/** A comp granted in the database. A null expiry does not run out. */
export type EntitlementOverride = {
  tier: Tier;
  expiresAt: string | null;
};

export function parseEntitlementOverride(row: Record<string, unknown> | null): EntitlementOverride | null {
  if (!row) return null;
  const tier = row.tier;
  if (tier !== 'standard' && tier !== 'pro' && tier !== 'max') return null;
  const expires = row.expires_at;
  return {
    tier,
    expiresAt: typeof expires === 'string' && expires.trim() ? expires : null,
  };
}

/** Lifetime rows stay on. A dated row is on until that instant. */
export function overrideActive(row: EntitlementOverride | null, now = Date.now()): boolean {
  if (!row) return false;
  if (row.expiresAt == null) return true;
  const expires = Date.parse(row.expiresAt);
  return Number.isFinite(expires) && expires > now;
}

/** An active comp replaces the App Store tier. Otherwise the store tier stands. */
export function tierForAllowance(
  override: EntitlementOverride | null,
  subscriptionTier: Tier | null,
  now = Date.now(),
): Tier | null {
  if (overrideActive(override, now) && override) return override.tier;
  return subscriptionTier;
}
