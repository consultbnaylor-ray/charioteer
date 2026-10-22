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

/** GET-style requests, plus a health upsert. A second copy of that POST is the same row. */
export function isRetrySafeRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (isIdempotentRequest(input, init)) return true;
  return /resolution=merge-duplicates/i.test(preferHeader(input, init));
}

/**
 * One extra attempt when a safe request dies on the network or a gateway.
 * A plain POST is not retried, so sign-up, sign-in, Thumos, and password-reset emails cannot double-submit.
 * A merge-duplicates upsert is retried once.
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
