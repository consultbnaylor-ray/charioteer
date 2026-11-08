import { describe, expect, it } from 'vitest';

import { overrideActive, parseEntitlementOverride, tierForAllowance } from '@/domain/entitlementOverride';

const NOW = Date.parse('2026-11-05T12:00:00.000Z');

describe('entitlement overrides', () => {
  it('keeps a null expiry and ignores a lapsed or unknown tier', () => {
    const lifetime = parseEntitlementOverride({ tier: 'pro', expires_at: null });
    expect(lifetime).toEqual({ tier: 'pro', expiresAt: null });
    expect(overrideActive(lifetime, NOW)).toBe(true);
    expect(overrideActive(parseEntitlementOverride({ tier: 'max', expires_at: '2026-12-01T00:00:00.000Z' }), NOW)).toBe(true);
    expect(overrideActive(parseEntitlementOverride({ tier: 'pro', expires_at: '2026-11-01T00:00:00.000Z' }), NOW)).toBe(false);
    expect(parseEntitlementOverride({ tier: 'vip', expires_at: null })).toBeNull();
    expect(overrideActive(null, NOW)).toBe(false);
  });

  it('uses the comp tier ahead of the store tier', () => {
    expect(tierForAllowance({ tier: 'pro', expiresAt: null }, null, NOW)).toBe('pro');
    expect(tierForAllowance({ tier: 'pro', expiresAt: null }, 'standard', NOW)).toBe('pro');
    expect(tierForAllowance({ tier: 'pro', expiresAt: '2026-01-01T00:00:00.000Z' }, 'max', NOW)).toBe('max');
    expect(tierForAllowance(null, null, NOW)).toBeNull();
  });
});
