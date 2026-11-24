import { ESTIMATE_CLIENT_TIMEOUT_MS } from './edgeRetry';
import { isTransientNetworkError } from './errors';

/** Auth and database calls. A stalled session refresh cannot sit here forever. */
export const FETCH_TIMEOUT_MS = 30_000;
/**
 * A token refresh is not aborted before this.
 * auth-js retries a 200 it cannot read at 0.2s, 0.4s, … 12.8s. Cutting the
 * request in that window makes iOS drop the body after the server has already
 * rotated the token.
 */
export const REFRESH_MIN_LIFE_MS = 15_000;
/** Photo and file uploads. Longer than a database read, still bounded. */
export const UPLOAD_FETCH_TIMEOUT_MS = 120_000;

const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']);

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

export function isIdempotentRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  return IDEMPOTENT.has(requestMethod(input, init));
}

function headerText(headers: HeadersInit | undefined, name: string): string {
  if (!headers) return '';
  const wanted = name.toLowerCase();
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.get(name) ?? '';
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === wanted);
    return found ? String(found[1]) : '';
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return String(value);
  }
  return '';
}

function preferHeader(input: RequestInfo | URL, init?: RequestInit): string {
  const fromInit = headerText(init?.headers, 'prefer');
  if (fromInit) return fromInit;
  if (typeof Request !== 'undefined' && input instanceof Request) return headerText(input.headers, 'prefer');
  return '';
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return '';
}

/**
 * POSTs that write the same rows if they run twice.
 * save_check_in upserts on the check-in id. set_reasons deletes this user's rows, then inserts the list, with the profile locked.
 */
const RETRY_SAFE_RPC = new Set(['save_check_in', 'set_reasons']);

export function retrySafeRpcName(input: RequestInfo | URL): string | null {
  const raw = requestUrl(input);
  if (!raw) return null;
  let path = raw;
  try {
    path = new URL(raw, 'https://charioteer.invalid').pathname;
  } catch {
    return null;
  }
  const match = path.match(/\/rest\/v1\/rpc\/([^/]+)\/?$/);
  const name = match?.[1] ?? '';
  return RETRY_SAFE_RPC.has(name) ? name : null;
}

/** GET-style requests, a health upsert, save_check_in, and set_reasons. Those two writes cannot duplicate. */
export function isRetrySafeRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (isIdempotentRequest(input, init)) return true;
  if (/resolution=merge-duplicates/i.test(preferHeader(input, init))) return true;
  return requestMethod(input, init) === 'POST' && retrySafeRpcName(input) != null;
}

/** Auth token refresh, database reads and writes, and anything else that is not an upload or a long edge call. */
export function fetchTimeoutMs(input: RequestInfo | URL, init?: RequestInit): number {
  const url = requestUrl(input);
  const method = requestMethod(input, init);
  if (/\/functions\/v1\/estimate-meal(?:\?|$)/.test(url)) return ESTIMATE_CLIENT_TIMEOUT_MS;
  if (/\/functions\/v1\//.test(url)) return ESTIMATE_CLIENT_TIMEOUT_MS;
  if (/\/storage\/v1\/object\//.test(url) && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    return UPLOAD_FETCH_TIMEOUT_MS;
  }
  return FETCH_TIMEOUT_MS;
}

export function isAuthRequest(input: RequestInfo | URL): boolean {
  return /\/auth\/v1\//.test(requestUrl(input));
}

/** True for the GoTrue refresh call. Sign-in uses the same path with a different grant. */
export function isRefreshTokenRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (requestMethod(input, init) !== 'POST') return false;
  const url = requestUrl(input);
  return /\/auth\/v1\/token/.test(url) && /grant_type=refresh_token/.test(url);
}

