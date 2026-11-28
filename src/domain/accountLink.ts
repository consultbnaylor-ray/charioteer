import { sessionFailureKind } from './edgeRetry';

/** Shown while a saved sign-in is still being refreshed. Data calls wait. */
export const RECONNECTING_ACCOUNT = 'Reconnecting your account…';

export type AccountLink = 'reconnecting' | 'sign-in';

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && status >= 0 && status <= 599 ? status : null;
}

/**
 * A dropped or unreadable refresh keeps the account and tries again.
 * A rejected refresh token asks the person to sign in.
 */
export function accountLinkForRefreshError(error: unknown): AccountLink {
  const name = error instanceof Error ? error.name : '';
  const status = statusOf(error);
  if (name === 'AuthRetryableFetchError' || status === 0 || (status != null && status >= 500)) return 'reconnecting';
  if (status != null && status >= 400 && status < 500) return 'sign-in';
  if (sessionFailureKind(error) === 'connection') return 'reconnecting';
  return 'sign-in';
}

export function authorizationHeader(headers: HeadersInit | undefined): string | null {
  if (!headers) return null;
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.get('Authorization');
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === 'authorization');
    return found ? String(found[1]) : null;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'authorization') return String(value);
  }
  return null;
}

/** True when the bearer is missing, the anon key, or a publishable key. */
export function authorizationIsAnonymous(authorization: string | null, anonKey: string): boolean {
  if (!authorization) return true;
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) return true;
  if (anonKey && token === anonKey) return true;
  return token.startsWith('sb_publishable_') || token.startsWith('sb_secret_');
}

/** A signed-in phone must not send catalogue calls with the publishable key. */
export function shouldHoldAnonymousData(input: {
  hasUser: boolean;
  authorization: string | null;
  anonKey: string;
}): boolean {
  return input.hasUser && authorizationIsAnonymous(input.authorization, input.anonKey);
}
