import { describe, expect, it } from 'vitest';

import { pushRefreshError, refreshErrorLine, uploadStoredRefreshErrors, type StoredRefreshError } from './refreshErrorLog';

function memory() {
  const saved = new Map<string, string>();
  return {
    saved,
    storage: {
      getItem: async (key: string) => saved.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        saved.set(key, value);
      },
    },
  };
}

describe('saved refresh errors', () => {
  it('keeps the error name and drops a token', () => {
    const token = 'eyJabcdefgh.ijklmnop.qrstuvwx';
    const error = Object.assign(new Error(`Network request failed ${token}`), { name: 'AuthRetryableFetchError', status: 0 });
    const line = refreshErrorLine(error);
    expect(line).toContain('AuthRetryableFetchError');
    expect(line).toContain('Network request failed');
    expect(line).not.toContain(token);
    const timed = Object.assign(new Error('error finding user: timeout: context canceled'), { name: 'AuthRetryableFetchError', status: 500 });
    expect(refreshErrorLine(timed)).toContain('AuthRetryableFetchError 500');
    expect(refreshErrorLine(timed)).toContain('context canceled');
  });

  it('keeps the latest eight and uploads them once a session can write', async () => {
    const now = new Date('2026-11-24T19:02:00.000Z');
    let current: StoredRefreshError[] = [];
    for (let index = 0; index < 10; index += 1) {
      current = pushRefreshError(current, new Error(`attempt ${index}`), new Date(now.getTime() + index * 1000));
    }
    expect(current).toHaveLength(8);
    expect(current[0]?.line).toContain('attempt 2');
    expect(current[7]?.line).toContain('attempt 9');
    const again = pushRefreshError(current, new Error('attempt 9'), now);
    expect(again).toHaveLength(8);

    const { storage } = memory();
    await storage.setItem('charioteer.auth-refresh.v1', JSON.stringify(current));
    const sent: string[] = [];
    await uploadStoredRefreshErrors({
      logAuthRefresh: async (line) => {
        sent.push(line);
        return line.includes('attempt 4');
      },
    }, storage);
    expect(sent.some((line) => line.includes('attempt 4'))).toBe(true);
    const left = JSON.parse(await storage.getItem('charioteer.auth-refresh.v1') ?? '[]') as StoredRefreshError[];
    expect(left.some((item) => item.line.includes('attempt 4'))).toBe(false);
    expect(left.length).toBe(sent.filter((line) => !line.includes('attempt 4')).length);
  });
});
