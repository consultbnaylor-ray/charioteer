import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

import { countAiUse, gateAiUse, resetCountedRequests } from '../../supabase/functions/_shared/aiAllowance.ts';
import { resolveRouteTier } from '../../supabase/functions/_shared/routeTier.ts';
import {
  BUNDLE_ID,
  aiTierForSubscription,
  inFreeTrial,
  readTransactionClaims,
  storeTierForSubscription,
  type SubscriptionRecord,
} from '../../supabase/functions/_shared/subscriptionRules.ts';
import { TIER_LIMITS, TRIAL_AI_MESSAGE } from '../../supabase/functions/_shared/tierLimits.ts';
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

describe('a free trial gets no AI and the Standard route cap, whatever plan it is trying', () => {
  beforeEach(() => resetCountedRequests());

  const record = (productId: string, isTrial: boolean, over: Partial<SubscriptionRecord> = {}): SubscriptionRecord => ({
    productId,
    status: 'active',
    expiresAt: FUTURE,
    isTrial,
    environment: 'Production',
    ...over,
  });

  it('holds a trial to the Standard route cap, gives it no AI tier, and leaves paid plans on their own tier', () => {
    const now = NOW.getTime();
    for (const id of ['Sta', 'charioteer.monthly', 'charioteer.pro.monthly', 'charioteer.unlimited.monthly']) {
      expect(storeTierForSubscription(record(id, true), now)).toBe('standard');
      expect(aiTierForSubscription(record(id, true), now)).toBeNull();
      expect(inFreeTrial(record(id, true), now)).toBe(true);
    }
    expect(storeTierForSubscription(record('charioteer.pro.monthly', false), now)).toBe('pro');
    expect(storeTierForSubscription(record('charioteer.unlimited.monthly', false), now)).toBe('max');
    expect(aiTierForSubscription(record('charioteer.pro.monthly', false), now)).toBe('pro');
    expect(aiTierForSubscription(record('charioteer.unlimited.monthly', false), now)).toBe('max');
    expect(aiTierForSubscription(record('charioteer.monthly', false), now)).toBe('standard');
    expect(inFreeTrial(record('Sta', false), now)).toBe(false);
  });

  it('gives nothing for an expired, revoked or unknown subscription, trial or not', () => {
    const now = NOW.getTime();
    expect(storeTierForSubscription(null, now)).toBeNull();
    expect(storeTierForSubscription(record('charioteer.pro.monthly', true, { expiresAt: '2026-11-01T00:00:00Z' }), now)).toBeNull();
    expect(storeTierForSubscription(record('charioteer.pro.monthly', true, { status: 'revoked' }), now)).toBeNull();
    expect(storeTierForSubscription(record('charioteer.pro.monthly', true, { status: 'expired' }), now)).toBeNull();
    expect(storeTierForSubscription(record('not.a.plan', true), now)).toBeNull();
    expect(aiTierForSubscription(record('charioteer.pro.monthly', true, { expiresAt: '2026-11-01T00:00:00Z' }), now)).toBeNull();
    expect(inFreeTrial(record('charioteer.pro.monthly', true, { expiresAt: '2026-11-01T00:00:00Z' }), now)).toBe(false);
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

  it('refuses every kind of AI for a trial of any plan with subscription_required, and counts nothing', async () => {
    for (const product of ['charioteer.monthly', 'charioteer.pro.monthly', 'charioteer.unlimited.monthly']) {
      for (const kind of ['coach', 'meal', 'plan'] as const) {
        for (const countWhen of ['before', 'after'] as const) {
          const fake = fakeAdmin({ subscriptions: row(product, true) });
          const gate = await gateAiUse({ admin: fake.admin, userId: USER, kind, now: NOW, enforcedFlag: 'true', countWhen });
          expect(gate.ok).toBe(false);
          if (gate.ok || !('body' in gate)) throw new Error('expected a refusal body');
          expect(gate.status).toBe(402);
          expect(gate.body).toMatchObject({ ok: false, code: 'subscription_required', reason: 'trial', message: TRIAL_AI_MESSAGE });
          expect(fake.rpcCalls).toHaveLength(0);
        }
      }
    }
    expect(TRIAL_AI_MESSAGE).toContain('AI features come with a subscription');
    expect(TRIAL_AI_MESSAGE).not.toMatch(/credit|limit|error|failed/i);
  });

  it('never counts a credit for a trial user, even if a caller tries', async () => {
    const fake = fakeAdmin({ subscriptions: row('charioteer.pro.monthly', true) });
    expect(await countAiUse({ admin: fake.admin, userId: USER, kind: 'coach', tier: null, now: NOW })).toBe(false);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('gives a trial user the crisis helplines instead of a model call', async () => {
    const fake = fakeAdmin({ subscriptions: row('charioteer.unlimited.monthly', true) });
    const gate = await gateAiUse({ admin: fake.admin, userId: USER, kind: 'coach', crisis: true, now: NOW, enforcedFlag: 'true' });
    expect(gate).toMatchObject({ ok: false, status: 200, crisis: true });
    expect(fake.rpcCalls).toHaveLength(0);
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
    const expired = fakeAdmin({
      subscriptions: row('charioteer.monthly', true),
      entitlement_overrides: { tier: 'pro', expires_at: '2026-11-01T00:00:00Z' },
    });
    const refused = await gateAiUse({ admin: expired.admin, userId: USER, kind: 'coach', now: NOW, enforcedFlag: 'true' });
    expect(refused.ok).toBe(false);
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

  it('wires the AI gate to the AI tier and the route lookup to the route tier, before any model call', () => {
    expect(readFileSync('supabase/functions/_shared/aiAllowance.ts', 'utf8')).toContain('aiTierForSubscription(row, now.getTime())');
    expect(readFileSync('supabase/functions/_shared/routeTier.ts', 'utf8')).toContain('storeTierForSubscription(row, now)');
    for (const name of ['thumos-chat', 'estimate-meal', 'health-plan', 'gratitude-reflect', 'thumos-voice-token']) {
      const text = readFileSync(`supabase/functions/${name}/index.ts`, 'utf8');
      const gate = text.indexOf('gateAiUse({');
      const xai = Math.min(...['THUMOS_CHAT.completionsUrl', 'fetch(url', 'api.x.ai'].map((marker) => {
        const at = text.indexOf(marker, gate);
        return at < 0 ? Number.POSITIVE_INFINITY : at;
      }));
      expect(gate, name).toBeGreaterThan(-1);
      expect(gate, name).toBeLessThan(xai);
    }
  });
});
