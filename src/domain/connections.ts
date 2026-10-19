import type { Connection } from '@/data/types';

/** What the Discover card (and the open profile on that card) should offer. */
export type DiscoverAction =
  | { kind: 'ask' }
  | { kind: 'incoming'; connectionId: string }
  | { kind: 'sent' }
  | { kind: 'message'; connectionId: string };

/** The first live link between two people. A declined request does not count. */
export function discoverAction(connections: readonly Connection[], meId: string, otherId: string): DiscoverAction {
  const link = connections.find((connection) =>
    connection.status !== 'declined' &&
    ((connection.requesterId === meId && connection.addresseeId === otherId) ||
      (connection.requesterId === otherId && connection.addresseeId === meId)));
  if (!link) return { kind: 'ask' };
  if (link.status === 'accepted') return { kind: 'message', connectionId: link.id };
  if (link.requesterId === otherId) return { kind: 'incoming', connectionId: link.id };
  return { kind: 'sent' };
}

export function incomingRequestCount(connections: readonly Connection[], meId: string): number {
  return connections.filter((connection) => connection.status === 'pending' && connection.addresseeId === meId).length;
}

/** Spoken name for the People tab. The visible word stays “People”; the count is the badge. */
export function peopleTabAccessibilityLabel(requestCount: number, messageUnread = 0): string {
  const parts: string[] = [];
  if (requestCount === 1) parts.push('1 request');
  else if (requestCount > 1) parts.push(`${requestCount} requests`);
  if (messageUnread === 1) parts.push('1 new message');
  else if (messageUnread > 1) parts.push(`${messageUnread} new messages`);
  if (parts.length === 0) return 'People';
  return `People, ${parts.join(', ')}`;
}

/** People tab badge: waiting requests plus unread direct messages. */
export function peopleTabBadgeCount(requestCount: number, messageUnread: number): number {
  return Math.max(0, requestCount) + Math.max(0, messageUnread);
}

/** Digits drawn in the badge. Null hides it. Counts above 99 stay on one line. */
export function requestBadgeText(count: number): string | null {
  if (count <= 0) return null;
  if (count > 99) return '99+';
  return String(count);
}