export function combineAbortSignals(first?: AbortSignal | null, second?: AbortSignal | null): AbortSignal | undefined {
  if (!first && !second) return undefined;
  if (first && !second) return first;
  if (second && !first) return second;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (first?.aborted || second?.aborted) {
    controller.abort();
    return controller.signal;
  }
  first?.addEventListener('abort', abort, { once: true });
  second?.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

function fetchTimeoutError(): Error {
  const error = new Error('The request timed out.');
  error.name = 'TimeoutError';
  return error;
}

type RefreshFlight = {
  ready: Promise<() => Response>;
  resolve: (value: () => Response) => void;
  reject: (error: unknown) => void;
};

function responseCopy(response: Response, body: string): Response {
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

/**
 * One extra attempt when a safe request dies on the network or a gateway.
 * A plain POST is not retried, so sign-up, sign-in, Thumos, and password-reset emails cannot double-submit.
 * A merge-duplicates upsert, save_check_in, and set_reasons are retried once.
 * Database calls stop after FETCH_TIMEOUT_MS. Uploads and edge calls keep a longer limit.
 * Auth calls skip that wrapper. A refresh is aborted only after REFRESH_MIN_LIFE_MS,
 * and the body is read once into a fresh Response so a later json() does not touch the native stream.
 * Overlapping refresh-token posts share that one body.
 */
export function fetchWithOneRetry(base: FetchLike = globalThis.fetch.bind(globalThis)): FetchLike {
  let refresh: RefreshFlight | null = null;
  return async (input, init) => {
    if (isAuthRequest(input)) {
      if (!isRefreshTokenRequest(input, init)) return base(input, init);
      if (refresh) return (await refresh.ready)();
      let resolveFlight: (value: () => Response) => void = () => undefined;
      let rejectFlight: (error: unknown) => void = () => undefined;
      const ready = new Promise<() => Response>((resolve, reject) => {
        resolveFlight = resolve;
        rejectFlight = reject;
      });
      const flight: RefreshFlight = { ready, resolve: resolveFlight, reject: rejectFlight };
      refresh = flight;
      void readRefresh(base, input, init).then(
        (copy) => flight.resolve(copy),
        (error) => flight.reject(error),
      );
      try {
        return (await ready)();
      } finally {
        if (refresh === flight) refresh = null;
      }
    }
    return executeFetch(base, input, init);
  };
}

/**
 * The caller signal is dropped. A 200ms abort, or the AI session abort, cancels the
 * native body on iOS after GoTrue has already rotated the refresh token.
 * The deadline is the database timeout, and never shorter than REFRESH_MIN_LIFE_MS.
 */
async function readRefresh(base: FetchLike, input: RequestInfo | URL, init?: RequestInit): Promise<() => Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(REFRESH_MIN_LIFE_MS, FETCH_TIMEOUT_MS));
  let response: Response;
  try {
    response = await base(input, { ...init, signal: controller.signal });
  } finally {
    // Headers are in. Aborting after this is what makes iOS fail text() on a 200.
    clearTimeout(timer);
  }
  const body = await response.text();
  return () => responseCopy(response, body);
}

async function executeFetch(base: FetchLike, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeoutMs = fetchTimeoutMs(input, init);
  const controller = new AbortController();
  let timedOut = false;
  let settled = false;
  let rejectTimeout: (error: Error) => void = () => undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectTimeout = reject;
  });
  deadline.catch(() => undefined);
  const timer = setTimeout(() => {
    if (settled) return;
    timedOut = true;
    controller.abort();
    rejectTimeout(fetchTimeoutError());
  }, timeoutMs);
  const outer = init?.signal;
  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', onOuterAbort, { once: true });
  }
  const nextInit: RequestInit = { ...init, signal: controller.signal };
  const once = async (): Promise<Response> => {
    const attempt = base(input, nextInit).catch((error: unknown) => {
      if (timedOut) throw fetchTimeoutError();
      throw error;
    });
    attempt.catch(() => undefined);
    return Promise.race([attempt, deadline]);
  };
  try {
    if (controller.signal.aborted && !timedOut) {
      throw Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
    }
    const retry = isRetrySafeRequest(input, nextInit);
    try {
      const response = await once();
      if (timedOut) throw fetchTimeoutError();
      if (retry && (response.status === 502 || response.status === 503 || response.status === 504)) {
        const again = await once();
        if (timedOut) throw fetchTimeoutError();
        return again;
      }
      return response;
    } catch (error) {
      if (timedOut) throw fetchTimeoutError();
      if (controller.signal.aborted) throw error;
      if (retry && isTransientNetworkError(error)) {
        const again = await once();
        if (timedOut) throw fetchTimeoutError();
        return again;
      }
      throw error;
    }
  } finally {
    settled = true;
    clearTimeout(timer);
    outer?.removeEventListener?.('abort', onOuterAbort);
  }
}
