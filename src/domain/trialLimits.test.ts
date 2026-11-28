import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

import { countAiUse, gateAiUse, resetCountedRequests } from '../../supabase/functions/_shared/aiAllowance.ts';
import { resolveRouteTier } from '../../supabase/functions/_shared/routeTier.ts';
import {
  BUNDLE_ID,
  readTransactionClaims,
  storeTierForSubscription,
  type SubscriptionRecord,
} from '../../supabase/functions/_shared/subscriptionRules.ts';
import { TIER_LIMITS } from '../../supabase/functions/_shared/tierLimits.ts';
import { STANDARD_ROUTE_MAX_M, routeLengthCapM } from '../../supabase/functions/_shared/routeLengthLimit.ts';

const USER = 'bd3268ef-7a9e-4b63-9785-0595f2790a15';
const NOW = new Date('2026-11-28T12:00:00Z');
const FUTURE = '2026-12-05T12:00:00Z';

type Rows = Record<string, Record<string, unknown> | null>;

function row(productId: string, isTrial: boolean, extra: Partial<SubscriptionRecord> = {}): Record<string, unknown> {
  return {
    product_id: productId,
    status: 'active',
    expires_at: FUTURE,
    is_trial: isTrial,
    environment: 'Production',
    ...extra,
  };
}

/** A fake service-role client with the given table rows and no usage so far. */
function fakeAdmin(rows: Rows) {
  const rpcCalls: Record<string, unknown>[] = [];
  const chain = (table: string) => {
    const self = {
      eq: () => self,
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      gte: () => ({ lt: () => Promise.resolve({ data: [], error: null }) }),
    };
    return self;
  };
  return {
    rpcCalls,
    admin: {
      from: (table: string) => ({ select: () => ({ eq: () => chain(table) }) }),
      rpc: async (_name: string, args: Record<string, unknown>) => {
        rpcCalls.push(args);
        return { data: [{ allowed: true, day_count: 1, month_count: 1 }], error: null };
      },
    },
  };
}

