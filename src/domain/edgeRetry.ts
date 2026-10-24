import { sanitizeClientError } from './clientError';

/** Two further tries after the first. The pauses are 0.5s, then 1.5s. */
export const EDGE_RETRY_BACKOFF_MS = [500, 1500] as const;

export const EDGE_RETRY_STATUSES = [502, 503, 504, 546] as const;

export type EdgeSendState = 'sending' | 'waiting' | 'retrying';

export const EDGE_STATE_LABEL: Record<EdgeSendState, string> = {
  sending: 'Sending…',
  waiting: 'Waiting for Thumos…',
  retrying: 'Trying again…',
};

export const MEAL_UNREACHABLE = 'Couldn\'t reach the meal estimate – tap to retry.';
export const REFLECT_UNREACHABLE = 'Couldn\'t reach a reflection – tap to retry.';
export const PLAN_UNREACHABLE = 'Couldn\'t write a plan – tap to retry.';
/** The model wrote a plan, and the database did not keep it. */
export const PLAN_NOT_SAVED = 'Plan written but not saved — tap to retry.';
export const VOICE_UNREACHABLE = 'Couldn\'t reach voice. Text chat is still here.';

/** Shown when the stored session cannot be refreshed. */
export const SIGN_IN_AGAIN = 'Please sign in again.';
/** Shown when the session refresh itself cannot reach the network. */
export const CHECK_CONNECTION = 'Check your connection.';
export const ESTIMATE_WAIT_NOTE = 'This can take up to 20 seconds.';
/** The phone gives up on a meal estimate after this long. */
export const ESTIMATE_CLIENT_TIMEOUT_MS = 40_000;
/** The meal function gives up on the model and returns the on-device estimate. */
export const ESTIMATE_PROVIDER_TIMEOUT_MS = 28_000;

export type AiFeature = 'meal' | 'thumos' | 'plan' | 'reflect';
export type EdgeFailureKind = 'signed-out' | 'connection' | 'network' | 'timeout' | 'auth' | 'server';

/** A session refresh that did not produce a token. The message is the kind, not the meal. */
export class EdgeSessionError extends Error {
  readonly kind: 'signed-out' | 'connection';

  constructor(kind: 'signed-out' | 'connection') {
    super(kind);
    this.name = 'EdgeSessionError';
    this.kind = kind;
  }
}

export function aiCallMessage(feature: AiFeature, kind: EdgeFailureKind): string {
  if (kind === 'signed-out' || kind === 'auth') return SIGN_IN_AGAIN;
  if (kind === 'connection') return CHECK_CONNECTION;
  if (feature === 'plan' && kind === 'server') return PLAN_UNREACHABLE;
  if (feature === 'reflect' && kind === 'server') return REFLECT_UNREACHABLE;
  if (feature === 'thumos' && kind === 'server') return 'Thumos did not answer – tap to retry.';
  const name = feature === 'meal'
    ? 'The meal estimate'
    : feature === 'thumos'
      ? 'Thumos'
      : feature === 'plan'
        ? 'The health plan'
        : 'The reflection';
  if (kind === 'network') return `${name} lost the connection. Tap to retry.`;
  if (kind === 'timeout') return `${name} took too long. Tap to retry.`;
  return `${name} did not answer. Tap to retry.`;
}

/** True when the Thumos screen should offer Try again and the scripted reply. */
export function isThumosFallback(message: string): boolean {
  return message.startsWith('Couldn\'t reach Thumos')
    || message.startsWith('Thumos did not answer')
    || message.startsWith('Thumos lost the connection')
    || message.startsWith('Thumos took too long');
}

export type SessionTicket = {
  accessToken: string | null;
  /** Unix seconds, as stored on the session. */
  expiresAt: number | null;
  userId: string | null;
};

export type SessionRefreshResult = {
  ticket: SessionTicket;
  error: unknown;
};

const TOKEN_SKEW_MS = 60_000;

export function tokenUsable(ticket: SessionTicket, nowMs: number): boolean {
  if (!ticket.accessToken) return false;
  if (ticket.expiresAt == null || !Number.isFinite(ticket.expiresAt)) return true;
  return ticket.expiresAt * 1000 > nowMs + TOKEN_SKEW_MS;
}

/** A dropped refresh is a connection problem. Anything else is a session that is gone. */
export function sessionFailureKind(error: unknown): 'connection' | 'signed-out' {
  if (edgeErrorShouldRetry(error)) return 'connection';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (/network request failed|failed to fetch|load failed|network error|connection|timed out|timeout/i.test(message)) {
    return 'connection';
  }
  return 'signed-out';
}

/**
 * Refresh once before a model call, and once more if that refresh does not return a token.
 * A still-valid token is kept when both refreshes fail on the network.
 */
