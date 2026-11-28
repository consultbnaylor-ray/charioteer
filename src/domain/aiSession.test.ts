import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AI_SESSION_TIMEOUT_MS,
  COULD_NOT_CONNECT,
  ESTIMATE_CLIENT_TIMEOUT_MS,
  EdgeSessionError,
  bindAiSession,
  callWithinDeadline,
  prepareAiSession,
} from '@/domain/edgeRetry';
import { MealEstimateError, mealPhotoFailure } from '@/domain/mealEstimate';
import {
  FETCH_TIMEOUT_MS,
  UPLOAD_FETCH_TIMEOUT_MS,
  fetchWithOneRetry,
} from '@/domain/retryFetch';
import { runPending } from '@/ui/pendingAction';

afterEach(() => {
  vi.useRealTimers();
});

const refreshUrl = 'https://example.supabase.co/auth/v1/token?grant_type=refresh_token';

describe('AI session deadline', () => {
  it('times out a hanging session, clears the spinner, and does not send the estimate', async () => {
    vi.useFakeTimers();
    const gate = bindAiSession();
    let sent = false;
    let loads = 0;
    const waiting = { estimate: false, photo: false };
    const start = (key: 'estimate' | 'photo') => runPending(async () => {
      await callWithinDeadline({
        timeoutMs: ESTIMATE_CLIENT_TIMEOUT_MS,
        prepare: async () => {
          await gate.session(() => {
            loads += 1;
            return new Promise<string>(() => undefined);
          });
        },
        send: async () => {
          sent = true;
          return 'sent';
        },
      });
    }, (isWaiting) => {
      waiting[key] = isWaiting;
    });

    const text = start('estimate');
    const photo = start('photo');
    const settled = Promise.allSettled([text, photo]);
    await vi.advanceTimersByTimeAsync(0);
    expect(waiting).toEqual({ estimate: true, photo: true });
    expect(loads).toBe(1);
    expect(gate.inflight()).toBe(true);

    await vi.advanceTimersByTimeAsync(AI_SESSION_TIMEOUT_MS);
    const results = await settled;
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    for (const result of results) {
      expect(result.status === 'rejected' && result.reason).toBeInstanceOf(EdgeSessionError);
      expect(result.status === 'rejected' ? result.reason : null).toMatchObject({ kind: 'connection' });
    }
    expect(waiting).toEqual({ estimate: false, photo: false });
    expect(sent).toBe(false);
    expect(gate.inflight()).toBe(false);
    expect(loads).toBe(1);
    const shown = mealPhotoFailure(new MealEstimateError('network', COULD_NOT_CONNECT));
    expect(shown.message).toBe("Couldn't connect. Check your connection and try again.");
    expect(shown.message).toBe(COULD_NOT_CONNECT);
  });

  it('drops a failed session so the next tap starts a fresh refresh', async () => {
    const gate = bindAiSession();
    let calls = 0;
    await expect(gate.session(async () => {
      calls += 1;
      throw new EdgeSessionError('connection');
    })).rejects.toBeInstanceOf(EdgeSessionError);
    expect(gate.inflight()).toBe(false);

    let release: (token: string) => void = () => undefined;
    const again = gate.session(() => {
      calls += 1;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    });
    const overlapped = gate.session(() => {
      calls += 1;
      return Promise.resolve('should-not-run');
    });
    await Promise.resolve();
    expect(calls).toBe(2);
    expect(gate.inflight()).toBe(true);
    release('fresh');
    await expect(again).resolves.toBe('fresh');
    await expect(overlapped).resolves.toBe('fresh');
    expect(calls).toBe(2);
    expect(gate.inflight()).toBe(false);
  });

  it('does not start a second refresh after the first one is aborted', async () => {
    const now = 1_700_000_000_000;
    const live = {
      accessToken: 'still-good',
      expiresAt: Math.floor(now / 1000) + 3600,
      userId: 'user-1',
    };
    let refreshes = 0;
    const kept = await prepareAiSession({
      now,
      read: async () => live,
      refresh: async () => {
        refreshes += 1;
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        throw error;
      },
    });
    expect(refreshes).toBe(1);
    expect(kept).toEqual({ accessToken: 'still-good', userId: 'user-1' });

    refreshes = 0;
    const dropped = await prepareAiSession({
      now,
      read: async () => ({ accessToken: null, expiresAt: null, userId: null }),
      refresh: async () => {
        refreshes += 1;
        const error = new Error('The request timed out.');
        error.name = 'TimeoutError';
        throw error;
      },
    });
    expect(refreshes).toBe(1);
    expect(dropped).toEqual({ failure: 'connection' });
  });

  it('starts the estimate deadline before the session step in the repository', () => {
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const caller = repo.slice(repo.indexOf('private async callEdge'), repo.indexOf('async mintVoiceToken'));
    const deadline = caller.indexOf('timeoutMs: options?.timeoutMs');
    const session = caller.indexOf('options?.ai ? await this.sessionForAiCall()');
    const send = caller.indexOf('postWithRetry');
    expect(deadline).toBeGreaterThan(-1);
    expect(session).toBeGreaterThan(deadline);
    expect(send).toBeGreaterThan(session);
    expect(caller).toContain('callWithinDeadline');
    const estimate = repo.slice(repo.indexOf('async estimateMeal'), repo.indexOf('async saveFoodLog'));
    expect(estimate).toContain('COULD_NOT_CONNECT');
    expect(estimate).not.toContain('increment_ai_usage');
    const screen = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const status = readFileSync('src/ui/MealEstimateStatus.tsx', 'utf8');
    expect(screen).toContain('failEstimate(failure.message)');
    expect(status).toContain('label="Try again"');
    expect(AI_SESSION_TIMEOUT_MS).toBe(15_000);
    expect(AI_SESSION_TIMEOUT_MS).toBeLessThan(ESTIMATE_CLIENT_TIMEOUT_MS);
  });
});

