import type { DirectMessage } from '@/data/types';

/** How often an open chat asks the server for messages Realtime may have missed. */
export const CHAT_POLL_MS = 10_000;

/** Shown when the message query fails. An empty chat uses a different line. */
export const CHAT_HISTORY_ERROR = "Couldn't load messages – Try again";

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

/** Milliseconds since epoch. A blank or unreadable time sorts first and is never "after" a real line. */
export function chatInstant(value: string): number {
  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

export function latestChatMessage(messages: readonly DirectMessage[], connectionId: string): DirectMessage | null {
  let latest: DirectMessage | null = null;
  for (const message of messages) {
    if (message.connectionId !== connectionId || message.delivery) continue;
    if (!latest || chatInstant(message.createdAt) > chatInstant(latest.createdAt)) latest = message;
  }
  return latest;
}

/** The viewer's own latest sent line in one chat. Drafts still in flight do not count. */
export function latestOwnChatMessage(messages: readonly DirectMessage[], connectionId: string, meId: string): DirectMessage | null {
  let latest: DirectMessage | null = null;
  for (const message of messages) {
    if (message.connectionId !== connectionId || message.senderId !== meId || message.delivery) continue;
    if (!latest || chatInstant(message.createdAt) > chatInstant(latest.createdAt)) latest = message;
  }
  return latest;
}

/**
 * Saved read line when this person has one.
 * Otherwise their own latest message, so a reply that arrived after they wrote still counts.
 * The newest message in the chat is not the line: that would hide the reply.
 */
export function initialReadThrough(ownLatestAt: string | null, saved: string | null | undefined): string | null {
  if (saved) return saved;
  return ownLatestAt || null;
}

/** Unread count for one chat, using a saved mark or the viewer's own latest message. */
export function viewerChatUnread(
  messages: readonly DirectMessage[],
  connectionId: string,
  meId: string,
  saved: string | null | undefined,
): number {
  const own = latestOwnChatMessage(messages, connectionId, meId)?.createdAt ?? null;
  return chatUnread(messages, connectionId, meId, initialReadThrough(own, saved));
}

/** Unread direct messages across accepted chats. Own lines and unsent drafts are left out. */
export function messageUnreadTotal(
  messages: readonly DirectMessage[],
  connectionIds: readonly string[],
  meId: string,
  readMarks: Readonly<Record<string, string | null | undefined>>,
): number {
  let sum = 0;
  for (const connectionId of connectionIds) {
    sum += viewerChatUnread(messages, connectionId, meId, readMarks[connectionId]);
  }
  return sum;
}

/** Later instant wins. An equal time keeps the mark already stored. */
export function mergeReadMarks(local: Readonly<Record<string, string>>, remote: Readonly<Record<string, string>>): Record<string, string> {
  const merged: Record<string, string> = { ...local };
  for (const [id, at] of Object.entries(remote)) {
    if (!at) continue;
    const previous = merged[id];
    if (!previous || chatInstant(at) > chatInstant(previous)) merged[id] = at;
  }
  return merged;
}

/** Messages from the other person after the last one this person has read. No line yet counts them all. */
export function chatUnread(messages: readonly DirectMessage[], connectionId: string, meId: string, readThrough: string | null): number {
  const readAt = readThrough == null ? null : chatInstant(readThrough);
  return messages.filter((message) =>
    message.connectionId === connectionId &&
    message.senderId !== meId &&
    !message.delivery &&
    (readAt == null || chatInstant(message.createdAt) > readAt)
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
