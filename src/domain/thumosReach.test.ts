import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CHECK_CONNECTION,
  ESTIMATE_CLIENT_TIMEOUT_MS,
  ESTIMATE_PROVIDER_TIMEOUT_MS,
  PLAN_UNREACHABLE,
  REFLECT_UNREACHABLE,
  SIGN_IN_AGAIN,
  aiCallMessage,
  classifyEdgeError,
  classifyEdgeStatus,
  edgeErrorShouldRetry,
  edgeFailureLog,
  edgeStatusShouldRetry,
  freshConnectionInit,
  isThumosFallback,
  postWithRetry,
  prepareAiSession,
  type SessionTicket,
} from './edgeRetry';
import { ensureSafetyNotices, SELF_HARM_NOTICE } from './safety';
import { SCRIPTED_COACH_REPLY, THUMOS_CHAT, THUMOS_UNREACHABLE, runThumosModelChain, storedThumosReply, thumosModelChain, thumosRequestId, type ThumosCallResult } from './thumos';
import { thumosHealthBody, thumosHealthVerdict } from '../../supabase/functions/_shared/thumosHealth';

function stepTimeouts(crisis: boolean): number[] {
  return thumosModelChain({ crisis }).map((step) => step.timeoutMs);
}

function response(status: number): Response {
  return new Response(status >= 400 ? 'no' : 'ok', { status });
}

