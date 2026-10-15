import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { DirectMessage } from '@/data/types';

import { CHAT_HISTORY_ERROR, CHAT_POLL_MS, chatInsertFilter, chatPreview, chatUnread, chatsChoiceLabel, latestChatMessage, messageFromRealtime, withIncomingMessage } from './liveChat';
import { PROFILE_LOAD_ERROR } from './profileSharing';

function message(id: string, senderId: string, createdAt: string, connectionId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'): DirectMessage {
  return { id, connectionId, senderId, body: `Hello ${id}`, createdAt };
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
    expect(latestChatMessage(rows, connectionId)?.id).toBe('m3');
    expect(chatsChoiceLabel(4, 0)).toBe('Chats (4)');
    expect(chatsChoiceLabel(4, 1)).toBe('Chats (4) · 1 new');
    expect(chatsChoiceLabel(4, 3)).toBe('Chats (4) · 3 new');
    expect(chatPreview('Line one\nLine two')).toBe('Line one Line two');
    expect(CHAT_POLL_MS).toBe(10_000);
  });

  it('subscribes the open chat, polls, and refreshes on foreground and a tapped notification', () => {
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const chat = readFileSync('src/app/(main)/chat/[id].tsx', 'utf8');
    const people = readFileSync('src/app/(main)/people.tsx', 'utf8');
    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    const sql = readFileSync('supabase/migrations/20261013072000_direct_messages_realtime.sql', 'utf8');
    expect(repo).toContain("event: 'INSERT'");
    expect(repo).toContain("table: 'direct_messages'");
    expect(repo).toContain('chatInsertFilter');
    expect(repo).toContain('watchChat');
    expect(repo).toContain('reloadMessages');
    expect(chat).toContain('watchChat');
    expect(chat).toContain('CHAT_POLL_MS');
    expect(chat).toContain('reloadMessages');
    expect(chat).toContain('markChatRead');
    expect(chat).toContain('AppState');
    expect(chat).toContain('CHAT_HISTORY_ERROR');
    const open = chat.slice(chat.indexOf('if (!connectionId) return;'), chat.indexOf('void markChatRead'));
    expect(open.indexOf('repo.reloadMessages()')).toBeGreaterThan(-1);
    expect(open.indexOf('repo.reloadMessages()')).toBeLessThan(open.indexOf('setInterval'));
    expect(open).toContain("addEventListener('change'");
    expect(CHAT_HISTORY_ERROR).toBe("Couldn't load messages – Try again");
    expect(people).toContain('chatUnread');
    expect(people).toContain('chatsChoiceLabel');
    expect(people).not.toMatch(/gratitude/);
    expect(people).not.toMatch(/thumos|xai|progress-photos/i);
    expect(layout).toContain('AppState');
    expect(layout).toContain('reloadMessages');
    expect(layout).toContain('reloadMessages().catch');
    expect(layout).toContain('listenForMessageOpens');
    const reload = repo.slice(repo.indexOf('async reloadMessages'), repo.indexOf('watchChat'));
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