export async function prepareAiSession(input: {
  read: () => Promise<SessionTicket>;
  refresh: () => Promise<SessionRefreshResult>;
  now?: number;
}): Promise<{ accessToken: string; userId: string | null } | { failure: 'connection' | 'signed-out' }> {
  const now = input.now ?? Date.now();
  let current: SessionTicket = { accessToken: null, expiresAt: null, userId: null };
  let readError: unknown = null;
  try {
    current = await input.read();
  } catch (error) {
    readError = error;
    current = { accessToken: null, expiresAt: null, userId: null };
  }
  const attempt = async (): Promise<SessionRefreshResult> => {
    try {
      return await input.refresh();
    } catch (error) {
      return { ticket: { accessToken: null, expiresAt: null, userId: null }, error };
    }
  };
  const first = await attempt();
  if (tokenUsable(first.ticket, now) && first.ticket.accessToken) {
    return { accessToken: first.ticket.accessToken, userId: first.ticket.userId ?? current.userId };
  }
  const second = await attempt();
  if (tokenUsable(second.ticket, now) && second.ticket.accessToken) {
    return { accessToken: second.ticket.accessToken, userId: second.ticket.userId ?? current.userId };
  }
  if (tokenUsable(current, now) && current.accessToken) {
    return { accessToken: current.accessToken, userId: current.userId };
  }
  const errors = [readError, first.error, second.error].filter((error) => error != null);
  if (errors.some((error) => sessionFailureKind(error) === 'connection')) return { failure: 'connection' };
  return { failure: 'signed-out' };
}

export function classifyEdgeError(error: unknown): 'timeout' | 'network' {
  if (error instanceof EdgeSessionError) return 'network';
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  if (name === 'TimeoutError' || name === 'AbortError' || /timed out|timeout|\baborted\b/i.test(`${name} ${message}`)) return 'timeout';
  return 'network';
}

export function classifyEdgeStatus(status: number): 'auth' | 'server' | null {
  if (status === 401) return 'auth';
  if (status >= 500) return 'server';
  return null;
}

export function edgeStatusShouldRetry(status: number): boolean {
  return (EDGE_RETRY_STATUSES as readonly number[]).includes(status);
}

/** A dropped connection, not a refusal from the server. */
export function edgeErrorShouldRetry(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  if (name === 'TypeError' || name === 'AbortError' || name === 'TimeoutError') return true;
  const message = error instanceof Error ? error.message : '';
  return /network request failed|failed to fetch|load failed|network error|connection/i.test(message);
}

/** Name and message only. The person's words are never part of this line. */
export function edgeFailureLog(error: unknown, status?: number): string {
  const name = status != null ? `HTTP ${status}` : error instanceof Error ? (error.name || 'Error') : 'Error';
  const message = status != null ? '' : error instanceof Error ? error.message : '';
  return sanitizeClientError(new Error(message ? `${name}: ${message}` : name));
}

function abortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

export function freshConnectionInit(init: RequestInit, attempt: number): RequestInit {
  if (attempt === 0) return init;
  const headers = new Headers(init.headers);
  headers.set('Connection', 'close');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Retry-Attempt', String(attempt));
  return { ...init, headers, cache: 'no-store', keepalive: false };
}

export function retryUrl(url: string, attempt: number): string {
  if (attempt === 0) return url;
  const join = url.includes('?') ? '&' : '?';
  return `${url}${join}attempt=${attempt}`;
}

/**
 * One call, then up to two more, on a dropped connection or 502, 503, 504, or 546.
 * A retry closes the previous connection so a stale HTTP/3 session is not reused.
 */
export async function postWithRetry(input: {
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
  url: string;
  init: RequestInit;
  onState?: (state: EdgeSendState) => void;
  sleep?: (ms: number) => Promise<void>;
}): Promise<Response> {
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  for (let attempt = 0; attempt < EDGE_RETRY_BACKOFF_MS.length + 1; attempt += 1) {
    if (input.init.signal?.aborted) throw lastError instanceof Error ? lastError : abortError();
    input.onState?.(attempt === 0 ? 'sending' : 'retrying');
    try {
      input.onState?.('waiting');
      const response = await input.fetchImpl(retryUrl(input.url, attempt), freshConnectionInit(input.init, attempt));
      if (edgeStatusShouldRetry(response.status) && attempt < EDGE_RETRY_BACKOFF_MS.length) {
        await sleep(EDGE_RETRY_BACKOFF_MS[attempt] ?? 1500);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (input.init.signal?.aborted) throw error;
      if (!edgeErrorShouldRetry(error) || attempt >= EDGE_RETRY_BACKOFF_MS.length) throw error;
      await sleep(EDGE_RETRY_BACKOFF_MS[attempt] ?? 1500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not reach the server.');
}