describe('Thumos reachability', () => {
  it('retries a dropped connection and a gateway, and opens a fresh connection', async () => {
    const sleeps: number[] = [];
    const seen: { url: string; connection: string | null; attempt: string | null }[] = [];
    let calls = 0;
    const result = await postWithRetry({
      url: 'https://example.test/functions/v1/thumos-chat',
      init: { method: 'POST', headers: { Authorization: 'Bearer secret' }, body: '{"content":"private words"}' },
      sleep: async (ms) => { sleeps.push(ms); },
      fetchImpl: async (url, init) => {
        calls += 1;
        const headers = new Headers(init.headers);
        seen.push({ url, connection: headers.get('Connection'), attempt: headers.get('X-Retry-Attempt') });
        if (calls === 1) throw new TypeError('Load failed');
        if (calls === 2) return response(503);
        return response(200);
      },
    });
    expect(result.status).toBe(200);
    expect(sleeps).toEqual([500, 1500]);
    expect(seen[0]?.connection).toBeNull();
    expect(seen[1]?.connection).toBe('close');
    expect(seen[1]?.url).toContain('attempt=1');
    expect(seen[2]?.attempt).toBe('2');
    expect(JSON.stringify(seen)).not.toContain('private words');
    const closed = freshConnectionInit({ method: 'POST' }, 1);
    expect(new Headers(closed.headers).get('Cache-Control')).toBe('no-store');
    expect(closed.keepalive).toBe(false);
  });

  it('retries 502, 504, and 546, and does not retry a plain 500', async () => {
    expect(edgeStatusShouldRetry(502)).toBe(true);
    expect(edgeStatusShouldRetry(504)).toBe(true);
    expect(edgeStatusShouldRetry(546)).toBe(true);
    expect(edgeStatusShouldRetry(500)).toBe(false);
    expect(edgeErrorShouldRetry(new TypeError('Failed to fetch'))).toBe(true);
    expect(edgeErrorShouldRetry(new Error('nope'))).toBe(false);

    const statuses = [502, 504, 546];
    for (const status of statuses) {
      let calls = 0;
      const result = await postWithRetry({
        url: 'https://example.test/functions/v1/estimate-meal',
        init: { method: 'POST' },
        sleep: async () => undefined,
        fetchImpl: async () => {
          calls += 1;
          return response(calls === 1 ? status : 200);
        },
      });
      expect(result.status).toBe(200);
      expect(calls).toBe(2);
    }

    let hard = 0;
    const stopped = await postWithRetry({
      url: 'https://example.test/functions/v1/thumos-chat',
      init: { method: 'POST' },
      sleep: async () => undefined,
      fetchImpl: async () => {
        hard += 1;
        return response(500);
      },
    });
    expect(stopped.status).toBe(500);
    expect(hard).toBe(1);
  });

  it('stops after the third connection failure and logs the error without the message', async () => {
    let calls = 0;
    await expect(postWithRetry({
      url: 'https://example.test/functions/v1/thumos-chat',
      init: { method: 'POST', body: 'I want to die' },
      sleep: async () => undefined,
      fetchImpl: async () => {
        calls += 1;
        throw new TypeError('Network request failed');
      },
    })).rejects.toThrow('Network request failed');
    expect(calls).toBe(3);
    const line = edgeFailureLog(new TypeError('Network request failed'));
    expect(line).toContain('TypeError');
    expect(line).toContain('Network request failed');
    expect(line).not.toContain('I want to die');
    expect(edgeFailureLog(new Error('x'), 503)).toBe('HTTP 503');
  });

  it('switches model on an xAI 500 or a timeout, then uses the scripted reply', async () => {
    const pauses: number[] = [];
    const models: string[] = [];
    const recovered = await runThumosModelChain({
      crisis: false,
      backoffMs: 400,
      pause: async (ms) => { pauses.push(ms); },
      call: async (step) => {
        models.push(step.model);
        if (step.model === THUMOS_CHAT.model) return { ok: false, status: 500 };
        return { ok: true, text: 'I am here with you.' };
      },
    });
    expect(recovered).toEqual({ text: 'I am here with you.', from: 'fallback' });
    expect(models).toEqual([THUMOS_CHAT.model, THUMOS_CHAT.fallbackModel]);
    expect(pauses).toEqual([400]);
    expect(stepTimeouts(false)).toEqual([12_000, 12_000]);

    const timed: ThumosCallResult[] = [
      { ok: false, status: 'timeout' },
      { ok: false, status: 'timeout' },
    ];
    let index = 0;
    const exhausted = await runThumosModelChain({
      crisis: true,
      pause: async () => undefined,
      call: async (step) => {
        expect(step.timeoutMs).toBe(8_000);
        const next = timed[index];
        index += 1;
        if (!next) throw new Error('extra call');
        return next;
      },
    });
    expect(exhausted.from).toBe('scripted');
    expect(exhausted.text).toBeNull();
    const shown = ensureSafetyNotices(SCRIPTED_COACH_REPLY, { selfHarm: true, withdrawal: false, reasons: [] });
    expect(shown).toContain('This is not the AI');
    expect(shown).toContain('116 123');
    expect(shown).toContain(SELF_HARM_NOTICE);
    expect(shown).not.toContain('xAI key');

    let refused = 0;
    const stopped = await runThumosModelChain({
      crisis: false,
      pause: async () => undefined,
      call: async () => {
        refused += 1;
        return { ok: false, status: 400 };
      },
    });
    expect(stopped.from).toBe('scripted');
    expect(refused).toBe(1);
  });

  it('keeps the missing-key line on the server, and a scripted reply everywhere else', () => {
    const chat = readFileSync('supabase/functions/thumos-chat/index.ts', 'utf8');
    const client = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const screen = readFileSync('src/app/(main)/thumos.tsx', 'utf8');
    expect(chat).toContain("console.error('thumos XAI_API_KEY is not set')");
    expect(chat).toContain("send({ type: 'ping' })");
    expect(chat).toContain('request_id');
    expect(chat).toContain('thumosModelChain');
    expect(chat).toContain('THUMOS_FALLBACK');
    expect(chat).toContain('onConflict: \'user_id,request_id,role\'');
    expect(THUMOS_CHAT.firstTimeoutMs).toBe(12_000);
    expect(THUMOS_CHAT.fallbackModel).not.toBe(THUMOS_CHAT.model);
    expect(thumosModelChain({ crisis: false }).map((step) => step.timeoutMs)).toEqual([12_000, 12_000]);
    expect(thumosModelChain({ crisis: true }).map((step) => step.timeoutMs)).toEqual([8_000, 8_000]);
    expect(SCRIPTED_COACH_REPLY).toContain('This is not the AI');
    expect(SCRIPTED_COACH_REPLY).toContain('116 123');
    expect(SCRIPTED_COACH_REPLY).not.toContain('xAI key');
    expect(THUMOS_UNREACHABLE).toBe('Couldn\'t reach Thumos – tap to retry.');
    expect(client).not.toContain('OFFLINE_COACH_MESSAGE');
    expect(client).not.toContain('insertOfflinePair');
    expect(client).toContain('request_id: requestId');
    expect(client).toContain('postWithRetry');
    expect(screen).toContain('Try again');
    expect(screen).toContain('THUMOS_UNREACHABLE');
    expect(screen).toContain('SCRIPTED_COACH_REPLY');
    expect(thumosRequestId('not-an-id')).toBeNull();
    expect(thumosRequestId('11111111-1111-4111-8111-111111111111')).toBe('11111111-1111-4111-8111-111111111111');
    expect(storedThumosReply([{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Here.' }])?.content).toBe('Here.');
    const health = readFileSync('supabase/functions/thumos-health/index.ts', 'utf8');
    expect(thumosHealthBody().max_tokens).toBe(1);
    expect(thumosHealthBody().reasoning_effort).toBe('none');
    expect(health).toContain('max_tokens');
    expect(health).toContain('every 5 minutes');
    expect(thumosHealthVerdict(200).ok).toBe(true);
    expect(thumosHealthVerdict(500).ok).toBe(false);
    expect(thumosHealthVerdict('timeout').code).toBe('timeout');
    expect(thumosHealthVerdict('missing_key').code).toBe('missing_key');
    const sql = readFileSync('supabase/migrations/20261015190000_thumos_reliability.sql', 'utf8');
    expect(sql).toContain('request_id');
    expect(sql).toContain('thumos_fallback_days');
    expect(sql).not.toMatch(/delete from/i);
    expect(screen).toContain('isThumosFallback');
    expect(screen).toContain('SIGN_IN_AGAIN');
    expect(screen).toContain('CHECK_CONNECTION');
  });

  it('refreshes the session once, and once more only when that refresh has no token', async () => {
    const now = 1_700_000_000_000;
    const fresh = (token: string): SessionTicket => ({
      accessToken: token,
      expiresAt: Math.floor(now / 1000) + 3600,
      userId: 'user-1',
    });
    const empty: SessionTicket = { accessToken: null, expiresAt: null, userId: null };
    let refreshes = 0;
    const ready = await prepareAiSession({
      now,
      read: async () => fresh('cached'),
      refresh: async () => {
        refreshes += 1;
        return { ticket: fresh('refreshed'), error: null };
      },
    });
    expect(refreshes).toBe(1);
    expect(ready).toEqual({ accessToken: 'refreshed', userId: 'user-1' });

    refreshes = 0;
    const second = await prepareAiSession({
      now,
      read: async () => empty,
      refresh: async () => {
        refreshes += 1;
        return refreshes === 1
          ? { ticket: empty, error: new Error('Auth session missing') }
          : { ticket: fresh('second'), error: null };
      },
    });
    expect(refreshes).toBe(2);
    expect(second).toEqual({ accessToken: 'second', userId: 'user-1' });
  });

  it('keeps a live token when the refresh cannot reach the network, and names a missing session', async () => {
    const now = 1_700_000_000_000;
    const live: SessionTicket = {
      accessToken: 'still-good',
      expiresAt: Math.floor(now / 1000) + 3600,
      userId: 'user-1',
    };
    const expired: SessionTicket = {
      accessToken: 'stale',
      expiresAt: Math.floor(now / 1000) - 120,
      userId: 'user-1',
    };
    const empty: SessionTicket = { accessToken: null, expiresAt: null, userId: null };
    const kept = await prepareAiSession({
      now,
      read: async () => live,
      refresh: async () => { throw new TypeError('Network request failed'); },
    });
    expect(kept).toEqual({ accessToken: 'still-good', userId: 'user-1' });

    const dropped = await prepareAiSession({
      now,
      read: async () => expired,
      refresh: async () => { throw new TypeError('Failed to fetch'); },
    });
    expect(dropped).toEqual({ failure: 'connection' });

    const signedOut = await prepareAiSession({
      now,
      read: async () => empty,
      refresh: async () => ({ ticket: empty, error: new Error('Auth session missing') }),
    });
    expect(signedOut).toEqual({ failure: 'signed-out' });

    const unread = await prepareAiSession({
      now,
      read: async () => { throw new TypeError('Network request failed'); },
      refresh: async () => ({ ticket: empty, error: null }),
    });
    expect(unread).toEqual({ failure: 'connection' });
  });

  it('uses a different sentence for a lost session, a timeout, a drop, and a server error', () => {
    expect(aiCallMessage('meal', 'signed-out')).toBe(SIGN_IN_AGAIN);
    expect(aiCallMessage('meal', 'auth')).toBe('Please sign in again.');
    expect(aiCallMessage('thumos', 'connection')).toBe(CHECK_CONNECTION);
    expect(aiCallMessage('meal', 'connection')).toBe('Check your connection.');
    expect(aiCallMessage('meal', 'network')).toBe('The meal estimate lost the connection. Tap to retry.');
    expect(aiCallMessage('meal', 'timeout')).toBe('The meal estimate took too long. Tap to retry.');
    expect(aiCallMessage('meal', 'server')).toBe('The meal estimate did not answer. Tap to retry.');
    expect(aiCallMessage('plan', 'server')).toBe(PLAN_UNREACHABLE);
    expect(aiCallMessage('reflect', 'server')).toBe(REFLECT_UNREACHABLE);
    expect(aiCallMessage('thumos', 'server')).toBe('Thumos did not answer – tap to retry.');
    expect(aiCallMessage('thumos', 'network')).toBe('Thumos lost the connection. Tap to retry.');
    expect(aiCallMessage('thumos', 'timeout')).toBe('Thumos took too long. Tap to retry.');
    expect(isThumosFallback(aiCallMessage('thumos', 'network'))).toBe(true);
    expect(isThumosFallback(aiCallMessage('thumos', 'timeout'))).toBe(true);
    expect(isThumosFallback(aiCallMessage('thumos', 'server'))).toBe(true);
    expect(isThumosFallback(SIGN_IN_AGAIN)).toBe(false);
    expect(isThumosFallback(CHECK_CONNECTION)).toBe(false);
    expect(classifyEdgeStatus(401)).toBe('auth');
    expect(classifyEdgeStatus(503)).toBe('server');
    expect(classifyEdgeStatus(403)).toBeNull();
    expect(classifyEdgeError(new TypeError('Failed to fetch'))).toBe('network');
    const aborted = new Error('The operation was aborted.');
    aborted.name = 'AbortError';
    expect(classifyEdgeError(aborted)).toBe('timeout');
    const timed = new Error('The request timed out.');
    timed.name = 'TimeoutError';
    expect(classifyEdgeError(timed)).toBe('timeout');
    expect(edgeFailureLog(new Error('porridge with honey'), 401)).toBe('HTTP 401');
    expect(edgeFailureLog(new TypeError('Network request failed'))).not.toContain('porridge');
    expect(ESTIMATE_CLIENT_TIMEOUT_MS).toBe(40_000);
    expect(ESTIMATE_PROVIDER_TIMEOUT_MS).toBe(28_000);
  });

  it('does not send again after the caller has already given up', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    await expect(postWithRetry({
      url: 'https://example.test/functions/v1/estimate-meal',
      init: { method: 'POST', signal: controller.signal, body: 'porridge with honey' },
      sleep: async () => undefined,
      fetchImpl: async () => {
        calls += 1;
        return response(200);
      },
    })).rejects.toThrow(/aborted/i);
    expect(calls).toBe(0);

    const late = new AbortController();
    let attempts = 0;
    await expect(postWithRetry({
      url: 'https://example.test/functions/v1/estimate-meal',
      init: { method: 'POST', signal: late.signal },
      sleep: async () => { late.abort(); },
      fetchImpl: async () => {
        attempts += 1;
        throw new TypeError('Network request failed');
      },
    })).rejects.toThrow('Network request failed');
    expect(attempts).toBe(1);
  });
});
