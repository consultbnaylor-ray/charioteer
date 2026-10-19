import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { DirectMessage } from '@/data/types';

import { subscribeAccountMessages, type MessageRealtime } from '@/data/messageChannel';

import { CHAT_HISTORY_ERROR, CHAT_POLL_MS, chatInsertFilter, chatPreview, chatUnread, chatsChoiceLabel, initialReadThrough, latestChatMessage, latestOwnChatMessage, mergeReadMarks, messageFromRealtime, messageUnreadTotal, viewerChatUnread, withIncomingMessage } from './liveChat';
import { PROFILE_LOAD_ERROR } from './profileSharing';

function message(id: string, senderId: string, createdAt: string, connectionId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'): DirectMessage {
  return { id, connectionId, senderId, body: `Hello ${id}`, createdAt };
}

/** Same rule as realtime-js: a name returns the channel already subscribed. */
function fakeRealtime(): MessageRealtime & { names: () => string[] } {
  const channels = new Map<string, ReturnType<MessageRealtime['channel']>>();
  return {
    names: () => [...channels.keys()],
    removeChannel() {},
    channel(name: string) {
      const existing = channels.get(name);
      if (existing) return existing;
      let subscribed = false;
      const channel: ReturnType<MessageRealtime['channel']> = {
        on() {
          if (subscribed) throw new Error(`cannot add postgres_changes callbacks for realtime:${name} after subscribe()`);
          return channel;
        },
        subscribe(callback) {
          subscribed = true;
          callback?.('SUBSCRIBED');
          return channel;
        },
      };
      channels.set(name, channel);
      return channel;
    },
  };
}

