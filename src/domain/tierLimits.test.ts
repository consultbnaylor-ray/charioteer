import { describe, expect, it } from 'vitest';

import {
  CRISIS_STATIC_REPLY,
  PRO_PRODUCT_ID,
  TIER_LIMITS,
  UNLIMITED_PRODUCT_ID,
  YEARLY_PRODUCT_ID,
  decideAllowance,
  entitlementEnforced,
  limitReachedMessage,
  londonDayKey,
  nextLondonMidnight,
  tierForProduct,
  tierIncludedLine,
  usageNearlyFull,
  voiceEnabled,
} from '@/domain/tierLimits';

const NOW = new Date('2026-11-01T12:00:00.000Z');

describe('tier limits', () => {
  it('maps every product to a tier and gives a trial the plan it is trying', () => {
    expect(tierForProduct('Sta')).toBe('standard');
    expect(tierForProduct('charioteer.monthly')).toBe('standard');
    expect(tierForProduct(PRO_PRODUCT_ID)).toBe('pro');
    expect(tierForProduct(UNLIMITED_PRODUCT_ID)).toBe('unlimited');
    expect(tierForProduct('other')).toBeNull();
    expect(TIER_LIMITS.standard.coach).toEqual({ day: 20, month: 120 });
    expect(TIER_LIMITS.pro.meal).toEqual({ day: 10, month: 150 });
    expect(TIER_LIMITS.unlimited.plan).toEqual({ day: 5, month: 30 });
    expect(tierIncludedLine('standard')).toBe('Up to 20 coach messages a day');
    expect(tierIncludedLine('pro')).toBe('Up to 40 a day');
    expect(tierIncludedLine('unlimited')).toBe('Unlimited* (fair use: up to 150 a day)');
  });

  it('returns 402 without a subscription, 429 at the cap, and helplines for a crisis', () => {
    expect(decideAllowance({
      enforced: true,
      crisis: false,
      tier: null,
      dayCount: 0,
      monthCount: 0,
      kind: 'coach',
      now: NOW,
    }).action).toBe('subscription_required');

    const reached = decideAllowance({
      enforced: true,
      crisis: false,
      tier: 'standard',
      dayCount: 20,
      monthCount: 20,
      kind: 'coach',
      now: NOW,
    });
    expect(reached.action).toBe('limit_reached');
    if (reached.action !== 'limit_reached') return;
    expect(reached.limit).toBe(20);
    expect(reached.window).toBe('day');
    expect(limitReachedMessage(reached)).toBe("You've reached today's limit on Standard. It resets at midnight. Upgrade to Pro for more.");
    const fairUseMonth = decideAllowance({
      enforced: true,
      crisis: false,
      tier: 'unlimited',
      dayCount: 1,
      monthCount: 1500,
      kind: 'coach',
      now: NOW,
    });
    if (fairUseMonth.action === 'limit_reached') {
      expect(limitReachedMessage(fairUseMonth)).toBe("You've reached this month's fair-use limit on Unlimited. It resets at the start of next month.");
    }

    const month = decideAllowance({
      enforced: true,
      crisis: false,
      tier: 'pro',
      dayCount: 1,
      monthCount: 300,
      kind: 'coach',
      now: NOW,
    });
    expect(month.action).toBe('limit_reached');
    if (month.action === 'limit_reached') expect(month.window).toBe('month');

    expect(decideAllowance({
      enforced: true,
      crisis: true,
      tier: null,
      dayCount: 0,
      monthCount: 0,
      kind: 'coach',
      now: NOW,
    }).action).toBe('crisis_static');
    expect(decideAllowance({
      enforced: true,
      crisis: true,
      tier: 'standard',
      dayCount: 20,
      monthCount: 40,
      kind: 'coach',
      now: NOW,
    }).action).toBe('crisis_static');
    expect(CRISIS_STATIC_REPLY).toContain('116 123');
    expect(CRISIS_STATIC_REPLY).toContain('999');

    expect(decideAllowance({
      enforced: false,
      crisis: false,
      tier: null,
      dayCount: 99,
      monthCount: 99,
      kind: 'meal',
      now: NOW,
    }).action).toBe('skip');
    expect(decideAllowance({
      enforced: true,
      crisis: false,
      tier: 'unlimited',
      dayCount: 149,
      monthCount: 149,
      kind: 'coach',
      now: NOW,
    }).action).toBe('allow');
  });

  it('uses the London day and only enforces when the flag is not false', () => {
    expect(londonDayKey(new Date('2026-06-01T23:30:00.000Z'))).toBe('2026-06-02');
    expect(londonDayKey(new Date('2026-01-01T00:30:00.000Z'))).toBe('2026-01-01');
    const midnight = nextLondonMidnight(new Date('2026-11-01T12:00:00.000Z'));
    expect(londonDayKey(midnight)).toBe('2026-11-02');
    expect(londonDayKey(new Date(midnight.getTime() - 2000))).toBe('2026-11-01');
    expect(entitlementEnforced(undefined)).toBe(true);
    expect(entitlementEnforced('true')).toBe(true);
    expect(entitlementEnforced('false')).toBe(false);
    expect(voiceEnabled(undefined)).toBe(false);
    expect(voiceEnabled('true')).toBe(true);
    expect(usageNearlyFull(18, 20)).toBe(true);
    expect(usageNearlyFull(16, 20)).toBe(false);
    expect(YEARLY_PRODUCT_ID).toBe('Sta');
  });
});
