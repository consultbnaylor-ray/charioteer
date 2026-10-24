import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ writes: 0 }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {
      storage.writes += 1;
    },
    removeItem: async () => undefined,
  },
}));

import { applyRemoteChatReads, markChatRead, noteServerChatRead } from '@/data/chatRead';

const USER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const CONNECTION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

describe('chat read line', () => {
  beforeEach(() => {
    storage.writes = 0;
    applyRemoteChatReads(`${USER}-reset-${Math.random()}`, {}, false);
  });

  it('saves again when the phone clock moved the local line and the server is still behind', async () => {
    const user = `${USER}-a`;
    applyRemoteChatReads(user, { [CONNECTION]: '2026-10-20T10:00:00.000Z' }, true);
    expect(await markChatRead(user, CONNECTION, '2026-10-20T10:05:00.000Z')).toBe(true);
    noteServerChatRead(user, CONNECTION, '2026-10-20T10:05:00.000Z');
    expect(await markChatRead(user, CONNECTION, '2026-10-20T10:05:00.000Z')).toBe(false);

    expect(await markChatRead(user, CONNECTION, '2026-10-20T10:06:00.000Z')).toBe(true);
    expect(await markChatRead(user, CONNECTION, '2026-10-20T10:05:30.000Z')).toBe(true);
    noteServerChatRead(user, CONNECTION, '2026-10-20T10:06:00.000Z');
    expect(await markChatRead(user, CONNECTION, '2026-10-20T10:05:30.000Z')).toBe(false);
    expect(storage.writes).toBeLessThan(20);
  });
});
