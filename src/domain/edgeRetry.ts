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
      if (!edgeErrorShouldRetry(error) || attempt >= EDGE_RETRY_BACKOFF_MS.length) throw error;
      await sleep(EDGE_RETRY_BACKOFF_MS[attempt] ?? 1500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not reach the server.');
}