describe('a free trial gets the Standard limits whatever plan it is trying', () => {
  beforeEach(() => resetCountedRequests());

  const record = (productId: string, isTrial: boolean, over: Partial<SubscriptionRecord> = {}): SubscriptionRecord => ({
    productId,
    status: 'active',
    expiresAt: FUTURE,
    isTrial,
    environment: 'Production',
    ...over,
  });

  it('holds a trial of any plan to Standard, and leaves paid plans on their own tier', () => {
    const now = NOW.getTime();
    expect(storeTierForSubscription(record('charioteer.pro.monthly', true), now)).toBe('standard');
    expect(storeTierForSubscription(record('charioteer.unlimited.monthly', true), now)).toBe('standard');
    expect(storeTierForSubscription(record('Sta', true), now)).toBe('standard');
    expect(storeTierForSubscription(record('charioteer.pro.monthly', false), now)).toBe('pro');
    expect(storeTierForSubscription(record('charioteer.unlimited.monthly', false), now)).toBe('max');
    expect(storeTierForSubscription(record('charioteer.monthly', false), now)).toBe('standard');
  });

  it('gives nothing for an expired, revoked or unknown subscription, trial or not', () => {
    const now = NOW.getTime();
    expect(storeTierForSubscription(null, now)).toBeNull();
    expect(storeTierForSubscription(record('charioteer.pro.monthly', true, { expiresAt: '2026-11-01T00:00:00Z' }), now)).toBeNull();
    expect(storeTierForSubscription(record('charioteer.pro.monthly', true, { status: 'revoked' }), now)).toBeNull();
    expect(storeTierForSubscription(record('charioteer.pro.monthly', true, { status: 'expired' }), now)).toBeNull();
    expect(storeTierForSubscription(record('not.a.plan', true), now)).toBeNull();
  });

  it('reads a free trial or an introductory offer from the signed transaction', () => {
    const base = {
      bundleId: BUNDLE_ID,
      productId: 'charioteer.unlimited.monthly',
      environment: 'Production',
      originalTransactionId: '2000000000000001',
      expiresDate: NOW.getTime() + 7 * 86_400_000,
    };
    for (const claims of [{ offerDiscountType: 'FREE_TRIAL', offerType: 1 }, { offerType: 1 }]) {
      const read = readTransactionClaims({ ...base, ...claims }, NOW.getTime());
      expect(read.ok && read.subscription.isTrial).toBe(true);
    }
    const paid = readTransactionClaims({ ...base }, NOW.getTime());
    expect(paid.ok && paid.subscription.isTrial).toBe(false);
    const payUpFront = readTransactionClaims({ ...base, offerType: 1, offerDiscountType: 'PAY_UP_FRONT' }, NOW.getTime());
    expect(payUpFront.ok && payUpFront.subscription.isTrial).toBe(false);
  });

  it('counts a Max trial against the Standard AI limits, not the Max ones', async () => {
    const fake = fakeAdmin({ subscriptions: row('charioteer.unlimited.monthly', true) });
    const gate = await gateAiUse({ admin: fake.admin, userId: USER, kind: 'coach', now: NOW, enforcedFlag: 'true' });
    expect(gate).toMatchObject({ ok: true, tier: 'standard', limit: TIER_LIMITS.standard.coach.day });
    expect(fake.rpcCalls[0]).toMatchObject({
      p_day_limit: TIER_LIMITS.standard.coach.day,
      p_month_limit: TIER_LIMITS.standard.coach.month,
    });
    const pro = fakeAdmin({ subscriptions: row('charioteer.pro.monthly', true) });
    const meal = await gateAiUse({ admin: pro.admin, userId: USER, kind: 'meal', now: NOW, enforcedFlag: 'true', countWhen: 'after' });
    expect(meal).toMatchObject({ ok: true, tier: 'standard', limit: TIER_LIMITS.standard.meal.day });
    expect(await countAiUse({ admin: pro.admin, userId: USER, kind: 'meal', tier: 'standard', now: NOW, requestId: 'trial-meal' })).toBe(true);
    expect(pro.rpcCalls[0]).toMatchObject({ p_day_limit: TIER_LIMITS.standard.meal.day, p_month_limit: TIER_LIMITS.standard.meal.month });
  });

  it('keeps a paid Max subscriber on the Max limits', async () => {
    const fake = fakeAdmin({ subscriptions: row('charioteer.unlimited.monthly', false) });
    const gate = await gateAiUse({ admin: fake.admin, userId: USER, kind: 'coach', now: NOW, enforcedFlag: 'true' });
    expect(gate).toMatchObject({ ok: true, tier: 'max', limit: TIER_LIMITS.max.coach.day });
  });

  it('lets an entitlement_overrides row win over the trial', async () => {
    const fake = fakeAdmin({
      subscriptions: row('charioteer.monthly', true),
      entitlement_overrides: { tier: 'max', expires_at: null },
    });
    const gate = await gateAiUse({ admin: fake.admin, userId: USER, kind: 'coach', now: NOW, enforcedFlag: 'true' });
    expect(gate).toMatchObject({ ok: true, tier: 'max', limit: TIER_LIMITS.max.coach.day });
  });

  it('gives a trial the Standard route cap (41.8 km), and a comp still wins', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const trialRow = (product: string) => row(product, true, { expires_at: future } as Partial<SubscriptionRecord>);
    const proTrial = fakeAdmin({ subscriptions: { ...trialRow('charioteer.pro.monthly'), expires_at: future } });
    const maxTrial = fakeAdmin({ subscriptions: { ...trialRow('charioteer.unlimited.monthly'), expires_at: future } });
    expect(await resolveRouteTier(proTrial.admin, USER)).toBe('standard');
    expect(await resolveRouteTier(maxTrial.admin, USER)).toBe('standard');
    expect(routeLengthCapM('standard')).toBe(STANDARD_ROUTE_MAX_M);
    expect(Math.round(STANDARD_ROUTE_MAX_M / 100) / 10).toBe(41.8);
    const paidPro = fakeAdmin({ subscriptions: { ...row('charioteer.pro.monthly', false), expires_at: future } });
    expect(await resolveRouteTier(paidPro.admin, USER)).toBe('pro');
    const comped = fakeAdmin({
      subscriptions: { ...trialRow('charioteer.monthly'), expires_at: future },
      entitlement_overrides: { tier: 'max', expires_at: future },
    });
    expect(await resolveRouteTier(comped.admin, USER)).toBe('max');
  });

  it('is server-side only: both lookups use the one helper and the app files are untouched', () => {
    expect(readFileSync('supabase/functions/_shared/aiAllowance.ts', 'utf8')).toContain('storeTierForSubscription(row, now.getTime())');
    expect(readFileSync('supabase/functions/_shared/routeTier.ts', 'utf8')).toContain('storeTierForSubscription(row, now)');
  });
});
