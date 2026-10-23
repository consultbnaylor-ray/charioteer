import type { Connection, DirectoryCard } from '@/data/types';

/** People shown before the rest of a long list. */
export const PEOPLE_LIST_FOLD = 5;

export const BUDDIES_HINT = "People you've buddied up with";
export const COMMUNITY_HINT = 'Community members you can connect with';
export const BUDDIES_EMPTY = 'No buddies yet. Ask someone in Community, or accept a request. They stay on this list.';
export const REQUESTS_HEADING = 'Requests';
export const SENT_HEADING = 'Request sent';

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

export type PeopleLists = {
  incoming: Connection[];
  accepted: Connection[];
  outgoing: Connection[];
  community: DirectoryCard[];
};

/** The other person on a connection. */
export function connectionOtherId(connection: Connection, meId: string): string {
  return connection.requesterId === meId ? connection.addresseeId : connection.requesterId;
}

/**
 * Buddies are accepted links plus requests still waiting.
 * Community is everyone else still on the directory.
 * A declined request returns that person to Community.
 * An accepted or pending person stays on Buddies even when the directory row is missing.
 */
export function peopleLists(
  directory: readonly DirectoryCard[],
  connections: readonly Connection[],
  meId: string,
): PeopleLists {
  const live = new Map<string, Connection>();
  for (const connection of connections) {
    if (connection.status === 'declined') continue;
    const other = connectionOtherId(connection, meId);
    if (!other || other === meId) continue;
    const known = live.get(other);
    if (!known || (known.status !== 'accepted' && connection.status === 'accepted')) live.set(other, connection);
  }
  const incoming: Connection[] = [];
  const accepted: Connection[] = [];
  const outgoing: Connection[] = [];
  for (const connection of live.values()) {
    if (connection.status === 'accepted') accepted.push(connection);
    else if (connection.addresseeId === meId) incoming.push(connection);
    else outgoing.push(connection);
  }
  const community = directory.filter((card) => card.id !== meId && !live.has(card.id));
  return { incoming, accepted, outgoing, community };
}

export function buddyCount(lists: Pick<PeopleLists, 'incoming' | 'accepted' | 'outgoing'>): number {
  return lists.incoming.length + lists.accepted.length + lists.outgoing.length;
}

/** The first rows of a long list, and how many are still hidden. */
export function foldedRows<T>(rows: readonly T[], open: boolean, fold = PEOPLE_LIST_FOLD): { shown: T[]; hidden: number } {
  if (open || rows.length <= fold) return { shown: [...rows], hidden: 0 };
  return { shown: rows.slice(0, fold), hidden: rows.length - fold };
}

/** Digits drawn in the badge. Null hides it. Counts above 99 stay on one line. */
export function requestBadgeText(count: number): string | null {
  if (count <= 0) return null;
  if (count > 99) return '99+';
  return String(count);
}