describe('live chat', () => {
  const connectionId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

  it('filters inserts to one connection and ignores a bad id', () => {
    expect(chatInsertFilter(connectionId)).toBe(`connection_id=eq.${connectionId}`);
    expect(chatInsertFilter('not a connection')).toBeNull();
    expect(chatInsertFilter(`${connectionId};drop`)).toBeNull();
  });

  it('reads a realtime insert and does not add it twice', () => {
    const incoming = messageFromRealtime({
      id: 'm2',
      connection_id: connectionId,
      sender_id: 'ceri',
      body: 'Are you there?',
      created_at: '2026-10-13T09:00:00.000Z',
    });
    expect(incoming?.body).toBe('Are you there?');
    expect(messageFromRealtime({ id: 'm2' })).toBeNull();
    const first = message('m1', 'ben', '2026-10-13T08:00:00.000Z');
    const added = withIncomingMessage([first], incoming!);
    expect(added.map((item) => item.id)).toEqual(['m1', 'm2']);
    expect(withIncomingMessage(added, incoming!)).toBe(added);
  });

  it('counts unread messages from the other person and names the chats tab', () => {
    const rows = [
      message('m1', 'ben', '2026-10-13T08:00:00.000Z'),
      message('m2', 'ceri', '2026-10-13T09:00:00.000Z'),
      message('m3', 'ceri', '2026-10-13T10:00:00.000Z'),
      { ...message('m4', 'ceri', '2026-10-13T11:00:00.000Z'), delivery: 'sending' as const },
    ];
    expect(chatUnread(rows, connectionId, 'ben', null)).toBe(2);
    expect(chatUnread(rows, connectionId, 'ben', '2026-10-13T09:00:00.000Z')).toBe(1);
    expect(chatUnread(rows, connectionId, 'ben', '2026-10-13T10:00:00.000Z')).toBe(0);
    expect(chatUnread(rows, connectionId, 'ben', '2026-10-13T10:00:00+00:00')).toBe(0);
    const own = latestOwnChatMessage(rows, connectionId, 'ben')?.createdAt ?? null;
    expect(own).toBe('2026-10-13T08:00:00.000Z');
    expect(initialReadThrough(own, null)).toBe('2026-10-13T08:00:00.000Z');
    expect(chatUnread(rows, connectionId, 'ben', initialReadThrough(own, null))).toBe(2);
    expect(initialReadThrough(own, '2026-10-13T09:00:00.000Z')).toBe('2026-10-13T09:00:00.000Z');
    expect(initialReadThrough('2026-10-13T12:00:00.000Z', '2026-10-13T09:00:00.000Z')).toBe('2026-10-13T09:00:00.000Z');
    const later = [...rows, message('m5', 'ceri', '2026-10-13T12:00:00.000Z')];
    expect(chatUnread(later, connectionId, 'ben', '2026-10-13T09:00:00.000Z')).toBe(2);
    expect(messageUnreadTotal(later, [connectionId, 'other-chat'], 'ben', { [connectionId]: '2026-10-13T09:00:00.000Z' })).toBe(2);
    expect(messageUnreadTotal(later, [connectionId], 'ben', {})).toBe(3);
    expect(mergeReadMarks(
      { [connectionId]: '2026-10-13T09:00:00.000Z' },
      { [connectionId]: '2026-10-13T08:00:00+00:00', other: '2026-10-13T11:00:00.000Z' },
    )).toEqual({ [connectionId]: '2026-10-13T09:00:00.000Z', other: '2026-10-13T11:00:00.000Z' });
    expect(latestChatMessage(rows, connectionId)?.id).toBe('m3');
    expect(chatsChoiceLabel(4, 0)).toBe('Chats (4)');
    expect(chatsChoiceLabel(4, 1)).toBe('Chats (4) · 1 new');
    expect(chatsChoiceLabel(4, 3)).toBe('Chats (4) · 3 new');
    expect(chatPreview('Line one\nLine two')).toBe('Line one Line two');
    expect(CHAT_POLL_MS).toBe(10_000);
  });

  it('counts incoming messages when there is no saved read mark', () => {
    const rows = [
      message('m1', 'ceri', '2026-10-13T08:00:00.000Z'),
      message('m2', 'ben', '2026-10-13T09:00:00.000Z'),
      message('m3', 'ceri', '2026-10-13T10:00:00.000Z'),
    ];
    expect(viewerChatUnread(rows, connectionId, 'ben', null)).toBe(1);
    expect(viewerChatUnread(rows, connectionId, 'ben', undefined)).toBe(1);
    expect(chatUnread(rows, connectionId, 'ben', latestChatMessage(rows, connectionId)?.createdAt ?? null)).toBe(0);
    expect(viewerChatUnread(rows, connectionId, 'ben', '2026-10-13T10:00:00.000Z')).toBe(0);
    expect(viewerChatUnread([rows[0], rows[2]], connectionId, 'ben', null)).toBe(2);
    expect(messageUnreadTotal(rows, [connectionId], 'ben', {})).toBe(1);
  });

  it('opens the same chat twice without throwing', () => {
    const client = fakeRealtime();
    const first = client.channel('direct-messages');
    first.subscribe();
    expect(() => first.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => undefined)).toThrow(/after subscribe/);
    const shared = fakeRealtime();
    expect(() => {
      subscribeAccountMessages(shared, () => undefined);
      subscribeAccountMessages(shared, () => undefined);
    }).not.toThrow();
    expect(shared.names()).toEqual(['direct-messages']);
  });

  it('keeps one message channel, polls the open chat, and refreshes on foreground and a tapped notification', () => {
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const channel = readFileSync('src/data/messageChannel.ts', 'utf8');
    const chat = readFileSync('src/app/(main)/chat/[id].tsx', 'utf8');
    const people = readFileSync('src/app/(main)/people.tsx', 'utf8');
    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    const sql = readFileSync('supabase/migrations/20261013072000_direct_messages_realtime.sql', 'utf8');
    expect(channel).toContain("DIRECT_MESSAGES_CHANNEL = 'direct-messages'");
    expect(channel).toContain("event: 'INSERT'");
    expect(channel).toContain("table: 'direct_messages'");
    expect(channel).toContain("status === 'SUBSCRIBED'");
    expect(channel).toContain('removeChannel');
    expect(repo).toContain('subscribeAccountMessages');
    expect(repo).not.toContain('watchChat');
    expect(repo).not.toContain('channel(`chat:');
    expect(repo).toContain('reloadMessages');
    expect(chat).not.toContain('watchChat');
    expect(chat).toContain('direct-messages');
    expect(chat).toContain('CHAT_POLL_MS');
    expect(chat).toContain('reloadMessages');
    expect(chat).toContain('markChatRead');
    expect(chat).toContain('saveChatRead');
    expect(chat).toContain('ScreenBoundary');
    expect(chat).toContain('screen="chat"');
    expect(chat).toContain('message.body ??');
    expect(chat).toContain('AppState');
    expect(chat).toContain('CHAT_HISTORY_ERROR');
    const open = chat.slice(chat.indexOf('if (!connectionId) return;'), chat.indexOf('void markChatRead'));
    expect(open.indexOf('repo.reloadMessages()')).toBeGreaterThan(-1);
    expect(open.indexOf('repo.reloadMessages()')).toBeLessThan(open.indexOf('setInterval'));
    expect(open).toContain("addEventListener('change'");
    expect(CHAT_HISTORY_ERROR).toBe("Couldn't load messages – Try again");
    expect(people).toContain('viewerChatUnread');
    expect(people).toContain('router.navigate(`/chat/');
    expect(people).not.toContain('router.push(`/chat/');
    expect(people).toContain('chatsChoiceLabel');
    expect(people).toContain('ScreenBoundary');
    expect(people).toContain('screen="profile"');
    const chatRead = readFileSync('src/ui/chatRead.ts', 'utf8');
    expect(chatRead).toContain('saveChatRead');
    expect(chatRead).not.toContain('markChatRead');
    expect(chatRead).not.toContain('initialReadThrough');
    expect(people).toContain('CountBadge');
    expect(people).toContain('badge={unreadTotal}');
    expect(people).toContain("tone={unreadTotal > 0 ? 'alert' : 'default'}");
    expect(people).toContain('messageUnreadTotal');
    const main = readFileSync('src/app/(main)/_layout.tsx', 'utf8');
    expect(main).toContain('peopleTabBadgeCount');
    expect(main).toContain('messageUnreadTotal');
    expect(main).toContain('dismissTo');
    expect(main).toContain('dangerouslySingular');
    expect(main).toContain('name="chat/[id]"');
    expect(layout).toContain('listenForIncomingMessages');
    expect(layout).toContain('setAppIconBadge');
    expect(layout).toContain('function MessageIconBadge');
    const icon = layout.slice(layout.indexOf('function MessageIconBadge'), layout.indexOf('function NoteStackMounted'));
    expect(icon).toContain('messageUnreadTotal');
    expect(icon).toContain('setAppIconBadge(count)');
    expect(icon).toContain('setAppIconBadge(0)');
    expect(icon).not.toContain('incomingRequestCount');
    const register = readFileSync('src/notifications/register.ts', 'utf8');
    expect(register).toContain('addNotificationReceivedListener');
    expect(register).toContain('setBadgeCountAsync');
    expect(register).toContain("if (!connectionIdFrom(notification.request.content.data)) return");
    expect(register).toContain('shouldSetBadge: false');
    expect(repo).toContain('subscribeAccountMessages');
    expect(readFileSync('src/data/chatRead.ts', 'utf8')).toContain('applyRemoteChatReads');
    const reads = readFileSync('supabase/migrations/20261015061000_chat_reads_and_client_errors.sql', 'utf8');
    expect(reads).toContain('create table public.chat_reads');
    expect(reads).toContain('create table public.client_errors');
    expect(reads).toContain('enable row level security');
    expect(reads).toContain('user_id = auth.uid()');
    expect(reads).toContain('revoke all on table public.chat_reads');
    expect(reads).toContain('revoke all on table public.client_errors');
    expect(reads).not.toContain('message body');
    expect(repo).toContain("rpc('save_chat_read'");
    expect(repo).toContain("from('chat_reads')");
    expect(repo).toContain("from('client_errors')");
    expect(people).not.toMatch(/gratitude/);
    expect(people).not.toMatch(/thumos|xai|progress-photos/i);
    expect(layout).toContain('AppState');
    expect(layout).toContain('reloadMessages');
    expect(layout).toContain('reloadMessages().catch');
    expect(layout).toContain('listenForMessageOpens');
    const reload = repo.slice(repo.indexOf('async reloadMessages'), repo.indexOf('private emit'));
    expect(reload).toContain('if (messageRes.error) throw asUserFacing');
    expect(reload).not.toContain('if (messageRes.error) return');
    const profile = repo.slice(repo.indexOf('async publicProfile'), repo.indexOf('async addProfilePhoto'));
    const facts = readFileSync('src/ui/CommunityProfile.tsx', 'utf8');
    expect(profile).toContain("if (error) throw asUserFacing(error, 'general')");
    expect(profile).not.toContain('return null');
    expect(facts).toContain('{PROFILE_LOAD_ERROR}');
    expect(facts).toContain('This profile is hidden.');
    expect(facts).toContain('setAttempt');
    expect(PROFILE_LOAD_ERROR).toBe("Couldn't load profile – Try again");
    expect(sql).toContain('supabase_realtime');
    expect(sql).toContain('direct_messages');
    expect(sql).toContain('replica identity full');
    expect(sql).toContain('pg_publication_tables');
  });
});