describe('fetch timeouts', () => {
  it('times out an auth or database fetch and leaves an upload running past that', async () => {
    vi.useFakeTimers();
    let dbAborted = false;
    let uploadAborted = false;
    const fetch = fetchWithOneRetry((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const url = String(_input);
        if (url.includes('/storage/')) uploadAborted = true;
        else dbAborted = true;
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      });
    }));
    const db = fetch('https://example.supabase.co/rest/v1/subscriptions?select=product_id');
    const upload = fetch('https://example.supabase.co/storage/v1/object/food-photos/meal.jpg', { method: 'POST', body: 'jpeg' });
    const dbResult = db.then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    await expect(dbResult).resolves.toMatchObject({ name: 'TimeoutError' });
    expect(dbAborted).toBe(true);
    expect(uploadAborted).toBe(false);

    const uploadResult = upload.then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(UPLOAD_FETCH_TIMEOUT_MS - FETCH_TIMEOUT_MS);
    await expect(uploadResult).resolves.toMatchObject({ name: 'TimeoutError' });
    expect(uploadAborted).toBe(true);
  });

  it('shares one in-flight refresh and starts a new one after that refresh fails', async () => {
    let calls = 0;
    const pending: {
      release: (response: Response | PromiseLike<Response>) => void;
      fail: (error?: unknown) => void;
    } = {
      release: () => undefined,
      fail: () => undefined,
    };
    const fetch = fetchWithOneRetry(() => {
      calls += 1;
      return new Promise<Response>((resolve, reject) => {
        pending.release = resolve;
        pending.fail = reject;
      });
    });
    const first = fetch(refreshUrl, { method: 'POST' });
    const second = fetch(refreshUrl, { method: 'POST' });
    const third = fetch(refreshUrl, { method: 'POST' });
    expect(calls).toBe(1);
    pending.release(new Response('{"access_token":"one"}', { status: 200 }));
    const bodies = await Promise.all([first, second, third].map(async (response) => (await response).text()));
    expect(bodies).toEqual(['{"access_token":"one"}', '{"access_token":"one"}', '{"access_token":"one"}']);
    expect(calls).toBe(1);

    const hung = fetch(refreshUrl, { method: 'POST' });
    expect(calls).toBe(2);
    const error = new Error('The request timed out.');
    error.name = 'TimeoutError';
    pending.fail(error);
    await expect(hung).rejects.toMatchObject({ name: 'TimeoutError' });

    const again = fetch(refreshUrl, { method: 'POST' });
    expect(calls).toBe(3);
    pending.release(new Response('{"access_token":"two"}', { status: 200 }));
    expect(await (await again).text()).toBe('{"access_token":"two"}');
  });

  it('reads a 200 refresh once when native json() fails, and ignores an abort before 15 seconds', async () => {
    vi.useFakeTimers();
    const payload = '{"access_token":"kept","refresh_token":"next","expires_in":3600}';
    let passed: AbortSignal | undefined;
    let aborted = false;
    const fetch = fetchWithOneRetry((_input, init) => new Promise((resolve, reject) => {
      passed = init?.signal ?? undefined;
      const fail = () => {
        aborted = true;
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      };
      const timer = setTimeout(() => {
        if (init?.signal?.aborted) {
          fail();
          return;
        }
        const response = new Response(payload, { status: 200 });
        response.json = () => Promise.reject(new TypeError('Network request failed'));
        response.arrayBuffer = () => Promise.reject(new TypeError('Network request failed'));
        resolve(response);
      }, 400);
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        fail();
      });
    }));
    const caller = new AbortController();
    const pending = fetch(refreshUrl, { method: 'POST', signal: caller.signal });
    const parsed = pending.then(async (response) => response.json(), (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(200);
    caller.abort();
    await vi.advanceTimersByTimeAsync(400);
    expect(passed).toBeDefined();
    expect(passed).not.toBe(caller.signal);
    expect(caller.signal.aborted).toBe(true);
    expect(aborted).toBe(false);
    expect(passed?.aborted).toBe(false);
    await expect(parsed).resolves.toEqual({ access_token: 'kept', refresh_token: 'next', expires_in: 3600 });
  });

  it('does not read a single refresh body, so a broken arrayBuffer is not treated as a dropped connection', async () => {
    let calls = 0;
    const fetch = fetchWithOneRetry(async () => {
      calls += 1;
      const response = new Response('{"access_token":"kept"}', { status: 200 });
      response.arrayBuffer = () => Promise.reject(new TypeError('Network request failed'));
      return response;
    });
    const response = await fetch(refreshUrl, { method: 'POST' });
    expect(calls).toBe(1);
    expect(await response.json()).toEqual({ access_token: 'kept' });
  });

  it('does not share two password sign-ins', async () => {
    let calls = 0;
    const fetch = fetchWithOneRetry(async () => {
      calls += 1;
      return new Response('ok', { status: 200 });
    });
    const url = 'https://example.supabase.co/auth/v1/token?grant_type=password';
    await fetch(url, { method: 'POST', body: '{"email":"a"}' });
    await fetch(url, { method: 'POST', body: '{"email":"b"}' });
    expect(calls).toBe(2);
  });
});
