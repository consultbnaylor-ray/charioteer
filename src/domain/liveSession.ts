import { sessionFailureKind, tokenUsable, type SessionRefreshResult, type SessionTicket } from './edgeRetry';

export type SignedInSession =
  | { userId: string; accessToken: string }
  | { failure: 'signed-out' | 'connection' };

/**
 * Read the stored session, and refresh once when the access token is missing
 * or inside the expiry window. A usable token is returned as it is.
 * A network failure keeps a known user as "connection". No user is "signed-out".
 */
export async function resolveSignedInSession(input: {
  read: () => Promise<SessionRefreshResult>;
  refresh: () => Promise<SessionRefreshResult>;
  knownUserId?: string | null;
  now?: number;
}): Promise<SignedInSession> {
  const now = input.now ?? Date.now();
  let current: SessionTicket = { accessToken: null, expiresAt: null, userId: null };
  let readError: unknown = null;
  try {
    const read = await input.read();
    current = read.ticket;
    readError = read.error;
  } catch (error) {
    readError = error;
  }
  if (tokenUsable(current, now) && current.accessToken && current.userId) {
    return { userId: current.userId, accessToken: current.accessToken };
  }
  let refreshed: SessionTicket = { accessToken: null, expiresAt: null, userId: null };
  let refreshError: unknown = null;
  try {
    const result = await input.refresh();
    refreshed = result.ticket;
    refreshError = result.error;
  } catch (error) {
    refreshError = error;
  }
  const next = tokenUsable(refreshed, now) && refreshed.accessToken && refreshed.userId
    ? refreshed
    : tokenUsable(current, now) && current.accessToken && current.userId
      ? current
      : null;
  if (next?.accessToken && next.userId) return { userId: next.userId, accessToken: next.accessToken };
  const userId = refreshed.userId ?? current.userId ?? input.knownUserId ?? null;
  if (!userId) return { failure: 'signed-out' };
  const errors = [readError, refreshError].filter((error) => error != null);
  if (errors.some((error) => sessionFailureKind(error) === 'connection')) return { failure: 'connection' };
  return { failure: 'signed-out' };
}
