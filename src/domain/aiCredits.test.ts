import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  AI_CREDITS_CHECKING,
  AI_CREDITS_UNAVAILABLE,
  AI_USAGE_UNAVAILABLE,
  LOW_CREDIT_LEFT,
  aiCreditKindLine,
  aiCreditStatusLine,
  creditNudge,
  creditPlanState,
  creditUpgradeLabel,
  creditsExhausted,
  creditsLeft,
  type AiUsageCounts,
} from '@/domain/aiCredits';

const usage = (coach: number, meal: number, plan: number): AiUsageCounts => ({ coach, meal, plan });

describe('AI credit nudges', () => {
  it('nudges at 5 or fewer and offers the next plan when a bucket is empty', () => {
    expect(LOW_CREDIT_LEFT).toBe(5);
    expect(creditsLeft('standard', usage(115, 0, 0), 'coach')).toBe(5);
    expect(creditNudge('standard', usage(115, 0, 0), 'coach')).toBe('Running low: 5 coach messages left this month.');
    expect(creditNudge('standard', usage(114, 0, 0), 'coach')).toBeNull();
    expect(creditsExhausted('standard', usage(120, 0, 0), 'coach')).toBe(true);
    expect(creditNudge('standard', usage(120, 0, 0), 'coach')).toBeNull();
    expect(creditUpgradeLabel('standard')).toBe('Upgrade to Pro');
    expect(creditUpgradeLabel('pro')).toBe('Upgrade to Max');
    expect(creditUpgradeLabel('max')).toBeNull();
    expect(creditUpgradeLabel(null)).toBe('See plans');
    expect(creditsExhausted(null, usage(0, 0, 0), 'coach')).toBe(false);
    expect(creditNudge('standard', usage(116, 88, 0))).toBe('Running low: 4 coach messages, 2 meal reads, 4 plan refreshes left this month.');
  });

  it('opens the paywall from the credit line and the limit card without waiting for the build flag', () => {
    const line = readFileSync('src/ui/AiCreditLine.tsx', 'utf8');
    const card = readFileSync('src/ui/AiLimitCard.tsx', 'utf8');
    expect(line).toContain("router.push('/paywall' as never)");
    expect(line).toContain('aiCreditStatusLine');
    expect(line).toContain('label="Try again"');
    expect(line).not.toContain('paywallEnabled');
    const now = new Date('2026-11-23T12:00:00Z');
    const counts = usage(0, 0, 0);
    expect(aiCreditStatusLine({ tier: null, usage: counts, kind: 'meal', checking: true, planFailed: false, usageFailed: false, now })).toBe(AI_CREDITS_CHECKING);
    expect(aiCreditStatusLine({ tier: null, usage: counts, kind: 'meal', checking: true, planFailed: false, usageFailed: false, now })).not.toContain('a plan sets this');
    expect(aiCreditStatusLine({ tier: null, usage: counts, kind: 'meal', checking: false, planFailed: true, usageFailed: false, now })).toBe(AI_CREDITS_UNAVAILABLE);
    expect(aiCreditStatusLine({ tier: 'standard', usage: counts, kind: 'meal', checking: false, planFailed: false, usageFailed: true, now })).toBe(AI_USAGE_UNAVAILABLE);
    expect(aiCreditStatusLine({ tier: null, usage: counts, kind: 'meal', checking: false, planFailed: false, usageFailed: false, now })).toBe(aiCreditKindLine(null, counts, 'meal', now));
    expect(aiCreditKindLine(null, counts, 'meal', now)).toContain('a plan sets this');
    expect(card).toContain("router.push('/paywall' as never)");
    expect(card).not.toContain('paywallEnabled');
    expect(card).not.toMatch(/Unlimited|unlimited/);
  });
});

describe('creditPlanState', () => {
  const standard = { productId: 'Sta', status: 'active' as const, expiresAt: '2027-11-05T07:17:54Z', isTrial: false, environment: 'Sandbox' as const };
  const base = { comp: null, compLoading: false, compFailed: false, row: null, rowLoading: false, rowFailed: false, now: Date.parse('2026-11-26T12:00:00Z') };

  it('shows the store subscription when there is no comp', () => {
    expect(creditPlanState({ ...base, row: standard })).toEqual({ tier: 'standard', checking: false, planFailed: false });
  });

  it('lets a comp win over the subscription', () => {
    expect(creditPlanState({ ...base, row: standard, comp: { tier: 'pro', expiresAt: null } }).tier).toBe('pro');
  });

  it('waits for the comp lookup before using the subscription', () => {
    expect(creditPlanState({ ...base, row: standard, compLoading: true })).toEqual({ tier: null, checking: true, planFailed: false });
  });

  it('ignores an expired subscription', () => {
    expect(creditPlanState({ ...base, row: { ...standard, expiresAt: '2026-01-01T00:00:00Z' } }).tier).toBeNull();
  });

  it('reports a failed lookup only when no plan was found', () => {
    expect(creditPlanState({ ...base, rowFailed: true }).planFailed).toBe(true);
    expect(creditPlanState({ ...base, row: standard, compFailed: true }).planFailed).toBe(false);
  });

  it('says checking while the subscription row loads', () => {
    expect(creditPlanState({ ...base, rowLoading: true }).checking).toBe(true);
  });
});
