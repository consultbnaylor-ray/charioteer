import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

import { countAiUse, gateAiUse, resetCountedRequests } from '../../supabase/functions/_shared/aiAllowance.ts';
import {
  AI_BILLING_CODE,
  AI_BILLING_MARKER,
  AI_BILLING_MESSAGES,
  COACH_BILLING_UNAVAILABLE,
  xaiBillingRefusal,
} from '../../supabase/functions/_shared/aiBilling.ts';
import { aiLimitButtonLabel } from '@/domain/aiCredits';
import { aiGateFromBody, CREDITS_USED_FALLBACK, isAiGateNotice, AiGateNotice } from '@/domain/aiGate';
import { shownError } from '@/domain/errors';
import { MEAL_BILLING_UNAVAILABLE, MealEstimateError, ROUGH_ESTIMATE_BILLING_NOTE, mealEstimateMessage } from '@/domain/mealEstimate';
import { PAYWALL_OFF_NOTE, paywallOpeningNote } from '@/domain/subscription';
import { creditResetPhrase, limitReachedMessage } from '@/domain/tierLimits';

const USER = 'bd3268ef-7a9e-4b63-9785-0595f2790a15';
const NOW = new Date('2026-11-27T08:25:01Z');

function fakeAdmin(rows: { day: string; count: number }[], product = 'Sta') {
  const rpcCalls: Record<string, unknown>[] = [];
  const chain = (table: string) => {
    const self = {
      eq: () => self,
      maybeSingle: async () => table === 'subscriptions'
        ? { data: { product_id: product, status: 'active', expires_at: '2027-11-05T07:17:54Z', is_trial: false, environment: 'Sandbox' }, error: null }
        : { data: null, error: null },
      gte: () => ({ lt: () => Promise.resolve({ data: rows, error: null }) }),
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

const AI_FUNCTIONS = ['thumos-chat', 'gratitude-reflect', 'health-plan', 'estimate-meal', 'thumos-voice-token'] as const;

describe('AI credits are only used on a real answer', () => {
  beforeEach(() => resetCountedRequests());

  it('every AI edge function checks first and counts after the model answers', () => {
    for (const name of AI_FUNCTIONS) {
      const source = readFileSync(`supabase/functions/${name}/index.ts`, 'utf8');
      const gates = source.match(/gateAiUse\(\{[\s\S]*?\}\);/g) ?? [];
      expect(gates.length, name).toBeGreaterThan(0);
      for (const gate of gates) expect(gate, name).toContain("countWhen: 'after'");
      expect(source, name).toContain('countAiUse(');
    }
  });

  it('a failed coach call leaves the allowance untouched, and a real answer counts once', async () => {
    const fake = fakeAdmin([{ day: '2026-11-24', count: 1 }]);
    const gate = await gateAiUse({ admin: fake.admin, userId: USER, kind: 'coach', now: NOW, enforcedFlag: 'true', countWhen: 'after' });
    expect(gate).toEqual({ ok: true, tier: 'standard', used: 0, limit: 20, counted: false });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(await countAiUse({ admin: fake.admin, userId: USER, kind: 'coach', tier: 'standard', requestId: 'r1', now: NOW })).toBe(true);
    expect(await countAiUse({ admin: fake.admin, userId: USER, kind: 'coach', tier: 'standard', requestId: 'r1', now: NOW })).toBe(false);
    expect(fake.rpcCalls).toHaveLength(1);
  });

  it('thumos-chat only counts when xAI answered, after the reply is decided', () => {
    const source = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    expect(source).toContain('if (modelAnswered && gate.ok)');
    expect(source.indexOf('modelAnswered = true')).toBeGreaterThan(0);
    expect(source).toContain('modelAnswered = Boolean(secondGood)');
  });
});

describe('our own xAI balance running out', () => {
  it('treats 402 as billing, and 403 or 429 only when the body says so', () => {
    expect(xaiBillingRefusal(402)).toBe(true);
    expect(xaiBillingRefusal(429, '{"error":"Rate limit exceeded"}')).toBe(false);
    expect(xaiBillingRefusal(429, 'Your team has used all available credits')).toBe(true);
    expect(xaiBillingRefusal(403, 'monthly spending limit reached')).toBe(true);
    expect(xaiBillingRefusal(500, 'credits')).toBe(false);
    expect(xaiBillingRefusal('timeout')).toBe(false);
  });

  it('never blames the person and says no credit was used', () => {
    for (const message of Object.values(AI_BILLING_MESSAGES)) {
      expect(message).toContain("This isn't your fault and no credit was used.");
      expect(message).not.toMatch(/upgrade|xAI|key|balance/i);
    }
    expect(AI_BILLING_MESSAGES.coach).toBe("The coach is temporarily unavailable. This isn't your fault and no credit was used. Please try again later.");
    expect(MEAL_BILLING_UNAVAILABLE).toBe(AI_BILLING_MESSAGES.meal);
    expect(ROUGH_ESTIMATE_BILLING_NOTE).toContain('no credit was used');
  });

  it('keeps the Thumos safety lines in the billing reply', () => {
    expect(COACH_BILLING_UNAVAILABLE.startsWith(AI_BILLING_MESSAGES.coach)).toBe(true);
    expect(COACH_BILLING_UNAVAILABLE).toContain('999');
    expect(COACH_BILLING_UNAVAILABLE).toContain('NHS 111');
    expect(COACH_BILLING_UNAVAILABLE).toContain('116 123');
  });

  it('logs a billing marker in each AI edge function, without the key', () => {
    const billing = readFileSync('supabase/functions/_shared/aiBilling.ts', 'utf8');
    expect(billing).toContain(`AI_BILLING_MARKER = '${AI_BILLING_MARKER}'`);
    expect(billing).not.toMatch(/XAI_API_KEY|Bearer/);
    for (const name of AI_FUNCTIONS) {
      const source = readFileSync(`supabase/functions/${name}/index.ts`, 'utf8');
      expect(source, name).toContain('logAiBilling(');
      expect(source, name).toContain('xaiBillingRefusal(');
    }
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    expect(chat).toContain('billing ? COACH_BILLING_UNAVAILABLE : COACH_REPLY_FAILED');
    expect(AI_BILLING_CODE).toBe('provider_billing');
  });

  it('shows the meal billing line instead of a retry prompt', () => {
    expect(mealEstimateMessage('billing')).toBe(MEAL_BILLING_UNAVAILABLE);
    expect(new MealEstimateError('billing').message).toBe(MEAL_BILLING_UNAVAILABLE);
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    expect(repo).toContain("data?.billing === true && (invoked.status >= 500 || data?.ok !== true)");
    expect(repo).toContain("data?.code === 'provider_billing'");
  });
});

describe('a person who used their own credits', () => {
  it('says the credits are used up, names the upgrade, and gives the reset', () => {
    expect(limitReachedMessage({ tier: 'standard', window: 'month', resetsAt: '2026-12-01T00:00:00.000Z', kind: 'coach' }))
      .toBe("You've used all your coach credits for this month on Standard. Upgrade to Pro for more. Your credits reset on 1 Dec.");
    expect(limitReachedMessage({ tier: 'pro', window: 'day', resetsAt: '2026-11-28T00:00:00.000Z', kind: 'meal' }))
      .toBe("You've used all your meal-reading credits for today on Pro. Upgrade to Max for more. Your credits reset at midnight.");
    expect(limitReachedMessage({ tier: 'max', window: 'month', resetsAt: '2026-12-01T00:00:00.000Z', kind: 'plan' }))
      .toBe("You've used all your health plan credits for this month on Max. Max is the top plan. Your credits reset on 1 Dec.");
    expect(creditResetPhrase('month', 'not a date')).toBe('at the start of next month');
  });

  it('writes the message on the phone from the plan, so an older server reads the same', () => {
    const notice = aiGateFromBody({
      ok: false,
      code: 'limit_reached',
      tier: 'standard',
      kind: 'coach',
      window: 'month',
      resets_at: '2026-12-01T00:00:00.000Z',
      message: "You've reached this month's limit on Standard. It resets at the start of next month. Upgrade to Pro for more.",
    });
    expect(notice?.message).toBe("You've used all your coach credits for this month on Standard. Upgrade to Pro for more. Your credits reset on 1 Dec.");
    expect(notice?.kind).toBe('coach');
    expect(aiGateFromBody({ code: 'limit_reached' })?.message).toBe(CREDITS_USED_FALLBACK);
    expect(aiGateFromBody({ code: 'provider_billing' })).toBeNull();
  });

  it('offers the next plan up, nothing on the top plan or a comp', () => {
    const open = { comp: false, compLoading: false };
    expect(aiLimitButtonLabel({ code: 'limit_reached', tier: 'standard' }, open)).toBe('Upgrade to Pro');
    expect(aiLimitButtonLabel({ code: 'limit_reached', tier: 'pro' }, open)).toBe('Upgrade to Max');
    expect(aiLimitButtonLabel({ code: 'limit_reached', tier: 'max' }, open)).toBeNull();
    expect(aiLimitButtonLabel({ code: 'limit_reached', tier: null }, open)).toBe('Upgrade');
    expect(aiLimitButtonLabel({ code: 'subscription_required', tier: null }, open)).toBe('See plans');
    expect(aiLimitButtonLabel({ code: 'limit_reached', tier: 'standard' }, { comp: true, compLoading: false })).toBeNull();
  });

  it('the limit card opens the plans screen and can always be closed', () => {
    const card = readFileSync('src/ui/AiLimitCard.tsx', 'utf8');
    expect(card).toContain("router.push('/paywall' as never)");
    expect(card).toContain('label="Close"');
    expect(card).not.toContain('paywallEnabled');
  });

  it('is said once, in the card, not again as an inline error', () => {
    const notice = new AiGateNotice({ code: 'limit_reached', message: 'used', tier: 'standard', window: 'day' });
    expect(isAiGateNotice(notice)).toBe(true);
    expect(shownError(notice, 'Could not reflect just now.')).toBe('');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    expect(repo).toContain('if (isAiGateNotice(error)) return error;');
    const analysis = readFileSync('src/ui/ThumosStatsAnalysis.tsx', 'utf8');
    expect(analysis).toContain('if (isAiGateNotice(err)) return;');
  });

  it('explains the plans screen when this build cannot sell an upgrade', () => {
    expect(paywallOpeningNote('ios', false)).toBe(PAYWALL_OFF_NOTE);
    expect(paywallOpeningNote('ios', true)).toBeNull();
    expect(paywallOpeningNote('android', true)).toBe('Subscriptions are available in the iOS app.');
    expect(readFileSync('src/app/paywall.tsx', 'utf8')).toContain('paywallOpeningNote(Platform.OS, paywallEnabled())');
  });
});
