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
export function peopleTabAccessibilityLabel(count: number): string {
  if (count <= 0) return 'People';
  if (count === 1) return 'People, 1 request';
  return `People, ${count} requests`;
}

/** Digits drawn in the badge. Null hides it. Counts above 99 stay on one line. */
export function requestBadgeText(count: number): string | null {
  if (count <= 0) return null;
  if (count > 99) return '99+';
  return String(count);
}
