import { describe, expect, it, beforeEach } from 'vitest';

import { countAiUse, gateAiUse, resetCountedRequests } from '../../supabase/functions/_shared/aiAllowance.ts';
import { MEAL_NO_RETRY_HEADER, providerRetryPointless } from '../../supabase/functions/_shared/mealProvider.ts';
import { EDGE_NO_RETRY_HEADER, postWithRetry } from '@/domain/edgeRetry';

const USER = 'bd3268ef-7a9e-4b63-9785-0595f2790a15';
const NOW = new Date('2026-11-26T12:37:53Z');

/** A fake service-role client: a Standard subscription, no comp, and the given usage rows. */
function fakeAdmin(rows: { day: string; count: number }[], options: { usageError?: boolean } = {}) {
  const rpcCalls: Record<string, unknown>[] = [];
  const reads: string[] = [];
  const chain = (table: string) => {
    const self = {
      eq: () => self,
      maybeSingle: async () => {
        if (table === 'subscriptions') {
          return {
            data: { product_id: 'Sta', status: 'active', expires_at: '2027-11-05T07:17:54Z', is_trial: false, environment: 'Sandbox' },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      gte: () => ({
        lt: () => {
          reads.push(table);
          return Promise.resolve(options.usageError ? { data: null, error: { message: 'down' } } : { data: rows, error: null });
        },
      }),
    };
    return self;
  };
  return {
    rpcCalls,
    reads,
    admin: {
      from: (table: string) => ({ select: () => ({ eq: () => chain(table) }) }),
      rpc: async (_name: string, args: Record<string, unknown>) => {
        rpcCalls.push(args);
        return { data: [{ allowed: true, day_count: 1, month_count: 1 }], error: null };
      },
    },
  };
}

describe('meal usage counted only after a usable estimate', () => {
  beforeEach(() => resetCountedRequests());

  it('checks the allowance without counting when countWhen is after', async () => {
    const fake = fakeAdmin([{ day: '2026-11-26', count: 2 }]);
    const gate = await gateAiUse({ admin: fake.admin, userId: USER, kind: 'meal', now: NOW, enforcedFlag: 'true', countWhen: 'after' });
    expect(gate).toEqual({ ok: true, tier: 'standard', used: 2, limit: 6, counted: false });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('still counts up front by default for the other AI features', async () => {
    const fake = fakeAdmin([]);
    const gate = await gateAiUse({ admin: fake.admin, userId: USER, kind: 'coach', now: NOW, enforcedFlag: 'true' });
    expect(gate.ok && gate.counted).toBe(true);
    expect(fake.rpcCalls).toHaveLength(1);
  });

  it('refuses at the daily limit without counting', async () => {
    const fake = fakeAdmin([{ day: '2026-11-26', count: 6 }]);
    const gate = await gateAiUse({ admin: fake.admin, userId: USER, kind: 'meal', now: NOW, enforcedFlag: 'true', countWhen: 'after' });
    expect(gate.ok).toBe(false);
    expect(!gate.ok && 'body' in gate ? gate.body.code : null).toBe('limit_reached');
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('refuses at the monthly limit from earlier days', async () => {
    const fake = fakeAdmin([{ day: '2026-11-03', count: 60 }, { day: '2026-11-20', count: 30 }]);
    const gate = await gateAiUse({ admin: fake.admin, userId: USER, kind: 'meal', now: NOW, enforcedFlag: 'true', countWhen: 'after' });
    expect(!gate.ok && 'status' in gate ? gate.status : null).toBe(429);
  });

  it('answers 503 when usage cannot be read', async () => {
    const fake = fakeAdmin([], { usageError: true });
    const gate = await gateAiUse({ admin: fake.admin, userId: USER, kind: 'meal', now: NOW, enforcedFlag: 'true', countWhen: 'after' });
    expect(!gate.ok && 'status' in gate ? gate.status : null).toBe(503);
  });

  it('counts one request id once across the automatic retries', async () => {
    const fake = fakeAdmin([]);
    const args = { admin: fake.admin, userId: USER, kind: 'meal' as const, tier: 'standard' as const, requestId: '5b122c8e-1037', now: NOW };
    expect(await countAiUse(args)).toBe(true);
    expect(await countAiUse(args)).toBe(false);
    expect(await countAiUse({ ...args, requestId: 'another-request' })).toBe(true);
    expect(fake.rpcCalls).toHaveLength(2);
    expect(fake.rpcCalls[0]).toMatchObject({ p_kind: 'meal', p_day: '2026-11-26', p_day_limit: 6, p_month_limit: 90 });
  });

  it('does not count when the plan check was off', async () => {
    const fake = fakeAdmin([]);
    expect(await countAiUse({ admin: fake.admin, userId: USER, kind: 'meal', tier: null, requestId: 'x', now: NOW })).toBe(false);
    expect(fake.rpcCalls).toHaveLength(0);
  });
});

describe('out-of-credit photo reads are not retried', () => {
  it('marks only a provider 402 as pointless to retry', () => {
    expect(providerRetryPointless({ kind: 'http', status: 402 })).toBe(true);
    expect(providerRetryPointless({ kind: 'http', status: 503 })).toBe(false);
    expect(providerRetryPointless({ kind: 'http', status: 429 })).toBe(false);
    expect(providerRetryPointless({ kind: 'timeout' })).toBe(false);
  });

  it('uses the same header name on the server and the phone', () => {
    expect(EDGE_NO_RETRY_HEADER).toBe(MEAL_NO_RETRY_HEADER);
  });

  it('stops after one call when the server says not to retry', async () => {
    let calls = 0;
    const response = await postWithRetry({
      fetchImpl: async () => {
        calls += 1;
        return new Response('{"ok":false,"code":"provider_unavailable"}', { status: 503, headers: { [MEAL_NO_RETRY_HEADER]: '1' } });
      },
      url: 'https://example.invalid/functions/v1/estimate-meal',
      init: { method: 'POST' },
      sleep: async () => undefined,
    });
    expect(response.status).toBe(503);
    expect(calls).toBe(1);
  });

  it('still retries an ordinary 503', async () => {
    let calls = 0;
    await postWithRetry({
      fetchImpl: async () => {
        calls += 1;
        return new Response('{}', { status: 503 });
      },
      url: 'https://example.invalid/functions/v1/estimate-meal',
      init: { method: 'POST' },
      sleep: async () => undefined,
    });
    expect(calls).toBe(3);
  });
});
