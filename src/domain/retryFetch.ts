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

/**
 * One extra attempt when a safe request dies on the network or a gateway.
 * POST is never retried, so sign-up, sign-in, Thumos, and password-reset emails cannot double-submit.
 */
export function fetchWithOneRetry(base: FetchLike = globalThis.fetch.bind(globalThis)): FetchLike {
  return async (input, init) => {
    const retry = isIdempotentRequest(input, init);
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
