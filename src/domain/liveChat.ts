import type { DirectMessage } from '@/data/types';

/** How often an open chat asks the server for messages Realtime may have missed. */
export const CHAT_POLL_MS = 10_000;

const CONNECTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Realtime filter for one chat. Null when the id is not a connection uuid. */
export function chatInsertFilter(connectionId: string): string | null {
  if (!CONNECTION_ID.test(connectionId)) return null;
  return `connection_id=eq.${connectionId}`;
}

export function messageFromRealtime(row: unknown): DirectMessage | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const id = text(record.id);
  const connectionId = text(record.connection_id);
  const senderId = text(record.sender_id);
  const body = text(record.body);
  const createdAt = text(record.created_at);
  if (!id || !connectionId || !senderId || !body || !createdAt) return null;
  return { id, connectionId, senderId, body, createdAt };
}

/** Keeps a message already on screen. A new one is ordered with the rest. */
export function withIncomingMessage(messages: readonly DirectMessage[], incoming: DirectMessage): readonly DirectMessage[] {
  if (messages.some((message) => message.id === incoming.id)) return messages;
  return [...messages, incoming].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function latestChatMessage(messages: readonly DirectMessage[], connectionId: string): DirectMessage | null {
  let latest: DirectMessage | null = null;
  for (const message of messages) {
    if (message.connectionId !== connectionId || message.delivery) continue;
    if (!latest || message.createdAt > latest.createdAt) latest = message;
  }
  return latest;
}

/** Messages from the other person after the last one this phone has shown. */
export function chatUnread(messages: readonly DirectMessage[], connectionId: string, meId: string, readThrough: string | null): number {
  return messages.filter((message) =>
    message.connectionId === connectionId &&
    message.senderId !== meId &&
    !message.delivery &&
    (readThrough == null || message.createdAt > readThrough)
  ).length;
}

export function chatsChoiceLabel(chatCount: number, unread: number): string {
  if (unread <= 0) return `Chats (${chatCount})`;
  if (unread === 1) return `Chats (${chatCount}) · 1 new`;
  return `Chats (${chatCount}) · ${unread} new`;
}

export function chatPreview(body: string): string {
  const line = body.replace(/\s+/g, ' ').trim();
  if (line.length <= 80) return line;
  return `${line.slice(0, 79)}…`;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
