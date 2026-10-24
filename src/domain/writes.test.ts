import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

import { DemoRepository } from '@/data/demo-repository';
import { DEMO_PASSWORD } from '@/data/demo-seed';
import type { DirectMessage } from '@/data/types';

import { isDuplicateWrite, mergeOutgoingMessages, shareInflight } from './writes';

const message = (id: string, body = 'Hello'): DirectMessage => ({
  id,
  connectionId: 'chat',
  senderId: 'me',
  body,
  createdAt: '2026-10-13T08:00:00.000Z',
});

describe('writes that must not double', () => {
  it('runs one in-flight call for a key', async () => {
    const once = shareInflight();
    let calls = 0;
    const work = () => once('send', async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await Promise.all([work(), work(), work()]);
    expect(calls).toBe(1);
    await work();
    expect(calls).toBe(2);
  });

  it('treats a unique violation as the row already being saved', () => {
    expect(isDuplicateWrite({ code: '23505', message: 'duplicate key value' })).toBe(true);
    expect(isDuplicateWrite({ message: 'duplicate key value violates unique constraint' })).toBe(true);
    expect(isDuplicateWrite({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isDuplicateWrite(null)).toBe(false);
  });

  it('keeps a sending message until the server copy arrives', () => {
    const sending = { ...message('local'), createdAt: '2026-10-13T09:00:00.000Z', delivery: 'sending' as const };
    expect(mergeOutgoingMessages([message('old')], [sending]).map((item) => item.id)).toEqual(['old', 'local']);
    expect(mergeOutgoingMessages([message('local')], [sending])).toEqual([message('local')]);
    expect(mergeOutgoingMessages([], [])).toEqual([]);
  });

  it('stores one message and one request when the same client id is sent twice', async () => {
    const repo = new DemoRepository();
    await new Promise<void>((resolve) => {
      if (repo.getSnapshot().ready) {
        resolve();
        return;
      }
      const stop = repo.subscribe(() => {
        if (!repo.getSnapshot().ready) return;
        stop();
        resolve();
      });
    });
    await repo.signIn('alex.hart@example.com', DEMO_PASSWORD);
    const snap = repo.getSnapshot();
    const me = snap.profile?.id;
    const priya = snap.directory.find((card) => card.displayName === 'Priya Shah');
    const chat = snap.connections.find((connection) => connection.status === 'accepted');
    expect(me).toBeTruthy();
    expect(priya).toBeTruthy();
    expect(chat).toBeTruthy();
    const messageId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const requestId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await Promise.all([
      repo.sendDirectMessage(chat!.id, 'On my way', messageId),
      repo.sendDirectMessage(chat!.id, 'On my way', messageId),
      repo.requestConnection(priya!.id, requestId),
      repo.requestConnection(priya!.id, requestId),
    ]);
    await repo.sendDirectMessage(chat!.id, 'On my way', messageId);
    await repo.requestConnection(priya!.id, requestId);
    const saved = repo.getSnapshot();
    expect(saved.messages.filter((item) => item.id === messageId)).toHaveLength(1);
    expect(saved.messages.find((item) => item.id === messageId)?.body).toBe('On my way');
    expect(saved.connections.filter((item) => item.id === requestId)).toHaveLength(1);
    expect(saved.connections.find((item) => item.addresseeId === priya!.id && item.requesterId === me && item.status !== 'declined')).toBeTruthy();
  });

  it('shows a sending state on People and chat, and a growing message box', () => {
    const people = readFileSync('src/app/(main)/people.tsx', 'utf8');
    const chat = readFileSync('src/app/(main)/chat/[id].tsx', 'utf8');
    const field = readFileSync('src/ui/ui.tsx', 'utf8');
    expect(people).toContain('pendingLabel="Sending..."');
    expect(people).toContain('usePendingPress');
    expect(people).toContain('requestConnection');
    expect(people).not.toMatch(/gratitude/);
    expect(people).not.toMatch(/thumos|xai|progress-photos/i);
    expect(chat).toContain('pendingLabel="Sending..."');
    expect(chat).toContain('delivery === \'sending\'');
    expect(chat).toContain('delivery === \'failed\'');
    expect(chat).toContain('Try again');
    expect(chat).toContain('minLines={4}');
    expect(chat).toContain('maxLines={6}');
    expect(chat).toContain('multiline');
    expect(field).toContain('pendingLabel');
    expect(readFileSync('src/data/supabase-repository.ts', 'utf8')).toContain('isDuplicateWrite');
    expect(readFileSync('src/data/demo-repository.ts', 'utf8')).toContain('shareInflight');
  });
});
