import { isTransientNetworkError } from './errors';

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

/**
 * One extra attempt when a safe request dies on the network or a gateway.
 * A plain POST is not retried, so sign-up, sign-in, Thumos, and password-reset emails cannot double-submit.
 * A merge-duplicates upsert, save_check_in, and set_reasons are retried once.
 */
export function fetchWithOneRetry(base: FetchLike = globalThis.fetch.bind(globalThis)): FetchLike {
  return async (input, init) => {
    const retry = isRetrySafeRequest(input, init);
    try {
      const response = await base(input, init);
      if (retry && (response.status === 502 || response.status === 503 || response.status === 504)) {
        return await base(input, init);
      }
      return response;
    } catch (error) {
      if (retry && isTransientNetworkError(error)) return await base(input, init);
      throw error;
    }
  };
}
